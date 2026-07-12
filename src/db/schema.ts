import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: createdAt()
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull(),
  prefix: text("prefix").notNull(),
  createdAt: createdAt(),
  revokedAt: timestamp("revoked_at", { withTimezone: true })
});

export const endpoints = pgTable(
  "endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    description: text("description"),
    secret: text("secret").notNull(),
    secretPrevious: text("secret_previous"),
    eventTypes: text("event_types").array().notNull(),
    rateLimitPerSec: integer("rate_limit_per_sec").notNull().default(10),
    status: text("status").notNull().default("active"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdAt: createdAt()
  },
  (table) => ({
    tenantCreatedAtIdx: index("endpoints_tenant_created_at_idx").on(table.tenantId, table.createdAt)
  })
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    idempotencyKey: text("idempotency_key"),
    createdAt: createdAt()
  },
  (table) => ({
    tenantIdempotencyKeyUnique: uniqueIndex("events_tenant_idempotency_key_unique")
      .on(table.tenantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`)
  })
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => endpoints.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => ({
    statusNextAttemptIdx: index("deliveries_status_next_attempt_idx").on(
      table.status,
      table.nextAttemptAt
    ),
    endpointCreatedAtIdx: index("deliveries_endpoint_created_at_idx").on(
      table.endpointId,
      table.createdAt
    )
  })
);

export const deliveryAttempts = pgTable("delivery_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  deliveryId: uuid("delivery_id")
    .notNull()
    .references(() => deliveries.id, { onDelete: "cascade" }),
  attemptNo: integer("attempt_no").notNull(),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  latencyMs: integer("latency_ms").notNull(),
  error: text("error"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow()
});
