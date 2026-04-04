import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { LaiveMcpServer } from "../src/index.js";
import {
  LaiveBridgeSession,
  LaiveFixtureSession,
  createAllowAllPolicyAdapter,
  createBridgeAdapter,
  createStateAdapter,
  mapBridgeEvent
} from "../src/session.js";
import { BridgeServer, FixtureLiveRuntime } from "../../live-bridge-remote-script/src/index.js";
import { createStateEngine } from "../../state-engine/src/index.js";

test("fixture session wires bridge, state engine, and MCP tools together", async () => {
  const session = await LaiveFixtureSession.create();

  try {
    const server = new LaiveMcpServer({
      stateAdapter: createStateAdapter(session),
      bridgeAdapter: createBridgeAdapter(session.bridgeClient),
      policyAdapter: createAllowAllPolicyAdapter()
    });

    const projectResponse = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "get_project_summary",
        arguments: {}
      }
    });

    assert.equal(projectResponse.result.isError, false);
    assert.equal(projectResponse.result.structuredContent.project.song.tempo, 124);
    assert.equal(projectResponse.result.structuredContent.project.tracks.length, 2);

    const tempoResponse = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "set_tempo",
        arguments: { tempo: 130 }
      }
    });

    assert.equal(
      tempoResponse.result.structuredContent.state_version_after >
        tempoResponse.result.structuredContent.state_version_before,
      true
    );

    const refreshedProject = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "get_project_summary",
        arguments: {}
      }
    });

    assert.equal(refreshedProject.result.structuredContent.project.song.tempo, 130);

    const arrangementResponse = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 3.1,
      method: "tools/call",
      params: {
        name: "get_arrangement_summary",
        arguments: {}
      }
    });

    assert.equal(arrangementResponse.result.isError, false);
    assert.equal(
      arrangementResponse.result.structuredContent.arrangement.counts.arrangementClips,
      2
    );

    const createClipResponse = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "create_clip",
        arguments: {
          trackId: "track:2",
          slotIndex: 0,
          name: "Bassline",
          lengthBeats: 8
        }
      }
    });

    assert.equal(
      createClipResponse.result.structuredContent.affected_objects.includes("track:2"),
      true
    );

    const insertNotesResponse = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "insert_notes",
        arguments: {
          clipId: "clip:session:track:2:slot:1",
          notes: [
            {
              pitch: 60,
              startBeats: 0,
              durationBeats: 1,
              velocity: 100
            }
          ]
        }
      }
    });

    assert.equal(insertNotesResponse.result.isError, false);

    const launchClipResponse = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 51,
      method: "tools/call",
      params: {
        name: "launch_clip",
        arguments: {
          clipId: "clip:session:track:2:slot:1"
        }
      }
    });

    assert.equal(launchClipResponse.result.isError, false);

    const trackDetails = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "get_track_details",
        arguments: {
          id: "track:2"
        }
      }
    });

    assert.equal(trackDetails.result.structuredContent.track.sessionClips.length, 1);
    assert.equal(trackDetails.result.structuredContent.track.sessionClips[0].name, "Bassline");
    assert.equal(trackDetails.result.structuredContent.track.sessionClips[0].noteCount, 1);
    assert.equal(trackDetails.result.structuredContent.track.sessionClips[0].isPlaying, true);

    const stopTrackClipsResponse = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 52,
      method: "tools/call",
      params: {
        name: "stop_track_clips",
        arguments: {
          trackId: "track:2"
        }
      }
    });

    assert.equal(stopTrackClipsResponse.result.isError, false);

    const stoppedTrackDetails = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 53,
      method: "tools/call",
      params: {
        name: "get_track_details",
        arguments: {
          id: "track:2"
        }
      }
    });

    assert.equal(stoppedTrackDetails.result.structuredContent.track.sessionClips[0].isPlaying, false);

    const launchSceneResponse = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 54,
      method: "tools/call",
      params: {
        name: "launch_scene",
        arguments: {
          sceneId: "scene:1"
        }
      }
    });

    assert.equal(launchSceneResponse.result.isError, false);

    const stopAllClipsResponse = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 55,
      method: "tools/call",
      params: {
        name: "stop_all_clips",
        arguments: {}
      }
    });

    assert.equal(stopAllClipsResponse.result.isError, false);

    const browserItems = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "get_browser_items",
        arguments: {
          path: "instruments"
        }
      }
    });

    assert.equal(browserItems.result.isError, false);
    assert.equal(browserItems.result.structuredContent.browser.items[0].name, "Operator");

    const loadItem = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: {
        name: "load_browser_item",
        arguments: {
          trackId: "track:2",
          path: "instruments/Operator"
        }
      }
    });

    assert.equal(loadItem.result.isError, false);

    const deviceTree = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: {
        name: "get_device_tree",
        arguments: {
          trackId: "track:2"
        }
      }
    });

    assert.equal(
      deviceTree.result.structuredContent.deviceTree.devices.some(
        (device) => device.name === "Operator"
      ),
      true
    );

    const returnTracks = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: "list_return_tracks",
        arguments: {}
      }
    });

    assert.equal(returnTracks.result.isError, false);
    assert.equal(returnTracks.result.structuredContent.tracks[0].id, "track:return:1");

    const masterTrack = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: {
        name: "get_master_track",
        arguments: {}
      }
    });

    assert.equal(masterTrack.result.isError, false);
    assert.equal(masterTrack.result.structuredContent.track.id, "track:master");

    const sendLevel = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: {
        name: "set_send_level",
        arguments: {
          trackId: "track:2",
          sendIndex: 0,
          value: 0.33
        }
      }
    });

    assert.equal(sendLevel.result.isError, false);
  } finally {
    await session.close();
  }
});

test("fixture session preserves send and routing aliases in track details", async () => {
  const session = await LaiveFixtureSession.create();

  try {
    const server = new LaiveMcpServer({
      stateAdapter: createStateAdapter(session),
      bridgeAdapter: createBridgeAdapter(session.bridgeClient),
      policyAdapter: createAllowAllPolicyAdapter()
    });

    const trackDetails = await server.safeHandleRpcMessage({
      jsonrpc: "2.0",
      id: 56,
      method: "tools/call",
      params: {
        name: "get_track_details",
        arguments: {
          id: "track:1"
        }
      }
    });

    assert.equal(trackDetails.result.isError, false);
    assert.ok(Array.isArray(trackDetails.result.structuredContent.track.track.sends));
    assert.ok(Array.isArray(trackDetails.result.structuredContent.track.track.availableRouting.outputTypes));
    assert.ok(
      Array.isArray(trackDetails.result.structuredContent.track.track.sends[0].aliases)
    );
    assert.ok(
      Array.isArray(
        trackDetails.result.structuredContent.track.track.availableRouting.outputTypes[0].aliases
      )
    );
  } finally {
    await session.close();
  }
});

test("track playback events update mirrored session state", () => {
  const stateEngine = createStateEngine();
  stateEngine.applySnapshot(
    {
      observed_at: "2026-03-22T00:00:00Z",
      bridge_version: "0.2.6",
      live_version: "11.3.25",
      application: {
        version: "11.3.25",
        mode: "live_set"
      },
      song: {
        name: "Test Set",
        tempo: 120,
        is_playing: true,
        is_recording: false
      },
      selection: null,
      capabilities: {
        runtime_version: "bridge",
        supported_commands: [],
        supported_events: [],
        features: {}
      },
      scenes: [
        {
          id: "scene:1",
          index: 0,
          name: "Scene 1"
        }
      ],
      tracks: [
        {
          id: "track:2",
          index: 1,
          name: "Bass",
          section: "visible",
          playing_slot_index: -1,
          fired_slot_index: -1,
          session_clips: [
            {
              id: "clip:session:track:2:slot:2",
              track_id: "track:2",
              location: "session",
              slot_index: 1,
              name: "Scene 2 Bass",
              is_playing: false,
              note_count: 4
            }
          ],
          arrangement_clips: [],
          devices: []
        }
      ]
    },
    {
      observedAt: "2026-03-22T00:00:00Z"
    }
  );

  const mapped = mapBridgeEvent("clips.changed", {
    action: "track-playback-changed",
    track_id: "track:2",
    track: {
      id: "track:2",
      index: 1,
      name: "Bass",
      section: "visible",
      playing_slot_index: 1,
      fired_slot_index: 1,
      session_clips: [
        {
          id: "clip:session:track:2:slot:2",
          track_id: "track:2",
          location: "session",
          slot_index: 1,
          name: "Scene 2 Bass",
          is_playing: true,
          note_count: 4
        }
      ],
      arrangement_clips: [],
      devices: []
    }
  });

  stateEngine.applyEvent(mapped, {
    observedAt: "2026-03-22T00:00:01Z"
  });

  const summary = stateEngine.query.summarizeProject();
  const trackDetails = stateEngine.query.getTrackDetails("track:2");

  assert.equal(summary.counts.playingClips, 1);
  assert.equal(summary.playingClips[0].id, "clip:session:track:2:slot:2");
  assert.equal(trackDetails.track.playingSlotIndex, 1);
  assert.equal(trackDetails.sessionClips[0].isPlaying, true);
});

test("project summary derives playing clips from track slot state", () => {
  const stateEngine = createStateEngine();
  stateEngine.applySnapshot(
    {
      observed_at: "2026-03-22T00:00:00Z",
      bridge_version: "0.2.6",
      live_version: "11.3.25",
      application: {
        version: "11.3.25",
        mode: "live_set"
      },
      song: {
        name: "Test Set",
        tempo: 120,
        is_playing: true,
        is_recording: false
      },
      selection: null,
      capabilities: {
        runtime_version: "bridge",
        supported_commands: [],
        supported_events: [],
        features: {}
      },
      scenes: [
        {
          id: "scene:1",
          index: 0,
          name: "Scene 1"
        }
      ],
      tracks: [
        {
          id: "track:1",
          index: 0,
          name: "Lead",
          section: "visible",
          playing_slot_index: 0,
          fired_slot_index: 0,
          session_clips: [
            {
              id: "clip:session:track:1:slot:1",
              track_id: "track:1",
              location: "session",
              slot_index: 0,
              name: "Lead Clip",
              is_playing: false,
              note_count: 8
            }
          ],
          arrangement_clips: [],
          devices: []
        }
      ]
    },
    {
      observedAt: "2026-03-22T00:00:00Z"
    }
  );

  const summary = stateEngine.query.summarizeProject();
  const trackDetails = stateEngine.query.getTrackDetails("track:1");

  assert.equal(summary.counts.playingClips, 1);
  assert.equal(summary.playingClips[0].id, "clip:session:track:1:slot:1");
  assert.equal(trackDetails.sessionClips[0].isPlaying, true);
});

test("real bridge session can connect to a live bridge socket and refresh state", async () => {
  const runtime = await FixtureLiveRuntime.fromFixture();
  const server = new BridgeServer({ runtime });
  const sockets = createLoopbackSocketPair();
  runtime.on("event", server.boundRuntimeEventHandler);
  server.attachClient(sockets.serverSocket);

  const session = await LaiveBridgeSession.connect({
    clientId: "real-bridge-test",
    socketFactory() {
      queueMicrotask(() => {
        sockets.clientSocket.emit("connect");
      });
      return sockets.clientSocket;
    }
  });

  try {
    const summary = await createStateAdapter(session).getProjectSummary();
    assert.equal(summary.song.tempo, 124);
    const arrangementSummary = await createStateAdapter(session).getArrangementSummary();
    assert.equal(arrangementSummary.counts.arrangementClips, 2);
    assert.equal(summary.counts.returnTracks, 1);
    assert.equal(summary.counts.masterTracks, 1);
    const returnTracks = await createStateAdapter(session).listReturnTracks();
    assert.equal(returnTracks[0].id, "track:return:1");
    const masterTrack = await createStateAdapter(session).getMasterTrack();
    assert.equal(masterTrack.id, "track:master");

    await createBridgeAdapter(session.bridgeClient).setTempo(140);
    await createBridgeAdapter(session.bridgeClient).setArrangementTransport({
      arrangementPositionBeats: 8,
      loopEnabled: true,
      loopStartBeats: 0,
      loopLengthBeats: 16
    });
    await createBridgeAdapter(session.bridgeClient).playTransport();
    await createBridgeAdapter(session.bridgeClient).stopTransport();
    await createBridgeAdapter(session.bridgeClient).createScene("Bridge Scene");
    await createBridgeAdapter(session.bridgeClient).setSendLevel({
      trackId: "track:1",
      sendIndex: 0,
      value: 0.5
    });
    await createBridgeAdapter(session.bridgeClient).setMonitorState({
      trackId: "track:1",
      monitoringState: 2
    });
    await createBridgeAdapter(session.bridgeClient).setTrackRouting({
      trackId: "track:1",
      outputRoutingType: "master"
    });

    const eventPromise = once(session.bridgeClient, "event:transport.changed");
    await createBridgeAdapter(session.bridgeClient).setTempo(142);
    await eventPromise;

    const clip = await createBridgeAdapter(session.bridgeClient).createClip({
      trackId: "track:2",
      slotIndex: 0,
      lengthBeats: 4,
      name: "Runtime Clip"
    });
    await createBridgeAdapter(session.bridgeClient).insertNotes({
      clipId: clip.clip.id,
      notes: [
        {
          pitch: 67,
          startBeats: 0,
          durationBeats: 0.5,
          velocity: 100
        }
      ]
    });
    await createBridgeAdapter(session.bridgeClient).launchClip({
      clipId: clip.clip.id
    });
    await createBridgeAdapter(session.bridgeClient).stopTrackClips({
      trackId: "track:2"
    });
    const arrangementClip = await createBridgeAdapter(session.bridgeClient).createArrangementClip({
      trackId: "track:2",
      startBeats: 16,
      lengthBeats: 8,
      name: "Runtime Arrangement"
    });
    await createBridgeAdapter(session.bridgeClient).duplicateClipToArrangement({
      clipId: clip.clip.id,
      destinationBeats: 32,
      targetTrackId: "track:2"
    });
    await createBridgeAdapter(session.bridgeClient).moveArrangementClip({
      clipId: "clip:arrangement:track:2:index:1",
      destinationBeats: 24
    });
    await createBridgeAdapter(session.bridgeClient).launchScene({
      sceneId: "scene:1"
    });
    await createBridgeAdapter(session.bridgeClient).stopAllClips();

    const refresh = await createStateAdapter(session).refreshState("song");
    assert.equal(refresh.stateVersion > refresh.previousStateVersion, true);
    const updated = await createStateAdapter(session).getProjectSummary();
    assert.equal(updated.song.tempo, 142);
    assert.equal(updated.song.arrangementPositionBeats, 24);
    const arrangementDetails = await createStateAdapter(session).getArrangementTrackDetails("track:2");
    assert.equal(arrangementClip.clip.location, "arrangement");
    assert.equal(arrangementDetails.arrangementClips.length, 3);
    assert.equal(
      arrangementDetails.arrangementClips.some((clip) => clip.id === "clip:arrangement:track:2:index:1" && clip.startBeats === 24),
      true
    );
  } finally {
    await session.close();
    runtime.off("event", server.boundRuntimeEventHandler);
    sockets.serverSocket.destroy();
  }
});

test("lazy bridge session reconnects after the underlying socket closes", async () => {
  const runtime = await FixtureLiveRuntime.fromFixture();
  const server = new BridgeServer({ runtime });
  const sockets = [];
  let connectionCount = 0;
  runtime.on("event", server.boundRuntimeEventHandler);

  const session = LaiveBridgeSession.createLazy({
    clientId: "lazy-bridge-test",
    socketFactory() {
      const pair = createLoopbackSocketPair();
      sockets.push(pair);
      connectionCount += 1;
      server.attachClient(pair.serverSocket);
      queueMicrotask(() => {
        pair.clientSocket.emit("connect");
      });
      return pair.clientSocket;
    }
  });

  try {
    const firstSession = await session.ensureConnected();
    const firstClient = firstSession.bridgeClient;
    const firstSummary = await createStateAdapter(session).getProjectSummary();
    assert.equal(firstSummary.song.tempo, 124);
    assert.equal(connectionCount, 1);

    const closePromise = once(firstClient, "close");
    firstClient.socket.end();
    await closePromise;

    assert.equal(session.activeSession, null);
    assert.equal(session.bridgeClient, null);

    const secondSession = await session.ensureConnected();
    const secondSummary = await createStateAdapter(session).getProjectSummary();
    assert.equal(secondSummary.song.tempo, 124);
    assert.equal(connectionCount, 2);
    assert.notEqual(secondSession.bridgeClient, firstClient);
  } finally {
    await session.close();
    runtime.off("event", server.boundRuntimeEventHandler);
    for (const pair of sockets) {
      pair.serverSocket.destroy();
    }
  }
});

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
