# steel-inngest

Durable [Steel](https://steel.dev) browser sessions inside [Inngest](https://www.inngest.com) functions.

Browser automation jobs fail in the middle. `steel-inngest` runs Steel sessions as durable
Inngest steps: crashed runs resume from the last completed step, and no session outlives its run.

Three exports:

```ts
import { steelMiddleware, withSteelSession, steelScrape } from "steel-inngest";
```

- `steelMiddleware(options?)` — injects a configured Steel client as `ctx.steel` into every function.
- `withSteelSession(step, options, handler)` — creates a session in a memoized step, hands your
  handler a JSON-safe handle (`id`, `connectUrl`, `viewerUrl`), and releases the session in a final
  step. Failed runs are reaped by a mandatory finite session timeout.
- `steelScrape(url, options?)` — one-shot scrape, returns `{ html, markdown, title, statusCode }`.

You bring your own driver: the handle gives you a CDP URL, and Playwright or Puppeteer connects to it.

## Install

```bash
npm install steel-inngest steel-sdk inngest
```

Requires `inngest` v4 or newer. Set your Steel API key:

```bash
export STEEL_API_KEY=ste-...
```

## Quickstart — a price monitor

```ts
import { chromium } from "playwright-core";
import { Inngest } from "inngest";
import { steelMiddleware, withSteelSession } from "steel-inngest";

const inngest = new Inngest({
  id: "price-monitor",
  middleware: [steelMiddleware({ apiKey: process.env.STEEL_API_KEY })],
});

export const checkPrice = inngest.createFunction(
  { id: "check-price", triggers: { cron: "*/5 * * * *" } },
  async ({ step, steel, runId }) =>
    withSteelSession(
      step,
      // `steel` is the client injected by the middleware — typed, no cast.
      { steel, runId, timeoutMs: 120_000 },
      async (session) => {
        // connectOverCDP uses Steel's already-running browser — no local Chromium needed.
        const browser = await chromium.connectOverCDP(session.connectUrl);
        try {
          return await step.run("read-price", async () => {
            const page = await browser.newPage();
            await page.goto("https://books.toscrape.com/", { waitUntil: "domcontentloaded" });
            const price = await page.locator(".product_pod .price_color").first().textContent();
            await page.close();
            return { price: price?.trim() ?? null };
          });
        } finally {
          await browser.close(); // close the *connection*, not the session
        }
      },
    ),
);
```

Run the full example against real Steel: `npm run example:price-monitor` (see
[`examples/price-monitor.ts`](examples/price-monitor.ts)).

To host the function with the Inngest dev server, serve `checkPrice` with your framework's
Inngest adapter and run `npx inngest-cli@latest dev`.

## What `withSteelSession` guarantees

- **Create exactly once.** Session creation is a memoized `step.run`, so retries and replays never
  spawn a second session.
- **Release on success only.** A final `step.run` releases the session after your handler resolves.
  If the handler throws, the error propagates unchanged and **no release is attempted** — Inngest
  checkpoints by throwing interrupts through user code, so a `try/finally` around the handler would
  fire mid-run.
- **Every session has a finite timeout.** A crashed run can't leave a session open: orphaned
  sessions self-expire (default 5 minutes, configurable via `timeoutMs`). This is the
  failure-path cleanup.
- **Optional deterministic session ID.** Pass `runId` and the session ID becomes `UUIDv5(runId)`
  under the package namespace — a future `onFailure` helper can recompute and release it without a
  lookup.

## Security caveat

`connectUrl` embeds your Steel API key (`${session.websocketUrl}&apiKey=${key}`). **Never return the
session handle from a `step.run`, and never log it.** Return only the data you extracted.

## Configuration

### `steelMiddleware(options?)`

| Option   | Default                     | Description              |
| -------- | --------------------------- | ------------------------ |
| `apiKey` | `process.env.STEEL_API_KEY` | Steel API key.           |
| `baseUrl`| Steel SDK default           | Override the Steel base URL. |

Throws at construction (not first use) if no key is resolvable. You can also use the raw
`SteelMiddleware` class directly when `STEEL_API_KEY` is in the environment.

### `withSteelSession(step, options, handler)`

| Option         | Default     | Description                                                              |
| -------------- | ----------- | ------------------------------------------------------------------------ |
| `steel`        | -           | A pre-built client. If omitted, one is built from `apiKey`/`baseUrl`.    |
| `apiKey`       | env         | Steel API key.                                                           |
| `runId`        | -           | Derives a deterministic session ID (`UUIDv5`).                           |
| `timeoutMs`    | `300000`    | Session timeout in ms. Omitted/`0` → default; non-finite rejected.       |
| `useProxy`     | -           | Forwarded to Steel's session create.                                     |
| `solveCaptcha` | -           | Forwarded to Steel's session create.                                     |
| `stepPrefix`   | `"steel"`   | Namespace for the internal step IDs — change it for two sessions in one function. |

### `steelScrape(url, options?)`

Returns `{ html, markdown, title, statusCode }`. Missing fields map to `""` / `0`, so the result is
always JSON-safe and composes directly with `step.run`. Honors `baseUrl` and `steelApiKey` options.

## What it doesn't do

- **No session pools.** One `withSteelSession` call = one session.
- **No retry logic.** Inngest owns retries.
- **No driver wrappers.** It hands you a CDP `connectUrl`; it does not import Playwright or
  Puppeteer. You connect and drive the browser yourself.

## Requirements

- `inngest` >= 4 < 5
- `steel-sdk` ^0.18.0
- Node 18+

## License

MIT
