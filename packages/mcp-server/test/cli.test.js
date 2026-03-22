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
