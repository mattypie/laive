import { createCapabilityMap, createSidecarEnvelope } from "./contracts.js";
import { getWorkflow, listWorkflows, materializeWorkflow } from "./workflows.js";

function defaultQueryHandlers() {
  return {
    async run(path) {
      return {
        path,
        status: "stub",
        value: null
      };
    }
  };
}

function defaultMutationHandlers() {
  return {
    async run(target, payload) {
      return {
        target,
        payload,
        status: "stub"
      };
    }
  };
}

function defaultObserverHandlers() {
  return {
    async run(target) {
      return {
        target,
        status: "stub"
      };
    }
  };
}

export function createSidecarRuntime({
  capabilities = {},
  handlers = {}
} = {}) {
  const capabilityMap = createCapabilityMap(capabilities);
  const query = handlers.query ?? defaultQueryHandlers();
  const mutation = handlers.mutation ?? defaultMutationHandlers();
  const observe = handlers.observe ?? defaultObserverHandlers();

  return {
    capabilities: capabilityMap,
    listWorkflows,
    async handleCommand(command, payload = {}) {
      switch (command) {
        case "hello":
          return createSidecarEnvelope("hello", {
            runtime: "laive-sidecar-runtime",
            version: "0.1.0"
          });
        case "capabilities":
          return createSidecarEnvelope("capabilities", capabilityMap);
        case "list_workflows":
          return createSidecarEnvelope("query", {
            workflows: listWorkflows()
          });
        case "materialize_workflow":
          return createSidecarEnvelope("query", {
            workflow: materializeWorkflow(payload.name, payload.parameters ?? {})
          });
        case "execute_workflow": {
          const workflow = materializeWorkflow(payload.name, payload.parameters ?? {});
          const results = [];

          for (const step of workflow.steps) {
            if (step.kind === "query") {
              results.push(await query.run(step.queryPath));
            } else if (step.kind === "mutation") {
              results.push(await mutation.run(step.target, step.payload));
            } else if (step.kind === "observe") {
              results.push(await observe.run(step.target));
            }
          }

          return createSidecarEnvelope("event", {
            workflow: payload.name,
            results
          });
        }
        default:
          return createSidecarEnvelope("error", {
            code: "unknown_command",
            message: `Unknown sidecar command: ${command}`
          });
      }
    },
    getWorkflow
  };
}
