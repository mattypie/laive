import test from "node:test";
import assert from "node:assert/strict";
import { LaiveMcpServer, McpServerError } from "../src/index.js";

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
    async playTransport(options) {
      return { options, target: "transport.play" };
    },
    async stopTransport(options) {
      return { options, target: "transport.stop" };
    },
    async createTrack(kind, options) {
      return { kind, options, affectedObjects: [`track:new:${kind}`] };
    },
    async createScene(name, options) {
      return {
        name,
        options,
        affectedObjects: ["scene:new"],
        scene: { id: "scene:new", name: name ?? "Scene 3" }
      };
    },
    async createClip(payload) {
      return { affectedObjects: [payload.trackId, `clip:${payload.slotIndex}`] };
    },
    async insertNotes(payload, options) {
      return {
        payload,
        options,
        affectedObjects: [payload.clipId]
      };
    },
    async setParameter(payload) {
      return payload;
    },
    async getBrowserTree() {
      return {
        roots: [
          {
            name: "Instruments",
            path: "instruments",
            uri: "browser:instruments",
            children: [
              {
                name: "Operator",
                path: "instruments/Operator",
                uri: "browser:instruments:operator",
                is_loadable: true
              }
            ]
          }
        ]
      };
    },
    async getBrowserItems(payload = {}) {
      return {
        path: payload.path ?? null,
        items: [
          {
            name: "Operator",
            path: "instruments/Operator",
            uri: "browser:instruments:operator",
            is_loadable: true
          }
        ]
      };
    },
    async loadBrowserItem(payload) {
      return {
        item: {
          uri: payload.uri ?? "browser:instruments:operator",
          path: payload.path ?? "instruments/Operator"
        },
        track: {
          id: payload.trackId,
          devices: [{ id: `${payload.trackId}:device:new` }]
        },
        affectedObjects: [payload.trackId, `${payload.trackId}:device:new`]
      };
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

  const sidecarAdapter = {
    async getStatus() {
      return {
        configured: false,
        devicePath: "/Users/test/Music/Ableton/User Library/Presets/MIDI Effects/Max MIDI Effect/laive-sidecar.amxd",
        workflows: [
          {
            name: "replaceClipNotes",
            description: "Apply notes to a clip."
          }
        ],
        setup_instructions: ["Install the sidecar device."]
      };
    },
    async listWorkflows() {
      return await this.getStatus();
    },
    async snapshotSelectionContext() {
      throw new McpServerError("setup_required", "Max for Live sidecar is not configured", {
        component: "sidecar",
        setup_instructions: ["Install the sidecar device."]
      });
    },
    async replaceClipNotes() {
      throw new McpServerError("setup_required", "Max for Live sidecar is not configured", {
        component: "sidecar",
        setup_instructions: ["Install the sidecar device."]
      });
    },
    async observeDeviceParameters() {
      throw new McpServerError("setup_required", "Max for Live sidecar is not configured", {
        component: "sidecar",
        setup_instructions: ["Install the sidecar device."]
      });
    },
    async executeWorkflow(name) {
      if (name === "replaceClipNotes") {
        return await this.replaceClipNotes();
      }
      if (name === "snapshotSelectionContext") {
        return await this.snapshotSelectionContext();
      }
      return await this.observeDeviceParameters();
    }
  };

  const uiAutomationAdapter = {
    async getStatus() {
      return {
        configured: true,
        appBundleRoot: "/Users/test/Applications/laive-ui-helper.app",
        executablePath: "/Users/test/Applications/laive-ui-helper.app/Contents/MacOS/laive-ui-helper",
        workflows: [
          {
            name: "captureContext",
            description: "Capture focused app metadata.",
            parameters: []
          }
        ],
        setup_instructions: []
      };
    },
    async listWorkflows() {
      return await this.getStatus();
    },
    async executeWorkflow(name, parameters) {
      return {
        configured: true,
        workflow: name,
        parameters
      };
    }
  };

  return new LaiveMcpServer({
    stateAdapter,
    bridgeAdapter,
    policyAdapter,
    sidecarAdapter,
    uiAutomationAdapter
  });
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

  const byName = new Map(response.result.tools.map((tool) => [tool.name, tool]));

  assert.deepEqual(byName.get("get_project_summary").inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false
  });
  assert.deepEqual(byName.get("set_tempo").inputSchema.required, ["tempo"]);
  assert.equal(byName.get("set_tempo").inputSchema.properties.tempo.type, "number");
  assert.deepEqual(byName.get("create_clip").inputSchema.required, [
    "trackId",
    "slotIndex"
  ]);
  assert.equal(
    byName.get("create_clip").inputSchema.properties.slotIndex.type,
    "integer"
  );
  assert.deepEqual(byName.get("set_parameter").inputSchema.required, [
    "trackId",
    "deviceId",
    "parameterId",
    "value"
  ]);
  assert.equal(
    byName.get("get_track_details").inputSchema.properties.index.type,
    "integer"
  );
  assert.ok(byName.has("get_browser_tree"));
  assert.ok(byName.has("get_browser_items"));
  assert.ok(byName.has("load_browser_item"));
  assert.ok(byName.has("play_transport"));
  assert.ok(byName.has("stop_transport"));
  assert.ok(byName.has("create_scene"));
  assert.ok(byName.has("insert_notes"));
  assert.ok(byName.has("get_component_status"));
  assert.ok(byName.has("list_sidecar_workflows"));
  assert.ok(byName.has("sidecar_snapshot_selection_context"));
  assert.ok(byName.has("sidecar_replace_clip_notes"));
  assert.ok(byName.has("sidecar_observe_device_parameters"));
  assert.ok(byName.has("run_sidecar_workflow"));
  assert.ok(byName.has("list_ui_workflows"));
  assert.ok(byName.has("ui_capture_context"));
  assert.ok(byName.has("ui_focus_section"));
  assert.ok(byName.has("ui_browser_search_and_load"));
  assert.ok(byName.has("ui_export_audio_video"));
  assert.ok(byName.has("ui_export_with_preset"));
  assert.ok(byName.has("run_ui_workflow"));
});

test("browser tools expose query and load flows", async () => {
  const server = createServer();

  const items = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: {
      name: "get_browser_items",
      arguments: {
        path: "instruments"
      }
    }
  });

  assert.equal(items.result.isError, false);
  assert.equal(items.result.structuredContent.browser.items[0].name, "Operator");

  const load = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: {
      name: "load_browser_item",
      arguments: {
        trackId: "track:1",
        path: "instruments/Operator"
      }
    }
  });

  assert.equal(load.result.isError, false);
  assert.equal(
    load.result.structuredContent.affected_objects.includes("track:1:device:new"),
    true
  );
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

  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.summary, "Tempo set to 128.");
  assert.equal(response.result.structuredContent.state_version_before, 3);
  assert.equal(response.result.structuredContent.state_version_after, 4);
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

  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.error.code, "invalid_request");
});

test("play_transport returns structured mutation response", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "play_transport",
      arguments: {}
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.summary, "Transport started.");
});

test("insert_notes validates and returns mutation response", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
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

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.summary,
    "Notes inserted for clip:session:track:2:slot:1."
  );
});

test("run_sidecar_workflow surfaces setup instructions when sidecar is unavailable", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: {
      name: "run_sidecar_workflow",
      arguments: {
        name: "replaceClipNotes"
      }
    }
  });

  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.error.code, "setup_required");
  assert.equal(
    response.result.structuredContent.error.data.component,
    "sidecar"
  );
});

test("get_component_status reports bridge and optional component state", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: {
      name: "get_component_status",
      arguments: {}
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.components.bridge.available, true);
  assert.equal(response.result.structuredContent.components.sidecar.configured, false);
  assert.equal(response.result.structuredContent.components.ui_helper.configured, true);
});

test("run_ui_workflow executes available optional workflows", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: {
      name: "run_ui_workflow",
      arguments: {
        name: "captureContext"
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.ui_workflow.workflow, "captureContext");
});

test("sidecar_replace_clip_notes surfaces setup instructions when sidecar is unavailable", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: {
      name: "sidecar_replace_clip_notes",
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

  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.error.code, "setup_required");
});
