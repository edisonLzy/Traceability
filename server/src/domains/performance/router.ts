import { Router } from "express";
import type { Request, Response } from "express";

import { asyncHandler } from "../../middlewares/error.js";
import * as perfService from "./service.js";

export const router = Router();

/**
 * @openapi
 * /api/ingest/performance/{appId}:
 *   post:
 *     tags: [Performance]
 *     summary: Record performance metrics for an app
 *     parameters:
 *       - in: path
 *         name: appId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               metrics:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name: { type: string, description: Metric name (1-80 chars) }
 *                     value: { type: number }
 *                     unit: { type: string, description: Unit (e.g. millisecond) }
 *                     timestamp: { type: string, description: ISO timestamp }
 *                     context: { type: object }
 *               name: { type: string, description: Single metric name (alternative to metrics array) }
 *               value: { type: number, description: Single metric value (alternative to metrics array) }
 *     responses:
 *       202:
 *         description: Metrics accepted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accepted: { type: integer }
 *       400:
 *         description: Validation error
 *       404:
 *         description: App not found
 */
router.post(
  "/api/ingest/performance/:appId",
  asyncHandler(async (req, res) => {
    res.success(perfService.recordMetrics(req.params.appId, req.body), 202);
  }),
);

/**
 * @openapi
 * /api/performance:
 *   get:
 *     tags: [Performance]
 *     summary: Get performance summary with p75 metrics grouped by app & metric name
 *     parameters:
 *       - in: query
 *         name: appId
 *         schema: { type: string }
 *         description: Filter by app ID
 *       - in: query
 *         name: hours
 *         schema: { type: integer, minimum: 1, maximum: 720, default: 24 }
 *         description: Lookback window in hours
 *     responses:
 *       200:
 *         description: Performance summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     since:
 *                       type: string
 *                     apps:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           appId: { type: string }
 *                           appName: { type: string }
 *                           samples: { type: integer }
 *                           metrics:
 *                             type: object
 *                             description: Map of metric name to stats
 *                             additionalProperties:
 *                               type: object
 *                               properties:
 *                                 count: { type: integer }
 *                                 average: { type: number }
 *                                 p75: { type: number }
 *                                 lastSeen: { type: string }
 *                                 unit: { type: string }
 */
router.get(
  "/api/performance",
  asyncHandler(async (req, res) => {
    res.success(perfService.getPerformanceSummary(req.query));
  }),
);
