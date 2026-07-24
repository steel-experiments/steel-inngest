/**
 * A real Steel price monitor served through Inngest's Node adapter.
 *
 * Start {@link ./server.ts}, sync it to the Inngest dev server, then send a
 * `steel/price-monitor.requested` event. See the repository README for the
 * complete, intentionally manual live-E2E instructions.
 *
 * Required env: `STEEL_API_KEY`. Optional: `PRICE_MONITOR_URL`.
 */

import { chromium } from "playwright-core";
import { Inngest, type InngestFunction, type Middleware } from "inngest";
import type { Steel } from "steel-sdk";
import { steelMiddleware, withSteelSession } from "../src/index.js";

const TARGET_URL = process.env.PRICE_MONITOR_URL ?? "https://books.toscrape.com/";
export const PRICE_MONITOR_EVENT = "steel/price-monitor.requested" as const;

/**
 * Inngest client with Steel injected as `ctx.steel`.
 */
export const inngest = new Inngest({
  id: "price-monitor",
  middleware: [steelMiddleware({ apiKey: process.env.STEEL_API_KEY })],
});

/**
 * The durable price-monitor function.
 *
 * `withSteelSession` owns the session lifecycle as steps; the handler reconnects
 * by `connectUrl` and closes the *connection* (never the session) per step.
 */
export const priceMonitor: InngestFunction.Like = inngest.createFunction(
  {
    id: "check-price",
    name: "Check price",
    triggers: { event: PRICE_MONITOR_EVENT },
  },
  async ({ step, steel, runId }) => runPriceCheck(step, steel, runId),
);

/**
 * Shared lifecycle: create session -> connect/read/close in one durable step ->
 * release.
 */
async function runPriceCheck(
  step: Middleware.StepTools,
  steel: Steel | undefined,
  runId: string | undefined,
): Promise<{
  url: string;
  title: string | null;
  price: string | null;
  sessionId: string;
  viewerUrl: string | null;
}> {
  return withSteelSession(
    step,
    { steel, runId, timeoutMs: 120_000 },
    async (session) => {
      const page = await step.run("read-price", async () => {
        // The connection must be created, used, and closed inside this callback.
        // The function body is replayed as Inngest advances steps; opening the
        // connection outside would reconnect even when this step is memoized.
        const browser = await chromium.connectOverCDP(session.connectUrl);
        try {
          const p = await browser.newPage();
          await p.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
          const title = await p.title();
          const price = await p.locator(".product_pod .price_color").first().textContent();
          return { title, price: price?.trim() ?? null };
        } finally {
          // Close the Playwright connection, not the Steel session.
          await browser.close();
        }
      });

      return {
        url: TARGET_URL,
        title: page.title,
        price: page.price,
        sessionId: session.id,
        viewerUrl: session.viewerUrl,
      };
    },
  );
}
