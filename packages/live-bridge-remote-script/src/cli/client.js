#!/usr/bin/env node

import process from "node:process";

import { BridgeClient } from "../bridge/client.js";

const args = parseArgs(process.argv.slice(2));
const client = new BridgeClient({
  host: args.host,
  port: args.port,
  clientId: "laive-cli"
});

await client.connect();

if (args.command === "subscribe") {
  client.on("event", (event) => {
    console.log(JSON.stringify(event));
  });
  const response = await client.subscribe(args.target);
  console.log(JSON.stringify(response));
  setTimeout(async () => {
    await client.unsubscribe(args.target);
    await client.disconnect();
  }, args.durationMs);
} else {
  const response = await client.request(
    args.command,
    args.target,
    args.arguments,
    { dryRun: args.dryRun }
  );
  console.log(JSON.stringify(response));
  await client.disconnect();
}

function parseArgs(argv) {
  const options = {
    host: "127.0.0.1",
    port: 7612,
    dryRun: false,
    command: "hello",
    target: null,
    arguments: {},
    durationMs: 2000
  };

  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--host") {
      options.host = argv[index + 1];
      index += 1;
    } else if (token === "--port") {
      options.port = Number(argv[index + 1]);
      index += 1;
    } else if (token === "--args") {
      options.arguments = JSON.parse(argv[index + 1] ?? "{}");
      index += 1;
    } else if (token === "--dry-run") {
      options.dryRun = true;
    } else if (token === "--duration-ms") {
      options.durationMs = Number(argv[index + 1]);
      index += 1;
    } else {
      positional.push(token);
    }
  }

  options.command = positional[0] ?? options.command;
  options.target = positional[1] ?? options.target;

  return options;
}
