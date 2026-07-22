import { Router } from "express";

import { asyncHandler } from "../../middlewares/error.js";
import { requirePathParam } from "../../shared/index.js";
import * as perfService from "./service.js";

export const router = Router();

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
