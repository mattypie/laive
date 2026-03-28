import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.join(__dirname, "..", "src", "cli.js");

test("mcp cli serves tools/list over stdio in fixture mode", async () => {
  const child = spawn("node", [cliPath, "--fixture"], {
    stdio: ["pipe", "pipe", "pipe"]
  });

  const responsePromise = new Promise((resolve, reject) => {
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (!buffer.includes("\n")) {
        return;
      }
      const [line] = buffer.split("\n");
      resolve(JSON.parse(line));
    });
    child.once("error", reject);
    child.stderr.on("data", (chunk) => {
      reject(new Error(chunk.toString("utf8")));
    });
  });

  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    })}\n`
  );

  const response = await responsePromise;
  assert.equal(response.result.server.name, "laive-mcp");
  assert.ok(response.result.tools.some((tool) => tool.name === "get_project_summary"));

  child.kill("SIGTERM");
});

test("mcp cli handles initialize and initialized notification in fixture mode", async () => {
  const child = spawn("node", [cliPath, "--fixture"], {
    stdio: ["pipe", "pipe", "pipe"]
  });

  const lines = [];
  const linePromise = new Promise((resolve, reject) => {
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const nextLines = buffer.split("\n");
      buffer = nextLines.pop() ?? "";
      for (const line of nextLines.map((entry) => entry.trim()).filter(Boolean)) {
        lines.push(line);
        if (lines.length === 1) {
          resolve(line);
        }
      }
    });
    child.once("error", reject);
    child.stderr.on("data", (chunk) => {
      reject(new Error(chunk.toString("utf8")));
    });
  });

  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        clientInfo: {
          name: "codex-test",
          version: "1.0.0"
        }
      }
    })}\n`
  );

  await linePromise;
  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized"
    })}\n`
  );

  child.kill("SIGTERM");

  assert.equal(lines.length, 1);
  const response = JSON.parse(lines[0]);
  assert.equal(response.result.serverInfo.name, "laive-mcp");
  assert.equal(response.result.protocolVersion, "2024-11-05");
});

test("mcp cli writes structured logs to the configured log directory", async () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "laive-logs-"));
  const child = spawn("node", [cliPath, "--fixture"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      LAIVE_LOG_DIR: logDir
    }
  });

  const responsePromise = new Promise((resolve, reject) => {
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (!buffer.includes("\n")) {
        return;
      }
      const [line] = buffer.split("\n");
      resolve(JSON.parse(line));
    });
    child.once("error", reject);
    child.stderr.on("data", (chunk) => {
      reject(new Error(chunk.toString("utf8")));
    });
  });

  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list"
    })}\n`
  );

  const response = await responsePromise;
  assert.equal(response.result.server.name, "laive-mcp");

  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));

  const logPath = path.join(logDir, "mcp-server.jsonl");
  assert.equal(fs.existsSync(logPath), true);
  const contents = fs.readFileSync(logPath, "utf8");
  assert.match(contents, /mcp_cli.starting/);
  assert.match(contents, /mcp.tools_list/);
});
