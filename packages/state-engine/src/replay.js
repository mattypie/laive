import { readFile } from "node:fs/promises";
import { applyEvent, applySnapshot, createInitialState } from "./engine.js";

function parseTraceText(text) {
  const trimmed = text.trim();

  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function loadTraceFile(filePath) {
  const content = await readFile(filePath, "utf8");
  return parseTraceText(content);
}

export function replayTrace(entries, initialState = createInitialState()) {
  let currentState = structuredClone(initialState);
  const history = [];

  for (const entry of entries) {
    if (entry.type === "snapshot") {
      currentState = applySnapshot(currentState, entry.payload, {
        observedAt: entry.observed_at
      });
    } else if (entry.type === "event") {
      currentState = applyEvent(
        currentState,
        {
          event: entry.event,
          name: entry.name,
          payload: entry.payload,
          observed_at: entry.observed_at
        },
        {
          observedAt: entry.observed_at
        }
      );
    }

    history.push(structuredClone(currentState));
  }

  return {
    state: currentState,
    history
  };
}

export { parseTraceText };
