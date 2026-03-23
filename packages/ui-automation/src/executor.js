import {
  activateApplication,
  clickMenuPath,
  getFrontmostApplication,
  sendKeystroke,
  typeText
} from "./macos.js";
import { assertSupportedLiveWindow, assertWorkflowAllowed } from "./guards.js";
import { getWorkflow } from "./workflows.js";

function resolveParameter(step, parameters) {
  if (!step.parameter) {
    return step.value;
  }

  if (!(step.parameter in parameters)) {
    throw new Error(`Missing workflow parameter: ${step.parameter}`);
  }

  return parameters[step.parameter];
}

export function materializeWorkflow(name, parameters = {}) {
  const workflow = getWorkflow(name);
  const materializedSteps = workflow.steps.map((step) => ({
    ...step,
    resolvedValue: resolveParameter(step, parameters)
  }));

  return {
    ...workflow,
    steps: materializedSteps
  };
}

export async function captureContext() {
  return getFrontmostApplication();
}

export function resolveLiveAppName(context, fallbackAppName = "Ableton Live") {
  if (context?.appName && context.appName.includes("Live")) {
    return context.appName;
  }

  return fallbackAppName;
}

export async function executeWorkflow(name, parameters = {}, options = {}) {
  const workflow = materializeWorkflow(name, parameters);
  assertWorkflowAllowed(workflow);

  const context = options.context ?? (await captureContext());
  if (workflow.guards.includes("app:ableton-live-frontmost")) {
    assertSupportedLiveWindow(context);
  }
  const liveAppName = resolveLiveAppName(context);

  const executedSteps = [];

  for (const step of workflow.steps) {
    switch (step.type) {
      case "activate_app":
        await activateApplication(resolveLiveAppName(context, step.appName));
        break;
      case "menu_click":
        await clickMenuPath(liveAppName, step.menuPath);
        break;
      case "keystroke":
        await sendKeystroke(step.value, step.modifiers);
        break;
      case "type_text":
        await typeText(step.resolvedValue);
        break;
      case "capture_context":
        break;
      case "focus_section":
      case "set_text_field":
      case "press_button":
      case "wait_for_window":
        break;
      default:
        throw new Error(`Unsupported workflow step: ${step.type}`);
    }

    executedSteps.push({
      type: step.type,
      resolvedValue: step.resolvedValue ?? null
    });
  }

  return {
    workflow: workflow.name,
    context,
    executedSteps
  };
}
