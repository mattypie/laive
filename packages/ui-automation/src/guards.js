export function assertMacOS() {
  if (process.platform !== "darwin") {
    throw new Error("UI automation is currently supported on macOS only.");
  }
}

export function assertSupportedLiveWindow(windowContext) {
  if (!windowContext?.isFrontmost) {
    throw new Error("Ableton Live must be the frontmost application for UI fallback.");
  }

  if (!windowContext?.appName?.includes("Live")) {
    throw new Error("Focused application is not Ableton Live.");
  }
}

export function assertWorkflowAllowed(workflow) {
  if (!workflow?.allowFallback) {
    throw new Error(`Workflow ${workflow?.name ?? "unknown"} is not allowed in fallback mode.`);
  }
}
