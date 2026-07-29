const publicApi = require("steel-inngest");

const expected = ["steelMiddleware", "steelScrape", "withSteelSession"];
const actual = Object.keys(publicApi).sort();

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected CommonJS exports: ${actual.join(", ")}`);
}

for (const name of expected) {
  if (typeof publicApi[name] !== "function") {
    throw new TypeError(`${name} is not a function in the CommonJS build.`);
  }
}
