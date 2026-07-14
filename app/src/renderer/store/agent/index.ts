import { createStore } from "zustand/vanilla";

import { createEntriesSlice, type EntriesSlice } from "./entries-slice";
import { createHumanInTheLoopSlice, type HumanInTheLoopSlice } from "./human-in-the-loop-slice";
import { createPendingMessagesSlice, type PendingMessagesSlice } from "./pending-messages-slice";
import { createSessionsSlice, type SessionsSlice } from "./sessions-slice";

export type AgentStoreState = EntriesSlice &
  HumanInTheLoopSlice &
  PendingMessagesSlice &
  SessionsSlice;

export const agentStore = createStore<AgentStoreState>()((...args) => ({
  ...createEntriesSlice(...args),
  ...createHumanInTheLoopSlice(...args),
  ...createPendingMessagesSlice(...args),
  ...createSessionsSlice(...args),
}));

export type { AgentSession } from "./sessions-slice";
export { EntryStatus } from "./entries-slice";
export type {
  MessageEntry,
  SessionEntry,
  SessionStatus,
  ToolExecutionState,
  ToolExecutionStatus,
} from "./entries-slice";
export type { Entry, MonitoringContext, Session, TokenUsage } from "./types";
