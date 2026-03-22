#!/usr/bin/env node
import process from "node:process";

import { installPrebuiltSidecarDevice } from "./index.js";

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");
const overwrite = args.includes("--overwrite");

const result = await installPrebuiltSidecarDevice({
  dryRun,
  overwrite
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
