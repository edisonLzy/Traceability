import { Router } from "express";
import express from "express";

import type { IngestService } from "./service.js";

interface IngestRouterDeps {
  ingestService: IngestService;
}

export function createIngestRouter(deps: IngestRouterDeps): Router {
  const router = Router();
  const { ingestService } = deps;

  router.use(express.text({ type: ["application/octet-stream", "text/plain"], limit: "2mb" }));

  /**
   * @openapi
   * /api/ingest/envelope/{appId}:
   *   post:
   *     tags: [Ingest]
   *     summary: Ingest a Sentry envelope
   *     requestBody: { required: true, content: { application/octet-stream: { schema: { type: string } } } }
   *     responses: { 202: { description: accepted }, 400: { description: invalid envelope } }
   */
  router.post("/api/ingest/envelope/:appId", (req, res) => {
    res.success(ingestService.ingestEnvelope(req.params.appId, req.body), 202);
  });

  return router;
}
