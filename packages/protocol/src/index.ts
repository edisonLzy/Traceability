// ===== Server data model (spec §4.7) =====

export type IssueStatus = 'open' | 'fix-manual' | 'fixing' | 'fixed' | 'ignored'

export interface Application {
  id: string
  name: string
  repoUrl: string
  defaultBranch: string
  createdAt: string
}

export interface Issue {
  id: string
  appId: string
  fingerprint: string
  title: string
  type: 'error' | 'transaction' | 'message' | 'custom'
  firstSeen: string
  lastSeen: string
  count: number
  status: IssueStatus
  metadata: {
    stacktrace?: string
    message?: string
    context?: Record<string, unknown>
  }
}

export interface Event {
  id: string
  issueId: string
  receivedAt: string
  envelope: string
}

export interface Patch {
  id: string
  issueId: string
  branch: string
  filePath: string
  attachedAt: string
}

// ===== Sentry envelope v7 (subset) =====

export type EnvelopeItemType = 'event' | 'transaction' | 'client_report' | 'session' | 'attachment'

export interface EnvelopeHeader {
  sdk?: { name: string; version: string }
  sent_at?: string
  dsn?: string
  [k: string]: unknown
}

export interface EnvelopeItemHeader {
  type: EnvelopeItemType
  // item payload type discriminator; narrows via `type` above
  [k: string]: unknown
}

export type EnvelopeItem = [EnvelopeItemHeader, unknown]

export interface ParsedEnvelope {
  header: EnvelopeHeader
  items: EnvelopeItem[]
}

// Item payload shapes we actually read (v1: event/transaction/message only)
export interface SentryEventPayload {
  event_id?: string
  type?: 'error' | 'transaction' | 'message' | 'default' | 'custom'
  message?: string
  level?: string
  timestamp?: number | string
  platform?: string
  tags?: Array<[string, string]> | Record<string, string>
  exception?: {
    values?: Array<{
      type?: string
      value?: string
      stacktrace?: { frames?: Array<{ filename?: string; function?: string; lineno?: number; colno?: number }> }
    }>
  }
  transaction?: string
  release?: string
  environment?: string
  contexts?: Record<string, unknown>
  extra?: Record<string, unknown>
}
