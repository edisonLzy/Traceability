import "dotenv/config";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { loadRuntimeConfig } from "../config/index.js";
import { createPostgresDatabase } from "./postgres.js";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

async function main() {
  const config = loadRuntimeConfig();
  const database = createPostgresDatabase({
    connectionString: config.databaseUrl,
    maxConnections: config.databasePoolMax,
  });

  try {
    await migrate(database.db, { migrationsFolder });
  } finally {
    await database.close();
  }
}

await main();
