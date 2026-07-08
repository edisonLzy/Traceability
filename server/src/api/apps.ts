import type { FastifyInstance } from 'fastify'
import type { createAppsRepo } from '../store/apps.js'

type AppsRepo = ReturnType<typeof createAppsRepo>

export function registerAppsRoutes(app: FastifyInstance, repo: AppsRepo) {
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
}
