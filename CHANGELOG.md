# Changelog

## Unreleased

## v0.2.1 - 2026-03-22

- Fixed Remote Script MIDI note insertion to send Live note-spec dictionaries instead of legacy Python tuples, covering both `add_new_notes` and `set_notes` bridge paths and resolving real-session `NPythonClip::TNoteSpecification` conversion failures for `insert_notes`.
- Fixed Remote Script packaging to safely restage into an existing staging directory, avoiding follow-on packaging failures during repeated local package/install flows.

## v0.2.0 - 2026-03-22

- Updated the README to advertise the currently proven live MCP capabilities separately from lower-level bridge capabilities that are not yet surfaced as first-class MCP tools.
- Expanded the MCP server to expose the remaining control-surface bridge tools for transport control, scene creation, and MIDI note insertion.
- Added optional sidecar and UI-helper MCP workflow tools plus `get_component_status`, with structured setup instructions when those optional components are unavailable.
- Fixed the Remote Script packaging helper to retry staged-tree cleanup so `laive-mcp package` no longer fails intermittently on existing `__pycache__` directories.

## v0.1.4 - 2026-03-22

- Fixed MCP tool schema advertising so argument-bearing tools like `set_tempo`, `get_track_details`, `get_device_tree`, `create_clip`, and `set_parameter` now publish explicit JSON Schemas through `tools/list` instead of empty input objects, allowing Codex clients to send required parameters.

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
