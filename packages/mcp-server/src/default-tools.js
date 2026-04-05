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

function resolveMonitoringState(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = normalizeLookup(value);
  if (normalized === "in") {
    return 0;
  }
  if (normalized === "auto") {
    return 1;
  }
  if (normalized === "off") {
    return 2;
  }

  throw new McpServerError(
    "invalid_request",
    "monitoringState must be 0/1/2 or one of In/Auto/Off"
  );
}

function normalizeLookup(value) {
  return String(value ?? "").trim().toLowerCase();
}

function expandLookupAliases(name) {
  const aliases = new Set();
  let current = String(name ?? "").trim();
  while (current) {
    aliases.add(normalizeLookup(current));
    const trimmed = current.replace(/^[A-Za-z][-\s]/, "");
    if (trimmed === current) {
      break;
    }
    current = trimmed.trim();
  }
  return [...aliases];
}

function candidateLookupAliases(candidate) {
  const aliases = new Set();
  for (const value of [
    candidate?.name,
    candidate?.displayName,
    candidate?.display_name,
    candidate?.identifier,
    candidate?.shortName,
    candidate?.sendLetter
  ]) {
    for (const alias of expandLookupAliases(value)) {
      aliases.add(alias);
    }
  }
  for (const value of candidate?.aliases ?? []) {
    for (const alias of expandLookupAliases(value)) {
      aliases.add(alias);
    }
  }
  return [...aliases];
}

function pickUniqueMatch(candidates, requested, label) {
  const normalizedRequested = normalizeLookup(requested);
  if (!normalizedRequested) {
    return null;
  }

  const exactMatches = candidates.filter((candidate) =>
    candidateLookupAliases(candidate).includes(normalizedRequested)
  );
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }
  if (exactMatches.length > 1) {
    throw new McpServerError(
      "ambiguous_target",
      `${label} name matched multiple objects: ${exactMatches.map((candidate) => candidate.name).join(", ")}`
    );
  }

  const partialMatches = candidates.filter((candidate) =>
    candidateLookupAliases(candidate).some((alias) => alias.includes(normalizedRequested))
  );
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }
  if (partialMatches.length > 1) {
    throw new McpServerError(
      "ambiguous_target",
      `${label} name matched multiple objects: ${partialMatches.map((candidate) => candidate.name).join(", ")}`
    );
  }

  throw new McpServerError("not_found", `${label} not found for name: ${requested}`);
}

function resolveRoutingChoice(trackDetails, collectionKey, requestedValue, label) {
  if (requestedValue === undefined || requestedValue === null) {
    return requestedValue;
  }
  const choices = trackDetails?.track?.[collectionKey] ?? [];
  if (!Array.isArray(choices) || choices.length === 0) {
    return requestedValue;
  }
  const match = pickUniqueMatch(
    choices.map((choice) => ({
      ...choice,
      name: choice.displayName ?? choice.display_name ?? choice.identifier ?? label
    })),
    requestedValue,
    label
  );
  return match.identifier ?? match.displayName ?? match.display_name ?? requestedValue;
}

function requireConfirmation(args, toolName) {
  if (args.dryRun) {
    return;
  }
  if (args.confirm !== true) {
    throw new McpServerError(
      "confirmation_required",
      `${toolName} requires confirm=true unless dryRun is enabled`
    );
  }
}

async function resolveParameterReference(stateAdapter, args) {
  const trackCandidates = await listMixerTracks(stateAdapter);
  let matchingTracks = trackCandidates;

  if (args.trackId) {
    matchingTracks = trackCandidates.filter((track) => track.id === args.trackId);
    if (matchingTracks.length === 0) {
      throw new McpServerError("not_found", `Track not found: ${args.trackId}`);
    }
  } else if (args.trackName) {
    matchingTracks = [pickUniqueMatch(trackCandidates, args.trackName, "Track")];
  } else if (Number.isInteger(args.trackIndex)) {
    matchingTracks = trackCandidates.filter((track) => track.index === args.trackIndex);
    if (matchingTracks.length === 0) {
      throw new McpServerError("not_found", `Track not found for index: ${args.trackIndex}`);
    }
  }

  if (!args.parameterId && !args.parameterName) {
    throw new McpServerError(
      "invalid_request",
      "Provide parameterId or parameterName for set_parameter"
    );
  }

  const matches = [];
  for (const track of matchingTracks) {
    const details = await stateAdapter.getTrackDetails(track.id);
    const devices = details.devices ?? [];

    const matchingDevices = args.deviceId
      ? devices.filter((device) => device.id === args.deviceId)
      : args.deviceName
        ? [pickUniqueMatch(devices, args.deviceName, "Device")]
        : devices;

    for (const device of matchingDevices) {
      const parameters = device.parameters ?? [];
      const matchingParameters = args.parameterId
        ? parameters.filter((parameter) => parameter.id === args.parameterId)
        : [pickUniqueMatch(parameters, args.parameterName, "Parameter")];

      for (const parameter of matchingParameters) {
        matches.push({ track, device, parameter });
      }
    }
  }

  if (matches.length === 0) {
    throw new McpServerError("not_found", "Parameter target could not be resolved");
  }
  if (matches.length > 1) {
    throw new McpServerError(
      "ambiguous_target",
      `Parameter target matched multiple objects: ${matches
        .map(({ track, device, parameter }) => `${track.name} > ${device.name} > ${parameter.name}`)
        .join(", ")}`
    );
  }

  return matches[0];
}

function resolveTrackCandidate(tracks, args) {
  if (args.trackId) {
    const track = tracks.find((candidate) => candidate.id === args.trackId);
    if (!track) {
      throw new McpServerError("not_found", `Track not found: ${args.trackId}`);
    }
    return track;
  }
  if (args.trackName) {
    return pickUniqueMatch(tracks, args.trackName, "Track");
  }
  throw new McpServerError("invalid_request", "Provide trackId or trackName");
}

async function listMixerTracks(stateAdapter) {
  const [visibleTracks, returnTracks, masterTrack] = await Promise.all([
    stateAdapter.listTracks(),
    stateAdapter.listReturnTracks(),
    stateAdapter.getMasterTrack()
  ]);

  return [
    ...visibleTracks,
    ...returnTracks,
    ...(masterTrack ? [{ id: masterTrack.id, name: masterTrack.name, section: "master" }] : [])
  ];
}

async function resolveSendReference(stateAdapter, args) {
  const tracks = await listMixerTracks(stateAdapter);
  const track = resolveTrackCandidate(tracks, args);
  const details = await stateAdapter.getTrackDetails(track.id);
  const sends = (details.track?.sends ?? []).map((send, index) => ({
    ...send,
    index: Number.isInteger(send.index) ? send.index : index
  }));

  if (Number.isInteger(args.sendIndex)) {
    const send = sends.find((candidate) => candidate.index === args.sendIndex);
    if (!send) {
      throw new McpServerError("not_found", `Send not found for index: ${args.sendIndex}`);
    }
    return { track, send };
  }

  if (args.sendName) {
    return {
      track,
      send: pickUniqueMatch(sends, args.sendName, "Send")
    };
  }

  throw new McpServerError("invalid_request", "Provide sendIndex or sendName");
}

function resolveParameterValue(parameter, args) {
  if (args.valueLabel !== undefined) {
    const candidates = Array.isArray(parameter.allowedValues) ? parameter.allowedValues : [];
    const normalizedRequested = normalizeLookup(args.valueLabel);
    const matching = candidates.filter((candidate) =>
      normalizeLookup(candidate.label ?? candidate.value).includes(normalizedRequested)
    );
    if (matching.length === 1) {
      return {
        value: matching[0].value,
        label: matching[0].label ?? String(matching[0].value)
      };
    }
    if (matching.length > 1) {
      throw new McpServerError(
        "ambiguous_target",
        `valueLabel matched multiple enum values: ${matching.map((candidate) => candidate.label).join(", ")}`
      );
    }
    throw new McpServerError(
      "not_found",
      `valueLabel not found on parameter ${parameter.name}: ${args.valueLabel}`
    );
  }

  const nextValue = Number(args.value);
  if (!Number.isFinite(nextValue)) {
    throw new McpServerError("invalid_request", "value must be numeric");
  }

  const label = parameter.enumLabels?.[String(nextValue)] ?? null;
  return {
    value: nextValue,
    label
  };
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

const parameterSnapshotItemSchema = {
  type: "object",
  properties: {
    id: {
      type: "string"
    },
    name: {
      type: "string"
    },
    value: {
      type: "number"
    },
    displayValue: {
      type: ["string", "null"]
    },
    isQuantized: {
      type: "boolean"
    }
  },
  required: ["id", "name", "value"],
  additionalProperties: true
};

const deviceSnapshotSchema = {
  type: "object",
  properties: {
    capturedAt: {
      type: "string"
    },
    trackId: {
      type: "string"
    },
    trackName: {
      type: "string"
    },
    deviceId: {
      type: "string"
    },
    deviceName: {
      type: "string"
    },
    parameters: {
      type: "array",
      items: parameterSnapshotItemSchema
    }
  },
  required: ["trackId", "deviceId", "parameters"],
  additionalProperties: true
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
      name: "get_arrangement_summary",
      description: "Return a compact Arrangement View summary, including arrangement clips and loop state.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const arrangement = await stateAdapter.getArrangementSummary();
        return buildInformationalResult(
          "Arrangement summary loaded.",
          {
            affected_objects: arrangement.tracks.map((track) => track.id),
            state_version_before: arrangement.stateVersion,
            state_version_after: arrangement.stateVersion,
            arrangement
          },
          ["get_arrangement_track_details", "set_arrangement_transport"]
        );
      }
    },
    {
      name: "get_arrangement_track_details",
      description: "Return arrangement clips for a track identified by ID, name, or index.",
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
            "Provide id, name, or index for get_arrangement_track_details"
          );
        }

        const track = await stateAdapter.getArrangementTrackDetails(target);
        return buildInformationalResult(
          `Loaded arrangement details for ${track.name}.`,
          {
            affected_objects: [track.id, ...track.arrangementClips.map((clip) => clip.id)],
            state_version_before: track.stateVersion,
            state_version_after: track.stateVersion,
            track
          },
          ["set_arrangement_transport", "get_arrangement_summary"]
        );
      }
    },
    {
      name: "get_selected_context",
      description: "Return the selected track, scene, clip, and device context.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const context = await stateAdapter.getSelectedContext();
        const affectedObjects = [
          context.selectedTrackId,
          context.selectedSceneId,
          context.selectedClipId,
          context.device?.id ?? null
        ].filter(Boolean);
        return {
          summary: "Selected context loaded.",
          affected_objects: affectedObjects,
          state_version_before: context.stateVersion,
          state_version_after: context.stateVersion,
          warnings: [],
          next_suggested_actions:
            context.selectedClipLocation === "arrangement"
              ? ["get_arrangement_track_details", "jump_to_arrangement_clip"]
              : ["get_track_details", "get_device_tree"],
          context
        };
      }
    },
    {
      name: "select_clip",
      description: "Select a Session or Arrangement clip by canonical clip id.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Canonical clip id."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");

        await policyAdapter.assertAllowed("select_clip", args);
        const before = await stateAdapter.getProjectSummary();
        const result = await bridgeAdapter.selectClip(
          {
            clipId: args.clipId
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(args.clipId);
        return buildMutationResult(
          `Clip ${args.dryRun ? "selection previewed" : "selected"} for ${args.clipId}.`,
          result.affectedObjects ?? [args.clipId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
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
      name: "list_mixer_tracks",
      description: "List visible, return, and master mixer targets in compact form.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const tracks = await listMixerTracks(stateAdapter);
        return buildInformationalResult(
          `Found ${tracks.length} mixer target(s).`,
          {
            affected_objects: tracks.map((track) => track.id),
            tracks
          },
          ["get_track_details", "set_track_volume", "set_track_panning", "set_send_level", "set_monitor_state", "set_track_routing", "load_browser_item"]
        );
      }
    },
    {
      name: "list_return_tracks",
      description: "List return tracks in compact form.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const tracks = await stateAdapter.listReturnTracks();
        return buildInformationalResult(
          `Found ${tracks.length} return track(s).`,
          {
            affected_objects: tracks.map((track) => track.id),
            tracks
          },
          ["get_track_details", "load_browser_item"]
        );
      }
    },
    {
      name: "get_master_track",
      description: "Return detailed state for the Live master track.",
      inputSchema: EMPTY_OBJECT_SCHEMA,
      async execute() {
        const track = await stateAdapter.getMasterTrack();
        return buildInformationalResult(
          `Loaded master track ${track.name}.`,
          {
            affected_objects: [track.id],
            track
          },
          ["get_device_tree", "load_browser_item"]
        );
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
      name: "set_arrangement_transport",
      description: "Adjust Arrangement View transport position and loop region.",
      inputSchema: createObjectSchema({
        properties: {
          currentSongTime: {
            type: "number",
            minimum: 0,
            description: "Optional new Arrangement playback position in beats."
          },
          arrangementPositionBeats: {
            type: "number",
            minimum: 0,
            description: "Alias for currentSongTime."
          },
          loopEnabled: {
            type: "boolean",
            description: "Optional new Arrangement loop-enabled state."
          },
          loopStartBeats: {
            type: "number",
            minimum: 0,
            description: "Optional new Arrangement loop start in beats."
          },
          loopLengthBeats: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Optional new Arrangement loop length in beats."
          },
          dryRun: dryRunProperty
        }
      }),
      async execute(args) {
        if (
          args.currentSongTime === undefined &&
          args.arrangementPositionBeats === undefined &&
          args.loopEnabled === undefined &&
          args.loopStartBeats === undefined &&
          args.loopLengthBeats === undefined
        ) {
          throw new McpServerError(
            "invalid_request",
            "Provide at least one arrangement transport or loop field"
          );
        }

        await policyAdapter.assertAllowed("set_arrangement_transport", args);
        const before = await stateAdapter.getArrangementSummary();
        await bridgeAdapter.setArrangementTransport({
          currentSongTime: args.currentSongTime,
          arrangementPositionBeats: args.arrangementPositionBeats,
          loopEnabled: args.loopEnabled,
          loopStartBeats: args.loopStartBeats,
          loopLengthBeats: args.loopLengthBeats,
          dryRun: Boolean(args.dryRun)
        });
        const after = await stateAdapter.refreshState("song");
        return buildMutationResult(
          `Arrangement transport ${args.dryRun ? "previewed" : "updated"}.`,
          ["song"],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "jump_to_arrangement_clip",
      description: "Select an Arrangement clip and move the Arrangement playhead to its start beat.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Arrangement clip id."
          },
          play: {
            type: "boolean",
            description: "Start transport after jumping."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");

        await policyAdapter.assertAllowed("jump_to_arrangement_clip", args);
        const before = await stateAdapter.getArrangementSummary();
        const selected = await bridgeAdapter.selectClip(
          { clipId: args.clipId },
          { dryRun: Boolean(args.dryRun) }
        );
        if (selected.clip?.location !== "arrangement") {
          throw new McpServerError(
            "invalid_request",
            "jump_to_arrangement_clip requires an arrangement clip id"
          );
        }

        if (!args.dryRun) {
          await bridgeAdapter.setArrangementTransport({
            currentSongTime: selected.clip.startBeats,
            arrangementPositionBeats: selected.clip.startBeats
          });
          if (args.play) {
            await bridgeAdapter.playTransport();
          }
        }

        const after = await stateAdapter.refreshState(args.clipId);
        return buildMutationResult(
          `Arrangement clip ${args.dryRun ? "jump previewed" : "selected and positioned"} for ${args.clipId}.`,
          selected.affectedObjects ?? [args.clipId],
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
      name: "create_return_track",
      description: "Create a new return track (send destination).",
      inputSchema: createObjectSchema({
        properties: {
          name: {
            type: "string",
            description: "Optional return track name."
          },
          dryRun: {
            type: "boolean",
            description: "If true, preview the action without mutating Live."
          }
        }
      }),
      async execute(args) {
        await policyAdapter.assertAllowed("create_return_track", args);
        const before = await stateAdapter.getProjectSummary();
        const created = await bridgeAdapter.createReturnTrack(args.name ?? null, {
          dryRun: Boolean(args.dryRun)
        });
        const after = await stateAdapter.refreshState("project");
        return buildMutationResult(
          `Return track ${args.dryRun ? "previewed" : "created"}.`,
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
      name: "create_arrangement_clip",
      description: "Create a MIDI clip on a target visible track in Arrangement View.",
      inputSchema: createObjectSchema({
        properties: {
          trackId: {
            type: "string",
            description: "Visible track identifier, for example `track:7`."
          },
          startBeats: {
            type: "number",
            minimum: 0,
            description: "Arrangement clip start position in beats."
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
          dryRun: dryRunProperty
        },
        required: ["trackId", "startBeats"]
      }),
      async execute(args) {
        requireString(args.trackId, "trackId");
        if (!Number.isFinite(Number(args.startBeats)) || Number(args.startBeats) < 0) {
          throw new McpServerError("invalid_request", "startBeats must be a non-negative number");
        }
        if (args.lengthBeats !== undefined && (!Number.isFinite(Number(args.lengthBeats)) || Number(args.lengthBeats) <= 0)) {
          throw new McpServerError("invalid_request", "lengthBeats must be a positive number");
        }

        await policyAdapter.assertAllowed("create_arrangement_clip", args);
        const before = await stateAdapter.getArrangementSummary();
        const created = await bridgeAdapter.createArrangementClip({
          trackId: args.trackId,
          startBeats: Number(args.startBeats),
          lengthBeats: args.lengthBeats ?? 4,
          name: args.name,
          dryRun: Boolean(args.dryRun)
        });
        const after = await stateAdapter.refreshState(args.trackId);
        return buildMutationResult(
          `Arrangement clip ${args.dryRun ? "previewed" : "created"} on ${args.trackId}.`,
          created.affectedObjects ?? [args.trackId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "rename_clip",
      description: "Rename a Session or Arrangement clip by canonical clip id.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Canonical clip id such as clip:session:track:8:slot:1."
          },
          name: {
            type: "string",
            description: "New clip name."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId", "name"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        requireString(args.name, "name");

        await policyAdapter.assertAllowed("rename_clip", args);
        const before = await stateAdapter.getProjectSummary();
        await bridgeAdapter.renameClip(
          {
            clipId: args.clipId,
            name: args.name
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(args.clipId);
        return buildMutationResult(
          `Clip ${args.dryRun ? "rename previewed" : "renamed"} for ${args.clipId}.`,
          [args.clipId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "rename_arrangement_clip",
      description: "Rename an Arrangement View clip by canonical clip id.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Arrangement clip id."
          },
          name: {
            type: "string",
            description: "New clip name."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId", "name"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        requireString(args.name, "name");

        await policyAdapter.assertAllowed("rename_arrangement_clip", args);
        const before = await stateAdapter.getArrangementSummary();
        await bridgeAdapter.renameClip(
          {
            clipId: args.clipId,
            name: args.name
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(args.clipId);
        return buildMutationResult(
          `Arrangement clip ${args.dryRun ? "rename previewed" : "renamed"} for ${args.clipId}.`,
          [args.clipId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "duplicate_clip",
      description: "Duplicate a Session View clip to a target slot, optionally on another track.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Source clip id."
          },
          targetTrackId: {
            type: "string",
            description: "Optional target track id. Defaults to the source clip track."
          },
          targetSlotIndex: {
            type: "integer",
            minimum: 0,
            description: "Zero-based target Session slot index."
          },
          confirm: {
            type: "boolean",
            description: "Required for non-dry-run duplication because this changes Session topology."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId", "targetSlotIndex"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        requireConfirmation(args, "duplicate_clip");

        await policyAdapter.assertAllowed("duplicate_clip", args);
        const before = await stateAdapter.getProjectSummary();
        const result = await bridgeAdapter.duplicateClip(
          {
            clipId: args.clipId,
            targetTrackId: args.targetTrackId ?? null,
            targetSlotIndex: args.targetSlotIndex
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState("project");
        return buildMutationResult(
          `Clip ${args.dryRun ? "duplication previewed" : "duplicated"} for ${args.clipId}.`,
          [args.clipId, result.clip?.id].filter(Boolean),
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "duplicate_clip_to_arrangement",
      description: "Duplicate a clip into Arrangement View at a target beat position.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Source clip id."
          },
          destinationBeats: {
            type: "number",
            minimum: 0,
            description: "Arrangement destination position in beats."
          },
          targetTrackId: {
            type: "string",
            description: "Optional target visible track id. Defaults to the source clip track."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId", "destinationBeats"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        if (!Number.isFinite(Number(args.destinationBeats)) || Number(args.destinationBeats) < 0) {
          throw new McpServerError(
            "invalid_request",
            "destinationBeats must be a non-negative number"
          );
        }

        await policyAdapter.assertAllowed("duplicate_clip_to_arrangement", args);
        const before = await stateAdapter.getArrangementSummary();
        const duplicated = await bridgeAdapter.duplicateClipToArrangement({
          clipId: args.clipId,
          destinationBeats: Number(args.destinationBeats),
          targetTrackId: args.targetTrackId ?? null,
          dryRun: Boolean(args.dryRun)
        });
        const after = await stateAdapter.refreshState(args.targetTrackId ?? "song");
        return buildMutationResult(
          `Arrangement duplication ${args.dryRun ? "previewed" : "created"} from ${args.clipId}.`,
          duplicated.affectedObjects ?? [args.clipId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "duplicate_arrangement_clip",
      description: "Duplicate an Arrangement View clip to a new beat position.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Source arrangement clip id."
          },
          destinationBeats: {
            type: "number",
            minimum: 0,
            description: "Arrangement destination position in beats."
          },
          targetTrackId: {
            type: "string",
            description: "Optional target arrangement-capable track id. Defaults to the source clip track."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId", "destinationBeats"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        if (!Number.isFinite(Number(args.destinationBeats)) || Number(args.destinationBeats) < 0) {
          throw new McpServerError(
            "invalid_request",
            "destinationBeats must be a non-negative number"
          );
        }

        await policyAdapter.assertAllowed("duplicate_arrangement_clip", args);
        const before = await stateAdapter.getArrangementSummary();
        const duplicated = await bridgeAdapter.duplicateArrangementClip({
          clipId: args.clipId,
          destinationBeats: Number(args.destinationBeats),
          targetTrackId: args.targetTrackId ?? null,
          dryRun: Boolean(args.dryRun)
        });
        const after = await stateAdapter.refreshState(args.targetTrackId ?? "song");
        return buildMutationResult(
          `Arrangement clip duplication ${args.dryRun ? "previewed" : "created"} from ${args.clipId}.`,
          duplicated.affectedObjects ?? [args.clipId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "move_arrangement_clip",
      description: "Move an Arrangement View clip to a new beat position.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Arrangement clip id."
          },
          destinationBeats: {
            type: "number",
            minimum: 0,
            description: "New Arrangement start position in beats."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId", "destinationBeats"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        if (!Number.isFinite(Number(args.destinationBeats)) || Number(args.destinationBeats) < 0) {
          throw new McpServerError(
            "invalid_request",
            "destinationBeats must be a non-negative number"
          );
        }

        await policyAdapter.assertAllowed("move_arrangement_clip", args);
        const before = await stateAdapter.getArrangementSummary();
        const moved = await bridgeAdapter.moveArrangementClip({
          clipId: args.clipId,
          destinationBeats: Number(args.destinationBeats),
          dryRun: Boolean(args.dryRun)
        });
        const refreshTarget = moved.clip?.id ?? moved.track_id ?? args.clipId;
        const after = await stateAdapter.refreshState(refreshTarget);
        return buildMutationResult(
          `Arrangement clip ${args.dryRun ? "move previewed" : "moved"} for ${args.clipId}.`,
          moved.affectedObjects ?? [args.clipId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "set_arrangement_clip_bounds",
      description: "Adjust explicit Arrangement View clip bounds using start and/or end beats.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Arrangement clip id."
          },
          startBeats: {
            type: "number",
            minimum: 0,
            description: "Optional new Arrangement clip start position in beats."
          },
          endBeats: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Optional new Arrangement clip end position in beats."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        if (args.startBeats === undefined && args.endBeats === undefined) {
          throw new McpServerError(
            "invalid_request",
            "Provide at least one of startBeats or endBeats"
          );
        }
        if (args.startBeats !== undefined && (!Number.isFinite(Number(args.startBeats)) || Number(args.startBeats) < 0)) {
          throw new McpServerError("invalid_request", "startBeats must be a non-negative number");
        }
        if (args.endBeats !== undefined && (!Number.isFinite(Number(args.endBeats)) || Number(args.endBeats) <= 0)) {
          throw new McpServerError("invalid_request", "endBeats must be a positive number");
        }
        if (
          args.startBeats !== undefined &&
          args.endBeats !== undefined &&
          Number(args.endBeats) <= Number(args.startBeats)
        ) {
          throw new McpServerError("invalid_request", "endBeats must be greater than startBeats");
        }

        await policyAdapter.assertAllowed("set_arrangement_clip_bounds", args);
        const before = await stateAdapter.getArrangementSummary();
        await bridgeAdapter.setArrangementClipBounds({
          clipId: args.clipId,
          startBeats: args.startBeats === undefined ? undefined : Number(args.startBeats),
          endBeats: args.endBeats === undefined ? undefined : Number(args.endBeats),
          dryRun: Boolean(args.dryRun)
        });
        const after = await stateAdapter.refreshState(args.clipId);
        return buildMutationResult(
          `Arrangement clip bounds ${args.dryRun ? "previewed" : "updated"} for ${args.clipId}.`,
          [args.clipId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "split_arrangement_clip",
      description: "Split a MIDI Arrangement View clip into left and right clips at a target beat.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Arrangement clip id."
          },
          splitBeats: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Beat position where the arrangement clip should split."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId", "splitBeats"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        if (!Number.isFinite(Number(args.splitBeats)) || Number(args.splitBeats) <= 0) {
          throw new McpServerError(
            "invalid_request",
            "splitBeats must be a positive number"
          );
        }

        await policyAdapter.assertAllowed("split_arrangement_clip", args);
        const before = await stateAdapter.getArrangementSummary();
        const split = await bridgeAdapter.splitArrangementClip({
          clipId: args.clipId,
          splitBeats: Number(args.splitBeats),
          dryRun: Boolean(args.dryRun)
        });
        const refreshTarget = split.clips?.[0]?.trackId ?? split.clips?.[0]?.track_id ?? "project";
        const after = await stateAdapter.refreshState(refreshTarget);
        return buildMutationResult(
          `Arrangement clip ${args.dryRun ? "split previewed" : "split"} for ${args.clipId}.`,
          split.affectedObjects ?? [args.clipId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "move_session_clip",
      description: "Move a Session View clip to a target slot, optionally on another track.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Source clip id."
          },
          targetTrackId: {
            type: "string",
            description: "Optional target track id. Defaults to the source clip track."
          },
          targetSlotIndex: {
            type: "integer",
            minimum: 0,
            description: "Zero-based target Session slot index."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId", "targetSlotIndex"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");

        await policyAdapter.assertAllowed("move_session_clip", args);
        const before = await stateAdapter.getProjectSummary();
        const result = await bridgeAdapter.moveSessionClip(
          {
            clipId: args.clipId,
            targetTrackId: args.targetTrackId ?? null,
            targetSlotIndex: args.targetSlotIndex
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState("project");
        return buildMutationResult(
          `Session clip ${args.dryRun ? "move previewed" : "moved"} for ${args.clipId}.`,
          [args.clipId, result.clip?.id].filter(Boolean),
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "set_clip_loop_or_length",
      description: "Adjust Session clip loop and length properties.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Target clip id."
          },
          lengthBeats: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Optional new clip length in beats."
          },
          loopStartBeats: {
            type: "number",
            minimum: 0,
            description: "Optional new loop start in beats."
          },
          loopEndBeats: {
            type: "number",
            exclusiveMinimum: 0,
            description: "Optional new loop end in beats."
          },
          looping: {
            type: "boolean",
            description: "Optional new loop-enabled state."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        if (
          args.lengthBeats === undefined &&
          args.loopStartBeats === undefined &&
          args.loopEndBeats === undefined &&
          args.looping === undefined
        ) {
          throw new McpServerError(
            "invalid_request",
            "Provide at least one of lengthBeats, loopStartBeats, loopEndBeats, or looping"
          );
        }

        await policyAdapter.assertAllowed("set_clip_loop_or_length", args);
        const before = await stateAdapter.getProjectSummary();
        await bridgeAdapter.setClipLoopOrLength(
          {
            clipId: args.clipId,
            lengthBeats: args.lengthBeats,
            loopStartBeats: args.loopStartBeats,
            loopEndBeats: args.loopEndBeats,
            looping: args.looping
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(args.clipId);
        return buildMutationResult(
          `Clip loop or length ${args.dryRun ? "previewed" : "updated"} for ${args.clipId}.`,
          [args.clipId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "delete_clip",
      description: "Delete a Session or Arrangement clip by canonical clip id.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Target clip id."
          },
          confirm: {
            type: "boolean",
            description: "Required for non-dry-run deletion."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        requireConfirmation(args, "delete_clip");

        await policyAdapter.assertAllowed("delete_clip", args);
        const before = await stateAdapter.getProjectSummary();
        await bridgeAdapter.deleteClip(
          {
            clipId: args.clipId
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState("project");
        return buildMutationResult(
          `Clip ${args.dryRun ? "deletion previewed" : "deleted"} for ${args.clipId}.`,
          [args.clipId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "delete_arrangement_clip",
      description: "Delete an Arrangement View clip by canonical clip id.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Arrangement clip id."
          },
          confirm: {
            type: "boolean",
            description: "Required for non-dry-run deletion."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        requireConfirmation(args, "delete_arrangement_clip");

        await policyAdapter.assertAllowed("delete_arrangement_clip", args);
        const before = await stateAdapter.getArrangementSummary();
        await bridgeAdapter.deleteClip(
          {
            clipId: args.clipId
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState("project");
        return buildMutationResult(
          `Arrangement clip ${args.dryRun ? "deletion previewed" : "deleted"} for ${args.clipId}.`,
          [args.clipId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "insert_notes",
      description: "Insert notes into a target MIDI clip without clearing existing notes.",
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
      name: "replace_notes",
      description: "Replace the current note payload in a target MIDI clip.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Canonical clip id such as clip:session:track:8:slot:1."
          },
          notes: {
            type: "array",
            items: noteItemSchema,
            description: "Full note payload to apply to the clip."
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

        await policyAdapter.assertAllowed("replace_notes", args);
        const before = await stateAdapter.getProjectSummary();
        const replaced = await bridgeAdapter.replaceNotes(
          {
            clipId: args.clipId,
            notes: args.notes
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState("project");
        return buildMutationResult(
          `Notes ${args.dryRun ? "previewed" : "replaced"} for ${args.clipId}.`,
          replaced.affectedObjects ?? [args.clipId],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "get_clip_envelopes",
      description:
        "Return clip-envelope status and available parameter targets for a session or arrangement clip.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Canonical clip id such as clip:session:track:8:slot:1."
          }
        },
        required: ["clipId"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        const envelopeState = await bridgeAdapter.getClipEnvelopes({
          clipId: args.clipId
        });
        return buildInformationalResult(
          `Clip envelope state loaded for ${args.clipId}.`,
          {
            affected_objects: [args.clipId],
            clip_envelopes: envelopeState
          },
          ["select_clip_envelope_parameter", "clear_clip_envelope"]
        );
      }
    },
    {
      name: "show_clip_envelope",
      description: "Show the envelope lane for a target clip in Live's detail view.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Target clip id."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        await policyAdapter.assertAllowed("show_clip_envelope", args);
        const before = await stateAdapter.getSelectedContext();
        const result = await bridgeAdapter.showClipEnvelope(
          { clipId: args.clipId },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState("project");
        return buildMutationResult(
          `Clip envelope ${args.dryRun ? "show previewed" : "shown"} for ${args.clipId}.`,
          result.affectedObjects ?? [args.clipId],
          before?.selection?.snapshotVersion ?? before?.snapshotVersion ?? null,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "hide_clip_envelope",
      description: "Hide the envelope lane for a target clip in Live's detail view.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Target clip id."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        await policyAdapter.assertAllowed("hide_clip_envelope", args);
        const before = await stateAdapter.getSelectedContext();
        const result = await bridgeAdapter.hideClipEnvelope(
          { clipId: args.clipId },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState("project");
        return buildMutationResult(
          `Clip envelope ${args.dryRun ? "hide previewed" : "hidden"} for ${args.clipId}.`,
          result.affectedObjects ?? [args.clipId],
          before?.selection?.snapshotVersion ?? before?.snapshotVersion ?? null,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "select_clip_envelope_parameter",
      description: "Select a parameter as the active envelope target for a clip.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Target clip id."
          },
          parameterId: {
            type: "string",
            description: "Parameter target id returned by get_clip_envelopes."
          },
          showEnvelope: {
            type: "boolean",
            description: "If true, also show the envelope lane in Live."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId", "parameterId"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        requireString(args.parameterId, "parameterId");
        await policyAdapter.assertAllowed("select_clip_envelope_parameter", args);
        const before = await stateAdapter.getSelectedContext();
        const result = await bridgeAdapter.selectClipEnvelopeParameter(
          {
            clipId: args.clipId,
            parameterId: args.parameterId,
            showEnvelope: args.showEnvelope !== false
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState("project");
        return {
          ...buildMutationResult(
            `Clip envelope parameter ${args.dryRun ? "selection previewed" : "selected"} for ${args.clipId}.`,
            result.affectedObjects ?? [args.clipId, args.parameterId],
            before?.selection?.snapshotVersion ?? before?.snapshotVersion ?? null,
            after.stateVersion,
            after.warnings ?? []
          ),
          clip_envelope: result
        };
      }
    },
    {
      name: "clear_clip_envelope",
      description: "Clear clip automation for a specific parameter target.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Target clip id."
          },
          parameterId: {
            type: "string",
            description: "Parameter target id returned by get_clip_envelopes."
          },
          confirm: {
            type: "boolean",
            description: "Required for non-dry-run clearing."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId", "parameterId"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        requireString(args.parameterId, "parameterId");
        requireConfirmation(args, "clear_clip_envelope");
        await policyAdapter.assertAllowed("clear_clip_envelope", args);
        const before = await stateAdapter.getProjectSummary();
        const result = await bridgeAdapter.clearClipEnvelope(
          {
            clipId: args.clipId,
            parameterId: args.parameterId
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(args.clipId);
        return {
          ...buildMutationResult(
            `Clip envelope ${args.dryRun ? "clear previewed" : "cleared"} for ${args.clipId}.`,
            result.affectedObjects ?? [args.clipId, args.parameterId],
            before.stateVersion,
            after.stateVersion,
            after.warnings ?? []
          ),
          clip_envelope: result
        };
      }
    },
    {
      name: "clear_all_clip_envelopes",
      description: "Clear all automation lanes from a clip.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Target clip id."
          },
          confirm: {
            type: "boolean",
            description: "Required for non-dry-run clearing."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        requireConfirmation(args, "clear_all_clip_envelopes");
        await policyAdapter.assertAllowed("clear_all_clip_envelopes", args);
        const before = await stateAdapter.getProjectSummary();
        const result = await bridgeAdapter.clearAllClipEnvelopes(
          {
            clipId: args.clipId
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(args.clipId);
        return {
          ...buildMutationResult(
            `All clip envelopes ${args.dryRun ? "clear previewed" : "cleared"} for ${args.clipId}.`,
            result.affectedObjects ?? [args.clipId],
            before.stateVersion,
            after.stateVersion,
            after.warnings ?? []
          ),
          clip_envelope: result
        };
      }
    },
    {
      name: "set_clip_envelope",
      description: "Write step-based automation for a Session clip envelope target.",
      inputSchema: createObjectSchema({
        properties: {
          clipId: {
            type: "string",
            description: "Target Session clip id."
          },
          parameterId: {
            type: "string",
            description: "Parameter target id returned by get_clip_envelopes."
          },
          steps: {
            type: "array",
            description: "Envelope steps to write.",
            items: createObjectSchema({
              properties: {
                startBeats: {
                  type: "number",
                  description: "Beat position where the step begins."
                },
                durationBeats: {
                  type: "number",
                  description: "How long the step holds its value."
                },
                value: {
                  type: "number",
                  description: "Envelope value to write."
                }
              },
              required: ["startBeats", "durationBeats", "value"]
            })
          },
          clearExisting: {
            type: "boolean",
            description: "If true, clear any existing automation for this target first."
          },
          selectInView: {
            type: "boolean",
            description: "If true, focus the written envelope in Live after the write."
          },
          dryRun: dryRunProperty
        },
        required: ["clipId", "parameterId", "steps"]
      }),
      async execute(args) {
        requireString(args.clipId, "clipId");
        requireString(args.parameterId, "parameterId");
        if (!Array.isArray(args.steps)) {
          throw new McpError(ErrorCode.InvalidParams, "steps must be an array");
        }
        await policyAdapter.assertAllowed("set_clip_envelope", args);
        const before = await stateAdapter.getProjectSummary();
        const result = await bridgeAdapter.setClipEnvelope(
          {
            clipId: args.clipId,
            parameterId: args.parameterId,
            steps: args.steps,
            clearExisting: args.clearExisting !== false,
            selectInView: Boolean(args.selectInView)
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(args.clipId);
        return {
          ...buildMutationResult(
            `Clip envelope ${args.dryRun ? "write previewed" : "written"} for ${args.clipId}.`,
            result.affectedObjects ?? [args.clipId, args.parameterId],
            before.stateVersion,
            after.stateVersion,
            after.warnings ?? []
          ),
          clip_envelope: result
        };
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
      name: "set_track_volume",
      description: "Set a track, return-track, or master-track volume level.",
      inputSchema: createObjectSchema({
        properties: {
          trackId: {
            type: "string",
            description: "Target mixer track identifier."
          },
          trackName: {
            type: "string",
            description: "Track name to resolve when trackId is not known."
          },
          value: {
            type: "number",
            description: "Target mixer volume value."
          },
          dryRun: dryRunProperty
        },
        required: ["value"]
      }),
      async execute(args) {
        const track = resolveTrackCandidate(await listMixerTracks(stateAdapter), args);
        const value = Number(args.value);
        if (!Number.isFinite(value)) {
          throw new McpServerError("invalid_request", "value must be numeric");
        }
        await policyAdapter.assertAllowed("set_track_volume", args);
        const before = await stateAdapter.getProjectSummary();
        await bridgeAdapter.setTrackVolume(
          {
            trackId: track.id,
            value,
            dryRun: Boolean(args.dryRun)
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(track.id);
        return buildMutationResult(
          `Volume ${args.dryRun ? "previewed" : "updated"} for ${track.name}.`,
          [track.id],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "set_track_panning",
      description: "Set a track, return-track, or master-track panning value.",
      inputSchema: createObjectSchema({
        properties: {
          trackId: {
            type: "string",
            description: "Target mixer track identifier."
          },
          trackName: {
            type: "string",
            description: "Track name to resolve when trackId is not known."
          },
          value: {
            type: "number",
            description: "Target panning value."
          },
          dryRun: dryRunProperty
        },
        required: ["value"]
      }),
      async execute(args) {
        const track = resolveTrackCandidate(await listMixerTracks(stateAdapter), args);
        const value = Number(args.value);
        if (!Number.isFinite(value)) {
          throw new McpServerError("invalid_request", "value must be numeric");
        }
        await policyAdapter.assertAllowed("set_track_panning", args);
        const before = await stateAdapter.getProjectSummary();
        await bridgeAdapter.setTrackPanning(
          {
            trackId: track.id,
            value,
            dryRun: Boolean(args.dryRun)
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(track.id);
        return buildMutationResult(
          `Panning ${args.dryRun ? "previewed" : "updated"} for ${track.name}.`,
          [track.id],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "set_send_level",
      description: "Set a mixer send level on a track, including return-capable mixer targets.",
      inputSchema: createObjectSchema({
        properties: {
          trackId: {
            type: "string",
            description: "Track identifier containing the send."
          },
          trackName: {
            type: "string",
            description: "Track name to resolve when trackId is not known."
          },
          sendIndex: {
            type: "integer",
            minimum: 0,
            description: "Zero-based send index."
          },
          sendName: {
            type: "string",
            description: "Send name, for example `Send A`."
          },
          value: {
            type: "number",
            description: "Target send level."
          },
          dryRun: dryRunProperty
        },
        required: ["value"]
      }),
      async execute(args) {
        const { track, send } = await resolveSendReference(stateAdapter, args);
        const value = Number(args.value);
        if (!Number.isFinite(value)) {
          throw new McpServerError("invalid_request", "value must be numeric");
        }
        await policyAdapter.assertAllowed("set_send_level", args);
        const before = await stateAdapter.getProjectSummary();
        await bridgeAdapter.setSendLevel(
          {
            trackId: track.id,
            sendIndex: send.index,
            value,
            dryRun: Boolean(args.dryRun)
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(track.id);
        return buildMutationResult(
          `Send ${send.name} ${args.dryRun ? "previewed" : "updated"}.`,
          [track.id],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "set_monitor_state",
      description: "Set track monitoring state using `in`, `auto`, or `off`.",
      inputSchema: createObjectSchema({
        properties: {
          trackId: {
            type: "string",
            description: "Target track identifier."
          },
          trackName: {
            type: "string",
            description: "Track name to resolve when trackId is not known."
          },
          monitoringState: {
            oneOf: [
              { type: "string" },
              { type: "integer" }
            ],
            description: "Monitoring mode: `in`, `auto`, `off`, or the runtime integer value."
          },
          dryRun: dryRunProperty
        },
        required: ["monitoringState"]
      }),
      async execute(args) {
        const track = resolveTrackCandidate(await listMixerTracks(stateAdapter), args);
        const monitoringState = resolveMonitoringState(args.monitoringState);
        await policyAdapter.assertAllowed("set_monitor_state", args);
        const before = await stateAdapter.getProjectSummary();
        await bridgeAdapter.setMonitorState(
          {
            trackId: track.id,
            monitoringState,
            dryRun: Boolean(args.dryRun)
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(track.id);
        return buildMutationResult(
          `Monitor state ${args.dryRun ? "previewed" : "updated"} for ${track.name}.`,
          [track.id],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "set_track_routing",
      description: "Set one or more track routing fields by display name or identifier.",
      inputSchema: createObjectSchema({
        properties: {
          trackId: {
            type: "string",
            description: "Target track identifier."
          },
          trackName: {
            type: "string",
            description: "Track name to resolve when trackId is not known."
          },
          inputRoutingType: {
            type: "string",
            description: "Input routing type display name or identifier."
          },
          inputRoutingChannel: {
            type: "string",
            description: "Input routing channel display name or identifier."
          },
          outputRoutingType: {
            type: "string",
            description: "Output routing type display name or identifier."
          },
          outputRoutingChannel: {
            type: "string",
            description: "Output routing channel display name or identifier."
          },
          dryRun: dryRunProperty
        }
      }),
      async execute(args) {
        if (
          args.inputRoutingType === undefined &&
          args.inputRoutingChannel === undefined &&
          args.outputRoutingType === undefined &&
          args.outputRoutingChannel === undefined
        ) {
          throw new McpServerError(
            "invalid_request",
            "Provide at least one routing field to update"
          );
        }

        const track = resolveTrackCandidate(await listMixerTracks(stateAdapter), args);
        const details = await stateAdapter.getTrackDetails(track.id);
        await policyAdapter.assertAllowed("set_track_routing", args);
        const before = await stateAdapter.getProjectSummary();
        await bridgeAdapter.setTrackRouting(
          {
            trackId: track.id,
            inputRoutingType: resolveRoutingChoice(
              details,
              "availableInputRoutingTypes",
              args.inputRoutingType,
              "Input routing type"
            ),
            inputRoutingChannel: resolveRoutingChoice(
              details,
              "availableInputRoutingChannels",
              args.inputRoutingChannel,
              "Input routing channel"
            ),
            outputRoutingType: resolveRoutingChoice(
              details,
              "availableOutputRoutingTypes",
              args.outputRoutingType,
              "Output routing type"
            ),
            outputRoutingChannel: resolveRoutingChoice(
              details,
              "availableOutputRoutingChannels",
              args.outputRoutingChannel,
              "Output routing channel"
            ),
            dryRun: Boolean(args.dryRun)
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(track.id);
        return buildMutationResult(
          `Routing ${args.dryRun ? "previewed" : "updated"} for ${track.name}.`,
          [track.id],
          before.stateVersion,
          after.stateVersion,
          after.warnings ?? []
        );
      }
    },
    {
      name: "set_parameter",
      description: "Set a device parameter by explicit ids or by track/device/parameter names, with optional enum-label lookup for quantized controls.",
      inputSchema: createObjectSchema({
        properties: {
          trackId: {
            type: "string",
            description: "Track identifier containing the target device."
          },
          trackName: {
            type: "string",
            description: "Track name to resolve when trackId is not known."
          },
          trackIndex: {
            type: "integer",
            minimum: 0,
            description: "Zero-based visible-track index to resolve when trackId is not known."
          },
          deviceId: {
            type: "string",
            description: "Device identifier containing the target parameter."
          },
          deviceName: {
            type: "string",
            description: "Device name to resolve when deviceId is not known."
          },
          parameterId: {
            type: "string",
            description: "Parameter identifier to update."
          },
          parameterName: {
            type: "string",
            description: "Parameter name to resolve when parameterId is not known."
          },
          value: {
            type: "number",
            description: "Target numeric parameter value."
          },
          valueLabel: {
            type: "string",
            description: "Enum label to resolve for quantized parameters, for example `Algorithm 3`."
          },
          dryRun: {
            type: "boolean",
            description: "If true, preview the action without mutating Live."
          }
        }
      }),
      async execute(args) {
        if (args.value === undefined && args.valueLabel === undefined) {
          throw new McpServerError(
            "invalid_request",
            "Provide value or valueLabel for set_parameter"
          );
        }

        const target = await resolveParameterReference(stateAdapter, args);
        const resolvedValue = resolveParameterValue(target.parameter, args);

        await policyAdapter.assertAllowed("set_parameter", args);
        const before = await stateAdapter.getProjectSummary();
        await bridgeAdapter.setParameter(
          {
            trackId: target.track.id,
            deviceId: target.device.id,
            parameterId: target.parameter.id,
            value: resolvedValue.value
          },
          { dryRun: Boolean(args.dryRun) }
        );
        const after = await stateAdapter.refreshState(target.device.id);
        return buildMutationResult(
          `Parameter ${target.parameter.name} ${args.dryRun ? "previewed" : "updated"}${resolvedValue.label ? ` to ${resolvedValue.label}` : ""}.`,
          [target.track.id, target.device.id, target.parameter.id],
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
      name: "ensure_sidecar_on_track",
      description:
        "Ensure the optional laive Max for Live sidecar is present on a target MIDI track, using guided setup or UI-assisted placement when needed.",
      inputSchema: createObjectSchema({
        properties: {
          trackId: {
            type: "string",
            description: "Target MIDI track identifier, for example `track:7`."
          },
          dryRun: dryRunProperty
        },
        required: ["trackId"]
      }),
      async execute(args) {
        requireString(args.trackId, "trackId");
        await policyAdapter.assertAllowed("ensure_sidecar_on_track", args);
        const before = await stateAdapter.getProjectSummary();
        const result = await sidecarAdapter.ensureOnTrack({
          trackId: args.trackId,
          dryRun: Boolean(args.dryRun)
        });
        const after = await stateAdapter.refreshState(args.trackId);
        return {
          ...buildMutationResult(
            `Sidecar placement ${args.dryRun ? "previewed" : "requested"} for ${args.trackId}.`,
            result.activeInstance ? [args.trackId, result.activeInstance.deviceId] : [args.trackId],
            before.stateVersion,
            after.stateVersion,
            result.warnings ?? after.warnings ?? []
          ),
          sidecar_activation: result
        };
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
      name: "sidecar_transform_selected_clip",
      description:
        "Apply note-level transforms to the currently selected MIDI clip through the optional Max for Live sidecar.",
      inputSchema: createObjectSchema({
        properties: {
          transposeSemitones: {
            type: "integer",
            description: "Optional semitone shift to apply to every note in the selected MIDI clip."
          },
          velocityScale: {
            type: "number",
            description: "Optional multiplier applied to note velocities."
          },
          velocityOffset: {
            type: "number",
            description: "Optional offset added to note velocities after scaling."
          },
          startOffsetBeats: {
            type: "number",
            description: "Optional beat offset applied to note start times."
          },
          durationScale: {
            type: "number",
            description: "Optional multiplier applied to note durations."
          },
          dryRun: dryRunProperty
        }
      }),
      async execute(args) {
        await policyAdapter.assertAllowed("sidecar_transform_selected_clip", args);
        const before = await stateAdapter.getProjectSummary();
        const transformed = await sidecarAdapter.transformSelectedClip({
          transposeSemitones: args.transposeSemitones,
          velocityScale: args.velocityScale,
          velocityOffset: args.velocityOffset,
          startOffsetBeats: args.startOffsetBeats,
          durationScale: args.durationScale,
          dryRun: Boolean(args.dryRun)
        });
        const after = await stateAdapter.refreshState("project");
        return {
          ...buildMutationResult(
            `Sidecar selected-clip transform ${args.dryRun ? "previewed" : "applied"}.`,
            [transformed.selectedClipId].filter(Boolean),
            before.stateVersion,
            after.stateVersion,
            after.warnings ?? []
          ),
          sidecar_workflow: transformed
        };
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
      name: "sidecar_capture_device_snapshot",
      description:
        "Capture a parameter snapshot for a selected or explicitly targeted device through the optional Max for Live sidecar.",
      inputSchema: createObjectSchema({
        properties: {
          trackId: {
            type: "string",
            description: "Optional track identifier when no track is selected in Live."
          },
          trackName: {
            type: "string",
            description: "Optional track name when trackId is unknown."
          },
          deviceId: {
            type: "string",
            description: "Optional device identifier when the target device is known."
          },
          deviceName: {
            type: "string",
            description: "Optional device name when deviceId is unknown."
          }
        }
      }),
      async execute(args) {
        const result = await sidecarAdapter.captureDeviceSnapshot({
          trackId: args.trackId ?? null,
          trackName: args.trackName ?? null,
          deviceId: args.deviceId ?? null,
          deviceName: args.deviceName ?? null
        });
        return buildInformationalResult(
          "Sidecar device snapshot captured.",
          {
            affected_objects: [result.snapshot.trackId, result.snapshot.deviceId].filter(Boolean),
            sidecar_workflow: result
          },
          ["sidecar_apply_device_snapshot", "get_device_tree"]
        );
      }
    },
    {
      name: "sidecar_apply_device_snapshot",
      description:
        "Apply a captured device-parameter snapshot through the optional Max for Live sidecar.",
      inputSchema: createObjectSchema({
        properties: {
          snapshot: {
            ...deviceSnapshotSchema,
            description: "Snapshot payload previously returned by sidecar_capture_device_snapshot."
          },
          trackId: {
            type: "string",
            description: "Optional target track override."
          },
          trackName: {
            type: "string",
            description: "Optional target track name override."
          },
          deviceId: {
            type: "string",
            description: "Optional target device override."
          },
          deviceName: {
            type: "string",
            description: "Optional target device name override."
          },
          dryRun: dryRunProperty
        },
        required: ["snapshot"]
      }),
      async execute(args) {
        await policyAdapter.assertAllowed("sidecar_apply_device_snapshot", args);
        const before = await stateAdapter.getProjectSummary();
        const result = await sidecarAdapter.applyDeviceSnapshot({
          snapshot: args.snapshot,
          trackId: args.trackId ?? null,
          trackName: args.trackName ?? null,
          deviceId: args.deviceId ?? null,
          deviceName: args.deviceName ?? null,
          dryRun: Boolean(args.dryRun)
        });
        const after = await stateAdapter.refreshState(result.target.trackId);
        return {
          ...buildMutationResult(
            `Sidecar device snapshot ${args.dryRun ? "previewed" : "applied"} for ${result.target.deviceName}.`,
            [result.target.trackId, result.target.deviceId].filter(Boolean),
            before.stateVersion,
            after.stateVersion,
            after.warnings ?? []
          ),
          sidecar_workflow: result
        };
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
