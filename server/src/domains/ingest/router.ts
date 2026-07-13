import { Router } from "express";
import type { Request, Response } from "express";
import express from "express";

import { asyncHandler } from "../../middlewares/error.js";
import { ingestEnvelope } from "./service.js";

export const router = Router();

router.use(express.text({ type: ["application/octet-stream", "text/plain"], limit: "2mb" }));

/**
 * @openapi
 * /api/ingest/envelope/{appId}:
 *   post:
 *     tags: [Ingest]
 *     summary: Ingest a Sentry envelope
 *     description: Accepts a raw Sentry envelope (application/octet-stream or text/plain). Parses it, extracts events, resolves source maps, and broadcasts updates.
 *     parameters:
 *       - in: path
 *         name: appId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         text/plain:
 *           schema:
 *             type: string
 *             description: Raw Sentry envelope text
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             description: Raw Sentry envelope bytes
 *     responses:
 *       202:
 *         description: Envelope accepted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accepted: { type: integer, description: Number of items accepted from envelope }
 *       400:
 *         description: Invalid envelope or empty body
 */
router.post(
  "/api/ingest/envelope/:appId",
  asyncHandler(async (req, res) => {
    res.success(ingestEnvelope(req.params.appId, req.body), 202);
  }),
);
