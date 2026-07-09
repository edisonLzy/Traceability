import type { FastifyInstance } from 'fastify'
import type { RrwebReplayIngestBody } from '@traceability/protocol'
import type { createIssuesRepo } from '../store/issues.js'
import type { createRrwebReplaysRepo } from '../store/replays.js'

type IssuesRepo = ReturnType<typeof createIssuesRepo>
type ReplaysRepo = ReturnType<typeof createRrwebReplaysRepo>

const MAX_REPLAY_BODY_BYTES = 5 * 1024 * 1024

export function registerRrwebReplayRoutes(
  app: FastifyInstance,
  issuesRepo: IssuesRepo,
  replaysRepo: ReplaysRepo,
) {
  app.post<{ Params: { appId: string }; Body: RrwebReplayIngestBody | string }>(
    '/api/ingest/rrweb/:appId',
    { bodyLimit: MAX_REPLAY_BODY_BYTES },
    async (req, reply) => {
      const body = parseReplayBody(req.body)
      if (!body || !Array.isArray(body.events) || body.events.length === 0) {
        return reply.code(400).send({ error: 'events required' })
      }
      const replay = replaysRepo.save(req.params.appId, body)
      return reply.code(201).send(replay)
    },
  )

  app.get<{ Params: { id: string }; Querystring: { limit?: number } }>(
    '/api/issues/:id/replays',
    async (req, reply) => {
      const issue = issuesRepo.get(req.params.id)
      if (!issue) return reply.code(404).send({ error: 'not found' })
      return replaysRepo.listByIssue(req.params.id, req.query.limit)
    },
  )

  app.get<{ Params: { id: string; replayId: string } }>(
    '/api/issues/:id/replays/:replayId',
    async (req, reply) => {
      const issue = issuesRepo.get(req.params.id)
      if (!issue) return reply.code(404).send({ error: 'not found' })
      const replay = replaysRepo.getForIssue(req.params.id, req.params.replayId)
      return replay ? replay : reply.code(404).send({ error: 'not found' })
    },
  )
}

function parseReplayBody(body: RrwebReplayIngestBody | string | undefined): RrwebReplayIngestBody | undefined {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as RrwebReplayIngestBody
    } catch {
      return undefined
    }
  }
  return body
}
