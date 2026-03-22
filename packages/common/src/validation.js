import {
  EVENT_TOPICS,
  MESSAGE_TYPES,
  REQUEST_OPERATIONS
} from "./protocol.js";

export class ProtocolValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "ProtocolValidationError";
    this.issues = issues;
  }
}

export function isPlainObject(value) {
  return Boolean(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function validateProtocolMessage(message) {
  const issues = [];

  if (!isPlainObject(message)) {
    issues.push("message must be a plain object");
    return { valid: false, issues };
  }

  if (!Object.values(MESSAGE_TYPES).includes(message.type)) {
    issues.push(`type must be one of: ${Object.values(MESSAGE_TYPES).join(", ")}`);
    return { valid: false, issues };
  }

  if (message.type === MESSAGE_TYPES.request) {
    validateRequest(message, issues);
  } else if (message.type === MESSAGE_TYPES.response) {
    validateResponse(message, issues);
  } else if (message.type === MESSAGE_TYPES.event) {
    validateEvent(message, issues);
  }

  return { valid: issues.length === 0, issues };
}

function validateRequest(message, issues) {
  if (!isNonEmptyString(message.request_id)) {
    issues.push("request_id must be a non-empty string");
  }
  if (!isIsoDate(message.timestamp)) {
    issues.push("timestamp must be an ISO-8601 string");
  }
  if (!isNonEmptyString(message.client_id)) {
    issues.push("client_id must be a non-empty string");
  }
  if (!REQUEST_OPERATIONS.includes(message.operation)) {
    issues.push(`operation must be one of: ${REQUEST_OPERATIONS.join(", ")}`);
  }
  if (!(message.target === null || typeof message.target === "string")) {
    issues.push("target must be a string or null");
  }
  if (!isPlainObject(message.arguments)) {
    issues.push("arguments must be a plain object");
  }
  if (typeof message.dry_run !== "boolean") {
    issues.push("dry_run must be a boolean");
  }
}

function validateResponse(message, issues) {
  if (!isNonEmptyString(message.request_id)) {
    issues.push("request_id must be a non-empty string");
  }
  if (!isIsoDate(message.timestamp)) {
    issues.push("timestamp must be an ISO-8601 string");
  }
  if (typeof message.ok !== "boolean") {
    issues.push("ok must be a boolean");
  }
  if (!(message.error_code === null || typeof message.error_code === "string")) {
    issues.push("error_code must be a string or null");
  }
  if (
    !(message.error_message === null || typeof message.error_message === "string")
  ) {
    issues.push("error_message must be a string or null");
  }
}

function validateEvent(message, issues) {
  if (!EVENT_TOPICS.includes(message.topic)) {
    issues.push(`topic must be one of: ${EVENT_TOPICS.join(", ")}`);
  }
  if (!isPlainObject(message.payload)) {
    issues.push("payload must be a plain object");
  }
  if (!isIsoDate(message.timestamp)) {
    issues.push("timestamp must be an ISO-8601 string");
  }
}

export function assertValidProtocolMessage(message) {
  const validation = validateProtocolMessage(message);

  if (!validation.valid) {
    throw new ProtocolValidationError(
      "Protocol message failed validation",
      validation.issues
    );
  }

  return message;
}

function isIsoDate(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
