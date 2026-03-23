# Phase 3: MCP Surface And Agent Tooling

## Objective

Expose the system to an agent through a disciplined MCP server built on top of the bridge and state engine.

Primary outcome: an agent can inspect the project, plan changes, and execute safe commands without speaking raw bridge protocol.

## Deliverable

A TypeScript MCP server with strongly-scoped tools, structured errors, and state-aware responses.

## Design Rules

- tools should map to user intentions, not raw Ableton internals
- every write tool should validate preconditions against the state engine
- every destructive tool should expose preview context
- tool output should be compact, structured, and consistent

## Tool Categories

### Read Tools

- `get_project_summary`
- `get_selected_context`
- `list_tracks`
- `get_track_details`
- `list_scenes`
- `list_playing_clips`
- `get_device_tree`
- `get_clip_details`
- `search_objects`

### Write Tools

- `set_transport`
- `set_tempo`
- `create_track`
- `create_scene`
- `create_clip`
- `insert_notes`
- `replace_notes`
- `launch_clip`
- `launch_scene`
- `stop_track_clips`
- `stop_all_clips`
- `load_browser_item`
- `ensure_sidecar_on_track`
- `stop_track`
- `set_parameter`
- `rename_object`
- `duplicate_clip`
- `rename_clip`
- `move_session_clip`
- `set_clip_loop_or_length`
- `delete_clip`

### Safety / Planning Tools

- `preview_mutation`
- `refresh_state`
- `get_capabilities`
- `explain_last_error`

## MCP Response Shape

Each tool response should include:

- `summary`
- `affected_objects`
- `state_version_before`
- `state_version_after` where applicable
- `warnings`
- `next_suggested_actions`

## Preflight Model

Before every write:

1. resolve human-facing identifiers into canonical IDs
2. verify object still exists
3. verify feature supported on current Live version
4. estimate affected subtree
5. execute mutation
6. force post-mutation refresh for affected subtree
7. return updated summary

## Tool Design Guidance

Prefer a small number of powerful tools over many thin wrappers.

Examples:

- `create_clip` should support target track, slot or arrangement location, length, optional name, and optional note payload.
- `set_parameter` should support lookup by track/device/parameter name with disambiguation hints.
- `preview_mutation` should not execute writes; it should resolve targets and return what would change.
- `ensure_sidecar_on_track` should select the target track, prefer official browser-backed insertion where possible, and return setup guidance when the UI helper or shipped device is unavailable.
- sidecar-facing tools should explain whether the request can be satisfied by the primary bridge alone or whether the optional sidecar adds materially better context or behavior.
- TODO: add session-editing tools for `rename_clip`, `move_session_clip`, `set_clip_loop_or_length`, `duplicate_clip`, and `delete_clip`, with preflight validation and localized post-write refresh so agents can clean up or reorganize sketches without dropping to raw bridge semantics.

## Implementation Tasks

1. Create package skeleton for `packages/mcp-server`.
2. Define MCP tool specs and argument schemas.
3. Integrate read path with state engine.
4. Integrate write path with bridge and post-write reconciliation.
5. Add structured logging and request tracing.
6. Add safety policy layer and dry-run support.
7. Add example prompts and expected tool traces.

## Error Handling

Distinguish between:

- invalid request
- ambiguous reference
- unsupported feature
- stale state
- bridge unavailable
- Live execution failed
- UI fallback required

The MCP layer should tell the agent what to do next, not just that something failed.

## Testing

### Contract Tests

- tool schema validation
- deterministic output structure
- ambiguous name resolution behavior

### End-To-End

- create track and clip through MCP
- update tempo
- launch clip
- place the optional sidecar on a target track
- verify the sidecar reports as active and recognizable after placement
- inspect post-write state

## Acceptance Criteria

- an agent can complete basic music-production tasks without raw bridge access
- reads are routed through the state engine by default
- writes return updated, localized state summaries
- tool errors are actionable and structured
- optional-sidecar tools either complete the placement flow or return explicit user instructions instead of a generic unsupported error

## Dependencies

- Phase 1 bridge
- Phase 2 state engine

## Risks

- oversized tool outputs can waste context
- too many low-level tools will push reasoning complexity back into the model

## Exit Criteria

- MCP can support meaningful user workflows in a single conversation loop
- raw bridge access is only needed for debugging or new feature development
