# Changelog

## Unreleased

## v0.1.3 - 2026-03-22

- Fixed MCP `tools/call` responses to return proper `CallToolResult` envelopes with `content`, `structuredContent`, and `isError`, so Codex clients accept the responses instead of rejecting them as an unexpected type.

## v0.1.2 - 2026-03-22

- Fixed an MCP transport crash when the Live bridge socket is unreachable by preventing the bridge client from raising an unhandled `error` event during lazy connection attempts. Tool calls now return structured MCP errors instead of closing the server process.

## v0.1.1 - 2026-03-22

- Fixed MCP startup compatibility by implementing the `initialize` handshake, ignoring `notifications/initialized`, and deferring Live bridge connection until the first real tool call so the server can start before Ableton is reachable.

## v0.1.0 - 2026-03-22

- Renamed the published npm package from `laive` to `laive-mcp` because `laive` is already taken on npm. The Ableton-side control surface name remains `laive`.
- Corrected the npm `bin` metadata so the published package exposes a valid executable entrypoint.
- Set the published project license to `GPL-3.0-only` and added the repository `LICENSE` file.
- Added stable default installation targets for `~/Applications/laive-ui-helper.app` and the Ableton User Library MIDI effect path.
- Added shipping and staging for the prebuilt `laive-sidecar.amxd` device.
- Added `laive mcp-config` for local and published MCP client configuration output.
- Added publish and release tooling, including `AGENTS.md`, `scripts/release.mjs`, and `scripts/version-workspaces.mjs`.

