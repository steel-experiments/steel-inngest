import { type Middleware } from "inngest";
import type { SteelSessionHandle, WithSteelSessionOptions } from "./types.js";
import {
  buildConnectUrl,
  createSteelClient,
  DEFAULT_STEP_PREFIX,
  deriveSessionId,
  resolveApiKey,
  resolveTimeout,
} from "./internal.js";

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
 * 1. `step.run("<prefix>/create-session")` — creates the session exactly once
 *    (memoized across retries/replays) with a mandatory finite timeout.
 * 2. `await handler(handle)` — your work. If it throws, the error propagates
 *    **untouched**: no release is attempted (Inngest checkpoints by throwing
 *    interrupts through user code; a `try/finally` would fire mid-run).
 * 3. `step.run("<prefix>/release-session")` — releases the session on success
 *    only.
 *
 * Failed runs are reaped by the session's finite timeout — that is the
 * failure-path cleanup.
 *
 * @example
 * ```ts
 * await withSteelSession(step, { runId: ctx.runId }, async (session) => {
 *   const browser = await chromium.connectOverCDP(session.connectUrl);
 *   try {
 *     // ...do work in steps...
 *   } finally {
 *     await browser.close(); // close the *connection*, not the session
 *   }
 * });
 * ```
 */
export async function withSteelSession<T>(
  step: Middleware.StepTools,
  options: WithSteelSessionOptions,
  handler: (session: SteelSessionHandle) => Promise<T>,
): Promise<T> {
  const prefix = options.stepPrefix ?? DEFAULT_STEP_PREFIX;
  // Validate the timeout up front so an invalid value fails fast without
  // creating a session.
  const timeoutMs = resolveTimeout(options.timeoutMs);

  const createStepId = `${prefix}/create-session`;
  const releaseStepId = `${prefix}/release-session`;

  // 1. Create the session in a memoized step — exactly-once across retries.
  const handle: SteelSessionHandle = await step.run(createStepId, async () => {
    const client =
      options.steel ?? createSteelClient({ apiKey: options.apiKey, baseUrl: options.baseUrl });

    const apiKey = resolveApiKey(options.apiKey, options.steel?.steelAPIKey);

    const session = await client.sessions.create({
      timeout: timeoutMs,
      ...(options.useProxy !== undefined ? { useProxy: options.useProxy } : {}),
      ...(options.solveCaptcha !== undefined
        ? { solveCaptcha: options.solveCaptcha }
        : {}),
      ...(options.runId !== undefined
        ? { sessionId: deriveSessionId(options.runId) }
        : {}),
    });

    return {
      id: session.id,
      connectUrl: buildConnectUrl(session.websocketUrl, apiKey),
      viewerUrl: session.sessionViewerUrl || null,
    };
  });

  // 2. Run the user's handler. If it throws, propagate untouched — NO release
  //    (see hard constraint #3).
  const result = await handler(handle);

  // 3. Release the session on success only.
  await step.run(releaseStepId, async () => {
    const client =
      options.steel ?? createSteelClient({ apiKey: options.apiKey, baseUrl: options.baseUrl });
    await client.sessions.release(handle.id);
    return { released: true, id: handle.id };
  });

  return result;
}
