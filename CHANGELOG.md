# Changelog

## Unreleased

## v0.3.0 - 2026-03-23

- Added a first-class `replace_notes` bridge and MCP operation so clip note replacement now overwrites the existing payload instead of piggybacking on additive `insert_notes` semantics.
- Kept `insert_notes` explicitly additive and updated the MCP tool descriptions/tests to distinguish insert-vs-replace behavior.
- Tightened optional sidecar workflow gating so sidecar tools now require an active `laive-sidecar` device in the current Live set instead of silently succeeding when only the `.amxd` is installed on disk.

## v0.2.7 - 2026-03-23

- Fixed delayed session-playback mirroring by mapping bridge `track-playback-changed` events into MCP `track.updated` state updates instead of collapsing them to generic dirty-path notifications.
- Updated project-summary and track-detail queries to derive playing session clips from `playing_slot_index` as well as clip flags, keeping readback coherent when Live settles playback state asynchronously.
- Added regression tests covering delayed playback events and slot-index-derived playing clips so scene launch and clip-stop flows no longer rely on synchronous runtime behavior in the harness.

## v0.2.6 - 2026-03-23

- Added first-class Session View control tools across the bridge and MCP surface: `launch_clip`, `launch_scene`, `stop_track_clips`, and `stop_all_clips`.
- Extended the Python bridge, fixture runtime, and fake Live harness to propagate session playback state more coherently, including `playing_slot_index` / `fired_slot_index` and explicit clip-playback change events.
- Added bridge and MCP test coverage for Session View launch/stop flows so clip playback control is exercised end to end instead of being inferred from transport-only behavior.

## v0.2.5 - 2026-03-23

- Added a browser-backed device loading path to the control-surface bridge, including browser tree/item queries and `load_browser_item` via Live's `application().browser.load_item(...)` flow.
- Exposed new MCP browser tools so agents can inspect browser categories/items and load devices onto tracks without falling back to UI automation.

## v0.2.4 - 2026-03-23

- Fixed Live 11 MIDI note insertion for the Python Remote Script bridge by constructing `Live.Clip.MidiNoteSpecification` objects for `add_new_notes`, matching Ableton's own built-in Remote Script usage instead of passing plain dicts or tuples.
- Added a clip-note capability adapter in the Python bridge so note reads and note writes use the same runtime-specific API family instead of diverging across `add_new_notes`, legacy note commands, and fixture-only `clip.notes` access.
- Added bridge-local serializers for songs, tracks, clips, devices, and parameters so the bridge emits stable DTOs, including explicit `note_count`/`noteCount` clip metadata and normalized armed/muted/soloed aliases.

## v0.2.3 - 2026-03-23

- Fixed the legacy Remote Script note-write fallback again to drive Live's command-style `set_notes -> notes -> note -> done` sequence, which is what the Live 11 Python bridge actually exposes when `add_new_notes` is unavailable.

## v0.2.2 - 2026-03-23

- Fixed legacy Remote Script MIDI note insertion by using the older `replace_selected_notes` command sequence when `add_new_notes` is unavailable, instead of incorrectly calling `set_notes` with a single tuple payload.

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

