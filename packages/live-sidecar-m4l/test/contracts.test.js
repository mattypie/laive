import test from "node:test";
import assert from "node:assert/strict";
import {
  SIDE_CAR_MESSAGE_TYPES,
  createCapabilityMap,
  createSidecarEnvelope
} from "../src/index.js";

test("sidecar envelope includes metadata", () => {
  const envelope = createSidecarEnvelope("hello", { version: "0.1.0" }, { requestId: "1" });
  assert.equal(envelope.type, "hello");
  assert.equal(envelope.meta.requestId, "1");
});

test("capability map provides defaults with overrides", () => {
  const capabilities = createCapabilityMap({ realtimeAnalysis: true });
  assert.equal(capabilities.noteEditing, true);
  assert.equal(capabilities.realtimeAnalysis, true);
  assert.ok(SIDE_CAR_MESSAGE_TYPES.includes("mutation"));
});
