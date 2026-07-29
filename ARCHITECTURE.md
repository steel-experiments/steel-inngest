# Architecture

`steel-inngest` expresses the Steel session lifecycle as Inngest steps. This
document records the constraints behind that design.

## Execution model

An Inngest function can resume across multiple requests and machines. Completed
steps are memoized by ID, while code outside a step can run again as the
function advances.

That leads to five rules:

1. Only JSON-serializable data crosses a `step.run` boundary.
2. Steel clients and browser connections stay in memory.
3. Each browser connection is opened, used, and closed inside one step.
4. Every Steel session has a finite timeout.
5. Session release runs as a final step after successful work.

The wrapper does not release a session from a `finally` block. Inngest advances
checkpointed functions by unwinding user code, so a release scheduled from
`finally` could run before browser work is complete. Failed runs instead rely on
the finite Steel timeout.

## Session lifecycle

`withSteelSession` performs three operations:

1. `<prefix>/create-session` creates a Steel session and checkpoints its
   metadata.
2. The caller runs browser work in its own steps.
3. `<prefix>/release-session` releases the session after the handler succeeds.

The create callback can be retried before Inngest records its result. Once the
result is checkpointed, replay reuses it. This reduces duplicate work but does
not claim exactly-once behavior for ambiguous external requests.

When `runId` is supplied, the package derives a deterministic UUIDv5 from
`(runId, stepPrefix)`. Different prefixes keep multiple sessions in the same run
from sharing step IDs or session IDs.

## Credential handling

The create-step checkpoint stores the session ID, Steel websocket URL, viewer
URL, and a one-way configuration fingerprint. It does not store the Steel API
key or the complete credential-bearing connection URL.

On replay, the package verifies that the current API key and normalized Steel
base URL match the checkpoint fingerprint. It then builds `connectUrl` in memory
and passes it to the handler. Callers must not log that URL or return it from
their own steps.

## Public surface

The package root has three runtime exports:

- `steelMiddleware` injects a configured Steel client into Inngest function
  context.
- `withSteelSession` manages the durable session lifecycle.
- `steelScrape` performs a one-shot scrape.

The package supports ESM and CommonJS consumers and publishes matching
declaration files for both module systems.

## Deliberate boundaries

The package does not wrap Playwright, Puppeteer, or another CDP client. It also
does not add retry behavior beyond Inngest or manage pools of sessions. These
boundaries keep browser-driver choice and orchestration policy with the
application.
