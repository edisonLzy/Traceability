import { describe, expect, it, vi } from 'vitest'
import { fetchMonitorData } from './agent-monitor-data'

describe('fetchMonitorData', () => {
  it('maps Issue and Performance tools to the existing renderer REST endpoints', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: true })

    await fetchMonitorData({
      requestId: 'issue-request',
      sessionId: 'session-1',
      method: 'getIssue',
      appId: 'app-1',
      args: { issueId: 'issue / 1' },
    }, apiFetch)
    await fetchMonitorData({
      requestId: 'performance-request',
      sessionId: 'session-1',
      method: 'getPerformanceSummary',
      appId: 'app-1',
      args: { hours: 168 },
    }, apiFetch)

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/issues/issue%20%2F%201')
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/performance?appId=app-1&hours=168')
  })

  it('checks an Issue belongs to the session application before loading its events', async () => {
    const apiFetch = vi.fn()
      .mockResolvedValueOnce({ appId: 'app-1' })
      .mockResolvedValueOnce([{ id: 'event-1', issueId: 'issue-1' }])

    await fetchMonitorData({
      requestId: 'events-request',
      sessionId: 'session-1',
      method: 'getIssueEvents',
      appId: 'app-1',
      args: { issueId: 'issue-1' },
    }, apiFetch)

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/issues/issue-1')
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/issues/issue-1/events')
  })
})
