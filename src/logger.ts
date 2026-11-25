/** Minimal structured logger mirroring Flask's `app.logger` usage. */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const threshold = LEVEL_ORDER[(process.env.LOG_LEVEL as Level | undefined) ?? "info"] ?? 20;

function log(level: Level, message: string, extra?: unknown): void {
  if (LEVEL_ORDER[level] < threshold) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  if (extra === undefined) {
    // eslint-disable-next-line no-console
    console[level === "error" ? "error" : "log"](line);
    return;
  }
  // eslint-disable-next-line no-console
  console[level === "error" ? "error" : "log"](line, extra);
}

export const logger = {
  debug(message: string, extra?: unknown): void {
    log("debug", message, extra);
  },
  info(message: string, extra?: unknown): void {
    log("info", message, extra);
  },
  warn(message: string, extra?: unknown): void {
    log("warn", message, extra);
  },
  error(message: string, extra?: unknown): void {
    log("error", message, extra);
  },
  /** Log with a full stack trace, mirroring `app.logger.exception`. */
  exception(message: string, exc: unknown): void {
    const error = exc instanceof Error ? exc : new Error(String(exc));
    log("error", `${message}: ${error.message}`, error.stack);
  },
};
