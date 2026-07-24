import type { Steel } from "steel-sdk";

/**
 * Test doubles for steel-inngest unit tests.
 *
 * The fakes sit at the Steel SDK boundary and the Inngest `step` boundary — the
 * two places this package actually does work. Everything else is our own code.
 */

/** Recorded calls into the fake Steel client. */
export interface FakeSteelCalls {
  create: { params: Record<string, unknown> }[];
  release: { id: string }[];
  scrape: { params: Record<string, unknown> }[];
}

/**
 * A fake Steel client: typed as the real `Steel` (so it satisfies option types)
 * plus a `calls` log for assertions. The real Steel has private fields a hand
 * double can't reproduce, so the concrete object is cast on the way out — but it
 * implements every method this package calls.
 */
export type FakeSteel = Steel & { calls: FakeSteelCalls };

/** The subset of the Steel `Session` this package reads. */
export interface FakeSteelSession {
  id: string;
  status: string;
  websocketUrl: string;
  sessionViewerUrl: string;
  timeout: number;
}

export interface CreateFakeSteelOptions {
  /** Override fields of the created session. */
  session?: Partial<FakeSteelSession>;
  /** Override the canned scrape response. */
  scrapeResponse?: Record<string, unknown>;
  /** The `steelAPIKey` the client reports (used for connectUrl fallback). */
  steelAPIKey?: string | null;
  /** The REST API base URL the client reports. */
  baseURL?: string;
  /** A counter-backed id generator; default increments `sess-N`. */
  nextId?: () => string;
  /** Observe session creation in lifecycle/integration tests. */
  onCreate?: (params: Record<string, unknown>) => void;
  /** Observe session release in lifecycle/integration tests. */
  onRelease?: (id: string) => void;
}

/**
 * Build a fake Steel client. By default each `create` returns a fresh `sess-N`
 * with a predictable `websocketUrl`/`sessionViewerUrl`.
 */
export function createFakeSteel(options: CreateFakeSteelOptions = {}): FakeSteel {
  const calls: FakeSteelCalls = { create: [], release: [], scrape: [] };
  let n = 0;
  const nextId = options.nextId ?? (() => `sess-${++n}`);

  const fake = {
    calls,
    baseURL: options.baseURL ?? "https://api.steel.dev",
    steelAPIKey:
      options.steelAPIKey === undefined ? "test-key" : options.steelAPIKey,
    sessions: {
      async create(params: Record<string, unknown>): Promise<FakeSteelSession> {
        calls.create.push({ params });
        options.onCreate?.(params);
        const id = options.session?.id ?? nextId();
        return {
          id,
          status: options.session?.status ?? "live",
          websocketUrl:
            options.session?.websocketUrl ??
            `wss://api.steel.dev/v1/sessions/${id}/websocket?token=tok`,
          sessionViewerUrl:
            options.session?.sessionViewerUrl ?? `https://app.steel.dev/sessions/${id}`,
          timeout: options.session?.timeout ?? 300_000,
        };
      },
      async release(id: string): Promise<{ id: string; status: string }> {
        calls.release.push({ id });
        options.onRelease?.(id);
        return { id, status: "released" };
      },
    },
    async scrape(params: Record<string, unknown>): Promise<Record<string, unknown>> {
      calls.scrape.push({ params });
      return (
        options.scrapeResponse ?? {
          content: { html: "<html><body>Hi</body></html>", markdown: "# Hi" },
          metadata: { title: "Example", statusCode: 200 },
        }
      );
    },
  };

  return fake as unknown as FakeSteel;
}

/**
 * A fake Inngest `step` that memoizes `run` results by ID.
 *
 * Seed it with pre-computed results to simulate a retry/resume where earlier
 * steps are already memoized: a seeded `run` returns the stored value WITHOUT
 * executing the handler. Unseeded `run`s execute the handler and store the
 * result, so a second call with the same ID is a replay.
 */
export interface FakeStep {
  /** Ordered log of every `run` call and whether its handler executed. */
  runs: { id: string; executed: boolean }[];
  /** Read a memoized result without executing a step. */
  getMemo: (id: string) => unknown;
  run: (id: string, fn: () => Promise<unknown> | unknown) => Promise<unknown>;
}

export function createFakeStep(seeds: Record<string, unknown> = {}): FakeStep {
  const memo = new Map<string, unknown>(Object.entries(seeds));
  const runs: FakeStep["runs"] = [];
  return {
    runs,
    getMemo(id) {
      return memo.get(id);
    },
    async run(id, fn) {
      if (memo.has(id)) {
        runs.push({ id, executed: false });
        return memo.get(id);
      }
      const result = await fn();
      memo.set(id, result);
      runs.push({ id, executed: true });
      return result;
    },
  };
}

/** Restore an environment variable without converting `undefined` to text. */
export function restoreEnv(
  name: string,
  value: string | undefined,
): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
