import { Router } from "express";

import { asyncHandler } from "../../middlewares/error.js";
import { requirePathParam } from "../../shared/index.js";
import * as replayService from "./service.js";

export const router = Router();

/**
 * @openapi
 * /api/issues/{id}/replays:
 *   get:
 *     tags: [Replays]
 *     summary: List replay segment summaries for an issue
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *         description: Max replays to return (max 100)
 *     responses:
 *       200:
 *         description: List of replay summaries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       replayId: { type: string }
 *                       appId: { type: string }
 *                       segmentCount: { type: integer }
 *                       sizeBytes: { type: integer }
 *       404:
 *         description: Issue not found
 */
router.get(
  "/api/issues/:id/replays",
  asyncHandler(async (req, res) => {
    res.success(
      replayService.listReplaysByIssue(
        requirePathParam(req, "id"),
        req.query.limit ? Number(req.query.limit) : undefined,
      ),
    );
  }),
);

/**
 * @openapi
 * /api/issues/{id}/replays/{replayId}:
 *   get:
 *     tags: [Replays]
 *     summary: Get a specific replay with full segment event data
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: replayId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Full replay with events
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     replayId: { type: string }
 *                     segments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           segmentId: { type: integer }
 *                           events:
 *                             type: array
 *       404:
 *         description: Replay or issue not found
 */
router.get(
  "/api/issues/:id/replays/:replayId",
  asyncHandler(async (req, res) => {
    res.success(
      replayService.getReplayForIssue(
        requirePathParam(req, "id"),
        requirePathParam(req, "replayId"),
      ),
    );
  }),
);
