import { Router } from "express";
import type { Request, Response } from "express";

import { asyncHandler } from "../../middlewares/error.js";
import * as appService from "./service.js";

export const router = Router();

/**
 * @openapi
 * /api/apps:
 *   get:
 *     tags: [Apps]
 *     summary: List all apps
 *     responses:
 *       200:
 *         description: List of apps
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
 *                       name: { type: string }
 *                       repoUrl: { type: string }
 *                       defaultBranch: { type: string }
 *                       createdAt: { type: string }
 */
router.get(
  "/api/apps",
  asyncHandler(async (_req, res) => {
    res.success(appService.listApps());
  }),
);

/**
 * @openapi
 * /api/apps:
 *   post:
 *     tags: [Apps]
 *     summary: Create a new app
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, repoUrl, defaultBranch]
 *             properties:
 *               name: { type: string, description: App name (1-200 chars) }
 *               repoUrl: { type: string, description: Repository URL }
 *               defaultBranch: { type: string, description: Default branch name }
 *     responses:
 *       201:
 *         description: Created app
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
 *                     name: { type: string }
 *                     repoUrl: { type: string }
 *                     defaultBranch: { type: string }
 *                     createdAt: { type: string }
 *       400:
 *         description: Validation error
 */
router.post(
  "/api/apps",
  asyncHandler(async (req, res) => {
    res.success(appService.createApp(req.body), 201);
  }),
);

/**
 * @openapi
 * /api/apps/{id}:
 *   get:
 *     tags: [Apps]
 *     summary: Get app by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: App
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
 *                     name: { type: string }
 *                     repoUrl: { type: string }
 *                     defaultBranch: { type: string }
 *                     createdAt: { type: string }
 *       404:
 *         description: Not found
 */
router.get(
  "/api/apps/:id",
  asyncHandler(async (req, res) => {
    res.success(appService.getApp(req.params.id));
  }),
);

/**
 * @openapi
 * /api/apps/{id}:
 *   patch:
 *     tags: [Apps]
 *     summary: Update an app
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
 *             properties:
 *               name: { type: string, description: App name (1-200 chars) }
 *               repoUrl: { type: string, description: Repository URL }
 *               defaultBranch: { type: string, description: Default branch name }
 *     responses:
 *       200:
 *         description: Updated app
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
 *                     name: { type: string }
 *                     repoUrl: { type: string }
 *                     defaultBranch: { type: string }
 *                     createdAt: { type: string }
 *       404:
 *         description: Not found
 */
router.patch(
  "/api/apps/:id",
  asyncHandler(async (req, res) => {
    res.success(appService.updateApp(req.params.id, req.body));
  }),
);

/**
 * @openapi
 * /api/apps/{id}:
 *   delete:
 *     tags: [Apps]
 *     summary: Delete an app
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204:
 *         description: Deleted (no content)
 *       404:
 *         description: Not found
 */
router.delete(
  "/api/apps/:id",
  asyncHandler(async (req, res) => {
    appService.removeApp(req.params.id);
    res.status(204).end();
  }),
);

/**
 * @openapi
 * /api/apps/{id}/sourcemaps:
 *   post:
 *     tags: [Apps]
 *     summary: Upload source maps for an app
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
 *             description: Source map payload
 *     responses:
 *       201:
 *         description: Source maps uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     ok: { type: boolean }
 *       404:
 *         description: App not found
 */
router.post(
  "/api/apps/:id/sourcemaps",
  asyncHandler(async (req, res) => {
    appService.uploadSourceMap(req.params.id, req.body);
    res.success({ ok: true }, 201);
  }),
);
