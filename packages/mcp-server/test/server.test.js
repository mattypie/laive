import test from "node:test";
import assert from "node:assert/strict";
import { LaiveMcpServer, McpServerError } from "../src/index.js";

function createServer(options = {}) {
  let stateVersion = 3;
  let selectedTrackId = "track:1";
  let activeSidecarTrackId = options.activeSidecarTrackId ?? null;
  let lastSendLevelPayload = null;
  let lastTrackRoutingPayload = null;
  const browserSidecarItem = options.browserSidecarItem ?? null;

  const stateAdapter = {
    async getProjectSummary() {
      return {
        stateVersion,
        tempo: 124,
        song: {
          currentSongTime: 0,
          arrangementPositionBeats: 0,
          loopEnabled: false,
          loopStartBeats: 0,
          loopLengthBeats: 16
        },
        tracks: [
          { id: "track:1", name: "Drums" },
          { id: "track:2", name: "Bass" }
        ]
      };
    },
    async getArrangementSummary() {
      return {
        stateVersion,
        song: {
          name: "Test Set",
          isPlaying: false,
          currentSongTime: 4,
          arrangementPositionBeats: 4,
          loopEnabled: true,
          loopStartBeats: 0,
          loopLengthBeats: 16
        },
        counts: {
          arrangementTracks: 1,
          arrangementClips: 1
        },
        tracks: [{ id: "track:1", name: "Drums", section: "visible", arrangementClipCount: 1 }],
        arrangementClips: [
          {
            id: "clip:arrangement:track:1:index:1",
            name: "Verse",
            trackId: "track:1",
            trackName: "Drums",
            index: 0,
            startBeats: 0,
            endBeats: 16,
            loopStartBeats: 0,
            loopEndBeats: 16,
            isPlaying: false
          }
        ]
      };
    },
    async getArrangementTrackDetails(target) {
      const details = await this.getTrackDetails(target);
      return {
        id: details.id,
        name: details.name,
        track: details.track,
        arrangementClips: details.arrangementClips,
        stateVersion
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
        { id: "track:1", name: "Drums", section: "visible", stateVersion },
        { id: "track:2", name: "Bass", section: "visible", stateVersion }
      ];
    },
    async listReturnTracks() {
      return [
        { id: "track:return:1", name: "A Reverb", section: "return", stateVersion }
      ];
    },
    async getMasterTrack() {
      return {
        id: "track:master",
        name: "Master",
        track: {
          id: "track:master",
          name: "Master",
          section: "master",
          sends: []
        },
        sessionClips: [],
        arrangementClips: [],
        devices: [],
        stateVersion
      };
    },
    async getTrackDetails(target) {
      const normalized = String(target);
      const trackId = normalized === "track:2" || normalized === "Bass"
        ? "track:2"
        : normalized === "track:return:1" || normalized === "A Reverb"
          ? "track:return:1"
          : normalized === "track:master" || normalized === "Master"
            ? "track:master"
            : "track:1";
      return {
        id: trackId,
        name:
          trackId === "track:2"
            ? "Bass"
            : trackId === "track:return:1"
              ? "A Reverb"
              : trackId === "track:master"
                ? "Master"
                : "Drums",
        track: {
          id: trackId,
          name:
            trackId === "track:2"
              ? "Bass"
              : trackId === "track:return:1"
                ? "A Reverb"
                : trackId === "track:master"
                  ? "Master"
                  : "Drums",
          section:
            trackId === "track:return:1"
              ? "return"
              : trackId === "track:master"
                ? "master"
                : "visible",
          sends:
            trackId === "track:master"
              ? []
              : [
                  {
                    id: `send:${trackId}:1`,
                    name: "Send A",
                    value: 0.25,
                    min: 0,
                    max: 1,
                    isQuantized: false
                  }
                ],
          monitoringState: trackId.startsWith("track:return") || trackId.startsWith("track:master")
            ? null
            : 1,
          inputRoutingType: { display_name: "All Ins", identifier: "all_ins" },
          inputRoutingChannel: { display_name: "All Channels", identifier: "all_channels" },
          outputRoutingType: { display_name: "Master", identifier: "master" },
          outputRoutingChannel: { display_name: "Post Mixer", identifier: "post_mixer" },
          availableInputRoutingTypes: [
            { display_name: "All Ins", identifier: "all_ins" },
            { display_name: "No Input", identifier: "no_input" }
          ],
          availableInputRoutingChannels: [
            { display_name: "All Channels", identifier: "all_channels" },
            { display_name: "Ch. 1", identifier: "ch_1" }
          ],
          availableOutputRoutingTypes: [
            { display_name: "Master", identifier: "master" },
            { display_name: "Sends Only", identifier: "sends_only" }
          ],
          availableOutputRoutingChannels: [
            { display_name: "Post Mixer", identifier: "post_mixer" },
            { display_name: "1/2", identifier: "1_2" }
          ]
        },
        sessionClips: trackId.startsWith("track:return") || trackId.startsWith("track:master")
          ? []
          : [
              {
                id: `clip:session:${trackId}:slot:1`,
                slotIndex: 0,
                name: trackId === "track:2" ? "Bassline" : "Beat A",
                lengthBeats: 4,
                loopStartBeats: 0,
                loopEndBeats: 4,
                looping: true
              }
            ],
        arrangementClips: trackId === "track:1"
          ? [
              {
                id: "clip:arrangement:track:1:index:1",
                location: "arrangement",
                index: 0,
                name: "Verse",
                startBeats: 0,
                endBeats: 16,
                loopStartBeats: 0,
                loopEndBeats: 16,
                looping: false,
                isPlaying: false
              }
            ]
          : [],
        devices: trackId === "track:2"
          ? [
              {
                id: "device:track:2:1",
                name: "Operator",
                parameters: [
                  {
                    id: "parameter:device:track:2:1:1",
                    name: "Algorithm",
                    value: 1,
                    min: 0,
                    max: 10,
                    isQuantized: true,
                    allowedValues: [
                      { value: 0, label: "Algorithm 1" },
                      { value: 1, label: "Algorithm 2" },
                      { value: 2, label: "Algorithm 3" }
                    ],
                    enumLabels: {
                      "0": "Algorithm 1",
                      "1": "Algorithm 2",
                      "2": "Algorithm 3"
                    }
                  }
                ]
              }
            ]
          : trackId === "track:return:1"
            ? [
                {
                  id: "device:track:return:1:1",
                  name: "Hybrid Reverb",
                  parameters: [
                    {
                      id: "parameter:device:track:return:1:1:1",
                      name: "Device On",
                      value: 1,
                      min: 0,
                      max: 1,
                      isQuantized: true,
                      allowedValues: [
                        { value: 0, label: "Off" },
                        { value: 1, label: "On" }
                      ],
                      enumLabels: {
                        "0": "Off",
                        "1": "On"
                      }
                    }
                  ]
                }
              ]
          : [],
        stateVersion
      };
    },
    async getDeviceTree(trackId) {
      return {
        trackId,
        stateVersion,
        devices: trackId === "track:2"
          ? [
              {
                id: "device:track:2:1",
                name: "Operator",
                parameters: [
                  {
                    id: "parameter:device:track:2:1:1",
                    name: "Algorithm",
                    value: 1,
                    min: 0,
                    max: 10,
                    isQuantized: true,
                    allowedValues: [
                      { value: 0, label: "Algorithm 1" },
                      { value: 1, label: "Algorithm 2" },
                      { value: 2, label: "Algorithm 3" }
                    ],
                    enumLabels: {
                      "0": "Algorithm 1",
                      "1": "Algorithm 2",
                      "2": "Algorithm 3"
                    }
                  }
                ]
              }
            ]
          : [{ id: `${trackId}:device:1`, name: "EQ Eight", parameters: [] }]
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
    async setArrangementTransport(payload, options) {
      return { payload, options, affectedObjects: ["song"] };
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
    async createArrangementClip(payload) {
      return {
        payload,
        affectedObjects: [payload.trackId, "clip:arrangement:new"],
        clip: {
          id: "clip:arrangement:track:1:index:2"
        }
      };
    },
    async renameClip(payload) {
      return { payload, affectedObjects: [payload.clipId] };
    },
    async duplicateClip(payload) {
      return {
        payload,
        affectedObjects: [payload.clipId, `clip:duplicate:${payload.targetSlotIndex}`],
        clip: {
          id: `clip:session:${payload.targetTrackId ?? "track:2"}:slot:${payload.targetSlotIndex + 1}`
        }
      };
    },
    async duplicateClipToArrangement(payload) {
      return {
        payload,
        affectedObjects: [payload.clipId, payload.targetTrackId ?? "track:1", "clip:arrangement:dup"],
        clip: {
          id: `clip:arrangement:${payload.targetTrackId ?? "track:1"}:index:2`
        }
      };
    },
    async duplicateArrangementClip(payload) {
      return {
        payload,
        affectedObjects: [payload.clipId, payload.targetTrackId ?? "track:1", "clip:arrangement:dup"],
        clip: {
          id: `clip:arrangement:${payload.targetTrackId ?? "track:1"}:index:2`
        }
      };
    },
    async moveArrangementClip(payload) {
      return {
        payload,
        affectedObjects: ["track:1", payload.clipId, "clip:arrangement:track:1:index:2"],
        track_id: "track:1",
        clip: {
          id: "clip:arrangement:track:1:index:2"
        }
      };
    },
    async setArrangementClipBounds(payload) {
      return {
        payload,
        affectedObjects: [payload.clipId],
        clip: {
          id: payload.clipId
        }
      };
    },
    async splitArrangementClip(payload) {
      return {
        payload,
        affectedObjects: [payload.clipId, "clip:arrangement:track:1:index:1", "clip:arrangement:track:1:index:2"],
        clips: [
          { id: "clip:arrangement:track:1:index:1", trackId: "track:1" },
          { id: "clip:arrangement:track:1:index:2", trackId: "track:1" }
        ]
      };
    },
    async moveSessionClip(payload) {
      return {
        payload,
        affectedObjects: [payload.clipId, `clip:moved:${payload.targetSlotIndex}`],
        clip: {
          id: `clip:session:${payload.targetTrackId ?? "track:2"}:slot:${payload.targetSlotIndex + 1}`
        }
      };
    },
    async deleteClip(payload) {
      return { payload, affectedObjects: [payload.clipId] };
    },
    async setClipLoopOrLength(payload) {
      return { payload, affectedObjects: [payload.clipId] };
    },
    async insertNotes(payload, options) {
      return {
        payload,
        options,
        affectedObjects: [payload.clipId]
      };
    },
    async replaceNotes(payload, options) {
      return {
        payload,
        options,
        affectedObjects: [payload.clipId]
      };
    },
    async launchClip(payload) {
      return {
        payload,
        affectedObjects: [payload.clipId]
      };
    },
    async launchScene(payload) {
      return {
        payload,
        affectedObjects: [payload.sceneId]
      };
    },
    async stopTrackClips(payload) {
      return {
        payload,
        affectedObjects: [payload.trackId]
      };
    },
    async stopAllClips() {
      return {
        affectedObjects: ["song"]
      };
    },
    async setParameter(payload) {
      return payload;
    },
    async setSendLevel(payload) {
      lastSendLevelPayload = payload;
      return { payload, affectedObjects: [payload.trackId] };
    },
    async setMonitorState(payload) {
      return { payload, affectedObjects: [payload.trackId] };
    },
    async setTrackRouting(payload) {
      lastTrackRoutingPayload = payload;
      return { payload, affectedObjects: [payload.trackId] };
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
          },
          {
            name: "User Library",
            path: "user_library",
            uri: "browser:user_library",
            children: browserSidecarItem ? [browserSidecarItem] : []
          }
        ]
      };
    },
    async getBrowserItems(payload = {}) {
      if (payload.path === "user_library") {
        return {
          path: payload.path,
          item: {
            name: "User Library",
            path: "user_library",
            uri: "browser:user_library",
            is_folder: true,
            is_loadable: false
          },
          items: browserSidecarItem ? [browserSidecarItem] : []
        };
      }
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
      if (browserSidecarItem && (payload.uri === browserSidecarItem.uri || payload.path === browserSidecarItem.path)) {
        activeSidecarTrackId = payload.trackId;
        return {
          item: {
            uri: payload.uri ?? browserSidecarItem.uri,
            path: payload.path ?? browserSidecarItem.path
          },
          track: {
            id: payload.trackId,
            devices: [{ id: `${payload.trackId}:device:new`, name: "laive-sidecar" }]
          },
          affectedObjects: [payload.trackId, `${payload.trackId}:device:new`]
        };
      }
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
    async selectTrack(payload) {
      selectedTrackId = payload.trackId;
      return {
        track: {
          id: payload.trackId
        },
        affectedObjects: [payload.trackId]
      };
    },
    async selectClip(payload) {
      return {
        clip: {
          id: payload.clipId,
          location: payload.clipId.includes(":arrangement:") ? "arrangement" : "session",
          startBeats: 16
        },
        track: {
          id: payload.clipId.includes("track:2") ? "track:2" : "track:1"
        },
        affectedObjects: [payload.clipId]
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
      const configured = options.sidecarConfigured ?? false;
      return {
        configured,
        active: Boolean(activeSidecarTrackId),
        active_instances: activeSidecarTrackId
          ? [
              {
                trackId: activeSidecarTrackId,
                trackName: activeSidecarTrackId,
                deviceId: `${activeSidecarTrackId}:device:sidecar`,
                deviceName: "laive-sidecar"
              }
            ]
          : [],
        devicePath: "/Users/test/Music/Ableton/User Library/Presets/MIDI Effects/Max MIDI Effect/laive-sidecar.amxd",
        workflows: [
          {
            name: "replaceClipNotes",
            description: "Apply notes to a clip."
          },
          {
            name: "transformSelectedClip",
            description: "Transform the selected clip."
          },
          {
            name: "captureDeviceSnapshot",
            description: "Capture a device snapshot."
          },
          {
            name: "applyDeviceSnapshot",
            description: "Apply a device snapshot."
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
    async transformSelectedClip() {
      if (!(options.sidecarConfigured ?? false)) {
        throw new McpServerError("setup_required", "Max for Live sidecar is not configured", {
          component: "sidecar",
          setup_instructions: ["Install the sidecar device."]
        });
      }
      return {
        workflow: "transformSelectedClip",
        selectedClipId: "clip:session:track:1:slot:1",
        transformedNotes: [{ pitch: 72, startBeats: 0, durationBeats: 1, velocity: 100 }]
      };
    },
    async captureDeviceSnapshot() {
      if (!(options.sidecarConfigured ?? false)) {
        throw new McpServerError("setup_required", "Max for Live sidecar is not configured", {
          component: "sidecar",
          setup_instructions: ["Install the sidecar device."]
        });
      }
      return {
        workflow: "captureDeviceSnapshot",
        snapshot: {
          trackId: "track:1",
          trackName: "Track 1",
          deviceId: "device:track:1:1",
          deviceName: "Operator",
          parameters: [{ id: "parameter:device:track:1:1:1", name: "Volume", value: 0.5 }]
        }
      };
    },
    async applyDeviceSnapshot() {
      if (!(options.sidecarConfigured ?? false)) {
        throw new McpServerError("setup_required", "Max for Live sidecar is not configured", {
          component: "sidecar",
          setup_instructions: ["Install the sidecar device."]
        });
      }
      return {
        workflow: "applyDeviceSnapshot",
        target: {
          trackId: "track:1",
          deviceId: "device:track:1:1",
          deviceName: "Operator"
        },
        appliedParameters: [{ parameterId: "parameter:device:track:1:1:1", value: 0.5 }]
      };
    },
    async observeDeviceParameters() {
      throw new McpServerError("setup_required", "Max for Live sidecar is not configured", {
        component: "sidecar",
        setup_instructions: ["Install the sidecar device."]
      });
    },
    async ensureOnTrack({ trackId, dryRun = false }) {
      if (!(options.sidecarConfigured ?? false)) {
        throw new McpServerError("setup_required", "Max for Live sidecar is not configured", {
          component: "sidecar",
          setup_instructions: ["Install the sidecar device."]
        });
      }
      if (!dryRun) {
        activeSidecarTrackId = trackId;
      }
      return {
        workflow: "ensureOnTrack",
        trackId,
        status: dryRun ? "preview" : "loaded",
        method: browserSidecarItem ? "bridge_browser_load_item" : "ui_browser_search_and_load",
        warnings: [],
        activeInstance: {
          trackId,
          deviceId: `${trackId}:device:sidecar`
        }
      };
    },
    async executeWorkflow(name) {
      if (name === "replaceClipNotes") {
        return await this.replaceClipNotes();
      }
      if (name === "snapshotSelectionContext") {
        return await this.snapshotSelectionContext();
      }
      if (name === "transformSelectedClip") {
        return await this.transformSelectedClip();
      }
      if (name === "captureDeviceSnapshot") {
        return await this.captureDeviceSnapshot();
      }
      if (name === "applyDeviceSnapshot") {
        return await this.applyDeviceSnapshot();
      }
      if (name === "ensureOnTrack") {
        return await this.ensureOnTrack({ trackId: "track:1" });
      }
      return await this.observeDeviceParameters();
    }
  };

  const uiAutomationAdapter = {
    async getStatus() {
      return {
        configured: options.uiHelperConfigured ?? true,
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
      if (options.uiWorkflowError) {
        throw new Error(options.uiWorkflowError);
      }
      if (name === "browserSearchAndLoad") {
        activeSidecarTrackId = selectedTrackId;
      }
      return {
        configured: true,
        workflow: name,
        parameters
      };
    }
  };

  const server = new LaiveMcpServer({
    stateAdapter,
    bridgeAdapter,
    policyAdapter,
    sidecarAdapter,
    uiAutomationAdapter
  });
  server.__test = {
    getLastSendLevelPayload: () => lastSendLevelPayload,
    getLastTrackRoutingPayload: () => lastTrackRoutingPayload
  };
  return server;
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
  assert.equal(
    byName.get("set_arrangement_transport").inputSchema.properties.currentSongTime.type,
    "number"
  );
  assert.equal(byName.get("set_tempo").inputSchema.properties.tempo.type, "number");
  assert.deepEqual(byName.get("create_clip").inputSchema.required, [
    "trackId",
    "slotIndex"
  ]);
  assert.equal(
    byName.get("create_clip").inputSchema.properties.slotIndex.type,
    "integer"
  );
  assert.equal(byName.get("set_parameter").inputSchema.properties.trackName.type, "string");
  assert.equal(byName.get("set_parameter").inputSchema.properties.valueLabel.type, "string");
  assert.equal(
    byName.get("get_track_details").inputSchema.properties.index.type,
    "integer"
  );
  assert.ok(byName.has("rename_clip"));
  assert.ok(byName.has("duplicate_clip"));
  assert.ok(byName.has("move_session_clip"));
  assert.ok(byName.has("set_clip_loop_or_length"));
  assert.ok(byName.has("delete_clip"));
  assert.ok(byName.has("get_browser_tree"));
  assert.ok(byName.has("get_arrangement_summary"));
  assert.ok(byName.has("get_arrangement_track_details"));
  assert.ok(byName.has("create_arrangement_clip"));
  assert.ok(byName.has("jump_to_arrangement_clip"));
  assert.ok(byName.has("select_clip"));
  assert.ok(byName.has("duplicate_clip_to_arrangement"));
  assert.ok(byName.has("rename_arrangement_clip"));
  assert.ok(byName.has("delete_arrangement_clip"));
  assert.ok(byName.has("duplicate_arrangement_clip"));
  assert.ok(byName.has("set_arrangement_clip_bounds"));
  assert.ok(byName.has("split_arrangement_clip"));
  assert.ok(byName.has("move_arrangement_clip"));
  assert.ok(byName.has("get_browser_items"));
  assert.ok(byName.has("load_browser_item"));
  assert.ok(byName.has("ensure_sidecar_on_track"));
  assert.ok(byName.has("play_transport"));
  assert.ok(byName.has("stop_transport"));
  assert.ok(byName.has("create_scene"));
  assert.ok(byName.has("insert_notes"));
  assert.ok(byName.has("replace_notes"));
  assert.ok(byName.has("launch_clip"));
  assert.ok(byName.has("launch_scene"));
  assert.ok(byName.has("stop_track_clips"));
  assert.ok(byName.has("stop_all_clips"));
  assert.ok(byName.has("list_mixer_tracks"));
  assert.ok(byName.has("list_return_tracks"));
  assert.ok(byName.has("get_master_track"));
  assert.ok(byName.has("set_send_level"));
  assert.ok(byName.has("set_monitor_state"));
  assert.ok(byName.has("set_track_routing"));
  assert.ok(byName.has("get_component_status"));
  assert.ok(byName.has("list_sidecar_workflows"));
  assert.ok(byName.has("ensure_sidecar_on_track"));
  assert.ok(byName.has("sidecar_snapshot_selection_context"));
  assert.ok(byName.has("sidecar_transform_selected_clip"));
  assert.ok(byName.has("sidecar_replace_clip_notes"));
  assert.ok(byName.has("sidecar_capture_device_snapshot"));
  assert.ok(byName.has("sidecar_apply_device_snapshot"));
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

test("mixer and routing tools expose return or master track access and mutations", async () => {
  const server = createServer();

  const mixerTracks = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 30,
    method: "tools/call",
    params: {
      name: "list_mixer_tracks",
      arguments: {}
    }
  });
  const returnTracks = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 31,
    method: "tools/call",
    params: {
      name: "list_return_tracks",
      arguments: {}
    }
  });
  const masterTrack = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 32,
    method: "tools/call",
    params: {
      name: "get_master_track",
      arguments: {}
    }
  });
  const setSend = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 33,
    method: "tools/call",
    params: {
      name: "set_send_level",
      arguments: {
        trackId: "track:1",
        sendIndex: 0,
        value: 0.5
      }
    }
  });
  const setMonitor = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 34,
    method: "tools/call",
    params: {
      name: "set_monitor_state",
      arguments: {
        trackId: "track:1",
        monitoringState: "Off"
      }
    }
  });
  const setRouting = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 35,
    method: "tools/call",
    params: {
      name: "set_track_routing",
      arguments: {
        trackId: "track:1",
        outputRoutingType: "Master"
      }
    }
  });

  assert.equal(mixerTracks.result.isError, false);
  assert.equal(
    mixerTracks.result.structuredContent.tracks.some((track) => track.id === "track:return:1"),
    true
  );
  assert.equal(
    mixerTracks.result.structuredContent.tracks.some((track) => track.id === "track:master"),
    true
  );
  assert.equal(returnTracks.result.isError, false);
  assert.equal(returnTracks.result.structuredContent.tracks[0].id, "track:return:1");
  assert.equal(masterTrack.result.isError, false);
  assert.equal(masterTrack.result.structuredContent.track.id, "track:master");
  assert.equal(setSend.result.isError, false);
  assert.equal(setSend.result.structuredContent.summary, "Send Send A updated.");
  assert.equal(setMonitor.result.isError, false);
  assert.equal(setMonitor.result.structuredContent.summary, "Monitor state updated for Drums.");
  assert.equal(setRouting.result.isError, false);
  assert.equal(setRouting.result.structuredContent.summary, "Routing updated for Drums.");
});

test("mixer tools resolve send and routing aliases before writing", async () => {
  const server = createServer();

  const sendLevel = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 36,
    method: "tools/call",
    params: {
      name: "set_send_level",
      arguments: {
        trackId: "track:1",
        sendName: "A",
        value: 0.6
      }
    }
  });

  const routing = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 37,
    method: "tools/call",
    params: {
      name: "set_track_routing",
      arguments: {
        trackId: "track:1",
        outputRoutingType: "sends only",
        outputRoutingChannel: "1/2"
      }
    }
  });

  assert.equal(sendLevel.result.isError, false);
  assert.equal(server.__test.getLastSendLevelPayload().sendIndex, 0);
  assert.equal(routing.result.isError, false);
  assert.equal(server.__test.getLastTrackRoutingPayload().outputRoutingType, "sends_only");
  assert.equal(server.__test.getLastTrackRoutingPayload().outputRoutingChannel, "1_2");
});

test("browser load tool can target return and master tracks", async () => {
  const server = createServer();

  const loadReturn = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 36,
    method: "tools/call",
    params: {
      name: "load_browser_item",
      arguments: {
        trackId: "track:return:1",
        path: "audio_effects/EQ Eight"
      }
    }
  });
  const loadMaster = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 37,
    method: "tools/call",
    params: {
      name: "load_browser_item",
      arguments: {
        trackId: "track:master",
        path: "audio_effects/EQ Eight"
      }
    }
  });

  assert.equal(loadReturn.result.isError, false);
  assert.equal(
    loadReturn.result.structuredContent.affected_objects.includes("track:return:1:device:new"),
    true
  );
  assert.equal(loadMaster.result.isError, false);
  assert.equal(
    loadMaster.result.structuredContent.affected_objects.includes("track:master:device:new"),
    true
  );
});

test("ensure_sidecar_on_track selects the target track and requests a sidecar load", async () => {
  const server = createServer({
    sidecarConfigured: true,
    browserSidecarItem: {
      name: "laive-sidecar",
      path: "user_library/laive-sidecar",
      uri: "browser:user_library:laive-sidecar",
      is_folder: false,
      is_loadable: true
    }
  });

  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 17,
    method: "tools/call",
    params: {
      name: "ensure_sidecar_on_track",
      arguments: {
        trackId: "track:2"
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.sidecar_activation.activeInstance.trackId,
    "track:2"
  );
  assert.equal(
    response.result.structuredContent.sidecar_activation.method,
    "bridge_browser_load_item"
  );
  assert.deepEqual(response.result.structuredContent.warnings, []);
});

test("ensure_sidecar_on_track falls back to UI browser search when native browser resolution misses", async () => {
  const server = createServer({
    sidecarConfigured: true,
    browserSidecarItem: null
  });

  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 19,
    method: "tools/call",
    params: {
      name: "ensure_sidecar_on_track",
      arguments: {
        trackId: "track:2"
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.sidecar_activation.method,
    "ui_browser_search_and_load"
  );
  assert.equal(
    response.result.structuredContent.sidecar_activation.activeInstance.trackId,
    "track:2"
  );
});

test("ensure_sidecar_on_track returns setup guidance when the sidecar is not installed", async () => {
  const server = createServer({
    sidecarConfigured: false
  });

  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 18,
    method: "tools/call",
    params: {
      name: "ensure_sidecar_on_track",
      arguments: {
        trackId: "track:2"
      }
    }
  });

  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.error.code, "setup_required");
  assert.equal(response.result.structuredContent.error.data.component, "sidecar");
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

test("get_arrangement_summary returns structured arrangement readback", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 2.1,
    method: "tools/call",
    params: {
      name: "get_arrangement_summary",
      arguments: {}
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.summary, "Arrangement summary loaded.");
  assert.equal(response.result.structuredContent.arrangement.counts.arrangementClips, 1);
  assert.equal(
    response.result.structuredContent.arrangement.arrangementClips[0].id,
    "clip:arrangement:track:1:index:1"
  );
});

test("get_arrangement_track_details returns arrangement clips for a track", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 2.15,
    method: "tools/call",
    params: {
      name: "get_arrangement_track_details",
      arguments: {
        id: "track:1"
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.summary,
    "Loaded arrangement details for Drums."
  );
  assert.equal(response.result.structuredContent.track.arrangementClips.length, 1);
  assert.equal(
    response.result.structuredContent.track.arrangementClips[0].id,
    "clip:arrangement:track:1:index:1"
  );
});

test("set_arrangement_transport returns structured mutation response", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 2.2,
    method: "tools/call",
    params: {
      name: "set_arrangement_transport",
      arguments: {
        currentSongTime: 8,
        loopEnabled: true,
        loopStartBeats: 0,
        loopLengthBeats: 16
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.summary,
    "Arrangement transport updated."
  );
  assert.equal(response.result.structuredContent.state_version_before, 3);
  assert.equal(response.result.structuredContent.state_version_after, 4);
});

test("jump_to_arrangement_clip returns structured mutation response", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 2.18,
    method: "tools/call",
    params: {
      name: "jump_to_arrangement_clip",
      arguments: {
        clipId: "clip:arrangement:track:2:index:1",
        play: true
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.summary,
    "Arrangement clip selected and positioned for clip:arrangement:track:2:index:1."
  );
});

test("create_arrangement_clip returns structured mutation response", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 2.25,
    method: "tools/call",
    params: {
      name: "create_arrangement_clip",
      arguments: {
        trackId: "track:1",
        startBeats: 16,
        lengthBeats: 8,
        name: "Verse"
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.summary,
    "Arrangement clip created on track:1."
  );
  assert.equal(response.result.structuredContent.state_version_before, 3);
  assert.equal(response.result.structuredContent.state_version_after, 4);
});

test("duplicate_clip_to_arrangement returns structured mutation response", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 2.26,
    method: "tools/call",
    params: {
      name: "duplicate_clip_to_arrangement",
      arguments: {
        clipId: "clip:session:track:1:slot:1",
        destinationBeats: 24,
        targetTrackId: "track:1"
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.summary,
    "Arrangement duplication created from clip:session:track:1:slot:1."
  );
  assert.equal(response.result.structuredContent.state_version_before, 3);
  assert.equal(response.result.structuredContent.state_version_after, 4);
});

test("duplicate_arrangement_clip returns structured mutation response", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 2.261,
    method: "tools/call",
    params: {
      name: "duplicate_arrangement_clip",
      arguments: {
        clipId: "clip:arrangement:track:2:index:1",
        destinationBeats: 28,
        targetTrackId: "track:2"
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.summary,
    "Arrangement clip duplication created from clip:arrangement:track:2:index:1."
  );
  assert.equal(response.result.structuredContent.state_version_before, 3);
  assert.equal(response.result.structuredContent.state_version_after, 4);
});

test("rename_arrangement_clip returns structured mutation response", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 2.262,
    method: "tools/call",
    params: {
      name: "rename_arrangement_clip",
      arguments: {
        clipId: "clip:arrangement:track:2:index:1",
        name: "Arranged Bass"
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.summary,
    "Arrangement clip renamed for clip:arrangement:track:2:index:1."
  );
});

test("move_arrangement_clip returns structured mutation response", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 2.265,
    method: "tools/call",
    params: {
      name: "move_arrangement_clip",
      arguments: {
        clipId: "clip:arrangement:track:2:index:1",
        destinationBeats: 28
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.summary,
    "Arrangement clip moved for clip:arrangement:track:2:index:1."
  );
  assert.equal(response.result.structuredContent.state_version_before, 3);
  assert.equal(response.result.structuredContent.state_version_after, 4);
});

test("set_arrangement_clip_bounds returns structured mutation response", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 2.275,
    method: "tools/call",
    params: {
      name: "set_arrangement_clip_bounds",
      arguments: {
        clipId: "clip:arrangement:track:1:index:1",
        startBeats: 12,
        endBeats: 20
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.summary,
    "Arrangement clip bounds updated for clip:arrangement:track:1:index:1."
  );
  assert.equal(response.result.structuredContent.state_version_before, 3);
  assert.equal(response.result.structuredContent.state_version_after, 4);
});

test("split_arrangement_clip returns structured mutation response", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 2.276,
    method: "tools/call",
    params: {
      name: "split_arrangement_clip",
      arguments: {
        clipId: "clip:arrangement:track:1:index:1",
        splitBeats: 16
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.summary,
    "Arrangement clip split for clip:arrangement:track:1:index:1."
  );
  assert.equal(response.result.structuredContent.state_version_before, 3);
  assert.equal(response.result.structuredContent.state_version_after, 4);
});

test("move_arrangement_clip returns structured mutation response", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 2.27,
    method: "tools/call",
    params: {
      name: "move_arrangement_clip",
      arguments: {
        clipId: "clip:arrangement:track:1:index:1",
        destinationBeats: 28
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.summary,
    "Arrangement clip moved for clip:arrangement:track:1:index:1."
  );
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

test("session editing tools return structured mutation responses", async () => {
  const server = createServer();

  const rename = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: {
      name: "rename_clip",
      arguments: {
        clipId: "clip:session:track:2:slot:1",
        name: "Bassline B"
      }
    }
  });

  const move = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 21,
    method: "tools/call",
    params: {
      name: "move_session_clip",
      arguments: {
        clipId: "clip:session:track:2:slot:1",
        targetSlotIndex: 2
      }
    }
  });

  const loop = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 22,
    method: "tools/call",
    params: {
      name: "set_clip_loop_or_length",
      arguments: {
        clipId: "clip:session:track:2:slot:1",
        lengthBeats: 8
      }
    }
  });

  const duplicateBlocked = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 23,
    method: "tools/call",
    params: {
      name: "duplicate_clip",
      arguments: {
        clipId: "clip:session:track:2:slot:1",
        targetSlotIndex: 1
      }
    }
  });

  const duplicateConfirmed = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 24,
    method: "tools/call",
    params: {
      name: "duplicate_clip",
      arguments: {
        clipId: "clip:session:track:2:slot:1",
        targetSlotIndex: 1,
        confirm: true
      }
    }
  });

  const deleteBlocked = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 25,
    method: "tools/call",
    params: {
      name: "delete_clip",
      arguments: {
        clipId: "clip:session:track:2:slot:1"
      }
    }
  });

  const deleteConfirmed = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 26,
    method: "tools/call",
    params: {
      name: "delete_clip",
      arguments: {
        clipId: "clip:session:track:2:slot:1",
        confirm: true
      }
    }
  });

  assert.equal(rename.result.isError, false);
  assert.equal(rename.result.structuredContent.summary, "Clip renamed for clip:session:track:2:slot:1.");
  assert.equal(move.result.isError, false);
  assert.equal(move.result.structuredContent.summary, "Session clip moved for clip:session:track:2:slot:1.");
  assert.equal(loop.result.isError, false);
  assert.equal(loop.result.structuredContent.summary, "Clip loop or length updated for clip:session:track:2:slot:1.");
  assert.equal(duplicateBlocked.result.isError, true);
  assert.equal(duplicateBlocked.result.structuredContent.error.code, "confirmation_required");
  assert.equal(duplicateConfirmed.result.isError, false);
  assert.equal(deleteBlocked.result.isError, true);
  assert.equal(deleteBlocked.result.structuredContent.error.code, "confirmation_required");
  assert.equal(deleteConfirmed.result.isError, false);
});

test("delete_arrangement_clip validates confirmation", async () => {
  const server = createServer();
  const blocked = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 26.1,
    method: "tools/call",
    params: {
      name: "delete_arrangement_clip",
      arguments: {
        clipId: "clip:arrangement:track:2:index:1"
      }
    }
  });
  const confirmed = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 26.2,
    method: "tools/call",
    params: {
      name: "delete_arrangement_clip",
      arguments: {
        clipId: "clip:arrangement:track:2:index:1",
        confirm: true
      }
    }
  });

  assert.equal(blocked.result.isError, true);
  assert.equal(blocked.result.structuredContent.error.code, "confirmation_required");
  assert.equal(confirmed.result.isError, false);
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

test("replace_notes validates and returns mutation response", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 16,
    method: "tools/call",
    params: {
      name: "replace_notes",
      arguments: {
        clipId: "clip:session:track:2:slot:1",
        notes: [
          {
            pitch: 67,
            startBeats: 0,
            durationBeats: 0.5,
            velocity: 100
          }
        ]
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.summary,
    "Notes replaced for clip:session:track:2:slot:1."
  );
});

test("session launch tools return structured mutation responses", async () => {
  const server = createServer();

  const launchClip = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 12,
    method: "tools/call",
    params: {
      name: "launch_clip",
      arguments: {
        clipId: "clip:session:track:2:slot:1"
      }
    }
  });

  const launchScene = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 13,
    method: "tools/call",
    params: {
      name: "launch_scene",
      arguments: {
        sceneId: "scene:2"
      }
    }
  });

  const stopTrackClips = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 14,
    method: "tools/call",
    params: {
      name: "stop_track_clips",
      arguments: {
        trackId: "track:2"
      }
    }
  });

  const stopAllClips = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 15,
    method: "tools/call",
    params: {
      name: "stop_all_clips",
      arguments: {}
    }
  });

  assert.equal(launchClip.result.isError, false);
  assert.equal(
    launchClip.result.structuredContent.summary,
    "Clip launched for clip:session:track:2:slot:1."
  );
  assert.equal(launchScene.result.isError, false);
  assert.equal(
    launchScene.result.structuredContent.summary,
    "Scene launched for scene:2."
  );
  assert.equal(stopTrackClips.result.isError, false);
  assert.equal(
    stopTrackClips.result.structuredContent.summary,
    "Track clips stopped for track:2."
  );
  assert.equal(stopAllClips.result.isError, false);
  assert.equal(stopAllClips.result.structuredContent.summary, "All clips stopped.");
});

test("set_parameter can resolve by names and enum label", async () => {
  const server = createServer();
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 27,
    method: "tools/call",
    params: {
      name: "set_parameter",
      arguments: {
        trackName: "Bass",
        deviceName: "Operator",
        parameterName: "Algorithm",
        valueLabel: "Algorithm 3"
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.summary,
    "Parameter Algorithm updated to Algorithm 3."
  );
});

test("set_parameter can resolve return tracks by de-prefixed name aliases", async () => {
  const server = createServer();

  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 271,
    method: "tools/call",
    params: {
      name: "set_parameter",
      arguments: {
        trackName: "Reverb",
        deviceName: "Hybrid Reverb",
        parameterName: "Device On",
        valueLabel: "On"
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.summary,
    "Parameter Device On updated to On."
  );
});

test("mixer tools expose return/master tracks and accept send or routing writes", async () => {
  const server = createServer();

  const returnTracks = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 28,
    method: "tools/call",
    params: {
      name: "list_return_tracks",
      arguments: {}
    }
  });

  const masterTrack = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 29,
    method: "tools/call",
    params: {
      name: "get_master_track",
      arguments: {}
    }
  });

  const sendLevel = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 30,
    method: "tools/call",
    params: {
      name: "set_send_level",
      arguments: {
        trackId: "track:2",
        sendIndex: 0,
        value: 0.4
      }
    }
  });

  const monitorState = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 31,
    method: "tools/call",
    params: {
      name: "set_monitor_state",
      arguments: {
        trackId: "track:2",
        monitoringState: "Off"
      }
    }
  });

  const routing = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 32,
    method: "tools/call",
    params: {
      name: "set_track_routing",
      arguments: {
        trackId: "track:2",
        outputRoutingType: "master"
      }
    }
  });

  assert.equal(returnTracks.result.isError, false);
  assert.equal(returnTracks.result.structuredContent.tracks[0].id, "track:return:1");
  assert.equal(masterTrack.result.isError, false);
  assert.equal(masterTrack.result.structuredContent.track.id, "track:master");
  assert.equal(sendLevel.result.isError, false);
  assert.equal(sendLevel.result.structuredContent.summary, "Send Send A updated.");
  assert.equal(monitorState.result.isError, false);
  assert.equal(monitorState.result.structuredContent.summary, "Monitor state updated for Bass.");
  assert.equal(routing.result.isError, false);
  assert.equal(routing.result.structuredContent.summary, "Routing updated for Bass.");
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

test("sidecar_transform_selected_clip executes when the sidecar is active", async () => {
  const server = createServer({ sidecarConfigured: true });
  const response = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: {
      name: "sidecar_transform_selected_clip",
      arguments: {
        transposeSemitones: 12
      }
    }
  });

  assert.equal(response.result.isError, false);
  assert.equal(
    response.result.structuredContent.sidecar_workflow.workflow,
    "transformSelectedClip"
  );
});

test("sidecar device snapshot tools execute when the sidecar is active", async () => {
  const server = createServer({ sidecarConfigured: true });
  const capture = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: {
      name: "sidecar_capture_device_snapshot",
      arguments: {
        trackId: "track:1",
        deviceName: "Operator"
      }
    }
  });

  assert.equal(capture.result.isError, false);
  assert.equal(
    capture.result.structuredContent.sidecar_workflow.snapshot.deviceName,
    "Operator"
  );

  const apply = await server.safeHandleRpcMessage({
    jsonrpc: "2.0",
    id: 12,
    method: "tools/call",
    params: {
      name: "sidecar_apply_device_snapshot",
      arguments: {
        snapshot: capture.result.structuredContent.sidecar_workflow.snapshot
      }
    }
  });

  assert.equal(apply.result.isError, false);
  assert.equal(
    apply.result.structuredContent.sidecar_workflow.workflow,
    "applyDeviceSnapshot"
  );
});
