import type { FastifyInstance } from 'fastify'
import type { createAppsRepo } from '../store/apps.js'
import type { createIssuesRepo } from '../store/issues.js'
import type { createRrwebReplaysRepo } from '../store/replays.js'
import type { createBroadcaster } from '../ws/broadcaster.js'
import { createAuthPlugin } from '../auth/token.js'
import { registerAppsRoutes } from './apps.js'
import { registerIssuesRoutes } from './issues.js'
import { registerIngestRoute } from './ingest.js'
import { registerRrwebReplayRoutes } from './replays.js'

interface ApiDeps {
  appsRepo: ReturnType<typeof createAppsRepo>
  issuesRepo: ReturnType<typeof createIssuesRepo>
  replaysRepo: ReturnType<typeof createRrwebReplaysRepo>
  broadcaster: ReturnType<typeof createBroadcaster>
  apiToken: string
}

export function registerApi(app: FastifyInstance, deps: ApiDeps) {
  // protect all /api/* (ingest authenticates via bearer token; WS auth handled at upgrade)
  app.addHook('preHandler', (req, reply, done) => {
    if (req.url.startsWith('/api/ws')) return done() // WS auth handled at upgrade
    return createAuthPlugin(deps.apiToken)(req, reply, done)
  })

  registerIngestRoute(app, deps.issuesRepo, deps.replaysRepo, deps.broadcaster)
  registerRrwebReplayRoutes(app, deps.issuesRepo, deps.replaysRepo)
  registerAppsRoutes(app, deps.appsRepo)
  registerIssuesRoutes(app, deps.issuesRepo, deps.broadcaster)
}
