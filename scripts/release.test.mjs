import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseScriptPath = path.join(repoRoot, "scripts", "release.mjs");
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
  assert.ok(payload.unreleasedEntries.length >= 1);
});
