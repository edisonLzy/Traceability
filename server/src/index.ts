import 'dotenv/config'
import express, { type Express } from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { createLogger, createRequestLoggerMiddleware, isMainModule } from './shared/index.js'
import { createSwaggerMiddleware } from './middlewares/swagger.js'
import { createResponseMiddleware } from './middlewares/response.js'
import { createGlobalErrorHandlerMiddleware } from './middlewares/error.js'
import { getConfig } from './config.js'
import { openDb } from './db.js'
import { createBroadcaster, attachWebSocket } from './ws/broadcaster.js'
import { healthRouter } from './routes/health.js'
import { createAppsService } from './domains/apps/service.js'
import { createIssuesService } from './domains/issues/service.js'
import { createReplaysService } from './domains/replays/service.js'
import { createPerformanceService } from './domains/performance/service.js'
import { createSourceMapsService } from './domains/source-maps/service.js'
import { createIngestService } from './domains/ingest/service.js'
import { createAppsRouter } from './domains/apps/routes.js'
import { createIssuesRouter } from './domains/issues/routes.js'
import { createReplaysRouter } from './domains/replays/routes.js'
import { createPerformanceRouter } from './domains/performance/routes.js'
import { createIngestRouter } from './domains/ingest/routes.js'

const isProduction = process.env.NODE_ENV === 'production'
const logger = createLogger('traceability-server')

const DEVELOPMENT_API_PATHS = ['./src/domains/**/routes.ts', './src/routes/**/*.ts']
const PRODUCTION_API_PATHS = ['./dist/domains/**/routes.js', './dist/routes/**/*.js']

export function createApp(db: ReturnType<typeof openDb>, broadcaster: ReturnType<typeof createBroadcaster>): Express {
  const sourceMapsService = createSourceMapsService(db)
  const appsService = createAppsService(db, sourceMapsService)
  const issuesService = createIssuesService(db, broadcaster)
  const replaysService = createReplaysService(db, issuesService)
  const performanceService = createPerformanceService(db, appsService)
  const ingestService = createIngestService({ issues: issuesService, replays: replaysService, sourceMaps: sourceMapsService, broadcaster })

  const app = express()

  app.use(createRequestLoggerMiddleware(logger))
  app.use(cors({ origin: true, credentials: false }))
  app.use(express.json({ limit: '6mb' }))
  app.use(createResponseMiddleware())

  createSwaggerMiddleware({
    apiPaths: isProduction ? PRODUCTION_API_PATHS : DEVELOPMENT_API_PATHS,
    docsRoute: '/api-docs',
    title: 'Traceability Server API',
    version: '1.0.0',
    description: 'Sentry-based web monitoring + exception-to-fix loop',
    serverUrl: process.env.SERVER_URL,
  })(app)

  app.use(healthRouter)
  app.use(createAppsRouter({ appsService }))
  app.use(createIssuesRouter({ issuesService }))
  app.use(createReplaysRouter({ replaysService }))
  app.use(createPerformanceRouter({ performanceService }))
  app.use(createIngestRouter({ ingestService }))

  app.use(createGlobalErrorHandlerMiddleware())

  return app
}

function main() {
  const config = getConfig()
  const db = openDb(config.dbPath)
  const broadcaster = createBroadcaster()

  const app = createApp(db, broadcaster)
  const server = createServer(app)

  attachWebSocket(server, broadcaster)

  server.listen(config.port, '0.0.0.0', () => {
    logger.info(`traceability server on http://0.0.0.0:${config.port}`)
    logger.info(`Swagger Docs at http://0.0.0.0:${config.port}/api-docs`)
  })
}

if (isMainModule(import.meta.url)) main()
