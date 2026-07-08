import type { FastifyInstance } from 'fastify'
import type { createIssuesRepo } from '../store/issues.js'
import type { createBroadcaster } from '../ws/broadcaster.js'
import { parseEnvelope, filterSupportedItems } from '../ingest/envelope.js'

type IssuesRepo = ReturnType<typeof createIssuesRepo>
type Broadcaster = ReturnType<typeof createBroadcaster>

export function registerIngestRoute(
  app: FastifyInstance,
  repo: IssuesRepo,
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
