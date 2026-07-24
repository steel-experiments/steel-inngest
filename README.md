# steel-inngest

Durable [Steel](https://steel.dev) browser sessions inside
[Inngest](https://www.inngest.com) v4 functions.

`steel-inngest` represents session creation and release as Inngest steps. A
successfully checkpointed step is memoized when a run resumes, while every
session also has a finite Steel timeout as a bounded cleanup backstop.

The package has exactly three runtime exports:

```ts
import { steelMiddleware, withSteelSession, steelScrape } from "steel-inngest";
```

- `steelMiddleware(options?)` injects a configured Steel client as `ctx.steel`.
- `withSteelSession(step, options, handler)` creates a session in a step, passes
  a JSON-safe handle (`id`, `connectUrl`, `viewerUrl`) to the handler, and
  releases the session in a final step after the handler succeeds.
- `steelScrape(url, options?)` performs a one-shot scrape and returns
  `{ html, markdown, title, statusCode }`.

Bring Playwright, Puppeteer, or another CDP driver. The package owns the Steel
session lifecycle; your code owns each short-lived driver connection.

## Requirements

- Node.js 20 or later
- `inngest` v4 (`>=4 <5`)
- `steel-sdk` `^0.18.0`

## Install

```bash
npm install steel-inngest steel-sdk inngest
```

Set your Steel API key:

```bash
export STEEL_API_KEY=ste-...
```

## Quickstart

Open, use, and close the Playwright connection inside the same `step.run`
callback. Inngest re-executes the surrounding function to advance its steps, so
opening a connection outside the callback can reconnect even when the browser
work step has already been memoized.

```ts
import { chromium } from "playwright-core";
import { Inngest } from "inngest";
import { steelMiddleware, withSteelSession } from "steel-inngest";

const inngest = new Inngest({
  id: "price-monitor",
  middleware: [steelMiddleware({ apiKey: process.env.STEEL_API_KEY })],
});

export const checkPrice = inngest.createFunction(
  {
    id: "check-price",
    triggers: { event: "steel/price-monitor.requested" },
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
            await page.goto("https://books.toscrape.com/", {
              waitUntil: "domcontentloaded",
            });
            const price = await page
              .locator(".product_pod .price_color")
              .first()
              .textContent();
            return { price: price?.trim() ?? null };
          } finally {
            await browser.close(); // Close the connection, not the Steel session.
          }
        }),
    ),
);
```

## Security

`session.connectUrl` embeds the Steel API key. The package appends it to the
SDK-provided websocket URL as
`${session.websocketUrl}&apiKey=${key}`—note the `&`. Do not hand-assemble,
return, or log this URL or the complete session handle. Return only the data
your browser step extracted.

The internal create step checkpoints session metadata and a one-way
configuration fingerprint—not the API key, base URL, or `connectUrl`. The
public handle is assembled in memory after replay. If the API key or base URL
changes while an Inngest run is active, the wrapper fails before browser work
or release instead of using different configuration against the existing
session.

## Run the served E2E

The repository includes a real Node-served Inngest endpoint in
[`examples/server.ts`](examples/server.ts). It is intentionally excluded from CI
because triggering it creates a live, potentially billable Steel session.

1. Copy `.env.example` to `.env`, then replace the placeholder
   `STEEL_API_KEY`.
2. Start the example endpoint:

   ```bash
   npm run example:server
   ```

3. In another terminal, start the Inngest dev server and explicitly sync the
   endpoint:

   ```bash
   npx --ignore-scripts=false inngest-cli@latest dev \
     -u http://localhost:3000/api/inngest
   ```

4. Confirm the endpoint before spending anything:

   ```bash
   curl -fsS http://localhost:3000/api/inngest
   ```

5. The following command is the billable boundary. Send one event only when
   you are ready to create a real Steel session:

   ```bash
   curl -fsS -X POST http://localhost:8288/e/local \
     -H 'Content-Type: application/json' \
     --data '{"name":"steel/price-monitor.requested","data":{}}'
   ```

Open `http://localhost:8288` and inspect the run. Its step timeline should show
session creation, `read-price`, and session release. The Playwright connection
exists only while `read-price` executes.

## Lifecycle semantics

- **Checkpointed creation is memoized.** Once Inngest has successfully recorded
  the create step result, replaying the run reuses that result.
- **This is not an absolute external exactly-once guarantee.** If Steel accepts
  a create request but the step result is never checkpointed, an ambiguous
  retry can issue the external request again.
- **Release follows successful work.** After the handler resolves, a final
  memoized step releases the Steel session. If the handler throws, its error
  propagates and the release step is not scheduled.
- **Failure cleanup is bounded, not immediate.** Every created session has a
  finite timeout (five minutes by default). A session left behind by a crashed
  or failed run expires when Steel enforces that timeout; the package does not
  promise that no session can outlive its Inngest run.
- **Optional deterministic identity reduces ambiguity.** When `runId` is
  provided, the Steel session UUID is derived from the `(runId, stepPrefix)`
  pair. Two sessions in one run must use different `stepPrefix` values, which
  gives them distinct step IDs and session IDs.
- **Configuration is replay-bound.** The API key and normalized Steel base URL
  must remain stable for the lifetime of a run. A replay with changed
  configuration fails before the handler or release step executes.

Inngest retries step callbacks. Keep external side effects in steps and design
them for ambiguous outcomes rather than assuming an external operation can
always be made exactly once.

## Configuration

### `steelMiddleware(options?)`

| Option | Default | Description |
| --- | --- | --- |
| `apiKey` | `process.env.STEEL_API_KEY` | Steel API key. |
| `baseUrl` | Steel SDK default | Override the Steel base URL. |

The middleware throws during construction if no API key can be resolved.

### `withSteelSession(step, options, handler)`

| Option | Default | Description |
| --- | --- | --- |
| `steel` | — | Pre-built Steel client. Mutually exclusive with `apiKey` and `baseUrl`. |
| `apiKey` | `process.env.STEEL_API_KEY` | Key used when the wrapper constructs the client. |
| `baseUrl` | Steel SDK default | Base URL used when the wrapper constructs the client. |
| `runId` | — | With `stepPrefix`, derives a deterministic session UUID. |
| `timeoutMs` | `300000` | Finite Steel session timeout in milliseconds. Omitted or `0` uses the default; negative and non-finite values are rejected. |
| `useProxy` | — | Boolean forwarded to Steel session creation. |
| `solveCaptcha` | — | Boolean forwarded to Steel session creation. |
| `stepPrefix` | `"steel"` | Namespace for internal create/release step IDs and deterministic session identity. Use a unique prefix for each session in one run. |

Choose one configuration mode:

```ts
// Construct a client from the key and optional base URL.
await withSteelSession(step, { apiKey, baseUrl, runId }, handler);

// Or supply a client whose credentials and base URL are authoritative.
await withSteelSession(step, { steel, runId }, handler);
```

Passing `steel` together with `apiKey` or `baseUrl` is rejected instead of
silently mixing credentials. The same rule applies to `steelScrape`: pass
either `steel` or `steelApiKey`/`baseUrl`.

`useProxy` deliberately supports only the boolean on/off form. Rich
geolocation or server proxy configuration is not exposed by this wrapper.

### `steelScrape(url, options?)`

Returns `{ html, markdown, title, statusCode }`. Missing fields map to `""` or
`0`, so the result is JSON-safe and can be returned from `step.run`.

## What it does not do

- Session pooling: one `withSteelSession` call owns one session.
- Driver wrapping: connect and drive Playwright or Puppeteer in your own step.
- Application retry policy: Inngest owns retries.
- Immediate release after a crashed or failed handler: the finite Steel timeout
  is the failure-path backstop.
- Absolute external exactly-once delivery.
- Rich proxy configuration beyond boolean `useProxy`.

## Development gates

The non-billable CI path runs the tests, typecheck, build, packed-package
consumer checks, and package-content inspection on Node.js 20. Run the same
checks locally:

```bash
npm test
npm run typecheck
npm run build
npm run check:package
npm pack --dry-run
npm audit --omit=dev
```

## License

MIT
