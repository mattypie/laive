---
name: laive-release
description: Use when preparing, validating, or publishing a release for the laive repository. Applies the repo's AGENTS.md release policy, checks CHANGELOG.md, determines the semver bump, runs release checks, prepares versions with scripts/release.mjs, publishes npm when requested, and creates or updates the matching GitHub release from the changelog.
---

# laive-release

Use this skill only inside the `laive` repository.

## Read First

Read these files before taking release actions:

- `AGENTS.md`
- `CHANGELOG.md`
- `package.json`
- `docs/release-process.md`

## Workflow

1. Confirm whether the user wants:
   - release planning only
   - version/changelog preparation
   - actual npm publish
2. Classify the bump:
   - `major`: breaking CLI, MCP, installer, or artifact-layout changes
   - `minor`: new end-user capability or automation
   - `patch`: non-breaking fixes and clarifications
3. Ensure `CHANGELOG.md` has user-visible bullets under `## Unreleased`.
4. Ensure the changelog uses the repository format:
   - group entries under `### Features`, `### Fixes`, and `### Maintenance`
   - keep bullets terse
   - include one or more concrete commit refs in backticks for every bullet
5. Run dry-run release planning first:

```sh
node ./scripts/release.mjs prepare <patch|minor|major> --json
```

6. Run release checks before applying:

```sh
node ./scripts/release.mjs check
```

7. When the user explicitly wants release prep applied:

```sh
node ./scripts/release.mjs prepare <patch|minor|major> --apply
```

8. After prep, summarize:
   - next version
   - changelog entries included
   - commands run
   - any remaining manual steps

## Publish

Only publish when the user explicitly asks.

Manual publish sequence:

```sh
git add CHANGELOG.md package.json packages/*/package.json
git commit -m "chore(release): vX.Y.Z"
git tag vX.Y.Z
npm publish --access public
```

After npm publish and tag push, create or update the GitHub release for the same version. Use the matching `CHANGELOG.md` section as the release body.

Example flow:

```sh
gh release view vX.Y.Z || gh release create vX.Y.Z --title "vX.Y.Z" --notes-file /tmp/laive-vX.Y.Z-release-notes.md
```

If the release already exists, use:

```sh
gh release edit vX.Y.Z --title "vX.Y.Z" --notes-file /tmp/laive-vX.Y.Z-release-notes.md
```

## Required Notes

- Default to dry-run behavior unless the user explicitly asks to apply or publish.
- Do not skip `CHANGELOG.md`.
- Keep the changelog grouped by `Features` / `Fixes` / `Maintenance` for both `## Unreleased` and versioned sections.
- Keep changelog bullets terse and commit-referenced.
- If install steps or support posture changed, update the relevant docs in the same change.
- When a release is published, do not stop after npm. Confirm the matching GitHub release exists and is populated from the changelog.
