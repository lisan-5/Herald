# ADR-002: PostgreSQL and Drizzle

## Status

Accepted

## Context

Herald's strongest guarantee is that events and delivery state are durable. The database must make idempotency and auditability enforceable, not merely conventional.

## Decision

Use PostgreSQL 16 with Drizzle ORM and checked-in migrations.

## Consequences

The schema stays SQL-transparent, idempotency can be enforced with a unique index, and reviewers can inspect the real data model without reverse-engineering a higher-level ORM abstraction.
