import test from "node:test";
import assert from "node:assert/strict";
import { createSidecarRuntime } from "../src/runtime.js";

test("sidecar runtime lists workflows", async () => {
  const runtime = createSidecarRuntime();
  const response = await runtime.handleCommand("list_workflows");

  assert.equal(response.type, "query");
  assert.equal(response.payload.workflows.length >= 3, true);
});

test("sidecar runtime materializes note workflow and executes handlers", async () => {
  const calls = [];
  const runtime = createSidecarRuntime({
    handlers: {
      mutation: {
        async run(target, payload) {
          calls.push({ target, payload });
          return { ok: true, target, payload };
        }
      }
    }
  });

  const response = await runtime.handleCommand("execute_workflow", {
    name: "replaceClipNotes",
    parameters: {
      clipId: "clip:session:track=1:slot=0",
      notes: [{ pitch: 64, startBeats: 0, durationBeats: 1, velocity: 100 }]
    }
  });

  assert.equal(response.type, "event");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].target, "clip");
});

test("sidecar runtime materializes transform and snapshot workflows", async () => {
  const runtime = createSidecarRuntime();

  const transform = await runtime.handleCommand("materialize_workflow", {
    name: "transformSelectedClip",
    parameters: {
      transposeSemitones: 7
    }
  });
  const snapshot = await runtime.handleCommand("materialize_workflow", {
    name: "captureDeviceSnapshot"
  });

  assert.equal(transform.type, "query");
  assert.equal(transform.payload.workflow.steps[0].target, "clip:selected");
  assert.equal(snapshot.payload.workflow.steps[1].queryPath, "live_set view detail_device");
});
