// ABOUTME: Minimal Node server exposing the price-monitor function to the Inngest
// ABOUTME: dev server for the manual live E2E.
/**
 * Minimal Node server for the real Inngest dev-server E2E.
 *
 * This process only serves the Inngest endpoint. A Steel session is not
 * created until the user intentionally sends the price-monitor event.
 */

import { createServer } from "inngest/node";
import { inngest, priceMonitor } from "./price-monitor.js";

const rawPort = process.env.PORT ?? "3000";
const port = Number(rawPort);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(
    `PORT must be an integer from 1 to 65535; received ${JSON.stringify(rawPort)}`,
  );
}

const server = createServer({
  client: inngest,
  functions: [priceMonitor],
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Inngest endpoint: http://127.0.0.1:${port}/api/inngest`);
  console.log(
    "No Steel session starts until steel/price-monitor.requested is sent.",
  );
});
