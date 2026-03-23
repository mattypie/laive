# laive Agent Plans

This directory contains an implementation plan for building an agent-first Ableton Live control stack.

Current execution status is tracked in [`progress.md`](./progress.md).

## Planning Principles

- Prefer runtime truth over guessed state.
- Separate transport/control, state ingestion, and agent-facing APIs.
- Keep each phase independently shippable.
- Treat UI automation as a fallback, not the primary runtime interface.
- Build explicit safety rails before giving the agent destructive power.

## Recommended Execution Order

1. [`00-vision-and-scope.md`](./00-vision-and-scope.md)
2. [`01-phase-foundation-and-bridge.md`](./01-phase-foundation-and-bridge.md)
3. [`02-phase-state-engine.md`](./02-phase-state-engine.md)
4. [`03-phase-mcp-surface.md`](./03-phase-mcp-surface.md)
5. [`04-phase-ui-automation.md`](./04-phase-ui-automation.md)
6. [`05-phase-als-snapshots.md`](./05-phase-als-snapshots.md)
7. [`06-phase-safety-evals-and-release.md`](./06-phase-safety-evals-and-release.md)
8. [`progress.md`](./progress.md)

## Phase Independence

Each phase is intended to produce a usable artifact:

- Phase 1 ships a direct Live bridge and command executor.
- Phase 2 ships a synchronized project-state mirror service.
- Phase 3 ships an MCP server that agents can use productively.
- Phase 4 expands coverage to UI-only workflows and browser interactions.
- Phase 5 adds offline snapshotting, diffing, and recovery workflows.
- Phase 6 hardens the system for real use and release.

Phases are ordered to reduce rework, but they are scoped so that work can proceed in parallel once the required contracts are stable.
The current sidecar-improvement workstream also spans phases 0, 3, and 6 in parallel because it touches product positioning, MCP ergonomics, and release-facing docs at the same time.

## Decision Summary

- Primary runtime bridge: Ableton Python Remote Script.
- Supplemental runtime bridge: Max for Live sidecar for selection-aware, track-local, and future analysis workflows that are better inside the set than in the Remote Script alone.
- Sidecar UX direction: ship a branded, recognizable in-Live device presentation instead of a placeholder-looking source patcher.
- Agent surface: MCP server in TypeScript.
- Canonical state: event-fed graph owned outside Live, not inferred inside the LLM.
- UI fallback: macOS accessibility helper for dialogs, browser actions, export flows, and plugin/UI gaps.
- Offline support: `.als` parsing for cold-start state and version-aware diffs.

## Versioned Follow-Up Roadmap

These are the current planned work units for the next product slices. They are intentionally concrete and independently shippable, but still tentative until a release is cut.

### Target `v0.5.0`

- session-editing ergonomics:
  - `rename_clip`
  - `move_session_clip`
  - `set_clip_loop_or_length`
  - gated `duplicate_clip`
  - gated `delete_clip`
- parameter metadata ergonomics:
  - enum labels or allowed values for common quantized parameters on built-in devices
  - better parameter lookup by name and mode hints

### Target `v0.6.0`

- mixer and routing surface:
  - return-track discovery
  - master-track discovery
  - send-level read/write
  - monitor-state read/write
  - input/output routing read/write
  - device loading on return/master targets

### Target `v0.7.0`

- arrangement-view surface:
  - arrangement-clip enumeration
  - arrangement loop / transport-region control
  - arrangement clip creation or movement where reliably supported
  - arrangement-focused summaries instead of Session-only mirrors

### Target `v0.8.0`

- envelopes and deeper sidecar workflows:
  - clip-envelope inspection
  - clip-envelope editing
  - selected-clip transforms
  - parameter snapshot/restore
  - lightweight analysis workflows
