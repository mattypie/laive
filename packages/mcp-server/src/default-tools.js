import { McpServerError } from "./errors.js";

const EMPTY_OBJECT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false
};

function createObjectSchema({ properties = {}, required = [] } = {}) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new McpServerError(
      "invalid_request",
      `${fieldName} must be a non-empty string`
    );
  }
}

function requireNotes(notes) {
  if (!Array.isArray(notes) || notes.length === 0) {
    throw new McpServerError(
      "invalid_request",
      "notes must be a non-empty array of MIDI note objects"
    );
  }
}

function buildMutationResult(summary, affectedObjects, beforeVersion, afterVersion, warnings = []) {
  return {
    summary,
    affected_objects: affectedObjects,
    state_version_before: beforeVersion,
    state_version_after: afterVersion,
    warnings,
    next_suggested_actions: ["refresh_state", "get_selected_context"]
  };
}

function buildInformationalResult(summary, payload = {}, nextActions = []) {
  return {
    summary,
    affected_objects: payload.affected_objects ?? [],
    state_version_before: payload.state_version_before ?? null,
    state_version_after: payload.state_version_after ?? null,
    warnings: payload.warnings ?? [],
    next_suggested_actions: nextActions,
    ...payload
  };
}

function buildWorkflowSchema(description) {
  return {
    type: "object",
    properties: {
      name: {
        type: "string",
        description
      },
      parameters: {
        type: "object",
        description: "Workflow-specific parameters.",
        additionalProperties: true
      }
    },
    required: ["name"],
    additionalProperties: false
  };
}

const noteItemSchema = {
  type: "object",
  properties: {
    pitch: {
      type: "integer",
      minimum: 0,
      maximum: 127
    },
    startBeats: {
      type: "number",
      minimum: 0
    },
    durationBeats: {
      type: "number",
      exclusiveMinimum: 0
    },
    velocity: {
      type: "integer",
      minimum: 1,
      maximum: 127
    },
    mute: {
      type: "boolean"
    }
  },
  required: ["pitch", "startBeats", "durationBeats", "velocity"],
  additionalProperties: false
};

const dryRunProperty = {
  type: "boolean",
  description: "If true, preview the action without mutating Live."
};

export function buildDefaultTools({
  stateAdapter,
  bridgeAdapter,
  policyAdapter,
  sidecarAdapter,
  uiAutomationAdapter
}) {
  return [
    {
      name: "get_project_summary",
      description: "Return a compact summary of the current Live set state.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const summary = await stateAdapter.getProjectSummary();
        return {
          summary: "Project summary loaded.",
          affected_objects: summary.tracks.map((track) => track.id),
          state_version_before: summary.stateVersion,
          state_version_after: summary.stateVersion,
          warnings: summary.warnings ?? [],
          next_suggested_actions: ["get_selected_context", "list_tracks"],
          project: summary
        };
      }
    },
    {
      name: "get_selected_context",
      description: "Return the selected track, scene, clip, and device context.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const context = await stateAdapter.getSelectedContext();
        return {
          summary: "Selected context loaded.",
          affected_objects: Object.values(context)
            .filter(Boolean)
            .map((value) => value.id ?? value),
          state_version_before: context.stateVersion,
          state_version_after: context.stateVersion,
          warnings: [],
          next_suggested_actions: ["get_track_details", "get_device_tree"],
          context
        };
      }
    },
    {
      name: "list_tracks",
      description: "List tracks in compact form.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const tracks = await stateAdapter.listTracks();
        return {
          summary: `Found ${tracks.length} track(s).`,
          affected_objects: tracks.map((track) => track.id),
          state_version_before: tracks[0]?.stateVersion ?? null,
          state_version_after: tracks[0]?.stateVersion ?? null,
          warnings: [],
          next_suggested_actions: ["get_track_details"],
          tracks
        };
      }
    },
    {
      name: "get_track_details",
      description: "Return detailed state for a track identified by ID, name, or index.",
      inputSchema: createObjectSchema({
        properties: {
          id: {
            type: "string",
            description: "Track identifier, for example `track:7`."
          },
          name: {
            type: "string",
            description: "Exact track name."
          },
          index: {
            type: "integer",
            minimum: 0,
            description: "Zero-based visible-track index."
          }
        }
      }),
      async execute(args) {
        const target = args.id ?? args.name ?? args.index;
        if (target === undefined) {
          throw new McpServerError(
            "invalid_request",
            "Provide id, name, or index for get_track_details"
          );
        }

        const track = await stateAdapter.getTrackDetails(target);
        return {
          summary: `Loaded track ${track.name}.`,
          affected_objects: [track.id],
          state_version_before: track.stateVersion,
          state_version_after: track.stateVersion,
          warnings: [],
          next_suggested_actions: ["get_device_tree", "create_clip"],
          track
        };
      }
    },
    {
      name: "get_device_tree",
      description: "Return device state for a track.",
      inputSchema: createObjectSchema({
        properties: {
          trackId: {
            type: "string",
            description: "Track identifier, for example `track:7`."
          }
        },
        required: ["trackId"]
      }),
      async execute(args) {
        const trackId = args.trackId ?? args.track ?? args.id;
        requireString(trackId, "trackId");
        const deviceTree = await stateAdapter.getDeviceTree(trackId);
        return {
          summary: `Loaded ${deviceTree.devices.length} device(s) for ${trackId}.`,
          affected_objects: [trackId, ...deviceTree.devices.map((device) => device.id)],
          state_version_before: deviceTree.stateVersion,
          state_version_after: deviceTree.stateVersion,
          warnings: [],
          next_suggested_actions: ["set_parameter"],
          deviceTree
        };
      }
    },
    {
      name: "get_component_status",
      description:
        "Report control-surface, Max sidecar, and UI-helper availability, including setup guidance for optional components.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const [bridgeCapabilities, sidecarStatus, uiHelperStatus] = await Promise.all([
          bridgeAdapter.getCapabilities(),
          sidecarAdapter.getStatus(),
          uiAutomationAdapter.getStatus()
        ]);

        return buildInformationalResult(
          "Component status loaded.",
          {
            affected_objects: ["bridge", "sidecar", "ui_helper"],
            components: {
              bridge: {
                available: true,
                capabilities: bridgeCapabilities
              },
              sidecar: sidecarStatus,
              ui_helper: uiHelperStatus
            }
          },
          ["get_capabilities", "list_sidecar_workflows", "list_ui_workflows"]
        );
      }
    },
    {
      name: "get_browser_tree",
      description: "Return the top-level Ableton browser categories and their immediate children.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const browser = await bridgeAdapter.getBrowserTree();
        return buildInformationalResult(
          "Browser tree loaded.",
          {
            affected_objects: (browser.roots ?? []).map((root) => root.uri ?? root.path).filter(Boolean),
            browser
          },
          ["get_browser_items", "load_browser_item"]
        );
      }
    },
    {
      name: "get_browser_items",
      description: "Return browser items at a specific browser path, or the roots when no path is provided.",
      inputSchema: createObjectSchema({
        properties: {
          path: {
            type: "string",
            description: "Optional slash path such as `instruments` or `audio_effects/EQ Eight`."
          }
        }
      }),
      async execute(args) {
        const browser = await bridgeAdapter.getBrowserItems({
          path: args.path ?? null
        });
        return buildInformationalResult(
          args.path ? `Browser items loaded for ${args.path}.` : "Browser root items loaded.",
          {
            affected_objects: (browser.items ?? []).map((item) => item.uri ?? item.path).filter(Boolean),
            browser
          },
          ["load_browser_item"]
        );
      }
    },
    {
      name: "set_tempo",
      description: "Update the current song tempo.",
      inputSchema: createObjectSchema({
        properties: {
          tempo: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Target song tempo in BPM."
          },
          dryRun: {
            type: "boolean",
            description: "If true, preview the action without mutating Live."
          }
        },
        required: ["tempo"]
      }),
      async execute(args) {
        const nextTempo = Number(args.tempo);
        if (!Number.isFinite(nextTempo) || nextTempo <= 0) {
          throw new McpServerError("invalid_request", "tempo must be a positive number");
        }

        await policyAdapter.assertAllowed("set_tempo", args);
        const before = await stateAdapter.getProjectSummary();
        await bridgeAdapter.setTempo(nextTempo, { dryRun: Boolean(args.dryRun) });
        const after = await stateAdapter.refreshState("song");
        return buildMutationResult(
          `Tempo ${args.dryRun ? "previewed" : "set"} to ${nextTempo}.`,
          ["song"],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "play_transport",
      description: "Start Ableton Live transport playback.",
      inputSchema: createObjectSchema({
        properties: {
          dryRun: {
            type: "boolean",
            description: "If true, preview the action without mutating Live."
          }
        }
      }),
      async execute(args) {
        await policyAdapter.assertAllowed("play_transport", args);
        const before = await stateAdapter.getProjectSummary();
        await bridgeAdapter.playTransport({ dryRun: Boolean(args.dryRun) });
        const after = await stateAdapter.refreshState("song");
        return buildMutationResult(
          `Transport ${args.dryRun ? "play previewed" : "started"}.`,
          ["song"],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "stop_transport",
      description: "Stop Ableton Live transport playback.",
      inputSchema: createObjectSchema({
        properties: {
          dryRun: {
            type: "boolean",
            description: "If true, preview the action without mutating Live."
          }
        }
      }),
      async execute(args) {
        await policyAdapter.assertAllowed("stop_transport", args);
        const before = await stateAdapter.getProjectSummary();
        await bridgeAdapter.stopTransport({ dryRun: Boolean(args.dryRun) });
        const after = await stateAdapter.refreshState("song");
        return buildMutationResult(
          `Transport ${args.dryRun ? "stop previewed" : "stopped"}.`,
          ["song"],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "create_track",
      description: "Create a new track.",
      inputSchema: createObjectSchema({
        properties: {
          kind: {
            type: "string",
            enum: ["midi", "audio"],
            description: "Track type to create."
          },
          dryRun: {
            type: "boolean",
            description: "If true, preview the action without mutating Live."
          }
        }
      }),
      async execute(args) {
        const kind = args.kind ?? "midi";
        await policyAdapter.assertAllowed("create_track", args);
        const before = await stateAdapter.getProjectSummary();
        const created = await bridgeAdapter.createTrack(kind, { dryRun: Boolean(args.dryRun) });
        const after = await stateAdapter.refreshState("tracks");
        return buildMutationResult(
          `${kind} track ${args.dryRun ? "previewed" : "created"}.`,
          created.affectedObjects ?? ["tracks"],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "create_scene",
      description: "Create a new scene.",
      inputSchema: createObjectSchema({
        properties: {
          name: {
            type: "string",
            description: "Optional scene name."
          },
          dryRun: {
            type: "boolean",
            description: "If true, preview the action without mutating Live."
          }
        }
      }),
      async execute(args) {
        await policyAdapter.assertAllowed("create_scene", args);
        const before = await stateAdapter.getProjectSummary();
        const created = await bridgeAdapter.createScene(args.name ?? null, {
          dryRun: Boolean(args.dryRun)
        });
        const after = await stateAdapter.refreshState("scenes");
        return buildMutationResult(
          `Scene ${args.dryRun ? "previewed" : "created"}.`,
          created.affectedObjects ?? ["scenes"],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "create_clip",
      description: "Create a MIDI clip on a target track and slot.",
      inputSchema: createObjectSchema({
        properties: {
          trackId: {
            type: "string",
            description: "Track identifier, for example `track:7`."
          },
          slotIndex: {
            type: "integer",
            minimum: 0,
            description: "Zero-based session slot index on the target track."
          },
          lengthBeats: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Clip length in beats. Defaults to 4."
          },
          name: {
            type: "string",
            description: "Optional clip name."
          },
          dryRun: {
            type: "boolean",
            description: "If true, preview the action without mutating Live."
          }
        },
        required: ["trackId", "slotIndex"]
      }),
      async execute(args) {
        requireString(args.trackId, "trackId");
        if (!Number.isInteger(args.slotIndex) || args.slotIndex < 0) {
          throw new McpServerError("invalid_request", "slotIndex must be a non-negative integer");
        }

        await policyAdapter.assertAllowed("create_clip", args);
        const before = await stateAdapter.getProjectSummary();
        const created = await bridgeAdapter.createClip({
          trackId: args.trackId,
          slotIndex: args.slotIndex,
          lengthBeats: Number(args.lengthBeats ?? 4),
          name: args.name ?? null,
          dryRun: Boolean(args.dryRun)
        });
        const after = await stateAdapter.refreshState(`track:${args.trackId}`);
        return buildMutationResult(
          `Clip ${args.dryRun ? "previewed" : "created"} on ${args.trackId}.`,
          created.affectedObjects ?? [args.trackId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "insert_notes",
      description: "Insert or replace notes in a target MIDI clip.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Canonical clip id such as clip:session:track:8:slot:1."
          },
          notes: {
            type: "array",
            items: noteItemSchema,
            description: "Note payload to apply to the clip."
          },
          dryRun: {
            type: "boolean",
            description: "If true, preview the action without mutating Live."
          }
        },
        required: ["clipId", "notes"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        requireNotes(args.notes);

        await policyAdapter.assertAllowed("insert_notes", args);
        const before = await stateAdapter.getProjectSummary();
        const inserted = await bridgeAdapter.insertNotes(
          {
            clipId: args.clipId,
            notes: args.notes
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState("project");
        return buildMutationResult(
          `Notes ${args.dryRun ? "previewed" : "inserted"} for ${args.clipId}.`,
          inserted.affectedObjects ?? [args.clipId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "launch_clip",
      description: "Launch a Session View clip by canonical clip id.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Canonical clip id such as clip:session:track:8:slot:1."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        await policyAdapter.assertAllowed("launch_clip", args);
        const before = await stateAdapter.getProjectSummary();
        const launched = await bridgeAdapter.launchClip(
          {
            clipId: args.clipId
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState("project");
        return buildMutationResult(
          `Clip ${args.dryRun ? "launch previewed" : "launched"} for ${args.clipId}.`,
          launched.affectedObjects ?? [args.clipId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "launch_scene",
      description: "Launch a Session View scene by scene id.",
      inputSchema: createObjectSchema({
        properties: {
          sceneId: {
            type: "string",
            description: "Scene identifier, for example `scene:3`."
          },
          dryRun: dryRunProperty
        },
        required: ["sceneId"]
      }),
      async execute(args) {
        requireString(args.sceneId, "sceneId");
        await policyAdapter.assertAllowed("launch_scene", args);
        const before = await stateAdapter.getProjectSummary();
        const launched = await bridgeAdapter.launchScene(
          {
            sceneId: args.sceneId
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState("project");
        return buildMutationResult(
          `Scene ${args.dryRun ? "launch previewed" : "launched"} for ${args.sceneId}.`,
          launched.affectedObjects ?? [args.sceneId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "stop_track_clips",
      description: "Stop all currently playing session clips on a target track.",
      inputSchema: createObjectSchema({
        properties: {
          trackId: {
            type: "string",
            description: "Track identifier, for example `track:7`."
          },
          dryRun: dryRunProperty
        },
        required: ["trackId"]
      }),
      async execute(args) {
        requireString(args.trackId, "trackId");
        await policyAdapter.assertAllowed("stop_track_clips", args);
        const before = await stateAdapter.getProjectSummary();
        const stopped = await bridgeAdapter.stopTrackClips(
          {
            trackId: args.trackId
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(args.trackId);
        return buildMutationResult(
          `Track clips ${args.dryRun ? "stop previewed" : "stopped"} for ${args.trackId}.`,
          stopped.affectedObjects ?? [args.trackId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "stop_all_clips",
      description: "Stop all currently playing session clips in the Live set.",
      inputSchema: createObjectSchema({
        properties: {
          dryRun: dryRunProperty
        }
      }),
      async execute(args) {
        await policyAdapter.assertAllowed("stop_all_clips", args);
        const before = await stateAdapter.getProjectSummary();
        const stopped = await bridgeAdapter.stopAllClips({
          dryRun: Boolean(args.dryRun)
        });
        const after = await stateAdapter.refreshState("project");
        return buildMutationResult(
          `All clips ${args.dryRun ? "stop previewed" : "stopped"}.`,
          stopped.affectedObjects ?? ["song"],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "set_parameter",
      description: "Set a device parameter by track/device/parameter identifiers.",
      inputSchema: createObjectSchema({
        properties: {
          trackId: {
            type: "string",
            description: "Track identifier containing the target device."
          },
          deviceId: {
            type: "string",
            description: "Device identifier containing the target parameter."
          },
          parameterId: {
            type: "string",
            description: "Parameter identifier to update."
          },
          value: {
            type: "number",
            description: "Target numeric parameter value."
          },
          dryRun: {
            type: "boolean",
            description: "If true, preview the action without mutating Live."
          }
        },
        required: ["trackId", "deviceId", "parameterId", "value"]
      }),
      async execute(args) {
        requireString(args.trackId, "trackId");
        requireString(args.deviceId, "deviceId");
        requireString(args.parameterId, "parameterId");

        const nextValue = Number(args.value);
        if (!Number.isFinite(nextValue)) {
          throw new McpServerError("invalid_request", "value must be numeric");
        }

        await policyAdapter.assertAllowed("set_parameter", args);
        const before = await stateAdapter.getProjectSummary();
        await bridgeAdapter.setParameter(
          {
            trackId: args.trackId,
            deviceId: args.deviceId,
            parameterId: args.parameterId,
            value: nextValue
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(`device:${args.deviceId}`);
        return buildMutationResult(
          `Parameter ${args.parameterId} ${args.dryRun ? "previewed" : "updated"}.`,
          [args.trackId, args.deviceId, args.parameterId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "load_browser_item",
      description: "Load a browser item onto a target track through the control-surface browser API.",
      inputSchema: createObjectSchema({
        properties: {
          trackId: {
            type: "string",
            description: "Target track identifier."
          },
          uri: {
            type: "string",
            description: "Browser item URI."
          },
          path: {
            type: "string",
            description: "Browser item slash path, for example `instruments/Operator`."
          },
          dryRun: dryRunProperty
        },
        required: ["trackId"]
      }),
      async execute(args) {
        requireString(args.trackId, "trackId");
        if (!args.uri && !args.path) {
          throw new McpServerError(
            "invalid_request",
            "Provide uri or path for load_browser_item"
          );
        }

        await policyAdapter.assertAllowed("load_browser_item", args);
        const before = await stateAdapter.getProjectSummary();
        const loaded = await bridgeAdapter.loadBrowserItem(
          {
            trackId: args.trackId,
            uri: args.uri ?? null,
            path: args.path ?? null,
            dryRun: Boolean(args.dryRun)
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(args.trackId);
        return buildMutationResult(
          `Browser item ${args.dryRun ? "previewed" : "loaded"} on ${args.trackId}.`,
          loaded.affectedObjects ?? [args.trackId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "list_sidecar_workflows",
      description: "List optional Max for Live sidecar workflows and current availability.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const result = await sidecarAdapter.listWorkflows();
        return buildInformationalResult(
          "Sidecar workflow status loaded.",
          {
            affected_objects: ["sidecar"],
            sidecar: result
          },
          ["run_sidecar_workflow", "get_component_status"]
        );
      }
    },
    {
      name: "sidecar_snapshot_selection_context",
      description:
        "Read selected track, clip, and device context through the optional Max for Live sidecar, or return setup instructions if it is unavailable.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const result = await sidecarAdapter.snapshotSelectionContext();
        return buildInformationalResult(
          "Sidecar selection context loaded.",
          {
            affected_objects: Object.values(result.context ?? {})
              .filter(Boolean)
              .map((value) => value.id ?? value),
            sidecar_workflow: result
          },
          ["get_selected_context", "get_component_status"]
        );
      }
    },
    {
      name: "sidecar_replace_clip_notes",
      description:
        "Apply a note payload through the optional Max for Live sidecar, or return setup instructions if it is unavailable.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Canonical clip id such as clip:session:track:8:slot:1."
          },
          notes: {
            type: "array",
            items: noteItemSchema,
            description: "Note payload to apply to the clip."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId", "notes"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        requireNotes(args.notes);
        await policyAdapter.assertAllowed("sidecar_replace_clip_notes", args);
        const before = await stateAdapter.getProjectSummary();
        const replaced = await sidecarAdapter.replaceClipNotes({
          clipId: args.clipId,
          notes: args.notes,
          dryRun: Boolean(args.dryRun)
        });
        const after = await stateAdapter.refreshState("project");
        return buildMutationResult(
          `Sidecar note replacement ${args.dryRun ? "previewed" : "applied"} for ${args.clipId}.`,
          replaced.affectedObjects ?? [args.clipId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "sidecar_observe_device_parameters",
      description:
        "Capture a selected-device parameter snapshot through the optional Max for Live sidecar, or return setup instructions if it is unavailable.",
      inputSchema: createObjectSchema({
        properties: {
          trackId: {
            type: "string",
            description: "Optional track identifier when no track is selected in Live."
          }
        }
      }),
      async execute(args) {
        const result = await sidecarAdapter.observeDeviceParameters({
          trackId: args.trackId ?? null
        });
        return buildInformationalResult(
          "Sidecar device parameter snapshot loaded.",
          {
            affected_objects: [
              result.deviceTree?.trackId,
              ...(result.deviceTree?.devices ?? []).map((device) => device.id)
            ].filter(Boolean),
            warnings: result.warnings ?? [],
            sidecar_workflow: result
          },
          ["get_device_tree", "get_component_status"]
        );
      }
    },
    {
      name: "run_sidecar_workflow",
      description:
        "Execute an optional Max for Live sidecar workflow, or return setup instructions if the sidecar is unavailable.",
      inputSchema: buildWorkflowSchema(
        "Sidecar workflow name, for example snapshotSelectionContext or replaceClipNotes."
      ),
      async execute(args) {
        const result = await sidecarAdapter.executeWorkflow(args.name, args.parameters ?? {});
        return buildInformationalResult(
          `Sidecar workflow ${args.name} completed.`,
          {
            affected_objects: ["sidecar"],
            sidecar_workflow: result
          },
          ["get_selected_context", "refresh_state"]
        );
      }
    },
    {
      name: "list_ui_workflows",
      description: "List optional UI-helper workflows and current availability.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const result = await uiAutomationAdapter.listWorkflows();
        return buildInformationalResult(
          "UI workflow status loaded.",
          {
            affected_objects: ["ui_helper"],
            ui_helper: result
          },
          ["run_ui_workflow", "get_component_status"]
        );
      }
    },
    {
      name: "ui_capture_context",
      description:
        "Capture frontmost-app context through the optional UI helper, or return setup instructions if it is unavailable.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const result = await uiAutomationAdapter.executeWorkflow("captureContext");
        return buildInformationalResult(
          "UI helper context captured.",
          {
            affected_objects: ["ui_helper"],
            ui_workflow: result
          },
          ["get_component_status"]
        );
      }
    },
    {
      name: "ui_focus_section",
      description:
        "Focus a named Live section through the optional UI helper, or return setup instructions if it is unavailable.",
      inputSchema: createObjectSchema({
        properties: {
          sectionName: {
            type: "string",
            description: "Target Live section name."
          }
        },
        required: ["sectionName"]
      }),
      async execute(args) {
        requireString(args.sectionName, "sectionName");
        const result = await uiAutomationAdapter.executeWorkflow("focusSection", {
          sectionName: args.sectionName
        });
        return buildInformationalResult(
          `UI helper focused ${args.sectionName}.`,
          {
            affected_objects: ["ui_helper"],
            ui_workflow: result
          },
          ["get_component_status"]
        );
      }
    },
    {
      name: "ui_browser_search_and_load",
      description:
        "Search Ableton's browser and trigger a load action through the optional UI helper, or return setup instructions if it is unavailable.",
      inputSchema: createObjectSchema({
        properties: {
          query: {
            type: "string",
            description: "Browser search query."
          }
        },
        required: ["query"]
      }),
      async execute(args) {
        requireString(args.query, "query");
        const result = await uiAutomationAdapter.executeWorkflow("browserSearchAndLoad", {
          query: args.query
        });
        return buildInformationalResult(
          `UI helper searched the browser for ${args.query}.`,
          {
            affected_objects: ["ui_helper"],
            ui_workflow: result
          },
          ["get_component_status", "refresh_state"]
        );
      }
    },
    {
      name: "ui_export_audio_video",
      description:
        "Open Ableton's Export Audio/Video dialog through the optional UI helper, or return setup instructions if it is unavailable.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const result = await uiAutomationAdapter.executeWorkflow("exportAudioVideo");
        return buildInformationalResult(
          "UI helper opened the Export Audio/Video flow.",
          {
            affected_objects: ["ui_helper"],
            ui_workflow: result
          },
          ["get_component_status"]
        );
      }
    },
    {
      name: "ui_export_with_preset",
      description:
        "Apply an export preset through the optional UI helper, or return setup instructions if it is unavailable.",
      inputSchema: createObjectSchema({
        properties: {
          presetName: {
            type: "string",
            description: "Preset name to enter in the export dialog."
          },
          outputPath: {
            type: "string",
            description: "Output folder to enter in the export dialog."
          }
        },
        required: ["presetName", "outputPath"]
      }),
      async execute(args) {
        requireString(args.presetName, "presetName");
        requireString(args.outputPath, "outputPath");
        const result = await uiAutomationAdapter.executeWorkflow("exportWithPreset", {
          presetName: args.presetName,
          outputPath: args.outputPath
        });
        return buildInformationalResult(
          `UI helper staged export preset ${args.presetName}.`,
          {
            affected_objects: ["ui_helper"],
            ui_workflow: result
          },
          ["get_component_status"]
        );
      }
    },
    {
      name: "run_ui_workflow",
      description:
        "Execute an optional UI-helper workflow, or return setup instructions if the UI helper is unavailable.",
      inputSchema: buildWorkflowSchema(
        "UI workflow name, for example exportAudioVideo, browserSearchAndLoad, or captureContext."
      ),
      async execute(args) {
        const result = await uiAutomationAdapter.executeWorkflow(args.name, args.parameters ?? {});
        return buildInformationalResult(
          `UI workflow ${args.name} completed.`,
          {
            affected_objects: ["ui_helper"],
            ui_workflow: result
          },
          ["get_component_status", "refresh_state"]
        );
      }
    },
    {
      name: "refresh_state",
      description: "Force a state refresh for a target scope.",
      inputSchema: createObjectSchema({
        properties: {
          target: {
            type: "string",
            description: "Refresh scope, for example `project`, `song`, or `track:7`."
          }
        }
      }),
      async execute(args) {
        const target = args.target ?? "project";
        const refreshed = await stateAdapter.refreshState(target);
        return {
          summary: `State refreshed for ${target}.`,
          affected_objects: refreshed.affectedObjects ?? [target],
          state_version_before: refreshed.previousStateVersion ?? null,
          state_version_after: refreshed.stateVersion,
          warnings: refreshed.warnings ?? [],
          next_suggested_actions: ["get_project_summary"],
          refresh: refreshed
        };
      }
    },
    {
      name: "get_capabilities",
      description: "Return bridge and server capabilities.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const [capabilities, sidecarStatus, uiHelperStatus] = await Promise.all([
          bridgeAdapter.getCapabilities(),
          sidecarAdapter.getStatus(),
          uiAutomationAdapter.getStatus()
        ]);
        return {
          summary: "Capabilities loaded.",
          affected_objects: ["bridge", "server"],
          state_version_before: null,
          state_version_after: null,
          warnings: [],
          next_suggested_actions: ["get_project_summary", "get_component_status"],
          capabilities: {
            ...capabilities,
            optional_components: {
              sidecar: sidecarStatus,
              ui_helper: uiHelperStatus
            }
          }
        };
      }
    }
  ];
}
