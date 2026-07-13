import { Router } from "express";

import type { PerformanceService } from "./service.js";

interface PerformanceRouterDeps {
  performanceService: PerformanceService;
}

export function createPerformanceRouter(deps: PerformanceRouterDeps): Router {
  const router = Router();
  const { performanceService } = deps;

  /**
   * @openapi
   * /api/ingest/performance/{appId}:
   *   post:
   *     tags: [Performance]
   *     summary: Ingest performance metrics
   *     responses:
   *       202:
   *         description: accepted
   *       404:
   *         description: app not found
   */
  router.post("/api/ingest/performance/:appId", (req, res) => {
    res.success(performanceService.record(req.params.appId, req.body), 202);
  });

  /**
   * @openapi
   * /api/performance:
   *   get:
   *     tags: [Performance]
   *     summary: Performance summary
   *     responses:
   *       200:
   *         description: ok
   */
  router.get("/api/performance", (req, res) => {
    res.success(
      performanceService.summary({
        appId: req.query.appId as string | undefined,
        hours: req.query.hours ? Number(req.query.hours) : undefined,
      }),
    );
  });

  return router;
}
