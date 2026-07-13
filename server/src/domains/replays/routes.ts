import { Router } from "express";

import type { ReplaysService } from "./service.js";

interface ReplaysRouterDeps {
  replaysService: ReplaysService;
}

export function createReplaysRouter(deps: ReplaysRouterDeps): Router {
  const router = Router();
  const { replaysService } = deps;

  /**
   * @openapi
   * /api/ingest/rrweb/{appId}:
   *   post:
   *     tags: [Replays]
   *     summary: Ingest an rrweb replay
   *     responses:
   *       201:
   *         description: saved
   *       400:
   *         description: no events
   */
  router.post("/api/ingest/rrweb/:appId", (req, res) => {
    res.success(replaysService.save(req.params.appId, req.body), 201);
  });

  /**
   * @openapi
   * /api/issues/{id}/replays:
   *   get:
   *     tags: [Replays]
   *     responses:
   *       200:
   *         description: ok
   *       404:
   *         description: not found
   */
  router.get("/api/issues/:id/replays", (req, res) => {
    res.success(
      replaysService.listByIssue(
        req.params.id,
        req.query.limit ? Number(req.query.limit) : undefined,
      ),
    );
  });

  /**
   * @openapi
   * /api/issues/{id}/replays/{replayId}:
   *   get:
   *     tags: [Replays]
   *     responses:
   *       200:
   *         description: ok
   *       404:
   *         description: not found
   */
  router.get("/api/issues/:id/replays/:replayId", (req, res) => {
    res.success(replaysService.getForIssue(req.params.id, req.params.replayId));
  });

  return router;
}
