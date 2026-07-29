// ABOUTME: End-to-end tests that drive the public package surface through the
// ABOUTME: real Inngest execution engine and real steel-sdk HTTP to a local Steel API double.

import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { Inngest } from "inngest";
import { InngestTestEngine } from "@inngest/test";
import {
  steelMiddleware,
  steelScrape,
  withSteelSession,
} from "../../src/index.js";
import { deriveSessionId } from "../../src/internal.js";

/**
 * E2E tier: unlike the unit/integration tiers (which fake the Steel client
 * in-process), these tests exercise the real steel-sdk over real HTTP against
 * a local double of the Steel REST API, driven through the real Inngest
 * middleware and execution pipeline via the package's public entry point.
 */

interface SessionRecord {
  id: string;
  status: "live" | "released";
  websocketUrl: string;
  sessionViewerUrl: string;
  timeout: number;
}

interface RecordedRequest {
  method: string;
  path: string;
  apiKey: string | undefined;
  body: Record<string, unknown>;
}

const sessions = new Map<string, SessionRecord>();
const requests: RecordedRequest[] = [];
let sequence = 0;
let server: Server;
let baseUrl: string;

function respond(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

/** Create a live session record like Steel's POST /v1/sessions would. */
function createSession(body: Record<string, unknown>): SessionRecord {
  const id = (body.sessionId as string | undefined) ?? `sess-${++sequence}`;
  const session: SessionRecord = {
    id,
    status: "live",
    websocketUrl: `${baseUrl.replace("http", "ws")}/v1/sessions/${id}/cdp?token=tok`,
    sessionViewerUrl: `http://viewer.local/sessions/${id}`,
    timeout: (body.timeout as number | undefined) ?? 300_000,
  };
  sessions.set(id, session);
  return session;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const path = new URL(req.url ?? "/", "http://localhost").pathname;
      requests.push({
        method: req.method ?? "",
        path,
        apiKey: req.headers["steel-api-key"] as string | undefined,
        body,
      });

      if (req.method === "POST" && path === "/v1/sessions") {
        const requestedId = body.sessionId as string | undefined;
        if (requestedId !== undefined && sessions.has(requestedId)) {
          respond(res, 409, {
            message: `Session with ID ${requestedId} already exists`,
          });
          return;
        }
        respond(res, 200, createSession(body));
        return;
      }

      const sessionMatch = /^\/v1\/sessions\/([^/]+)$/.exec(path);
      if (req.method === "GET" && sessionMatch) {
        const session = sessions.get(sessionMatch[1]!);
        if (!session) {
          respond(res, 404, { message: "No session found" });
          return;
        }
        respond(res, 200, session);
        return;
      }

      const releaseMatch = /^\/v1\/sessions\/([^/]+)\/release$/.exec(path);
      if (req.method === "POST" && releaseMatch) {
        const session = sessions.get(releaseMatch[1]!);
        if (!session || session.status !== "live") {
          respond(res, 404, { message: "No live session to release" });
          return;
        }
        session.status = "released";
        respond(res, 200, {
          id: session.id,
          status: "released",
          success: true,
        });
        return;
      }

      if (req.method === "POST" && path === "/v1/scrape") {
        // Like real Steel, only requested formats are returned (default html).
        const format = (body.format as string[] | undefined) ?? ["html"];
        respond(res, 200, {
          content: {
            html: "<html><body><h1>E2E</h1></body></html>",
            ...(format.includes("markdown") ? { markdown: "# E2E" } : {}),
          },
          metadata: { title: "E2E", statusCode: 200 },
        });
        return;
      }

      respond(res, 404, { message: `Unhandled route ${req.method} ${path}` });
    });
  });

  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

beforeEach(() => {
  sessions.clear();
  requests.length = 0;
  sequence = 0;
});

test("durable session lifecycle end-to-end: middleware client, create, work, release over real HTTP", async () => {
  const inngest = new Inngest({
    id: "steel-e2e",
    middleware: [steelMiddleware({ apiKey: "e2e-key", baseUrl })],
  });

  const fn = inngest.createFunction(
    { id: "e2e-session-lifecycle" },
    async ({ step, steel, runId }) =>
      withSteelSession(step, { steel, runId }, async (session) =>
        step.run("browser-work", async () => ({
          sessionId: session.id,
          // Return facts about the connect URL, not the URL itself — it embeds
          // the API key and step results are checkpointed.
          connectUrlHasKey:
            new URL(session.connectUrl).searchParams.get("apiKey") ===
            "e2e-key",
          viewerUrl: session.viewerUrl,
        })),
      ),
  );

  const { result, error } = await new InngestTestEngine({
    function: fn,
  }).execute();

  expect(error).toBeUndefined();
  const outcome = result as {
    sessionId: string;
    connectUrlHasKey: boolean;
    viewerUrl: string | null;
  };
  expect(outcome.connectUrlHasKey).toBe(true);
  expect(outcome.viewerUrl).toBe(
    `http://viewer.local/sessions/${outcome.sessionId}`,
  );

  // The session was created once with the deterministic ID and released.
  expect(sessions.get(outcome.sessionId)?.status).toBe("released");
  const createRequests = requests.filter(
    (r) => r.method === "POST" && r.path === "/v1/sessions",
  );
  expect(createRequests).toHaveLength(1);
  expect(createRequests[0]!.body.sessionId).toBe(outcome.sessionId);
  expect(
    requests.filter((r) =>
      r.path.endsWith(`/v1/sessions/${outcome.sessionId}/release`),
    ),
  ).toHaveLength(1);

  // Every Steel API call carried the configured credential.
  expect(requests.every((r) => r.apiKey === "e2e-key")).toBe(true);
});

test("steelScrape end-to-end: markdown and html are both populated over real HTTP", async () => {
  const page = await steelScrape("https://example.com", {
    apiKey: "e2e-key",
    baseUrl,
  });

  // The double, like real Steel, returns only requested formats — so a
  // non-empty markdown proves the package asks for it.
  expect(page.markdown).toBe("# E2E");
  expect(page.html).toContain("<h1>E2E</h1>");
  expect(page.title).toBe("E2E");
  expect(page.statusCode).toBe(200);

  const scrapeRequest = requests.find((r) => r.path === "/v1/scrape");
  expect(scrapeRequest?.apiKey).toBe("e2e-key");
  expect(scrapeRequest?.body.url).toBe("https://example.com");
});

test("a retried create adopts the live server-side session behind the deterministic ID", async () => {
  // A prior attempt "succeeded server-side but its response was lost": the
  // session already exists at the deterministic ID when the function runs.
  const runId = "e2e-lost-response-run";
  const seededId = deriveSessionId(runId);
  createSession({ sessionId: seededId });

  const inngest = new Inngest({
    id: "steel-e2e-retry",
    middleware: [steelMiddleware({ apiKey: "e2e-key", baseUrl })],
  });
  const fn = inngest.createFunction(
    { id: "e2e-lost-create-response" },
    async ({ step, steel }) =>
      withSteelSession(step, { steel, runId }, async (session) =>
        step.run("browser-work", async () => session.id),
      ),
  );

  const { result, error } = await new InngestTestEngine({
    function: fn,
  }).execute();

  // The run succeeds by adopting the existing session — no duplicate, and the
  // adopted session ends the run released.
  expect(error).toBeUndefined();
  expect(result).toBe(seededId);
  expect(sessions.get(seededId)?.status).toBe("released");
}, 30_000);
