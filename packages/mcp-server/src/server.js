import { ToolRegistry } from "./tool-registry.js";
import { buildDefaultTools } from "./default-tools.js";
import { McpServerError, toErrorShape } from "./errors.js";

export class LaiveMcpServer {
  constructor({ stateAdapter, bridgeAdapter, policyAdapter, serverInfo } = {}) {
    this.serverInfo = serverInfo ?? {
      name: "laive-mcp",
      version: "0.1.0"
    };
    this.stateAdapter = stateAdapter ?? createUnsupportedAdapter("state");
    this.bridgeAdapter = bridgeAdapter ?? createUnsupportedAdapter("bridge");
    this.policyAdapter = policyAdapter ?? {
      async assertAllowed() {
        return true;
      }
    };
    this.tools = new ToolRegistry();

    for (const tool of buildDefaultTools({
      stateAdapter: this.stateAdapter,
      bridgeAdapter: this.bridgeAdapter,
      policyAdapter: this.policyAdapter
    })) {
      this.tools.register(tool);
    }
  }

  listTools() {
    return this.tools.list();
  }

  async invokeTool(name, args = {}, context = {}) {
    return await this.tools.invoke(name, args, context);
  }

  async handleRpcMessage(message) {
    if (!message || typeof message !== "object") {
      throw new McpServerError("invalid_request", "Message must be an object");
    }

    if (message.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: message.id ?? null,
        result: {
          server: this.serverInfo,
          tools: this.listTools()
        }
      };
    }

    if (message.method === "tools/call") {
      const params = message.params ?? {};
      const result = await this.invokeTool(params.name, params.arguments ?? {}, {
        requestId: message.id ?? null
      });

      return {
        jsonrpc: "2.0",
        id: message.id ?? null,
        result
      };
    }

    throw new McpServerError("method_not_found", `Unsupported method: ${message.method}`);
  }

  async safeHandleRpcMessage(message) {
    try {
      return await this.handleRpcMessage(message);
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: message?.id ?? null,
        error: toErrorShape(error)
      };
    }
  }
}

function createUnsupportedAdapter(name) {
  return new Proxy(
    {},
    {
      get() {
        return async () => {
          throw new McpServerError(
            "adapter_unavailable",
            `${name} adapter is not configured`
          );
        };
      }
    }
  );
}
