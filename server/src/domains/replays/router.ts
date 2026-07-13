import { Router } from "express";
import type { Request, Response } from "express";

import { asyncHandler } from "../../middlewares/error.js";
import * as replayService from "./service.js";

export const router = Router();

/**
 * @openapi
 * /api/ingest/rrweb/{appId}:
 *   post:
 *     tags: [Replays]
 *     summary: Save an rrweb replay for an app
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
 *             required: [events]
 *             properties:
 *               replayId: { type: string, description: Optional custom replay ID }
 *               sentryEventId: { type: string, description: Associated Sentry event ID }
 *               capturedAt: { type: string, description: ISO timestamp of capture }
 *               startAt: { type: number, description: Start time in ms }
 *               endAt: { type: number, description: End time in ms }
 *               events:
 *                 type: array
 *                 items: {}
 *                 description: rrweb event data (min 1)
 *               metadata: { type: object, description: Optional metadata }
 *     responses:
 *       201:
 *         description: Saved replay
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     appId: { type: string }
 *                     issueId: { type: string }
 *                     sentryEventId: { type: string }
 *                     receivedAt: { type: string }
 *                     capturedAt: { type: string }
 *                     startAt: { type: number }
 *                     endAt: { type: number }
 *                     eventCount: { type: integer }
 *                     sizeBytes: { type: integer }
 *                     metadata: { type: object }
 *                     events:
 *                       type: array
 *                       items: {}
 *       400:
 *         description: Validation error
 */
router.post(
  "/api/ingest/rrweb/:appId",
  asyncHandler(async (req, res) => {
    res.success(replayService.saveReplay(req.params.appId, req.body), 201);
  }),
);

/**
 * @openapi
 * /api/issues/{id}/replays:
 *   get:
 *     tags: [Replays]
 *     summary: List replay summaries for an issue
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
 *                       id: { type: string }
 *                       appId: { type: string }
 *                       issueId: { type: string }
 *                       sentryEventId: { type: string }
 *                       receivedAt: { type: string }
 *                       capturedAt: { type: string }
 *                       startAt: { type: number }
 *                       endAt: { type: number }
 *                       eventCount: { type: integer }
 *                       sizeBytes: { type: integer }
 *                       metadata: { type: object }
 *       404:
 *         description: Issue not found
 */
router.get(
  "/api/issues/:id/replays",
  asyncHandler(async (req, res) => {
    res.success(
      replayService.listReplaysByIssue(
        req.params.id,
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
 *     summary: Get a specific replay with full event data
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
 *                     id: { type: string }
 *                     appId: { type: string }
 *                     issueId: { type: string }
 *                     eventCount: { type: integer }
 *                     sizeBytes: { type: integer }
 *                     events:
 *                       type: array
 *                       items: {}
 *       404:
 *         description: Replay or issue not found
 */
router.get(
  "/api/issues/:id/replays/:replayId",
  asyncHandler(async (req, res) => {
    res.success(replayService.getReplayForIssue(req.params.id, req.params.replayId));
  }),
);
