// ABOUTME: Durable Steel browser sessions as memoized Inngest steps: create with a
// ABOUTME: finite timeout, hand the handler a JSON-safe handle, release on success.
import { type Middleware } from "inngest";
import type { Steel } from "steel-sdk";
import type { SteelSessionHandle, WithSteelSessionOptions } from "./types.js";
import {
  assertExclusiveSteelClient,
  buildConnectUrl,
  createSteelClient,
  DEFAULT_STEP_PREFIX,
  deriveSessionId,
  fingerprintSessionConfiguration,
  NO_API_KEY_ERROR,
  resolveTimeout,
  SESSION_CONFIG_CHANGED_ERROR,
} from "./internal.js";

/**
 * API-key-free data persisted by the create step.
 *
 * `configurationFingerprint` detects endpoint or credential drift across
 * replay without storing either value. `websocketUrl` comes from Steel and is
 * not augmented with the long-lived API credential.
 */
interface SteelSessionCheckpoint {
  readonly id: string;
  readonly websocketUrl: string;
  readonly viewerUrl: string | null;
  readonly configurationFingerprint: string;
}

/**
 * Run a handler inside a durable Steel browser session, with the session
 * lifecycle expressed as memoized Inngest steps.
 *
 * @param step - The function's `step` tools.
 * @param options - Session configuration.
 * @param handler - Receives a JSON-safe {@link SteelSessionHandle}. Reconnect
 *   to the session by `connectUrl` inside your own steps, and close the
 *   **connection** (never the session) per step.
 * @returns Whatever the handler resolves to.
 *
 * @remarks
 * Lifecycle, in order:
 * 1. `step.run("<prefix>/create-session")` — creates the session with a
 *    mandatory finite timeout. A successful result is memoized across replay;
 *    the callback itself may retry before that checkpoint succeeds. With
 *    `runId` set, a retry whose create is rejected because a prior attempt's
 *    response was lost adopts the live session behind the deterministic ID.
 * 2. `await handler(handle)` — your work. If it throws, the error propagates
 *    **untouched**: no release is attempted (Inngest checkpoints by throwing
 *    interrupts through user code; a `try/finally` would fire mid-run).
 * 3. `step.run("<prefix>/release-session")` — releases the session on success
 *    only. A retry whose release fails against a session that is no longer
 *    live (a prior attempt's response was lost) counts as released.
 *
 * Failed runs are reaped by the session's finite timeout — that is the
 * failure-path cleanup.
 *
 * @example
 * ```ts
 * await withSteelSession(step, { runId: ctx.runId }, async (session) => {
 *   return step.run("browser-work", async () => {
 *     const browser = await chromium.connectOverCDP(session.connectUrl);
 *     try {
 *       // ...use the browser...
 *     } finally {
 *       await browser.close(); // close the *connection*, not the session
 *     }
 *   });
 * });
 * ```
 */
export async function withSteelSession<T>(
  step: Middleware.StepTools,
  options: WithSteelSessionOptions,
  handler: (session: SteelSessionHandle) => Promise<T>,
): Promise<T> {
  assertExclusiveSteelClient(options);

  const prefix = options.stepPrefix ?? DEFAULT_STEP_PREFIX;
  // Validate the timeout up front so an invalid value fails fast without
  // creating a session.
  const timeoutMs = resolveTimeout(options.timeoutMs);

  const createStepId = `${prefix}/create-session`;
  const releaseStepId = `${prefix}/release-session`;

  const client =
    options.steel ??
    createSteelClient({ apiKey: options.apiKey, baseUrl: options.baseUrl });

  // The client is the single source of the credential: its REST calls and the
  // in-memory CDP URL must use the same key, regardless of the ambient
  // environment. A supplied client may carry no key at all — reject it rather
  // than borrow one from elsewhere.
  const apiKey = client.steelAPIKey;
  if (!apiKey) {
    throw new Error(NO_API_KEY_ERROR);
  }

  const baseUrl = client.baseURL;
  const configurationFingerprint = fingerprintSessionConfiguration(
    baseUrl,
    apiKey,
  );

  const sessionId =
    options.runId !== undefined
      ? deriveSessionId(options.runId, prefix)
      : undefined;

  // 1. Create the session in a step. Inngest memoizes a successful checkpoint;
  //    the callback itself may retry before that checkpoint succeeds.
  const checkpoint: SteelSessionCheckpoint = await step.run(
    createStepId,
    async () => {
      let session: SteelSession;
      try {
        session = await client.sessions.create({
          timeout: timeoutMs,
          ...(options.useProxy !== undefined
            ? { useProxy: options.useProxy }
            : {}),
          ...(options.solveCaptcha !== undefined
            ? { solveCaptcha: options.solveCaptcha }
            : {}),
          ...(sessionId !== undefined ? { sessionId } : {}),
        });
      } catch (error) {
        // A prior attempt may have created the session even though its
        // response was lost before the step checkpointed. The deterministic
        // ID lets the retry find and adopt that session; any other failure
        // propagates unchanged.
        session = await adoptLiveSession(client, sessionId, error);
      }

      return {
        id: session.id,
        websocketUrl: session.websocketUrl,
        viewerUrl: session.sessionViewerUrl || null,
        configurationFingerprint,
      };
    },
  );

  // A run can resume in another request or deployment. Refuse to connect or
  // release with configuration that does not match the create checkpoint.
  if (checkpoint.configurationFingerprint !== configurationFingerprint) {
    throw new Error(SESSION_CONFIG_CHANGED_ERROR);
  }

  // Build the credential-bearing URL only in memory. It is passed to the
  // handler but is never returned from an internal step.
  const handle: SteelSessionHandle = {
    id: checkpoint.id,
    connectUrl: buildConnectUrl(checkpoint.websocketUrl, apiKey),
    viewerUrl: checkpoint.viewerUrl,
  };

  // 2. Run the user's handler. If it throws, propagate untouched — NO release
  //    (see hard constraint #3).
  const result = await handler(handle);

  // 3. Release the session on success only.
  await step.run(releaseStepId, async () => {
    try {
      await client.sessions.release(handle.id);
    } catch (error) {
      // A prior attempt may have released the session even though its
      // response was lost before the step checkpointed. Only a session that
      // is still live makes the failure real.
      if (await isSessionLive(client, handle.id)) {
        throw error;
      }
    }
    return { released: true, id: handle.id };
  });

  return result;
}

/** The Steel SDK's session shape, without importing its private type paths. */
type SteelSession = Awaited<ReturnType<Steel["sessions"]["create"]>>;

/**
 * Recover from a failed create whose session may already exist server-side:
 * return the session behind the deterministic ID if it is live, otherwise
 * rethrow the create failure.
 */
async function adoptLiveSession(
  client: Steel,
  sessionId: string | undefined,
  cause: unknown,
): Promise<SteelSession> {
  if (sessionId === undefined) {
    throw cause;
  }
  let existing: SteelSession;
  try {
    existing = await client.sessions.retrieve(sessionId);
  } catch {
    throw cause;
  }
  if (existing.status !== "live") {
    throw cause;
  }
  return existing;
}

/**
 * Whether Steel still reports the session as live. Errs on the side of `true`
 * (a lookup failure must not swallow a release failure).
 */
async function isSessionLive(client: Steel, id: string): Promise<boolean> {
  try {
    const session = await client.sessions.retrieve(id);
    return session.status === "live";
  } catch {
    return true;
  }
}
