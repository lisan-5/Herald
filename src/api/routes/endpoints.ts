import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { generateEndpointSecret } from "../../core/api-key.js";
import { endpoints } from "../../db/schema.js";

const endpointResponseSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  description: z.string().nullable(),
  event_types: z.array(z.string()),
  rate_limit_per_sec: z.number().int(),
  status: z.string(),
  secret: z.string().optional(),
  created_at: z.date()
});

const createEndpointBodySchema = z.object({
  url: z.string().url(),
  description: z.string().max(500).optional(),
  event_types: z.array(z.string().min(1)).min(1),
  rate_limit_per_sec: z.number().int().positive().max(1000).default(10)
});

export const endpointRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/endpoints",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["endpoints"],
        response: {
          200: z.object({
            endpoints: z.array(endpointResponseSchema.omit({ secret: true }))
          })
        }
      }
    },
    async (request) => {
      const rows = await app.pg
        .select()
        .from(endpoints)
        .where(eq(endpoints.tenantId, request.tenant.id))
        .orderBy(desc(endpoints.createdAt))
        .limit(100);

      return {
        endpoints: rows.map(formatEndpoint)
      };
    }
  );

  app.post(
    "/endpoints",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["endpoints"],
        body: createEndpointBodySchema,
        response: {
          201: endpointResponseSchema
        }
      }
    },
    async (request, reply) => {
      const secret = generateEndpointSecret();
      const [endpoint] = await app.pg
        .insert(endpoints)
        .values({
          tenantId: request.tenant.id,
          url: request.body.url,
          description: request.body.description,
          secret,
          eventTypes: request.body.event_types,
          rateLimitPerSec: request.body.rate_limit_per_sec,
          status: "active"
        })
        .returning();

      if (!endpoint) {
        throw app.httpErrors.internalServerError("Endpoint was not created");
      }

      return reply.code(201).send({
        ...formatEndpoint(endpoint),
        secret
      });
    }
  );

  app.get(
    "/endpoints/:id",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["endpoints"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: endpointResponseSchema.omit({ secret: true })
        }
      }
    },
    async (request) => {
      const [endpoint] = await app.pg
        .select()
        .from(endpoints)
        .where(and(eq(endpoints.id, request.params.id), eq(endpoints.tenantId, request.tenant.id)))
        .limit(1);

      if (!endpoint) {
        throw app.httpErrors.notFound("Endpoint not found");
      }

      return formatEndpoint(endpoint);
    }
  );
};

function formatEndpoint(endpoint: typeof endpoints.$inferSelect) {
  return {
    id: endpoint.id,
    url: endpoint.url,
    description: endpoint.description,
    event_types: endpoint.eventTypes,
    rate_limit_per_sec: endpoint.rateLimitPerSec,
    status: endpoint.status,
    created_at: endpoint.createdAt
  };
}
