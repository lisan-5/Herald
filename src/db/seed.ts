import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { loadConfig } from "../config.js";
import { apiKeyPrefix, generateApiKey, hashApiKey } from "../core/api-key.js";
import { apiKeys, tenants } from "./schema.js";

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
const db = drizzle(pool);

try {
  const apiKey = generateApiKey();
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: "Demo Tenant"
    })
    .returning();

  if (!tenant) {
    throw new Error("Tenant was not created");
  }

  await db.insert(apiKeys).values({
    tenantId: tenant.id,
    keyHash: hashApiKey(apiKey),
    prefix: apiKeyPrefix(apiKey)
  });

  console.log("Seeded Herald demo tenant");
  console.log(`Tenant ID: ${tenant.id}`);
  console.log(`API key: ${apiKey}`);
} finally {
  await pool.end();
}
