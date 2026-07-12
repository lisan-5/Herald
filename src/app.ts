import { randomUUID } from "node:crypto";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from "fastify-type-provider-zod";
import type { Config } from "./config.js";
import { healthRoutes } from "./api/routes/health.js";
import { authPlugin } from "./api/plugins/auth.js";
import { dependenciesPlugin } from "./api/plugins/dependencies.js";
import { deliveryRoutes } from "./api/routes/deliveries.js";
import { endpointRoutes } from "./api/routes/endpoints.js";
import { eventRoutes } from "./api/routes/events.js";
import { createLogger } from "./lib/logger.js";

export async function buildApp(config: Config) {
  const app = Fastify({
    loggerInstance: createLogger(config),
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID()
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet);
  await app.register(sensible);
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Herald API",
        description: "Self-hosted webhook delivery infrastructure.",
        version: "0.1.0"
      }
    },
    transform: jsonSchemaTransform
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });

  await app.register(dependenciesPlugin, { config });
  await app.register(authPlugin);
  await app.register(healthRoutes);
  await app.register(
    async (v1) => {
      await v1.register(endpointRoutes);
      await v1.register(eventRoutes);
      await v1.register(deliveryRoutes);
    },
    { prefix: "/v1" }
  );

  return app;
}
