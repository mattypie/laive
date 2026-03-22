#!/usr/bin/env node

import process from "node:process";

import { BridgeServer } from "../bridge/server.js";
import {
  FixtureLiveRuntime,
  resolveFixturePath
} from "../runtime/fixture-runtime.js";

const args = parseArgs(process.argv.slice(2));
const runtime = await FixtureLiveRuntime.fromFixture(resolveFixturePath(args.fixture));
const server = new BridgeServer({
  runtime,
  host: args.host,
  port: args.port
});

const address = await server.start();
console.log(JSON.stringify({ status: "listening", ...address, fixture: args.fixture ?? "default" }));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await server.stop();
    process.exit(0);
  });
}

function parseArgs(argv) {
  const options = {
    host: "127.0.0.1",
    port: 7612,
    fixture: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--host") {
      options.host = argv[index + 1];
      index += 1;
    } else if (token === "--port") {
      options.port = Number(argv[index + 1]);
      index += 1;
    } else if (token === "--fixture") {
      options.fixture = argv[index + 1];
      index += 1;
    }
  }

  return options;
}
