import { McpServerError } from "./errors.js";

export class ToolRegistry {
  #tools = new Map();

  register(tool) {
    if (!tool?.name || typeof tool.execute !== "function") {
      throw new TypeError("Tool must include a name and execute function");
    }

    if (this.#tools.has(tool.name)) {
      throw new McpServerError(
        "tool_conflict",
        `Tool already registered: ${tool.name}`
      );
    }

    this.#tools.set(tool.name, {
      description: tool.description ?? "",
      inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
      execute: tool.execute
    });
  }

  list() {
    return Array.from(this.#tools, ([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }

  async invoke(name, args, context) {
    const tool = this.#tools.get(name);
    if (!tool) {
      throw new McpServerError("unknown_tool", `Unknown tool: ${name}`);
    }

    return await tool.execute(args ?? {}, context);
  }
}
