import type { FastifyInstance } from "fastify";

import type { RuntimeConfig } from "../../config/index.js";
import type { PostgresDatabase } from "../../db/postgres.js";
import type { IngestionRateLimiter } from "../../infrastructure/rate-limit/project-rate-limiter.js";
import { IngestService } from "./service.js";

interface IngestRouteDependencies {
  config: RuntimeConfig;
  database: PostgresDatabase;
  rateLimiter?: IngestionRateLimiter;
}

export async function registerIngestRoutes(
  app: FastifyInstance,
  dependencies: IngestRouteDependencies,
) {
  const service = new IngestService(
    dependencies.database,
    {
      maxDecompressedBytes: dependencies.config.ingestMaxDecompressedBytes,
      maxItems: dependencies.config.ingestMaxItems,
      maxItemBytes: dependencies.config.ingestMaxItemBytes,
    },
    dependencies.rateLimiter,
  );

  app.post<{
    Params: { projectId: string };
    Querystring: { sentry_key?: string };
  }>("/api/:projectId/envelope/", async (request, reply) => {
    const result = await service.ingest({
      pathProjectId: request.params.projectId,
      body: request.body as Buffer,
      contentEncoding: firstHeaderValue(request.headers["content-encoding"]),
      origin: request.headers.origin,
      userAgent: request.headers["user-agent"],
      clientIp: request.ip,
      publicKey:
        request.query.sentry_key ??
        extractPublicKey(firstHeaderValue(request.headers["x-sentry-auth"])),
    });

    return reply.code(200).send(result.eventId ? { id: result.eventId } : {});
  });
}

function extractPublicKey(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const key = /(?:^|,)\s*sentry_key=([^,\s]+)/.exec(header)?.[1];
  return key ? decodeURIComponent(key) : undefined;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
