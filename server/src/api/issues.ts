import type { FastifyInstance } from 'fastify'
import type { createIssuesRepo } from '../store/issues.js'
import type { IssueStatus } from '@traceability/protocol'
import type { createBroadcaster } from '../ws/broadcaster.js'

type IssuesRepo = ReturnType<typeof createIssuesRepo>
type Broadcaster = ReturnType<typeof createBroadcaster>

export function registerIssuesRoutes(
  app: FastifyInstance,
  repo: IssuesRepo,
  broadcaster: Broadcaster,
) {
  app.get<{
    Querystring: { appId?: string; status?: IssueStatus; limit?: number; cursor?: string }
  }>('/api/issues', async (req) => {
    return repo.list({
      appId: req.query.appId,
      status: req.query.status,
      limit: req.query.limit,
      cursor: req.query.cursor,
    })
  })

  app.get<{ Params: { id: string } }>('/api/issues/:id', async (req, reply) => {
    const issue = repo.get(req.params.id)
    return issue ? issue : reply.code(404).send({ error: 'not found' })
  })

  app.get<{ Params: { id: string } }>('/api/issues/:id/events', async (req, reply) => {
    const issue = repo.get(req.params.id)
    if (!issue) return reply.code(404).send({ error: 'not found' })
    return repo.listEvents(req.params.id)
  })

  app.post<{ Params: { id: string } }>('/api/issues/:id/fix-request', async (req, reply) => {
    const updated = repo.setStatus(req.params.id, 'fix-manual')
    if (!updated) return reply.code(404).send({ error: 'not found' })
    broadcaster.broadcast({ kind: 'issue:status-changed', appId: updated.appId, issueId: updated.id, payload: updated })
    return updated
  })

  app.post<{ Params: { id: string }; Body: { branch: string; patch: string } }>(
    '/api/issues/:id/attach-patch',
    async (req, reply) => {
      const issue = repo.get(req.params.id)
      if (!issue) return reply.code(404).send({ error: 'not found' })
      const { branch, patch } = req.body ?? ({} as typeof req.body)
      if (!branch || !patch) return reply.code(400).send({ error: 'branch + patch required' })
      const filePath = `patches/${issue.id}-${Date.now()}.diff`
      const created = repo.attachPatch(req.params.id, branch, filePath)
      broadcaster.broadcast({ kind: 'issue:updated', appId: issue.appId, issueId: issue.id, payload: created })
      return reply.code(201).send(created)
    },
  )

  app.post<{ Params: { id: string } }>('/api/issues/:id/mark-fixed', async (req, reply) => {
    const updated = repo.setStatus(req.params.id, 'fixed')
    if (!updated) return reply.code(404).send({ error: 'not found' })
    broadcaster.broadcast({ kind: 'issue:status-changed', appId: updated.appId, issueId: updated.id, payload: updated })
    return updated
  })
}
