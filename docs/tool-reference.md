# Tool Reference

This is the operator-facing summary of the intended MCP surface.

## Read Tools

- `get_project_summary`
  - Returns a compact summary of the current set.
- `get_selected_context`
  - Returns selected track, clip, scene, and device context.
- `list_tracks`
  - Returns compact track summaries.
- `get_track_details`
  - Returns detailed track state and clip topology.
- `get_device_tree`
  - Returns devices and parameters for a target track.
- `get_capabilities`
  - Returns bridge and server capability metadata.

## Write Tools

- `set_tempo`
  - Low-risk write for global tempo changes.
- `create_track`
  - Session-altering write that creates a new track.
- `create_clip`
  - Session-altering write that creates a clip on a track and slot.
- `set_parameter`
  - Low-risk write that updates a target parameter.
- `refresh_state`
  - Forces a resync of a state subtree or the full project.

## Planned Fallback Tools

- `ui_open_export_audio_video`
- `ui_export_with_preset`
- `ui_run_menu_command`
- `ui_focus_section`
- `ui_browser_search_and_load`
- `ui_capture_context`

## Output Contract

Every tool response should include:

- `summary`
- `affected_objects`
- `state_version_before`
- `state_version_after`
- `warnings`
- `next_suggested_actions`

## Error Categories

- `invalid_request`
- `ambiguous_reference`
- `unsupported_feature`
- `stale_state`
- `bridge_unavailable`
- `execution_failed`
- `ui_fallback_required`
