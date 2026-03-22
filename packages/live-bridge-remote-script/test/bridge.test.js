import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { EventEmitter } from "node:events";

import { BridgeClient } from "../src/bridge/client.js";
import { BridgeServer } from "../src/bridge/server.js";
import { FixtureLiveRuntime } from "../src/runtime/fixture-runtime.js";

async function withBridge(run) {
  const runtime = await FixtureLiveRuntime.fromFixture();
  const server = new BridgeServer({ runtime });
  const sockets = createLoopbackSocketPair();
  runtime.on("event", server.boundRuntimeEventHandler);
  server.attachClient(sockets.serverSocket);
  const client = new BridgeClient({
    clientId: "test-client",
    socketFactory() {
      queueMicrotask(() => {
        sockets.clientSocket.emit("connect");
      });
      return sockets.clientSocket;
    }
  });

  await client.connect();

  try {
    await run({ client, server, runtime });
  } finally {
    await client.disconnect();
    runtime.off("event", server.boundRuntimeEventHandler);
    sockets.serverSocket.destroy();
  }
}

test("bridge client can perform hello and state queries", async () => {
  await withBridge(async ({ client }) => {
    const hello = await client.request("hello");
    const song = await client.request("get", "song");
    const tracks = await client.request("get", "tracks");

    assert.equal(hello.result.bridge, "laive-fixture-runtime");
    assert.equal(song.result.name, "Fixture Set");
    assert.equal(tracks.result.length, 2);
  });
});

test("bridge mutations update runtime and emit events", async () => {
  await withBridge(async ({ client }) => {
    await client.subscribe("transport.changed");
    const eventPromise = once(client, "event:transport.changed");
    await client.request("call", "transport.play");
    const [event] = await eventPromise;
    const song = await client.request("get", "song");

    assert.equal(event.payload.is_playing, true);
    assert.equal(song.result.is_playing, true);
  });
});

test("bridge supports dry run mutations", async () => {
  await withBridge(async ({ client }) => {
    const response = await client.request(
      "call",
      "create_track",
      { name: "Dry Run Track" },
      { dryRun: true }
    );
    const tracks = await client.request("get", "tracks");

    assert.equal(response.result.applied, false);
    assert.equal(tracks.result.length, 2);
  });
});

test("bridge can create clips and insert notes", async () => {
  await withBridge(async ({ client }) => {
    const createClip = await client.request("call", "create_clip", {
      track_id: "track:2",
      name: "Bassline",
      length_beats: 8
    });

    const clipId = createClip.result.clip.id;
    const notesResponse = await client.request("call", "insert_notes", {
      clip_id: clipId,
      notes: [
        {
          pitch: 48,
          start_beats: 0,
          duration_beats: 0.5,
          velocity: 110
        }
      ]
    });
    const clip = await client.request("get", clipId);

    assert.equal(notesResponse.result.note_count, 1);
    assert.equal(clip.result.notes.length, 1);
  });
});

function createLoopbackSocketPair() {
  const serverSocket = new FakeSocket();
  const clientSocket = new FakeSocket();
  serverSocket.peer = clientSocket;
  clientSocket.peer = serverSocket;
  return { serverSocket, clientSocket };
}

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.peer = null;
    this.closed = false;
  }

  setEncoding() {}

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
