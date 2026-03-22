#!/usr/bin/env node
import readline from "node:readline";
import process from "node:process";

import { LaiveMcpServer } from "./server.js";
import {
  LaiveBridgeSession,
  LaiveFixtureSession,
  createAllowAllPolicyAdapter,
  createBridgeAdapter,
  createStateAdapter
} from "./session.js";

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    host: process.env.LAIVE_BRIDGE_HOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.LAIVE_BRIDGE_PORT ?? "7612", 10),
    fixture: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--host") {
      options.host = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--port") {
      options.port = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === "--fixture") {
      options.fixture = true;
      continue;
    }
  }

  return options;
}

async function createSession(options) {
  if (options.fixture) {
    return LaiveFixtureSession.create();
  }

  return LaiveBridgeSession.connect({
    host: options.host,
    port: options.port
  });
}

async function main() {
  const options = parseArgs();
  const session = await createSession(options);
  const server = new LaiveMcpServer({
    stateAdapter: createStateAdapter(session),
    bridgeAdapter: createBridgeAdapter(session.bridgeClient),
      policyAdapter: createAllowAllPolicyAdapter()
  });
  let lineReader = null;

  const shutdown = async () => {
    lineReader?.close();
    await session.close();
  };

  process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });

  lineReader = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  for await (const line of lineReader) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: "invalid_json",
            message: error.message
          }
        })}\n`
      );
      continue;
    }

    const response = await server.safeHandleRpcMessage(message);
    process.stdout.write(`${JSON.stringify(response)}\n`);
  }

  await session.close();
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
