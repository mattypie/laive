import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const requiredPaths = [
  "package.json",
  "agent-plans/README.md",
  "agent-plans/progress.md",
  "packages/live-bridge-remote-script/package.json",
  "packages/live-sidecar-m4l/package.json",
  "packages/state-engine/package.json",
  "packages/mcp-server/package.json",
  "packages/ui-automation/package.json",
  "packages/als-parser/package.json",
  "packages/common/package.json"
];

for (const relativePath of requiredPaths) {
  await access(path.join(root, relativePath));
}

const workspacePackageJson = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8")
);

if (!workspacePackageJson.workspaces?.includes("packages/*")) {
  throw new Error("Workspace packages/* entry is missing from package.json");
}

const packageRoot = path.join(root, "packages");
const packageEntries = await readdir(packageRoot, { withFileTypes: true });
const packageNames = packageEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

console.log("Workspace OK");
console.log(`Packages: ${packageNames.join(", ")}`);
