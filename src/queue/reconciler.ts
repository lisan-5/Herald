import { pathToFileURL } from "node:url";
import { and, asc, inArray, lte } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import Redis from "ioredis";
import pg from "pg";
import { loadConfig } from "../config.js";
import * as schema from "../db/schema.js";
import { deliveries } from "../db/schema.js";
import { createDeliveryQueue, enqueueDelivery } from "./queues.js";

type Database = NodePgDatabase<typeof schema>;
type DeliveryQueue = ReturnType<typeof createDeliveryQueue>;

export async function reconcileDeliveries(params: {
  db: Database;
  queue: DeliveryQueue;
  staleBefore?: Date;
  limit?: number;
}) {
  const staleBefore = params.staleBefore ?? new Date(Date.now() - 90_000);
  const limit = params.limit ?? 100;

  const staleDeliveries = await params.db
    .select({
      id: deliveries.id,
      attemptCount: deliveries.attemptCount
    })
    .from(deliveries)
    .where(
      and(
        inArray(deliveries.status, ["pending", "failed"]),
        lte(deliveries.nextAttemptAt, staleBefore)
      )
    )
    .orderBy(asc(deliveries.nextAttemptAt))
    .limit(limit);

  await Promise.all(
    staleDeliveries.map((delivery) =>
      enqueueDelivery(params.queue, {
        deliveryId: delivery.id,
        attemptNo: delivery.attemptCount + 1
      })
    )
  );

  return staleDeliveries.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = createDeliveryQueue(redis);

  const run = async () => {
    const count = await reconcileDeliveries({ db, queue });
    if (count > 0) {
      console.log(`Reconciler re-enqueued ${count} stale deliveries`);
    }
  };

  const interval = setInterval(() => {
    run().catch((error: unknown) => {
      console.error(error);
    });
  }, 60_000);

  run().catch((error: unknown) => {
    console.error(error);
  });

  const shutdown = async () => {
    clearInterval(interval);
    await queue.close();
    await redis.quit();
    await pool.end();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
