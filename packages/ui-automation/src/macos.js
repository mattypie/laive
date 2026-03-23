import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

import { assertMacOS } from "./guards.js";
import { getDefaultHelperExecutablePath } from "./helper.js";

const execFileAsync = promisify(execFile);

function quoteAppleScriptString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

const SPECIAL_KEY_CODES = {
  return: 36,
  enter: 76,
  tab: 48,
  escape: 53,
  up: 126,
  down: 125,
  left: 123,
  right: 124
};

export function getSpecialKeyCode(value) {
  return SPECIAL_KEY_CODES[String(value).toLowerCase()] ?? null;
}

export async function runAppleScript(lines) {
  assertMacOS();

  const script = Array.isArray(lines) ? lines.join("\n") : lines;
  const helperExecutablePath = process.env.LAIVE_UI_HELPER_EXECUTABLE ?? getDefaultHelperExecutablePath();
  const encodedScript = Buffer.from(script, "utf8").toString("base64");
  const command =
    helperExecutablePath && existsSync(helperExecutablePath)
      ? { executable: helperExecutablePath, args: ["run_applescript_base64", encodedScript] }
      : { executable: "/usr/bin/osascript", args: ["-e", script] };
  const { stdout } = await execFileAsync(command.executable, command.args);
  return stdout.trim();
}

export async function getFrontmostApplication() {
  const output = await runAppleScript([
    'tell application "System Events"',
    "set frontApp to name of first application process whose frontmost is true",
    "end tell",
    "return frontApp"
  ]);

  return {
    appName: output,
    isFrontmost: Boolean(output)
  };
}

export async function activateApplication(appName) {
  const safeAppName = quoteAppleScriptString(appName);
  await runAppleScript(`tell application "${safeAppName}" to activate`);
}

export async function clickMenuPath(appName, menuPath) {
  const [menuBarItem, menuItem] = menuPath;
  const safeAppName = quoteAppleScriptString(appName);
  const safeMenuBarItem = quoteAppleScriptString(menuBarItem);
  const safeMenuItem = quoteAppleScriptString(menuItem);

  await runAppleScript([
    `tell application "${safeAppName}" to activate`,
    'tell application "System Events"',
    `tell process "${safeAppName}"`,
    `click menu item "${safeMenuItem}" of menu "${safeMenuBarItem}" of menu bar item "${safeMenuBarItem}" of menu bar 1`,
    "end tell",
    "end tell"
  ]);
}

export async function sendKeystroke(value, modifiers = []) {
  const modifierExpression =
    modifiers.length > 0 ? ` using {${modifiers.map((item) => `${item} down`).join(", ")}}` : "";
  const specialKeyCode = getSpecialKeyCode(value);

  if (typeof specialKeyCode === "number") {
    await runAppleScript([
      'tell application "System Events"',
      `key code ${specialKeyCode}${modifierExpression}`,
      "end tell"
    ]);
    return;
  }

  const safeValue = quoteAppleScriptString(value);
  await runAppleScript([
    'tell application "System Events"',
    `keystroke "${safeValue}"${modifierExpression}`,
    "end tell"
  ]);
}

export async function typeText(value) {
  const safeValue = quoteAppleScriptString(value);
  await runAppleScript([
    'tell application "System Events"',
    `keystroke "${safeValue}"`,
    "end tell"
  ]);
}
