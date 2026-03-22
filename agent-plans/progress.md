# Progress

## Current Status

- Date started: 2026-03-22
- Repository state: initialized
- Active phase: End-user delivery hardening, with repo-complete code and installer flow in place pending real Live validation

## Phase Status

| Phase | Status | Notes |
| --- | --- | --- |
| 0. Vision and scope | complete | Initial plan approved and repository created. |
| 1. Foundation and bridge | in progress | Fixture bridge, Python Remote Script scaffold, user-facing install flow, and macOS install tooling are implemented; real Live-side validation still pending. |
| 2. State engine | in progress | Canonical project-state mirror, reducers, replay, and monotonic snapshot versioning implemented. |
| 3. MCP surface | in progress | MCP server now has a real bridge-backed stdio launch path plus fixture mode for smoke testing. |
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
