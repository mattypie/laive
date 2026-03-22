export const SIDE_CAR_MESSAGE_TYPES = Object.freeze([
  "hello",
  "capabilities",
  "query",
  "mutation",
  "event",
  "error"
]);

export function createSidecarEnvelope(type, payload, meta = {}) {
  if (!SIDE_CAR_MESSAGE_TYPES.includes(type)) {
    throw new Error(`Unsupported sidecar message type: ${type}`);
  }

  return {
    type,
    payload,
    meta: {
      requestId: meta.requestId ?? null,
      source: meta.source ?? "sidecar",
      timestamp: meta.timestamp ?? new Date().toISOString()
    }
  };
}

export function createCapabilityMap(overrides = {}) {
  return {
    noteEditing: true,
    objectObservation: true,
    deviceIntrospection: true,
    realtimeAnalysis: false,
    browserInsertion: false,
    ...overrides
  };
}
