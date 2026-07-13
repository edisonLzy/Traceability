import type { Database } from 'better-sqlite3'
import type { Issue, Event, Patch, IssueStatus, SourceLocation, SentryEventPayload } from '@traceability/protocol'
import { createIssuesRepo } from './db.js'
import { AppError } from '../../errors/app-error.js'
import type { Broadcaster } from '../../ws/broadcaster.js'

export interface IssuesService {
  list(opts: { appId?: string; status?: IssueStatus; limit?: number; cursor?: string }): { items: Issue[]; nextCursor: string | null }
  get(id: string): Issue
  listEvents(id: string, limit?: number): Event[]
  requestFix(id: string): Issue
  attachPatch(id: string, input: { branch: string; patch: string }): Patch
  markFixed(id: string): Issue
  ingestEvent(appId: string, payload: SentryEventPayload, resolvedFrames?: SourceLocation[]): { issue: Issue; created: boolean }
  appendEvent(issueId: string, envelope: string): Event
}

export function createIssuesService(db: Database, broadcaster: Broadcaster): IssuesService {
  const repo = createIssuesRepo(db)
  return {
    list: (opts) => repo.list(opts),
    get: (id) => {
      const issue = repo.get(id)
      if (!issue) throw new AppError('not found', 404, 404)
      return issue
    },
    listEvents: (id, limit) => {
      const issue = repo.get(id)
      if (!issue) throw new AppError('not found', 404, 404)
      return repo.listEvents(id, limit)
    },
    requestFix: (id) => {
      const updated = repo.setStatus(id, 'fix-manual')
      if (!updated) throw new AppError('not found', 404, 404)
      broadcaster.broadcast({ kind: 'issue:status-changed', appId: updated.appId, issueId: updated.id, payload: updated })
      return updated
    },
    attachPatch: (id, input) => {
      const issue = repo.get(id)
      if (!issue) throw new AppError('not found', 404, 404)
      if (!input.branch || !input.patch) throw new AppError('branch + patch required', 400, 400)
      const filePath = `patches/${issue.id}-${Date.now()}.diff`
      const created = repo.attachPatch(id, input.branch, filePath)
      broadcaster.broadcast({ kind: 'issue:updated', appId: issue.appId, issueId: issue.id, payload: created })
      return created
    },
    markFixed: (id) => {
      const updated = repo.setStatus(id, 'fixed')
      if (!updated) throw new AppError('not found', 404, 404)
      broadcaster.broadcast({ kind: 'issue:status-changed', appId: updated.appId, issueId: updated.id, payload: updated })
      return updated
    },
    ingestEvent: (appId, payload, resolvedFrames = []) => repo.ingestEvent(appId, payload, resolvedFrames),
    appendEvent: (issueId, envelope) => repo.appendEvent(issueId, envelope),
  }
}
