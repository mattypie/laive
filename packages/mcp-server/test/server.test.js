import test from "node:test";
import assert from "node:assert/strict";
import { LaiveMcpServer } from "../src/index.js";

function createServer() {
  let stateVersion = 3;

  const stateAdapter = {
    async getProjectSummary() {
      return {
        stateVersion,
        tempo: 124,
        tracks: [
          { id: "track:1", name: "Drums" },
          { id: "track:2", name: "Bass" }
        ]
      };
    },
    async getSelectedContext() {
      return {
        stateVersion,
        track: { id: "track:1", name: "Drums" },
        scene: { id: "scene:0", name: "Intro" },
        clip: { id: "clip:session:track=1:slot=0" },
        device: { id: "device:track=1:index=0" }
      };
    },
    async listTracks() {
      return [
        { id: "track:1", name: "Drums", stateVersion },
        { id: "track:2", name: "Bass", stateVersion }
      ];
    },
    async getTrackDetails(target) {
      return {
        id: String(target),
        name: String(target),
        clips: [],
        stateVersion
      };
    },
    async getDeviceTree(trackId) {
      return {
        trackId,
        stateVersion,
        devices: [{ id: `${trackId}:device:1`, name: "EQ Eight" }]
      };
    },
    async refreshState(target) {
      stateVersion += 1;
      return {
        target,
        stateVersion,
        previousStateVersion: stateVersion - 1,
        affectedObjects: [target]
      };
    }
  };

  const bridgeAdapter = {
    async setTempo(tempo, options) {
      return { tempo, options };
    },
    async createTrack(kind, options) {
      return { kind, options, affectedObjects: [`track:new:${kind}`] };
    },
    async createClip(payload) {
      return { affectedObjects: [payload.trackId, `clip:${payload.slotIndex}`] };
    },
    async setParameter(payload) {
      return payload;
    },
    async getCapabilities() {
      return {
        bridgeVersion: "0.1.0",
        features: ["tempo", "tracks", "clips"]
      };
    }
  };

  const policyAdapter = {
    async assertAllowed() {
      return true;
    }
  };

  return new LaiveMcpServer({ stateAdapter, bridgeAdapter, policyAdapter });
}

test("tools/list returns registered tools", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list"
  });

  assert.equal(response.result.server.name, "laive-mcp");
  assert.ok(response.result.tools.some((tool) => tool.name === "get_project_summary"));
});

test("initialize returns MCP server info and tool capability metadata", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      clientInfo: {
        name: "codex-test",
        version: "1.0.0"
      }
    }
  });

  assert.equal(response.result.protocolVersion, "2024-11-05");
  assert.equal(response.result.serverInfo.name, "laive-mcp");
  assert.deepEqual(response.result.capabilities, {
    tools: {
      listChanged: false
    }
  });
});

test("initialized notifications do not emit a response", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    method: "notifications/initialized"
  });

  assert.equal(response, null);
});

test("set_tempo returns structured mutation response", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "set_tempo",
      arguments: { tempo: 128 }
    }
  });

  assert.equal(response.result.summary, "Tempo set to 128.");
  assert.equal(response.result.state_version_before, 3);
  assert.equal(response.result.state_version_after, 4);
});

test("create_clip validates required arguments", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "create_clip",
      arguments: { slotIndex: 0 }
    }
  });

  assert.equal(response.error.code, "invalid_request");
});
