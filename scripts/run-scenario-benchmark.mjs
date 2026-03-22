import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function usage() {
  console.error(
    "Usage: node ./scripts/run-scenario-benchmark.mjs <scenario.json> [results.json]"
  );
}

const scenarioPath = process.argv[2];
const resultsPath = process.argv[3];

if (!scenarioPath) {
  usage();
  process.exitCode = 1;
} else {
  const scenario = JSON.parse(
    await readFile(path.resolve(scenarioPath), "utf8")
  );

  const results = resultsPath
    ? JSON.parse(await readFile(path.resolve(resultsPath), "utf8"))
    : null;

  const output = {
    scenario: {
      id: scenario.id,
      name: scenario.name,
      description: scenario.description,
      risk_class: scenario.risk_class,
      total_steps: scenario.steps.length
    },
    steps: scenario.steps.map((step, index) => ({
      index,
      tool: step.tool,
      expected: step.expect ?? {}
    }))
  };

  if (results) {
    output.results = {
      total_results: results.steps?.length ?? 0,
      matched_step_count: compareScenarioResults(scenario, results)
    };
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function compareScenarioResults(scenario, results) {
  const resultSteps = results.steps ?? [];
  let matched = 0;

  for (let index = 0; index < scenario.steps.length; index += 1) {
    if (resultSteps[index]?.tool === scenario.steps[index]?.tool) {
      matched += 1;
    }
  }

  return matched;
}
