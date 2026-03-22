#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const changelogPath = path.join(repoRoot, "CHANGELOG.md");
const packageJsonPath = path.join(repoRoot, "package.json");
const versionScriptPath = path.join(repoRoot, "scripts", "version-workspaces.mjs");

function parseArgs(argv) {
  const [command, bump, ...rest] = argv;
  return {
    command,
    bump,
    apply: rest.includes("--apply"),
    json: rest.includes("--json"),
    skipChecks: rest.includes("--skip-checks")
  };
}

function bumpVersion(version, bump) {
  const [major, minor, patch] = version.split(".").map((part) => Number.parseInt(part, 10));
  if (bump === "major") {
    return `${major + 1}.0.0`;
  }
  if (bump === "minor") {
    return `${major}.${minor + 1}.0`;
  }
  if (bump === "patch") {
    return `${major}.${minor}.${patch + 1}`;
  }
  throw new Error(`Unsupported bump type: ${bump}`);
}

async function readCurrentVersion() {
  return JSON.parse(await readFile(packageJsonPath, "utf8")).version;
}

async function readChangelog() {
  return readFile(changelogPath, "utf8");
}

function parseUnreleasedSection(changelog) {
  const match = changelog.match(/## Unreleased\s+([\s\S]*?)(\n## |\s*$)/);
  if (!match) {
    throw new Error("CHANGELOG.md is missing a ## Unreleased section.");
  }
  const body = match[1].trimEnd();
  const entries = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));

  return {
    match,
    body,
    entries
  };
}

function finalizeChangelog(changelog, nextVersion, releaseDate) {
  const unreleased = parseUnreleasedSection(changelog);
  if (unreleased.entries.length === 0) {
    throw new Error("CHANGELOG.md has no unreleased bullet entries.");
  }

  const replacement = [
    "## Unreleased",
    "",
    `## v${nextVersion} - ${releaseDate}`,
    "",
    ...unreleased.entries,
    ""
  ].join("\n");

  return changelog.replace(/## Unreleased\s+([\s\S]*?)(\n## |\s*$)/, `${replacement}$2`);
}

function runCommand(command, args) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit"
  });
}

function runReleaseChecks() {
  const commands = [
    ["npm", ["test"]],
    ["npm", ["run", "test:python"]],
    ["npm", ["run", "test:delivery"]],
    ["node", ["./bin/laive.mjs", "doctor", "--json"]],
    ["node", ["./bin/laive.mjs", "package", "--json"]],
    ["node", ["./bin/laive.mjs", "install", "--json"]],
    ["npm", ["pack", "--dry-run"]]
  ];

  for (const [command, args] of commands) {
    runCommand(command, args);
  }

  return commands.map(([command, args]) => `${command} ${args.join(" ")}`);
}

async function handleCheck({ json }) {
  const commands = runReleaseChecks();
  const payload = {
    status: "ok",
    commands
  };

  process.stdout.write(
    json ? `${JSON.stringify(payload, null, 2)}\n` : `Release checks passed.\n${commands.join("\n")}\n`
  );
}

async function handlePrepare({ bump, apply, json, skipChecks }) {
  if (!bump) {
    throw new Error("Usage: node ./scripts/release.mjs prepare <patch|minor|major> [--apply]");
  }

  const currentVersion = await readCurrentVersion();
  const nextVersion = bumpVersion(currentVersion, bump);
  const releaseDate = new Date().toISOString().slice(0, 10);
  const changelog = await readChangelog();
  const unreleased = parseUnreleasedSection(changelog);

  const payload = {
    currentVersion,
    nextVersion,
    bump,
    apply,
    unreleasedEntries: unreleased.entries
  };

  if (!apply) {
    process.stdout.write(
      json
        ? `${JSON.stringify(payload, null, 2)}\n`
        : `Would prepare v${nextVersion} from ${currentVersion} (${bump}).\n`
    );
    return;
  }

  if (!skipChecks) {
    runReleaseChecks();
  }

  runCommand("node", [versionScriptPath, nextVersion]);
  await writeFile(changelogPath, `${finalizeChangelog(changelog, nextVersion, releaseDate)}\n`);

  const result = {
    ...payload,
    status: "prepared",
    releaseDate
  };

  process.stdout.write(
    json ? `${JSON.stringify(result, null, 2)}\n` : `Prepared v${nextVersion}.\n`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "check") {
    await handleCheck(args);
    return;
  }
  if (args.command === "prepare") {
    await handlePrepare(args);
    return;
  }

  throw new Error("Usage: node ./scripts/release.mjs <check|prepare> [args]");
}

await main();
