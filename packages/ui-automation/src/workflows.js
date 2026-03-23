const commonGuards = ["platform:darwin", "app:ableton-live-frontmost"];

export const workflows = {
  exportAudioVideo: {
    name: "exportAudioVideo",
    description: "Open the Export Audio/Video dialog and stage the UI for a deterministic export flow.",
    allowFallback: true,
    guards: commonGuards,
    steps: [
      { type: "activate_app", appName: "Ableton Live" },
      { type: "menu_click", menuPath: ["File", "Export Audio/Video..."] },
      { type: "wait_for_window", title: "Export Audio/Video", timeoutMs: 5000 }
    ]
  },
  exportWithPreset: {
    name: "exportWithPreset",
    description: "Apply a known export preset, then confirm the export dialog.",
    allowFallback: true,
    guards: commonGuards,
    parameters: ["presetName", "outputPath"],
    steps: [
      { type: "activate_app", appName: "Ableton Live" },
      { type: "menu_click", menuPath: ["File", "Export Audio/Video..."] },
      { type: "wait_for_window", title: "Export Audio/Video", timeoutMs: 5000 },
      { type: "set_text_field", label: "Preset", parameter: "presetName" },
      { type: "set_text_field", label: "Output Folder", parameter: "outputPath" },
      { type: "press_button", label: "Export" }
    ]
  },
  browserSearchAndLoad: {
    name: "browserSearchAndLoad",
    description: "Focus the browser, search for an item, and perform a deterministic load action.",
    allowFallback: true,
    guards: commonGuards,
    parameters: ["query"],
    steps: [
      { type: "activate_app", appName: "Ableton Live" },
      { type: "menu_click", menuPath: ["View", "Browser"] },
      { type: "keystroke", value: "f", modifiers: ["command"] },
      { type: "type_text", parameter: "query" },
      { type: "keystroke", value: "down" },
      { type: "keystroke", value: "return" }
    ]
  },
  focusSection: {
    name: "focusSection",
    description: "Navigate Live to a named section using deterministic menu or shortcut actions.",
    allowFallback: true,
    guards: commonGuards,
    parameters: ["sectionName"],
    steps: [
      { type: "activate_app", appName: "Ableton Live" },
      { type: "focus_section", parameter: "sectionName" }
    ]
  },
  captureContext: {
    name: "captureContext",
    description: "Capture focused app metadata for diagnostics before running a fallback action.",
    allowFallback: true,
    guards: ["platform:darwin"],
    steps: [{ type: "capture_context" }]
  }
};

export function getWorkflow(name) {
  const workflow = workflows[name];

  if (!workflow) {
    throw new Error(`Unknown workflow: ${name}`);
  }

  return workflow;
}
