import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getDefaultSidecarInstallTarget,
  getProjectManifest,
  installPrebuiltSidecarDevice,
  readProjectManifestFile,
  stageSidecarProject
} from "../src/index.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("project manifest matches packaged source manifest", async () => {
  const manifest = getProjectManifest();
  const manifestFile = await readProjectManifestFile();
  const projectFile = JSON.parse(
    await readFile(
      path.join(packageRoot, "project", manifest.projectFile),
      "utf8"
    )
  );

  assert.equal(manifest.name, manifestFile.name);
  assert.equal(manifest.projectFile, manifestFile.project_file);
  assert.equal(path.basename(manifest.patcher), manifestFile.patcher);
  assert.equal(path.basename(manifest.nodeScript), manifestFile.node_script);
  assert.equal(path.basename(manifest.prebuiltDevice), "laive-sidecar.amxd");
  assert.deepEqual(Object.keys(projectFile.contents), ["patchers", "code"]);
  assert.deepEqual(projectFile.searchpath, {});
  assert.equal(projectFile.amxdtype, 1835887981);
  const patcherFile = JSON.parse(
    await readFile(path.join(packageRoot, "project", manifest.patcher), "utf8")
  );
  const nodeScriptObject = patcherFile.patcher.boxes.find((entry) => entry.box.id === "obj-5");
  assert.equal(
    nodeScriptObject.box.text,
    "node.script ../code/laive-sidecar-node.js @autostart 1"
  );
  assert.equal(
    patcherFile.patcher.boxes.find((entry) => entry.box.id === "obj-7").box.text,
    "hello"
  );
  assert.equal(
    patcherFile.patcher.boxes.find((entry) => entry.box.id === "obj-8").box.text,
    "list_workflows"
  );
});

test("stageSidecarProject copies the source project bundle", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "laive-sidecar-"));

  try {
    const legacyProjectRoot = path.join(tempRoot, "laive-sidecar-project");
    await mkdir(legacyProjectRoot, { recursive: true });
    await writeFile(path.join(legacyProjectRoot, "stale.txt"), "legacy");

    const staged = await stageSidecarProject({
      destinationRoot: tempRoot
    });
    const metadata = JSON.parse(await readFile(staged.metadataPath, "utf8"));

    assert.equal(metadata.name, "laive-sidecar");
    assert.ok(staged.stagedProjectRoot.endsWith("laive-sidecar"));
    assert.equal(metadata.patcher, "patchers/laive-sidecar.maxpat");
    assert.equal(metadata.nodeScript, "code/laive-sidecar-node.js");
    assert.equal(metadata.prebuiltDeviceExists, true);
    assert.ok(staged.stagedDevicePath.endsWith("laive-sidecar.amxd"));
    await assert.rejects(access(legacyProjectRoot));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("installPrebuiltSidecarDevice reports default user library target", async () => {
  const destinationRoot = await mkdtemp(path.join(os.tmpdir(), "laive-sidecar-install-"));
  const target = getDefaultSidecarInstallTarget({ destinationRoot });
  const result = await installPrebuiltSidecarDevice({
    destinationRoot,
    dryRun: true
  });

  assert.equal(result.status, "dry_run");
  assert.equal(result.devicePath, target.devicePath);
});
