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

## Decision Summary

- Primary runtime bridge: Ableton Python Remote Script.
- Supplemental runtime bridge: Max for Live sidecar where official Live API coverage or note-level workflows are better inside Max.
- Agent surface: MCP server in TypeScript.
- Canonical state: event-fed graph owned outside Live, not inferred inside the LLM.
- UI fallback: macOS accessibility helper for dialogs, browser actions, export flows, and plugin/UI gaps.
- Offline support: `.als` parsing for cold-start state and version-aware diffs.
