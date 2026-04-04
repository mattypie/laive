import {
  BridgeClient,
  BridgeServer,
  FixtureLiveRuntime
} from "../../live-bridge-remote-script/src/index.js";
import { createStructuredLogger } from "../../common/src/index.js";
import { createStateEngine } from "../../state-engine/src/index.js";
import { getRootPackageVersion } from "./package-version.js";

function parseLiveVersion(versionLabel) {
  const [major, minor, bugfix] = String(versionLabel ?? "0.0.0")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);

  return {
    version: versionLabel ?? "unknown",
    major_version: major,
    minor_version: minor,
    bugfix_version: bugfix,
    mode: "live_set"
  };
}

function normalizeParameter(parameter) {
  const displayValue = parameter.display_value ?? parameter.displayValue ?? null;
  const valueItems = parameter.value_items ?? parameter.valueItems ?? [];
  const allowedValues = parameter.allowed_values ?? parameter.allowedValues ?? [];
  const enumLabels = parameter.enum_labels ?? parameter.enumLabels ?? {};
  const isQuantized = parameter.is_quantized ?? parameter.isQuantized ?? false;
  return {
    ...parameter,
    is_quantized: isQuantized,
    isQuantized,
    value_items: valueItems,
    valueItems,
    allowed_values: allowedValues,
    allowedValues,
    enum_labels: enumLabels,
    enumLabels,
    display_value: displayValue,
    displayValue
  };
}

function normalizeDevice(device) {
  return {
    ...device,
    parameters: (device.parameters ?? []).map(normalizeParameter)
  };
}

function normalizeAlias(value) {
  return String(value ?? "").trim();
}

function buildLookupAliases(...values) {
  const aliases = new Set();
  for (const value of values) {
    let current = normalizeAlias(value);
    while (current) {
      aliases.add(current);
      const trimmed = current.replace(/^[A-Za-z][-\s]/, "").trim();
      if (trimmed === current) {
        break;
      }
      current = trimmed;
    }
  }
  return [...aliases];
}

function normalizeRoutingChoice(choice) {
  if (!choice) {
    return choice;
  }
  const displayName = choice.display_name ?? choice.displayName ?? null;
  const identifier = choice.identifier ?? null;
  return {
    ...choice,
    display_name: displayName,
    displayName,
    identifier,
    aliases: buildLookupAliases(displayName, identifier)
  };
}

function normalizeSend(send, index) {
  const name = send.name ?? `Send ${String.fromCharCode(65 + index)}`;
  const match = String(name).match(/^([A-Za-z])[-\s](.+)$/);
  const sendLetter = match?.[1] ?? null;
  const shortName = match?.[2]?.trim() ?? null;
  return {
    ...send,
    index: Number.isInteger(send.index) ? send.index : index,
    name,
    sendLetter,
    shortName,
    aliases: buildLookupAliases(name, shortName, sendLetter, `Send ${sendLetter ?? ""}`.trim()),
    is_quantized: send.is_quantized ?? send.isQuantized ?? false,
    isQuantized: send.is_quantized ?? send.isQuantized ?? false,
    display_value: send.display_value ?? send.displayValue ?? null,
    displayValue: send.display_value ?? send.displayValue ?? null
  };
}

function normalizeClip(trackId, clip) {
  const noteCount = clip.note_count ?? clip.noteCount ?? clip.notes?.length ?? null;
  return {
    ...clip,
    track_id: clip.track_id ?? trackId,
    location: clip.location ?? "session",
    note_count: noteCount,
    noteCount
  };
}

function normalizeTrack(track) {
  const armed = track.armed ?? track.arm ?? false;
  const muted = track.muted ?? track.mute ?? false;
  const soloed = track.soloed ?? track.solo ?? false;
  const sends = (track.sends ?? []).map((send, index) => normalizeSend(send, index));
  const availableInputRoutingTypes =
    track.availableInputRoutingTypes ?? track.available_input_routing_types ?? null;
  const availableInputRoutingChannels =
    track.availableInputRoutingChannels ?? track.available_input_routing_channels ?? null;
  const availableOutputRoutingTypes =
    track.availableOutputRoutingTypes ?? track.available_output_routing_types ?? null;
  const availableOutputRoutingChannels =
    track.availableOutputRoutingChannels ?? track.available_output_routing_channels ?? null;
  return {
    ...track,
    section: track.section ?? "visible",
    armed,
    muted,
    soloed,
    arm: armed,
    mute: muted,
    solo: soloed,
    monitoring_state:
      track.monitoring_state ?? track.monitoringState ?? track.current_monitoring_state ?? track.currentMonitoringState ?? null,
    monitoringState:
      track.monitoringState ?? track.monitoring_state ?? track.currentMonitoringState ?? track.current_monitoring_state ?? null,
    input_routing_type: track.input_routing_type ?? track.inputRoutingType ?? null,
    inputRoutingType: track.inputRoutingType ?? track.input_routing_type ?? null,
    input_routing_channel: track.input_routing_channel ?? track.inputRoutingChannel ?? null,
    inputRoutingChannel: track.inputRoutingChannel ?? track.input_routing_channel ?? null,
    output_routing_type: track.output_routing_type ?? track.outputRoutingType ?? null,
    outputRoutingType: track.outputRoutingType ?? track.output_routing_type ?? null,
    output_routing_channel: track.output_routing_channel ?? track.outputRoutingChannel ?? null,
    outputRoutingChannel: track.outputRoutingChannel ?? track.output_routing_channel ?? null,
    available_input_routing_types: availableInputRoutingTypes,
    availableInputRoutingTypes: (availableInputRoutingTypes ?? []).map(normalizeRoutingChoice),
    available_input_routing_channels: availableInputRoutingChannels,
    availableInputRoutingChannels: (availableInputRoutingChannels ?? []).map(normalizeRoutingChoice),
    available_output_routing_types: availableOutputRoutingTypes,
    availableOutputRoutingTypes: (availableOutputRoutingTypes ?? []).map(normalizeRoutingChoice),
    available_output_routing_channels: availableOutputRoutingChannels,
    availableOutputRoutingChannels: (availableOutputRoutingChannels ?? []).map(normalizeRoutingChoice),
    availableRouting: {
      inputTypes: (availableInputRoutingTypes ?? []).map(normalizeRoutingChoice),
      inputChannels: (availableInputRoutingChannels ?? []).map(normalizeRoutingChoice),
      outputTypes: (availableOutputRoutingTypes ?? []).map(normalizeRoutingChoice),
      outputChannels: (availableOutputRoutingChannels ?? []).map(normalizeRoutingChoice)
    },
    sends,
    devices: (track.devices ?? []).map(normalizeDevice),
    session_clips: (track.session_clips ?? []).map((clip) => normalizeClip(track.id, clip)),
    arrangement_clips: (track.arrangement_clips ?? []).map((clip) =>
      normalizeClip(track.id, { ...clip, location: "arrangement" })
    )
  };
}

function toRuntimeSnapshot({ liveVersion, capabilities, song, scenes, tracks }) {
  return {
    observed_at: new Date().toISOString(),
    bridge_version: getRootPackageVersion(),
    live_version: liveVersion,
    application: parseLiveVersion(liveVersion),
    song: {
      ...song,
      is_recording: song.is_recording ?? false,
      metronome: song.metronome ?? false
    },
    selection: null,
    capabilities: {
      runtime_version: "bridge",
      supported_commands: ["get", "set", "call", "subscribe", "unsubscribe"],
      supported_events: [
        "transport.changed",
        "track.added",
        "track.updated",
        "scene.updated",
        "scene.added",
        "clip.updated",
        "state.dirty"
      ],
      features: capabilities
    },
    scenes,
    tracks: tracks.map(normalizeTrack)
  };
}

export function mapBridgeEvent(topic, payload) {
  switch (topic) {
    case "transport.changed":
      return { event: "transport.changed", payload };
    case "tracks.changed":
      return {
        event: payload.action === "created" ? "track.added" : "track.updated",
        payload: payload.track ? normalizeTrack(payload.track) : payload
      };
    case "clips.changed":
      if (payload.action === "scene-created") {
        return {
          event: "scene.added",
          payload: payload.scene
        };
      }

      if (payload.action === "clip-created") {
        return {
          event: "clip.updated",
          payload: {
            ...normalizeClip(payload.track_id, payload.clip),
            track_id: payload.track_id
          }
        };
      }

      if (payload.action === "clip-fired") {
        return {
          event: "clip.updated",
          payload: {
            ...normalizeClip(payload.track_id, payload.clip ?? { id: payload.clip_id, is_playing: true }),
            id: payload.clip_id,
            track_id: payload.track_id
          }
        };
      }

      if (payload.action === "scene-fired") {
        return {
          event: "scene.updated",
          payload: payload.scene ?? { id: payload.scene_id }
        };
      }

      if (payload.action === "track-playback-changed" && payload.track) {
        return {
          event: "track.updated",
          payload: normalizeTrack(payload.track)
        };
      }

      return {
        event: "state.dirty",
        payload: {
          paths: [
            payload.clip_id ??
              payload.track_id ??
              payload.scene_id ??
              "song.clips"
          ]
        }
      };
    case "parameters.changed":
      return {
        event: "state.dirty",
        payload: {
          paths: [payload.parameter_id ?? "song.parameters"]
        }
      };
    default:
      return null;
  }
}

async function buildRuntimeSnapshot(bridgeClient) {
  const [hello, capabilities, song, scenes, tracks, returnTracks, masterTrack] = await Promise.all([
    bridgeClient.request("hello"),
    bridgeClient.request("capabilities"),
    bridgeClient.request("get", "song"),
    bridgeClient.request("get", "scenes"),
    bridgeClient.request("get", "tracks"),
    optionalBridgeRequest(bridgeClient, "get", "return_tracks"),
    optionalBridgeRequest(bridgeClient, "get", "master_track")
  ]);

  const mergedTracks = [];
  const seenTrackIds = new Set();
  for (const track of [
    ...(tracks.result ?? []),
    ...((returnTracks?.result ?? [])),
    ...((masterTrack?.result ? [masterTrack.result] : []))
  ]) {
    if (!track?.id || seenTrackIds.has(track.id)) {
      continue;
    }
    seenTrackIds.add(track.id);
    mergedTracks.push(track);
  }

  return toRuntimeSnapshot({
    liveVersion: hello.result.live_version,
    capabilities: capabilities.result,
    song: song.result,
    scenes: scenes.result,
    tracks: mergedTracks
  });
}

async function optionalBridgeRequest(bridgeClient, operation, target, args = {}, options = {}) {
  try {
    return await bridgeClient.request(operation, target, args, options);
  } catch (error) {
    if (
      /unknown target/i.test(String(error?.message ?? "")) ||
      /unsupported/i.test(String(error?.message ?? ""))
    ) {
      return null;
    }
    throw error;
  }
}

export function createAllowAllPolicyAdapter() {
  return {
    async assertAllowed() {
      return true;
    }
  };
}

async function resolveBridgeClient(target) {
  if (target && typeof target.ensureConnected === "function") {
    await target.ensureConnected();
    return target.bridgeClient;
  }

  return target;
}

export function createBridgeAdapter(target) {
  return {
    async getCapabilities() {
      const bridgeClient = await resolveBridgeClient(target);
      return (await bridgeClient.request("capabilities")).result;
    },
    async setTempo(tempo, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      return (
        await bridgeClient.request(
          "set",
          "song.tempo",
          { value: tempo },
          { dryRun: Boolean(options.dryRun) }
        )
      ).result;
    },
    async setArrangementTransport(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "set",
          "song.arrangement",
          {
            current_song_time: payload.currentSongTime,
            arrangement_position_beats: payload.arrangementPositionBeats,
            loop_enabled: payload.loopEnabled,
            loop_start_beats: payload.loopStartBeats,
            loop_length_beats: payload.loopLengthBeats
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: ["song"]
      };
    },
    async createTrack(kind, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "create_track",
          { type: kind, name: options.name ?? null },
          { dryRun: Boolean(options.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: result.track ? [result.track.id] : []
      };
    },
    async createReturnTrack(name = null, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "create_return_track",
          {
            name
          },
          { dryRun: Boolean(options.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: result.track ? [result.track.id] : ["return_tracks"]
      };
    },
    async playTransport(options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      return (
        await bridgeClient.request("call", "transport.play", {}, {
          dryRun: Boolean(options.dryRun)
        })
      ).result;
    },
    async stopTransport(options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      return (
        await bridgeClient.request("call", "transport.stop", {}, {
          dryRun: Boolean(options.dryRun)
        })
      ).result;
    },
    async createScene(name = null, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "create_scene",
          {
            name
          },
          { dryRun: Boolean(options.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: result.scene ? [result.scene.id] : ["scenes"]
      };
    },
    async createClip(payload) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "create_clip",
          {
            track_id: payload.trackId,
            slot_index: payload.slotIndex,
            length_beats: payload.lengthBeats,
            name: payload.name
          },
          { dryRun: Boolean(payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: result.clip ? [payload.trackId, result.clip.id] : [payload.trackId]
      };
    },
    async createArrangementClip(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "create_arrangement_clip",
          {
            track_id: payload.trackId,
            start_beats: payload.startBeats,
            length_beats: payload.lengthBeats,
            name: payload.name
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: result.clip ? [payload.trackId, result.clip.id] : [payload.trackId]
      };
    },
    async renameClip(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "rename_clip",
          {
            clip_id: payload.clipId,
            name: payload.name
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.clipId]
      };
    },
    async duplicateClip(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "duplicate_clip",
          {
            clip_id: payload.clipId,
            target_track_id: payload.targetTrackId ?? null,
            target_slot_index: payload.targetSlotIndex
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.clipId, result.clip?.id ?? null].filter(Boolean)
      };
    },
    async moveSessionClip(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "move_session_clip",
          {
            clip_id: payload.clipId,
            target_track_id: payload.targetTrackId ?? null,
            target_slot_index: payload.targetSlotIndex
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.clipId, result.clip?.id ?? null].filter(Boolean)
      };
    },
    async duplicateClipToArrangement(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "duplicate_clip_to_arrangement",
          {
            clip_id: payload.clipId,
            destination_beats: payload.destinationBeats,
            target_track_id: payload.targetTrackId ?? null
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.targetTrackId ?? null, payload.clipId, result.clip?.id ?? null].filter(Boolean)
      };
    },
    async moveArrangementClip(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "move_arrangement_clip",
          {
            clip_id: payload.clipId,
            destination_beats: payload.destinationBeats
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [result.track_id ?? null, payload.clipId, result.clip?.id ?? null].filter(Boolean)
      };
    },
    async setArrangementClipBounds(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "set_arrangement_clip_bounds",
          {
            clip_id: payload.clipId,
            start_beats: payload.startBeats,
            end_beats: payload.endBeats
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.clipId, result.clip?.id ?? null].filter(Boolean)
      };
    },
    async deleteClip(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "delete_clip",
          {
            clip_id: payload.clipId
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.clipId]
      };
    },
    async setClipLoopOrLength(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "set_clip_loop_or_length",
          {
            clip_id: payload.clipId,
            length_beats: payload.lengthBeats,
            loop_start_beats: payload.loopStartBeats,
            loop_end_beats: payload.loopEndBeats,
            looping: payload.looping
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.clipId]
      };
    },
    async insertNotes(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "insert_notes",
          {
            clip_id: payload.clipId,
            notes: (payload.notes ?? []).map((note) => ({
              pitch: note.pitch,
              start_beats: note.startBeats ?? note.start_beats,
              duration_beats: note.durationBeats ?? note.duration_beats,
              velocity: note.velocity,
              mute: note.mute ?? false
            }))
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.clipId]
      };
    },
    async replaceNotes(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "replace_notes",
          {
            clip_id: payload.clipId,
            notes: (payload.notes ?? []).map((note) => ({
              pitch: note.pitch,
              start_beats: note.startBeats ?? note.start_beats,
              duration_beats: note.durationBeats ?? note.duration_beats,
              velocity: note.velocity,
              mute: note.mute ?? false
            }))
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.clipId]
      };
    },
    async launchClip(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "launch_clip",
          {
            clip_id: payload.clipId
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.clipId]
      };
    },
    async launchScene(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "launch_scene",
          {
            scene_id: payload.sceneId
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.sceneId]
      };
    },
    async stopTrackClips(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "stop_track_clips",
          {
            track_id: payload.trackId
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.trackId]
      };
    },
    async stopAllClips(options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "stop_all_clips",
          {},
          { dryRun: Boolean(options.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: ["song"]
      };
    },
    async setParameter(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "set",
          payload.parameterId,
          { value: payload.value },
          { dryRun: Boolean(options.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.trackId, payload.deviceId, payload.parameterId]
      };
    },
    async setTrackVolume(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "set",
          "track.volume",
          {
            track_id: payload.trackId,
            value: payload.value
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.trackId]
      };
    },
    async setTrackPanning(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "set",
          "track.panning",
          {
            track_id: payload.trackId,
            value: payload.value
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.trackId]
      };
    },
    async setSendLevel(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "set",
          "track.send",
          {
            track_id: payload.trackId,
            send_index: payload.sendIndex,
            value: payload.value
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.trackId]
      };
    },
    async setMonitorState(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "set",
          "track.monitoring_state",
          {
            track_id: payload.trackId,
            monitoring_state: payload.monitoringState
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.trackId]
      };
    },
    async setTrackRouting(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "set",
          "track.routing",
          {
            track_id: payload.trackId,
            input_routing_type: payload.inputRoutingType ?? null,
            input_routing_channel: payload.inputRoutingChannel ?? null,
            output_routing_type: payload.outputRoutingType ?? null,
            output_routing_channel: payload.outputRoutingChannel ?? null
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.trackId]
      };
    },
    async getBrowserTree() {
      const bridgeClient = await resolveBridgeClient(target);
      return (await bridgeClient.request("get", "browser.tree")).result;
    },
    async getBrowserItems(payload = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      return (
        await bridgeClient.request("call", "get_browser_items", {
          path: payload.path ?? null
        })
      ).result;
    },
    async loadBrowserItem(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "load_browser_item",
          {
            track_id: payload.trackId,
            uri: payload.uri ?? null,
            path: payload.path ?? null
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: result.track ? [payload.trackId, ...((result.track.devices ?? []).map((device) => device.id))] : [payload.trackId]
      };
    },
    async selectTrack(payload, options = {}) {
      const bridgeClient = await resolveBridgeClient(target);
      const result = (
        await bridgeClient.request(
          "call",
          "select_track",
          {
            track_id: payload.trackId
          },
          { dryRun: Boolean(options.dryRun ?? payload.dryRun) }
        )
      ).result;

      return {
        ...result,
        affectedObjects: [payload.trackId]
      };
    }
  };
}

export function createStateAdapter(session) {
  function stateVersion() {
    return session.stateEngine.getState().meta.snapshotVersion;
  }

  function trackList() {
    const state = session.stateEngine.getState();
    return state.trackOrder.map((trackId) => {
      const track = state.tracks[trackId];
      return {
        id: track.id,
        name: track.name,
        index: track.index,
        section: track.section,
        stateVersion: stateVersion()
      };
    });
  }

  function visibleTrackList() {
    return trackList().filter((track) => track.section === "visible");
  }

  return {
    async getProjectSummary() {
      if (typeof session.ensureConnected === "function") {
        await session.ensureConnected();
      }
      const summary = session.stateEngine.query.summarizeProject();
      return {
        ...summary,
        stateVersion: summary.snapshotVersion,
        tracks: visibleTrackList()
      };
    },
    async getSelectedContext() {
      if (typeof session.ensureConnected === "function") {
        await session.ensureConnected();
      }
      const context = session.stateEngine.query.getSelectedContext() ?? {};
      return {
        stateVersion: stateVersion(),
        ...context
      };
    },
    async listTracks() {
      if (typeof session.ensureConnected === "function") {
        await session.ensureConnected();
      }
      return visibleTrackList();
    },
    async getArrangementSummary() {
      if (typeof session.ensureConnected === "function") {
        await session.ensureConnected();
      }
      const arrangement = session.stateEngine.query.getArrangementSummary();
      return {
        ...arrangement,
        stateVersion: arrangement.snapshotVersion
      };
    },
    async getArrangementTrackDetails(target) {
      if (typeof session.ensureConnected === "function") {
        await session.ensureConnected();
      }
      const track =
        session.stateEngine.getState().tracks[target] ?? session.stateEngine.query.findTrack(target);

      if (!track) {
        throw new Error(`Track not found: ${target}`);
      }

      const details = session.stateEngine.query.getArrangementTrackDetails(track.id);
      return {
        id: track.id,
        name: track.name,
        stateVersion: stateVersion(),
        ...details
      };
    },
    async listReturnTracks() {
      if (typeof session.ensureConnected === "function") {
        await session.ensureConnected();
      }
      return trackList().filter((track) => track.section === "return");
    },
    async getMasterTrack() {
      if (typeof session.ensureConnected === "function") {
        await session.ensureConnected();
      }
      const state = session.stateEngine.getState();
      const trackId = state.masterTrackId;
      if (!trackId) {
        throw new Error("Master track not found");
      }
      const details = session.stateEngine.query.getTrackDetails(trackId);
      return {
        id: details.track.id,
        name: details.track.name,
        stateVersion: stateVersion(),
        ...details
      };
    },
    async getTrackDetails(target) {
      if (typeof session.ensureConnected === "function") {
        await session.ensureConnected();
      }
      const track =
        session.stateEngine.getState().tracks[target] ?? session.stateEngine.query.findTrack(target);

      if (!track) {
        throw new Error(`Track not found: ${target}`);
      }

      const details = session.stateEngine.query.getTrackDetails(track.id);
      return {
        id: track.id,
        name: track.name,
        stateVersion: stateVersion(),
        ...details
      };
    },
    async getDeviceTree(trackId) {
      if (typeof session.ensureConnected === "function") {
        await session.ensureConnected();
      }
      const details = session.stateEngine.query.getTrackDetails(trackId);
      if (!details) {
        throw new Error(`Track not found: ${trackId}`);
      }

      return {
        trackId,
        stateVersion: stateVersion(),
        devices: details.devices
      };
    },
    async refreshState(target) {
      if (typeof session.ensureConnected === "function") {
        await session.ensureConnected();
      }
      const previousStateVersion = stateVersion();
      await session.syncSnapshot();
      return {
        target,
        previousStateVersion,
        stateVersion: stateVersion(),
        affectedObjects: [target],
        warnings: []
      };
    }
  };
}

export class LaiveBridgeSession {
  constructor({ bridgeClient, stateEngine = createStateEngine(), teardown = () => {}, logger = null }) {
    this.bridgeClient = bridgeClient;
    this.stateEngine = stateEngine;
    this.teardown = teardown;
    this.logger = logger ?? createStructuredLogger({ component: "mcp-session" });
    this.boundEventHandler = (message) => {
      this.logger.debug("bridge_session.event", {
        topic: message.topic
      });
      const mapped = mapBridgeEvent(message.topic, message.payload ?? {});
      if (mapped) {
        this.stateEngine.applyEvent(mapped, {
          observedAt: message.timestamp
        });
      }
    };
  }

  static async connect({
    host = process.env.LAIVE_BRIDGE_HOST ?? "127.0.0.1",
    port = Number.parseInt(process.env.LAIVE_BRIDGE_PORT ?? "7612", 10),
    clientId = process.env.LAIVE_BRIDGE_CLIENT_ID ?? "laive-mcp-session",
    socketFactory = null,
    logger = null
  } = {}) {
    const sessionLogger = logger ?? createStructuredLogger({ component: "mcp-session" });
    const bridgeClient = new BridgeClient({
      host,
      port,
      clientId,
      socketFactory,
      logger: sessionLogger.child("bridge-client", {
        fileName: "bridge-client.jsonl"
      })
    });
    await bridgeClient.connect();
    const session = new LaiveBridgeSession({ bridgeClient, logger: sessionLogger });
    await session.start();
    return session;
  }

  static createLazy(options = {}) {
    return new LaiveLazySession(options);
  }

  async start() {
    this.logger.info("bridge_session.starting");
    this.bridgeClient.on("event", this.boundEventHandler);
    await Promise.all([
      this.bridgeClient.subscribe("transport.changed"),
      this.bridgeClient.subscribe("tracks.changed"),
      this.bridgeClient.subscribe("clips.changed"),
      this.bridgeClient.subscribe("parameters.changed")
    ]);
    await this.syncSnapshot();
    this.logger.info("bridge_session.started");
  }

  async syncSnapshot() {
    this.logger.debug("bridge_session.sync_snapshot");
    const snapshot = await buildRuntimeSnapshot(this.bridgeClient);
    this.stateEngine.applySnapshot(snapshot, {
      observedAt: snapshot.observed_at
    });
    this.logger.debug("bridge_session.snapshot_applied", {
      observedAt: snapshot.observed_at
    });
    return this.stateEngine.getState();
  }

  async close() {
    this.logger.info("bridge_session.closing");
    this.bridgeClient.off("event", this.boundEventHandler);
    await this.bridgeClient.disconnect();
    this.teardown();
  }
}

export class LaiveFixtureSession extends LaiveBridgeSession {
  static async create(options = {}) {
    const runtime = await FixtureLiveRuntime.fromFixture(options.fixturePath);
    const server = new BridgeServer({ runtime });
    const sockets = createLoopbackSocketPair();
    runtime.on("event", server.boundRuntimeEventHandler);
    server.attachClient(sockets.serverSocket);
    const bridgeClient = new BridgeClient({
      clientId: options.clientId ?? "laive-fixture-session",
      socketFactory() {
        queueMicrotask(() => {
          sockets.clientSocket.emit("connect");
        });
        return sockets.clientSocket;
      }
    });
    await bridgeClient.connect();

    const session = new LaiveFixtureSession({
      bridgeClient,
      teardown() {
        runtime.off("event", server.boundRuntimeEventHandler);
        sockets.serverSocket.destroy();
      }
    });
    await session.start();
    return session;
  }
}

export class LaiveLazySession {
  constructor({
    host = process.env.LAIVE_BRIDGE_HOST ?? "127.0.0.1",
    port = Number.parseInt(process.env.LAIVE_BRIDGE_PORT ?? "7612", 10),
    clientId = process.env.LAIVE_BRIDGE_CLIENT_ID ?? "laive-mcp-session",
    socketFactory = null,
    logger = null
  } = {}) {
    this.connectionOptions = {
      host,
      port,
      clientId,
      socketFactory,
      logger
    };
    this.stateEngine = createStateEngine();
    this.bridgeClient = null;
    this.activeSession = null;
    this.connectingPromise = null;
    this.logger = logger ?? createStructuredLogger({ component: "mcp-session" });
    this.boundActiveSessionClose = null;
  }

  async ensureConnected() {
    if (this.activeSession && this.bridgeClient?.socket) {
      return this.activeSession;
    }

    if (this.activeSession && !this.bridgeClient?.socket) {
      this.logger.warn("bridge_session.stale_session_detected");
      this._clearActiveSession();
    }

    if (!this.connectingPromise) {
      this.logger.info("bridge_session.connecting", {
        host: this.connectionOptions.host,
        port: this.connectionOptions.port
      });
      this.connectingPromise = LaiveBridgeSession.connect(this.connectionOptions)
        .then((session) => {
          this._bindActiveSession(session);
          this.activeSession = session;
          this.bridgeClient = session.bridgeClient;
          this.stateEngine = session.stateEngine;
          this.logger.info("bridge_session.connected", {
            host: this.connectionOptions.host,
            port: this.connectionOptions.port
          });
          return session;
        })
        .catch((error) => {
          this.logger.error("bridge_session.connect_failed", error);
          throw error;
        })
        .finally(() => {
          this.connectingPromise = null;
        });
    }

    return await this.connectingPromise;
  }

  async syncSnapshot() {
    const session = await this.ensureConnected();
    return await session.syncSnapshot();
  }

  async close() {
    if (this.activeSession) {
      await this.activeSession.close();
    }
    this._clearActiveSession();
  }

  _bindActiveSession(session) {
    const onClose = () => {
      if (this.activeSession === session) {
        this.logger.warn("bridge_session.connection_closed");
        this._clearActiveSession();
      }
    };
    this.boundActiveSessionClose = onClose;
    session.bridgeClient.on("close", onClose);
    session.bridgeClient.on("error", (error) => {
      this.logger.error("bridge_session.connection_error", error);
    });
  }

  _clearActiveSession() {
    if (this.activeSession?.bridgeClient && this.boundActiveSessionClose) {
      this.activeSession.bridgeClient.off("close", this.boundActiveSessionClose);
    }
    this.boundActiveSessionClose = null;
    this.activeSession = null;
    this.bridgeClient = null;
    this.stateEngine = createStateEngine();
  }
}

function createLoopbackSocketPair() {
  const serverSocket = new FakeSocket();
  const clientSocket = new FakeSocket();
  serverSocket.peer = clientSocket;
  clientSocket.peer = serverSocket;
  return { serverSocket, clientSocket };
}

class FakeSocket {
  constructor() {
    this.peer = null;
    this.closed = false;
    this.listeners = new Map();
  }

  setEncoding() {}

  on(eventName, listener) {
    const listeners = this.listeners.get(eventName) ?? [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
    return this;
  }

  off(eventName, listener) {
    const listeners = this.listeners.get(eventName) ?? [];
    this.listeners.set(
      eventName,
      listeners.filter((candidate) => candidate !== listener)
    );
    return this;
  }

  once(eventName, listener) {
    const wrapped = (...args) => {
      this.off(eventName, wrapped);
      listener(...args);
    };
    return this.on(eventName, wrapped);
  }

  emit(eventName, ...args) {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener(...args);
    }
  }

  write(chunk) {
    if (this.closed) {
      return false;
    }

    const payload = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    queueMicrotask(() => {
      if (!this.peer?.closed) {
        this.peer.emit("data", payload);
      }
    });
    return true;
  }

  end() {
    this.closed = true;
    queueMicrotask(() => {
      this.emit("end");
      this.emit("close");

      if (this.peer && !this.peer.closed) {
        this.peer.closed = true;
        this.peer.emit("end");
        this.peer.emit("close");
      }
    });
  }

  destroy() {
    this.end();
  }
}
