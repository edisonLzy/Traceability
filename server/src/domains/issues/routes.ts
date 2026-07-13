import { Router } from 'express'
import type { IssuesService } from './service.js'

interface IssuesRouterDeps {
  issuesService: IssuesService
}

export function createIssuesRouter(deps: IssuesRouterDeps): Router {
  const router = Router()
  const { issuesService } = deps

  /**
   * @openapi
   * /api/issues:
   *   get:
   *     tags: [Issues]
   *     summary: List issues
   *     responses:
   *       200:
   *         description: ok
   */
  router.get('/api/issues', (req, res) => {
    res.success(issuesService.list({
      appId: req.query.appId as string | undefined,
      status: req.query.status as any,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: req.query.cursor as string | undefined,
    }))
  })

  /**
   * @openapi
   * /api/issues/{id}:
   *   get:
   *     tags: [Issues]
   *     responses:
   *       200:
   *         description: ok
   *       404:
   *         description: not found
   */
  router.get('/api/issues/:id', (req, res) => {
    res.success(issuesService.get(req.params.id))
  })

  /**
   * @openapi
   * /api/issues/{id}/events:
   *   get:
   *     tags: [Issues]
   *     responses:
   *       200:
   *         description: ok
   *       404:
   *         description: not found
   */
  router.get('/api/issues/:id/events', (req, res) => {
    res.success(issuesService.listEvents(req.params.id, req.query.limit ? Number(req.query.limit) : undefined))
  })

  /**
   * @openapi
   * /api/issues/{id}/fix-request:
   *   post:
   *     tags: [Issues]
   *     responses:
   *       200:
   *         description: ok
   *       404:
   *         description: not found
   */
  router.post('/api/issues/:id/fix-request', (req, res) => {
    res.success(issuesService.requestFix(req.params.id))
  })

  /**
   * @openapi
   * /api/issues/{id}/attach-patch:
   *   post:
   *     tags: [Issues]
   *     responses:
   *       201:
   *         description: created
   *       400:
   *         description: bad input
   *       404:
   *         description: not found
   */
  router.post('/api/issues/:id/attach-patch', (req, res) => {
    res.success(issuesService.attachPatch(req.params.id, req.body ?? {}), 201)
  })

  /**
   * @openapi
   * /api/issues/{id}/mark-fixed:
   *   post:
   *     tags: [Issues]
   *     responses:
   *       200:
   *         description: ok
   *       404:
   *         description: not found
   */
  router.post('/api/issues/:id/mark-fixed', (req, res) => {
    res.success(issuesService.markFixed(req.params.id))
  })

  return router
}
