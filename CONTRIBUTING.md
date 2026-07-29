# Contributing

Issues and pull requests are welcome.

## Set up the project

Use Node.js 22 or newer:

```bash
npm ci
npm run check
```

Before opening a pull request, run the same non-billable checks as CI:

```bash
npm run check
npm run build
npm run check:package
npm pack --dry-run
```

Keep changes focused. Add or update tests for behavior changes, and use
Conventional Commits for commit messages.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing session lifecycle,
checkpoint data, step IDs, or credential handling.

## Live testing

The live example creates a potentially billable Steel session. Do not run it
without a real `STEEL_API_KEY` and permission to incur the associated usage.
The steps are documented in the [README](README.md#run-the-live-example).

## Pull requests

Explain the user-facing change, note any lifecycle or replay implications, and
include the checks you ran. Never commit API keys, `.env` files, connection
URLs, or session handles.
