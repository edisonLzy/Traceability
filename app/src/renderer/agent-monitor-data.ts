import type { MonitorDataRequest } from '../shared/ipc'

interface ScopedIssue {
  appId: string
}

export async function fetchMonitorData<T>(
  request: MonitorDataRequest,
  apiFetch: <R>(path: string, init?: RequestInit) => Promise<R>,
): Promise<T> {
  switch (request.method) {
    case 'listIssues': {
      const query = new URLSearchParams({ appId: request.appId, limit: String(asLimit(request.args.limit)) })
      if (typeof request.args.status === 'string') query.set('status', request.args.status)
      return apiFetch<T>(`/api/issues?${query}`)
    }
    case 'getIssue':
      return apiFetch<T>(`/api/issues/${requiredString(request.args.issueId, 'issueId')}`)
    case 'getIssueEvents': {
      const issueId = requiredString(request.args.issueId, 'issueId')
      await assertIssueScope(request.appId, issueId, apiFetch)
      return apiFetch<T>(`/api/issues/${issueId}/events`)
    }
    case 'getIssueReplays': {
      const issueId = requiredString(request.args.issueId, 'issueId')
      await assertIssueScope(request.appId, issueId, apiFetch)
      return apiFetch<T>(`/api/issues/${issueId}/replays`)
    }
    case 'getReplay': {
      const issueId = requiredString(request.args.issueId, 'issueId')
      await assertIssueScope(request.appId, issueId, apiFetch)
      return apiFetch<T>(`/api/issues/${issueId}/replays/${requiredString(request.args.replayId, 'replayId')}`)
    }
    case 'getPerformanceSummary':
      return apiFetch<T>(`/api/performance?${new URLSearchParams({ appId: request.appId, hours: String(asHours(request.args.hours)) })}`)
  }
}

async function assertIssueScope(
  appId: string,
  issueId: string,
  apiFetch: <R>(path: string, init?: RequestInit) => Promise<R>,
): Promise<void> {
  const issue = await apiFetch<ScopedIssue>(`/api/issues/${issueId}`)
  if (issue.appId !== appId) throw new Error('Requested Issue belongs to another application')
}

function asLimit(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(1, value)) : 20
}

function asHours(value: unknown): 1 | 24 | 168 {
  return value === 1 || value === 168 ? value : 24
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${name} is required`)
  return encodeURIComponent(value)
}
