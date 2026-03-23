import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.join(packageRoot, "project");
const prebuiltDevicePath = path.join(packageRoot, "device", "laive-sidecar.amxd");
const repoRoot = path.resolve(packageRoot, "..", "..");
const defaultUserLibraryRoot = path.join(
  os.homedir(),
  "Music",
  "Ableton",
  "User Library",
  "Presets",
  "MIDI Effects",
  "Max MIDI Effect"
);

export function getProjectManifest() {
  return {
    name: "laive-sidecar",
    patcher: "patchers/laive-sidecar.maxpat",
    nodeScript: "code/laive-sidecar-node.js",
    projectFile: "laive-sidecar.maxproj",
    assets: ["assets/logo.png", "assets/logo.txt"],
    prebuiltDevice: path.relative(packageRoot, prebuiltDevicePath),
    note: "Source project only. Open in Max / Max for Live and save as a device.",
    uiIntent: "Branded in-Live sidecar with bundled logo assets and a readable fallback banner."
  };
}

export async function readProjectManifestFile() {
  const manifestPath = path.join(projectRoot, "data", "laive-sidecar.manifest.json");
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

export async function stageSidecarProject({
  destinationRoot = path.join(repoRoot, "artifacts", "live-sidecar-m4l")
} = {}) {
  const manifest = getProjectManifest();
  const stagedProjectRoot = path.join(destinationRoot, manifest.name);
  const legacyProjectRoot = path.join(destinationRoot, "laive-sidecar-project");
  const stagedDevicePath = path.join(destinationRoot, "laive-sidecar.amxd");
  await mkdir(destinationRoot, { recursive: true });
  await rm(stagedProjectRoot, { recursive: true, force: true });
  await rm(legacyProjectRoot, { recursive: true, force: true });
  await rm(stagedDevicePath, { force: true });
  await cp(projectRoot, stagedProjectRoot, { recursive: true });
  const prebuiltDeviceExists = await readFile(prebuiltDevicePath).then(
    () => true,
    () => false
  );
  if (prebuiltDeviceExists) {
    await cp(prebuiltDevicePath, stagedDevicePath);
  }

  const metadataPath = path.join(destinationRoot, "stage-metadata.json");
  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        ...manifest,
        sourceProjectRoot: projectRoot,
        stagedProjectRoot,
        prebuiltDeviceExists,
        stagedDevicePath: prebuiltDeviceExists ? stagedDevicePath : null
      },
      null,
      2
    )
  );

  return {
    sourceProjectRoot: projectRoot,
    stagedProjectRoot,
    metadataPath,
    prebuiltDeviceExists,
    stagedDevicePath: prebuiltDeviceExists ? stagedDevicePath : null
  };
}

export function getDefaultSidecarInstallTarget({
  destinationRoot = defaultUserLibraryRoot
} = {}) {
  return {
    destinationRoot,
    devicePath: path.join(destinationRoot, "laive-sidecar.amxd")
  };
}

export async function installPrebuiltSidecarDevice({
  destinationRoot = defaultUserLibraryRoot,
  dryRun = true,
  overwrite = true
} = {}) {
  const staged = await stageSidecarProject();
  const target = getDefaultSidecarInstallTarget({ destinationRoot });

  const payload = {
    stagedProjectRoot: staged.stagedProjectRoot,
    stagedDevicePath: staged.stagedDevicePath,
    prebuiltDeviceExists: staged.prebuiltDeviceExists,
    installDestinationKind: "default_user_library_path",
    installDestinationRoot: target.destinationRoot,
    devicePath: target.devicePath,
    note: "The sidecar installer targets the default Ableton User Library path. It does not currently detect a custom User Library location configured inside Live.",
    dryRun,
    overwrite
  };

  if (!staged.prebuiltDeviceExists) {
    return {
      ...payload,
      status: "unavailable"
    };
  }

  if (dryRun) {
    return {
      ...payload,
      status: "dry_run"
    };
  }

  await mkdir(target.destinationRoot, { recursive: true });
  if (overwrite) {
    await rm(target.devicePath, { force: true });
  }
  await cp(staged.stagedDevicePath, target.devicePath);

  return {
    ...payload,
    status: "installed"
  };
}
