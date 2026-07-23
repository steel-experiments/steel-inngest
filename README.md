# steel-inngest

Durable [Steel](https://steel.dev) browser sessions inside [Inngest](https://www.inngest.com) functions.

Browser automation jobs fail in the middle. This package runs Steel sessions as durable Inngest
steps: crashed runs resume from the last completed step, and no session outlives its run.

> **Status: design phase.** The spec is final (see [PROJECT.md](PROJECT.md)); implementation is
> tracked in [TO-DO.json](TO-DO.json). Nothing is published to npm yet.

## Planned API

```ts
import { steelMiddleware, withSteelSession, steelScrape } from "steel-inngest";
```

- `steelMiddleware(options?)` — injects a configured Steel client as `ctx.steel` into every function.
- `withSteelSession(step, options, handler)` — creates a session in a memoized step, hands your
  handler a JSON-safe handle (`id`, `connectUrl`, `viewerUrl`), and releases the session in a
  final step. Failed runs are reaped by a mandatory finite session timeout.
- `steelScrape(url, options?)` — one-shot scrape, returns `{ html, markdown, title, statusCode }`.

You bring your own driver: the handle gives you a CDP URL, and Playwright or Puppeteer connects to it.

## Repo layout

- `PROJECT.md` — full spec: constraints, API, packaging, test plan. Ground truth.
- `TO-DO.json` — task backlog (schema in `TO-DO.schema.json`).
- `CLAUDE.md` — working agreements and invariants for agent sessions.

Requires Inngest v4+.
