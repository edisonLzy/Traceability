import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Database } from 'better-sqlite3'
import { openDb } from '../db.js'
import { createResponseMiddleware } from '../middlewares/response.js'
import { createGlobalErrorHandlerMiddleware } from '../middlewares/error.js'
import { createIngestRouter } from '../domains/ingest/routes.js'
import { createIngestService } from '../domains/ingest/service.js'
import { createIssuesService } from '../domains/issues/service.js'
import { createReplaysService } from '../domains/replays/service.js'
import { createSourceMapsService } from '../domains/source-maps/service.js'
import { createAppsRepo } from '../domains/apps/db.js'
import { createBroadcaster } from '../ws/broadcaster.js'

let app: express.Express
let appId: string
beforeEach(() => {
  const db: Database = openDb(':memory:')
  const apps = createAppsRepo(db)
  appId = apps.create({ name: 'A', repoUrl: 'git@x:a', defaultBranch: 'main' }).id
  const issues = createIssuesService(db, createBroadcaster())
  const replays = createReplaysService(db, issues)
  const sourceMaps = createSourceMapsService(db)
  const ingestService = createIngestService({ issues, replays, sourceMaps, broadcaster: createBroadcaster() })
  app = express()
  app.use(createResponseMiddleware())
  app.use(createIngestRouter({ ingestService }))
  app.use(createGlobalErrorHandlerMiddleware())
})

function envelope(): string {
  const header = JSON.stringify({ event_id: 'e1', sent_at: new Date().toISOString() })
  const itemHeader = JSON.stringify({ type: 'event' })
  const itemPayload = JSON.stringify({ event_id: 'e1', type: 'error', exception: { values: [{ type: 'TypeError', value: 'boom' }] } })
  return [header, itemHeader, itemPayload].join('\n')
}

describe('ingest routes', () => {
  it('POST /api/ingest/envelope/:appId 400 on invalid envelope', async () => {
    const r = await request(app).post(`/api/ingest/envelope/${appId}`).set('Content-Type', 'application/octet-stream').send('not-json')
    expect(r.status).toBe(400)
  })

  it('POST /api/ingest/envelope/:appId 202 and creates an issue', async () => {
    const r = await request(app).post(`/api/ingest/envelope/${appId}`).set('Content-Type', 'application/octet-stream').send(envelope())
    expect(r.status).toBe(202)
    expect(r.body.data).toEqual({ accepted: 1 })
  })

  it('rejects empty body with 400', async () => {
    const r = await request(app).post(`/api/ingest/envelope/${appId}`).set('Content-Type', 'application/octet-stream').send('')
    expect(r.status).toBe(400)
  })
})
