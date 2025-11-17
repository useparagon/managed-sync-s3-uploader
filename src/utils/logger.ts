import pino from "pino";

export enum LogCategory {
  API = "API",
  SYNC = "SYNC",
  WEBHOOK = "WEBHOOK",
  PROXY = "PROXY",
  STORAGE = "STORAGE",
  AUTH = "AUTH",
  SERVER = "SERVER",
  RETRY = "RETRY",
}

const getLogLevel = (): pino.Level => {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel === "debug" || envLevel === "trace") return "debug";
  if (envLevel === "info") return "info";
  if (envLevel === "warn") return "warn";
  if (envLevel === "error") return "error";
  if (envLevel === "fatal") return "fatal";
  return "info";
};

const getEnabledCategories = (): Set<LogCategory> => {
  const enabledCategories = process.env.LOG_CATEGORIES?.split(",") || [];
  if (enabledCategories.length === 0) {
    return new Set(Object.values(LogCategory));
  }
  return new Set(
    enabledCategories.map((c) => c.trim().toUpperCase() as LogCategory)
  );
};

const enabledCategories = getEnabledCategories();

const baseLogger = pino({
  level: getLogLevel(),
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname,category",
          },
        }
      : undefined,
});

class Logger {
  private shouldLog(category: LogCategory): boolean {
    return enabledCategories.has(category);
  }

  private formatMessage(category: LogCategory, message: string): string {
    return `[${category}] ${message}`;
  }

  debug(category: LogCategory, message: string, data?: any): void {
    if (!this.shouldLog(category)) {
      return;
    }

    const formattedMessage = this.formatMessage(category, message);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      baseLogger.debug(data, formattedMessage);
    } else if (data !== undefined) {
      baseLogger.debug({ data }, formattedMessage);
    } else {
      baseLogger.debug(formattedMessage);
    }
  }

  info(category: LogCategory, message: string, data?: any): void {
    if (!this.shouldLog(category)) {
      return;
    }

    const formattedMessage = this.formatMessage(category, message);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      baseLogger.info(data, formattedMessage);
    } else if (data !== undefined) {
      baseLogger.info({ data }, formattedMessage);
    } else {
      baseLogger.info(formattedMessage);
    }
  }

  warn(category: LogCategory, message: string, data?: any): void {
    if (!this.shouldLog(category)) {
      return;
    }

    const formattedMessage = this.formatMessage(category, message);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      baseLogger.warn(data, formattedMessage);
    } else if (data !== undefined) {
      baseLogger.warn({ data }, formattedMessage);
    } else {
      baseLogger.warn(formattedMessage);
    }
  }

  error(category: LogCategory, message: string, data?: any): void {
    if (!this.shouldLog(category)) {
      return;
    }

    const formattedMessage = this.formatMessage(category, message);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      baseLogger.error(data, formattedMessage);
    } else if (data !== undefined) {
      baseLogger.error({ data }, formattedMessage);
    } else {
      baseLogger.error(formattedMessage);
    }
  }
}

export const logger = new Logger();
