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
    `Load \`${devicePath}\` onto a MIDI track in the current Ableton Live set.`,
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
  const configured = existsSync(sidecarTarget.devicePath);
  const activeInstances = configured ? await listActiveSidecarInstances(stateAdapter) : [];

  return {
    configured,
    active: activeInstances.length > 0,
    active_instances: activeInstances,
    devicePath: sidecarTarget.devicePath,
    workflows: listSidecarWorkflows(),
    setup_instructions: buildSidecarSetupInstructions(sidecarTarget.devicePath)
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

export function createSidecarAdapter({ stateAdapter, bridgeAdapter } = {}) {
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
