import type { FastifyInstance } from 'fastify'
import type { createAppsRepo } from '../store/apps.js'
import type { createIssuesRepo } from '../store/issues.js'
import type { createRrwebReplaysRepo } from '../store/replays.js'
import type { createPerformanceRepo } from '../store/performance.js'
import type { createSourceMapsRepo } from '../store/sourceMaps.js'
import type { createBroadcaster } from '../ws/broadcaster.js'
import { createAuthPlugin } from '../auth/token.js'
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
  apiToken: string
}

export function registerApi(app: FastifyInstance, deps: ApiDeps) {
  // protect all /api/* (ingest authenticates via bearer token; WS auth handled at upgrade)
  app.addHook('preHandler', (req, reply, done) => {
    if (req.url.startsWith('/api/ws')) return done() // WS auth handled at upgrade
    return createAuthPlugin(deps.apiToken)(req, reply, done)
  })

  registerIngestRoute(app, deps.issuesRepo, deps.replaysRepo, deps.broadcaster, deps.sourceMapsRepo)
  registerRrwebReplayRoutes(app, deps.issuesRepo, deps.replaysRepo)
  registerAppsRoutes(app, deps.appsRepo, deps.sourceMapsRepo)
  registerIssuesRoutes(app, deps.issuesRepo, deps.broadcaster)
  registerPerformanceRoutes(app, deps.appsRepo, deps.performanceRepo)
}
