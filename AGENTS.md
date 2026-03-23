# AGENTS

This repository uses a simple release discipline. Agents working here must follow it.

This file is maintainer-only guidance. It is not part of the end-user install flow.

## Changelog

- Any user-visible change must add or update a bullet under `## Unreleased` in [CHANGELOG.md](./CHANGELOG.md).
- User-visible means CLI behavior, installer behavior, MCP configuration, shipped assets, manual setup steps, supported Live behavior, or docs that change how operators use the system.
- Purely internal refactors that do not change behavior may skip the changelog.

## Semver

- `major`: breaking changes to CLI flags, installer behavior, MCP tool surface, shipped artifact layout, or required manual steps.
- `minor`: new end-user commands, new install automation, new sidecar/helper delivery, or new supported workflows.
- `patch`: bug fixes, non-breaking behavior fixes, docs clarifications, and internal maintenance.

## Release Prep

- Do not cut a release unless the user explicitly asks.
- Default to dry-run for release tooling.
- Use the root repo version in `package.json` as the canonical release version.
- Keep workspace package versions in lockstep with the root version.
- Before preparing a release, run:
  - `npm test`
  - `npm run test:python`
  - `npm run test:delivery`
  - `node ./bin/laive.mjs doctor --json`
  - `node ./bin/laive.mjs package --json`
  - `node ./bin/laive.mjs install --json`
  - `npm pack --dry-run`

## Release Mechanics

- Use `node ./scripts/release.mjs prepare <patch|minor|major>` for dry-run planning.
- Use `node ./scripts/release.mjs prepare <patch|minor|major> --apply` to update versions and finalize the changelog.
- Release commit format: `chore(release): vX.Y.Z`
- Release tag format: `vX.Y.Z`
- After tagging and publishing, create or update the matching GitHub release from the `CHANGELOG.md` section for that version.

## Compatibility And Docs

- If install flow or support posture changes, update:
  - `README.md`
  - `docs/quickstart.md`
  - `docs/operator-checklist-macos.md`
  - `docs/compatibility-matrix.md` when compatibility claims change
  - `agent-plans/progress.md` when plan state materially changes
