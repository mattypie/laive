# Phase 2: State Engine And Project Mirror

## Objective

Build a canonical state engine outside Live that maintains an agent-friendly mirror of the current project.

Primary outcome: an external service can answer "what is the current state of the project?" without forcing the agent to reconstruct it from raw bridge calls.

## Deliverable

A state service that ingests bridge snapshots and events, normalizes them, and serves queryable project state with freshness metadata.

## Why This Matters

Agents make poor decisions on fragmented state. The bridge returns low-level objects; the state engine converts them into stable, reasoning-friendly structures.

## Canonical Model

Define normalized entities:

- `ApplicationState`
- `SongState`
- `TrackState`
- `SceneState`
- `ClipState`
- `DeviceState`
- `ParameterState`
- `SelectionState`
- `CapabilityState`

Every entity should include:

- canonical ID
- source path
- last observed timestamp
- version counter
- source of truth marker: `runtime`, `ui`, `als`

## State Ingestion Strategy

Use a mixed model:

- full snapshot at connect
- targeted subtree resync after topology mutations
- event-driven incremental updates between snapshots

Do not depend on events alone for correctness.

## Required Features

### 1. Snapshot Builder

At session start, build:

- song metadata
- track graph including returns and master
- scenes
- session clip matrix summary
- arrangement clip summary per track
- device tree per track
- parameter summaries for visible devices or selected devices

### 2. Reconciliation

After mutations:

- mark affected subtree dirty
- query authoritative state again
- merge updates
- publish a new version

### 3. Freshness And Drift

Each response from the state service should expose:

- snapshot version
- age in milliseconds
- dirty paths
- last resync time

If the state is stale, MCP tools should either refresh or declare reduced confidence.

### 4. Subscription Bus

Expose internal events such as:

- `track.added`
- `track.removed`
- `clip.updated`
- `device.selected`
- `transport.changed`
- `state.resynced`
- `state.drift_detected`

### 5. Query Surfaces

Support queries optimized for agents:

- "summarize the whole set"
- "get selected context"
- "get track by name or index"
- "get currently playing clips"
- "get devices and macros on track X"
- "get candidate clips matching criteria"

## Implementation Tasks

1. Create package skeleton for `packages/state-engine`.
2. Define entity schemas and versioning rules.
3. Implement initial full-snapshot loader.
4. Implement event reducers.
5. Implement dirty-path tracker and subtree refresh.
6. Implement query adapters for common agent tasks.
7. Add persisted trace-replay tests.
8. Add a debug inspector UI or terminal view for current mirror state.

## Query Design Guidance

The raw state graph should not be the only surface. Add curated views:

- compact project summary
- detailed track summary
- selected-context summary
- mutation preflight summary

This keeps the MCP surface small and stable.

## Testing

### Deterministic Replay

Record bridge traces from real sessions and replay them into the state engine to validate:

- id stability
- event ordering
- resync behavior
- stale-state detection

### Mutation Validation

For each write operation:

- take pre-state snapshot
- execute mutation
- resync affected nodes
- verify resulting graph

## Acceptance Criteria

- state engine can answer whole-project and focused-context queries without live agent reconstruction
- state remains coherent across common topology mutations
- dirty state is detectable and recoverable
- traces can be replayed offline for regression tests

## Dependencies

- stable message contracts from Phase 1

## Risks

- object identities may shift after reorder/group operations
- full parameter expansion can become too heavy for large sets
- arrangement detail can be expensive to mirror continuously

## Exit Criteria

- state engine is the default read path for future MCP tools
- at least one large real-world set can be mirrored with acceptable latency
