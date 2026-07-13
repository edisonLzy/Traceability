import { SERVER_URL } from '@renderer/lib/server'

export interface IssueEvent {
  kind: 'issue:created' | 'issue:updated' | 'issue:status-changed'
  appId: string
  issueId: string
  payload: unknown
}

type Handler = (event: IssueEvent) => void

let socket: WebSocket | null = null
const handlers = new Set<Handler>()

export function connectWs(): void {
  if (!SERVER_URL) return
  const wsUrl = SERVER_URL.replace(/^http/, 'ws') + '/api/ws'
  socket = new WebSocket(wsUrl)
  socket.onmessage = (e) => {
    try {
      const evt = JSON.parse(e.data) as IssueEvent
      handlers.forEach((h) => h(evt))
    } catch {
      // ignore malformed
    }
  }
  socket.onclose = () => {
    socket = null
    setTimeout(connectWs, 3000)
  }
}

export function onIssueEvent(h: Handler): () => void {
  handlers.add(h)
  return () => handlers.delete(h)
}
