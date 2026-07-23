# steel-inngest — Project Spec

Reusable primitives for running Steel cloud browser sessions inside Inngest durable functions.

## Why this exists

Browser automation jobs are long-running and flaky. Inngest solves orchestration: functions are
built from memoized `step.run` calls, so crashed runs resume from the last completed step. But
Steel sessions are stateful, billable resources with a lifecycle (create → connect → work →
release), and managing that lifecycle inside a retry-driven, checkpointed execution model is
subtle boilerplate. This package owns that boilerplate.

Ecosystem gap (as of 2026-07): Browserbase × Inngest exists only as docs and example repos — no
npm package, no failure-path cleanup. No Playwright/Puppeteer/Firecrawl Inngest packages exist.
A published `steel-inngest` is first-of-kind. Steel's own docs already ship an AgentKit cookbook
recipe (`steel-docs: content/docs/cookbook/agentkit.mdx`) whose "reuse sessions across tools"
advice is exactly the pattern this package productizes.

## Hard constraints (from Inngest's execution model)

These drive every design decision. Sources linked in References.

1. A function run spans many HTTP requests, possibly on different machines. Only JSON-serializable
   `step.run` return values survive between steps. **Live objects (clients, CDP connections) must
   never cross a step boundary.**
2. Each step is memoized by ID and has its own retry counter. Code inside `step.run` re-executes
   only on that step's retry.
3. Inngest implements checkpointing by **throwing control-flow interrupts through user code**.
   Therefore we must NOT wrap the user's handler in `try/finally` that calls `step.run` — the
   `finally` would fire on every interrupt unwind mid-run. Release happens on success only;
   failures rely on the session-timeout backstop.
4. Middleware wraps a *request*, not a *run* — it cannot hold resources across steps. Its proper
   role is dependency injection of the configured client.
5. Inngest v4 is `latest` and rewrote the middleware API (class-based, `Middleware.BaseMiddleware`,
   `transformFunctionInput`). We target **v4 only** (`inngest >=4 <5`). No v3 support.

## Public API (three exports + types)

### 1. `steelMiddleware(options?: SteelMiddlewareOptions)`

v4 middleware factory (function returning a `Middleware.BaseMiddleware` subclass) that injects a
configured Steel client as `ctx.steel` into every function, with inferred types. Mirrors Inngest's
own `dependencyInjectionMiddleware({ openai })` precedent and the `sentryMiddleware()` structure.

Options: `{ apiKey?: string; baseUrl?: string }` — `apiKey` defaults to `process.env.STEEL_API_KEY`.
Throw a clear error at client construction if no key is resolvable.

### 2. `withSteelSession(step, options, handler)`

```ts
function withSteelSession<T>(
  step: StepTools,                       // the function's `step` object
  options: WithSteelSessionOptions,      // { steel?, apiKey?, runId?, timeoutMs?, useProxy?, solveCaptcha?, stepPrefix? }
  handler: (session: SteelSessionHandle) => Promise<T>
): Promise<T>
```

`SteelSessionHandle` is **plain JSON**: `{ id: string; connectUrl: string; viewerUrl: string | null }`.

Internal behavior, in order:

1. `step.run("steel/create-session")` — creates the session and returns the handle. Memoization
   makes creation exactly-once across retries/replays. Session is created with:
   - a **mandatory finite timeout** (`timeoutMs`, default 300_000 — Steel's default). This is the
     failure-path cleanup: orphaned sessions self-expire. Never allow an infinite session.
   - a deterministic session ID (UUIDv5 of `runId` under the package's namespace UUID) when
     `runId` is provided — enables a future `onFailure` release helper without changing this
     core (Steel sessions have no metadata/tags; see Open questions #1).
2. Await `handler(handle)`. The handler reconnects by `connectUrl` inside its own steps and closes
   the *connection* (never the session) per step.
3. On success: `step.run("steel/release-session")`.
4. On any throw: propagate untouched (see hard constraint 3). No release attempt.

`connectUrl` is built from `session.websocketUrl` + API key (matching the AgentKit cookbook), not
a hand-assembled `wss://connect.steel.dev` string. Because it embeds the key, README must warn:
do not return the handle from a step or log it. `stepPrefix` (default `"steel"`) namespaces step
IDs so two concurrent `withSteelSession` calls in one function don't collide.

### 3. `steelScrape(url, options?)`

Stateless one-shot scrape via `client.scrape({ url })`, returns `{ html, markdown, title,
statusCode }` (null-safe fallbacks: empty strings, statusCode 0) — JSON-safe, composes with
`step.run` directly. Same key resolution and error message as the middleware.

## Packaging requirements

- `package.json`: name `steel-inngest`, peer deps `inngest >=4 <5` and `steel-sdk ^0.18.0`
  (0.x moves fast — validate against latest before release); **no optionalDependencies** (users
  bring their own Playwright/Puppeteer — we only hand back a URL).
- `exports` map with the `types` condition FIRST (TS ignores it otherwise), then `import`/`require`.
- tsup build (cjs + esm + dts), committed lockfile, `repository` + `license: MIT` fields,
  `files: ["dist"]`.
- `examples/price-monitor.ts` must exist and run (it is referenced by an npm script and doubles
  as the e2e test and README centerpiece).

## Testing (house TDD policy — no exceptions)

- **Unit**: fake `step` object + Steel test double at the SDK boundary. Cover: create-once
  semantics, handle is JSON-only, release-on-success, error propagation without release,
  timeout always finite, runId tagging, step-ID prefixing, key-resolution errors.
- **Integration**: `@inngest/test` (official harness) — middleware injects typed `ctx.steel`;
  `withSteelSession` behaves correctly through a real function execution.
- **E2E**: `examples/price-monitor.ts` against real Steel + Inngest dev server.
- Vitest. Test output must be pristine.

## Definition of done

**Every task**: failing test written first (red → green → refactor); `npm test`,
`npm run typecheck`, `npm run build` all pass with pristine output (no skips, no console noise);
public exports carry TSDoc; TO-DO.json status and `updated_at` current.

**Release (v0.2.0) is done when**: all acceptance criteria below pass · the price-monitor example
runs end-to-end against real Steel and the Inngest dev server · `npm pack --dry-run` shows a
dist-only tarball whose types resolve under `moduleResolution` bundler AND node16 · README covers
quickstart, lifecycle guarantees, and the connectUrl-embeds-key warning.

### Acceptance criteria — `withSteelSession`

- Handler receives exactly `{ id, connectUrl, viewerUrl }`; `JSON.parse(JSON.stringify(handle))`
  deep-equals the handle.
- Session is created exactly once per run, verified against a fake `step` that replays memoized
  results (simulated retry/resume).
- Release step executes after the handler resolves; it does NOT execute when the handler rejects,
  and the thrown error reaches the caller unchanged (same reference).
- Omitted/zero `timeoutMs` → 300_000; non-finite values are rejected with a clear error.
- With `runId` provided, `sessions.create` receives a `sessionId` that is the UUIDv5 of the
  runId under the package namespace; same runId → same UUID (determinism test).
- Two calls with distinct `stepPrefix` values produce non-colliding step IDs.
- No resolvable API key → error message that names both remedies (option vs env var).

### Acceptance criteria — `steelMiddleware`

- A function executed via `@inngest/test` sees a configured client at `ctx.steel`.
- Type inference works: handler code uses `steel` without casts (compile-time test).
- Missing API key fails at middleware construction, not first use.

### Acceptance criteria — `steelScrape`

- Returns `{ html, markdown, title, statusCode }`; missing fields map to `""` / `0`.
- `baseUrl` and `steelApiKey` options are honored.

## Scope

**Not building, period**: multi-session pools · our own retry logic (Inngest owns retries) ·
driver wrappers or a `connect()` helper that imports Playwright/Puppeteer.

**Deferred, with re-entry triggers** (do not build without the trigger firing):
- `onFailure` release helper — trigger: users report orphan-session cost the 5-minute timeout
  doesn't cover, or multi-session runs appear. Deterministic run-derived session IDs keep the
  door open.
- AgentKit tool factories — trigger: docs/DevRel demand alignment with the AgentKit cookbook.
- Inngest v3/LTS support — trigger: a real user on v3 asks and can't upgrade.

## Open questions — RESOLVED (research, 2026-07-23)

1. **Session metadata/tags: not supported.** `steel-sdk@0.18.0` `SessionCreateParams` has no
   metadata/tags field, and `sessions.list` filters by `status` only — a metadata lookup could
   never work. It DOES accept `sessionId?: string` ("Optional custom UUID for the session").
   Decision: when `runId` is provided, derive the session ID deterministically — UUIDv5 of the
   runId under a fixed package namespace UUID — and pass it as `sessionId`. A future `onFailure`
   helper recomputes the same UUID from the failed run's ID and releases directly, no lookup.
2. **`websocketUrl` already carries a query string.** The canonical pattern across 10+ Steel
   docs pages (cookbook + integrations) is `${session.websocketUrl}&apiKey=${STEEL_API_KEY}` —
   note the `&`. `connectUrl` is built exactly that way. Do not hand-assemble
   `wss://connect.steel.dev?...` (that's the deprecated pre-`websocketUrl` form from changelog-008).
3. **`@inngest/test` works.** `@inngest/test@1.0.0` is v4-only (peer dep `inngest@^4.0.0`) and
   executes the real middleware pipeline — README: "The tests also run middleware." Injected ctx
   properties are visible in the function and in `t.execute()`'s returned ctx. Nuance: the test
   option `transformCtx` applies BEFORE middleware, so on a key collision the middleware value
   wins in what the function sees. (https://www.inngest.com/docs/reference/testing)
4. **Collisions: last middleware wins, runtime and types.** Docs (dependency-injection page):
   "for two middlewares that add a `foo` value to input arguments, the last one to run will be
   what it seen both in types and at runtime" [sic]. Decision: no runtime warning; document that
   registering `steelMiddleware` after another `ctx.steel` provider overrides it.

Side finding: `steel-sdk` latest is `0.18.0` and the API surface moves fast in 0.x (e.g.
`useProxy` is now a union type). Peer-dep range must be validated against `0.18.x`, not `0.1.x`.

## Developer pitch (ratified framing)

"Browser automation jobs fail in the middle. `steel-inngest` packages Steel sessions as durable
Inngest steps: crashed runs resume from the last completed step, and no session outlives its run."
Cleanup is guaranteed two ways: success → release step; failure → finite timeout reaps it.
Full pitch draft lives in the 2026-07-23 planning discussion; it is RED-gated (names Inngest)
and needs founder review before publishing.

## References

- Middleware: https://www.inngest.com/docs/features/middleware · DI:
  https://www.inngest.com/docs/features/middleware/dependency-injection
- v3→v4 migration: https://www.inngest.com/docs/reference/typescript/v4/migrations/v3-to-v4
- Steps / execution: https://www.inngest.com/docs/learn/inngest-steps ·
  https://www.inngest.com/docs/learn/how-functions-are-executed
- onFailure: https://www.inngest.com/docs/reference/typescript/v4/functions/handling-failures
- Precedent packages: https://www.npmjs.com/package/@inngest/middleware-encryption ·
  https://www.npmjs.com/package/@inngest/middleware-sentry (structure to copy)
- Browserbase × Inngest (gap analysis): https://docs.browserbase.com/integrations/inngest/introduction
- Steel AgentKit recipe: steel docs repo, `content/docs/cookbook/agentkit.mdx`
