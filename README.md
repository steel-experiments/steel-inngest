# steel-inngest

[![npm](https://img.shields.io/npm/v/steel-inngest)](https://www.npmjs.com/package/steel-inngest)
[![CI](https://github.com/steel-experiments/steel-inngest/actions/workflows/ci.yml/badge.svg)](https://github.com/steel-experiments/steel-inngest/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/steel-inngest)](LICENSE)

Durable Steel browser sessions for Inngest functions.

`steel-inngest` creates and releases [Steel](https://steel.dev) sessions as
memoized [Inngest](https://www.inngest.com) steps. It gives browser work a
replay-aware connection handle without checkpointing API keys or complete
connection URLs.

The package is for engineers running browser automation in background jobs that
can retry or resume. Steel maintains it in the `steel-experiments` organization
while the API matures.

## Install

```bash
npm install steel-inngest steel-sdk inngest playwright-core
```

Requirements:

- Node.js 22 or newer
- Inngest v4 (`>=4 <5`)
- `steel-sdk` `^0.18.0`

Set your Steel API key:

```bash
export STEEL_API_KEY=ste-...
```

## Quickstart

Add the middleware to your Inngest client, then use `withSteelSession` inside a
function. Open and close the Playwright connection inside the same `step.run`
callback.

```ts
import { chromium } from "playwright-core";
import { Inngest } from "inngest";
import { steelMiddleware, withSteelSession } from "steel-inngest";

const inngest = new Inngest({
  id: "price-monitor",
  middleware: [steelMiddleware()],
});

export const checkPrice = inngest.createFunction(
  {
    id: "check-price",
    triggers: { event: "price/check.requested" },
  },
  async ({ step, steel, runId }) =>
    withSteelSession(
      step,
      { steel, runId, timeoutMs: 120_000 },
      async (session) =>
        step.run("read-price", async () => {
          const browser = await chromium.connectOverCDP(session.connectUrl);

          try {
            const page = await browser.newPage();
            await page.goto("https://books.toscrape.com/");

            return {
              price: await page
                .locator(".product_pod .price_color")
                .first()
                .textContent(),
            };
          } finally {
            await browser.close();
          }
        }),
    ),
);
```

`browser.close()` closes your CDP connection. `withSteelSession` releases the
Steel session after the handler succeeds.

## API

The package has four runtime exports.

### `steelMiddleware(options?)`

Injects a configured Steel client as `ctx.steel`.

```ts
steelMiddleware({
  apiKey: process.env.STEEL_API_KEY,
  baseUrl: "https://api.steel.dev", // optional
});
```

The API key defaults to `STEEL_API_KEY`. Missing credentials fail during
middleware construction.

The raw `SteelMiddleware` class is also exported: pass it directly to
`middleware: [SteelMiddleware]` when `STEEL_API_KEY` is set in the environment.

### `withSteelSession(step, options, handler)`

Creates a Steel session in an Inngest step, passes a plain object to the
handler, and releases the session in another step after successful work.

The handler receives:

```ts
{
  id: string;
  connectUrl: string;
  viewerUrl: string | null;
}
```

Common options:

| Option         | Default         | Purpose                                                 |
| -------------- | --------------- | ------------------------------------------------------- |
| `steel`        | -               | Use an existing Steel client.                           |
| `apiKey`       | `STEEL_API_KEY` | Build a client with this key.                           |
| `baseUrl`      | Steel default   | Override the Steel API URL.                             |
| `runId`        | -               | Derive a stable session ID for this run.                |
| `timeoutMs`    | `300000`        | Limit how long an unreleased session can live.          |
| `stepPrefix`   | `"steel"`       | Keep step IDs unique when a run uses multiple sessions. |
| `useProxy`     | -               | Enable or disable the Steel proxy.                      |
| `solveCaptcha` | -               | Enable or disable CAPTCHA solving.                      |

Pass either `steel` or `apiKey`/`baseUrl`, not both.

### `steelScrape(url, options?)`

Runs a one-shot Steel scrape without creating a browser session:

```ts
import { steelScrape } from "steel-inngest";

const page = await steelScrape("https://example.com");

console.log(page.title);
console.log(page.markdown);
```

It accepts the same `apiKey` and `baseUrl` client options as the middleware.
You can also pass an existing Steel client as `steel`.

It returns:

```ts
{
  html: string;
  markdown: string;
  title: string;
  statusCode: number;
}
```

## How session recovery works

Inngest may execute a function body more than once as it advances through its
steps. `withSteelSession` keeps the lifecycle safe across those replays:

1. A create step starts the Steel session and checkpoints its metadata.
2. Your handler runs browser work in its own steps.
3. A release step closes the session after successful work.

Completed steps are memoized. If the function resumes, the create step reuses
its checkpoint instead of creating another session.

An external request can still have an ambiguous outcome if Steel accepts it but
Inngest never records the step result. Supplying `runId` reduces this risk by
giving the session a deterministic ID. It is not an absolute exactly-once
guarantee.

If the handler fails, its error is passed back unchanged and the release step
does not run. The finite Steel timeout is the cleanup backstop for that case.

## Keep the connection URL secret

`session.connectUrl` contains your Steel API key. Do not log it or return it
from an Inngest step. Return only the data extracted from the page.

The package does not store the API key or full connection URL in its internal
step checkpoint. It also rejects a resumed run if its Steel key or base URL has
changed.

## Multiple sessions in one run

Give each session a different `stepPrefix`:

```ts
await withSteelSession(step, { steel, runId, stepPrefix: "catalog" }, handler);
await withSteelSession(step, { steel, runId, stepPrefix: "checkout" }, handler);
```

The prefixes keep both Inngest step IDs and deterministic Steel session IDs
separate.

## Run the live example

The repository includes an Inngest endpoint and a price-monitor function. This
test creates a real, potentially billable Steel session.

```bash
cp .env.example .env
# Put your real STEEL_API_KEY in .env.

npm run example:server
```

In another terminal:

```bash
npx --ignore-scripts=false inngest-cli@latest dev \
  -u http://localhost:3000/api/inngest
```

Then send one event:

```bash
curl -fsS -X POST http://localhost:8288/e/local \
  -H 'Content-Type: application/json' \
  --data '{"name":"steel/price-monitor.requested","data":{}}'
```

Open `http://localhost:8288` to inspect the create, browser-work, and release
steps.

## Development

```bash
npm ci
npm run check
npm run build
npm run check:package
npm pack --dry-run
```

The test suite covers the session lifecycle, replay behavior, middleware
injection, scrape mapping, ESM and CommonJS loading, and TypeScript resolution.
See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Project links

- [Architecture](ARCHITECTURE.md)
- [Changelog](CHANGELOG.md)
- [Steel documentation](https://docs.steel.dev)
- [Steel support](https://docs.steel.dev/overview/need-help)
- [Issue tracker](https://github.com/steel-experiments/steel-inngest/issues)

## License

[MIT](LICENSE)
