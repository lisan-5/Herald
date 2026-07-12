import fp from "fastify-plugin";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import Redis from "ioredis";
import pg from "pg";
import type { Config } from "../../config.js";
import * as schema from "../../db/schema.js";

declare module "fastify" {
  interface FastifyInstance {
    config: Config;
    pgPool: pg.Pool;
    pg: NodePgDatabase<typeof schema>;
    redis: Redis;
  }
}

export const dependenciesPlugin = fp<{ config: Config }>(async (app, { config }) => {
  const pgPool = new pg.Pool({ connectionString: config.DATABASE_URL });
  const db = drizzle(pgPool, { schema });
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null
  });

  app.decorate("config", config);
  app.decorate("pgPool", pgPool);
  app.decorate("pg", db);
  app.decorate("redis", redis);

  app.addHook("onClose", async () => {
    await redis.quit();
    await pgPool.end();
  });
});
