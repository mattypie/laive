# Phase 6: Safety, Evaluation, Packaging, And Release

## Objective

Harden the system for repeated real use by agents and humans.

Primary outcome: the stack is safe enough to trust for iterative studio workflows and stable enough to distribute.

## Deliverable

Policy controls, regression suites, packaging, and release documentation.

## Safety Model

Classify operations:

- `safe-read`
- `low-risk-write`
- `session-altering-write`
- `destructive`
- `ui-fallback-sensitive`

Examples:

- `get_project_summary`: safe-read
- `set_tempo`: low-risk-write
- `create_track`: session-altering-write
- `delete_track`: destructive
- `export_audio`: ui-fallback-sensitive

For higher-risk operations:

- require explicit confirmation flags
- return a preview summary before execution
- log the action with enough detail to audit later

## Evaluation Plan

### Functional Benchmarks

Build benchmark scenarios:

- create a sketch set from scratch
- inspect and edit an existing arrangement
- load a device, change parameters, launch clips
- export a render

### Reliability Benchmarks

- repeated connect/disconnect
- mutate large sets with many tracks
- recover after bridge restart
- recover after manual user changes in Live

### Agent Benchmarks

Measure:

- task completion rate
- number of tool calls
- stale-state incidents
- fallback usage rate
- destructive-action false positives prevented

## Packaging

Recommended release units:

- `laive-remote-script`
- `laive-mcp-server`
- `laive-ui-helper`
- `laive-dev-harness`

Document:

- installation paths for Remote Script
- Max for Live sidecar install steps
- macOS accessibility permission requirements
- supported Live versions
- known limitations

## Observability

Add:

- structured logs
- per-request trace IDs
- bridge health dashboard or CLI
- trace export for bug reports

## Documentation Requirements

- quickstart
- architecture overview
- safety policy reference
- tool reference
- troubleshooting guide
- version compatibility matrix

## Implementation Tasks

1. Add policy engine and confirmation model.
2. Add trace capture and replay to CI.
3. Add scenario fixtures and benchmark scripts.
4. Add packaging manifests for each component.
5. Write full operator docs.
6. Define release checklist and rollback plan.

## Acceptance Criteria

- destructive actions are gated intentionally
- common workflows pass on supported Live versions
- failures are diagnosable from logs and traces
- installation can be completed from docs alone

## Dependencies

- prior phases complete enough to benchmark

## Risks

- cross-version support can consume disproportionate effort
- accessibility permissions and OS security prompts can complicate onboarding

## Exit Criteria

- the system can be used reliably in normal studio sessions
- release artifacts and docs are complete enough for external users
