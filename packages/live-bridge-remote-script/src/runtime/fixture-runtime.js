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
      case "tracks":
        return clone(this.state.tracks);
      case "scenes":
        return clone(this.state.scenes);
      case "browser.tree":
        return clone(this.state.browser);
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

    if (target?.startsWith("parameter:")) {
      return this.setParameter(target, args, dryRun);
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
      case "create_scene":
        return this.createScene(args, dryRun);
      case "create_clip":
        return this.createClip(args, dryRun);
      case "insert_notes":
        return this.insertNotes(args, dryRun);
      case "replace_notes":
        return this.replaceNotes(args, dryRun);
      case "get_browser_items":
        return this.getBrowserItems(args);
      case "load_browser_item":
        return this.loadBrowserItem(args, dryRun);
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
    const track = this.state.tracks.find((item) => item.id === trackId);
    if (!track) {
      throw new Error(`Track not found: ${trackId}`);
    }
    return track;
  }

  findDevice(deviceId) {
    for (const track of this.state.tracks) {
      const device = track.devices.find((item) => item.id === deviceId);
      if (device) {
        return device;
      }
    }
    throw new Error(`Device not found: ${deviceId}`);
  }

  findParameter(parameterId) {
    for (const track of this.state.tracks) {
      for (const device of track.devices) {
        const parameter = device.parameters.find((item) => item.id === parameterId);
        if (parameter) {
          return parameter;
        }
      }
    }
    throw new Error(`Parameter not found: ${parameterId}`);
  }

  findClip(clipId) {
    for (const track of this.state.tracks) {
      const clip = track.session_clips.find((item) => item.id === clipId);
      if (clip) {
        return clip;
      }
    }
    throw new Error(`Clip not found: ${clipId}`);
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

  createTrack(args, dryRun) {
    const nextIndex = this.state.tracks.length;
    const nextId = `track:${nextIndex + 1}`;
    const track = {
      id: nextId,
      index: nextIndex,
      name: args.name ?? `Track ${nextIndex + 1}`,
      type: args.type ?? "midi",
      color: args.color ?? 0,
      arm: false,
      mute: false,
      solo: false,
      playing_slot_index: -1,
      fired_slot_index: -1,
      devices: [],
      session_clips: []
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
    const clip = {
      id: `clip:session:${track.id}:slot:${nextIndex + 1}`,
      slot_index: nextIndex,
      name: args.name ?? `Clip ${nextIndex + 1}`,
      length_beats: args.length_beats ?? 4,
      is_playing: false,
      notes: []
    };

    if (!dryRun) {
      track.session_clips = track.session_clips.filter((candidate) => candidate.slot_index !== nextIndex);
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
}

export function resolveFixturePath(inputPath) {
  if (!inputPath) {
    return defaultFixturePath;
  }
  return path.resolve(process.cwd(), inputPath);
}
