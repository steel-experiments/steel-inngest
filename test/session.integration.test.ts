import { InngestTestEngine } from "@inngest/test";
import { Inngest } from "inngest";
import { expect, test } from "vitest";
import { withSteelSession } from "../src/session.js";
import { createFakeSteel } from "./helpers.js";

test("@inngest/test replays withSteelSession without using a released resource", async () => {
  const lifecycle: string[] = [];
  let released = false;
  let functionExecutions = 0;
  let connectionCount = 0;

  const steel = createFakeSteel({
    session: { id: "integration-session" },
    onCreate() {
      lifecycle.push("create-session");
    },
    onRelease() {
      released = true;
      lifecycle.push("release-session");
    },
  });
  const inngest = new Inngest({ id: "steel-session-integration" });
  const fn = inngest.createFunction(
    { id: "durable-session-lifecycle" },
    async ({ step, runId }) => {
      functionExecutions += 1;
      return withSteelSession(
        step,
        { steel, runId },
        async (session) =>
          step.run("browser-work", async () => {
            if (released) {
              throw new Error("attempted to reconnect after release");
            }

            connectionCount += 1;
            lifecycle.push(`connect:${session.id}`);
            try {
              lifecycle.push(`work:${session.id}`);
              return { sessionId: session.id };
            } finally {
              lifecycle.push(`close-connection:${session.id}`);
            }
          }),
      );
    },
  );

  const engine = new InngestTestEngine({ function: fn });
  const { result, error } = await engine.execute();

  expect(error).toBeUndefined();
  expect(result).toEqual({ sessionId: "integration-session" });
  expect(functionExecutions).toBeGreaterThan(1);
  expect(connectionCount).toBe(1);
  expect(steel.calls.create).toHaveLength(1);
  expect(steel.calls.release).toEqual([{ id: "integration-session" }]);
  expect(lifecycle).toEqual([
    "create-session",
    "connect:integration-session",
    "work:integration-session",
    "close-connection:integration-session",
    "release-session",
  ]);
});

test("@inngest/test state never checkpoints the Steel API key", async () => {
  const steel = createFakeSteel({ steelAPIKey: "INTEGRATION_SECRET" });
  const inngest = new Inngest({ id: "steel-secret-integration" });
  const fn = inngest.createFunction(
    { id: "secret-free-checkpoint" },
    async ({ step }) =>
      withSteelSession(step, { steel }, async () =>
        step.run("browser-work", async () => "ok"),
      ),
  );

  const { state } = await new InngestTestEngine({ function: fn }).execute();
  const values = await Promise.all(Object.values(state));
  const serializedState = JSON.stringify(values);

  expect(serializedState).not.toContain("INTEGRATION_SECRET");
  expect(serializedState).not.toContain("connectUrl");
});
