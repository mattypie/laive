import { existsSync } from "node:fs";

import {
  getDefaultSidecarInstallTarget
} from "../../live-sidecar-m4l/src/project.js";
import {
  listWorkflows as listSidecarWorkflows
} from "../../live-sidecar-m4l/src/workflows.js";
import { executeWorkflow as executeUiWorkflow } from "../../ui-automation/src/executor.js";
import { getStableUiHelperInstallPaths } from "../../ui-automation/src/helper.js";
import { workflows as uiWorkflows } from "../../ui-automation/src/workflows.js";

import { McpServerError } from "./errors.js";

function buildSidecarSetupInstructions(devicePath) {
  return [
    "Run `npx laive-mcp install --apply` if the sidecar device is not installed yet.",
    "Use `ensure_sidecar_on_track` to place the sidecar automatically when the UI helper is available.",
    `Load \`${devicePath}\` onto a MIDI track in the current Ableton Live set if automatic placement is unavailable.`,
    "Keep the `laive` Control Surface enabled in Live before retrying the sidecar tool."
  ];
}

function buildUiHelperSetupInstructions(appBundleRoot) {
  return [
    "Run `npx laive-mcp install --apply` if the UI helper app is not installed yet.",
    `In macOS System Settings > Privacy & Security > Accessibility, add and enable \`${appBundleRoot}\`.`,
    "Bring Ableton Live to the foreground before retrying the UI automation tool."
  ];
}

function summarizeUiWorkflows() {
  return Object.values(uiWorkflows).map((workflow) => ({
    name: workflow.name,
    description: workflow.description,
    parameters: workflow.parameters ?? []
  }));
}

function createSetupRequiredError(message, data) {
  return new McpServerError("setup_required", message, data);
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new McpServerError("invalid_request", `${fieldName} must be a non-empty string`);
  }
}

function requireConfigured(status, label) {
  if (!status.configured) {
    throw createSetupRequiredError(`${label} is not configured`, status);
  }
}

function normalizeLookup(value) {
  return String(value ?? "").trim().toLowerCase();
}

function buildLookupAliases(name) {
  const aliases = new Set();
  let current = String(name ?? "").trim();
  while (current) {
    aliases.add(normalizeLookup(current));
    const trimmed = current.replace(/^[A-Za-z][-\s]/, "").trim();
    if (trimmed === current) {
      break;
    }
    current = trimmed;
  }
  return [...aliases];
}

function candidateLookupAliases(candidate) {
  const aliases = new Set();
  for (const value of [candidate?.name, candidate?.shortName, candidate?.identifier]) {
    for (const alias of buildLookupAliases(value)) {
      aliases.add(alias);
    }
  }
  for (const value of candidate?.aliases ?? []) {
    for (const alias of buildLookupAliases(value)) {
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

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function isSidecarDeviceName(name) {
  const normalized = String(name ?? "")
    .trim()
    .toLowerCase();
  return normalized.includes("laive-sidecar") || normalized.includes("laive sidecar");
}

function isSidecarBrowserItem(item) {
  return isSidecarDeviceName(item?.name) || isSidecarDeviceName(item?.path) || isSidecarDeviceName(item?.uri);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listActiveSidecarInstances(stateAdapter) {
  if (!stateAdapter) {
    return [];
  }

  const tracks = await stateAdapter.listTracks();
  const instances = [];

  for (const track of tracks) {
    const details = await stateAdapter.getTrackDetails(track.id);
    for (const device of details.devices ?? []) {
      if (!isSidecarDeviceName(device.name)) {
        continue;
      }

      instances.push({
        trackId: track.id,
        trackName: track.name,
        deviceId: device.id,
        deviceName: device.name
      });
    }
  }

  return instances;
}

async function getSidecarStatus(stateAdapter) {
  const sidecarTarget = getDefaultSidecarInstallTarget();
  const activeInstances = await listActiveSidecarInstances(stateAdapter);
  const configured = existsSync(sidecarTarget.devicePath) || activeInstances.length > 0;

  return {
    configured,
    active: activeInstances.length > 0,
    active_instances: activeInstances,
    devicePath: sidecarTarget.devicePath,
    workflows: listSidecarWorkflows(),
    setup_instructions: buildSidecarSetupInstructions(sidecarTarget.devicePath)
  };
}

function prioritizeBrowserRoots(roots = []) {
  const preferred = ["user_library", "max_for_live", "midi_effects", "plugins"];
  const score = (path) => {
    const index = preferred.indexOf(String(path ?? "").toLowerCase());
    return index === -1 ? preferred.length : index;
  };

  return [...roots].sort((left, right) => score(left.path) - score(right.path));
}

async function findBrowserItem(bridgeAdapter, matcher, options = {}) {
  if (!bridgeAdapter || typeof bridgeAdapter.getBrowserTree !== "function" || typeof bridgeAdapter.getBrowserItems !== "function") {
    return null;
  }

  const maxDepth = options.maxDepth ?? 5;
  const tree = await bridgeAdapter.getBrowserTree();
  const queue = prioritizeBrowserRoots(tree?.roots ?? []).map((root) => ({
    path: root.path,
    depth: 0
  }));
  const seenPaths = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current?.path || seenPaths.has(current.path)) {
      continue;
    }
    seenPaths.add(current.path);

    const response = await bridgeAdapter.getBrowserItems({ path: current.path });
    if (matcher(response?.item)) {
      return response.item;
    }

    for (const item of response?.items ?? []) {
      if (matcher(item)) {
        return item;
      }
      if (item?.is_folder && item.path && current.depth < maxDepth) {
        queue.push({
          path: item.path,
          depth: current.depth + 1
        });
      }
    }
  }

  return null;
}

async function confirmSidecarActiveOnTrack(stateAdapter, trackId, options = {}) {
  const attempts = options.attempts ?? 8;
  const delayMs = options.delayMs ?? 250;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (stateAdapter && typeof stateAdapter.refreshState === "function") {
      await stateAdapter.refreshState(trackId);
    }
    const status = await getSidecarStatus(stateAdapter);
    const activeInstance =
      status.active_instances.find((instance) => instance.trackId === trackId) ?? null;
    if (activeInstance) {
      return {
        status,
        activeInstance
      };
    }
    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  const status = await getSidecarStatus(stateAdapter);
  return {
    status,
    activeInstance: status.active_instances.find((instance) => instance.trackId === trackId) ?? null
  };
}

function resolveContextClip(context, explicitClipId = null) {
  const selectedClip = context?.clip ?? null;
  const clipId = explicitClipId ?? context?.selectedClipId ?? selectedClip?.id ?? null;
  if (!clipId || !selectedClip || selectedClip.id !== clipId) {
    throw new McpServerError(
      "invalid_request",
      "A selected clip is required in Live for this sidecar workflow"
    );
  }
  return selectedClip;
}

function requireMidiClip(clip) {
  if (!clip?.isMidi && !clip?.is_midi) {
    throw new McpServerError(
      "invalid_request",
      "The selected clip must be a MIDI clip for this sidecar workflow"
    );
  }
}

function requireClipNotes(clip) {
  const notes = clip?.notes ?? [];
  if (!Array.isArray(notes)) {
    throw new McpServerError("runtime_error", "Selected clip notes are unavailable in the current state mirror");
  }
  return notes;
}

function buildTransformedNotes(notes, transform) {
  return notes.map((note) => {
    const nextStart = clamp(
      Number(note.start_time ?? note.startBeats ?? 0) + Number(transform.startOffsetBeats ?? 0),
      0,
      Number.MAX_SAFE_INTEGER
    );
    const nextDuration = clamp(
      Number(note.duration ?? note.durationBeats ?? 0.25) * Number(transform.durationScale ?? 1),
      0.03125,
      Number.MAX_SAFE_INTEGER
    );
    const nextVelocity = clamp(
      Math.round(
        Number(note.velocity ?? 100) * Number(transform.velocityScale ?? 1) +
          Number(transform.velocityOffset ?? 0)
      ),
      1,
      127
    );
    const nextPitch = clamp(
      Math.round(Number(note.pitch ?? 60) + Number(transform.transposeSemitones ?? 0)),
      0,
      127
    );

    return {
      ...note,
      pitch: nextPitch,
      start_time: nextStart,
      startBeats: nextStart,
      duration: nextDuration,
      durationBeats: nextDuration,
      velocity: nextVelocity
    };
  });
}

function ensureTransformRequested(transform) {
  const keys = [
    "transposeSemitones",
    "velocityScale",
    "velocityOffset",
    "startOffsetBeats",
    "durationScale"
  ];
  if (!keys.some((key) => transform[key] !== undefined && transform[key] !== null)) {
    throw new McpServerError(
      "invalid_request",
      "Provide at least one transform parameter for sidecar clip transforms"
    );
  }
}

async function resolveDeviceSnapshotTarget(stateAdapter, parameters = {}) {
  if (!stateAdapter) {
    throw new McpServerError("adapter_unavailable", "state adapter is not configured");
  }

  const context = await stateAdapter.getSelectedContext();
  const selectedTrack = context?.track ?? null;
  const selectedDevice = context?.device ?? null;

  let trackId = parameters.trackId ?? selectedTrack?.id ?? null;
  if (!trackId && parameters.trackName) {
    const tracks = await stateAdapter.listTracks();
    trackId = pickUniqueMatch(tracks, parameters.trackName, "Track").id;
  }
  if (!trackId) {
    throw new McpServerError(
      "invalid_request",
      "trackId or trackName is required when no track is selected in Live"
    );
  }

  const details = await stateAdapter.getTrackDetails(trackId);
  const devices = details.devices ?? [];
  let device = null;

  if (parameters.deviceId) {
    device = devices.find((candidate) => candidate.id === parameters.deviceId) ?? null;
    if (!device) {
      throw new McpServerError("not_found", `Device not found: ${parameters.deviceId}`);
    }
  } else if (parameters.deviceName) {
    device = pickUniqueMatch(devices, parameters.deviceName, "Device");
  } else if (selectedDevice) {
    device = devices.find((candidate) => candidate.id === selectedDevice.id) ?? null;
  } else if (devices.length === 1) {
    device = devices[0];
  } else if (devices.length === 0) {
    throw new McpServerError("not_found", `No devices found on track ${trackId}`);
  } else {
    throw new McpServerError(
      "ambiguous_target",
      "deviceId or deviceName is required when the selected track contains multiple devices"
    );
  }

  return {
    context,
    track: details.track,
    device
  };
}

function buildDeviceSnapshot(target) {
  return {
    capturedAt: new Date().toISOString(),
    trackId: target.track.id,
    trackName: target.track.name,
    deviceId: target.device.id,
    deviceName: target.device.name,
    parameters: (target.device.parameters ?? []).map((parameter) => ({
      id: parameter.id,
      name: parameter.name,
      value: parameter.value,
      displayValue: parameter.displayValue ?? parameter.display_value ?? null,
      isQuantized: parameter.isQuantized ?? parameter.is_quantized ?? false
    }))
  };
}

function parameterValueMatchesSnapshot(liveParameter, snapshotParameter) {
  if (!liveParameter || !snapshotParameter) {
    return false;
  }

  const liveValue = Number(liveParameter.value);
  const snapshotValue = Number(snapshotParameter.value);
  if (!Number.isFinite(liveValue) || !Number.isFinite(snapshotValue)) {
    return false;
  }

  if (liveParameter.isQuantized ?? liveParameter.is_quantized) {
    return Math.round(liveValue) === Math.round(snapshotValue);
  }

  return Math.abs(liveValue - snapshotValue) <= 1e-6;
}

async function readClipNotes(stateAdapter, bridgeAdapter, context) {
  const clipId = context?.selectedClipId ?? context?.clip?.id ?? null;
  if (!clipId) {
    throw new McpServerError(
      "invalid_request",
      "A selected clip is required in Live for this sidecar workflow"
    );
  }

  if (bridgeAdapter && typeof bridgeAdapter.getClipNotes === "function") {
    const clipSnapshot = await bridgeAdapter.getClipNotes({ clipId });
    return {
      clip: clipSnapshot?.clip ?? context?.clip ?? null,
      notes: Array.isArray(clipSnapshot?.notes) ? clipSnapshot.notes : []
    };
  }

  const clip = resolveContextClip(context, clipId);
  return {
    clip,
    notes: requireClipNotes(clip)
  };
}

function requireActiveSidecar(status) {
  requireConfigured(status, "Max for Live sidecar");
  if (!status.active) {
    throw createSetupRequiredError("Max for Live sidecar is not active in the current Live set", {
      ...status,
      component: "sidecar"
    });
  }
}

function getStatus() {
  const uiHelperTarget = getStableUiHelperInstallPaths();

  return {
    ui_helper: {
      configured: existsSync(uiHelperTarget.appBundleRoot),
      appBundleRoot: uiHelperTarget.appBundleRoot,
      executablePath: uiHelperTarget.executablePath,
      workflows: summarizeUiWorkflows(),
      setup_instructions: buildUiHelperSetupInstructions(uiHelperTarget.appBundleRoot)
    }
  };
}

export function createSidecarAdapter({ stateAdapter, bridgeAdapter, uiAutomationAdapter } = {}) {
  return {
    async getStatus() {
      return await getSidecarStatus(stateAdapter);
    },
    async listWorkflows() {
      const status = await getSidecarStatus(stateAdapter);
      return {
        ...status,
        workflows: listSidecarWorkflows()
      };
    },
    async snapshotSelectionContext() {
      const status = await getSidecarStatus(stateAdapter);
      requireActiveSidecar(status);
      if (!stateAdapter) {
        throw new McpServerError("adapter_unavailable", "state adapter is not configured");
      }
      const context = await stateAdapter.getSelectedContext();
      return {
        workflow: "snapshotSelectionContext",
        configured: true,
        context
      };
    },
    async transformSelectedClip({
      transposeSemitones,
      velocityScale,
      velocityOffset,
      startOffsetBeats,
      durationScale,
      dryRun = false
    } = {}) {
      const status = await getSidecarStatus(stateAdapter);
      requireActiveSidecar(status);
      if (!stateAdapter || !bridgeAdapter) {
        throw new McpServerError("adapter_unavailable", "state or bridge adapter is not configured");
      }

      const transform = {
        transposeSemitones,
        velocityScale,
        velocityOffset,
        startOffsetBeats,
        durationScale
      };
      ensureTransformRequested(transform);

      const context = await stateAdapter.getSelectedContext();
      const clipSnapshot = await readClipNotes(stateAdapter, bridgeAdapter, context);
      const clip = clipSnapshot.clip;
      requireMidiClip(clip);
      const notes = clipSnapshot.notes;
      const transformedNotes = buildTransformedNotes(notes, transform);
      const result = await bridgeAdapter.replaceNotes(
        {
          clipId: clip.id,
          notes: transformedNotes
        },
        { dryRun }
      );

      return {
        workflow: "transformSelectedClip",
        configured: true,
        selectedClipId: clip.id,
        selectedClipLocation: context.selectedClipLocation ?? clip.location ?? null,
        transform,
        noteCountBefore: notes.length,
        noteCountAfter: transformedNotes.length,
        transformedNotes,
        bridgeResult: result
      };
    },
    async replaceClipNotes({ clipId, notes, dryRun = false }) {
      const status = await getSidecarStatus(stateAdapter);
      requireActiveSidecar(status);
      if (!bridgeAdapter) {
        throw new McpServerError("adapter_unavailable", "bridge adapter is not configured");
      }
      return await bridgeAdapter.replaceNotes({
        clipId,
        notes,
        dryRun
      });
    },
    async observeDeviceParameters({ trackId } = {}) {
      const status = await getSidecarStatus(stateAdapter);
      requireActiveSidecar(status);
      if (!stateAdapter) {
        throw new McpServerError("adapter_unavailable", "state adapter is not configured");
      }
      const context = await stateAdapter.getSelectedContext();
      const resolvedTrackId = trackId ?? context.track?.id;
      if (!resolvedTrackId) {
        throw new McpServerError(
          "invalid_request",
          "trackId is required when no track is selected in Live"
        );
      }

      return {
        workflow: "observeDeviceParameters",
        configured: true,
        mode: "snapshot",
        warnings: [
          "Continuous sidecar event streaming is not yet emitted over MCP; returning a current parameter snapshot instead."
        ],
        selectedDeviceId: context.device?.id ?? null,
        deviceTree: await stateAdapter.getDeviceTree(resolvedTrackId)
      };
    },
    async captureDeviceSnapshot(parameters = {}) {
      const status = await getSidecarStatus(stateAdapter);
      requireActiveSidecar(status);
      const target = await resolveDeviceSnapshotTarget(stateAdapter, parameters);
      return {
        workflow: "captureDeviceSnapshot",
        configured: true,
        snapshot: buildDeviceSnapshot(target)
      };
    },
    async applyDeviceSnapshot({ snapshot, trackId, trackName, deviceId, deviceName, dryRun = false } = {}) {
      const status = await getSidecarStatus(stateAdapter);
      requireActiveSidecar(status);
      if (!bridgeAdapter || typeof bridgeAdapter.setParameter !== "function") {
        throw new McpServerError("adapter_unavailable", "bridge adapter cannot apply parameter snapshots");
      }
      if (!snapshot || typeof snapshot !== "object") {
        throw new McpServerError("invalid_request", "snapshot is required");
      }

      const target = await resolveDeviceSnapshotTarget(stateAdapter, {
        trackId: trackId ?? snapshot.trackId ?? null,
        trackName: trackName ?? snapshot.trackName ?? null,
        deviceId: deviceId ?? snapshot.deviceId ?? null,
        deviceName: deviceName ?? snapshot.deviceName ?? null
      });

      const appliedParameters = [];
      for (const parameterSnapshot of snapshot.parameters ?? []) {
        if (typeof parameterSnapshot?.value !== "number") {
          continue;
        }
        const liveParameter =
          (target.device.parameters ?? []).find((parameter) => parameter.id === parameterSnapshot.id) ??
          pickUniqueMatch(target.device.parameters ?? [], parameterSnapshot.name, "Parameter");
        if (parameterValueMatchesSnapshot(liveParameter, parameterSnapshot)) {
          continue;
        }
        await bridgeAdapter.setParameter(
          {
            trackId: target.track.id,
            deviceId: target.device.id,
            parameterId: liveParameter.id,
            value: parameterSnapshot.value
          },
          { dryRun }
        );
        appliedParameters.push({
          parameterId: liveParameter.id,
          parameterName: liveParameter.name,
          value: parameterSnapshot.value
        });
      }

      return {
        workflow: "applyDeviceSnapshot",
        configured: true,
        target: {
          trackId: target.track.id,
          trackName: target.track.name,
          deviceId: target.device.id,
          deviceName: target.device.name
        },
        appliedParameters,
        snapshot
      };
    },
    async ensureOnTrack({ trackId, dryRun = false } = {}) {
      const status = await getSidecarStatus(stateAdapter);
      requireString(trackId, "trackId");

      const existingInstance = status.active_instances.find((instance) => instance.trackId === trackId);
      if (existingInstance) {
        return {
          configured: true,
          active: true,
          trackId,
          workflow: "ensureOnTrack",
          status: "already_active",
          method: "existing_instance",
          activeInstance: existingInstance,
          setup_instructions: status.setup_instructions
        };
      }

      if (!bridgeAdapter || typeof bridgeAdapter.selectTrack !== "function") {
        throw new McpServerError(
          "adapter_unavailable",
          "bridge adapter cannot select the target track for sidecar placement"
        );
      }

      const nativeBrowserItem = dryRun
        ? null
        : await findBrowserItem(bridgeAdapter, (item) => item?.is_loadable && isSidecarBrowserItem(item));

      const resolvedUiAdapter = uiAutomationAdapter ?? createUiAutomationAdapter();
      const uiStatus =
        nativeBrowserItem || dryRun ? null : await resolvedUiAdapter.getStatus();

      if (!nativeBrowserItem && !status.configured && !uiStatus?.configured) {
        throw createSetupRequiredError("Max for Live sidecar is not configured", status);
      }

      await bridgeAdapter.selectTrack({ trackId }, { dryRun });
      let method = null;
      let bridgeLoad = null;
      let uiWorkflow = null;
      const warnings = [];

      if (nativeBrowserItem && typeof bridgeAdapter.loadBrowserItem === "function") {
        try {
          method = "bridge_browser_load_item";
          bridgeLoad = dryRun
            ? {
                preview: true,
                item: nativeBrowserItem
              }
            : await bridgeAdapter.loadBrowserItem({
                trackId,
                uri: nativeBrowserItem.uri ?? null,
                path: nativeBrowserItem.path ?? null
              });
        } catch (error) {
          warnings.push(
            `Native browser loading failed for the sidecar; falling back to UI helper: ${error.message || "unknown error"}`
          );
          method = null;
          bridgeLoad = {
            error: error.message || "unknown error",
            item: nativeBrowserItem
          };
        }
      }

      if (!method) {
        const effectiveUiStatus = uiStatus ?? await resolvedUiAdapter.getStatus();
        requireConfigured(effectiveUiStatus, "UI helper");
        method = "ui_browser_search_and_load";
        uiWorkflow = dryRun
          ? {
              workflow: "browserSearchAndLoad",
              preview: true,
              parameters: { query: "laive-sidecar" }
            }
          : await resolvedUiAdapter.executeWorkflow("browserSearchAndLoad", {
              query: "laive-sidecar"
            });
      }

      const confirmation = dryRun
        ? {
            status,
            activeInstance: null
          }
        : await confirmSidecarActiveOnTrack(stateAdapter, trackId);
      const nextStatus = confirmation.status;
      const activeInstance = confirmation.activeInstance;

      return {
        configured: true,
        active: Boolean(activeInstance),
        trackId,
        workflow: "ensureOnTrack",
        status: activeInstance ? "loaded" : dryRun ? "preview" : "dispatched",
        method,
        activeInstance,
        bridge_load: bridgeLoad,
        ui_workflow: uiWorkflow,
        warnings: activeInstance
          ? warnings
          : [
              ...warnings,
              "The sidecar load action was dispatched but the device was not confirmed on the target track yet."
            ],
        setup_instructions: nextStatus.setup_instructions
      };
    },
    async executeWorkflow(name, parameters = {}) {
      switch (name) {
        case "snapshotSelectionContext":
          return await this.snapshotSelectionContext();
        case "replaceClipNotes":
          return await this.replaceClipNotes({
            clipId: parameters.clipId,
            notes: parameters.notes,
            dryRun: Boolean(parameters.dryRun)
          });
        case "transformSelectedClip":
          return await this.transformSelectedClip({
            transposeSemitones: parameters.transposeSemitones,
            velocityScale: parameters.velocityScale,
            velocityOffset: parameters.velocityOffset,
            startOffsetBeats: parameters.startOffsetBeats,
            durationScale: parameters.durationScale,
            dryRun: Boolean(parameters.dryRun)
          });
        case "observeDeviceParameters":
          return await this.observeDeviceParameters({
            trackId: parameters.trackId
          });
        case "captureDeviceSnapshot":
          return await this.captureDeviceSnapshot({
            trackId: parameters.trackId,
            trackName: parameters.trackName,
            deviceId: parameters.deviceId,
            deviceName: parameters.deviceName
          });
        case "applyDeviceSnapshot":
          return await this.applyDeviceSnapshot({
            snapshot: parameters.snapshot,
            trackId: parameters.trackId,
            trackName: parameters.trackName,
            deviceId: parameters.deviceId,
            deviceName: parameters.deviceName,
            dryRun: Boolean(parameters.dryRun)
          });
        case "ensureOnTrack":
          return await this.ensureOnTrack({
            trackId: parameters.trackId,
            dryRun: Boolean(parameters.dryRun)
          });
        default:
          throw new McpServerError("invalid_request", `Unknown sidecar workflow: ${name}`);
      }
    }
  };
}

export function createUiAutomationAdapter() {
  return {
    async getStatus() {
      return getStatus().ui_helper;
    },
    async listWorkflows() {
      const status = getStatus();
      return {
        ...status.ui_helper,
        workflows: summarizeUiWorkflows()
      };
    },
    async executeWorkflow(name, parameters = {}) {
      const status = getStatus();
      requireConfigured(status.ui_helper, "UI helper");
      return {
        workflow: name,
        configured: true,
        helper: {
          appBundleRoot: status.ui_helper.appBundleRoot,
          executablePath: status.ui_helper.executablePath
        },
        result: await executeUiWorkflow(name, parameters)
      };
    }
  };
}

export function createIntegrationStatusAdapter({ sidecarAdapter, uiAutomationAdapter } = {}) {
  return {
    async getStatus() {
      return {
        sidecar: sidecarAdapter
          ? await sidecarAdapter.getStatus()
          : await getSidecarStatus(null),
        ui_helper: uiAutomationAdapter
          ? await uiAutomationAdapter.getStatus()
          : getStatus().ui_helper
      };
    }
  };
}
