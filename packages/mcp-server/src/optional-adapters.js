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

      if (nativeBrowserItem && typeof bridgeAdapter.loadBrowserItem === "function") {
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
      } else {
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
          ? []
          : [
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
        case "observeDeviceParameters":
          return await this.observeDeviceParameters({
            trackId: parameters.trackId
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
