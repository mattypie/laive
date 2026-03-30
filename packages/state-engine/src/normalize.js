import {
  makeArrangementClipId,
  makeDeviceId,
  makeParameterId,
  makeSceneId,
  makeSessionClipId,
  makeTrackId
} from "./ids.js";

function isoNow(value) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return new Date().toISOString();
}

function toSourcePath(pathValue, fallback) {
  if (typeof pathValue === "string" && pathValue.length > 0) {
    return pathValue;
  }

  return fallback;
}

function bumpVersion(existingEntity) {
  return existingEntity ? existingEntity.version + 1 : 1;
}

function createBaseEntity({
  existingEntity,
  id,
  kind,
  sourcePath,
  observedAt,
  source = "runtime"
}) {
  return {
    id,
    kind,
    source,
    sourcePath,
    version: bumpVersion(existingEntity),
    lastObservedAt: isoNow(observedAt)
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRoutingChoice(choice) {
  if (!choice) {
    return null;
  }

  if (typeof choice === "string") {
    return {
      identifier: choice,
      displayName: choice
    };
  }

  const identifier = pickFirst(choice.identifier, choice.id, choice.value, choice.name) ?? null;
  const displayName =
    pickFirst(choice.display_name, choice.displayName, choice.name, choice.label, identifier) ??
    null;

  if (!identifier && !displayName) {
    return null;
  }

  return {
    identifier: identifier ?? displayName,
    displayName: displayName ?? String(identifier),
    aliases: asArray(choice.aliases).filter((alias) => typeof alias === "string" && alias.length > 0)
  };
}

function normalizeRoutingChoices(choices) {
  return asArray(choices)
    .map((choice) => normalizeRoutingChoice(choice))
    .filter(Boolean);
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

export function normalizeApplication(snapshot, existingEntity, options = {}) {
  const observedAt = isoNow(options.observedAt ?? snapshot.observed_at);
  return {
    ...createBaseEntity({
      existingEntity,
      id: "application",
      kind: "application",
      sourcePath: "application",
      observedAt
    }),
    name: snapshot.name ?? "Ableton Live",
    versionLabel: pickFirst(snapshot.version, snapshot.versionLabel) ?? "unknown",
    majorVersion: pickFirst(snapshot.major_version, snapshot.majorVersion) ?? null,
    minorVersion: pickFirst(snapshot.minor_version, snapshot.minorVersion) ?? null,
    bugfixVersion: pickFirst(snapshot.bugfix_version, snapshot.bugfixVersion) ?? null,
    mode: snapshot.mode ?? null
  };
}

export function normalizeSong(snapshot, existingEntity, options = {}) {
  const observedAt = isoNow(options.observedAt ?? snapshot.observed_at);
  const loopSnapshot = snapshot.loop ?? {};
  return {
    ...createBaseEntity({
      existingEntity,
      id: "song",
      kind: "song",
      sourcePath: "song",
      observedAt
    }),
    name: snapshot.name ?? "Untitled Set",
    tempo: snapshot.tempo ?? null,
    timeSignatureNumerator:
      pickFirst(snapshot.time_signature_numerator, snapshot.timeSignatureNumerator) ?? null,
    timeSignatureDenominator:
      pickFirst(snapshot.time_signature_denominator, snapshot.timeSignatureDenominator) ?? null,
    isPlaying: Boolean(pickFirst(snapshot.is_playing, snapshot.isPlaying)),
    isRecording: Boolean(pickFirst(snapshot.is_recording, snapshot.isRecording)),
    overdub: Boolean(snapshot.overdub),
    metronome: Boolean(snapshot.metronome),
    loopEnabled: Boolean(
      pickFirst(snapshot.loop_enabled, snapshot.loopEnabled, loopSnapshot.enabled)
    ),
    loopStartBeats:
      pickFirst(
        snapshot.loop_start_beats,
        snapshot.loopStartBeats,
        loopSnapshot.start_beats,
        loopSnapshot.startBeats
      ) ?? null,
    loopLengthBeats:
      pickFirst(
        snapshot.loop_length_beats,
        snapshot.loopLengthBeats,
        loopSnapshot.length_beats,
        loopSnapshot.lengthBeats
      ) ?? null,
    currentSongTime:
      pickFirst(snapshot.current_song_time, snapshot.currentSongTime) ??
      pickFirst(snapshot.arrangement_position_beats, snapshot.arrangementPositionBeats) ??
      null,
    arrangementPositionBeats:
      pickFirst(snapshot.arrangement_position_beats, snapshot.arrangementPositionBeats) ?? null,
    clipTriggerQuantization:
      pickFirst(snapshot.clip_trigger_quantization, snapshot.clipTriggerQuantization) ?? null,
    midiRecordingQuantization:
      pickFirst(snapshot.midi_recording_quantization, snapshot.midiRecordingQuantization) ?? null
  };
}

export function normalizeSelection(snapshot, existingEntity, options = {}) {
  const observedAt = isoNow(options.observedAt ?? snapshot.observed_at);
  const selectedTrackId =
    snapshot.selected_track_id ??
    snapshot.selectedTrackId ??
    (snapshot.selected_track
      ? makeTrackId(
          snapshot.selected_track.section ?? "visible",
          snapshot.selected_track.index ?? 0
        )
      : null);

  const selectedSceneId =
    snapshot.selected_scene_id ??
    snapshot.selectedSceneId ??
    (Number.isInteger(snapshot.selected_scene_index)
      ? makeSceneId(snapshot.selected_scene_index)
      : null);

  return {
    ...createBaseEntity({
      existingEntity,
      id: "selection",
      kind: "selection",
      sourcePath: "selection",
      observedAt
    }),
    selectedTrackId,
    selectedSceneId,
    selectedClipId: pickFirst(snapshot.selected_clip_id, snapshot.selectedClipId) ?? null,
    selectedDeviceId: pickFirst(snapshot.selected_device_id, snapshot.selectedDeviceId) ?? null,
    detailView: pickFirst(snapshot.detail_view, snapshot.detailView) ?? null,
    browserVisible: Boolean(pickFirst(snapshot.browser_visible, snapshot.browserVisible))
  };
}

export function normalizeCapabilities(snapshot, existingEntity, options = {}) {
  const observedAt = isoNow(options.observedAt ?? snapshot.observed_at);
  return {
    ...createBaseEntity({
      existingEntity,
      id: "capabilities",
      kind: "capabilities",
      sourcePath: "capabilities",
      observedAt
    }),
    runtimeVersion: pickFirst(snapshot.runtime_version, snapshot.runtimeVersion) ?? null,
    supportedCommands: asArray(
      pickFirst(snapshot.supported_commands, snapshot.supportedCommands)
    ),
    supportedEvents: asArray(pickFirst(snapshot.supported_events, snapshot.supportedEvents)),
    features: snapshot.features ?? {}
  };
}

export function normalizeTrack(track, existingEntity, options = {}) {
  const section = pickFirst(track.section, track.kind, track.trackSection) ?? "visible";
  const index = pickFirst(track.track_index, track.trackIndex, track.index) ?? 0;
  const trackId = track.id ?? makeTrackId(section, index);
  const observedAt = isoNow(options.observedAt ?? track.observed_at);
  const sends = asArray(track.sends).map((send, sendIndex) => ({
    index: pickFirst(send.send_index, send.sendIndex, send.index) ?? sendIndex,
    name: send.name ?? `Send ${sendIndex + 1}`,
    shortName: pickFirst(send.short_name, send.shortName) ?? null,
    sendLetter: pickFirst(send.send_letter, send.sendLetter) ?? null,
    aliases: asArray(send.aliases).filter((alias) => typeof alias === "string" && alias.length > 0),
    value: pickFirst(send.value, send.amount) ?? null,
    min: send.min ?? null,
    max: send.max ?? null,
    isQuantized: Boolean(pickFirst(send.is_quantized, send.isQuantized)),
    displayValue: pickFirst(send.display_value, send.displayValue) ?? null
  }));
  const availableInputRoutingTypes = normalizeRoutingChoices(
    pickFirst(track.available_input_routing_types, track.availableInputRoutingTypes)
  );
  const availableInputRoutingChannels = normalizeRoutingChoices(
    pickFirst(track.available_input_routing_channels, track.availableInputRoutingChannels)
  );
  const availableOutputRoutingTypes = normalizeRoutingChoices(
    pickFirst(track.available_output_routing_types, track.availableOutputRoutingTypes)
  );
  const availableOutputRoutingChannels = normalizeRoutingChoices(
    pickFirst(track.available_output_routing_channels, track.availableOutputRoutingChannels)
  );

  return {
    ...createBaseEntity({
      existingEntity,
      id: trackId,
      kind: "track",
      sourcePath: toSourcePath(track.path, `song.tracks.${section}.${index}`),
      observedAt
    }),
    section,
    index,
    name: track.name ?? `Track ${index + 1}`,
    type: track.type ?? null,
    color: track.color ?? null,
    isGroup: Boolean(pickFirst(track.is_group, track.isGroup)),
    groupTrackId: pickFirst(track.group_track_id, track.groupTrackId) ?? null,
    armed: Boolean(pickFirst(track.armed, track.arm)),
    muted: Boolean(pickFirst(track.muted, track.mute)),
    soloed: Boolean(pickFirst(track.soloed, track.solo)),
    frozen: Boolean(pickFirst(track.frozen, track.is_frozen, track.isFrozen)),
    canBeArmed: Boolean(pickFirst(track.can_be_armed, track.canBeArmed)),
    hasAudioInput: Boolean(pickFirst(track.has_audio_input, track.hasAudioInput)),
    hasAudioOutput: Boolean(pickFirst(track.has_audio_output, track.hasAudioOutput)),
    hasMidiInput: Boolean(pickFirst(track.has_midi_input, track.hasMidiInput)),
    hasMidiOutput: Boolean(pickFirst(track.has_midi_output, track.hasMidiOutput)),
    monitoringState: pickFirst(track.monitoring_state, track.monitoringState) ?? null,
    currentMonitoringState:
      pickFirst(track.current_monitoring_state, track.currentMonitoringState) ?? null,
    volume: pickFirst(track.volume, track.level) ?? null,
    panning: pickFirst(track.panning, track.pan) ?? null,
    sends,
    inputRoutingType: normalizeRoutingChoice(
      pickFirst(track.input_routing_type, track.inputRoutingType)
    ),
    inputRoutingChannel: normalizeRoutingChoice(
      pickFirst(track.input_routing_channel, track.inputRoutingChannel)
    ),
    outputRoutingType: normalizeRoutingChoice(
      pickFirst(track.output_routing_type, track.outputRoutingType)
    ),
    outputRoutingChannel: normalizeRoutingChoice(
      pickFirst(track.output_routing_channel, track.outputRoutingChannel)
    ),
    availableInputRoutingTypes,
    availableInputRoutingChannels,
    availableOutputRoutingTypes,
    availableOutputRoutingChannels,
    availableRouting: {
      inputTypes: availableInputRoutingTypes,
      inputChannels: availableInputRoutingChannels,
      outputTypes: availableOutputRoutingTypes,
      outputChannels: availableOutputRoutingChannels
    },
    playingSlotIndex: pickFirst(track.playing_slot_index, track.playingSlotIndex) ?? null,
    clipSlotCount:
      pickFirst(track.clip_slot_count, track.clipSlotCount) ?? asArray(track.session_clips).length,
    arrangementClipCount:
      pickFirst(track.arrangement_clip_count, track.arrangementClipCount) ??
      asArray(track.arrangement_clips).length,
    sessionClipIds: [],
    arrangementClipIds: [],
    deviceIds: []
  };
}

export function normalizeScene(scene, existingEntity, options = {}) {
  const index = pickFirst(scene.scene_index, scene.sceneIndex, scene.index) ?? 0;
  const sceneId = scene.id ?? makeSceneId(index);
  const observedAt = isoNow(options.observedAt ?? scene.observed_at);

  return {
    ...createBaseEntity({
      existingEntity,
      id: sceneId,
      kind: "scene",
      sourcePath: toSourcePath(scene.path, `song.scenes.${index}`),
      observedAt
    }),
    index,
    name: scene.name ?? `Scene ${index + 1}`,
    color: scene.color ?? null,
    isTriggered: Boolean(pickFirst(scene.is_triggered, scene.isTriggered))
  };
}

export function normalizeClip(clip, trackId, existingEntity, options = {}) {
  const slotIndex = pickFirst(clip.slot_index, clip.slotIndex, clip.scene_index);
  const clipIndex = pickFirst(clip.arrangement_index, clip.arrangementIndex, clip.index) ?? 0;
  const location = clip.location ?? (Number.isInteger(slotIndex) ? "session" : "arrangement");
  const clipId =
    clip.id ??
    (location === "session"
      ? makeSessionClipId(trackId, slotIndex ?? 0)
      : makeArrangementClipId(trackId, clipIndex));
  const observedAt = isoNow(options.observedAt ?? clip.observed_at);

  return {
    ...createBaseEntity({
      existingEntity,
      id: clipId,
      kind: "clip",
      sourcePath:
        location === "session"
          ? toSourcePath(clip.path, `${trackId}.session_clips.${slotIndex ?? 0}`)
          : toSourcePath(clip.path, `${trackId}.arrangement_clips.${clipIndex}`),
      observedAt
    }),
    trackId,
    location,
    slotIndex: location === "session" ? slotIndex ?? 0 : null,
    index: location === "arrangement" ? clipIndex : null,
    name: clip.name ?? null,
    color: clip.color ?? null,
    isMidi: pickFirst(clip.is_midi, clip.isMidi) ?? null,
    isAudio: pickFirst(clip.is_audio, clip.isAudio) ?? null,
    isPlaying: Boolean(pickFirst(clip.is_playing, clip.isPlaying)),
    isTriggered: Boolean(pickFirst(clip.is_triggered, clip.isTriggered)),
    isRecording: Boolean(pickFirst(clip.is_recording, clip.isRecording)),
    startBeats: pickFirst(clip.start_beats, clip.startBeats) ?? null,
    endBeats: pickFirst(clip.end_beats, clip.endBeats) ?? null,
    loopStartBeats: pickFirst(clip.loop_start_beats, clip.loopStartBeats) ?? null,
    loopEndBeats: pickFirst(clip.loop_end_beats, clip.loopEndBeats) ?? null,
    noteCount: pickFirst(clip.note_count, clip.noteCount) ?? null
  };
}

export function normalizeDevice(device, trackId, existingEntity, options = {}) {
  const index = pickFirst(device.device_index, device.deviceIndex, device.index) ?? 0;
  const deviceId = device.id ?? makeDeviceId(trackId, index);
  const observedAt = isoNow(options.observedAt ?? device.observed_at);

  return {
    ...createBaseEntity({
      existingEntity,
      id: deviceId,
      kind: "device",
      sourcePath: toSourcePath(device.path, `${trackId}.devices.${index}`),
      observedAt
    }),
    trackId,
    index,
    name: device.name ?? `Device ${index + 1}`,
    className: pickFirst(device.class_name, device.className) ?? null,
    type: device.type ?? null,
    canHaveChains: Boolean(pickFirst(device.can_have_chains, device.canHaveChains)),
    isSelected: Boolean(pickFirst(device.is_selected, device.isSelected)),
    isEnabled: pickFirst(device.is_enabled, device.isEnabled) ?? null,
    parameterIds: []
  };
}

export function normalizeParameter(parameter, deviceId, existingEntity, options = {}) {
  const index =
    pickFirst(parameter.parameter_index, parameter.parameterIndex, parameter.index) ?? 0;
  const parameterId = parameter.id ?? makeParameterId(deviceId, index);
  const observedAt = isoNow(options.observedAt ?? parameter.observed_at);

  const valueItems = asArray(pickFirst(parameter.value_items, parameter.valueItems)).map(String);
  const hasExplicitEnumLabels = valueItems.length > 0;
  const isQuantized = Boolean(pickFirst(parameter.is_quantized, parameter.isQuantized));
  const allowedValues = hasExplicitEnumLabels
    ? valueItems.map((label, offset) => ({
        value: (parameter.min ?? 0) + offset,
        label
      }))
    : isQuantized &&
        Number.isFinite(parameter.min) &&
        Number.isFinite(parameter.max) &&
        Number.isInteger(parameter.min) &&
        Number.isInteger(parameter.max) &&
        parameter.max - parameter.min <= 32
      ? Array.from({ length: parameter.max - parameter.min + 1 }, (_, offset) => ({
          value: parameter.min + offset,
          label: String(parameter.min + offset)
        }))
      : [];
  const enumLabels = Object.fromEntries(
    allowedValues
      .filter((entry) => entry.label)
      .map((entry) => [String(entry.value), entry.label])
  );

  return {
    ...createBaseEntity({
      existingEntity,
      id: parameterId,
      kind: "parameter",
      sourcePath: toSourcePath(parameter.path, `${deviceId}.parameters.${index}`),
      observedAt
    }),
    deviceId,
    index,
    name: parameter.name ?? `Parameter ${index + 1}`,
    value: parameter.value ?? null,
    min: parameter.min ?? null,
    max: parameter.max ?? null,
    isQuantized,
    displayValue: pickFirst(parameter.display_value, parameter.displayValue) ?? null,
    unit: parameter.unit ?? null,
    valueItems,
    allowedValues,
    enumLabels
  };
}

export function normalizeTrackBundle(track, existingState = {}, options = {}) {
  const normalizedTrack = normalizeTrack(track, existingState.track, options);

  const sessionClips = asArray(track.session_clips).map((clip) =>
    normalizeClip(clip, normalizedTrack.id, existingState.clips?.[clip.id], options)
  );
  const arrangementClips = asArray(track.arrangement_clips).map((clip) =>
    normalizeClip(clip, normalizedTrack.id, existingState.clips?.[clip.id], options)
  );
  const devices = asArray(track.devices).map((device) => {
    const normalizedDevice = normalizeDevice(
      device,
      normalizedTrack.id,
      existingState.devices?.[device.id],
      options
    );
    const parameters = asArray(device.parameters).map((parameter) =>
      normalizeParameter(
        parameter,
        normalizedDevice.id,
        existingState.parameters?.[parameter.id],
        options
      )
    );

    normalizedDevice.parameterIds = parameters.map((parameter) => parameter.id);
    return {
      device: normalizedDevice,
      parameters
    };
  });

  normalizedTrack.sessionClipIds = sessionClips.map((clip) => clip.id);
  normalizedTrack.arrangementClipIds = arrangementClips.map((clip) => clip.id);
  normalizedTrack.deviceIds = devices.map(({ device }) => device.id);

  return {
    track: normalizedTrack,
    sessionClips,
    arrangementClips,
    devices
  };
}
