import fp from "fastify-plugin";
import { collectDefaultMetrics, Counter, Gauge, Registry } from "prom-client";

type HeraldMetrics = {
  registry: Registry;
  eventsIngested: Counter<"event_type">;
  deliveriesTotal: Counter<"status">;
  queueDepth: Gauge;
};

declare module "fastify" {
  interface FastifyInstance {
    metrics: HeraldMetrics;
  }
}

export const metricsPlugin = fp(async (app) => {
  const registry = new Registry();

  collectDefaultMetrics({ register: registry, prefix: "herald_process_" });

  const eventsIngested = new Counter({
    name: "herald_events_ingested_total",
    help: "Total events ingested by event type.",
    labelNames: ["event_type"],
    registers: [registry]
  });

  const deliveriesTotal = new Counter({
    name: "herald_deliveries_total",
    help: "Total deliveries created or completed by status.",
    labelNames: ["status"],
    registers: [registry]
  });

  const queueDepth = new Gauge({
    name: "herald_delivery_queue_depth",
    help: "Waiting and delayed jobs in the delivery queue.",
    registers: [registry],
    async collect() {
      const counts = await app.deliveryQueue.getJobCounts("waiting", "delayed");
      this.set((counts.waiting ?? 0) + (counts.delayed ?? 0));
    }
  });

  app.decorate("metrics", {
    registry,
    eventsIngested,
    deliveriesTotal,
    queueDepth
  });

  app.get("/metrics", async (_request, reply) => {
    reply.header("content-type", registry.contentType);
    return registry.metrics();
  });
});
