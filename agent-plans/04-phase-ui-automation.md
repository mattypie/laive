# Phase 4: UI Automation Fallback

## Objective

Cover operations that runtime APIs do not expose reliably, especially browser actions, dialogs, export flows, and UI-only navigation.

Primary outcome: the system can perform a constrained set of last-mile actions without pretending UI automation is a substitute for runtime state.

## Deliverable

A macOS accessibility helper and a thin MCP integration layer for approved fallback operations.

## First Supported Platform

macOS only.

Reason:

- the current environment is macOS
- Ableton Live 12 has meaningful accessibility support
- native Accessibility APIs are stronger than trying to force desktop browser automation abstractions onto a DAW

## Recommended Stack

- native helper in Swift using Accessibility APIs
- local RPC wrapper callable from Node
- screenshots/accessibility tree snapshots only for debugging, not as primary agent context

## Fallback Use Cases

- open and drive export dialog
- perform menu commands not exposed elsewhere
- interact with browser search and insertion flows when runtime insertion is insufficient
- control view navigation required to complete user-facing actions
- interact with plugin windows only when specifically allowed and narrowly scoped

## Guardrails

- every UI tool must declare it is using fallback mode
- every tool must require a focused Live window check
- actions should be implemented as deterministic workflows, not open-ended UI poking
- unsupported screen states should fail fast with diagnostic output

## Planned UI Tools

- `ui_open_export_audio_video`
- `ui_export_with_preset`
- `ui_run_menu_command`
- `ui_focus_section`
- `ui_browser_search_and_load`
- `ui_capture_context`

## Implementation Tasks

1. Create package skeleton for `packages/ui-automation`.
2. Build macOS helper to enumerate Live window and accessibility tree.
3. Implement focus guards and window activation.
4. Implement reusable primitives:
   - find element by role and label
   - press button
   - set text field
   - select menu item
   - wait for element
   - capture diagnostic snapshot
5. Implement export dialog flow.
6. Implement browser search/load flow.
7. Expose approved helpers to MCP layer.
8. Add operator-safe logs and screenshots for failures.

## Testing

### Manual

- export audio workflow on a standard test set
- browser search and device insertion on a standard test set

### Automated Where Possible

- helper launches and detects Live window
- known dialogs produce expected accessibility trees
- failure diagnostics are persisted

## Acceptance Criteria

- fallback flows are deterministic on supported Live versions
- failures produce enough diagnostic context to debug quickly
- UI tools are never silently used when runtime APIs could have handled the action

## Dependencies

- MCP server from Phase 3
- stable macOS target environment

## Risks

- accessibility trees may vary by Live version or theme
- plugin UIs are often not accessible enough for robust control
- UI automation can drift after minor UI changes

## Exit Criteria

- at least export and browser-load flows work end to end on macOS
- fallback usage is explicit in logs and tool responses
