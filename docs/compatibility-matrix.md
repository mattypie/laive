# Compatibility Matrix

This matrix defines the intended support posture. It should be updated on every release candidate.

| Component | macOS | Windows | Live 11.x | Live 12.x | Notes |
| --- | --- | --- | --- | --- | --- |
| Remote Script bridge | target | planned | best effort | primary | Version-specific API drift expected. |
| Max for Live sidecar | target | planned | best effort | primary | Depends on sidecar device implementation maturity. |
| State engine | target | target | primary | primary | Runtime-independent Node layer. |
| MCP server | target | target | primary | primary | Runtime-independent Node layer. |
| UI automation | primary | unsupported | best effort | primary | First implementation is macOS Accessibility only. |
| `.als` parser | target | target | primary | primary | Saved-set schema may vary by version. |

## Versioning Policy

- Treat Live 12.x as the primary support target until real-world Live 11 validation improves.
- Treat Live 11.x as usable for core bridge, state, and Max note-editing flows, but not as the preferred baseline for new feature work.
- Prefer Live 12.3+ if you want to rely on newer Live Object Model insertion functions.
- Require an explicit compatibility review when a new major Live version is released.
- Prefer capability-based gating over hard-coded version branching where feasible.

## Release Gate For Version Updates

Before claiming support for a new Live version:

1. Verify bridge handshake and capability discovery.
2. Run scenario fixtures against the target version.
3. Validate UI fallback workflows against the target version.
4. Update known limitations and troubleshooting notes.
