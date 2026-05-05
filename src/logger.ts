// client/logger.ts

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function resolveLevel(): LogLevel {
  if (process.env.DEBUG === "1" || process.env.DEBUG === "true") return "debug";
  const envLevel = (process.env.LOG_LEVEL || "info").toLowerCase();
  if (envLevel in LEVEL_ORDER) return envLevel as LogLevel;
  return "info";
}

const currentLevel = resolveLevel();
const currentLevelNum = LEVEL_ORDER[currentLevel];

/**
 * Create a logger with a component prefix.
 * Controlled by LOG_LEVEL env (debug|info|warn|error) or DEBUG=1.
 * Output: [component] message {json data}
 */
export function createLogger(component: string): Logger {
  function log(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < currentLevelNum) return;
    const prefix = `[${component}]`;
    const suffix = data ? " " + JSON.stringify(data) : "";
    if (level === "error") {
      console.error(`${prefix} ERROR: ${msg}${suffix}`);
    } else if (level === "warn") {
      console.warn(`${prefix} WARN: ${msg}${suffix}`);
    } else {
      console.log(`${prefix} ${msg}${suffix}`);
    }
  }

  return {
    debug: (msg, data) => log("debug", msg, data),
    info: (msg, data) => log("info", msg, data),
    warn: (msg, data) => log("warn", msg, data),
    error: (msg, data) => log("error", msg, data),
  };
}
