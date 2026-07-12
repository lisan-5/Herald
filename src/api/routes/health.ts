import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { sql } from "drizzle-orm";
import { z } from "zod";

const healthResponseSchema = z.object({
  status: z.literal("ok")
});

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/health/live",
    {
      schema: {
        tags: ["health"],
        response: {
          200: healthResponseSchema
        }
      }
    },
    async () => ({ status: "ok" as const })
  );

  app.get(
    "/health/ready",
    {
      schema: {
        tags: ["health"],
        response: {
          200: healthResponseSchema
        }
      }
    },
    async () => {
      await app.pg.execute(sql`select 1`);
      await app.redis.ping();
      return { status: "ok" as const };
    }
  );
};
