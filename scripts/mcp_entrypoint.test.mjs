import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binPath = path.join(repoRoot, "bin", "laive.mjs");

test("root laive mcp command launches MCP server over stdio", async () => {
  const child = spawn("node", [binPath, "mcp", "--fixture"], {
    cwd: repoRoot,
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
  assert.ok(response.result.tools.some((tool) => tool.name === "set_tempo"));

  child.kill("SIGTERM");
});

test("root laive mcp command initializes without a live bridge connection", async () => {
  const child = spawn("node", [binPath, "mcp", "--host", "127.0.0.1", "--port", "9"], {
    cwd: repoRoot,
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

  const response = await responsePromise;
  assert.equal(response.result.serverInfo.name, "laive-mcp");
  assert.equal(response.result.protocolVersion, "2024-11-05");

  child.kill("SIGTERM");
});

test("root laive mcp command returns a structured tool error when the live bridge is unavailable", async () => {
  const child = spawn("node", [binPath, "mcp", "--host", "127.0.0.1", "--port", "9"], {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"]
  });

  const responsePromise = new Promise((resolve, reject) => {
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n").filter(Boolean);
      if (lines.length < 2) {
        return;
      }
      resolve(lines.map((line) => JSON.parse(line)));
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

  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "get_project_summary",
        arguments: {}
      }
    })}\n`
  );

  const [initializeResponse, toolResponse] = await responsePromise;
  assert.equal(initializeResponse.result.serverInfo.name, "laive-mcp");
  assert.equal(toolResponse.id, 2);
  assert.equal(typeof toolResponse.error.message, "string");

  child.kill("SIGTERM");
});

test("root laive mcp command resolves bridge-backed tools through the lazy session", async () => {
  const child = spawn("node", [binPath, "mcp", "--host", "127.0.0.1", "--port", "9"], {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"]
  });

  const responsePromise = new Promise((resolve, reject) => {
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n").filter(Boolean);
      if (lines.length < 2) {
        return;
      }
      resolve(lines.map((line) => JSON.parse(line)));
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

  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "get_capabilities",
        arguments: {}
      }
    })}\n`
  );

  const [initializeResponse, toolResponse] = await responsePromise;
  assert.equal(initializeResponse.result.serverInfo.name, "laive-mcp");
  assert.equal(toolResponse.id, 2);
  assert.equal(typeof toolResponse.error.message, "string");
  assert.equal(toolResponse.error.message.includes("ensureConnected"), false);

  child.kill("SIGTERM");
});
