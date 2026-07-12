# Herald

Stripe-quality webhooks for any app: signed, retried, observable, replayable.

Herald is self-hosted webhook delivery infrastructure. Producers publish an immutable event once; Herald fans it out to subscribed endpoints, signs each request, retries failures, records every attempt, and keeps dead letters replayable.

## Current Status

This repository is being built step by step from the project blueprint. The first milestone is the service foundation: strict TypeScript, Fastify boot, environment validation, database schema, health checks, and local infrastructure.

## Quickstart

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis
npm run db:generate
npm run dev
```

Then open `http://localhost:3000/docs`.

## Design Decisions

- PostgreSQL is the source of truth; Redis is only the scheduler.
- Events are immutable.
- Idempotent publish is enforced by a database uniqueness constraint.
- Delivery history is append-only through `delivery_attempts`.

See `docs/decisions/` for ADRs.
