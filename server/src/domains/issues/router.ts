import { Router } from "express";

import { asyncHandler } from "../../middlewares/error.js";
import { requirePathParam } from "../../shared/index.js";
import * as issueService from "./service.js";

export const router = Router();

/**
 * @openapi
 * /api/issues:
 *   get:
 *     tags: [Issues]
 *     summary: List issues with optional filtering and cursor-based pagination
 *     parameters:
 *       - in: query
 *         name: appId
 *         schema: { type: string }
 *         description: Filter by app ID
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [open, fixing, fix-manual, fixed] }
 *         description: Filter by issue status
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 200, default: 50 }
 *         description: Max items per page
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *         description: Cursor from previous response for next page
 *     responses:
 *       200:
 *         description: Paginated list of issues
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string }
 *                           appId: { type: string }
 *                           fingerprint: { type: string }
 *                           title: { type: string }
 *                           type: { type: string }
 *                           firstSeen: { type: string }
 *                           lastSeen: { type: string }
 *                           count: { type: integer }
 *                           status: { type: string, enum: [open, fixing, fix-manual, fixed] }
 *                           metadata: { type: object }
 *                     nextCursor: { type: string, nullable: true }
 */
router.get(
  "/api/issues",
  asyncHandler(async (req, res) => {
    res.success(issueService.listIssues(req.query));
  }),
);

/**
 * @openapi
 * /api/issues/{id}:
 *   get:
 *     tags: [Issues]
 *     summary: Get a single issue by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Issue
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
 *                     fingerprint: { type: string }
 *                     title: { type: string }
 *                     type: { type: string }
 *                     firstSeen: { type: string }
 *                     lastSeen: { type: string }
 *                     count: { type: integer }
 *                     status: { type: string }
 *                     metadata: { type: object }
 *       404:
 *         description: Not found
 */
router.get(
  "/api/issues/:id",
  asyncHandler(async (req, res) => {
    res.success(issueService.getIssue(requirePathParam(req, "id")));
  }),
);

/**
 * @openapi
 * /api/issues/{id}/events:
 *   get:
 *     tags: [Issues]
 *     summary: List events for an issue
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *         description: Max events to return
 *     responses:
 *       200:
 *         description: List of events
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
 *                       issueId: { type: string }
 *                       receivedAt: { type: string }
 *                       envelope: { type: string }
 *       404:
 *         description: Issue not found
 */
router.get(
  "/api/issues/:id/events",
  asyncHandler(async (req, res) => {
    res.success(
      issueService.listIssueEvents(
        requirePathParam(req, "id"),
        req.query.limit ? Number(req.query.limit) : undefined,
      ),
    );
  }),
);

/**
 * @openapi
 * /api/issues/{id}/fix-request:
 *   post:
 *     tags: [Issues]
 *     summary: Request a fix (changes status to fix-manual)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated issue
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
 *                     title: { type: string }
 *                     status: { type: string }
 *                     count: { type: integer }
 *       404:
 *         description: Issue not found
 */
router.post(
  "/api/issues/:id/fix-request",
  asyncHandler(async (req, res) => {
    res.success(issueService.requestFix(requirePathParam(req, "id")));
  }),
);

/**
 * @openapi
 * /api/issues/{id}/attach-patch:
 *   post:
 *     tags: [Issues]
 *     summary: Attach a patch to an issue (changes status to fixing)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [branch, patch]
 *             properties:
 *               branch: { type: string, description: Branch name }
 *               patch: { type: string, description: Patch content (diff) }
 *     responses:
 *       201:
 *         description: Issue with attached patch
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
 *                     title: { type: string }
 *                     status: { type: string }
 *       400:
 *         description: Validation error
 *       404:
 *         description: Issue not found
 */
router.post(
  "/api/issues/:id/attach-patch",
  asyncHandler(async (req, res) => {
    res.success(issueService.attachPatch(requirePathParam(req, "id"), req.body), 201);
  }),
);

/**
 * @openapi
 * /api/issues/{id}/mark-fixed:
 *   post:
 *     tags: [Issues]
 *     summary: Mark an issue as fixed (changes status to fixed)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated issue
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
 *                     title: { type: string }
 *                     status: { type: string }
 *       404:
 *         description: Issue not found
 */
router.post(
  "/api/issues/:id/mark-fixed",
  asyncHandler(async (req, res) => {
    res.success(issueService.markFixed(requirePathParam(req, "id")));
  }),
);
