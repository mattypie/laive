import { stageUiHelper } from "../packages/ui-automation/src/index.js";

const payload = await stageUiHelper();
process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
