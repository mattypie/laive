# Architecture Overview

`laive` is designed as a layered local system rather than a single monolithic Ableton integration.

## Components

### `packages/live-bridge-remote-script`

Primary runtime bridge that lives inside Ableton Live as a Python Remote Script.

Responsibilities:

- connect Ableton runtime objects to a localhost daemon
- expose capability metadata for the running Live version
- perform low-level command execution
- emit runtime events and health signals

### `packages/live-sidecar-m4l`

Optional Max for Live plus Node for Max sidecar.

Responsibilities:

- support note-editing and official Live API workflows that are easier inside Max
- provide an alternate observation path for selected context and device state
- advertise sidecar-specific capabilities to the daemon

### `packages/state-engine`

Canonical project-state mirror outside Live.

Responsibilities:

- construct initial snapshots from bridge responses
- normalize tracks, scenes, clips, devices, and parameters into stable entities
- reconcile event streams with targeted resyncs
- serve compact query views that are useful to an agent

### `packages/mcp-server`

Agent-facing orchestration layer.

Responsibilities:

- expose compact MCP tools instead of raw protocol calls
- validate requests and resolve friendly identifiers
- enforce policy checks before writes
- force post-write refreshes and return localized state summaries

### `packages/ui-automation`

macOS-only fallback helper for UI-only workflows.

Responsibilities:

- drive Export Audio/Video and menu commands with deterministic workflows
- interact with browser search/load flows when runtime insertion is unavailable
- guard against accidental use outside focused Ableton windows

### `packages/als-parser`

Offline `.als` parser and diffing support.

Responsibilities:

- read saved Live sets without launching Ableton
- provide cold-start context and saved-set diffs
- compare runtime state with saved state for recovery workflows

## Data Flow

1. Ableton Live starts with the Remote Script installed.
2. The bridge connects to the local daemon and emits capabilities.
3. The state engine requests an initial snapshot.
4. The MCP server answers reads from the state engine and writes through the bridge.
5. The state engine resyncs affected subtrees after writes.
6. The UI automation helper is used only when runtime APIs cannot complete the action.
7. The `.als` parser can augment runtime state for cold-start summaries and drift analysis.

## Safety Boundaries

- Reads should flow through the state engine whenever possible.
- Writes should be classified by risk and passed through a policy engine.
- UI automation should be explicit in tool results and logs.
- Saved-set state should never be confused with live runtime truth.

## Observability

Every layer should emit:

- structured logs
- request or trace IDs
- capability metadata
- explicit error codes
- timestamps

## Deployment Shape

Initial target platform:

- macOS
- Ableton Live 12.x primary support
- Ableton Live 11.x best effort

Expected release units:

- `laive-remote-script`
- `laive-mcp-server`
- `laive-ui-helper`
- `laive-dev-harness`
