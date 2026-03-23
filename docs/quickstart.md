# Quickstart

This quickstart is for installing and using `laive` from a local source checkout. If you are using the published package, prefer `npx laive-mcp ...` instead of `node ./bin/laive.mjs ...`.

## 1. Run A Readiness Check

```sh
node ./bin/laive.mjs doctor
```

## 2. Detect Ableton Live

```sh
node ./bin/laive.mjs detect --json
```

## 3. Install The Remote Script

Dry-run first:

```sh
node ./bin/laive.mjs install --json
```

Apply the install:

```sh
node ./bin/laive.mjs install --apply
node ./bin/laive.mjs mcp-config --json
```

If you need to target a specific app bundle, pass its actual `.app` path. The path below is only an example:

```sh
node ./bin/laive.mjs install --live-app "/Applications/Ableton Live 12 Suite.app" --apply
```

This command also stages the optional Max for Live sidecar project and installs the shipped `.amxd`.

```text
artifacts/live-sidecar-m4l/laive-sidecar
```

Default installed helper path:

```text
~/Applications/laive-ui-helper.app
```

Default installed sidecar path:

```text
~/Music/Ableton/User Library/Presets/MIDI Effects/Max MIDI Effect/laive-sidecar.amxd
```

This is the default User Library path. `laive install` does not currently detect a custom User Library location configured inside Ableton Live.

## 4. Enable `laive` In Live

1. Open Ableton Live.
2. Open `Preferences`.
3. Go to `Link, Tempo & MIDI`.
4. In a `Control Surface` slot, choose `laive`.
5. If `laive` does not appear, restart Live and rerun `node ./bin/laive.mjs install --json` to confirm the target install path.

## 5. Start The MCP Server

```sh
node ./bin/laive.mjs mcp
```

The MCP surface includes:

- project, track, clip, device, and parameter reads
- tempo and transport control
- track, scene, and clip creation
- note insertion and replacement
- Session View clip and scene launch/stop control
- browser-backed device loading
- `ensure_sidecar_on_track` for guided sidecar placement, preferring bridge-native browser loading and falling back to the UI helper when needed
- optional sidecar and UI-helper workflow tools that return setup guidance if those components are not ready

Use the control-surface bridge for the main workflow. Treat the sidecar as an optional, in-set helper for selected-context, device-local, and future transform or analysis workflows.

If your MCP client needs an explicit command definition, use:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/laive/bin/laive.mjs", "mcp"]
}
```

## 6. Optional Sidecar Device

1. Use the default installed path `~/Music/Ableton/User Library/Presets/MIDI Effects/Max MIDI Effect/laive-sidecar.amxd`.
2. Preferred agent-driven path: call `ensure_sidecar_on_track` so the MCP server selects the target track and first tries bridge-native browser loading, then uses the UI helper only if the sidecar is not discoverable there.
3. Manual fallback: drag that `.amxd` onto a MIDI track in Live after the base Remote Script is working.
4. Only use the staged Max project if you need to inspect or edit the source patch.
5. The staged patcher now includes bundled logo assets and uses a `jsui` renderer for the fixed-width ASCII `laive` banner in the in-Live device UI. `logo.png` is retained as a packaged branding asset for docs and future Max rendering experiments.
6. If Live is configured to use a non-default User Library path, move or copy the installed `.amxd` into that library manually after install.

## 7. Optional Extras

- UI fallback setup: [`operator-checklist-macos.md`](./operator-checklist-macos.md)
- troubleshooting: [`troubleshooting.md`](./troubleshooting.md)
- compatibility notes: [`compatibility-matrix.md`](./compatibility-matrix.md)

## Development Verification

```sh
npm test
npm run test:python
python3 -m unittest ./scripts/remote_script_tooling_test.py
```
