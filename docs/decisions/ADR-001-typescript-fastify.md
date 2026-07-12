# ADR-001: TypeScript and Fastify

## Status

Accepted

## Context

Herald needs a small, explicit API surface with strict runtime validation and predictable performance. A heavyweight framework would hide too much of the delivery infrastructure behind conventions.

## Decision

Use Node 22, TypeScript 5 in strict mode, Fastify 5, Zod, and `fastify-type-provider-zod`.

## Consequences

The API remains fast and schema-first, while the project still exposes the important infrastructure choices directly: plugins, dependency ownership, request lifecycle, and validation boundaries.
