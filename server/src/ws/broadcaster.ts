import type { WebSocket } from '@fastify/websocket'

export interface IssueEvent {
  kind: 'issue:created' | 'issue:updated' | 'issue:status-changed'
  appId: string
  issueId: string
  payload: unknown
}

export function createBroadcaster() {
  const subscribers = new Set<WebSocket>()

  return {
    add(ws: WebSocket) {
      subscribers.add(ws)
      ws.on('close', () => subscribers.delete(ws))
    },
    broadcast(event: IssueEvent) {
      const msg = JSON.stringify(event)
      for (const ws of subscribers) {
        if (ws.readyState === ws.OPEN) {
          ws.send(msg)
        }
      }
    },
    size(): number {
      return subscribers.size
    },
  }
}
