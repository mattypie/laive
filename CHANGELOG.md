# Changelog

Format:
- group entries under `### Features`, `### Fixes`, and `### Maintenance`
- keep bullets terse
- include one or more concrete commit refs in backticks

## Unreleased

### Features

- Start the `v0.7.0` arrangement slice with arrangement summaries, arrangement clip enumeration in track details, arrangement transport/loop control, and matching fixture/state-engine coverage (`dac62bf`, `339dc7b`).
- Add arrangement clip creation and session-to-arrangement duplication primitives across the bridge, fixture runtime, MCP surface, and tests (`80a7ff4`).
- Add first-class arrangement clip movement across the bridge, fixture runtime, MCP surface, and tests (`8d5652e`).

### Maintenance

- Reorganize the docs around end-user MCP adoption, split feature/roadmap/contributing content into dedicated docs, and ship `docs/` plus `logo.png` in the npm package (`e1a15c3`).

## v0.6.0 - 2026-03-30

### Features

- Add the mixer/routing surface for return and master tracks, including mixer-target listing, browser loading on return/master, return-track creation, and volume/panning/send/monitor/routing controls (`4bf0477`, `8a7590a`, `b91da64`).

### Fixes

- Handle mixer-only track serialization safely when return/master tracks do not expose visible-track state such as `arm` (`b26f923`).
- Replace fake-runtime dry-run previews with bridge-local previews for track, return-track, scene, and clip creation on real Live (`56f7b8b`).
- Normalize return-track naming and make return/send name matching tolerant of prefixed and de-prefixed aliases (`7263bb1`).
- Resolve send names and routing labels through alias-aware lookup against the live-advertised choices, and preserve those aliases in state readback (`b6b8faa`, `530a25b`).

### Maintenance

- Record real-Live mixer validation and capture follow-up roadmap work for score-to-MIDI and post-`0.6.0` ergonomics (`f791636`, `9e0f4af`, `151ea94`).

## v0.5.1 - 2026-03-28

### Fixes

- Add structured JSONL logging for the MCP server, bridge client, and Remote Script, and reconnect cleanly after idle bridge socket closure (`5c0afdc`, `f3f5155`).

## v0.5.0 - 2026-03-27

### Features

- Add first-class Session clip editing and enum-aware parameter control, including rename/move/loop tools, gated duplicate/delete, and name or enum-label based `set_parameter` writes (`b32301b`).

### Fixes

- Fix real-Live non-quantized parameter metadata and Live 11 clip loop/length writes (`93ec082`).

### Maintenance

- Use a temp npm cache for release checks and mark the `v0.5.0` roadmap slice as landed (`09ee1a0`, `ac6fb6b`).

## v0.4.1 - 2026-03-23

### Fixes

- Fix CI dry-run/install packaging assumptions and restore Node 18 MCP startup compatibility for published clients such as Claude (`651eea2`, `5536477`).

### Maintenance

- Expand the roadmap for arrangement/envelope follow-ups and require GitHub releases in the release workflow (`76158e4`, `472b783`).

## v0.4.0 - 2026-03-23

### Features

- Add sidecar placement as a first-class workflow, ship the branded sidecar device, and improve the sidecar banner rendering path (`f9cff2e`, `c8b4396`, `40b71d8`, `3881baa`, `edf0ccb`).

### Fixes

- Fix the local UI-helper path for sidecar placement by resolving the frontmost Live app name, handling special keys correctly, advancing browser selection, preferring bridge-native loading, and confirming placement before returning (`122326a`, `4837a88`, `bd47009`, `060f4d9`).
- Replace the broken `fpic`-style sidecar UI attempts with stable in-Live banner render paths during the sidecar export cycle (`2211e25`, `6da7706`).

### Maintenance

- Slice the roadmap into concrete work units and document clip-editing, enum-metadata, and mixer-control follow-ups (`7b26b8a`, `0d197ff`, `0eb0550`, `a284131`).

## v0.3.4 - 2026-03-23

### Fixes

- Restore Python note-spec payloads for note writes so the Live 11 Remote Script bridge uses the correct API shape again (`5d6cf8f`).

## v0.3.3 - 2026-03-23

### Fixes

- Harden Live 11 note replacement by requiring the clear step to actually remove existing notes before rewriting the clip (`dc820b2`).

## v0.3.2 - 2026-03-23

### Fixes

- Move clip writes onto the extended-note API family instead of older ad hoc note payload handling (`ed64fad`).

## v0.3.1 - 2026-03-23

### Fixes

- Use `replace_selected_notes` for the Live overwrite path instead of relying on weaker fallback behavior (`7a379f4`).

## v0.3.0 - 2026-03-23

### Features

- Split additive `insert_notes` from overwrite-style `replace_notes` and tighten sidecar workflow gating to require an active sidecar device (`9861f2e`).

## v0.2.7 - 2026-03-23

### Fixes

- Keep session playback state coherent by mapping delayed playback events into mirrored track updates and summary/detail readback (`5dc93eb`).

## v0.2.6 - 2026-03-23

### Features

- Add first-class Session View launch and stop controls across the bridge and MCP surface (`1803bd2`).

## v0.2.5 - 2026-03-23

### Features

- Add browser-backed device loading and browser query tools on the control-surface path (`bc8bc82`).

## v0.2.4 - 2026-03-23

### Fixes

- Use `MidiNoteSpecification` and bridge-local serializers for note writes and note readback on the Python bridge (`33fc777`).

## v0.2.3 - 2026-03-23

### Fixes

- Fix the command-style `set_notes` fallback for runtimes that do not expose the newer write path (`9af677d`).

## v0.2.2 - 2026-03-23

### Fixes

- Fix the legacy note insertion fallback for older Live bridge write behavior (`e2fbaf0`).

## v0.2.1 - 2026-03-22

### Fixes

- Fix note insertion payload handling across the primary and fallback note-write paths (`5c6a045`, `e8d8567`).

## v0.2.0 - 2026-03-22

### Features

- Expose the broader MCP bridge surface and optional component workflows through the user-facing server (`0ca9b31`).

### Fixes

- Mark the CLI entrypoint executable and harden Remote Script packaging cleanup (`af45195`, `93009a4`).

### Maintenance

- Tighten the README MCP capability summary to match what the server actually exposes (`ce9aa09`, `7b9c62b`).

## v0.1.4 - 2026-03-22

### Fixes

- Publish explicit JSON Schemas for argument-bearing MCP tools instead of empty input objects (`2bfd593`).

## v0.1.3 - 2026-03-22

### Fixes

- Return proper MCP `CallToolResult` envelopes from `tools/call` (`c86b2eb`).

## v0.1.2 - 2026-03-22

### Fixes

- Prevent bridge-unavailable tool calls from crashing the MCP transport and surface structured tool errors instead (`429d3b0`).

## v0.1.1 - 2026-03-22

### Fixes

- Implement the MCP `initialize` handshake and defer bridge connection until the first real tool call (`3eeb493`).

## v0.1.0 - 2026-03-22

### Features

- Ship the initial public package with MCP config output, helper/device delivery, and publish/release tooling under the `laive-mcp` package name (`c5b38c5`).
