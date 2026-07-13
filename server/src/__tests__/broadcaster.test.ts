import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebSocket } from "ws";

import {
  addClient,
  broadcast,
  subscriberCount,
  resetBroadcaster,
  type IssueEvent,
} from "../ws/broadcaster.js";

beforeEach(() => resetBroadcaster());

function fakeSocket(open: boolean) {
  return {
    readyState: open ? WebSocket.OPEN : 3,
    send: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
}

describe("broadcaster", () => {
  it("broadcasts to open sockets only", () => {
    const open = fakeSocket(true);
    const closed = fakeSocket(false);
    addClient(open);
    addClient(closed);
    const event: IssueEvent = { kind: "issue:created", appId: "a", issueId: "i", payload: {} };
    broadcast(event);
    expect(open.send).toHaveBeenCalledTimes(1);
    expect(closed.send).not.toHaveBeenCalled();
    expect(JSON.parse((open.send as any).mock.calls[0][0])).toMatchObject({
      kind: "issue:created",
    });
    expect(subscriberCount()).toBe(2);
  });
});
