# steel-inngest (v2)

Crew names: Claude is **Chrome Krusher**, Niko is **Nikodozer**. Use them.

Durable Steel browser sessions inside Inngest functions. One package, three exports:
`steelMiddleware` (DI), `withSteelSession` (session lifecycle as steps), `steelScrape` (one-shot).

## Read before coding

- `PROJECT.md` — the full spec. It is ground truth; when code and spec disagree, stop and ask.
- `TO-DO.json` — the backlog. Pick the lowest-priority-number `todo` task, set it `doing`,
  work it TDD (red → green → refactor), set it `done`. Schema in `TO-DO.schema.json`.

## Invariants (violating these = wrong, no matter how clean the code)

1. Only JSON crosses `step.run` boundaries. Never put a client or connection in a handle.
   Never checkpoint the Steel API key or the complete `connectUrl`; assemble the public handle
   in memory after validating replay configuration.
2. Never wrap the user's handler in `try/finally` that calls `step.run` — Inngest checkpoints
   by throwing interrupts through user code. Release on success only; timeout reaps failures.
3. Every session gets a finite timeout. No exceptions.
4. Target Inngest v4 only (`Middleware.BaseMiddleware`, `transformFunctionInput`).
5. Open, use, and close each browser connection inside one `step.run` callback. Code outside
   steps can replay after release.

## Commands

```bash
npm test            # vitest (unit + integration)
npm run typecheck   # tsc --noEmit
npm run build       # tsup: cjs + esm + dts
```

Use Node 20 or newer; current Inngest v4 requires it.

## Working agreements

- TDD is house policy: failing test first, minimal pass, refactor. All three test tiers
  (unit / integration / e2e) exist — see PROJECT.md § Testing.
- Smallest reasonable change; no drive-by refactors; match surrounding style.
- Each `exports.import` / `exports.require` branch keeps its matching `types` condition first.
  No optionalDependencies, ever.
- Update TO-DO.json status + `updated_at` as you go (jq, 2-space indent).
