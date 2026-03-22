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
- note insertion
- optional sidecar and UI-helper workflow tools that return setup guidance if those components are not ready

If your MCP client needs an explicit command definition, use:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/laive/bin/laive.mjs", "mcp"]
}
```

## 6. Optional Sidecar Device

1. Use the default installed path `~/Music/Ableton/User Library/Presets/MIDI Effects/Max MIDI Effect/laive-sidecar.amxd`.
2. Drag that `.amxd` onto a MIDI track in Live after the base Remote Script is working.
3. Only use the staged Max project if you need to inspect or edit the source patch.

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
