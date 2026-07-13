import type { FastifyInstance } from 'fastify'
import type { createAppsRepo } from '../store/apps.js'
import type { createIssuesRepo } from '../store/issues.js'
import type { createRrwebReplaysRepo } from '../store/replays.js'
import type { createPerformanceRepo } from '../store/performance.js'
import type { createSourceMapsRepo } from '../store/sourceMaps.js'
import type { createBroadcaster } from '../ws/broadcaster.js'
import { registerAppsRoutes } from './apps.js'
import { registerIssuesRoutes } from './issues.js'
import { registerIngestRoute } from './ingest.js'
import { registerRrwebReplayRoutes } from './replays.js'
import { registerPerformanceRoutes } from './performance.js'

interface ApiDeps {
  appsRepo: ReturnType<typeof createAppsRepo>
  issuesRepo: ReturnType<typeof createIssuesRepo>
  replaysRepo: ReturnType<typeof createRrwebReplaysRepo>
  performanceRepo: ReturnType<typeof createPerformanceRepo>
  sourceMapsRepo: ReturnType<typeof createSourceMapsRepo>
  broadcaster: ReturnType<typeof createBroadcaster>
}

export function registerApi(app: FastifyInstance, deps: ApiDeps) {
  registerIngestRoute(app, deps.issuesRepo, deps.replaysRepo, deps.broadcaster, deps.sourceMapsRepo)
  registerRrwebReplayRoutes(app, deps.issuesRepo, deps.replaysRepo)
  registerAppsRoutes(app, deps.appsRepo, deps.sourceMapsRepo)
  registerIssuesRoutes(app, deps.issuesRepo, deps.broadcaster)
  registerPerformanceRoutes(app, deps.appsRepo, deps.performanceRepo)
}
