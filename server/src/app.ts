import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";

import type { RuntimeConfig } from "./config/index.js";
import { loadRuntimeConfig } from "./config/index.js";
import { createPostgresDatabase, type PostgresDatabase } from "./db/postgres.js";
import { registerIngestRoutes } from "./domains/ingest/routes.js";
import { IngestRequestError } from "./domains/ingest/service.js";
import { registerIssueRoutes } from "./domains/issues/routes.js";
import { registerOperationsRoutes } from "./domains/operations/routes.js";
import { registerProjectRoutes } from "./domains/projects/routes.js";
import { createManagementAuth } from "./infrastructure/auth/management-auth.js";
import { ServerMetrics } from "./infrastructure/observability/metrics.js";
import type { IngestionRateLimiter } from "./infrastructure/rate-limit/project-rate-limiter.js";

export interface AppDependencies {
  config: RuntimeConfig;
  database: PostgresDatabase;
  rateLimiter?: IngestionRateLimiter;
}

export async function createApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: dependencies.config.trustProxy,
    logger: {
      level: dependencies.config.logLevel,
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-sentry-auth",
        "body",
      ],
    },
    requestIdHeader: "x-request-id",
  });
  const metrics = new ServerMetrics();
  const requestStartedAt = new WeakMap<object, number>();
  app.addHook("onRequest", async (request) => {
    requestStartedAt.set(request, performance.now());
  });
  app.addHook("onResponse", async (request, reply) => {
    const startedAt = requestStartedAt.get(request);
    if (startedAt === undefined) return;
    metrics.observeRequest({
      method: request.method,
      route: request.routeOptions.url ?? "unmatched",
      statusCode: reply.statusCode,
      durationMs: performance.now() - startedAt,
    });
  });

  for (const contentType of [
    "application/x-sentry-envelope",
    "application/octet-stream",
    "text/plain",
  ]) {
    app.addContentTypeParser(
      contentType,
      { parseAs: "buffer", bodyLimit: dependencies.config.ingestMaxCompressedBytes },
      (_request, body, done) => done(null, body),
    );
  }

  await app.register(cors, {
    credentials: false,
    origin: dependencies.config.corsOrigins.length > 0 ? dependencies.config.corsOrigins : false,
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Traceability Server API",
        version: "1.0.0",
        description: "Sentry-compatible event ingestion server",
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/api-docs" });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof IngestRequestError) {
      if (error.retryAfterSeconds) reply.header("retry-after", error.retryAfterSeconds);
      return reply.code(error.statusCode).send({ detail: error.message, code: error.code });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ code: "invalid_request", issues: error.issues });
    }
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      typeof error.statusCode === "number" &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      const code = error.statusCode === 413 ? "request_too_large" : "invalid_request";
      return reply.code(error.statusCode).send({ code });
    }
    app.log.error(error);
    return reply.code(500).send({ code: "internal_error" });
  });

  app.get("/api-docs.json", async () => app.swagger());
  app.get(
    "/metrics",
    { preHandler: createManagementAuth(dependencies.config) },
    async (_request, reply) => {
      reply.header("content-type", metrics.registry.contentType);
      return metrics.registry.metrics();
    },
  );
  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await dependencies.database.ping();
      await dependencies.rateLimiter?.check();
      return { status: "ok" };
    } catch {
      reply.code(503);
      return { status: "unavailable" };
    }
  });
  await registerIngestRoutes(app, dependencies);
  await registerProjectRoutes(app, dependencies);
  await registerIssueRoutes(app, dependencies);
  await registerOperationsRoutes(app, dependencies);

  app.addHook("onClose", async () => {
    await dependencies.rateLimiter?.close();
    await dependencies.database.close();
  });

  return app;
}

export async function startApi(): Promise<FastifyInstance> {
  const config = loadRuntimeConfig();
  const database = createPostgresDatabase({
    connectionString: config.databaseUrl,
    maxConnections: config.databasePoolMax,
  });
  const { RedisIngestionRateLimiter } =
    await import("./infrastructure/rate-limit/project-rate-limiter.js");
  const { createQueueConnection } = await import("./infrastructure/queue/item-queue.js");
  const rateLimiter = new RedisIngestionRateLimiter(createQueueConnection(config.redisUrl));
  const app = await createApp({ config, database, rateLimiter });

  await app.listen({ host: config.host, port: config.port });
  return app;
}
