import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestGet = vi.hoisted(() => vi.fn())

vi.mock('@renderer/lib/request', () => ({
  request: { get: requestGet },
}))

import { getIssue, getIssueEvents, getPerformanceSummary, getReplay, listIssues } from './monitor'

describe('monitor apis', () => {
  beforeEach(() => {
    requestGet.mockReset()
  })

  it('listIssues builds the issues query with appId and a clamped limit', async () => {
    requestGet.mockResolvedValue({ data: { items: [], nextCursor: null } })
    await listIssues({ appId: 'app-1', limit: 999 })
    expect(requestGet).toHaveBeenCalledWith('/api/issues?appId=app-1&limit=100')
  })

  it('listIssues forwards status when provided', async () => {
    requestGet.mockResolvedValue({ data: { items: [], nextCursor: null } })
    await listIssues({ appId: 'app-1', status: 'open' })
    expect(requestGet).toHaveBeenCalledWith('/api/issues?appId=app-1&limit=20&status=open')
  })

  it('getIssue URL-encodes the issue id', async () => {
    requestGet.mockResolvedValue({ data: { ok: true } })
    await getIssue('issue / 1')
    expect(requestGet).toHaveBeenCalledWith('/api/issues/issue%20%2F%201')
  })

  it('getIssueEvents hits the events endpoint', async () => {
    requestGet.mockResolvedValue({ data: [{ id: 'event-1', issueId: 'issue-1' }] })
    await getIssueEvents('issue-1')
    expect(requestGet).toHaveBeenCalledWith('/api/issues/issue-1/events')
  })

  it('getReplay encodes both the issue and replay ids', async () => {
    requestGet.mockResolvedValue({ data: { events: [] } })
    await getReplay('issue / 1', 'replay / 2')
    expect(requestGet).toHaveBeenCalledWith('/api/issues/issue%20%2F%201/replays/replay%20%2F%202')
  })

  it('getPerformanceSummary builds the performance query', async () => {
    requestGet.mockResolvedValue({ data: { apps: [] } })
    await getPerformanceSummary({ appId: 'app-1', hours: 168 })
    expect(requestGet).toHaveBeenCalledWith('/api/performance?appId=app-1&hours=168')
  })
})
