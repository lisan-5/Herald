# ADR-003: Redis and BullMQ

## Status

Accepted

## Context

Webhook delivery needs delayed retries, concurrency controls, repeatable reconciliation, and operational visibility. Kafka would be unnecessary for the first version because Herald's source of truth is PostgreSQL, not the queue.

## Decision

Use Redis 7 and BullMQ 5 for scheduling delivery jobs and repeatable background tasks.

## Consequences

Redis can be treated as disposable scheduling infrastructure. PostgreSQL keeps the authoritative delivery state, and the reconciler can recover missing jobs.
