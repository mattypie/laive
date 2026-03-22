import { McpServerError } from "./errors.js";

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new McpServerError(
      "invalid_request",
      `${fieldName} must be a non-empty string`
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

export function buildDefaultTools({ stateAdapter, bridgeAdapter, policyAdapter }) {
  return [
    {
      name: "get_project_summary",
      description: "Return a compact summary of the current Live set state.",
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
      name: "set_tempo",
      description: "Update the current song tempo.",
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
      name: "create_track",
      description: "Create a new track.",
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
      name: "create_clip",
      description: "Create a MIDI clip on a target track and slot.",
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
      name: "set_parameter",
      description: "Set a device parameter by track/device/parameter identifiers.",
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
      name: "refresh_state",
      description: "Force a state refresh for a target scope.",
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
      async execute() {
        const capabilities = await bridgeAdapter.getCapabilities();
        return {
          summary: "Capabilities loaded.",
          affected_objects: ["bridge", "server"],
          state_version_before: null,
          state_version_after: null,
          warnings: [],
          next_suggested_actions: ["get_project_summary"],
          capabilities
        };
      }
    }
  ];
}
