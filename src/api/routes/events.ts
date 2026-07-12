import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { matchesAnyEventType } from "../../core/event-types.js";
import { deliveries, endpoints, events } from "../../db/schema.js";
import { enqueueDelivery } from "../../queue/queues.js";

const publishBodySchema = z.object({
  event_type: z.string().min(1).max(200),
  payload: z.record(z.unknown())
});

const publishResponseSchema = z.object({
  event_id: z.string().uuid(),
  deliveries_created: z.number().int().nonnegative()
});

export const eventRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/events",
    {
      preHandler: app.authenticate,
      schema: {
        tags: ["events"],
        headers: z.object({
          "idempotency-key": z.string().max(200).optional()
        }),
        body: publishBodySchema,
        response: {
          200: publishResponseSchema,
          202: publishResponseSchema
        }
      }
    },
    async (request, reply) => {
      const idempotencyKey = request.headers["idempotency-key"];

      if (idempotencyKey) {
        const [existing] = await app.pg
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.tenantId, request.tenant.id),
              eq(events.idempotencyKey, idempotencyKey)
            )
          )
          .limit(1);

        if (existing) {
          reply.header("Idempotent-Replay", "true");
          return reply.code(200).send({
            event_id: existing.id,
            deliveries_created: 0
          });
        }
      }

      const result = await app.pg.transaction(async (tx) => {
        const [event] = await tx
          .insert(events)
          .values({
            tenantId: request.tenant.id,
            eventType: request.body.event_type,
            payload: request.body.payload,
            idempotencyKey
          })
          .returning();

        if (!event) {
          throw app.httpErrors.internalServerError("Event was not created");
        }

        const subscribedEndpoints = await tx
          .select()
          .from(endpoints)
          .where(and(eq(endpoints.tenantId, request.tenant.id), eq(endpoints.status, "active")));

        const matchingEndpoints = subscribedEndpoints.filter((endpoint) =>
          matchesAnyEventType(endpoint.eventTypes, request.body.event_type)
        );

        const insertedDeliveries =
          matchingEndpoints.length > 0
            ? await tx
                .insert(deliveries)
                .values(
                  matchingEndpoints.map((endpoint) => ({
                    eventId: event.id,
                    endpointId: endpoint.id,
                    status: "pending",
                    nextAttemptAt: new Date()
                  }))
              )
              .returning({ id: deliveries.id })
            : [];

        return {
          eventId: event.id,
          deliveriesCreated: matchingEndpoints.length,
          deliveryIds: insertedDeliveries.map((delivery) => delivery.id)
        };
      });

      await Promise.all(
        result.deliveryIds.map((deliveryId) =>
          enqueueDelivery(app.deliveryQueue, { deliveryId, attemptNo: 1 })
        )
      );

      app.metrics.eventsIngested.inc({ event_type: request.body.event_type });
      app.metrics.deliveriesTotal.inc({ status: "pending" }, result.deliveriesCreated);

      return reply.code(202).send({
        event_id: result.eventId,
        deliveries_created: result.deliveriesCreated
      });
    }
  );
};
