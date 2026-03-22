# Safety Policy

This document defines the default operational safety policy for `laive`.

## Risk Classes

### `safe-read`

Characteristics:

- does not mutate the Live set
- may refresh cached state
- safe to execute without user confirmation

Examples:

- `get_project_summary`
- `list_tracks`
- `get_selected_context`

### `low-risk-write`

Characteristics:

- mutates runtime state in a reversible or low-impact way
- should still be logged with a trace ID

Examples:

- `set_tempo`
- `set_parameter`
- `launch_clip`

Default policy:

- allowed without explicit confirmation when session policy is permissive
- dry-run preview preferred when ambiguity exists

### `session-altering-write`

Characteristics:

- changes project topology or creates new objects
- can meaningfully affect the saved set

Examples:

- `create_track`
- `create_scene`
- `create_clip`
- `insert_device`

Default policy:

- require explicit `confirm: true` or equivalent confirmation mode
- include preview summary before execution

### `destructive`

Characteristics:

- may remove data or make significant project changes that are not trivial to undo

Examples:

- `delete_track`
- `delete_clip`
- `replace_notes`
- `overwrite_device_chain`

Default policy:

- require explicit confirmation
- log full request and affected object summary
- support dry-run whenever possible

### `ui-fallback-sensitive`

Characteristics:

- uses UI automation
- may be vulnerable to window-focus or accessibility-tree drift

Examples:

- `export_audio`
- `browser_search_and_load`
- `run_menu_command`

Default policy:

- require explicit confirmation
- require foreground Ableton validation
- include fallback mode in tool output and logs

## Required Runtime Behaviors

- Every write request must include a trace ID.
- Every destructive or fallback request must emit a structured audit event.
- Tool outputs must declare whether the action executed, previewed, or was blocked.
- Saved-set state from `.als` parsing must not be labeled as runtime truth.

## Recommended Confirmation Model

- `none`: only for safe reads
- `preview`: preflight only, no mutation
- `confirm`: execute only if explicit confirmation flag is present
- `operator`: reserved for sensitive UI fallback or destructive actions during manual supervision

## Failure Handling

If a request fails:

- return a machine-readable error code
- include the object or path that caused the failure where possible
- indicate whether state refresh is recommended
- mark whether the failure happened in runtime mode or UI fallback mode
