import type { Server } from "node:http";

import { WebSocket, WebSocketServer } from "ws";

export interface IssueEvent {
  kind: "issue:created" | "issue:updated" | "issue:status-changed";
  appId: string;
  issueId: string;
  payload: unknown;
}

const subscribers = new Set<WebSocket>();

export function addClient(ws: WebSocket) {
  subscribers.add(ws);
  ws.on("close", () => subscribers.delete(ws));
}

export function broadcast(event: IssueEvent) {
  const msg = JSON.stringify(event);
  for (const ws of subscribers) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

export function subscriberCount() {
  return subscribers.size;
}

/** Reset subscriber state — used by tests for isolation. */
export function resetBroadcaster() {
  subscribers.clear();
}

export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "", "http://localhost");
    if (pathname === "/api/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        addClient(ws);
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });
}
