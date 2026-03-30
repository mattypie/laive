# Release Process

`laive` publishes to npm as `laive-mcp` and uses one root version plus one changelog.

## Version Policy

- The root `package.json` version is the public release version.
- Workspace package versions stay aligned with the root version.
- `CHANGELOG.md` keeps all pending user-visible changes under `## Unreleased`.
- `CHANGELOG.md` groups entries under `### Features`, `### Fixes`, and `### Maintenance`.
- Changelog bullets should be terse and should include concrete commit refs such as ``(`abc1234`)``.

## Release Checks

Run:

```sh
npm test
npm run test:python
npm run test:delivery
node ./bin/laive.mjs doctor --json
node ./bin/laive.mjs package --json
node ./bin/laive.mjs install --json
npm pack --dry-run
```

## Prepare A Release

Dry-run:

```sh
node ./scripts/release.mjs prepare patch
```

Apply:

```sh
node ./scripts/release.mjs prepare patch --apply
```

That will:

1. determine the next version
2. update the root and workspace `package.json` versions
3. move `CHANGELOG.md` entries from `## Unreleased` into a dated `## vX.Y.Z` section
4. reset `## Unreleased` for continued development

Keep the grouped changelog structure when you do this:

```md
## Unreleased

### Features
- ...

### Fixes
- ...

### Maintenance
- ...
```

## Publish

After release prep:

```sh
git add CHANGELOG.md package.json packages/*/package.json
git commit -m "chore(release): vX.Y.Z"
git tag vX.Y.Z
npm publish --access public
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file /tmp/laive-vX.Y.Z-release-notes.md
```

If you also publish from CI, mirror the same version and tag format there.

Generate the GitHub release notes from the matching `CHANGELOG.md` section for that version. If the tag already has a release entry, use `gh release edit` instead of `gh release create`.

## Repo-Local Skill

A repo-local Codex release skill lives at:

```text
skills/laive-release/SKILL.md
```

Use it when you want an agent to follow this repository's release policy and scripted workflow.

## Manual Requirements

- npm account and `npm login`
- any required npm 2FA or token setup
- if publishing from CI, an `NPM_TOKEN` secret
- manual macOS Accessibility approval remains required for the UI helper
