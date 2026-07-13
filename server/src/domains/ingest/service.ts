import { parseEnvelope, filterSupportedItems } from './envelope.js'
import type { SentryEventPayload } from '@traceability/protocol'
import { AppError } from '../../errors/app-error.js'
import type { IssuesService } from '../issues/service.js'
import type { ReplaysService } from '../replays/service.js'
import type { SourceMapsService } from '../source-maps/service.js'
import type { Broadcaster } from '../../ws/broadcaster.js'

export interface IngestService {
  ingestEnvelope(appId: string, raw: string): { accepted: number }
}

export interface IngestDeps {
  issues: IssuesService
  replays: ReplaysService
  sourceMaps: SourceMapsService
  broadcaster: Broadcaster
}

function getRrwebReplayId(extra: Record<string, unknown> | undefined): string | undefined {
  const replayId = extra?.rrwebReplayId
  return typeof replayId === 'string' && replayId.length > 0 ? replayId : undefined
}

export function createIngestService(deps: IngestDeps): IngestService {
  return {
    ingestEnvelope(appId, raw) {
      if (!raw || typeof raw !== 'string') throw new AppError('empty body', 400, 400)
      let envelope
      try {
        envelope = parseEnvelope(raw)
      } catch {
        throw new AppError('invalid envelope', 400, 400)
      }
      const supported = filterSupportedItems(envelope)
      for (const { payload } of supported) {
        const frames = (payload as SentryEventPayload).exception?.values?.[0]?.stacktrace?.frames ?? []
        const resolvedFrames = deps.sourceMaps.resolveFrames(appId, (payload as SentryEventPayload).release, frames)
        const { issue, created } = deps.issues.ingestEvent(appId, payload as SentryEventPayload, resolvedFrames)
        deps.issues.appendEvent(issue.id, raw)
        const replayId = getRrwebReplayId((payload as SentryEventPayload).extra)
        if (replayId) deps.replays.attachToIssue(replayId, issue.id, appId, (payload as SentryEventPayload).event_id)
        deps.broadcaster.broadcast({ kind: created ? 'issue:created' : 'issue:updated', appId: issue.appId, issueId: issue.id, payload: issue })
      }
      return { accepted: supported.length }
    },
  }
}
