import { desc } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import type { RuntimeConfig } from "../../config/index.js";
import type { PostgresDatabase } from "../../db/postgres.js";
import { processingFailures } from "../../db/schema/index.js";
import { createManagementAuth } from "../../infrastructure/auth/management-auth.js";

interface OperationsRouteDependencies {
  config: RuntimeConfig;
  database: PostgresDatabase;
}

export async function registerOperationsRoutes(
  app: FastifyInstance,
  dependencies: OperationsRouteDependencies,
) {
  app.get(
    "/api/v1/operations/processing-failures",
    { preHandler: createManagementAuth(dependencies.config) },
    async () => ({
      data: await dependencies.database.db
        .select()
        .from(processingFailures)
        .orderBy(desc(processingFailures.failedAt))
        .limit(100),
    }),
  );
}
