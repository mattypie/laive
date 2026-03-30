# Contributing

This guide is for local development and technical repo usage.

For end-user install and trial instructions, start at:
- [README](../README.md)

## Local Setup

Prerequisites:
- macOS
- Ableton Live 11 or newer
- Node 18.16 or newer
- `python3` on `PATH`

The repo currently has no npm dependencies, so a fresh clone is usually enough.

## Run From A Local Checkout

Readiness and install:

```sh
node ./bin/laive.mjs doctor
node ./bin/laive.mjs detect --json
node ./bin/laive.mjs install --apply
```

Run the MCP server locally:

```sh
node ./bin/laive.mjs mcp
```

Print local and published MCP config snippets:

```sh
node ./bin/laive.mjs mcp-config --json
```

## Local Source Workflow

Typical local validation flow:
1. Quit Ableton Live before reinstalling the Remote Script.
2. Run `node ./bin/laive.mjs install --apply --overwrite`.
3. Reopen Live.
4. Enable `laive` in `Preferences > Link, Tempo & MIDI`.
5. Restart the MCP client if you changed MCP or state-engine code.

## Tests

Run the core suites:

```sh
npm test
npm run test:python
npm run test:delivery
```

Useful focused commands:

```sh
node ./scripts/release.mjs check
node ./bin/laive.mjs doctor --json
node ./bin/laive.mjs package --json
node ./bin/laive.mjs install --json
```

## Repo Layout

- `packages/live-bridge-remote-script`
  - Python Remote Script and JS bridge client/server
- `packages/mcp-server`
  - MCP stdio server and tool surface
- `packages/state-engine`
  - normalized project mirror and replay utilities
- `packages/live-sidecar-m4l`
  - optional Max for Live sidecar source and shipped `.amxd`
- `packages/ui-automation`
  - optional macOS Accessibility helper and UI workflows
- `agent-plans`
  - execution plan and roadmap tracker

## Useful Docs

- [Features](./features.md)
- [Roadmap](./roadmap.md)
- [Architecture Overview](./architecture-overview.md)
- [Compatibility Matrix](./compatibility-matrix.md)
- [Tool Reference](./tool-reference.md)
- [Troubleshooting](./troubleshooting.md)
- [Release Process](./release-process.md)

## Release Discipline

Before release work, read:
- [AGENTS.md](../AGENTS.md)

Release tooling:
- `node ./scripts/release.mjs prepare <patch|minor|major>`
- `node ./scripts/release.mjs prepare <patch|minor|major> --apply`

GitHub releases are part of the release workflow.
