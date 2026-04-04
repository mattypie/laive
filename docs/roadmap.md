# Roadmap

This is the user-facing roadmap summary. The deeper execution tracker lives in:
- [`agent-plans/progress.md`](../agent-plans/progress.md)

## Current Status

- `v0.6.0` delivered the mixer and routing slice
- `v0.7.0` is in progress with the first arrangement read/control slice landed locally

## Delivered

### `v0.5.0`

- Session clip editing
- quantized parameter metadata
- enum-label parameter writes

### `v0.6.0`

- return/master mixer discovery
- return/master device targeting
- send, monitor, routing, volume, and panning control
- return-track creation
- mixer alias/discovery hardening

## Planned

### `v0.7.0`

- Arrangement View support
- arrangement-clip enumeration
- arrangement summaries
- arrangement loop and transport-region control
- arrangement editing primitives where reliably supported

Landed in the first work unit:
- arrangement clip enumeration in track details and arrangement summaries
- Arrangement transport position and loop-state readback
- arrangement loop and transport-region writes

Landed in the second work unit:
- arrangement clip creation on visible tracks
- session-to-arrangement duplication primitives
- arrangement clip movement primitives

Landed in the third work unit:
- explicit arrangement clip bound editing with start/end beat control

Landed in the fourth work unit:
- MIDI arrangement clip splitting with trimmed left/right note timing

### `v0.8.0`

- clip-envelope read/write
- deeper sidecar workflows
- selected-clip transforms
- parameter snapshots
- lightweight analysis

### `v0.9.0`

- score and sheet-music ingest research
- score-to-MIDI prototypes
- emphasis on melodic correctness over brittle direct image transcription
- likely text-first evaluation path, including projects such as:
  - `SheetVision`
  - `Werckmeister`

### `v1.0.0`

- broader ergonomics pass
- generic agent UX improvements
- unrelated editing workflows that should not expand earlier focused slices
- larger abstractions after the core surfaces are complete
