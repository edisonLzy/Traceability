import type { FastifyInstance } from 'fastify'
import type { createIssuesRepo } from '../store/issues.js'
import type { createRrwebReplaysRepo } from '../store/replays.js'
import type { createBroadcaster } from '../ws/broadcaster.js'
import { parseEnvelope, filterSupportedItems } from '../ingest/envelope.js'

type IssuesRepo = ReturnType<typeof createIssuesRepo>
type ReplaysRepo = ReturnType<typeof createRrwebReplaysRepo>
type Broadcaster = ReturnType<typeof createBroadcaster>

export function registerIngestRoute(
  app: FastifyInstance,
  repo: IssuesRepo,
  replaysRepo: ReplaysRepo,
  broadcaster: Broadcaster,
) {
  app.post<{ Params: { appId: string } }>('/api/ingest/envelope/:appId', async (req, reply) => {
    const raw = req.body as string
    if (!raw || typeof raw !== 'string') {
      return reply.code(400).send({ error: 'empty body' })
    }
    let envelope
    try {
      envelope = parseEnvelope(raw)
    } catch (e) {
      return reply.code(400).send({ error: 'invalid envelope' })
    }
    const supported = filterSupportedItems(envelope)
    for (const { payload } of supported) {
      const { issue, created } = repo.ingestEvent(req.params.appId, payload)
      repo.appendEvent(issue.id, raw)
      const replayId = getRrwebReplayId(payload.extra)
      if (replayId) {
        replaysRepo.attachToIssue(replayId, issue.id, req.params.appId, payload.event_id)
      }
      broadcaster.broadcast({
        kind: created ? 'issue:created' : 'issue:updated',
        appId: issue.appId,
        issueId: issue.id,
        payload: issue,
      })
    }
    return reply.code(202).send({ accepted: supported.length })
  })
}

function getRrwebReplayId(extra: Record<string, unknown> | undefined): string | undefined {
  const replayId = extra?.rrwebReplayId
  return typeof replayId === 'string' && replayId.length > 0 ? replayId : undefined
}
