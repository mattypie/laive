import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binPath = path.join(repoRoot, "bin", "laive.mjs");

function runCli(...args) {
  return execFileSync("node", [binPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

test("doctor emits machine-readable readiness output", () => {
  const output = runCli("doctor", "--json");
  const payload = JSON.parse(output);

  assert.equal(payload.cli_entrypoint_exists, true);
  assert.equal(payload.remote_script_source_exists, true);
  assert.ok(Array.isArray(payload.detected_live_installs));
  assert.equal(payload.sidecar.source_project_exists, true);
  assert.ok(payload.ui_helper.executable_path.endsWith("laive-ui-helper"));
});

test("detect emits install candidates", () => {
  const output = runCli("detect", "--json");
  const payload = JSON.parse(output);

  assert.ok(Array.isArray(payload.installs));
});

test("package stages the remote script archive", () => {
  const output = runCli("package", "--json");
  const payload = JSON.parse(output);

  assert.ok(payload.remote_script.archive_path.endsWith(".zip"));
  assert.ok(payload.sidecar.stagedProjectRoot.endsWith("laive-sidecar"));
  assert.ok(payload.sidecar.stagedDevicePath.endsWith("laive-sidecar.amxd"));
  assert.ok(payload.ui_helper.appBundleRoot.endsWith("laive-ui-helper.app"));
});

test("install stages both remote script and sidecar deliverables", () => {
  const output = runCli("install", "--json");
  const payload = JSON.parse(output);

  assert.equal(payload.remote_script.status, "dry_run");
  assert.ok(payload.sidecar.stagedProjectRoot.endsWith("laive-sidecar"));
  assert.equal(payload.sidecar.installPayload.status, "dry_run");
  assert.ok(payload.sidecar.installPayload.devicePath.endsWith("laive-sidecar.amxd"));
  assert.ok(payload.ui_helper.appBundleRoot.endsWith("laive-ui-helper.app"));
  assert.equal(payload.ui_helper.installPayload.status, "dry_run");
  assert.ok(payload.ui_helper.installPayload.appBundleRoot.endsWith("laive-ui-helper.app"));
});

test("package-ui-helper stages a grantable app bundle", () => {
  const output = runCli("package-ui-helper", "--json");
  const payload = JSON.parse(output);

  assert.ok(payload.appBundleRoot.endsWith("laive-ui-helper.app"));
  assert.ok(payload.executablePath.endsWith("laive-ui-helper"));
});

test("mcp-config emits published and local launch commands", () => {
  const output = runCli("mcp-config", "--json", "--published");
  const payload = JSON.parse(output);

  assert.equal(payload.defaultMode, "published");
  assert.equal(payload.published.command, "npx");
  assert.deepEqual(payload.published.args, ["-y", "laive-mcp", "mcp"]);
});
