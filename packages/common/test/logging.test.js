import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createStructuredLogger, resolveLaiveLogDir } from "../src/logging.js";

test("resolveLaiveLogDir honors overrides and defaults under the home directory", () => {
  assert.equal(
    resolveLaiveLogDir({ env: { LAIVE_LOG_DIR: "/tmp/laive-logs" }, homeDirectory: "/Users/test" }),
    "/tmp/laive-logs"
  );
  assert.equal(
    resolveLaiveLogDir({ env: {}, homeDirectory: "/Users/test" }),
    "/Users/test/.local/share/laive/logs"
  );
});

test("structured logger writes jsonl entries", () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "laive-logs-"));
  const logger = createStructuredLogger({
    component: "mcp-server",
    fileName: "mcp-server.jsonl",
    logDir,
    now: () => new Date("2026-03-28T12:00:00.000Z"),
    pid: 4242
  });

  logger.info("mcp_cli.starting", {
    port: 7612,
    nested: {
      ok: true
    }
  });

  const contents = fs.readFileSync(path.join(logDir, "mcp-server.jsonl"), "utf8").trim();
  const entry = JSON.parse(contents);
  assert.equal(entry.timestamp, "2026-03-28T12:00:00.000Z");
  assert.equal(entry.component, "mcp-server");
  assert.equal(entry.pid, 4242);
  assert.equal(entry.message, "mcp_cli.starting");
  assert.deepEqual(entry.data, {
    port: 7612,
    nested: {
      ok: true
    }
  });
});
