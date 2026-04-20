import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseScriptPath = path.join(repoRoot, "scripts", "release.mjs");
const versionScriptPath = path.join(repoRoot, "scripts", "version-workspaces.mjs");
const packageVersion = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;

function nextPatchVersion(version) {
  const [major, minor, patch] = version.split(".").map((part) => Number.parseInt(part, 10));
  return `${major}.${minor}.${patch + 1}`;
}

test("release prepare dry-run reports next patch version", () => {
  const output = execFileSync("node", [releaseScriptPath, "prepare", "patch", "--json"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const payload = JSON.parse(output);

  assert.equal(payload.currentVersion, packageVersion);
  assert.equal(payload.nextVersion, nextPatchVersion(packageVersion));
  assert.equal(payload.bump, "patch");
  assert.equal(payload.apply, false);
  assert.ok(Array.isArray(payload.unreleasedEntries));
  assert.ok(payload.unreleasedEntries.every((entry) => typeof entry === "string"));
});

test("release prepare apply preserves grouped changelog sections", () => {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "laive-release-test-"));
  try {
    mkdirSync(path.join(fixtureRoot, "scripts"), { recursive: true });
    for (const workspaceName of [
      "als-parser",
      "common",
      "live-bridge-remote-script",
      "live-sidecar-m4l",
      "mcp-server",
      "state-engine",
      "ui-automation"
    ]) {
      mkdirSync(path.join(fixtureRoot, "packages", workspaceName), { recursive: true });
      writeFileSync(
        path.join(fixtureRoot, "packages", workspaceName, "package.json"),
        `${JSON.stringify({ name: `@laive/${workspaceName}`, version: "0.7.0" }, null, 2)}\n`
      );
    }
    writeFileSync(path.join(fixtureRoot, "scripts", "release.mjs"), readFileSync(releaseScriptPath));
    writeFileSync(path.join(fixtureRoot, "scripts", "version-workspaces.mjs"), readFileSync(versionScriptPath));
    writeFileSync(
      path.join(fixtureRoot, "package.json"),
      `${JSON.stringify({ name: "laive-mcp", version: "0.7.0" }, null, 2)}\n`
    );
    writeFileSync(
      path.join(fixtureRoot, "CHANGELOG.md"),
      [
        "# Changelog",
        "",
        "## Unreleased",
        "",
        "### Features",
        "",
        "- Add grouped feature (`abc1234`).",
        "",
        "### Fixes",
        "",
        "- Fix grouped bug (`def5678`).",
        "",
        "### Maintenance",
        "",
        "- Keep grouped maintenance (`fedcba9`).",
        "",
        "## v0.7.0 - 2026-04-05",
        "",
        "### Features",
        "",
        "- Previous release (`1111111`).",
        ""
      ].join("\n")
    );

    execFileSync("node", ["./scripts/release.mjs", "prepare", "minor", "--apply", "--skip-checks"], {
      cwd: fixtureRoot
    });

    const changelog = readFileSync(path.join(fixtureRoot, "CHANGELOG.md"), "utf8");
    assert.match(changelog, /## Unreleased\n\n### Features\n\n### Fixes\n\n### Maintenance/);
    assert.match(changelog, /## v0\.8\.0 - \d{4}-\d{2}-\d{2}\n\n### Features\n\n- Add grouped feature/);
    assert.match(changelog, /### Fixes\n\n- Fix grouped bug/);
    assert.match(changelog, /### Maintenance\n\n- Keep grouped maintenance/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
