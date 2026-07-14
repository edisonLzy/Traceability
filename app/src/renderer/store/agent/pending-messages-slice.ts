import type { AppUserMessage } from "@earendil-works/pi-agent-core";
import type { StateCreator } from "zustand/vanilla";

import type { AgentStoreState } from "./index";

/** Renderer mirror of the Agent's steer/follow-up queues. */
export interface PendingMessagesSlice {
  pendingMessages: Map<string, AppUserMessage[]>;
  getSessionPendingMessages: (sessionId: string) => AppUserMessage[];
  addPendingMessage: (sessionId: string, message: AppUserMessage) => void;
  removePendingMessageByTimestamp: (sessionId: string, timestamp: number) => void;
  clearSessionPendingMessages: (sessionId: string) => void;
}

const EMPTY_PENDING: AppUserMessage[] = [];

export const createPendingMessagesSlice: StateCreator<
  AgentStoreState,
  [],
  [],
  PendingMessagesSlice
> = (set, get) => ({
  pendingMessages: new Map(),
  getSessionPendingMessages: (sessionId) => get().pendingMessages.get(sessionId) ?? EMPTY_PENDING,
  addPendingMessage: (sessionId, message) => {
    set((previous) => {
      const pendingMessages = new Map(previous.pendingMessages);
      pendingMessages.set(sessionId, [...(pendingMessages.get(sessionId) ?? []), message]);
      return { pendingMessages };
    });
  },
  removePendingMessageByTimestamp: (sessionId, timestamp) => {
    set((previous) => {
      const current = previous.pendingMessages.get(sessionId);
      if (!current) return previous;
      const next = current.filter((message) => message.timestamp !== timestamp);
      if (next.length === current.length) return previous;
      const pendingMessages = new Map(previous.pendingMessages);
      if (next.length === 0) pendingMessages.delete(sessionId);
      else pendingMessages.set(sessionId, next);
      return { pendingMessages };
    });
  },
  clearSessionPendingMessages: (sessionId) => {
    set((previous) => {
      if (!previous.pendingMessages.has(sessionId)) return previous;
      const pendingMessages = new Map(previous.pendingMessages);
      pendingMessages.delete(sessionId);
      return { pendingMessages };
    });
  },
});
