import rootPackage from "../../../package.json" with { type: "json" };
import {
  BridgeClient,
  BridgeServer,
  FixtureLiveRuntime
} from "../../live-bridge-remote-script/src/index.js";
import { createStateEngine } from "../../state-engine/src/index.js";

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
  return {
    ...parameter,
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
  return {
    ...track,
    section: track.section ?? "visible",
    armed,
    muted,
    soloed,
    arm: armed,
    mute: muted,
    solo: soloed,
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
    bridge_version: rootPackage.version,
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
  const [hello, capabilities, song, scenes, tracks] = await Promise.all([
    bridgeClient.request("hello"),
    bridgeClient.request("capabilities"),
    bridgeClient.request("get", "song"),
    bridgeClient.request("get", "scenes"),
    bridgeClient.request("get", "tracks")
  ]);

  return toRuntimeSnapshot({
    liveVersion: hello.result.live_version,
    capabilities: capabilities.result,
    song: song.result,
    scenes: scenes.result,
    tracks: tracks.result
  });
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

  return {
    async getProjectSummary() {
      if (typeof session.ensureConnected === "function") {
        await session.ensureConnected();
      }
      const summary = session.stateEngine.query.summarizeProject();
      return {
        ...summary,
        stateVersion: summary.snapshotVersion,
        tracks: trackList()
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
      return trackList();
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
  constructor({ bridgeClient, stateEngine = createStateEngine(), teardown = () => {} }) {
    this.bridgeClient = bridgeClient;
    this.stateEngine = stateEngine;
    this.teardown = teardown;
    this.boundEventHandler = (message) => {
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
    socketFactory = null
  } = {}) {
    const bridgeClient = new BridgeClient({
      host,
      port,
      clientId,
      socketFactory
    });
    await bridgeClient.connect();
    const session = new LaiveBridgeSession({ bridgeClient });
    await session.start();
    return session;
  }

  static createLazy(options = {}) {
    return new LaiveLazySession(options);
  }

  async start() {
    this.bridgeClient.on("event", this.boundEventHandler);
    await Promise.all([
      this.bridgeClient.subscribe("transport.changed"),
      this.bridgeClient.subscribe("tracks.changed"),
      this.bridgeClient.subscribe("clips.changed"),
      this.bridgeClient.subscribe("parameters.changed")
    ]);
    await this.syncSnapshot();
  }

  async syncSnapshot() {
    const snapshot = await buildRuntimeSnapshot(this.bridgeClient);
    this.stateEngine.applySnapshot(snapshot, {
      observedAt: snapshot.observed_at
    });
    return this.stateEngine.getState();
  }

  async close() {
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
    socketFactory = null
  } = {}) {
    this.connectionOptions = {
      host,
      port,
      clientId,
      socketFactory
    };
    this.stateEngine = createStateEngine();
    this.bridgeClient = null;
    this.activeSession = null;
    this.connectingPromise = null;
  }

  async ensureConnected() {
    if (this.activeSession) {
      return this.activeSession;
    }

    if (!this.connectingPromise) {
      this.connectingPromise = LaiveBridgeSession.connect(this.connectionOptions)
        .then((session) => {
          this.activeSession = session;
          this.bridgeClient = session.bridgeClient;
          this.stateEngine = session.stateEngine;
          return session;
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
