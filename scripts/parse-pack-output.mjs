// ABOUTME: Extracts the JSON result from `npm pack --json` stdout, which may be
// ABOUTME: preceded by lifecycle-script noise. Shared by verify-package.mjs and its tests.

/**
 * Parse the JSON array that `npm pack --json` writes to stdout.
 *
 * Lifecycle scripts may write to stdout before npm emits its JSON result, so
 * candidate `[` positions are tried from the end of the output backwards.
 *
 * @param {string} output - Raw stdout from `npm pack --json`.
 * @returns {unknown[]} The parsed pack result array.
 * @throws {Error} When no suffix of the output parses as JSON.
 */
export function parsePackOutput(output) {
  for (
    let start = output.lastIndexOf("[");
    start >= 0;
    start = start > 0 ? output.lastIndexOf("[", start - 1) : -1
  ) {
    try {
      return JSON.parse(output.slice(start));
    } catch {
      // Not the JSON result yet; keep scanning backwards.
    }
  }

  throw new Error(`npm pack did not emit a JSON result:\n${output}`);
}
