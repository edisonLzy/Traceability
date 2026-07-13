import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import { z } from 'zod'
import type { MonitorDataRequest, MonitorToolMethod } from '../../shared/ipc.js'

interface PendingRequest {
  sessionId: string
  method: MonitorToolMethod
  appId: string
  resolve(result: unknown): void
  reject(error: Error): void
  timeout: ReturnType<typeof setTimeout>
}

export class RendererDataBroker {
  private pending = new Map<string, PendingRequest>()

  constructor(private getWindow: () => BrowserWindow | null) {}

  request<T>(sessionId: string, method: MonitorToolMethod, appId: string, args: Record<string, unknown>): Promise<T> {
    const window = this.getWindow()
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
      return Promise.reject(new Error('Traceability window is unavailable'))
    }

    const requestId = randomUUID()
    const request: MonitorDataRequest = { requestId, sessionId, method, appId, args }
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`Timed out while loading monitoring data for ${method}`))
      }, 30_000)
      this.pending.set(requestId, { sessionId, method, appId, resolve, reject, timeout })
      window.webContents.send('agent:monitor-data-request', request)
    })
  }

  resolve(requestId: string, result: unknown): void {
    const pending = this.take(requestId)
    if (!pending) return
    try {
      pending.resolve(validateMonitorResult(pending.method, pending.appId, result))
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  reject(requestId: string, error: { message: string; code?: string }): void {
    const pending = this.take(requestId)
    if (pending) {
      const reason = new Error(error.message)
      reason.name = error.code ?? 'MonitorDataError'
      pending.reject(reason)
    }
  }

  cancelSession(sessionId: string): void {
    for (const [requestId, pending] of this.pending) {
      if (pending.sessionId !== sessionId) continue
      this.pending.delete(requestId)
      clearTimeout(pending.timeout)
      pending.reject(new Error('Agent session was cancelled'))
    }
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Traceability is closing'))
    }
    this.pending.clear()
  }

  private take(requestId: string): PendingRequest | undefined {
    const pending = this.pending.get(requestId)
    if (!pending) return undefined
    this.pending.delete(requestId)
    clearTimeout(pending.timeout)
    return pending
  }
}

const issueSchema = z.object({
  id: z.string(),
  appId: z.string(),
  title: z.string(),
}).passthrough()

const replaySchema = z.object({
  id: z.string(),
  appId: z.string(),
  issueId: z.string().optional(),
  eventCount: z.number(),
  sizeBytes: z.number(),
  metadata: z.record(z.string(), z.unknown()),
}).passthrough()

const performanceMetricSchema = z.object({
  count: z.number(),
  average: z.number(),
  p75: z.number(),
  lastSeen: z.string(),
  unit: z.string(),
})

const monitorResultSchemas = {
  listIssues: z.object({
    items: z.array(issueSchema),
    nextCursor: z.string().nullable(),
  }).passthrough(),
  getIssue: issueSchema,
  getIssueEvents: z.array(z.object({ id: z.string(), issueId: z.string() }).passthrough()),
  getIssueReplays: z.array(replaySchema),
  getReplay: replaySchema.extend({ events: z.array(z.unknown()) }),
  getPerformanceSummary: z.object({
    since: z.string(),
    apps: z.array(z.object({
      appId: z.string(),
      appName: z.string(),
      samples: z.number(),
      metrics: z.record(z.string(), performanceMetricSchema),
    }).passthrough()),
  }).passthrough(),
} satisfies Record<MonitorToolMethod, z.ZodType>

function validateMonitorResult(method: MonitorToolMethod, appId: string, result: unknown): unknown {
  const belongsToSessionApp = (candidate: { appId: string }) => candidate.appId === appId
  switch (method) {
    case 'listIssues': {
      const parsed = monitorResultSchemas.listIssues.parse(result)
      if (!parsed.items.every(belongsToSessionApp)) {
        throw new Error('Monitoring service returned an Issue outside this session application')
      }
      return parsed
    }
    case 'getIssue': {
      const parsed = monitorResultSchemas.getIssue.parse(result)
      if (!belongsToSessionApp(parsed)) {
        throw new Error('Monitoring service returned an Issue outside this session application')
      }
      return parsed
    }
    case 'getIssueEvents':
      return monitorResultSchemas.getIssueEvents.parse(result)
    case 'getIssueReplays': {
      const parsed = monitorResultSchemas.getIssueReplays.parse(result)
      if (!parsed.every(belongsToSessionApp)) {
        throw new Error('Monitoring service returned replay data outside this session application')
      }
      return parsed
    }
    case 'getReplay': {
      const parsed = monitorResultSchemas.getReplay.parse(result)
      if (!belongsToSessionApp(parsed)) {
        throw new Error('Monitoring service returned replay data outside this session application')
      }
      return parsed
    }
    case 'getPerformanceSummary': {
      const parsed = monitorResultSchemas.getPerformanceSummary.parse(result)
      if (!parsed.apps.every(belongsToSessionApp)) {
        throw new Error('Monitoring service returned Performance data outside this session application')
      }
      return parsed
    }
  }
}
