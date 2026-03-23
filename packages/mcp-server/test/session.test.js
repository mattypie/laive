import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { LaiveMcpServer } from "../src/index.js";
import {
  LaiveBridgeSession,
  LaiveFixtureSession,
  createAllowAllPolicyAdapter,
  createBridgeAdapter,
  createStateAdapter
} from "../src/session.js";
import { BridgeServer, FixtureLiveRuntime } from "../../live-bridge-remote-script/src/index.js";

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
  } finally {
    await session.close();
  }
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

    await createBridgeAdapter(session.bridgeClient).setTempo(140);
    await createBridgeAdapter(session.bridgeClient).playTransport();
    await createBridgeAdapter(session.bridgeClient).stopTransport();
    await createBridgeAdapter(session.bridgeClient).createScene("Bridge Scene");

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
    await createBridgeAdapter(session.bridgeClient).launchScene({
      sceneId: "scene:1"
    });
    await createBridgeAdapter(session.bridgeClient).stopAllClips();

    const refresh = await createStateAdapter(session).refreshState("song");
    assert.equal(refresh.stateVersion > refresh.previousStateVersion, true);
    const updated = await createStateAdapter(session).getProjectSummary();
    assert.equal(updated.song.tempo, 142);
  } finally {
    await session.close();
    runtime.off("event", server.boundRuntimeEventHandler);
    sockets.serverSocket.destroy();
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
