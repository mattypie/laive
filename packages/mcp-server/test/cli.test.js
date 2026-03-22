import test from "node:test";
import assert from "node:assert/strict";
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
  child.stdout.on("data", (chunk) => {
    lines.push(
      ...chunk
        .toString("utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    );
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

  await new Promise((resolve) => setTimeout(resolve, 50));
  child.stdin.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized"
    })}\n`
  );

  await new Promise((resolve) => setTimeout(resolve, 50));
  child.kill("SIGTERM");

  assert.equal(lines.length, 1);
  const response = JSON.parse(lines[0]);
  assert.equal(response.result.serverInfo.name, "laive-mcp");
  assert.equal(response.result.protocolVersion, "2024-11-05");
});
