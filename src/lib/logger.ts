import pino from "pino";
import type { Config } from "../config.js";

export function createLogger(config: Pick<Config, "LOG_LEVEL" | "NODE_ENV">) {
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: ["req.headers.authorization", "headers.authorization", "endpoint.secret", "secret"],
      remove: true
    },
    transport:
      config.NODE_ENV === "development"
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard"
            }
          }
        : undefined
  });
}
