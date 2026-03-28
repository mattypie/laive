import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_LOG_DIR = path.join(".local", "share", "laive", "logs");

export function resolveLaiveLogDir({ env = process.env, homeDirectory = os.homedir() } = {}) {
  const override = env.LAIVE_LOG_DIR;
  if (typeof override === "string" && override.trim().length > 0) {
    return override;
  }

  return path.join(homeDirectory, DEFAULT_LOG_DIR);
}

export function createStructuredLogger({
  component,
  fileName = `${component}.jsonl`,
  logDir = resolveLaiveLogDir(),
  now = () => new Date(),
  pid = process.pid
} = {}) {
  let initialized = false;
  let disabled = false;
  const destination = path.join(logDir, fileName);

  function ensureReady() {
    if (initialized || disabled) {
      return;
    }

    try {
      fs.mkdirSync(logDir, { recursive: true });
      initialized = true;
    } catch {
      disabled = true;
    }
  }

  function write(level, message, data) {
    ensureReady();
    if (disabled) {
      return;
    }

    const entry = {
      timestamp: now().toISOString(),
      level,
      component,
      pid,
      message
    };

    if (data !== undefined) {
      entry.data = normalizeData(data);
    }

    try {
      fs.appendFileSync(destination, `${JSON.stringify(entry)}\n`, "utf8");
    } catch {
      disabled = true;
    }
  }

  return {
    component,
    destination,
    child(childComponent, options = {}) {
      return createStructuredLogger({
        component: `${component}:${childComponent}`,
        fileName: options.fileName ?? fileName,
        logDir: options.logDir ?? logDir,
        now: options.now ?? now,
        pid: options.pid ?? pid
      });
    },
    debug(message, data) {
      write("debug", message, data);
    },
    info(message, data) {
      write("info", message, data);
    },
    warn(message, data) {
      write("warn", message, data);
    },
    error(message, data) {
      write("error", message, data);
    }
  };
}

function normalizeData(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeData(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeData(entry)])
  );
}
