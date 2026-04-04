# laive

![laive logo](./logo.png)

`laive-mcp` is an MCP server and install toolchain for controlling Ableton Live through a real Live bridge.

The published npm package is `laive-mcp`.
The Ableton Control Surface name is `laive`.

## What It Is

`laive` gives an agent a bridge-backed way to inspect and control a running Live set.

It installs:
- a Python Remote Script into Ableton Live
- an MCP stdio server agents can launch with `npx`
- an optional Max for Live sidecar
- an optional macOS UI helper for fallback workflows

## Key Features

Grouped capability summary:
- Project and set reads: project summary, selected context, tracks, clips, devices, parameters
- Arrangement workflows: arrangement summaries, arrangement loop and transport-region control, and arrangement-clip editing primitives including trim, move, and split
- Session workflows: create clips and scenes, edit notes, launch clips and scenes, stop clip playback
- Mixer and routing: return/master discovery, send levels, monitor state, routing, return-track creation
- Device workflows: browser-backed device loading, parameter writes, enum-label targeting where metadata exists
- Optional helpers: sidecar placement and sidecar/UI-helper workflow setup guidance

Full feature breakdown:
- [Features](./docs/features.md)

## Install And Try It

Prerequisites:
- macOS
- Ableton Live 11 or newer
- Node 18.16 or newer
- `python3` on `PATH`

Install the bridge and helper artifacts:

```sh
npx -y laive-mcp@latest doctor
npx -y laive-mcp@latest install --apply
```

Then in Ableton Live:
1. Open `Preferences`.
2. Go to `Link, Tempo & MIDI`.
3. In a `Control Surface` slot, choose `laive`.

To add `laive` to an MCP client, use:

```json
{
  "command": "npx",
  "args": ["-y", "laive-mcp@latest", "mcp"]
}
```

You can print the published MCP config from the CLI:

```sh
npx -y laive-mcp@latest mcp-config --json --published
```

More install details, optional sidecar/UI-helper setup, and troubleshooting:
- [Features](./docs/features.md)
- [Troubleshooting](./docs/troubleshooting.md)

## Roadmap

Current planned work is tracked here:
- [Roadmap](./docs/roadmap.md)

## Contributing

For local setup, source-checkout usage, tests, and more technical docs:
- [Contributing](./docs/contributing.md)
