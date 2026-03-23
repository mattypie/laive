import { ToolRegistry } from "./tool-registry.js";
import { buildDefaultTools } from "./default-tools.js";
import { McpServerError, toErrorShape } from "./errors.js";
import { getRootPackageVersion } from "./package-version.js";
import {
  createIntegrationStatusAdapter,
  createSidecarAdapter,
  createUiAutomationAdapter
} from "./optional-adapters.js";

export class LaiveMcpServer {
  constructor({
    stateAdapter,
    bridgeAdapter,
    policyAdapter,
    sidecarAdapter,
    uiAutomationAdapter,
    integrationStatusAdapter,
    serverInfo
    } = {}) {
    this.serverInfo = serverInfo ?? {
      name: "laive-mcp",
      version: getRootPackageVersion()
    };
    this.stateAdapter = stateAdapter ?? createUnsupportedAdapter("state");
    this.bridgeAdapter = bridgeAdapter ?? createUnsupportedAdapter("bridge");
    this.uiAutomationAdapter = uiAutomationAdapter ?? createUiAutomationAdapter();
    this.sidecarAdapter =
      sidecarAdapter ??
      createSidecarAdapter({
        stateAdapter: this.stateAdapter,
        bridgeAdapter: this.bridgeAdapter,
        uiAutomationAdapter: this.uiAutomationAdapter
      });
    this.integrationStatusAdapter =
      integrationStatusAdapter ??
      createIntegrationStatusAdapter({
        sidecarAdapter: this.sidecarAdapter,
        uiAutomationAdapter: this.uiAutomationAdapter
      });
    this.policyAdapter = policyAdapter ?? {
      async assertAllowed() {
        return true;
      }
    };
    this.tools = new ToolRegistry();

    for (const tool of buildDefaultTools({
      stateAdapter: this.stateAdapter,
      bridgeAdapter: this.bridgeAdapter,
      policyAdapter: this.policyAdapter,
      sidecarAdapter: this.sidecarAdapter,
      uiAutomationAdapter: this.uiAutomationAdapter,
      integrationStatusAdapter: this.integrationStatusAdapter
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

    if (message.method === "initialize") {
      const requestedProtocolVersion =
        typeof message.params?.protocolVersion === "string"
          ? message.params.protocolVersion
          : null;

      return {
        jsonrpc: "2.0",
        id: message.id ?? null,
        result: {
          protocolVersion: requestedProtocolVersion ?? "2024-11-05",
          capabilities: {
            tools: {
              listChanged: false
            }
          },
          serverInfo: this.serverInfo
        }
      };
    }

    if (message.method === "ping") {
      return {
        jsonrpc: "2.0",
        id: message.id ?? null,
        result: {}
      };
    }

    if (typeof message.method === "string" && message.method.startsWith("notifications/")) {
      return null;
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
      try {
        const result = await this.invokeTool(params.name, params.arguments ?? {}, {
          requestId: message.id ?? null
        });

        return {
          jsonrpc: "2.0",
          id: message.id ?? null,
          result: toToolResult(result)
        };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id: message.id ?? null,
          result: toToolErrorResult(error)
        };
      }
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

function toToolResult(result) {
  return {
    content: [
      {
        type: "text",
        text:
          typeof result?.summary === "string" && result.summary.length > 0
            ? result.summary
            : JSON.stringify(result, null, 2)
      }
    ],
    structuredContent: result,
    isError: false
  };
}

function toToolErrorResult(error) {
  const shape = toErrorShape(error);
  return {
    content: [
      {
        type: "text",
        text: shape.message
      }
    ],
    structuredContent: {
      error: shape
    },
    isError: true
  };
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
