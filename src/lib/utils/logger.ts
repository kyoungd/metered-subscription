/**
 * Structured Logger
 * 
 * Provides structured JSON logging with correlation ID support and PII redaction.
 * Includes orgId, request_id, and correlation_id in all log entries.
 * 
 * @module lib/utils/logger
 */

import { env } from "../env";
import { redactPII } from "./security/redaction";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  orgId?: string;
  request_id?: string;
  correlation_id?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

class Logger {
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = env.NODE_ENV === "development";
  }

  /**
   * Formats and outputs a log entry
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context && { context: redactPII(context) as LogContext }),
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case "debug":
        if (this.isDevelopment) {
          console.debug(output);
        }
        break;
      case "info":
        console.info(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "error":
        console.error(output);
        break;
    }
  }

  /**
   * Logs debug message (development only)
   */
  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  /**
   * Logs info message
   */
  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  /**
   * Logs warning message
   */
  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  /**
   * Logs error message
   */
  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }

  /**
   * Creates a child logger with preset context
   */
  child(context: LogContext): Logger {
    const childLogger = new Logger();
    const originalLog = childLogger.log.bind(childLogger);
    
    childLogger.log = (level: LogLevel, message: string, additionalContext?: LogContext) => {
      originalLog(level, message, { ...context, ...additionalContext });
    };
    
    return childLogger;
  }
}

export const logger = new Logger();

