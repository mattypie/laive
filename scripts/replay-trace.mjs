import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function usage() {
  console.error("Usage: node ./scripts/replay-trace.mjs <trace.jsonl>");
}

function parseTraceLine(line, index) {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`);
  }
}

const tracePath = process.argv[2];

if (!tracePath) {
  usage();
  process.exitCode = 1;
} else {
  const absolutePath = path.resolve(tracePath);
  const raw = await readFile(absolutePath, "utf8");
  const entries = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseTraceLine);

  const summary = {
    tracePath: absolutePath,
    totalEntries: entries.length,
    byType: {},
    requestIds: new Set(),
    errors: []
  };

  for (const entry of entries) {
    summary.byType[entry.type] = (summary.byType[entry.type] ?? 0) + 1;
    if (entry.request_id) {
      summary.requestIds.add(entry.request_id);
    }
    if (entry.type === "error") {
      summary.errors.push(entry);
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ...summary,
        requestIds: Array.from(summary.requestIds).sort()
      },
      null,
      2
    )}\n`
  );
}
