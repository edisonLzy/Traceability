import { request } from '@renderer/lib/request'
import type {
  Event,
  Issue,
  IssueStatus,
  PerformanceSummary,
  RrwebReplay,
  RrwebReplaySummary,
} from '@traceability/protocol'

// ── List Issues ──────────────────────────────────────────────────────────────

export interface ListIssuesParams {
  appId: string
  status?: IssueStatus
  /** Clamped to 1-100, defaults to 20. */
  limit?: number
  cursor?: string
}

export interface ListIssuesResponse {
  items: Issue[]
  nextCursor: string | null
}

export async function listIssues(params: ListIssuesParams): Promise<ListIssuesResponse> {
  const query = new URLSearchParams({ appId: params.appId, limit: String(asLimit(params.limit)) })
  if (params.status) query.set('status', params.status)
  if (params.cursor) query.set('cursor', params.cursor)
  const { data } = await request.get<ListIssuesResponse>(`/api/issues?${query}`)
  return data
}

// ── Get Issue ────────────────────────────────────────────────────────────────

export async function getIssue(issueId: string): Promise<Issue> {
  const { data } = await request.get<Issue>(`/api/issues/${requiredId(issueId, 'issueId')}`)
  return data
}

// ── Get Issue Events ─────────────────────────────────────────────────────────

export async function getIssueEvents(issueId: string): Promise<Event[]> {
  const { data } = await request.get<Event[]>(`/api/issues/${requiredId(issueId, 'issueId')}/events`)
  return data
}

// ── Get Issue Replays ────────────────────────────────────────────────────────

export async function getIssueReplays(issueId: string): Promise<RrwebReplaySummary[]> {
  const { data } = await request.get<RrwebReplaySummary[]>(`/api/issues/${requiredId(issueId, 'issueId')}/replays`)
  return data
}

// ── Get Replay ───────────────────────────────────────────────────────────────

export async function getReplay(issueId: string, replayId: string): Promise<RrwebReplay> {
  const issue = requiredId(issueId, 'issueId')
  const replay = requiredId(replayId, 'replayId')
  const { data } = await request.get<RrwebReplay>(`/api/issues/${issue}/replays/${replay}`)
  return data
}

// ── Get Performance Summary ──────────────────────────────────────────────────

export interface GetPerformanceSummaryParams {
  appId: string
  hours: 1 | 24 | 168
}

export async function getPerformanceSummary(params: GetPerformanceSummaryParams): Promise<PerformanceSummary> {
  const query = new URLSearchParams({ appId: params.appId, hours: String(params.hours) })
  const { data } = await request.get<PerformanceSummary>(`/api/performance?${query}`)
  return data
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function asLimit(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(1, value)) : 20
}

function requiredId(value: string, name: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${name} is required`)
  return encodeURIComponent(value)
}
