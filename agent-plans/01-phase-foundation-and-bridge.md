# Phase 1: Foundation And Live Bridge

## Objective

Ship a direct, testable runtime bridge between Ableton Live and a local daemon without MCP yet.

Primary outcome: a local client can query core Live state and execute a bounded command set with deterministic responses.

## Deliverable

A versioned bridge protocol and a working in-Live Remote Script implementation with a local test harness.

## Recommended Stack

- In-Live bridge: Python Remote Script
- External local client: TypeScript or Python test harness
- Transport: localhost TCP or websocket
- Serialization: JSON messages with request IDs

## Why Start Here

Without a stable runtime bridge, everything above it becomes guesswork. This phase establishes the authoritative command and event contracts.

## Workstreams

### 1. Protocol Design

Define message families:

- `hello`
- `capabilities`
- `get`
- `set`
- `call`
- `subscribe`
- `unsubscribe`
- `event`
- `error`
- `health`

Each request should include:

- `request_id`
- `timestamp`
- `client_id`
- `operation`
- `path` or `target`
- `arguments`
- `dry_run`

Each response should include:

- `request_id`
- `ok`
- `result`
- `error_code`
- `error_message`
- `bridge_version`
- `live_version`

### 2. Object Addressing

Choose canonical addressing for runtime objects.

Recommended approach:

- use stable path-based addressing for discovery
- emit ephemeral Ableton object IDs for short-lived follow-up calls
- maintain a local mapping layer that translates runtime IDs to canonical external IDs

Examples:

- `song`
- `track:visible:3`
- `track:return:1`
- `clip:session:track=3:slot=7`
- `clip:arrangement:track=4:index=2`
- `device:track=3:index=1`
- `parameter:device=track=3:index=1:param=12`

### 3. Initial Command Set

Implement only the commands needed for a strong vertical slice:

- get song state
- list tracks
- list scenes
- list session clips for a track
- list arrangement clips for a track
- get devices for a track
- get parameters for a device
- expose quantized-parameter metadata where Live reports only numeric values but stable mode labels are needed for agent usability
- set tempo
- play / stop / continue
- create MIDI track
- create audio track
- create scene
- create MIDI clip
- add MIDI notes to clip
- replace MIDI notes in clip
- fire clip
- fire scene
- stop track clips
- stop all clips
- set parameter value
- load browser item onto track
- select target track for follow-on operations

### 4. Event Model

Support subscriptions to:

- transport changes
- selected track / selected scene / selected device
- track list changes
- clip launch state changes
- device list changes
- parameter value changes for subscribed devices

Do not try to stream the whole world immediately. Start with targeted subscriptions and explicit resync requests.

### 5. Development Harness

Build a local harness outside MCP:

- connect to bridge
- send commands from CLI
- log raw events
- save reproducible traces

This harness should remain in the repo permanently as the lowest-level debugging tool.

## Implementation Tasks

1. Create package skeleton for `packages/live-bridge-remote-script`.
2. Define JSON schema for request/response/event messages.
3. Implement socket lifecycle, heartbeat, and graceful reconnect.
4. Implement capability discovery on connect.
5. Implement read-only object enumeration methods.
6. Implement first mutation commands.
7. Implement event subscriptions.
8. Add structured logging on both sides.
9. Add trace fixtures for common sessions.
10. Document Live installation steps for the Remote Script.
11. Define a bridge-side strategy for enum labels on common quantized parameters without overfitting to one Live version or device schema.

## Test Plan

### Unit

- message validation
- command routing
- serialization and error shaping

### Integration

- start Live, connect harness, query state
- create track, clip, notes, fire clip
- change transport and confirm events
- disconnect and reconnect without restarting Live
- TODO: validate bridge-level support for clip rename, clip-slot moves, clip loop or length edits, and duplicate or delete semantics in real Live sessions across supported Live versions.

### Failure Tests

- unknown target
- unsupported operation on current Live version
- object disappears between query and mutation
- malformed request

## Acceptance Criteria

- a local client can connect and retrieve song, track, clip, device, and parameter state
- core write operations succeed with structured acknowledgements
- subscriptions emit stable, parseable events
- bridge crashes do not crash Live
- reconnect works without requiring manual reinstall or reconfiguration

## Dependencies

- Ableton Live installed locally
- Remote Script installation path documented per supported Live version

## Risks

- event callbacks may be noisy or inconsistent across Live versions
- some object identities may not persist cleanly across topology changes
- synchronous mutation semantics may differ from user expectations

## Exit Criteria

- the bridge is usable without an LLM
- at least one example session can be driven end to end from the harness
- the protocol is stable enough for the state engine phase
