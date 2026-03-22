import { readFileSync } from "node:fs";
import { chmod, cp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "..", "..");
const rootPackageJsonPath = path.join(repoRoot, "package.json");

function getPackageVersion() {
  return JSON.parse(readFileSync(rootPackageJsonPath, "utf8")).version;
}

export function getUiHelperBundlePaths({
  destinationRoot = path.join(repoRoot, "artifacts", "ui-helper")
} = {}) {
  const appBundleRoot = path.join(destinationRoot, "laive-ui-helper.app");
  const contentsRoot = path.join(appBundleRoot, "Contents");
  const macOsRoot = path.join(contentsRoot, "MacOS");
  const resourcesRoot = path.join(contentsRoot, "Resources");
  const executablePath = path.join(macOsRoot, "laive-ui-helper");
  const infoPlistPath = path.join(contentsRoot, "Info.plist");

  return {
    repoRoot,
    destinationRoot,
    appBundleRoot,
    contentsRoot,
    macOsRoot,
    resourcesRoot,
    executablePath,
    infoPlistPath
  };
}

export function getDefaultHelperExecutablePath() {
  return getUiHelperBundlePaths().executablePath;
}

export function getStableUiHelperInstallPaths({
  destinationRoot = path.join(os.homedir(), "Applications")
} = {}) {
  return getUiHelperBundlePaths({ destinationRoot });
}

export function buildHelperInfoPlist() {
  const packageVersion = getPackageVersion();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>laive-ui-helper</string>
  <key>CFBundleIdentifier</key>
  <string>com.laive.ui-helper</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>laive-ui-helper</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${packageVersion}</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`;
}

function shellEscapeSingleQuotes(value) {
  return String(value).replaceAll("'", `'\\''`);
}

export function buildHelperExecutableScript() {
  const frontmostScript = [
    'tell application "System Events"',
    "set frontApp to name of first application process whose frontmost is true",
    "end tell",
    "return frontApp"
  ].join("\n");

  return `#!/bin/zsh
set -euo pipefail

command="\${1:-}"
shift || true

decode_base64() {
  /usr/bin/python3 - "$1" <<'PY'
import base64
import sys
print(base64.b64decode(sys.argv[1]).decode("utf-8"), end="")
PY
}

run_script() {
  local script_content="$1"
  /usr/bin/osascript -e "$script_content"
}

case "$command" in
  run_applescript_base64)
    if [[ "$#" -lt 1 ]]; then
      echo "Missing base64 payload" >&2
      exit 64
    fi
    script_content="$(decode_base64 "$1")"
    run_script "$script_content"
    ;;
  frontmost_app)
    run_script '${shellEscapeSingleQuotes(frontmostScript)}'
    ;;
  activate_app)
    if [[ "$#" -lt 1 ]]; then
      echo "Missing app name" >&2
      exit 64
    fi
    run_script "tell application \\"$1\\" to activate"
    ;;
  *)
    echo "Unsupported command: $command" >&2
    exit 64
    ;;
esac
`;
}

export async function stageUiHelper(options = {}) {
  const paths = getUiHelperBundlePaths(options);

  await mkdir(paths.macOsRoot, { recursive: true });
  await mkdir(paths.resourcesRoot, { recursive: true });
  await writeFile(paths.infoPlistPath, buildHelperInfoPlist(), "utf8");
  await writeFile(paths.executablePath, buildHelperExecutableScript(), "utf8");
  await chmod(paths.executablePath, 0o755);

  return {
    appBundleRoot: paths.appBundleRoot,
    executablePath: paths.executablePath,
    infoPlistPath: paths.infoPlistPath
  };
}

export async function installUiHelper({
  destinationRoot = path.join(os.homedir(), "Applications"),
  dryRun = true,
  overwrite = true
} = {}) {
  const staged = await stageUiHelper();
  const installPaths = getStableUiHelperInstallPaths({ destinationRoot });

  const payload = {
    stagedAppBundleRoot: staged.appBundleRoot,
    stagedExecutablePath: staged.executablePath,
    installDestinationRoot: installPaths.destinationRoot,
    appBundleRoot: installPaths.appBundleRoot,
    executablePath: installPaths.executablePath,
    infoPlistPath: installPaths.infoPlistPath,
    dryRun,
    overwrite
  };

  if (dryRun) {
    return {
      ...payload,
      status: "dry_run"
    };
  }

  await mkdir(installPaths.destinationRoot, { recursive: true });
  if (overwrite) {
    await rm(installPaths.appBundleRoot, { recursive: true, force: true });
  }
  await cp(staged.appBundleRoot, installPaths.appBundleRoot, { recursive: true });

  return {
    ...payload,
    status: "installed"
  };
}
