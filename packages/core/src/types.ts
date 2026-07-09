import type { Event } from '@sentry/browser'

export interface InitOptions {
  /** Full URL of the server ingest endpoint, e.g. http://localhost:3000/api/ingest/envelope */
  dsn: string
  appId: string
  /** API token; sent as Authorization: Bearer */
  token: string
  release?: string
  environment?: string
  user?: { id: string; [k: string]: unknown }
  whiteScreen?: {
    rootSelector?: string
    stableWindowMs?: number
    minContentNodes?: number
    enableScreenshot?: boolean
  }
  mf?: { host: boolean }
  beforeSend?: (event: Event) => Event | null
}

export interface ReportData {
  type: string
  payload?: Record<string, unknown>
  tags?: Record<string, string>
}
