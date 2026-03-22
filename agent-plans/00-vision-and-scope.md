# Vision And Scope

## Goal

Build a system that lets an agent interact with Ableton Live as a real operating environment, not as a MIDI target.

The agent should be able to:

- inspect the current Live set with enough fidelity to reason over tracks, scenes, clips, devices, parameters, routing, transport, selection, and view context
- execute high-level and low-level commands safely
- subscribe to meaningful project changes
- recover from drift between expected and actual state
- use UI automation only when runtime APIs cannot perform the action

## Non-Goals

- Re-implement the entire Ableton UI.
- Guarantee full control of third-party plugin internals.
- Depend exclusively on Max for Live or exclusively on UI automation.
- Assume a single monolithic protocol will cover all future Live versions.

## Product Shape

The target product is a local multi-process system:

- one process lives inside Ableton as a Remote Script
- one optional device runs inside a Live set as a Max for Live sidecar
- one local daemon maintains canonical project state
- one MCP server exposes safe tools to the agent
- one optional accessibility helper performs UI-only actions

## Core Requirements

### Runtime State Coverage

The system must be able to observe or query:

- application version and mode
- song/global state: tempo, time signature, loop region, arrangement position, playback/record state, metronome, quantization
- track topology: visible tracks, return tracks, master track, group nesting, frozen/armed/solo/mute/monitoring state, routing, color, names
- clip topology: session clips, arrangement clips, scenes, launch state, playing state, clip names/colors, clip lengths
- device topology: devices, chains, drum racks, parameter banks, selected device
- parameter state: values, min/max, display strings where available
- browser-related intent and results where supported by runtime layers
- selection and view context important for follow-up actions

### Command Coverage

The system must support:

- transport control
- track, scene, and clip creation and manipulation
- MIDI note creation/editing at clip level
- device insertion where supported
- parameter get/set and bulk operations
- scene/clip launching and stopping
- arrangement navigation and selection-aware operations
- save/export-like workflows via controlled fallback channels

### Agent Safety

The system must:

- classify operations by risk
- require confirmation policies for destructive actions
- return machine-readable preconditions and failures
- provide dry-run and preview modes where practical

## Design Constraints

- Ableton APIs are incomplete and version-sensitive.
- Some operations are only practical through the browser or UI.
- Notification streams can be noisy and partial.
- Agent reasoning quality depends on stable, well-shaped state, not raw object graphs.

## Architectural Decisions

### 1. Use A Hybrid Bridge

Relying on only one surface is weak:

- MIDI-only is too shallow.
- Max for Live alone is broad but not total.
- Remote Script alone is powerful but still leaves gaps.
- UI automation alone is too brittle for the core loop.

The correct design is layered:

- Remote Script for primary runtime control
- Max for Live sidecar for deep official API access and patch-native workflows
- UI automation for last-mile operations
- `.als` parsing for offline truth and recovery

### 2. Maintain State Outside The Agent

The LLM should not reconstruct the Live set from ad hoc tool outputs. A state engine should own:

- canonical IDs
- object graph normalization
- snapshots
- subscriptions
- stale-state detection
- conflict resolution between runtime and offline sources

### 3. Design For Version Drift

Live 11 and 12 differ materially in capabilities. The bridge must:

- expose a feature capability map
- tag commands with minimum supported Live version
- degrade cleanly when a feature is unsupported

## Repository Plan

Planned top-level layout:

```text
packages/
  live-bridge-remote-script/
  live-sidecar-m4l/
  state-engine/
  mcp-server/
  ui-automation/
  als-parser/
docs/
fixtures/
scripts/
```

## Exit Criteria For Scope Definition

This phase is complete when:

- the target architecture is accepted
- the first supported operating system is fixed to macOS
- the first supported Live versions are fixed, recommended as Live 12.x primary and Live 11.x best-effort
- the state model boundaries are explicit enough to start implementation
