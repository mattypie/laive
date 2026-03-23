# Progress

## Current Status

- Date started: 2026-03-22
- Repository state: initialized
- Active phase: Sidecar ergonomics and optional-component hardening, with branded Max UI delivery, explicit sidecar placement tooling, and follow-on sidecar roadmap alignment being added across the docs and MCP surface

## Phase Status

| Phase | Status | Notes |
| --- | --- | --- |
| 0. Vision and scope | complete | Initial plan approved and repository created. |
| 1. Foundation and bridge | in progress | Fixture bridge, Python Remote Script scaffold, user-facing install flow, browser-backed device loading, Session View launch/stop primitives, and track-selection helpers are wired through the real bridge. |
| 2. State engine | in progress | Canonical project-state mirror, reducers, replay, and monotonic snapshot versioning implemented. |
| 3. MCP surface | in progress | MCP server now has a real bridge-backed stdio launch path plus fixture mode for smoke testing, with Session View launch/stop tools and sidecar-placement tooling promoted to first-class MCP actions. |
| 4. UI automation | in progress | UI helper app staging is implemented so Accessibility permissions map to a shipped artifact. |
| 5. `.als` snapshots | in progress | Offline parser and diff scaffold implemented. |
| 6. Safety, evals, release | in progress | End-user CLI, README, install docs, release checklist, fixtures, and benchmark/replay scripts implemented. |

## Work Log

### 2026-03-22

- Initialized repository at `~/src/laive`.
- Added implementation plan documents under `agent-plans/`.
- Established workspace bootstrapping as the first work unit.
- Added workspace root, package layout, and progress tracking.
- Implemented initial MCP server scaffold with tool registry, JSON-RPC handling, and test coverage.
- Implemented initial Max for Live sidecar contract package with workflow definitions and tests.
- Implemented shared protocol helpers plus a fixture-backed TCP bridge harness for the Remote Script package.
- Implemented initial macOS UI fallback scaffold and `.als` parser/diff support with tests.
- Implemented first-pass state engine with normalized entities, query helpers, reconciliation, and trace replay support.
- Added operator docs, scenario fixtures, release checklist, and lightweight replay/benchmark scripts.
- Integrated bridge, state engine, and MCP tooling through a fixture-backed session adapter and end-to-end test.
- Added a concrete macOS operator checklist and explicit Live 11 vs Live 12 support guidance.
- Added a first-pass Python Ableton Remote Script scaffold plus packaging/install tooling for macOS deployment.
- Verified Remote Script packaging, Live install detection, dry-run install resolution, and Python scaffold tests locally.
- Added a user-facing `laive` CLI for doctor/detect/package/install flows.
- Staged the optional Max for Live sidecar source project as part of the delivery flow.
- Rewrote the root README and quickstart around end-user installation rather than internal development.
- Added a real `laive mcp` stdio server launch path backed by the installed bridge.
- Added a staged `laive-ui-helper.app` artifact for UI fallback permissions.
- Fixed Max sidecar staging so the packaged project now lands under `artifacts/live-sidecar-m4l/laive-sidecar/`, matching `laive-sidecar.maxproj` and avoiding Max project-folder load errors.
- Replaced the handcrafted sidecar `.maxproj` with a Max-style project file to avoid Max project deserialization crashes.
- Clarified the end-user sidecar flow in docs and CLI output: save the patcher as a `.amxd` Max for Live device, then drag that device onto a MIDI track in Live.
- Ported Max-generated sidecar metadata back into source, including the MIDI device type in `amxdtype`, and restored the `patchers/` plus `code/` layout so the patcher resolves `../code/laive-sidecar-node.js` the same way Max writes it.
- Removed the sidecar patcher's `node.script` startup race and switched the manual test buttons to plain Max command messages so they no longer depend on fragile JSON message-box formatting.
- Added delivery support for the shipped `laive-sidecar.amxd`, default User Library install targeting, stable `~/Applications/laive-ui-helper.app` installs, and an `mcp-config` CLI output for agent client configuration.
- Added publish-ready package metadata, a root changelog, AGENTS release policy, release scripts, GitHub workflow scaffolding, and a repo-local `skills/laive-release/SKILL.md`.
- Removed machine-specific home-directory references from scripts, tests, and docs by switching code to dynamic repo-root resolution and rewriting documentation examples to use placeholders, relative links, or generic home-directory paths.
- Tightened publish-facing docs so the published `npx laive-mcp ...` flow is primary, example paths are clearly labeled as examples or default install targets, and maintainer validation steps are separated from the end-user install narrative.
- Squashed the public release history to a single `v0.1.0` commit on `main` to avoid carrying pre-release path leaks forward into published history.
- Synced the repository `LICENSE` file from the remote and updated package metadata to `GPL-3.0-only` so the npm package license matches the published repo.
- Renamed the published npm package to `laive-mcp` after confirming `laive` is already taken on npm, while keeping the Live control surface name as `laive`.
- Corrected the root npm `bin` metadata for the renamed `laive-mcp` package after npm publish validation reported the previous object form as invalid.
- Fixed the MCP server startup path to support a real MCP `initialize` handshake and lazy bridge connection so agent clients can start the server before Ableton Live is reachable.
- Fixed the lazy bridge-connect crash path so unreachable Live sockets now surface as structured MCP tool errors rather than terminating the MCP transport.
- Fixed the MCP `tools/call` response envelope so Codex-compatible clients receive proper `CallToolResult` objects instead of raw internal payloads.
- Fixed MCP `tools/list` metadata so argument-bearing tools now advertise explicit JSON Schemas instead of empty parameter objects, allowing Codex to send required arguments like `tempo`, `trackId`, and `slotIndex`.
- Expanded the MCP tool surface to expose the remaining control-surface bridge actions for transport, scene creation, and note insertion.
- Added MCP-side optional component tooling for the Max sidecar and UI helper, including structured setup instructions when those optional components are unavailable in the current session.
- Fixed the Live Remote Script note-insertion payload to use Live's dictionary note-spec format instead of Python tuples, closing the real-session `NPythonClip::TNoteSpecification` conversion failure seen through both `insert_notes` and sidecar note replacement flows.
- Refactored the Python bridge note path around a dedicated clip-note adapter and bridge-local serializers so note writes and note readback now share the same runtime-specific capability layer.
- Added browser-backed device loading to the control-surface bridge, including browser tree/item queries and a `load_browser_item` path that selects a track and calls Live's browser `load_item(...)` API.
- Exposed MCP browser tools for querying browser roots/items and loading browser items onto tracks, and added fixture plus request-level tests to cover the end-to-end path.
- Investigated Ableton Push and Push 2 Remote Scripts as a reference for the supported Live Python API surface, confirming that official browser loading uses `Application.browser.load_item(...)` and Session View launch uses clip-slot and scene fire operations rather than UI automation.
- Added first-class Session View launch and stop primitives across the Python bridge, fixture runtime, and MCP surface: `launch_clip`, `launch_scene`, `stop_track_clips`, and `stop_all_clips`.
- Extended playback-state propagation so tracks now carry `playing_slot_index` and `fired_slot_index`, and the bridge listener hub emits explicit clip-playback change events when session launch state changes.
- Fixed MCP playback coherence for real Live sessions by mapping delayed `track-playback-changed` bridge events into `track.updated` state updates and by deriving summary/detail playback from track slot indexes as well as clip flags.
- Added regression coverage for delayed playback events so session launch/stop actions can correct the mirrored project state without requiring a manual full refresh.
- Split clip note mutation semantics so `insert_notes` stays additive while `replace_notes` is now a first-class overwrite operation across the bridge, fixture runtime, and MCP tool surface.
- Tightened optional sidecar status so sidecar workflows now require an active `laive-sidecar` device in the current Live set instead of silently falling back to the bridge when only the `.amxd` is installed on disk.
- Switched bridge-level note replacement to Live's supported `select_all_notes` + `replace_selected_notes` flow, after the published `0.3.0` validation showed that relying on `set_notes` still failed to overwrite notes in a real Live 11 session.
- Reworked the primary Live 11 note bridge again to use the documented extended-note APIs: `add_new_notes({"notes": [...]})` for insert, and `remove_notes_by_id`/`remove_notes_extended` followed by `add_new_notes` for replace, eliminating dependence on UI note selection state.
- Added bridge and fake-runtime regression coverage for extended-note insert and replace so repository tests now exercise the same API family intended for the real Live runtime.
- Tightened extended-note replacement so the bridge now treats the clear step as mandatory: it tries dict-form extended-note removal first, verifies the clip was actually cleared, and fails fast instead of silently appending when Live 11 accepts a removal call but leaves the original notes intact.
- Corrected the Python bridge contract again after live validation showed that Remote Scripts do not accept the Max-style `{"notes": [...]}` payload for `add_new_notes`: inserts and replace-after-clear now send Python note specifications (`MidiNoteSpecification` when available, tuple fallback otherwise), while keeping the hardened clear-step logic in place.
- Verified through the published `npx laive-mcp` path that `replace_notes` now works against both populated and empty session clips in a real Live 11 session, and that Session View launch plus stop flows behave correctly through the integrated MCP tools.
- Added a bridge-level `select_track` action so MCP workflows can target a track before browser-driven or UI-assisted placement actions.
- Added an MCP `ensure_sidecar_on_track` workflow that selects the target track, checks whether `laive-sidecar` is already active there, and otherwise asks the optional UI helper to load it with structured setup guidance if the optional components are not ready.
- Refreshed the staged Max sidecar source project so it now carries bundled `logo.png` and `logo.txt` assets, letting the patcher present a branded `laive` device UI in Live with a readable ASCII fallback banner.
- Updated the docs and plan set to describe the sidecar more clearly as an optional, selection-aware companion to the control-surface bridge rather than the primary control path.
- Replaced the shipped `laive-sidecar.amxd` with the rebuilt branded device export and clarified in install output and docs that sidecar installation currently targets the default Ableton User Library path rather than a custom library location configured inside Live.
- Fixed the local UI-helper executor to target the actual frontmost macOS Live app name, after validating that this system reports the app as `Live` rather than `Ableton Live`, which was blocking `ensure_sidecar_on_track`.
- Fixed the macOS UI automation keystroke layer so special keys such as `return` are sent as real key codes instead of literal text, which was preventing browser-driven sidecar placement from confirming the search result.
- Updated the browser-search UI workflow to move focus from the search box into Live's browser results before pressing Return, which appears to be required for helper-driven device insertion on this setup.
- Made `ensure_sidecar_on_track` more robust by preferring bridge-native browser loading when the sidecar is discoverable through Live's browser model, then falling back to the UI helper only when that native path misses.
- Added sidecar placement confirmation polling so the adapter can wait for the device to appear on the target track before returning, instead of emitting a premature provisional warning.
- Expanded bridge-side browser root enumeration to include optional roots such as `user_library`, which is necessary if the sidecar is to be loaded natively from Live's browser model rather than exclusively through UI keystrokes.
- Reworked the Max sidecar source patch again so the deterministic in-Live device UI is a `jsui` banner that draws `logo.png` first and falls back to built-in ASCII art if the image cannot be loaded.
- Remaining follow-up after this slice: validate `ensure_sidecar_on_track` against a real Live set, expand the sidecar beyond note replacement into selected-clip transforms, parameter snapshot or restore, clip envelopes, and lightweight analysis workflows, keep the published `npx laive-mcp` path as the only supported end-to-end validation route, and add first-class clip or session editing ergonomics validated in live testing: clip rename, move clip between session slots, set clip length or loop bounds, and evaluate duplicate or delete with proper safety gating.
