import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import cors from '@fastify/cors'
import { getConfig } from './config.js'
import { openDb } from './store/db.js'
import { createAppsRepo } from './store/apps.js'
import { createIssuesRepo } from './store/issues.js'
import { createRrwebReplaysRepo } from './store/replays.js'
import { createPerformanceRepo } from './store/performance.js'
import { createSourceMapsRepo } from './store/sourceMaps.js'
import { createBroadcaster } from './ws/broadcaster.js'
import { createAuthPlugin } from './auth/token.js'
import { registerApi } from './api/index.js'

async function main() {
  const config = getConfig()
  const db = openDb(config.dbPath)
  const broadcaster = createBroadcaster()
  const appsRepo = createAppsRepo(db)
  const issuesRepo = createIssuesRepo(db)
  const replaysRepo = createRrwebReplaysRepo(db)
  const performanceRepo = createPerformanceRepo(db)
  const sourceMapsRepo = createSourceMapsRepo(db)

  const app = Fastify({ logger: true })
  await app.register(websocket)
  // Allow the Inbox UI (:5173) and demo (:5174) to call the API cross-origin.
  // Reflect any origin in dev; tighten for production deployment.
  await app.register(cors, { origin: true, credentials: false })

  // Accept raw envelope bodies as a string for content-types the Sentry SDK
  // transport sends (application/octet-stream) and any other raw body. Fastify
  // has no built-in parser for these, so without it the ingest endpoint returns
  // HTTP 415. The '*' catch-all only applies to content-types not matched by a
  // more specific parser, so the octet-stream entry above still takes precedence.
  app.addContentTypeParser('application/octet-stream', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body)
  })
  app.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body)
  })

  app.get('/api/ws', { websocket: true }, (socket, req) => {
    const token = (req.query as { token?: string }).token
    if (token !== config.apiToken) {
      socket.close(4001, 'unauthorized')
      return
    }
    broadcaster.add(socket)
  })

  registerApi(app, { appsRepo, issuesRepo, replaysRepo, performanceRepo, sourceMapsRepo, broadcaster, apiToken: config.apiToken })

  await app.listen({ port: config.port, host: '0.0.0.0' })
  app.log.info(`traceability server on http://0.0.0.0:${config.port}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
