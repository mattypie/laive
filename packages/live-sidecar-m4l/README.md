# `@laive/live-sidecar-m4l`

This package contains the source assets and shipped `.amxd` for the `laive` Max MIDI Effect sidecar project.

What is included:

- a testable Node-side runtime core under `src/`
- a source Max project under `project/`
- a Node for Max entry script at `project/code/laive-sidecar-node.js`
- a `jsui` banner renderer at `project/code/laive-sidecar-banner.js`
- a patcher source file at `project/patchers/laive-sidecar.maxpat`
- bundled branding assets at `project/assets/logo.png` and `project/assets/logo.txt`
- a shipped Max for Live device at `device/laive-sidecar.amxd`
- a staging helper that copies the sidecar project into a portable folder for delivery

This package does **not** generate a finished `.amxd` automatically. The deliverable here is the importable source project and patcher assets that can be opened in Max / Max for Live, inspected, and saved as a device by the user.

The sidecar is intentionally optional. The primary Ableton control path lives in the Python Remote Script bridge. The sidecar is for workflows that are better from inside the Live set, such as selected-context snapshots, selected-device observation, and future selected-clip transforms.

Think of the two roles this way:

- control-surface bridge: app-level control, broad state reads, clip or scene creation, note editing, transport, Session View launch, browser-backed device loading
- sidecar: in-set helper for selected-context, device-local, or future analysis-oriented workflows that benefit from living on a track

## Layout

- `src/contracts.js`
- `src/workflows.js`
- `src/runtime.js`
- `src/package-sidecar.js`
- `project/laive-sidecar.maxproj`
- `project/patchers/laive-sidecar.maxpat`
- `project/code/laive-sidecar-node.js`
- `project/assets/logo.png`
- `project/assets/logo.txt`
- `project/data/laive-sidecar.manifest.json`
- `device/laive-sidecar.amxd`

## Package The Source Project

From this package directory:

```sh
npm test
npm run package:project
```

The staging helper copies the source project into the repository-level `artifacts/live-sidecar-m4l/`.

## Manual Max For Live Steps

1. Preferred end-user path: use the shipped `device/laive-sidecar.amxd`, or let the MCP tool `ensure_sidecar_on_track` try bridge-native browser placement first and then fall back to the optional helper path when needed.
2. Developer path: open the staged `laive-sidecar/laive-sidecar.maxproj` in Max if you need the source project.
3. Open `laive-sidecar/patchers/laive-sidecar.maxpat` if you need the source patcher.
4. Confirm the `node.script` object points at `../code/laive-sidecar-node.js`.
5. Confirm the `jsui` banner object points at `../code/laive-sidecar-banner.js`.
6. The patcher renders the `laive` device banner through `jsui` in presentation mode after re-export, using `logo.png` first and falling back to the built-in ASCII art only if image loading fails.
7. Drop the `.amxd` onto a MIDI track in Live and validate context and sidecar-specific workflows.

## Roadmap

Near-term sidecar-focused work should expand beyond the current workflows into:

- selected-clip transforms
- selected-device parameter snapshot or restore
- clip-envelope inspection and editing
- lightweight track-local analysis
