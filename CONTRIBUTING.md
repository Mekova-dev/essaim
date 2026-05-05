# Contributing to essaim

Thanks for considering a contribution.

## Reporting bugs

Open an issue with the "bug" template. Include the version (`essaim --version`) and a minimal reproduction (preset used, agent count, log output).

## Suggesting features

Open an issue with the "feature" template. Explain the use case before proposing implementation.

## Pull requests

1. Fork the repo and create a branch off `main`.
2. Run `npm install` then `npm test` to confirm baseline passes.
3. Add tests for any new behavior. We use Vitest.
4. Keep commits scoped and follow [Conventional Commits](https://www.conventionalcommits.org/).
5. Open a PR against `main`. CI must pass before review.

## Development

- `npm install`
- `npm test` — vitest suite (orchestrator + agent-loop + bridge tests).
- `npm run build` — TypeScript compile to `dist/`.
- `npm run cli -- list` — list bundled presets.
- `npm run cli -- run swarm -p ./tmp-test-repo --agents 2 --dry-run` — preview a coordinated run.

## Architecture

essaim is the orchestrator. It composes behaviors via [@swoofer/promptweave](https://github.com/swoofer/promptweave) and runs them against an embedded [mcp-coordinator](https://github.com/swoofer/mcp-coordinator) instance. The 32-behavior catalog ships bundled. See `README.md` for the high-level model.
