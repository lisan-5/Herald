import fp from "fastify-plugin";
import { eq, isNull } from "drizzle-orm";
import { apiKeys } from "../../db/schema.js";
import { hashApiKey, safeEqual } from "../../core/api-key.js";

type AuthenticatedTenant = {
  id: string;
};

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }

  interface FastifyRequest {
    tenant: AuthenticatedTenant;
  }
}

export const authPlugin = fp(async (app) => {
  app.decorate("authenticate", async (request) => {
    const apiKey = readBearerToken(request.headers.authorization);

    if (!apiKey) {
      throw app.httpErrors.unauthorized("Missing bearer token");
    }

    const keyHash = hashApiKey(apiKey);
    const [record] = await app.pg
      .select({
        tenantId: apiKeys.tenantId,
        keyHash: apiKeys.keyHash
      })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);

    if (!record || !safeEqual(record.keyHash, keyHash)) {
      throw app.httpErrors.unauthorized("Invalid bearer token");
    }

    request.tenant = { id: record.tenantId };
  });
});

function readBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim();
}
