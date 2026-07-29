import * as publicApi from "steel-inngest";

const expected = [
  "SteelMiddleware",
  "steelMiddleware",
  "steelScrape",
  "withSteelSession",
];
const actual = Object.keys(publicApi).sort();

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected ESM exports: ${actual.join(", ")}`);
}

for (const name of expected) {
  if (typeof publicApi[name] !== "function") {
    throw new TypeError(`${name} is not a function in the ESM build.`);
  }
}
