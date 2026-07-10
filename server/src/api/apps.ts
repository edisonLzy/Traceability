import type { FastifyInstance } from 'fastify'
import type { createAppsRepo } from '../store/apps.js'
import type { createSourceMapsRepo } from '../store/sourceMaps.js'
import type { SourceMapUpload } from '@traceability/protocol'

type AppsRepo = ReturnType<typeof createAppsRepo>
type SourceMapsRepo = ReturnType<typeof createSourceMapsRepo>

export function registerAppsRoutes(app: FastifyInstance, repo: AppsRepo, sourceMapsRepo: SourceMapsRepo) {
  app.get('/api/apps', async () => repo.list())

  app.post<{ Body: { name: string; repoUrl: string; defaultBranch: string } }>('/api/apps', async (req, reply) => {
    const { name, repoUrl, defaultBranch } = req.body ?? ({} as typeof req.body)
    if (!name || !repoUrl || !defaultBranch) {
      return reply.code(400).send({ error: 'name, repoUrl, defaultBranch required' })
    }
    const created = repo.create({ name, repoUrl, defaultBranch })
    return reply.code(201).send(created)
  })

  app.get<{ Params: { id: string } }>('/api/apps/:id', async (req, reply) => {
    const found = repo.get(req.params.id)
    return found ? found : reply.code(404).send({ error: 'not found' })
  })

  app.patch<{ Params: { id: string }; Body: { name?: string; repoUrl?: string; defaultBranch?: string } }>(
    '/api/apps/:id',
    async (req, reply) => {
      const updated = repo.update(req.params.id, req.body ?? {})
      return updated ? updated : reply.code(404).send({ error: 'not found' })
    },
  )

  app.delete<{ Params: { id: string } }>('/api/apps/:id', async (req, reply) => {
    const ok = repo.remove(req.params.id)
    return ok ? reply.code(204).send() : reply.code(404).send({ error: 'not found' })
  })

  app.post<{ Params: { id: string }; Body: SourceMapUpload }>('/api/apps/:id/sourcemaps', async (req, reply) => {
    if (!repo.get(req.params.id)) return reply.code(404).send({ error: 'application not found' })
    try {
      sourceMapsRepo.upsert(req.params.id, req.body)
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'invalid source map' })
    }
    return reply.code(201).send({ ok: true })
  })
}
