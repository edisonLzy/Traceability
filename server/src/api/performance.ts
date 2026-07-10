import type { FastifyInstance } from 'fastify'
import type { PerformanceMetric } from '@traceability/protocol'
import type { createAppsRepo } from '../store/apps.js'
import type { createPerformanceRepo } from '../store/performance.js'

type AppsRepo = ReturnType<typeof createAppsRepo>
type PerformanceRepo = ReturnType<typeof createPerformanceRepo>

export function registerPerformanceRoutes(app: FastifyInstance, appsRepo: AppsRepo, repo: PerformanceRepo) {
  app.post<{ Params: { appId: string }; Body: PerformanceMetric | { metrics?: PerformanceMetric[] } }>(
    '/api/ingest/performance/:appId',
    async (req, reply) => {
      if (!appsRepo.get(req.params.appId)) return reply.code(404).send({ error: 'application not found' })
      const body = req.body
      const metrics: PerformanceMetric[] = isPerformanceBatch(body) ? body.metrics ?? [] : [body]
      const accepted = repo.record(req.params.appId, metrics)
      return reply.code(202).send({ accepted })
    },
  )

  app.get<{ Querystring: { appId?: string; hours?: number } }>('/api/performance', async (req) => {
    return repo.summary({ appId: req.query.appId, hours: req.query.hours })
  })
}

function isPerformanceBatch(body: PerformanceMetric | { metrics?: PerformanceMetric[] }): body is { metrics?: PerformanceMetric[] } {
  return 'metrics' in body
}
