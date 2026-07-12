import { Worker } from "bullmq";
import { pathToFileURL } from "node:url";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import Redis from "ioredis";
import pg from "pg";
import { loadConfig, type Config } from "../../config.js";
import { retryDelayMs } from "../../core/backoff.js";
import { buildSignatureHeader } from "../../core/signature.js";
import * as schema from "../../db/schema.js";
import { deliveries, deliveryAttempts, endpoints, events } from "../../db/schema.js";
import { assertPublicWebhookUrl, isSsrfBlockedError } from "../../lib/ssrf-guard.js";
import {
  createDeliveryQueue,
  DELIVERY_QUEUE_NAME,
  enqueueDelivery,
  type DeliveryJobData
} from "../queues.js";

type Database = NodePgDatabase<typeof schema>;

type ProcessDeliveryDependencies = {
  db: Database;
  queue: ReturnType<typeof createDeliveryQueue>;
  config: Pick<Config, "DELIVERY_TIMEOUT_MS" | "MAX_ATTEMPTS">;
  jobData: DeliveryJobData;
};

type DeliveryResult = {
  outcome: "success" | "http_error" | "timeout" | "conn_error" | "ssrf_blocked";
  responseStatus: number | null;
  responseBody: string | null;
  error: string | null;
  latencyMs: number;
};

export async function processDelivery({
  db,
  queue,
  config,
  jobData
}: ProcessDeliveryDependencies) {
  const delivery = await loadDelivery(db, jobData.deliveryId);

  if (!delivery || delivery.endpointStatus !== "active") {
    return;
  }

  const attemptNo = jobData.attemptNo;
  const now = new Date();

  const [claimed] = await db
    .update(deliveries)
    .set({
      status: "delivering",
      attemptCount: attemptNo,
      updatedAt: now
    })
    .where(
      and(
        eq(deliveries.id, delivery.deliveryId),
        eq(deliveries.attemptCount, attemptNo - 1),
        inArray(deliveries.status, ["pending", "failed"])
      )
    )
    .returning({ id: deliveries.id });

  if (!claimed) {
    return;
  }

  const result = await sendWebhook(delivery, config.DELIVERY_TIMEOUT_MS);

  await db.insert(deliveryAttempts).values({
    deliveryId: delivery.deliveryId,
    attemptNo,
    responseStatus: result.responseStatus,
    responseBody: result.responseBody,
    latencyMs: result.latencyMs,
    error: result.error
  });

  if (result.outcome === "success") {
    await markSucceeded(db, delivery.deliveryId, delivery.endpointId);
    return;
  }

  if (result.responseStatus === 410) {
    await db
      .update(endpoints)
      .set({ status: "paused" })
      .where(eq(endpoints.id, delivery.endpointId));
  }

  if (attemptNo >= config.MAX_ATTEMPTS) {
    await db
      .update(deliveries)
      .set({
        status: "dead",
        nextAttemptAt: null,
        updatedAt: new Date()
      })
      .where(eq(deliveries.id, delivery.deliveryId));
    return;
  }

  const delayMs = retryDelayMs(attemptNo + 1);
  const nextAttemptAt = new Date(Date.now() + delayMs);

  await db
    .update(deliveries)
    .set({
      status: "failed",
      nextAttemptAt,
      updatedAt: new Date()
    })
    .where(eq(deliveries.id, delivery.deliveryId));

  await db
    .update(endpoints)
    .set({ consecutiveFailures: delivery.consecutiveFailures + 1 })
    .where(eq(endpoints.id, delivery.endpointId));

  await enqueueDelivery(
    queue,
    { deliveryId: delivery.deliveryId, attemptNo: attemptNo + 1 },
    delayMs
  );
}

async function loadDelivery(db: Database, deliveryId: string) {
  const [delivery] = await db
    .select({
      deliveryId: deliveries.id,
      endpointId: endpoints.id,
      endpointStatus: endpoints.status,
      url: endpoints.url,
      secret: endpoints.secret,
      consecutiveFailures: endpoints.consecutiveFailures,
      attemptCount: deliveries.attemptCount,
      eventType: events.eventType,
      payload: events.payload
    })
    .from(deliveries)
    .innerJoin(events, eq(deliveries.eventId, events.id))
    .innerJoin(endpoints, eq(deliveries.endpointId, endpoints.id))
    .where(eq(deliveries.id, deliveryId))
    .limit(1);

  return delivery;
}

async function sendWebhook(
  delivery: NonNullable<Awaited<ReturnType<typeof loadDelivery>>>,
  timeoutMs: number
): Promise<DeliveryResult> {
  const startedAt = performance.now();
  const rawBody = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000);

  try {
    await assertPublicWebhookUrl(delivery.url);

    const response = await fetch(delivery.url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "content-type": "application/json",
        "herald-id": delivery.deliveryId,
        "herald-event-type": delivery.eventType,
        "herald-timestamp": String(timestamp),
        "herald-signature": buildSignatureHeader(delivery.secret, timestamp, rawBody)
      },
      body: rawBody
    });

    const responseBody = truncate(await response.text(), 1_024);
    const latencyMs = Math.round(performance.now() - startedAt);

    return {
      outcome: response.status >= 200 && response.status < 300 ? "success" : "http_error",
      responseStatus: response.status,
      responseBody,
      error: null,
      latencyMs
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startedAt);
    const name = error instanceof Error ? error.name : "Error";

    return {
      outcome: isSsrfBlockedError(error)
        ? "ssrf_blocked"
        : name === "TimeoutError"
          ? "timeout"
          : "conn_error",
      responseStatus: null,
      responseBody: null,
      error: name,
      latencyMs
    };
  }
}

async function markSucceeded(db: Database, deliveryId: string, endpointId: string) {
  await db
    .update(deliveries)
    .set({
      status: "succeeded",
      nextAttemptAt: null,
      updatedAt: new Date()
    })
    .where(eq(deliveries.id, deliveryId));

  await db
    .update(endpoints)
    .set({ consecutiveFailures: 0 })
    .where(eq(endpoints.id, endpointId));
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = createDeliveryQueue(redis);

  const worker = new Worker<DeliveryJobData>(
    DELIVERY_QUEUE_NAME,
    async (job) => processDelivery({ db, queue, config, jobData: job.data }),
    {
      connection: redis,
      concurrency: config.DELIVERY_CONCURRENCY
    }
  );

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await redis.quit();
    await pool.end();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
