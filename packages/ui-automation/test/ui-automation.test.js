import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  assertSupportedLiveWindow,
  getSpecialKeyCode,
  getWorkflow,
  installUiHelper,
  materializeWorkflow,
  resolveLiveAppName,
  stageUiHelper
} from "../src/index.js";

test("getWorkflow returns deterministic definitions", () => {
  const workflow = getWorkflow("exportAudioVideo");
  assert.equal(workflow.steps[0].type, "activate_app");
  assert.equal(workflow.steps[1].type, "menu_click");
});

test("materializeWorkflow resolves parameters into steps", () => {
  const workflow = materializeWorkflow("browserSearchAndLoad", { query: "Operator" });
  assert.equal(workflow.steps[3].resolvedValue, "Operator");
});

test("Live frontmost guard rejects other apps", () => {
  assert.throws(
    () =>
      assertSupportedLiveWindow({
        appName: "Finder",
        isFrontmost: true
      }),
    /Focused application is not Ableton Live/
  );
});

test("Live frontmost guard accepts matching app names", () => {
  assert.doesNotThrow(() =>
    assertSupportedLiveWindow({
      appName: "Ableton Live 12 Suite",
      isFrontmost: true
    })
  );
});

test("resolveLiveAppName prefers the captured Live app name", () => {
  assert.equal(resolveLiveAppName({ appName: "Live", isFrontmost: true }), "Live");
  assert.equal(
    resolveLiveAppName({ appName: "Ableton Live 12 Suite", isFrontmost: true }),
    "Ableton Live 12 Suite"
  );
  assert.equal(resolveLiveAppName({ appName: "Finder", isFrontmost: true }), "Ableton Live");
});

test("special key mapping exposes canonical key codes", () => {
  assert.equal(getSpecialKeyCode("return"), 36);
  assert.equal(getSpecialKeyCode("down"), 125);
  assert.equal(getSpecialKeyCode("x"), null);
});

test("stageUiHelper creates a named app bundle with executable", async () => {
  const destinationRoot = await mkdtemp(path.join(os.tmpdir(), "laive-ui-helper-"));
  const result = await stageUiHelper({ destinationRoot });

  assert.equal(result.appBundleRoot.endsWith("laive-ui-helper.app"), true);
  assert.equal(existsSync(result.executablePath), true);
  assert.equal(existsSync(result.infoPlistPath), true);
});

test("installUiHelper reports a stable app bundle target", async () => {
  const destinationRoot = await mkdtemp(path.join(os.tmpdir(), "laive-ui-helper-install-"));
  const result = await installUiHelper({ destinationRoot, dryRun: true });

  assert.equal(result.status, "dry_run");
  assert.equal(result.appBundleRoot.endsWith("laive-ui-helper.app"), true);
});
