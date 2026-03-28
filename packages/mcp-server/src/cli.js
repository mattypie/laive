#!/usr/bin/env node
import readline from "node:readline";
import process from "node:process";

import { createStructuredLogger, resolveLaiveLogDir } from "../../common/src/index.js";
import { LaiveMcpServer } from "./server.js";
import {
  createIntegrationStatusAdapter,
  createSidecarAdapter,
  createUiAutomationAdapter
} from "./optional-adapters.js";
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

async function createSession(options, logger) {
  if (options.fixture) {
    return LaiveFixtureSession.create();
  }

  return LaiveBridgeSession.createLazy({
    host: options.host,
    port: options.port,
    logger: logger?.child("session", {
      fileName: "bridge-client.jsonl"
    })
  });
}

async function main() {
  const options = parseArgs();
  const logger = createStructuredLogger({
    component: "mcp-server",
    fileName: "mcp-server.jsonl"
  });
  logger.info("mcp_cli.starting", {
    options,
    logDir: resolveLaiveLogDir()
  });
  const session = await createSession(options, logger);
  const stateAdapter = createStateAdapter(session);
  const bridgeAdapter = createBridgeAdapter(session);
  const uiAutomationAdapter = createUiAutomationAdapter();
  const sidecarAdapter = createSidecarAdapter({
    stateAdapter,
    bridgeAdapter,
    uiAutomationAdapter
  });
  const server = new LaiveMcpServer({
    stateAdapter,
    bridgeAdapter,
    sidecarAdapter,
    uiAutomationAdapter,
    integrationStatusAdapter: createIntegrationStatusAdapter({
      sidecarAdapter,
      uiAutomationAdapter
    }),
    policyAdapter: createAllowAllPolicyAdapter(),
    logger
  });
  let lineReader = null;

  const shutdown = async () => {
    logger.info("mcp_cli.shutdown_requested");
    lineReader?.close();
    await session.close();
  };

  process.on("unhandledRejection", (error) => {
    logger.error("mcp_cli.unhandled_rejection", error);
  });

  process.on("uncaughtException", (error) => {
    logger.error("mcp_cli.uncaught_exception", error);
  });

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
      logger.warn("mcp_cli.invalid_json", {
        line: trimmed,
        error
      });
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
    if (response) {
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  }

  logger.info("mcp_cli.stdin_closed");
  await session.close();
}

main().catch((error) => {
  const logger = createStructuredLogger({
    component: "mcp-server",
    fileName: "mcp-server.jsonl"
  });
  logger.error("mcp_cli.fatal", error);
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
