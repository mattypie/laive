#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const pythonScript = path.join(repoRoot, "scripts", "remote_script_tooling.py");
const sidecarPackageScript = path.join(
  repoRoot,
  "packages",
  "live-sidecar-m4l",
  "src",
  "package-sidecar.js"
);
const mcpCliScript = path.join(repoRoot, "packages", "mcp-server", "src", "cli.js");
const uiHelperPackageScript = path.join(repoRoot, "scripts", "package-ui-helper.mjs");
const uiHelperInstallScript = path.join(repoRoot, "scripts", "install-ui-helper.mjs");
const sidecarInstallScript = path.join(
  repoRoot,
  "packages",
  "live-sidecar-m4l",
  "src",
  "install-sidecar-device.js"
);

function printHelp() {
  console.log(`laive-mcp

Usage:
  laive-mcp doctor [--json]
  laive-mcp detect [--json]
  laive-mcp package [--json]
  laive-mcp install [--live-app PATH] [--apply] [--overwrite] [--json]
  laive-mcp mcp [--host HOST] [--port PORT] [--fixture]
  laive-mcp mcp-config [--json] [--local|--published]
  laive-mcp package-ui-helper [--json]
  laive-mcp help

Examples:
  node ./bin/laive.mjs doctor
  node ./bin/laive.mjs detect --json
  node ./bin/laive.mjs install --apply
  node ./bin/laive.mjs mcp
  node ./bin/laive.mjs mcp-config --json --published
  node ./bin/laive.mjs package-ui-helper --json
  npx laive-mcp install --apply
`);
}

function resolvePythonBinary() {
  return process.env.PYTHON || "python3";
}

function ensureExists(targetPath) {
  if (!existsSync(targetPath)) {
    throw new Error(`Missing required file: ${targetPath}`);
  }
}

function runJsonCommand(command, args, { cwd = repoRoot } = {}) {
  const output = execFileSync(command, args, {
    cwd,
    encoding: "utf8"
  });
  return JSON.parse(output);
}

function runPythonJson(subcommand, args = []) {
  ensureExists(pythonScript);
  return runJsonCommand(resolvePythonBinary(), [pythonScript, subcommand, "--json", ...args]);
}

function runSidecarPackage() {
  ensureExists(sidecarPackageScript);
  return runJsonCommand("node", [sidecarPackageScript]);
}

function runUiHelperPackage() {
  ensureExists(uiHelperPackageScript);
  return runJsonCommand("node", [uiHelperPackageScript]);
}

function runUiHelperInstall(args = []) {
  ensureExists(uiHelperInstallScript);
  return runJsonCommand("node", [uiHelperInstallScript, ...args]);
}

function runSidecarInstall(args = []) {
  ensureExists(sidecarInstallScript);
  return runJsonCommand("node", [sidecarInstallScript, ...args]);
}

function getLocalMcpConfig() {
  return {
    command: "node",
    args: [path.join(repoRoot, "bin", "laive.mjs"), "mcp"]
  };
}

function getPublishedMcpConfig() {
  return {
    command: "npx",
    args: ["-y", "laive-mcp", "mcp"]
  };
}

function shouldEmitJson(args) {
  return args.includes("--json");
}

function printPayload(payload, asJson = false) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function handleDoctor(args) {
  const remote = runPythonJson("doctor");
  const sidecar = {
    source_project_root: path.join(
      repoRoot,
      "packages",
      "live-sidecar-m4l",
      "project"
    ),
    source_project_exists: existsSync(
      path.join(repoRoot, "packages", "live-sidecar-m4l", "project", "laive-sidecar.maxproj")
    ),
    staged_project_root: path.join(
      repoRoot,
      "artifacts",
      "live-sidecar-m4l",
      "laive-sidecar"
    ),
    staged_project_exists: existsSync(
      path.join(
        repoRoot,
        "artifacts",
        "live-sidecar-m4l",
        "laive-sidecar",
        "laive-sidecar.maxproj"
      )
    ),
    prebuilt_device_path: path.join(repoRoot, "packages", "live-sidecar-m4l", "device", "laive-sidecar.amxd"),
    prebuilt_device_exists: existsSync(
      path.join(repoRoot, "packages", "live-sidecar-m4l", "device", "laive-sidecar.amxd")
    ),
    staged_device_path: path.join(repoRoot, "artifacts", "live-sidecar-m4l", "laive-sidecar.amxd"),
    staged_device_exists: existsSync(
      path.join(repoRoot, "artifacts", "live-sidecar-m4l", "laive-sidecar.amxd")
    ),
    installed_device_path: path.join(
      process.env.HOME ?? "",
      "Music",
      "Ableton",
      "User Library",
      "Presets",
      "MIDI Effects",
      "Max MIDI Effect",
      "laive-sidecar.amxd"
    ),
    installed_device_exists: existsSync(
      path.join(
        process.env.HOME ?? "",
        "Music",
        "Ableton",
        "User Library",
        "Presets",
        "MIDI Effects",
        "Max MIDI Effect",
        "laive-sidecar.amxd"
      )
    )
  };

  const payload = {
    ...remote,
    sidecar,
    ui_helper: {
      app_bundle_root: path.join(repoRoot, "artifacts", "ui-helper", "laive-ui-helper.app"),
      executable_path: path.join(
        repoRoot,
        "artifacts",
        "ui-helper",
        "laive-ui-helper.app",
        "Contents",
        "MacOS",
        "laive-ui-helper"
      ),
      app_bundle_exists: existsSync(
        path.join(repoRoot, "artifacts", "ui-helper", "laive-ui-helper.app")
      ),
      installed_app_bundle_root: path.join(
        process.env.HOME ?? "",
        "Applications",
        "laive-ui-helper.app"
      ),
      installed_app_bundle_exists: existsSync(
        path.join(process.env.HOME ?? "", "Applications", "laive-ui-helper.app")
      )
    },
    ready_for_install:
      remote.ready_for_install && sidecar.source_project_exists
  };
  printPayload(payload, shouldEmitJson(args));
}

function handleDetect(args) {
  const payload = runPythonJson("detect");
  printPayload(payload, shouldEmitJson(args));
}

function handlePackage(args) {
  const remoteScript = runPythonJson("package");
  const sidecar = runSidecarPackage();
  const uiHelper = runUiHelperPackage();
  printPayload(
    {
      remote_script: remoteScript,
      sidecar,
      ui_helper: uiHelper
    },
    shouldEmitJson(args)
  );
}

function handleInstall(args) {
  const passthroughArgs = args.filter((arg) => arg !== "--json");
  const remoteScript = runPythonJson("install", passthroughArgs);
  const sidecar = runSidecarPackage();
  const sidecarInstall = runSidecarInstall(passthroughArgs);
  const uiHelper = runUiHelperPackage();
  const uiHelperInstall = runUiHelperInstall(passthroughArgs);
  printPayload(
    {
      remote_script: remoteScript,
      sidecar: {
        ...sidecar,
        installPayload: sidecarInstall
      },
      ui_helper: {
        ...uiHelper,
        installPayload: uiHelperInstall
      },
      next_steps: [
        "Open Ableton Live.",
        "Enable 'laive' in Preferences > Link, Tempo & MIDI > Control Surface.",
        "If you want the optional Max for Live sidecar, use the installed laive-sidecar.amxd from the default Ableton User Library path or the staged .amxd in this output.",
        "If you want UI fallback features, grant Accessibility permission to the installed laive-ui-helper.app in ~/Applications."
      ]
    },
    true
  );
}

function handlePackageUiHelper(args) {
  const payload = runUiHelperPackage();
  printPayload(payload, shouldEmitJson(args));
}

function handleMcpConfig(args) {
  const preferPublished = args.includes("--published");
  const preferLocal = args.includes("--local");
  const payload = {
    local: getLocalMcpConfig(),
    published: getPublishedMcpConfig(),
    recommended: preferLocal ? getLocalMcpConfig() : getPublishedMcpConfig(),
    defaultMode: preferPublished ? "published" : preferLocal ? "local" : "published"
  };

  printPayload(payload, shouldEmitJson(args));
}

function handleMcp(args) {
  ensureExists(mcpCliScript);
  const result = spawnSync("node", [mcpCliScript, ...args], {
    cwd: repoRoot,
    stdio: "inherit"
  });

  if (typeof result.status === "number") {
    return result.status;
  }

  if (result.error) {
    throw result.error;
  }

  return 1;
}

function main(argv = process.argv.slice(2)) {
  const [command = "help", ...rest] = argv;

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  try {
    switch (command) {
      case "doctor":
        handleDoctor(rest);
        return 0;
      case "detect":
        handleDetect(rest);
        return 0;
      case "package":
        handlePackage(rest);
        return 0;
      case "install":
        handleInstall(rest);
        return 0;
      case "mcp":
        return handleMcp(rest);
      case "mcp-config":
        handleMcpConfig(rest);
        return 0;
      case "package-ui-helper":
        handlePackageUiHelper(rest);
        return 0;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        return 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

process.exit(main());
