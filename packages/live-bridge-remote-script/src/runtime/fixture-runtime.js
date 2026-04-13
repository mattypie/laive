import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const defaultFixturePath = fileURLToPath(
  new URL("../fixtures/default-live-set.json", import.meta.url)
);

function defaultBrowserState() {
  return {
    roots: [
      {
        name: "Instruments",
        path: "instruments",
        uri: "browser:instruments",
        is_folder: true,
        is_device: false,
        is_loadable: false,
        children: [
          {
            name: "Operator",
            path: "instruments/Operator",
            uri: "browser:instruments:operator",
            is_folder: false,
            is_device: true,
            is_loadable: true
          },
          {
            name: "Analog",
            path: "instruments/Analog",
            uri: "browser:instruments:analog",
            is_folder: false,
            is_device: true,
            is_loadable: true
          }
        ]
      },
      {
        name: "Audio Effects",
        path: "audio_effects",
        uri: "browser:audio_effects",
        is_folder: true,
        is_device: false,
        is_loadable: false,
        children: [
          {
            name: "EQ Eight",
            path: "audio_effects/EQ Eight",
            uri: "browser:audio_effects:eq-eight",
            is_folder: false,
            is_device: true,
            is_loadable: true
          }
        ]
      },
      {
        name: "MIDI Effects",
        path: "midi_effects",
        uri: "browser:midi_effects",
        is_folder: true,
        is_device: false,
        is_loadable: false,
        children: [
          {
            name: "Arpeggiator",
            path: "midi_effects/Arpeggiator",
            uri: "browser:midi_effects:arpeggiator",
            is_folder: false,
            is_device: true,
            is_loadable: true
          }
        ]
      }
    ]
  };
}

export class FixtureLiveRuntime extends EventEmitter {
  constructor(fixtureState) {
    super();
    this.state = {
      ...fixtureState,
      browser: fixtureState.browser ?? defaultBrowserState()
    };
  }

  static async fromFixture(fixturePath = defaultFixturePath) {
    const payload = JSON.parse(await readFile(fixturePath, "utf8"));
    return new FixtureLiveRuntime(payload);
  }

  get liveVersion() {
    return this.state.live_version;
  }

  get capabilities() {
    return clone(this.state.capabilities);
  }

  async execute(message) {
    switch (message.operation) {
      case "hello":
        return {
          bridge: "laive-fixture-runtime",
          protocol_version: "0.1.0",
          live_version: this.liveVersion
        };
      case "capabilities":
        return this.capabilities;
      case "health":
        return {
          status: "ok",
          fixture_loaded: true,
          track_count: this.state.tracks.length
        };
      case "get":
        return this.handleGet(message.target, message.arguments);
      case "set":
        return this.handleSet(message.target, message.arguments, message.dry_run);
      case "call":
        return this.handleCall(message.target, message.arguments, message.dry_run);
      default:
        throw new Error(`Unsupported runtime operation: ${message.operation}`);
    }
  }

  handleGet(target = "song") {
    switch (target) {
      case "song":
        return clone(this.state.song);
      case "arrangement":
        return clone(this.state.song);
      case "tracks":
        return clone(this.allTracks());
      case "return_tracks":
        return clone(
          this.state.return_tracks ?? this.allTracks().filter((track) => track.section === "return")
        );
      case "master_track":
        return clone(
          this.state.master_track ??
            this.allTracks().find((track) => track.section === "master") ??
            null
        );
      case "scenes":
        return clone(this.state.scenes);
      case "browser.tree":
        return clone(this.state.browser);
      case "selection":
        return clone(this.state.selected_context ?? {});
      default:
        return this.lookupTarget(target);
    }
  }

  handleSet(target, args, dryRun) {
    if (target === "song.tempo") {
      const tempo = Number(args.value);
      if (!Number.isFinite(tempo) || tempo <= 0) {
        throw new Error("tempo must be a positive number");
      }
      if (!dryRun) {
        this.state.song.tempo = tempo;
        this.emit("event", {
          topic: "transport.changed",
          payload: {
            tempo
          }
        });
      }
      return {
        target,
        applied: !dryRun,
        value: tempo
      };
    }

    if (target === "song.arrangement") {
      return this.setArrangementTransport(args, dryRun);
    }

    if (target?.startsWith("parameter:")) {
      return this.setParameter(target, args, dryRun);
    }

    if (target === "track.send") {
      return this.setSendLevel(args, dryRun);
    }

    if (target === "track.volume") {
      return this.setTrackLevel(args, dryRun, "volume", 0, 1);
    }

    if (target === "track.panning") {
      return this.setTrackLevel(args, dryRun, "panning", -1, 1);
    }

    if (target === "track.monitoring_state") {
      return this.setMonitorState(args, dryRun);
    }

    if (target === "track.routing") {
      return this.setTrackRouting(args, dryRun);
    }

    throw new Error(`Unsupported set target: ${target}`);
  }

  handleCall(target, args, dryRun) {
    switch (target) {
      case "transport.play":
        if (!dryRun) {
          this.state.song.is_playing = true;
          this.emit("event", {
            topic: "transport.changed",
            payload: { is_playing: true }
          });
        }
        return { target, applied: !dryRun, is_playing: true };
      case "transport.stop":
        if (!dryRun) {
          this.state.song.is_playing = false;
          this.emit("event", {
            topic: "transport.changed",
            payload: { is_playing: false }
          });
        }
        return { target, applied: !dryRun, is_playing: false };
      case "create_track":
        return this.createTrack(args, dryRun);
      case "create_return_track":
        return this.createReturnTrack(args, dryRun);
      case "create_scene":
        return this.createScene(args, dryRun);
      case "create_clip":
        return this.createClip(args, dryRun);
      case "create_arrangement_clip":
        return this.createArrangementClip(args, dryRun);
      case "rename_clip":
        return this.renameClip(args, dryRun);
      case "duplicate_clip":
        return this.duplicateClip(args, dryRun);
      case "duplicate_clip_to_arrangement":
        return this.duplicateClipToArrangement(args, dryRun);
      case "duplicate_arrangement_clip":
        return this.duplicateArrangementClip(args, dryRun);
      case "set_arrangement_clip_bounds":
        return this.setArrangementClipBounds(args, dryRun);
      case "split_arrangement_clip":
        return this.splitArrangementClip(args, dryRun);
      case "move_arrangement_clip":
        return this.moveArrangementClip(args, dryRun);
      case "move_session_clip":
        return this.moveSessionClip(args, dryRun);
      case "delete_clip":
        return this.deleteClip(args, dryRun);
      case "set_clip_loop_or_length":
        return this.setClipLoopOrLength(args, dryRun);
      case "insert_notes":
        return this.insertNotes(args, dryRun);
      case "replace_notes":
        return this.replaceNotes(args, dryRun);
      case "get_clip_envelopes":
        return this.getClipEnvelopes(args);
      case "show_clip_envelope":
        return this.showClipEnvelope(args, dryRun);
      case "hide_clip_envelope":
        return this.hideClipEnvelope(args, dryRun);
      case "select_clip_envelope_parameter":
        return this.selectClipEnvelopeParameter(args, dryRun);
      case "clear_clip_envelope":
        return this.clearClipEnvelope(args, dryRun);
      case "clear_all_clip_envelopes":
        return this.clearAllClipEnvelopes(args, dryRun);
      case "set_clip_envelope":
        return this.setClipEnvelope(args, dryRun);
      case "get_browser_items":
        return this.getBrowserItems(args);
      case "load_browser_item":
        return this.loadBrowserItem(args, dryRun);
      case "select_clip":
        return this.selectClip(args, dryRun);
      case "fire_clip":
      case "launch_clip":
        return this.fireClip(args, dryRun);
      case "fire_scene":
      case "launch_scene":
        return this.fireScene(args, dryRun);
      case "stop_track_clips":
        return this.stopTrackClips(args, dryRun);
      case "stop_all_clips":
        return this.stopAllClips(dryRun);
      default:
        throw new Error(`Unsupported call target: ${target}`);
    }
  }

  lookupTarget(target) {
    if (!target) {
      throw new Error("target is required");
    }

    if (target.startsWith("track:")) {
      return clone(this.findTrack(target));
    }

    if (target.startsWith("device:")) {
      return clone(this.findDevice(target));
    }

    if (target.startsWith("parameter:")) {
      return clone(this.findParameter(target));
    }

    if (target.startsWith("clip:")) {
      return clone(this.findClip(target));
    }

    throw new Error(`Unknown target: ${target}`);
  }

  findTrack(trackId) {
    const track = this.allTracks().find((item) => item.id === trackId);
    if (!track) {
      throw new Error(`Track not found: ${trackId}`);
    }
    return track;
  }

  allTracks() {
    return [
      ...(this.state.tracks ?? []),
      ...(this.state.return_tracks ?? []),
      ...(this.state.master_track ? [this.state.master_track] : [])
    ];
  }

  findDevice(deviceId) {
    for (const track of this.allTracks()) {
      const device = track.devices.find((item) => item.id === deviceId);
      if (device) {
        return device;
      }
    }
    throw new Error(`Device not found: ${deviceId}`);
  }

  findParameter(parameterId) {
    for (const track of this.allTracks()) {
      for (const device of track.devices) {
        const parameter = device.parameters.find((item) => item.id === parameterId);
        if (parameter) {
          return parameter;
        }
      }
    }
    throw new Error(`Parameter not found: ${parameterId}`);
  }

  findEnvelopeTarget(parameterId) {
    if (String(parameterId).startsWith("mixer:")) {
      const match = String(parameterId).match(/^mixer:(track(?::(?:return|master))?:\d+|track:master):(volume|panning)$/);
      if (!match) {
        throw new Error(`Envelope parameter not found: ${parameterId}`);
      }
      const track = this.findTrack(match[1]);
      const parameter = track?.[match[2]] ?? track?.mixer_device?.[match[2]];
      if (!parameter) {
        throw new Error(`Envelope parameter not found: ${parameterId}`);
      }
      return {
        parameter_id: parameterId,
        track_id: track.id,
        scope: "mixer",
        name: parameter.name ?? match[2],
        parameter: clone(parameter)
      };
    }

    if (String(parameterId).startsWith("send:")) {
      const match = String(parameterId).match(/^send:(track:\d+):(\d+)$/);
      if (!match) {
        throw new Error(`Envelope parameter not found: ${parameterId}`);
      }
      const track = this.findTrack(match[1]);
      const sendIndex = Number(match[2]) - 1;
      const send = track.mixer_device?.sends?.[sendIndex];
      if (!send) {
        throw new Error(`Envelope parameter not found: ${parameterId}`);
      }
      return {
        parameter_id: parameterId,
        track_id: track.id,
        scope: "send",
        name: send.name ?? `Send ${sendIndex + 1}`,
        send_index: sendIndex,
        parameter: clone(send)
      };
    }

    for (const track of this.allTracks()) {
      for (const device of track.devices) {
        const parameter = device.parameters.find((item) => item.id === parameterId);
        if (parameter) {
          return {
            parameter_id: parameterId,
            track_id: track.id,
            device_id: device.id,
            device_name: device.name,
            scope: "device",
            name: parameter.name,
            parameter: clone(parameter)
          };
        }
      }
    }

    throw new Error(`Envelope parameter not found: ${parameterId}`);
  }

  iterClipEnvelopeTargets(track) {
    if (!track) {
      return [];
    }
    const targets = [];
    if (track.mixer_device?.volume) {
      targets.push({
        parameter_id: `mixer:${track.id}:volume`,
        parameterId: `mixer:${track.id}:volume`,
        track_id: track.id,
        trackId: track.id,
        scope: "mixer",
        name: "Track Volume",
        parameter: clone(track.mixer_device.volume)
      });
    }
    if (track.mixer_device?.panning) {
      targets.push({
        parameter_id: `mixer:${track.id}:panning`,
        parameterId: `mixer:${track.id}:panning`,
        track_id: track.id,
        trackId: track.id,
        scope: "mixer",
        name: "Track Panning",
        parameter: clone(track.mixer_device.panning)
      });
    }
    for (const [index, send] of (track.mixer_device?.sends ?? []).entries()) {
      targets.push({
        parameter_id: `send:${track.id}:${index + 1}`,
        parameterId: `send:${track.id}:${index + 1}`,
        track_id: track.id,
        trackId: track.id,
        scope: "send",
        name: send.name ?? `Send ${index + 1}`,
        send_index: index,
        sendIndex: index,
        parameter: clone(send)
      });
    }
    for (const device of track.devices ?? []) {
      for (const parameter of device.parameters ?? []) {
        targets.push({
          parameter_id: parameter.id,
          parameterId: parameter.id,
          track_id: track.id,
          trackId: track.id,
          device_id: device.id,
          deviceId: device.id,
          device_name: device.name,
          deviceName: device.name,
          scope: "device",
          name: parameter.name,
          parameter: clone(parameter)
        });
      }
    }
    return targets;
  }

  findClip(clipId) {
    for (const track of this.state.tracks) {
      const clip = track.session_clips.find((item) => item.id === clipId);
      if (clip) {
        return clip;
      }
      const arrangementClip = (track.arrangement_clips ?? []).find((item) => item.id === clipId);
      if (arrangementClip) {
        return arrangementClip;
      }
    }
    throw new Error(`Clip not found: ${clipId}`);
  }

  setArrangementTransport(args, dryRun) {
    const updates = {};

    if (
      args.current_song_time === undefined &&
      args.arrangement_position_beats === undefined &&
      args.loop_enabled === undefined &&
      args.loop_start_beats === undefined &&
      args.loop_length_beats === undefined
    ) {
      throw new Error(
        "At least one arrangement field is required"
      );
    }

    if (args.current_song_time !== undefined || args.arrangement_position_beats !== undefined) {
      const currentSongTime = Number(
        args.current_song_time ?? args.arrangement_position_beats
      );
      if (!Number.isFinite(currentSongTime) || currentSongTime < 0) {
        throw new Error("current_song_time must be a non-negative number");
      }
      updates.current_song_time = currentSongTime;
      updates.arrangement_position_beats = currentSongTime;
    }

    if (args.loop_enabled !== undefined) {
      updates.loop_enabled = Boolean(args.loop_enabled);
    }

    if (args.loop_start_beats !== undefined) {
      const loopStartBeats = Number(args.loop_start_beats);
      if (!Number.isFinite(loopStartBeats) || loopStartBeats < 0) {
        throw new Error("loop_start_beats must be a non-negative number");
      }
      updates.loop_start_beats = loopStartBeats;
    }

    if (args.loop_length_beats !== undefined) {
      const loopLengthBeats = Number(args.loop_length_beats);
      if (!Number.isFinite(loopLengthBeats) || loopLengthBeats <= 0) {
        throw new Error("loop_length_beats must be a positive number");
      }
      updates.loop_length_beats = loopLengthBeats;
    }

    const nextSong = clone(this.state.song);
    nextSong.current_song_time =
      updates.current_song_time ?? nextSong.current_song_time ?? nextSong.arrangement_position_beats ?? 0;
    nextSong.arrangement_position_beats =
      updates.arrangement_position_beats ?? nextSong.arrangement_position_beats ?? nextSong.current_song_time ?? 0;
    const currentLoop = {
      enabled: nextSong.loop?.enabled ?? nextSong.loop_enabled ?? false,
      start_beats: nextSong.loop?.start_beats ?? nextSong.loop_start_beats ?? 0,
      length_beats: nextSong.loop?.length_beats ?? nextSong.loop_length_beats ?? 16
    };
    nextSong.loop_enabled = updates.loop_enabled ?? currentLoop.enabled;
    nextSong.loop_start_beats = updates.loop_start_beats ?? currentLoop.start_beats;
    nextSong.loop_length_beats = updates.loop_length_beats ?? currentLoop.length_beats;
    nextSong.loop = {
      enabled: nextSong.loop_enabled,
      start_beats: nextSong.loop_start_beats,
      length_beats: nextSong.loop_length_beats
    };

    if (!dryRun) {
      this.state.song = nextSong;
      this.emit("event", {
        topic: "transport.changed",
        payload: clone(this.state.song)
      });
    }

    return {
      applied: !dryRun,
      song: nextSong
    };
  }

  findBrowserItemByUri(uri, node = null) {
    const currentNode = node ?? { children: this.state.browser.roots };
    for (const child of currentNode.children ?? []) {
      if (child.uri === uri) {
        return child;
      }
      const nested = this.findBrowserItemByUri(uri, child);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  findBrowserItemByPath(pathValue) {
    const path = String(pathValue ?? "");
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) {
      throw new Error("path is required");
    }

    let current = this.state.browser.roots.find((root) => root.path.toLowerCase() === parts[0].toLowerCase());
    if (!current) {
      throw new Error(`Browser root not found: ${parts[0]}`);
    }

    for (const part of parts.slice(1)) {
      current = (current.children ?? []).find((child) => child.name.toLowerCase() === part.toLowerCase());
      if (!current) {
        throw new Error(`Browser path not found: ${path}`);
      }
    }

    return current;
  }

  setParameter(parameterId, args, dryRun) {
    const parameter = this.findParameter(parameterId);
    const value = Number(args.value);
    if (!Number.isFinite(value)) {
      throw new Error("parameter value must be numeric");
    }
    if (!dryRun) {
      parameter.value = Math.min(parameter.max, Math.max(parameter.min, value));
      this.emit("event", {
        topic: "parameters.changed",
        payload: { parameter_id: parameterId, value: parameter.value }
      });
    }
    return {
      target: parameterId,
      applied: !dryRun,
      value: Math.min(parameter.max, Math.max(parameter.min, value))
    };
  }

  setSendLevel(args, dryRun) {
    const track = this.findTrack(args.track_id);
    const sendIndex = Number(args.send_index);
    const value = Number(args.value);
    if (!Number.isInteger(sendIndex) || sendIndex < 0) {
      throw new Error("send_index must be a non-negative integer");
    }
    const send = (track.sends ?? [])[sendIndex];
    if (!send) {
      throw new Error(`Send not found: ${sendIndex}`);
    }
    if (!Number.isFinite(value)) {
      throw new Error("send value must be numeric");
    }
    if (!dryRun) {
      send.value = Math.min(send.max ?? 1, Math.max(send.min ?? 0, value));
      this.emit("event", {
        topic: "tracks.changed",
        payload: { action: "updated", track: clone(track) }
      });
    }
    return {
      applied: !dryRun,
      track: clone(track),
      send: clone(send)
    };
  }

  setTrackLevel(args, dryRun, field, minimum, maximum) {
    const track = this.findTrack(args.track_id);
    const value = Number(args.value);
    if (!Number.isFinite(value)) {
      throw new Error(`${field} must be numeric`);
    }
    const nextValue = Math.min(maximum, Math.max(minimum, value));
    if (!dryRun) {
      track[field] = nextValue;
      this.emit("event", {
        topic: "tracks.changed",
        payload: { action: "updated", track: clone(track) }
      });
    }
    return {
      applied: !dryRun,
      track: clone(track),
      parameter: {
        id: `mixer:${track.id}:${field}`,
        name: field === "volume" ? "Volume" : "Panning",
        value: nextValue,
        min: minimum,
        max: maximum,
        is_quantized: false,
        value_items: [],
        display_value: String(nextValue)
      }
    };
  }

  setMonitorState(args, dryRun) {
    const track = this.findTrack(args.track_id);
    const monitoringState = Number(args.monitoring_state);
    if (!Number.isFinite(monitoringState)) {
      throw new Error("monitoring_state must be numeric");
    }
    if (!dryRun) {
      track.monitoring_state = monitoringState;
      track.monitoringState = monitoringState;
      this.emit("event", {
        topic: "tracks.changed",
        payload: { action: "updated", track: clone(track) }
      });
    }
    return {
      applied: !dryRun,
      track: clone(track)
    };
  }

  setTrackRouting(args, dryRun) {
    const track = this.findTrack(args.track_id);
    if (!dryRun) {
      if (args.input_routing_type !== undefined) {
        const selected = this.resolveRoutingChoice(
          track.available_input_routing_types,
          args.input_routing_type
        );
        track.input_routing_type = selected;
        track.inputRoutingType = selected;
      }
      if (args.input_routing_channel !== undefined) {
        const selected = this.resolveRoutingChoice(
          track.available_input_routing_channels,
          args.input_routing_channel
        );
        track.input_routing_channel = selected;
        track.inputRoutingChannel = selected;
      }
      if (args.output_routing_type !== undefined) {
        const selected = this.resolveRoutingChoice(
          track.available_output_routing_types,
          args.output_routing_type
        );
        track.output_routing_type = selected;
        track.outputRoutingType = selected;
      }
      if (args.output_routing_channel !== undefined) {
        const selected = this.resolveRoutingChoice(
          track.available_output_routing_channels,
          args.output_routing_channel
        );
        track.output_routing_channel = selected;
        track.outputRoutingChannel = selected;
      }
      this.emit("event", {
        topic: "tracks.changed",
        payload: { action: "updated", track: clone(track) }
      });
    }
    return {
      applied: !dryRun,
      track: clone(track)
    };
  }

  resolveRoutingChoice(candidates = [], requested) {
    const normalized = String(requested ?? "").trim().toLowerCase();
    return (
      (candidates ?? []).find((candidate) =>
        [candidate.display_name, candidate.identifier]
          .filter(Boolean)
          .some((value) => String(value).trim().toLowerCase() === normalized)
      ) ?? {
        identifier: requested,
        display_name: requested
      }
    );
  }

  createTrack(args, dryRun) {
    const nextIndex = this.state.tracks.filter((track) => (track.section ?? "visible") === "visible").length;
    const nextId = `track:${nextIndex + 1}`;
    const returnTrackCount = this.allTracks().filter((track) => (track.section ?? "visible") === "return").length;
    const track = {
      id: nextId,
      index: nextIndex,
      section: "visible",
      name: args.name ?? `Track ${nextIndex + 1}`,
      type: args.type ?? "midi",
      color: args.color ?? 0,
      arm: false,
      mute: false,
      solo: false,
      monitoring_state: 1,
      monitoringState: 1,
      input_routing_type: { display_name: "All Ins", identifier: "all_ins" },
      inputRoutingType: { display_name: "All Ins", identifier: "all_ins" },
      input_routing_channel: { display_name: "All Channels", identifier: "all_channels" },
      inputRoutingChannel: { display_name: "All Channels", identifier: "all_channels" },
      output_routing_type: { display_name: "Master", identifier: "master" },
      outputRoutingType: { display_name: "Master", identifier: "master" },
      output_routing_channel: { display_name: "Post Mixer", identifier: "post_mixer" },
      outputRoutingChannel: { display_name: "Post Mixer", identifier: "post_mixer" },
      sends: Array.from({ length: returnTrackCount }, (_, index) => ({
        id: `${nextId}:send:${index + 1}`,
        name: `Send ${String.fromCharCode(65 + index)}`,
        value: 0,
        min: 0,
        max: 1,
        display_value: "0"
      })),
      playing_slot_index: -1,
      fired_slot_index: -1,
      devices: [],
      session_clips: [],
      arrangement_clips: []
    };

    if (!dryRun) {
      this.state.tracks.push(track);
      this.emit("event", {
        topic: "tracks.changed",
        payload: { action: "created", track }
      });
    }

    return {
      applied: !dryRun,
      track
    };
  }

  createReturnTrack(args, dryRun) {
    const nextIndex = (this.state.return_tracks ?? []).length;
    const track = {
      id: `track:return:${nextIndex + 1}`,
      index: nextIndex,
      section: "return",
      name: args.name ?? `${String.fromCharCode(65 + nextIndex)} Return`,
      type: "audio",
      color: args.color ?? 0,
      arm: false,
      mute: false,
      solo: false,
      monitoring_state: null,
      monitoringState: null,
      volume: 0.85,
      panning: 0,
      output_routing_type: { display_name: "Master", identifier: "master" },
      outputRoutingType: { display_name: "Master", identifier: "master" },
      output_routing_channel: { display_name: "Post Mixer", identifier: "post_mixer" },
      outputRoutingChannel: { display_name: "Post Mixer", identifier: "post_mixer" },
      available_output_routing_types: [{ display_name: "Master", identifier: "master" }],
      availableOutputRoutingTypes: [{ display_name: "Master", identifier: "master" }],
      available_output_routing_channels: [{ display_name: "Post Mixer", identifier: "post_mixer" }],
      availableOutputRoutingChannels: [{ display_name: "Post Mixer", identifier: "post_mixer" }],
      sends: [],
      devices: [],
      session_clips: [],
      arrangement_clips: []
    };

    if (!dryRun) {
      this.state.return_tracks = [...(this.state.return_tracks ?? []), track];
      for (const visibleTrack of this.state.tracks ?? []) {
        const sendIndex = (visibleTrack.sends ?? []).length;
        visibleTrack.sends = [
          ...(visibleTrack.sends ?? []),
          {
            id: `${visibleTrack.id}:send:${sendIndex + 1}`,
            name: `Send ${String.fromCharCode(65 + nextIndex)}`,
            value: 0,
            min: 0,
            max: 1,
            is_quantized: false,
            value_items: [],
            display_value: "0"
          }
        ];
      }
      this.emit("event", {
        topic: "tracks.changed",
        payload: { action: "created", track: clone(track) }
      });
    }

    return {
      applied: !dryRun,
      track
    };
  }

  createScene(args, dryRun) {
    const nextIndex = this.state.scenes.length;
    const scene = {
      id: `scene:${nextIndex + 1}`,
      index: nextIndex,
      name: args.name ?? `Scene ${nextIndex + 1}`
    };

    if (!dryRun) {
      this.state.scenes.push(scene);
      this.emit("event", {
        topic: "clips.changed",
        payload: { action: "scene-created", scene }
      });
    }

    return {
      applied: !dryRun,
      scene
    };
  }

  createClip(args, dryRun) {
    const track = this.findTrack(args.track_id);
    const nextIndex = Number.isInteger(args.slot_index) && args.slot_index >= 0
      ? args.slot_index
      : track.session_clips.length;
    if (track.session_clips.some((candidate) => candidate.slot_index === nextIndex)) {
      throw new Error(`Target clip slot already contains a clip: ${nextIndex}`);
    }
    const lengthBeats = Number(args.length_beats ?? 4);
    const clip = {
      id: `clip:session:${track.id}:slot:${nextIndex + 1}`,
      slot_index: nextIndex,
      slotIndex: nextIndex,
      name: args.name ?? `Clip ${nextIndex + 1}`,
      length_beats: lengthBeats,
      lengthBeats,
      loop_start_beats: 0,
      loopStartBeats: 0,
      loop_end_beats: lengthBeats,
      loopEndBeats: lengthBeats,
      looping: true,
      is_playing: false,
      notes: []
    };

    if (!dryRun) {
      track.session_clips.push(clip);
      track.session_clips.sort((left, right) => left.slot_index - right.slot_index);
      this.emit("event", {
        topic: "clips.changed",
        payload: {
          action: "clip-created",
          track_id: track.id,
          clip
        }
      });
    }

    return {
      applied: !dryRun,
      clip
    };
  }

  createArrangementClip(args, dryRun) {
    const track = this.findTrack(args.track_id);
    if ((track.section ?? "visible") !== "visible") {
      throw new Error("Arrangement clips are only supported on visible tracks");
    }
    const startBeats = Number(args.start_beats);
    const lengthBeats = Number(args.length_beats ?? 4);
    if (!Number.isFinite(startBeats) || startBeats < 0) {
      throw new Error("start_beats must be a non-negative number");
    }
    if (!Number.isFinite(lengthBeats) || lengthBeats <= 0) {
      throw new Error("length_beats must be a positive number");
    }
    const nextIndex = (track.arrangement_clips ?? []).length;
    const clip = {
      id: `clip:arrangement:${track.id}:index:${nextIndex + 1}`,
      location: "arrangement",
      arrangement_index: nextIndex,
      arrangementIndex: nextIndex,
      index: nextIndex,
      track_id: track.id,
      name: args.name ?? `Arrangement Clip ${nextIndex + 1}`,
      length_beats: lengthBeats,
      lengthBeats,
      loop_start_beats: 0,
      loopStartBeats: 0,
      loop_end_beats: lengthBeats,
      loopEndBeats: lengthBeats,
      looping: true,
      is_playing: false,
      start_beats: startBeats,
      startBeats: startBeats,
      end_beats: startBeats + lengthBeats,
      endBeats: startBeats + lengthBeats,
      notes: []
    };

    if (!dryRun) {
      track.arrangement_clips = [...(track.arrangement_clips ?? []), clip];
      this.emit("event", {
        topic: "clips.changed",
        payload: {
          action: "clip-created",
          track_id: track.id,
          clip: clone(clip)
        }
      });
    }

    return {
      applied: !dryRun,
      track: clone(track),
      clip
    };
  }

  renameClip(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    if (!args.name) {
      throw new Error("name is required");
    }
    if (!dryRun) {
      clip.name = args.name;
      this.emit("event", {
        topic: "clips.changed",
        payload: {
          action: "clip-renamed",
          clip_id: clip.id,
          clip: clone(clip)
        }
      });
    }
    return {
      applied: !dryRun,
      clip: clone(clip)
    };
  }

  selectClip(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    const trackId = this.findTrackIdForClip(args.clip_id);
    const track = this.findTrack(trackId);
    if (!dryRun) {
      this.state.selected_context = {
        ...(this.state.selected_context ?? {}),
        track_id: trackId,
        clip_id: clip.id
      };
    }
    return {
      applied: !dryRun,
      track: clone(track),
      clip: clone(clip)
    };
  }

  duplicateClip(args, dryRun) {
    const sourceClip = this.findClip(args.clip_id);
    const sourceTrack = this.state.tracks.find((track) =>
      track.session_clips.some((candidate) => candidate.id === args.clip_id)
    );
    const targetTrack = this.findTrack(args.target_track_id ?? sourceTrack.id);
    const targetSlotIndex = Number(args.target_slot_index);
    if (!Number.isInteger(targetSlotIndex) || targetSlotIndex < 0) {
      throw new Error("target_slot_index must be a non-negative integer");
    }
    if (sourceTrack.id === targetTrack.id && sourceClip.slot_index === targetSlotIndex) {
      throw new Error("target slot must differ from source clip slot");
    }
    if (targetTrack.session_clips.some((candidate) => candidate.slot_index === targetSlotIndex)) {
      throw new Error(`Target clip slot already contains a clip: ${targetSlotIndex}`);
    }

    const duplicatedClip = {
      ...clone(sourceClip),
      id: `clip:session:${targetTrack.id}:slot:${targetSlotIndex + 1}`,
      slot_index: targetSlotIndex,
      slotIndex: targetSlotIndex,
      is_playing: false
    };

    if (!dryRun) {
      targetTrack.session_clips.push(duplicatedClip);
      targetTrack.session_clips.sort((left, right) => left.slot_index - right.slot_index);
      this.emit("event", {
        topic: "clips.changed",
        payload: {
          action: "clip-created",
          track_id: targetTrack.id,
          clip: clone(duplicatedClip)
        }
      });
    }

    return {
      applied: !dryRun,
      source_clip_id: args.clip_id,
      clip: duplicatedClip
    };
  }

  moveSessionClip(args, dryRun) {
    const duplication = this.duplicateClip(args, dryRun);
    if (!dryRun) {
      this.deleteClip({ clip_id: args.clip_id }, false);
    }
    return {
      applied: !dryRun,
      source_clip_id: args.clip_id,
      clip: duplication.clip
    };
  }

  duplicateClipToArrangement(args, dryRun) {
    const sourceClip = this.findClip(args.clip_id);
    const targetTrack = this.findTrack(args.target_track_id ?? this.findTrackIdForClip(args.clip_id));
    if ((targetTrack.section ?? "visible") !== "visible") {
      throw new Error("Arrangement clips are only supported on visible tracks");
    }
    const destinationBeats = Number(args.destination_beats);
    if (!Number.isFinite(destinationBeats) || destinationBeats < 0) {
      throw new Error("destination_beats must be a non-negative number");
    }
    const lengthBeats = Number(
      sourceClip.length_beats ?? sourceClip.lengthBeats ?? sourceClip.loop_end_beats ?? sourceClip.loopEndBeats ?? 4
    );
    const nextIndex = (targetTrack.arrangement_clips ?? []).length;
    const clip = {
      ...clone(sourceClip),
      id: `clip:arrangement:${targetTrack.id}:index:${nextIndex + 1}`,
      location: "arrangement",
      arrangement_index: nextIndex,
      arrangementIndex: nextIndex,
      index: nextIndex,
      track_id: targetTrack.id,
      slot_index: null,
      slotIndex: null,
      is_playing: false,
      start_beats: destinationBeats,
      startBeats: destinationBeats,
      end_beats: destinationBeats + lengthBeats,
      endBeats: destinationBeats + lengthBeats,
      length_beats: lengthBeats,
      lengthBeats
    };

    if (!dryRun) {
      targetTrack.arrangement_clips = [...(targetTrack.arrangement_clips ?? []), clip];
      this.emit("event", {
        topic: "clips.changed",
        payload: {
          action: "clip-created",
          track_id: targetTrack.id,
          clip: clone(clip)
        }
      });
    }

    return {
      applied: !dryRun,
      source_clip_id: args.clip_id,
      track: clone(targetTrack),
      clip
    };
  }

  duplicateArrangementClip(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    if (!clip || clip.location !== "arrangement") {
      throw new Error("duplicate_arrangement_clip only supports arrangement clips");
    }
    return this.duplicateClipToArrangement(args, dryRun);
  }

  moveArrangementClip(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    if (clip.location !== "arrangement") {
      throw new Error(`Arrangement clip not found: ${args.clip_id}`);
    }

    const destinationBeats = Number(args.destination_beats);
    if (!Number.isFinite(destinationBeats) || destinationBeats < 0) {
      throw new Error("destination_beats must be a non-negative number");
    }

    const nextClip = {
      ...clone(clip),
      start_beats: destinationBeats,
      startBeats: destinationBeats,
      end_beats: destinationBeats + (Number(clip.length_beats ?? clip.lengthBeats ?? (clip.end_beats ?? clip.endBeats ?? 0) - (clip.start_beats ?? clip.startBeats ?? 0)) || 0),
      endBeats: destinationBeats + (Number(clip.length_beats ?? clip.lengthBeats ?? (clip.end_beats ?? clip.endBeats ?? 0) - (clip.start_beats ?? clip.startBeats ?? 0)) || 0)
    };

    if (!dryRun) {
      const track = this.findTrack(clip.track_id ?? clip.trackId ?? this.findTrackIdForClip(args.clip_id));
      track.arrangement_clips = (track.arrangement_clips ?? []).map((candidate) =>
        candidate.id === clip.id ? nextClip : candidate
      );
      this.state.song.current_song_time = destinationBeats;
      this.state.song.arrangement_position_beats = destinationBeats;
      this.emit("event", {
        topic: "track-updated",
        payload: clone(track)
      });
      this.emit("event", {
        topic: "song-updated",
        payload: clone(this.state.song)
      });
    }

    return {
      applied: !dryRun,
      clip: nextClip
    };
  }

  setArrangementClipBounds(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    if (clip.location !== "arrangement") {
      throw new Error(`Arrangement clip not found: ${args.clip_id}`);
    }
    if (args.start_beats === undefined && args.end_beats === undefined) {
      throw new Error("At least one arrangement bound field is required");
    }

    const currentStart = Number(clip.start_beats ?? clip.startBeats ?? 0);
    const currentEnd = Number(
      clip.end_beats ?? clip.endBeats ?? currentStart + Number(clip.length_beats ?? clip.lengthBeats ?? 4)
    );
    const nextStart = args.start_beats === undefined ? currentStart : Number(args.start_beats);
    const nextEnd = args.end_beats === undefined ? currentEnd : Number(args.end_beats);

    if (!Number.isFinite(nextStart) || nextStart < 0) {
      throw new Error("start_beats must be a non-negative number");
    }
    if (!Number.isFinite(nextEnd) || nextEnd <= nextStart) {
      throw new Error("end_beats must be greater than start_beats");
    }

    const nextClip = {
      ...clone(clip),
      start_beats: nextStart,
      startBeats: nextStart,
      end_beats: nextEnd,
      endBeats: nextEnd,
      length_beats: nextEnd - nextStart,
      lengthBeats: nextEnd - nextStart
    };

    if (!dryRun) {
      const track = this.findTrack(clip.track_id ?? clip.trackId ?? this.findTrackIdForClip(args.clip_id));
      track.arrangement_clips = (track.arrangement_clips ?? []).map((candidate) =>
        candidate.id === clip.id ? nextClip : candidate
      );
      this.emit("event", {
        topic: "clips.changed",
        payload: {
          action: "clip-bounds-updated",
          clip_id: clip.id,
          clip: clone(nextClip)
        }
      });
    }

    return {
      applied: !dryRun,
      clip: nextClip
    };
  }

  splitArrangementClip(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    if (clip.location !== "arrangement") {
      throw new Error(`Arrangement clip not found: ${args.clip_id}`);
    }
    if (clip.is_audio || clip.isAudio) {
      throw new Error("split_arrangement_clip currently supports MIDI arrangement clips only");
    }

    const currentStart = Number(clip.start_beats ?? clip.startBeats ?? 0);
    const currentEnd = Number(
      clip.end_beats ?? clip.endBeats ?? currentStart + Number(clip.length_beats ?? clip.lengthBeats ?? 4)
    );
    const splitBeats = Number(args.split_beats);

    if (!Number.isFinite(splitBeats) || splitBeats <= currentStart || splitBeats >= currentEnd) {
      throw new Error("split_beats must fall strictly inside the arrangement clip bounds");
    }

    const leftLength = splitBeats - currentStart;
    const rightLength = currentEnd - splitBeats;
    const sourceTrackId = clip.track_id ?? clip.trackId ?? this.findTrackIdForClip(args.clip_id);
    const track = this.findTrack(sourceTrackId);
    const sourceIndex = clip.arrangement_index ?? clip.arrangementIndex ?? 0;
    const existingClips = track.arrangement_clips ?? [];

    const leftClip = {
      ...clone(clip),
      id: `clip:arrangement:${sourceTrackId}:index:${sourceIndex + 1}`,
      arrangement_index: sourceIndex,
      arrangementIndex: sourceIndex,
      index: sourceIndex,
      track_id: sourceTrackId,
      start_beats: currentStart,
      startBeats: currentStart,
      end_beats: splitBeats,
      endBeats: splitBeats,
      length_beats: leftLength,
      lengthBeats: leftLength,
      loop_end_beats: leftLength,
      loopEndBeats: leftLength,
      notes: this.segmentArrangementNotes(clip, currentStart, splitBeats)
    };

    const rightClip = {
      ...clone(clip),
      id: `clip:arrangement:${sourceTrackId}:index:${sourceIndex + 2}`,
      arrangement_index: sourceIndex + 1,
      arrangementIndex: sourceIndex + 1,
      index: sourceIndex + 1,
      track_id: sourceTrackId,
      start_beats: splitBeats,
      startBeats: splitBeats,
      end_beats: currentEnd,
      endBeats: currentEnd,
      length_beats: rightLength,
      lengthBeats: rightLength,
      loop_end_beats: rightLength,
      loopEndBeats: rightLength,
      notes: this.segmentArrangementNotes(clip, splitBeats, currentEnd)
    };

    if (!dryRun) {
      track.arrangement_clips = [
        ...existingClips.slice(0, sourceIndex),
        leftClip,
        rightClip,
        ...existingClips.slice(sourceIndex + 1)
      ].map((candidate, index) => ({
        ...candidate,
        id: `clip:arrangement:${sourceTrackId}:index:${index + 1}`,
        arrangement_index: index,
        arrangementIndex: index,
        index
      }));
      this.emit("event", {
        topic: "track-updated",
        payload: clone(track)
      });
      this.emit("event", {
        topic: "clips.changed",
        payload: {
          action: "clip-split",
          clip_id: args.clip_id,
          track_id: sourceTrackId
        }
      });
      return {
        applied: true,
        source_clip_id: args.clip_id,
        clips: clone(track.arrangement_clips.slice(sourceIndex, sourceIndex + 2))
      };
    }

    return {
      applied: false,
      source_clip_id: args.clip_id,
      clips: [leftClip, rightClip]
    };
  }

  segmentArrangementNotes(clip, segmentStart, segmentEnd) {
    const notes = Array.isArray(clip.notes) ? clone(clip.notes) : [];
    const clipStart = Number(clip.start_beats ?? clip.startBeats ?? 0);
    const base = this.arrangementNoteBase(notes, clipStart);
    const segmented = [];

    for (const note of notes) {
      const noteStart = Number(note.start_time ?? note.start_beats ?? note.startBeats ?? 0);
      const duration = Number(note.duration ?? note.duration_beats ?? note.durationBeats ?? 0);
      const absoluteStart = noteStart + (clipStart - base);
      const absoluteEnd = absoluteStart + duration;
      const overlapStart = Math.max(absoluteStart, Number(segmentStart));
      const overlapEnd = Math.min(absoluteEnd, Number(segmentEnd));
      if (!(overlapEnd > overlapStart)) {
        continue;
      }
      segmented.push({
        ...clone(note),
        start_time: overlapStart - Number(segmentStart),
        duration: overlapEnd - overlapStart
      });
    }

    return segmented;
  }

  arrangementNoteBase(notes, clipStart) {
    if (!Array.isArray(notes) || notes.length === 0) {
      return 0;
    }
    const minStart = Math.min(
      ...notes.map((note) => Number(note.start_time ?? note.start_beats ?? note.startBeats ?? 0))
    );
    if (clipStart > 0 && minStart >= clipStart - 1e-6) {
      return clipStart;
    }
    return 0;
  }

  deleteClip(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    const track = this.state.tracks.find((item) =>
      item.session_clips.some((candidate) => candidate.id === args.clip_id) ||
      (item.arrangement_clips ?? []).some((candidate) => candidate.id === args.clip_id)
    );
    const isArrangementClip = clip.location === "arrangement";

    if (!dryRun) {
      if (isArrangementClip) {
        track.arrangement_clips = (track.arrangement_clips ?? []).filter(
          (candidate) => candidate.id !== args.clip_id
        );
      } else {
        track.session_clips = track.session_clips.filter((candidate) => candidate.id !== args.clip_id);
        if (track.playing_slot_index === clip.slot_index) {
          track.playing_slot_index = -1;
        }
        if (track.fired_slot_index === clip.slot_index) {
          track.fired_slot_index = -1;
        }
      }
      this.emit("event", {
        topic: "clips.changed",
        payload: {
          action: "clip-deleted",
          clip_id: args.clip_id,
          track_id: track.id
        }
      });
    }

    return {
      applied: !dryRun,
      clip_id: args.clip_id,
      track_id: track.id,
      slot_index: clip.slot_index ?? null,
      arrangement_index: clip.arrangement_index ?? clip.arrangementIndex ?? null
    };
  }

  setClipLoopOrLength(args, dryRun) {
    const clip = this.findClip(args.clip_id);

    if (
      args.length_beats === undefined &&
      args.loop_start_beats === undefined &&
      args.loop_end_beats === undefined &&
      args.looping === undefined
    ) {
      throw new Error("At least one clip loop or length field is required");
    }

    if (!dryRun) {
      if (args.length_beats !== undefined) {
        clip.length_beats = Number(args.length_beats);
      }
      if (args.loop_start_beats !== undefined) {
        clip.loop_start_beats = Number(args.loop_start_beats);
        clip.loopStartBeats = Number(args.loop_start_beats);
      }
      if (args.loop_end_beats !== undefined) {
        clip.loop_end_beats = Number(args.loop_end_beats);
        clip.loopEndBeats = Number(args.loop_end_beats);
      }
      if (args.looping !== undefined) {
        clip.looping = Boolean(args.looping);
      }
      this.emit("event", {
        topic: "clips.changed",
        payload: {
          action: "clip-loop-updated",
          clip_id: clip.id,
          clip: clone(clip)
        }
      });
    }

    const nextClip = clone(clip);
    if (dryRun) {
      if (args.length_beats !== undefined) {
        nextClip.length_beats = Number(args.length_beats);
      }
      if (args.loop_start_beats !== undefined) {
        nextClip.loop_start_beats = Number(args.loop_start_beats);
        nextClip.loopStartBeats = Number(args.loop_start_beats);
      }
      if (args.loop_end_beats !== undefined) {
        nextClip.loop_end_beats = Number(args.loop_end_beats);
        nextClip.loopEndBeats = Number(args.loop_end_beats);
      }
      if (args.looping !== undefined) {
        nextClip.looping = Boolean(args.looping);
      }
    }

    return {
      applied: !dryRun,
      clip: nextClip
    };
  }

  insertNotes(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    const notes = Array.isArray(args.notes) ? clone(args.notes) : [];

    if (!dryRun) {
      clip.notes.push(...notes);
      this.emit("event", {
        topic: "clips.changed",
        payload: {
          action: "notes-inserted",
          clip_id: clip.id,
          notes
        }
      });
    }

    return {
      applied: !dryRun,
      clip_id: clip.id,
      note_count: clip.notes.length
    };
  }

  replaceNotes(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    const notes = Array.isArray(args.notes) ? clone(args.notes) : [];

    if (!dryRun) {
      clip.notes = notes;
      this.emit("event", {
        topic: "clips.changed",
        payload: {
          action: "notes-replaced",
          clip_id: clip.id,
          notes
        }
      });
    }

    return {
      applied: !dryRun,
      clip_id: clip.id,
      note_count: notes.length
    };
  }

  getClipEnvelopes(args) {
    const clip = this.findClip(args.clip_id);
    const track = this.allTracks().find((item) =>
      item.session_clips.some((candidate) => candidate.id === clip.id) ||
      (item.arrangement_clips ?? []).some((candidate) => candidate.id === clip.id)
    );
    const sampleStep = Number(args.sample_step_beats ?? args.sampleStepBeats ?? 1);
    const parameterId = args.parameter_id ?? args.parameterId ?? null;
    const selectedParameterId = this.state.selected_context?.selected_envelope_parameter_id ?? null;
    const availableTargets = this.iterClipEnvelopeTargets(track);
    const target = parameterId
      ? availableTargets.find((candidate) => candidate.parameter_id === parameterId)
      : null;
    const supportsAutomation = (clip.location ?? "session") === "session";
    const envelopes = [];
    if (supportsAutomation && target && clip.envelope_steps?.[target.parameter_id]) {
      envelopes.push({
        parameter_id: target.parameter_id,
        parameterId: target.parameter_id,
        name: target.name,
        track_id: target.track_id,
        trackId: target.track_id,
        samples: clone(clip.envelope_steps[target.parameter_id]),
        scope: target.scope,
        ...(target.device_id ? { device_id: target.device_id, deviceId: target.device_id } : {}),
        ...(target.device_name ? { device_name: target.device_name, deviceName: target.device_name } : {})
      });
    }

    return {
      clip: clone(clip),
      supports_automation_envelopes: supportsAutomation,
      supportsAutomationEnvelopes: supportsAutomation,
      has_envelopes: Boolean(clip.has_envelopes),
      hasEnvelopes: Boolean(clip.has_envelopes),
      selected_parameter_id: selectedParameterId,
      selectedParameterId: selectedParameterId,
      sample_step_beats: sampleStep,
      sampleStepBeats: sampleStep,
      available_targets: availableTargets,
      availableTargets: availableTargets,
      envelopes
    };
  }

  showClipEnvelope(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    if (!dryRun) {
      this.state.selected_context = {
        ...(this.state.selected_context ?? {}),
        selected_clip_id: clip.id,
        selected_clip_location: clip.location ?? "session",
        detail_view_target: "clip",
        envelope_visible: true
      };
    }
    return {
      applied: !dryRun,
      clip: clone(clip)
    };
  }

  hideClipEnvelope(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    if (!dryRun) {
      this.state.selected_context = {
        ...(this.state.selected_context ?? {}),
        selected_clip_id: clip.id,
        selected_clip_location: clip.location ?? "session",
        detail_view_target: "clip",
        envelope_visible: false
      };
    }
    return {
      applied: !dryRun,
      clip: clone(clip)
    };
  }

  selectClipEnvelopeParameter(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    const target = this.findEnvelopeTarget(args.parameter_id);
    if (!dryRun) {
      this.state.selected_context = {
        ...(this.state.selected_context ?? {}),
        selected_clip_id: clip.id,
        selected_clip_location: clip.location ?? "session",
        detail_view_target: "clip",
        selected_envelope_parameter_id: target.parameter_id,
        envelope_visible: args.show_envelope !== false
      };
    }
    return {
      applied: !dryRun,
      clip: clone(clip),
      parameter_target: clone(target)
    };
  }

  clearClipEnvelope(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    const target = this.findEnvelopeTarget(args.parameter_id);
    if (!dryRun) {
      clip.envelope_steps = {
        ...(clip.envelope_steps ?? {})
      };
      delete clip.envelope_steps[target.parameter_id];
      clip.has_envelopes = Object.keys(clip.envelope_steps).length > 0;
      clip.hasEnvelopes = clip.has_envelopes;
      if (this.state.selected_context?.selected_envelope_parameter_id === target.parameter_id) {
        this.state.selected_context = {
          ...(this.state.selected_context ?? {}),
          selected_envelope_parameter_id: null
        };
      }
    }
    return {
      applied: !dryRun,
      clip: clone(clip),
      parameter_target: clone(target)
    };
  }

  clearAllClipEnvelopes(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    if (!dryRun) {
      clip.has_envelopes = false;
      clip.hasEnvelopes = false;
      clip.envelope_steps = {};
      if (this.state.selected_context?.selected_clip_id === clip.id) {
        this.state.selected_context = {
          ...(this.state.selected_context ?? {}),
          selected_envelope_parameter_id: null
        };
      }
    }
    return {
      applied: !dryRun,
      clip: clone(clip)
    };
  }

  setClipEnvelope(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    if ((clip.location ?? "session") !== "session") {
      throw new Error("Clip envelopes are currently supported on Session clips only");
    }
    const target = this.findEnvelopeTarget(args.parameter_id);
    const steps = Array.isArray(args.steps)
      ? args.steps.map((step) => ({
          beat: Number(step.start_beats ?? step.startBeats ?? 0),
          duration: Number(step.duration_beats ?? step.durationBeats ?? 0),
          value: Number(step.value)
        }))
      : [];

    if (!dryRun) {
      if (args.clear_existing !== false && args.clearExisting !== false) {
        clip.envelope_steps = {
          ...(clip.envelope_steps ?? {})
        };
        delete clip.envelope_steps[target.parameter_id];
      }
      clip.envelope_steps = {
        ...(clip.envelope_steps ?? {}),
        [target.parameter_id]: steps
      };
      clip.has_envelopes = Object.keys(clip.envelope_steps).length > 0;
      clip.hasEnvelopes = clip.has_envelopes;
      if (args.select_in_view || args.selectInView) {
        this.state.selected_context = {
          ...(this.state.selected_context ?? {}),
          selected_clip_id: clip.id,
          selected_clip_location: clip.location ?? "session",
          detail_view_target: "clip",
          selected_envelope_parameter_id: target.parameter_id,
          envelope_visible: true
        };
      }
    }

    return {
      applied: !dryRun,
      clip: clone(clip),
      parameter_target: clone(target),
      envelope: {
        parameter_id: target.parameter_id,
        parameterId: target.parameter_id,
        samples: clone(steps)
      }
    };
  }

  getBrowserItems(args = {}) {
    if (!args.path) {
      return {
        path: null,
        items: clone(this.state.browser.roots)
      };
    }

    const item = this.findBrowserItemByPath(args.path);
    return {
      path: args.path,
      item: clone(item),
      items: clone(item.children ?? [])
    };
  }

  loadBrowserItem(args, dryRun) {
    const track = this.findTrack(args.track_id);
    const item = args.uri ? this.findBrowserItemByUri(args.uri) : this.findBrowserItemByPath(args.path);
    if (!item) {
      throw new Error("Browser item not found");
    }
    if (!item.is_loadable) {
      throw new Error("Browser item is not loadable");
    }

    const nextDeviceIndex = track.devices.length;
    const device = {
      id: `device:${track.id}:${nextDeviceIndex + 1}`,
      name: item.name,
      class_name: item.name.replace(/\s+/g, ""),
      parameters: [
        {
          id: `parameter:device:${track.id}:${nextDeviceIndex + 1}:1`,
          name: "Macro 1",
          value: 0.5,
          min: 0,
          max: 1,
          display_value: "0.5"
        }
      ]
    };

    if (!dryRun) {
      track.devices.push(device);
      this.emit("event", {
        topic: "tracks.changed",
        payload: { action: "updated", track: clone(track) }
      });
    }

    return {
      applied: !dryRun,
      item: clone(item),
      track: clone(track)
    };
  }

  fireClip(args, dryRun) {
    const clip = this.findClip(args.clip_id);
    const track = this.state.tracks.find((item) =>
      item.session_clips.some((candidate) => candidate.id === clip.id)
    );

    if (!dryRun) {
      this.state.song.is_playing = true;
      if (track) {
        track.playing_slot_index = clip.slot_index;
        track.fired_slot_index = clip.slot_index;
        for (const candidate of track.session_clips) {
          candidate.is_playing = candidate.id === clip.id;
        }
      }
      this.emit("event", {
        topic: "clips.changed",
        payload: {
          action: "clip-fired",
          clip_id: clip.id,
          clip: clone(clip),
          track_id: track?.id ?? null
        }
      });
      this.emit("event", {
        topic: "transport.changed",
        payload: { is_playing: true }
      });
    }

    return {
      applied: !dryRun,
      clip_id: clip.id
    };
  }

  fireScene(args, dryRun) {
    const scene = this.state.scenes.find((item) => item.id === args.scene_id);
    if (!scene) {
      throw new Error(`Scene not found: ${args.scene_id}`);
    }

    if (!dryRun) {
      this.state.song.is_playing = true;
      for (const track of this.state.tracks) {
        track.playing_slot_index = -1;
        track.fired_slot_index = -1;
        for (const clip of track.session_clips) {
          const is_target = clip.slot_index === scene.index;
          clip.is_playing = is_target;
          if (is_target) {
            track.playing_slot_index = scene.index;
            track.fired_slot_index = scene.index;
          }
        }
      }
      this.emit("event", {
        topic: "clips.changed",
        payload: {
          action: "scene-fired",
          scene_id: scene.id,
          scene: clone(scene)
        }
      });
      this.emit("event", {
        topic: "transport.changed",
        payload: { is_playing: true }
      });
    }

    return {
      applied: !dryRun,
      scene_id: scene.id
    };
  }

  stopTrackClips(args, dryRun) {
    const track = this.findTrack(args.track_id);
    if (!dryRun) {
      track.playing_slot_index = -1;
      track.fired_slot_index = -1;
      for (const clip of track.session_clips) {
        clip.is_playing = false;
      }
      this.emit("event", {
        topic: "clips.changed",
        payload: {
          action: "track-clips-stopped",
          track_id: track.id
        }
      });
    }

    return {
      applied: !dryRun,
      track_id: track.id
    };
  }

  stopAllClips(dryRun) {
    if (!dryRun) {
      for (const track of this.state.tracks) {
        track.playing_slot_index = -1;
        track.fired_slot_index = -1;
        for (const clip of track.session_clips) {
          clip.is_playing = false;
        }
      }
      this.emit("event", {
        topic: "clips.changed",
        payload: {
          action: "all-clips-stopped"
        }
      });
    }

    return {
      applied: !dryRun
    };
  }

  findTrackIdForClip(clipId) {
    for (const track of this.state.tracks) {
      if (
        track.session_clips.some((candidate) => candidate.id === clipId) ||
        (track.arrangement_clips ?? []).some((candidate) => candidate.id === clipId)
      ) {
        return track.id;
      }
    }
    throw new Error(`Track not found for clip: ${clipId}`);
  }
}

export function resolveFixturePath(inputPath) {
  if (!inputPath) {
    return defaultFixturePath;
  }
  return path.resolve(process.cwd(), inputPath);
}
