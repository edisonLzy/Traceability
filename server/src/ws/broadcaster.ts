import type { Server } from "node:http";

import { WebSocket, WebSocketServer } from "ws";

export interface IssueEvent {
  kind: "issue:created" | "issue:updated" | "issue:status-changed";
  appId: string;
  issueId: string;
  payload: unknown;
}

export type Broadcaster = ReturnType<typeof createBroadcaster>;

export function createBroadcaster() {
  const subscribers = new Set<WebSocket>();
  return {
    add(ws: WebSocket) {
      subscribers.add(ws);
      ws.on("close", () => subscribers.delete(ws));
    },
    broadcast(event: IssueEvent) {
      const msg = JSON.stringify(event);
      for (const ws of subscribers) {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
      }
    },
    size(): number {
      return subscribers.size;
    },
  };
}

export function attachWebSocket(server: Server, broadcaster: Broadcaster): void {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "", "http://localhost");
    if (pathname === "/api/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        broadcaster.add(ws);
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });
}
