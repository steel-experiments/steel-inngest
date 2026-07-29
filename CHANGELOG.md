# Changelog

All notable changes to `steel-inngest` are documented here.

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
