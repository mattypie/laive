# `@laive/live-sidecar-m4l`

This package contains the source assets and shipped `.amxd` for the `laive` Max MIDI Effect sidecar project.

What is included:

- a testable Node-side runtime core under `src/`
- a source Max project under `project/`
- a Node for Max entry script at `project/code/laive-sidecar-node.js`
- a patcher source file at `project/patchers/laive-sidecar.maxpat`
- a shipped Max for Live device at `device/laive-sidecar.amxd`
- a staging helper that copies the sidecar project into a portable folder for delivery

This package does **not** generate a finished `.amxd` automatically. The deliverable here is the importable source project and patcher assets that can be opened in Max / Max for Live, inspected, and saved as a device by the user.

## Layout

- `src/contracts.js`
- `src/workflows.js`
- `src/runtime.js`
- `src/package-sidecar.js`
- `project/laive-sidecar.maxproj`
- `project/patchers/laive-sidecar.maxpat`
- `project/code/laive-sidecar-node.js`
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

1. Preferred end-user path: use the shipped `device/laive-sidecar.amxd`.
2. Developer path: open the staged `laive-sidecar/laive-sidecar.maxproj` in Max if you need the source project.
3. Open `laive-sidecar/patchers/laive-sidecar.maxpat` if you need the source patcher.
4. Confirm the `node.script` object points at `../code/laive-sidecar-node.js`.
5. Drop the `.amxd` onto a MIDI track in Live and validate transport, context, and note workflows.
