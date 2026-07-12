import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DELIVERY_CONCURRENCY: z.coerce.number().int().positive().default(25),
  DELIVERY_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  MAX_ATTEMPTS: z.coerce.number().int().min(1).max(25).default(7),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse(env);
}
