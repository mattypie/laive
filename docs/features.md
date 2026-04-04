# Features

`laive-mcp` is strongest today in Session View. The bridge-backed MCP surface has been validated against a real Ableton Live session, not just fixture mode.

## Project And Set Reads

- `get_project_summary`
- `get_selected_context`
- `list_tracks`
- `list_mixer_tracks`
- `list_return_tracks`
- `get_master_track`
- `get_track_details`
- `get_device_tree`
- `refresh_state`
- `get_capabilities`

These let an agent inspect the current set, mixer topology, clips, devices, parameters, and selected context.

## Session And MIDI Workflows

- `set_tempo`
- `play_transport`
- `stop_transport`
- `create_track`
- `create_scene`
- `create_clip`
- `rename_clip`
- `move_session_clip`
- `set_clip_loop_or_length`
- `duplicate_clip`
- `delete_clip`
- `insert_notes`
- `replace_notes`
- `launch_clip`
- `launch_scene`
- `stop_track_clips`
- `stop_all_clips`

This is the current core music-making surface.

## Arrangement View

- `get_arrangement_summary`
- `get_arrangement_track_details`
- `set_arrangement_transport`
- `create_arrangement_clip`
- `duplicate_clip_to_arrangement`
- `move_arrangement_clip`

The current `v0.7.0` slice now includes:
- arrangement clip enumeration now flows through track details and arrangement summaries
- arrangement clip creation on visible tracks
- session-to-arrangement clip duplication
- explicit arrangement clip movement
- song readback now includes Arrangement transport position plus loop start, length, and enabled state
- arrangement loop and transport-region control is exposed without requiring the Session View surface

Still pending in this slice:
- Arrangement-specific editing ergonomics beyond transport and summary control

## Mixer And Routing

- `create_return_track`
- `set_track_volume`
- `set_track_panning`
- `set_send_level`
- `set_monitor_state`
- `set_track_routing`

The current mixer slice also includes:
- return-track and master-track discovery
- return/master device targeting
- alias-aware send and routing resolution against the live-advertised choices
- readback of available routing choices and send metadata in track details

## Devices And Browser

- `get_browser_tree`
- `get_browser_items`
- `load_browser_item`
- `set_parameter`

Parameter writes support:
- lookup by track/device/parameter name
- enum-label targeting for quantized parameters when metadata is available

## Optional Components

### Max For Live Sidecar

The sidecar is optional. It is not the main bridge.

Current sidecar-related tools:
- `get_component_status`
- `list_sidecar_workflows`
- `run_sidecar_workflow`
- `ensure_sidecar_on_track`
- `sidecar_snapshot_selection_context`
- `sidecar_replace_clip_notes`
- `sidecar_observe_device_parameters`

If the sidecar is not installed or not active in the set, `laive` returns structured setup guidance instead of silently failing.

### macOS UI Helper

The UI helper is also optional and used as a fallback for workflows that are awkward or unavailable through the primary bridge.

Current UI-helper-related tools:
- `list_ui_workflows`
- `run_ui_workflow`
- `ui_browser_search_and_load`
- `ui_capture_context`
- `ui_export_audio_video`
- `ui_export_with_preset`
- `ui_focus_section`

If Accessibility is not granted or the helper is not installed, `laive` returns setup guidance.

## Current Limits

- Arrangement View is only partially exposed today; clip editing and creation primitives are still incomplete.
- Clip-envelope control is not yet exposed as first-class MCP tools.
- The sidecar is complementary, not required for the main control path.
- The UI helper is a fallback, not the preferred path.

For planned follow-up work:
- [Roadmap](./roadmap.md)

For the lower-level tool list:
- [Tool Reference](./tool-reference.md)
