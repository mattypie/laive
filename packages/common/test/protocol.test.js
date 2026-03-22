import test from "node:test";
import assert from "node:assert/strict";

import {
  assertValidProtocolMessage,
  createEvent,
  createJsonLineParser,
  createRequest,
  createResponse,
  stringifyJsonLine,
  validateProtocolMessage
} from "../src/index.js";

test("createRequest emits a valid protocol request", () => {
  const request = createRequest({
    operation: "get",
    target: "song",
    arguments: { include_tracks: true }
  });

  assert.equal(request.type, "request");
  assert.equal(request.operation, "get");
  assert.equal(request.target, "song");
  assertValidProtocolMessage(request);
});

test("validateProtocolMessage returns issues for malformed payloads", () => {
  const result = validateProtocolMessage({
    type: "request",
    request_id: "",
    timestamp: "nope",
    client_id: "",
    operation: "wat",
    target: 1,
    arguments: [],
    dry_run: "false"
  });

  assert.equal(result.valid, false);
  assert.ok(result.issues.length >= 6);
});

test("response and event helpers create valid objects", () => {
  const response = createResponse({
    requestId: "req-1",
    result: { song: "demo" }
  });
  const event = createEvent({
    topic: "transport.changed",
    payload: { playing: true }
  });

  assertValidProtocolMessage(response);
  assertValidProtocolMessage(event);
});

test("json line parser reconstructs split frames", () => {
  const first = createRequest({ operation: "hello" });
  const second = createResponse({ requestId: first.request_id, result: { ok: true } });
  const parsed = [];
  const parser = createJsonLineParser({
    onMessage(message) {
      parsed.push(message);
    }
  });

  const wire = `${stringifyJsonLine(first)}${stringifyJsonLine(second)}`;
  parser.push(Buffer.from(wire.slice(0, 12)));
  parser.push(Buffer.from(wire.slice(12)));
  parser.end();

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].request_id, first.request_id);
  assert.equal(parsed[1].request_id, first.request_id);
});
