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
  return {
    ...parameter,
    display_value: parameter.display_value ?? parameter.displayValue ?? null
  };
}

function normalizeDevice(device) {
  return {
    ...device,
    parameters: (device.parameters ?? []).map(normalizeParameter)
  };
}

function normalizeClip(trackId, clip) {
  return {
    ...clip,
    track_id: trackId,
    location: clip.location ?? "session",
    note_count: clip.note_count ?? clip.notes?.length ?? null
  };
}

function normalizeTrack(track) {
  return {
    ...track,
    section: track.section ?? "visible",
    armed: track.armed ?? track.arm ?? false,
    muted: track.muted ?? track.mute ?? false,
    soloed: track.soloed ?? track.solo ?? false,
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
    bridge_version: "0.1.0",
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

function mapBridgeEvent(topic, payload) {
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

      return {
        event: "state.dirty",
        payload: {
          paths: [payload.clip_id ?? "song.clips"]
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

export function createBridgeAdapter(bridgeClient) {
  return {
    async getCapabilities() {
      return (await bridgeClient.request("capabilities")).result;
    },
    async setTempo(tempo, options = {}) {
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
    async createClip(payload) {
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
    async setParameter(payload, options = {}) {
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
      const summary = session.stateEngine.query.summarizeProject();
      return {
        ...summary,
        stateVersion: summary.snapshotVersion,
        tracks: trackList()
      };
    },
    async getSelectedContext() {
      const context = session.stateEngine.query.getSelectedContext() ?? {};
      return {
        stateVersion: stateVersion(),
        ...context
      };
    },
    async listTracks() {
      return trackList();
    },
    async getTrackDetails(target) {
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
