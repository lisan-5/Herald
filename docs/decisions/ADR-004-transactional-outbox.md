# ADR-004: Lightweight Transactional Outbox

## Status

Accepted

## Context

Writing a delivery row to PostgreSQL and then enqueueing a Redis job is a dual-write. If the process dies between those operations, the delivery can become stuck unless another mechanism notices it.

## Decision

Create events and deliveries in one PostgreSQL transaction, enqueue jobs after commit, and run a reconciler every minute to re-enqueue stale pending or failed deliveries. BullMQ jobs use deterministic IDs based on the delivery and attempt number.

## Consequences

The system can tolerate process death or Redis downtime without losing delivery intent. Redis remains a scheduler; PostgreSQL remains the source of truth.
