# Operator Checklist For macOS And Ableton Live

This is a maintainer/operator validation checklist, not the primary end-user install guide. It covers the manual steps that remain after the `laive` installer has done everything it can automate.

## Recommended Starting Point

- macOS
- Ableton Live 12.x preferred
- Live 11.x acceptable for a first real bridge if you do not need the newest Live Object Model functions
- Live Suite recommended, or Live Standard plus a Max for Live license

## 1. Confirm Your Live And Max Setup

1. Open Ableton Live.
2. Confirm the exact Live version in Live -> About Live.
3. Confirm Max for Live is available:
   - Live Suite includes it.
   - Live Standard requires a separate Max for Live license.
4. If you are on Live 11, confirm Max 8 is available.
5. If you are on Live 12, confirm bundled Max is available and note whether you are using the bundled Max or a separate Max install.

## 2. Choose The Initial Support Target

Pick one of these and stay on it until the first real bridge is stable:

- `Live 12.x (Recommended)`: best path for long-term support and newer API surface
- `Live 11.x`: acceptable if you only need the core bridge, state mirror, note editing, and parameter control

Do not try to validate both major versions at once in the first real integration pass.

## 3. Run The Installer First

1. Keep the repository at your local clone path.
2. From the repo root, run:

```sh
node ./bin/laive.mjs doctor
node ./bin/laive.mjs install --json
```

3. If the preview looks correct, apply it:

```sh
node ./bin/laive.mjs install --apply
```

That install also stages the optional sidecar source project into:

```text
<repo-root>/artifacts/live-sidecar-m4l/laive-sidecar
```

It also installs to these default targets:

```text
~/Applications/laive-ui-helper.app
~/Music/Ableton/User Library/Presets/MIDI Effects/Max MIDI Effect/laive-sidecar.amxd
```

## 4. Enable The Remote Script In Live

1. Restart Ableton Live after install.
2. Open `Preferences`.
3. Go to `Link, Tempo & MIDI`.
4. In a `Control Surface` slot, select `laive`.
5. Confirm Live does not show an immediate load error.

Operator validation:

- the script starts when Live launches
- the bridge reports a successful `hello`
- `capabilities` returns real values, not fixture values

## 5. Capture The First Real Handshake

After the Remote Script is installed:

1. Start the MCP server:

```sh
node ./bin/laive.mjs mcp
```

2. Record the first successful handshake.
3. Save a sample trace under [`fixtures/traces`](../fixtures/traces) once the real protocol stabilizes.

Minimum validation sequence:

1. `hello`
2. `capabilities`
3. `health`
4. `get song`
5. `get tracks`
6. `get scenes`
7. `get_component_status`

## 6. Validate Core Runtime Reads

In a small test set, confirm the real bridge can read:

1. song name and tempo
2. play/stop state
3. visible tracks
4. return tracks
5. scenes
6. session clips for at least one track
7. device list for at least one track
8. parameters for at least one device

Record mismatches between Live object names and the current normalized schema.

## 7. Validate Core Runtime Writes

Use a disposable test set.

Run these in order:

1. set tempo
2. create MIDI track
3. create scene
4. create session clip
5. insert notes into the new clip
6. set one device parameter
7. play and stop transport
8. confirm optional sidecar/UI-helper tools either execute or return setup guidance

For each write:

1. capture the bridge response
2. force a state refresh
3. confirm MCP and state engine reflect the actual result inside Live

## 8. Optional Sidecar Device

If you want the optional Max for Live sidecar features, use the installed `.amxd` after the base Remote Script install is working.

1. Open the default installed device at `~/Music/Ableton/User Library/Presets/MIDI Effects/Max MIDI Effect/laive-sidecar.amxd` in Live's browser or Finder.
2. Drag it onto a MIDI track in a test Live set.
3. Use the staged source project only if you need to edit the sidecar implementation in Max.

## 9. Grant macOS Accessibility Permissions

For UI fallback work:

1. Open System Settings -> Privacy & Security -> Accessibility.
2. Grant permission to the default installed helper app at `~/Applications/laive-ui-helper.app`.
3. Restart the process after changing permissions.

Use [`packages/ui-automation`](../packages/ui-automation) only after runtime bridge operations are working.

## 10. Validate UI Fallback Flows

Use a stable Live theme and window layout.

First validate only:

1. focus Live window
2. open export dialog
3. run one menu command
4. perform one browser search and load operation

For each failure:

1. save diagnostics
2. note the visible label or role mismatch
3. update the workflow definitions instead of hard-coding one-off hacks

## 11. Run End-To-End MCP Validation

Once the real bridge is active, run a full vertical slice:

1. `get_project_summary`
2. `list_tracks`
3. `get_track_details`
4. `set_tempo`
5. `create_track`
6. `create_clip`
7. `set_parameter`
8. `create_scene`
9. `insert_notes`
10. `get_component_status`
11. optional `run_ui_workflow`
12. optional `run_sidecar_workflow`

The expected result is:

- MCP tool success
- correct post-write state refresh
- matching state inside the Live UI

## 12. Record Real Fixtures

After the first successful real session:

1. add a real trace fixture
2. add a small real scenario fixture
3. update docs to distinguish fixture-backed vs real-Live validated behavior

Do not overwrite the synthetic fixtures; keep both.

## 13. Update Support Posture

After your first real validation pass:

1. update [`docs/compatibility-matrix.md`](./compatibility-matrix.md)
2. update [`agent-plans/progress.md`](../agent-plans/progress.md)
3. add any unsupported operations to [`docs/troubleshooting.md`](./troubleshooting.md)

## 14. Recommended First Acceptance Threshold

You can treat the first real implementation pass as successful when all of these are true:

1. the Remote Script loads reliably in one target Live version
2. the bridge returns real project state
3. the state engine mirrors that state correctly
4. MCP can complete the core write workflow on a disposable set
5. at least one UI fallback flow works on macOS
6. one real trace is captured and replayable
