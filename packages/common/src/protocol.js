import crypto from "node:crypto";

export const PROTOCOL_VERSION = "0.1.0";

export const MESSAGE_TYPES = Object.freeze({
  request: "request",
  response: "response",
  event: "event"
});

export const REQUEST_OPERATIONS = Object.freeze([
  "hello",
  "capabilities",
  "health",
  "get",
  "set",
  "call",
  "subscribe",
  "unsubscribe"
]);

export const RESPONSE_STATUSES = Object.freeze(["ok", "error"]);

export const EVENT_TOPICS = Object.freeze([
  "bridge.connected",
  "transport.changed",
  "tracks.changed",
  "clips.changed",
  "parameters.changed",
  "state.changed"
]);

export function createRequest({
  operation,
  target = null,
  arguments: args = {},
  dryRun = false,
  clientId = "laive-client",
  requestId = createRequestId(),
  timestamp = new Date().toISOString()
}) {
  return {
    type: MESSAGE_TYPES.request,
    request_id: requestId,
    timestamp,
    client_id: clientId,
    operation,
    target,
    arguments: args,
    dry_run: dryRun
  };
}

export function createResponse({
  requestId,
  ok = true,
  result = null,
  errorCode = null,
  errorMessage = null,
  bridgeVersion = PROTOCOL_VERSION,
  liveVersion = null,
  timestamp = new Date().toISOString()
}) {
  return {
    type: MESSAGE_TYPES.response,
    request_id: requestId,
    timestamp,
    ok,
    result,
    error_code: errorCode,
    error_message: errorMessage,
    bridge_version: bridgeVersion,
    live_version: liveVersion
  };
}

export function createEvent({
  topic,
  payload = {},
  source = "bridge",
  timestamp = new Date().toISOString()
}) {
  return {
    type: MESSAGE_TYPES.event,
    topic,
    payload,
    source,
    timestamp
  };
}

export function createRequestId() {
  return crypto.randomUUID();
}
