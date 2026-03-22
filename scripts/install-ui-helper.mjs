import process from "node:process";

import { installUiHelper } from "../packages/ui-automation/src/index.js";

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");
const overwrite = args.includes("--overwrite");

const result = await installUiHelper({
  dryRun,
  overwrite
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
