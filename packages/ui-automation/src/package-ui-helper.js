#!/usr/bin/env node
import { stageUiHelper } from "./helper.js";

const result = await stageUiHelper();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
