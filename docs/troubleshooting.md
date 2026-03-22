# Troubleshooting

## Bridge Does Not Connect

Checks:

- confirm the Remote Script is installed in the correct Ableton directory
- confirm Live has selected the correct Control Surface entry
- confirm the local daemon is listening on the expected port
- confirm no stale socket process is holding the port

Suggested next actions:

- run the bridge harness directly
- inspect the latest trace logs
- restart Live after reinstalling the script

## MCP Reads Look Stale

Checks:

- inspect the current state version and last refresh time
- force `refresh_state`
- confirm the bridge is still receiving events

Possible causes:

- event subscription drift
- object topology changed outside the expected mutation path
- bridge reconnect happened without a full resnapshot

## UI Automation Fails

Checks:

- confirm macOS Accessibility permissions are granted
- confirm Ableton Live is frontmost
- confirm the current Live window matches the expected view or dialog
- capture context before retrying

Possible causes:

- Live version UI drift
- focus moved to a plugin window
- unsupported accessibility tree

## `.als` Summary Does Not Match Live

Checks:

- confirm the set was saved recently
- compare runtime state timestamp with file modification time
- inspect diff output rather than assuming either source is wrong

Expected behavior:

- `.als` summaries reflect saved state
- runtime state reflects current unsaved session state

## Release Build Fails

Checks:

- verify all package tests pass
- verify fixtures are present
- verify the compatibility matrix was updated for the target Live version
- verify release notes include known limitations
