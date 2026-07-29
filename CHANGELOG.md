# Changelog

All notable changes to `steel-inngest` are documented here.

## 0.4.0 - 2026-07-29

- Fixed `steelScrape` to request the `markdown` format from Steel; the
  documented `markdown` field was previously always empty.
- Exported the `SteelMiddleware` class from the package entry point, as its
  documentation promised.
- Made the create-session step retry-safe: a retry whose create is rejected
  because a prior attempt's response was lost adopts the live session behind
  the deterministic ID instead of failing the run.
- Made the release-session step retry-safe: a release failure against a
  session that is no longer live counts as released.
- Fixed the package-verification script to fail instead of hanging when
  `npm pack` emits malformed output.
- Added a hermetic end-to-end test tier that exercises the real Steel SDK over
  HTTP through the real Inngest execution engine.

## 0.3.1 - 2026-07-29

- Added public architecture and release documentation.
- Added ESLint, Prettier, and a full dependency audit to the verification gate.
- Added GitHub issue and pull request templates.
- Added an npm trusted-publishing workflow.
- Removed internal planning artifacts from the public repository.

## 0.3.0 - 2026-07-24

First npm release.

- Added durable Steel session creation and release as memoized Inngest v4
  steps.
- Added typed Steel dependency-injection middleware.
- Added a one-shot scrape helper.
- Kept API keys and complete connection URLs out of Inngest step checkpoints.
- Added deterministic session IDs for replay-aware workflows.
- Published ESM, CommonJS, and matching TypeScript declarations.
