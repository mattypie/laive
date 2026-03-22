#!/usr/bin/env node
import { stageSidecarProject } from "./project.js";

const result = await stageSidecarProject();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
