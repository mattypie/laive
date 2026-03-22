#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetVersion = process.argv[2];

if (!targetVersion) {
  console.error("Usage: node ./scripts/version-workspaces.mjs <version>");
  process.exit(1);
}

const packageJsonPaths = [
  path.join(repoRoot, "package.json"),
  path.join(repoRoot, "packages", "als-parser", "package.json"),
  path.join(repoRoot, "packages", "common", "package.json"),
  path.join(repoRoot, "packages", "live-bridge-remote-script", "package.json"),
  path.join(repoRoot, "packages", "live-sidecar-m4l", "package.json"),
  path.join(repoRoot, "packages", "mcp-server", "package.json"),
  path.join(repoRoot, "packages", "state-engine", "package.json"),
  path.join(repoRoot, "packages", "ui-automation", "package.json")
];

for (const packageJsonPath of packageJsonPaths) {
  const payload = JSON.parse(await readFile(packageJsonPath, "utf8"));
  payload.version = targetVersion;
  await writeFile(`${packageJsonPath}`, `${JSON.stringify(payload, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify({ version: targetVersion, updated: packageJsonPaths }, null, 2)}\n`);
