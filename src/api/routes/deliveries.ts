import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { deliveries, deliveryAttempts, endpoints, events } from "../../db/schema.js";
import { enqueueDelivery } from "../../queue/queues.js";

type DeliverySummaryRow = {
  id: string;
  eventId: string;
  endpointId: string;
  eventType: string;
  status: string;
  attemptCount: number;
  nextAttemptAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const deliverySummarySchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  endpoint_id: z.string().uuid(),
  event_type: z.string(),
  status: z.string(),
  attempt_count: z.number().int(),
  next_attempt_at: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date()
});

const deliveryAttemptSchema = z.object({
  id: z.string().uuid(),
  attempt_no: z.number().int(),
  response_status: z.number().int().nullable(),
  response_body: z.string().nullable(),
  latency_ms: z.number().int(),
  error: z.string().nullable(),
  attempted_at: z.date()
});

export const deliveryRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/deliveries",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["deliveries"],
        querystring: z.object({
          status: z.string().optional(),
          endpoint_id: z.string().uuid().optional(),
          cursor: z.string().datetime().optional(),
          limit: z.coerce.number().int().positive().max(100).default(25)
        }),
        response: {
          200: z.object({
            deliveries: z.array(deliverySummarySchema),
            next_cursor: z.string().nullable()
          })
        }
      }
    },
    async (request) => {
      const limit = request.query.limit;
      const conditions: SQL[] = [eq(events.tenantId, request.tenant.id)];

      if (request.query.status) {
        conditions.push(eq(deliveries.status, request.query.status));
      }

      if (request.query.endpoint_id) {
        conditions.push(eq(deliveries.endpointId, request.query.endpoint_id));
      }

      if (request.query.cursor) {
        conditions.push(lt(deliveries.createdAt, new Date(request.query.cursor)));
      }

      const rows = await app.pg
        .select({
          id: deliveries.id,
          eventId: deliveries.eventId,
          endpointId: deliveries.endpointId,
          eventType: events.eventType,
          status: deliveries.status,
          attemptCount: deliveries.attemptCount,
          nextAttemptAt: deliveries.nextAttemptAt,
          createdAt: deliveries.createdAt,
          updatedAt: deliveries.updatedAt
        })
        .from(deliveries)
        .innerJoin(events, eq(deliveries.eventId, events.id))
        .where(and(...conditions))
        .orderBy(desc(deliveries.createdAt))
        .limit(limit + 1);

      const page = rows.slice(0, limit);
      const next = rows.length > limit ? page.at(-1)?.createdAt.toISOString() : null;

      return {
        deliveries: page.map(formatDeliverySummary),
        next_cursor: next ?? null
      };
    }
  );

  app.get(
    "/deliveries/:id",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["deliveries"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: deliverySummarySchema.extend({
            attempts: z.array(deliveryAttemptSchema)
          })
        }
      }
    },
    async (request) => {
      const delivery = await findTenantDelivery(app, request.tenant.id, request.params.id);

      if (!delivery) {
        throw app.httpErrors.notFound("Delivery not found");
      }

      const attempts = await app.pg
        .select()
        .from(deliveryAttempts)
        .where(eq(deliveryAttempts.deliveryId, delivery.id))
        .orderBy(desc(deliveryAttempts.attemptedAt));

      return {
        ...formatDeliverySummary(delivery),
        attempts: attempts.map((attempt) => ({
          id: attempt.id,
          attempt_no: attempt.attemptNo,
          response_status: attempt.responseStatus,
          response_body: attempt.responseBody,
          latency_ms: attempt.latencyMs,
          error: attempt.error,
          attempted_at: attempt.attemptedAt
        }))
      };
    }
  );

  app.post(
    "/deliveries/:id/replay",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["deliveries"],
        params: z.object({ id: z.string().uuid() }),
        response: {
          202: z.object({
            delivery_id: z.string().uuid(),
            replayed_from: z.string().uuid()
          })
        }
      }
    },
    async (request, reply) => {
      const delivery = await findTenantDelivery(app, request.tenant.id, request.params.id);

      if (!delivery) {
        throw app.httpErrors.notFound("Delivery not found");
      }

      const [replay] = await app.pg
        .insert(deliveries)
        .values({
          eventId: delivery.eventId,
          endpointId: delivery.endpointId,
          status: "pending",
          nextAttemptAt: new Date()
        })
        .returning({ id: deliveries.id });

      if (!replay) {
        throw app.httpErrors.internalServerError("Replay delivery was not created");
      }

      await enqueueDelivery(app.deliveryQueue, { deliveryId: replay.id, attemptNo: 1 });

      return reply.code(202).send({
        delivery_id: replay.id,
        replayed_from: delivery.id
      });
    }
  );
};

async function findTenantDelivery(
  app: Parameters<FastifyPluginAsyncZod>[0],
  tenantId: string,
  deliveryId: string
) {
  const [delivery] = await app.pg
    .select({
      id: deliveries.id,
      eventId: deliveries.eventId,
      endpointId: deliveries.endpointId,
      eventType: events.eventType,
      status: deliveries.status,
      attemptCount: deliveries.attemptCount,
      nextAttemptAt: deliveries.nextAttemptAt,
      createdAt: deliveries.createdAt,
      updatedAt: deliveries.updatedAt
    })
    .from(deliveries)
    .innerJoin(events, eq(deliveries.eventId, events.id))
    .innerJoin(endpoints, eq(deliveries.endpointId, endpoints.id))
    .where(and(eq(deliveries.id, deliveryId), eq(events.tenantId, tenantId)))
    .limit(1);

  return delivery;
}

function formatDeliverySummary(delivery: DeliverySummaryRow) {
  return {
    id: delivery.id,
    event_id: delivery.eventId,
    endpoint_id: delivery.endpointId,
    event_type: delivery.eventType,
    status: delivery.status,
    attempt_count: delivery.attemptCount,
    next_attempt_at: delivery.nextAttemptAt,
    created_at: delivery.createdAt,
    updated_at: delivery.updatedAt
  };
}
