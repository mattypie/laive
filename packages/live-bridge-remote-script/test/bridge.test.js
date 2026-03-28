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

test("bridge client rejects pending requests when the socket closes", async () => {
  const sockets = createLoopbackSocketPair();
  sockets.serverSocket.on("data", () => {
    sockets.serverSocket.end();
  });

  const client = new BridgeClient({
    clientId: "closing-client-test",
    socketFactory() {
      queueMicrotask(() => {
        sockets.clientSocket.emit("connect");
      });
      return sockets.clientSocket;
    }
  });

  await client.connect();

  await assert.rejects(
    () => client.request("hello"),
    /Bridge connection closed/
  );
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

test("bridge create_clip rejects occupied slots and emits loop aliases on new clips", async () => {
  await withBridge(async ({ client }) => {
    const response = await client.request("call", "create_clip", {
      track_id: "track:2",
      slot_index: 1,
      name: "Long Bass",
      length_beats: 8
    });
    const clip = await client.request("get", response.result.clip.id);

    await assert.rejects(
      () =>
        client.request("call", "create_clip", {
          track_id: "track:2",
          slot_index: 1,
          name: "Overwrite Attempt"
        }),
      /Target clip slot already contains a clip: 1/
    );

    assert.equal(clip.result.slotIndex, 1);
    assert.equal(clip.result.length_beats, 8);
    assert.equal(clip.result.lengthBeats, 8);
    assert.equal(clip.result.loop_start_beats, 0);
    assert.equal(clip.result.loopStartBeats, 0);
    assert.equal(clip.result.loop_end_beats, 8);
    assert.equal(clip.result.loopEndBeats, 8);
    assert.equal(clip.result.looping, true);
  });
});

test("bridge can replace notes without appending", async () => {
  await withBridge(async ({ client }) => {
    const replace = await client.request("call", "replace_notes", {
      clip_id: "clip:session:track:1:slot:1",
      notes: [
        {
          pitch: 40,
          start_beats: 1,
          duration_beats: 0.25,
          velocity: 90
        }
      ]
    });
    const clip = await client.request("get", "clip:session:track:1:slot:1");

    assert.equal(replace.result.note_count, 1);
    assert.equal(clip.result.notes.length, 1);
    assert.equal(clip.result.notes[0].pitch, 40);
  });
});

test("bridge can browse and load browser items", async () => {
  await withBridge(async ({ client }) => {
    const tree = await client.request("get", "browser.tree");
    const items = await client.request("call", "get_browser_items", {
      path: "instruments"
    });
    const load = await client.request("call", "load_browser_item", {
      track_id: "track:1",
      path: "instruments/Operator"
    });
    const track = await client.request("get", "track:1");

    assert.equal(tree.result.roots[0].name, "Instruments");
    assert.equal(items.result.items[0].name, "Operator");
    assert.equal(load.result.track.id, "track:1");
    assert.equal(track.result.devices.some((device) => device.name === "Operator"), true);
  });
});

test("bridge can edit session clips", async () => {
  await withBridge(async ({ client }) => {
    await client.request("call", "rename_clip", {
      clip_id: "clip:session:track:1:slot:1",
      name: "Beat B"
    });
    await client.request("call", "duplicate_clip", {
      clip_id: "clip:session:track:1:slot:1",
      target_slot_index: 1
    });
    await client.request("call", "set_clip_loop_or_length", {
      clip_id: "clip:session:track:1:slot:1",
      length_beats: 8,
      loop_end_beats: 8
    });
    await client.request("call", "move_session_clip", {
      clip_id: "clip:session:track:1:slot:2",
      target_slot_index: 2
    });
    await client.request("call", "delete_clip", {
      clip_id: "clip:session:track:1:slot:3"
    });

    const track = await client.request("get", "track:1");
    const renamed = track.result.session_clips.find((clip) => clip.slot_index === 0);

    assert.equal(renamed.name, "Beat B");
    assert.equal(renamed.length_beats, 8);
    assert.equal(renamed.loop_end_beats, 8);
    assert.equal(track.result.session_clips.some((clip) => clip.slot_index === 1), false);
    assert.equal(track.result.session_clips.some((clip) => clip.slot_index === 2), false);
  });
});

test("bridge exposes quantized parameter metadata", async () => {
  await withBridge(async ({ client }) => {
    const parameter = await client.request("get", "parameter:device:track:2:1:1");

    assert.equal(parameter.result.is_quantized, true);
    assert.equal(parameter.result.value_items[0], "Algorithm 1");
    assert.equal(parameter.result.value_items[2], "Algorithm 3");
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
