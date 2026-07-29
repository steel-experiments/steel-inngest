import { Middleware, type Inngest } from "inngest";
import type { Steel } from "steel-sdk";
import type { SteelMiddlewareOptions } from "./types.js";
import { createSteelClient } from "./internal.js";

/**
 * v4 Inngest dependency-injection middleware that injects a configured Steel
 * client as `ctx.steel`.
 *
 * Use the {@link steelMiddleware} factory to configure an API key/base URL, or
 * pass this class directly when `STEEL_API_KEY` is set in the environment.
 *
 * @remarks
 * Mirrors the structure of `@inngest/middleware-sentry` (a raw class plus a
 * factory) and Inngest's own `dependencyInjectionMiddleware`. Middleware wraps a
 * *request*, not a run — it cannot hold resources across steps — so its job here
 * is solely to inject the configured client.
 *
 * Registering `steelMiddleware` after another middleware that also provides
 * `ctx.steel` overrides it (last-middleware-wins, runtime and types).
 */
export class SteelMiddleware extends Middleware.BaseMiddleware {
  readonly id = "steel-inngest";

  protected readonly steel: Steel;

  constructor(args: { client: Inngest.Any }) {
    super(args);
    // Fails at construction — not first use — if no key is resolvable.
    this.steel = createSteelClient(this.resolveOptions());
  }

  /**
   * Options used to build the injected client. The raw class resolves from the
   * environment; the {@link steelMiddleware} factory overrides this to supply
   * explicit options.
   */
  protected resolveOptions(): SteelMiddlewareOptions {
    return {};
  }

  override transformFunctionInput(
    arg: Middleware.TransformFunctionInputArgs,
  ): Middleware.TransformFunctionInputArgs & { ctx: { steel: Steel } } {
    return { ...arg, ctx: { ...arg.ctx, steel: this.steel } };
  }
}

/**
 * Create a configured Steel DI middleware class.
 *
 * @param options - `apiKey` (default `process.env.STEEL_API_KEY`) and optional
 *   `baseUrl`. Throws at construction if no key is resolvable.
 * @returns A `Middleware.BaseMiddleware` subclass to add to an Inngest client or
 *   function. The injected `ctx.steel` is typed without casts.
 *
 * @example
 * ```ts
 * import { Inngest } from "inngest";
 * import { steelMiddleware } from "steel-inngest";
 *
 * const inngest = new Inngest({
 *   id: "my-app",
 *   middleware: [steelMiddleware({ apiKey: process.env.STEEL_API_KEY })],
 * });
 *
 * export const fn = inngest.createFunction({ id: "scrape" }, async ({ steel }) => {
 *   // `steel` is typed as the Steel client — no cast needed.
 * });
 * ```
 */
export function steelMiddleware(
  options: SteelMiddlewareOptions = {},
): typeof SteelMiddleware {
  return class extends SteelMiddleware {
    override resolveOptions(): SteelMiddlewareOptions {
      return options;
    }
  };
}
