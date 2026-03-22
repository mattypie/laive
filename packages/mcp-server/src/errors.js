export class McpServerError extends Error {
  constructor(code, message, data = {}) {
    super(message);
    this.name = "McpServerError";
    this.code = code;
    this.data = data;
  }
}

export function toErrorShape(error) {
  if (error instanceof McpServerError) {
    return {
      code: error.code,
      message: error.message,
      data: error.data
    };
  }

  return {
    code: "internal_error",
    message: error instanceof Error ? error.message : String(error),
    data: {}
  };
}
