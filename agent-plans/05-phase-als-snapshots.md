# Phase 5: `.als` Snapshots, Diffing, And Recovery

## Objective

Add offline project introspection to support cold-start context, set diffing, and recovery when runtime state is unavailable or incomplete.

Primary outcome: the system can load a saved Ableton set into a structured representation and compare it with the runtime mirror.

## Deliverable

An offline parser and diff layer for `.als` files integrated into the state ecosystem.

## Why This Is Separate

`.als` parsing is useful, but it is not a substitute for runtime control. Keeping it separate avoids polluting the bridge with offline concerns.

## Capabilities

- parse saved `.als` into normalized entities
- derive a project summary without launching Live
- diff two saved sets
- diff saved set vs current runtime mirror
- provide recovery hints when runtime state drifts or reconnects mid-session

## Recommended Scope

First parse only what matters to planning and reconciliation:

- set metadata
- tracks, returns, master
- scenes
- clip references and timing summaries
- devices and chains where parseable
- routing and naming metadata

Do not try to reverse-engineer every proprietary detail in the first pass.

## Implementation Tasks

1. Create package skeleton for `packages/als-parser`.
2. Implement `.als` decompression and XML extraction.
3. Define normalized offline schema aligned with the runtime state engine.
4. Implement summary builder.
5. Implement diff engine:
   - added/removed tracks
   - renamed objects
   - changed clip occupancy
   - changed device topology
   - changed tempo/global settings
6. Integrate parser outputs with the state engine as source `als`.
7. Add commands or MCP tools for loading offline summaries.

## Testing

- fixture sets from multiple Live versions
- round-trip parser sanity on simple and medium-complexity sets
- diff accuracy on controlled edits

## Acceptance Criteria

- parser can summarize representative saved sets
- diff output is useful for human review and agent planning
- runtime vs offline source differences are explicit

## Dependencies

- normalized schemas from Phase 2

## Risks

- `.als` internals may vary more than expected across versions
- some device-specific data may be difficult to interpret reliably

## Exit Criteria

- offline state can augment runtime state without being mistaken for live truth
