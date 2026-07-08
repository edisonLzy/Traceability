import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { getConfig } from './config.js'
import { openDb } from './store/db.js'
import { createAppsRepo } from './store/apps.js'
import { createIssuesRepo } from './store/issues.js'
import { createBroadcaster } from './ws/broadcaster.js'
import { createAuthPlugin } from './auth/token.js'
import { registerApi } from './api/index.js'

async function main() {
  const config = getConfig()
  const db = openDb(config.dbPath)
  const broadcaster = createBroadcaster()
  const appsRepo = createAppsRepo(db)
  const issuesRepo = createIssuesRepo(db)

  const app = Fastify({ logger: true })
  await app.register(websocket)

  app.get('/api/ws', { websocket: true }, (socket, req) => {
    const token = (req.query as { token?: string }).token
    if (token !== config.apiToken) {
      socket.close(4001, 'unauthorized')
      return
    }
    broadcaster.add(socket)
  })

  registerApi(app, { appsRepo, issuesRepo, broadcaster, apiToken: config.apiToken })

  await app.listen({ port: config.port, host: '0.0.0.0' })
  app.log.info(`traceability server on http://0.0.0.0:${config.port}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
