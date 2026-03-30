import {
  compareTrackIds,
  makeArrangementClipId,
  makeDeviceId,
  makeParameterId,
  makeSceneId,
  makeSessionClipId,
  makeTrackId
} from "./ids.js";
import {
  normalizeApplication,
  normalizeCapabilities,
  normalizeClip,
  normalizeDevice,
  normalizeParameter,
  normalizeScene,
  normalizeSelection,
  normalizeSong,
  normalizeTrack,
  normalizeTrackBundle
} from "./normalize.js";
import {
  getArrangementTrackDetails,
  findTrack,
  getArrangementSummary,
  getSelectedContext,
  getTrackDetails,
  listPlayingClips,
  searchEntities,
  summarizeProject
} from "./queries.js";

function isoNow(value) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return new Date().toISOString();
}

function createEmptyEntityCollections() {
  return {
    tracks: {},
    scenes: {},
    clips: {},
    devices: {},
    parameters: {}
  };
}

export function createInitialState(options = {}) {
  const observedAt = isoNow(options.observedAt);

  return {
    meta: {
      snapshotVersion: 0,
      lastUpdatedAt: observedAt,
      lastEventAt: null,
      bridgeVersion: null,
      liveVersion: null,
      dirtyPaths: [],
      traceLength: 0
    },
    application: null,
    song: null,
    selection: null,
    capabilities: null,
    trackOrder: [],
    visibleTrackIds: [],
    returnTrackIds: [],
    masterTrackId: null,
    sceneOrder: [],
    ...createEmptyEntityCollections()
  };
}

function sortedUniqueStrings(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function replaceDirtyPaths(state, dirtyPaths) {
  state.meta.dirtyPaths = sortedUniqueStrings(dirtyPaths);
}

function addDirtyPaths(state, dirtyPaths = []) {
  replaceDirtyPaths(state, [...state.meta.dirtyPaths, ...dirtyPaths]);
}

function clearDirtyPaths(state, dirtyPaths = []) {
  const dirtySet = new Set(state.meta.dirtyPaths);

  for (const dirtyPath of dirtyPaths) {
    dirtySet.delete(dirtyPath);
  }

  state.meta.dirtyPaths = [...dirtySet].sort();
}

function updateMetaAfterMutation(state, options = {}) {
  const observedAt = isoNow(options.observedAt);
  state.meta.snapshotVersion += 1;
  state.meta.lastUpdatedAt = observedAt;
  state.meta.traceLength += 1;

  if (options.lastEventAt) {
    state.meta.lastEventAt = isoNow(options.lastEventAt);
  }

  if (options.bridgeVersion) {
    state.meta.bridgeVersion = options.bridgeVersion;
  }

  if (options.liveVersion) {
    state.meta.liveVersion = options.liveVersion;
  }
}

function removeParametersForDevice(state, deviceId) {
  const device = state.devices[deviceId];

  if (!device) {
    return;
  }

  for (const parameterId of device.parameterIds) {
    delete state.parameters[parameterId];
  }
}

function removeDevice(state, deviceId) {
  removeParametersForDevice(state, deviceId);
  delete state.devices[deviceId];
}

function removeTrackSubtree(state, trackId) {
  const track = state.tracks[trackId];

  if (!track) {
    return;
  }

  for (const clipId of [...track.sessionClipIds, ...track.arrangementClipIds]) {
    delete state.clips[clipId];
  }

  for (const deviceId of track.deviceIds) {
    removeDevice(state, deviceId);
  }

  delete state.tracks[trackId];
  state.trackOrder = state.trackOrder.filter((currentTrackId) => currentTrackId !== trackId);
  state.visibleTrackIds = state.visibleTrackIds.filter(
    (currentTrackId) => currentTrackId !== trackId
  );
  state.returnTrackIds = state.returnTrackIds.filter(
    (currentTrackId) => currentTrackId !== trackId
  );

  if (state.masterTrackId === trackId) {
    state.masterTrackId = null;
  }
}

function upsertTrackBundle(state, track, options = {}) {
  const trackId =
    track.id ??
    makeTrackId(track.section ?? track.kind ?? "visible", track.index ?? track.track_index ?? 0);
  const bundle = normalizeTrackBundle(
    track,
    {
      track: state.tracks[trackId],
      clips: state.clips,
      devices: state.devices,
      parameters: state.parameters
    },
    options
  );

  const previousTrack = state.tracks[bundle.track.id];

  if (previousTrack) {
    const previousClipIds = new Set([
      ...previousTrack.sessionClipIds,
      ...previousTrack.arrangementClipIds
    ]);
    const nextClipIds = new Set([
      ...bundle.track.sessionClipIds,
      ...bundle.track.arrangementClipIds
    ]);

    for (const clipId of previousClipIds) {
      if (!nextClipIds.has(clipId)) {
        delete state.clips[clipId];
      }
    }

    const previousDeviceIds = new Set(previousTrack.deviceIds);
    const nextDeviceIds = new Set(bundle.track.deviceIds);

    for (const deviceId of previousDeviceIds) {
      if (!nextDeviceIds.has(deviceId)) {
        removeDevice(state, deviceId);
      }
    }
  }

  state.tracks[bundle.track.id] = bundle.track;

  for (const clip of [...bundle.sessionClips, ...bundle.arrangementClips]) {
    state.clips[clip.id] = clip;
  }

  for (const { device, parameters } of bundle.devices) {
    state.devices[device.id] = device;

    for (const parameter of parameters) {
      state.parameters[parameter.id] = parameter;
    }
  }

  const trackOrderSet = new Set(state.trackOrder);
  trackOrderSet.add(bundle.track.id);
  state.trackOrder = [...trackOrderSet].sort(compareTrackIds);

  if (bundle.track.section === "visible") {
    state.visibleTrackIds = [...new Set([...state.visibleTrackIds, bundle.track.id])].sort(
      compareTrackIds
    );
  } else if (bundle.track.section === "return") {
    state.returnTrackIds = [...new Set([...state.returnTrackIds, bundle.track.id])].sort(
      compareTrackIds
    );
  } else if (bundle.track.section === "master") {
    state.masterTrackId = bundle.track.id;
  }
}

function upsertScene(state, scene, options = {}) {
  const sceneId = scene.id ?? makeSceneId(scene.index ?? scene.scene_index ?? 0);
  const normalizedScene = normalizeScene(scene, state.scenes[sceneId], options);
  state.scenes[normalizedScene.id] = normalizedScene;
  state.sceneOrder = [...new Set([...state.sceneOrder, normalizedScene.id])].sort(
    (left, right) => state.scenes[left].index - state.scenes[right].index
  );
}

function upsertClip(state, clip, options = {}) {
  const clipId =
    clip.id ??
    (clip.location === "arrangement"
      ? makeArrangementClipId(
          clip.track_id,
          clip.index ?? clip.arrangement_index ?? clip.arrangementIndex ?? 0
        )
      : makeSessionClipId(
          clip.track_id,
          clip.slot_index ?? clip.slotIndex ?? clip.scene_index ?? 0
        ));
  const normalizedClip = normalizeClip(
    clip,
    clip.track_id,
    state.clips[clipId],
    options
  );
  state.clips[normalizedClip.id] = normalizedClip;

  const track = state.tracks[normalizedClip.trackId];

  if (track) {
    if (normalizedClip.location === "session") {
      track.sessionClipIds = [...new Set([...track.sessionClipIds, normalizedClip.id])];
    } else {
      track.arrangementClipIds = [...new Set([...track.arrangementClipIds, normalizedClip.id])];
    }
  }
}

function upsertDevice(state, device, options = {}) {
  const deviceId =
    device.id ?? makeDeviceId(device.track_id, device.index ?? device.device_index ?? 0);
  const normalizedDevice = normalizeDevice(
    device,
    device.track_id,
    state.devices[deviceId],
    options
  );
  state.devices[normalizedDevice.id] = normalizedDevice;

  const track = state.tracks[normalizedDevice.trackId];

  if (track) {
    track.deviceIds = [...new Set([...track.deviceIds, normalizedDevice.id])];
  }
}

function upsertParameter(state, parameter, options = {}) {
  const parameterId =
    parameter.id ??
    makeParameterId(
      parameter.device_id,
      parameter.index ?? parameter.parameter_index ?? parameter.parameterIndex ?? 0
    );
  const normalizedParameter = normalizeParameter(
    parameter,
    parameter.device_id,
    state.parameters[parameterId],
    options
  );
  state.parameters[normalizedParameter.id] = normalizedParameter;

  const device = state.devices[normalizedParameter.deviceId];

  if (device) {
    device.parameterIds = [...new Set([...device.parameterIds, normalizedParameter.id])];
  }
}

export function applySnapshot(state, snapshot, options = {}) {
  const nextState = createInitialState({
    observedAt: options.observedAt ?? snapshot.observed_at
  });
  nextState.meta.snapshotVersion = state.meta.snapshotVersion;
  nextState.meta.traceLength = state.meta.traceLength;
  nextState.meta.lastEventAt = state.meta.lastEventAt;

  if (snapshot.application) {
    nextState.application = normalizeApplication(snapshot.application, null, options);
  }

  if (snapshot.song) {
    nextState.song = normalizeSong(snapshot.song, null, options);
  }

  if (snapshot.selection) {
    nextState.selection = normalizeSelection(snapshot.selection, null, options);
  }

  if (snapshot.capabilities) {
    nextState.capabilities = normalizeCapabilities(snapshot.capabilities, null, options);
  }

  for (const scene of snapshot.scenes ?? []) {
    upsertScene(nextState, scene, options);
  }

  for (const track of snapshot.tracks ?? []) {
    upsertTrackBundle(nextState, track, options);
  }

  updateMetaAfterMutation(nextState, {
    observedAt: options.observedAt ?? snapshot.observed_at,
    bridgeVersion: snapshot.bridge_version ?? options.bridgeVersion,
    liveVersion: snapshot.live_version ?? options.liveVersion
  });

  replaceDirtyPaths(nextState, []);
  return nextState;
}

function handleTransportChanged(state, payload, options) {
  state.song = normalizeSong({ ...state.song, ...payload }, state.song, options);
}

function handleSelectionChanged(state, payload, options) {
  state.selection = normalizeSelection(payload, state.selection, options);
}

function handleTrackRemoved(state, payload) {
  const trackId = payload.track_id ?? payload.id;

  if (!trackId) {
    return;
  }

  removeTrackSubtree(state, trackId);
}

function handleSceneRemoved(state, payload) {
  const sceneId = payload.scene_id ?? payload.id;

  if (!sceneId) {
    return;
  }

  delete state.scenes[sceneId];
  state.sceneOrder = state.sceneOrder.filter((currentSceneId) => currentSceneId !== sceneId);
  addDirtyPaths(state, ["song.scenes"]);
}

function handleClipRemoved(state, payload) {
  const clipId = payload.clip_id ?? payload.id;
  const clip = clipId ? state.clips[clipId] : null;

  if (!clip) {
    return;
  }

  const track = state.tracks[clip.trackId];

  if (track) {
    track.sessionClipIds = track.sessionClipIds.filter((currentClipId) => currentClipId !== clipId);
    track.arrangementClipIds = track.arrangementClipIds.filter(
      (currentClipId) => currentClipId !== clipId
    );
  }

  delete state.clips[clipId];
}

function handleDeviceRemoved(state, payload) {
  const deviceId = payload.device_id ?? payload.id;

  if (!deviceId) {
    return;
  }

  const device = state.devices[deviceId];

  if (device) {
    const track = state.tracks[device.trackId];

    if (track) {
      track.deviceIds = track.deviceIds.filter((currentDeviceId) => currentDeviceId !== deviceId);
    }
  }

  removeDevice(state, deviceId);
}

function handleParameterRemoved(state, payload) {
  const parameterId = payload.parameter_id ?? payload.id;

  if (!parameterId) {
    return;
  }

  const parameter = state.parameters[parameterId];

  if (parameter) {
    const device = state.devices[parameter.deviceId];

    if (device) {
      device.parameterIds = device.parameterIds.filter(
        (currentParameterId) => currentParameterId !== parameterId
      );
    }
  }

  delete state.parameters[parameterId];
}

const eventHandlers = {
  "transport.changed": (state, payload, options) => handleTransportChanged(state, payload, options),
  "selection.changed": (state, payload, options) => handleSelectionChanged(state, payload, options),
  "track.added": (state, payload, options) => upsertTrackBundle(state, payload.track ?? payload, options),
  "track.updated": (state, payload, options) => upsertTrackBundle(state, payload.track ?? payload, options),
  "track.removed": (state, payload) => handleTrackRemoved(state, payload),
  "scene.added": (state, payload, options) => upsertScene(state, payload.scene ?? payload, options),
  "scene.updated": (state, payload, options) => upsertScene(state, payload.scene ?? payload, options),
  "scene.removed": (state, payload) => handleSceneRemoved(state, payload),
  "clip.updated": (state, payload, options) => upsertClip(state, payload.clip ?? payload, options),
  "clip.removed": (state, payload) => handleClipRemoved(state, payload),
  "device.updated": (state, payload, options) =>
    upsertDevice(state, payload.device ?? payload, options),
  "device.removed": (state, payload) => handleDeviceRemoved(state, payload),
  "device.selected": (state, payload, options) =>
    handleSelectionChanged(
      state,
      { ...state.selection, selected_device_id: payload.device_id ?? payload.id ?? null },
      options
    ),
  "parameter.updated": (state, payload, options) =>
    upsertParameter(state, payload.parameter ?? payload, options),
  "parameter.removed": (state, payload) => handleParameterRemoved(state, payload),
  "state.dirty": (state, payload) => addDirtyPaths(state, payload.paths ?? []),
  "state.resynced": (state, payload) => clearDirtyPaths(state, payload.paths ?? [])
};

export function applyEvent(state, eventEnvelope, options = {}) {
  const nextState = structuredClone(state);
  const eventName = eventEnvelope.event ?? eventEnvelope.name;
  const payload = eventEnvelope.payload ?? {};
  const observedAt = isoNow(options.observedAt ?? eventEnvelope.observed_at);
  const handler = eventHandlers[eventName];

  if (handler) {
    handler(nextState, payload, { observedAt });
  } else {
    addDirtyPaths(nextState, payload.paths ?? ["unknown"]);
  }

  updateMetaAfterMutation(nextState, {
    observedAt,
    lastEventAt: observedAt
  });

  return nextState;
}

export function markDirtyPaths(state, dirtyPaths = [], options = {}) {
  const nextState = structuredClone(state);
  addDirtyPaths(nextState, dirtyPaths);
  updateMetaAfterMutation(nextState, {
    observedAt: options.observedAt
  });
  return nextState;
}

export function reconcileSubtree(state, descriptor, options = {}) {
  const nextState = structuredClone(state);
  const kind = descriptor.kind;

  if (kind === "track" && descriptor.payload) {
    upsertTrackBundle(nextState, descriptor.payload, options);
    clearDirtyPaths(nextState, [`track:${descriptor.payload.id ?? "unknown"}`]);
  } else if (kind === "scene" && descriptor.payload) {
    upsertScene(nextState, descriptor.payload, options);
    clearDirtyPaths(nextState, ["song.scenes"]);
  } else if (kind === "clip" && descriptor.payload) {
    upsertClip(nextState, descriptor.payload, options);
  } else if (kind === "selection" && descriptor.payload) {
    handleSelectionChanged(nextState, descriptor.payload, options);
  } else if (kind === "transport" && descriptor.payload) {
    handleTransportChanged(nextState, descriptor.payload, options);
  } else if (kind === "snapshot" && descriptor.payload) {
    return applySnapshot(nextState, descriptor.payload, options);
  }

  updateMetaAfterMutation(nextState, {
    observedAt: options.observedAt
  });

  return nextState;
}

export function createStateEngine(initialState = createInitialState()) {
  let currentState = structuredClone(initialState);

  return {
    getState() {
      return structuredClone(currentState);
    },
    applySnapshot(snapshot, options = {}) {
      currentState = applySnapshot(currentState, snapshot, options);
      return this.getState();
    },
    applyEvent(eventEnvelope, options = {}) {
      currentState = applyEvent(currentState, eventEnvelope, options);
      return this.getState();
    },
    markDirtyPaths(dirtyPaths, options = {}) {
      currentState = markDirtyPaths(currentState, dirtyPaths, options);
      return this.getState();
    },
    reconcileSubtree(descriptor, options = {}) {
      currentState = reconcileSubtree(currentState, descriptor, options);
      return this.getState();
    },
    query: {
      summarizeProject: () => summarizeProject(currentState),
      getArrangementSummary: () => getArrangementSummary(currentState),
      getArrangementTrackDetails: (trackId) => getArrangementTrackDetails(currentState, trackId),
      getSelectedContext: () => getSelectedContext(currentState),
      findTrack: (query) => findTrack(currentState, query),
      getTrackDetails: (trackId) => getTrackDetails(currentState, trackId),
      listPlayingClips: () => listPlayingClips(currentState),
      searchEntities: (query) => searchEntities(currentState, query)
    }
  };
}
