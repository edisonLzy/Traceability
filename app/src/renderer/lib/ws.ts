import { getToken, getServer } from '@renderer/store/auth'

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
  const token = getToken()
  const server = getServer()
  if (!token || !server) return
  const wsUrl = server.replace(/^http/, 'ws').replace(/\/$/, '') + `/api/ws?token=${encodeURIComponent(token)}`
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
