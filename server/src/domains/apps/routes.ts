import { Router } from 'express'
import type { AppsService } from './service.js'

interface AppsRouterDeps {
  appsService: AppsService
}

export function createAppsRouter(deps: AppsRouterDeps): Router {
  const router = Router()
  const { appsService } = deps

  /**
   * @openapi
   * /api/apps:
   *   get:
   *     tags: [Apps]
   *     summary: List applications
   *     responses: { 200: { description: Application list } }
   */
  router.get('/api/apps', (_req, res) => {
    res.success(appsService.list())
  })

  /**
   * @openapi
   * /api/apps:
   *   post:
   *     tags: [Apps]
   *     summary: Create an application
   *     requestBody: { required: true, content: { application/json: { schema: { type: object } } } }
   *     responses: { 201: { description: Created }, 400: { description: Invalid input } }
   */
  router.post('/api/apps', (req, res) => {
    res.success(appsService.create(req.body ?? {}), 201)
  })

  /**
   * @openapi
   * /api/apps/{id}:
   *   get:
   *     tags: [Apps]
   *     responses:
   *       200:
   *         description: ok
   *       404:
   *         description: not found
   */
  router.get('/api/apps/:id', (req, res) => {
    res.success(appsService.get(req.params.id))
  })

  /**
   * @openapi
   * /api/apps/{id}:
   *   patch:
   *     tags: [Apps]
   *     responses:
   *       200:
   *         description: ok
   *       404:
   *         description: not found
   */
  router.patch('/api/apps/:id', (req, res) => {
    res.success(appsService.update(req.params.id, req.body ?? {}))
  })

  /**
   * @openapi
   * /api/apps/{id}:
   *   delete:
   *     tags: [Apps]
   *     responses:
   *       204:
   *         description: deleted
   *       404:
   *         description: not found
   */
  router.delete('/api/apps/:id', (req, res) => {
    appsService.remove(req.params.id)
    res.status(204).end()
  })

  /**
   * @openapi
   * /api/apps/{id}/sourcemaps:
   *   post:
   *     tags: [Apps]
   *     summary: Upload a source map for an application
   *     responses:
   *       201:
   *         description: uploaded
   *       400:
   *         description: invalid
   *       404:
   *         description: app not found
   */
  router.post('/api/apps/:id/sourcemaps', (req, res) => {
    appsService.uploadSourceMap(req.params.id, req.body)
    res.success({ ok: true }, 201)
  })

  return router
}
