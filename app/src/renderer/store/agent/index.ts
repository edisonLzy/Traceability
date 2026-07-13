import { createStore } from "zustand/vanilla";

import { createEntriesSlice, type EntriesSlice } from "./entries-slice";
import { createHumanInputSlice, type HumanInputSlice } from "./human-input-slice";
import { createSessionsSlice, type SessionsSlice } from "./sessions-slice";

export type AgentStoreState = EntriesSlice & HumanInputSlice & SessionsSlice;

export const agentStore = createStore<AgentStoreState>()((...args) => ({
  ...createEntriesSlice(...args),
  ...createHumanInputSlice(...args),
  ...createSessionsSlice(...args),
}));

export type { AgentSession } from "./sessions-slice";
export { EntryStatus } from "./entries-slice";
export type { MessageEntry, SessionEntry, SessionStatus } from "./entries-slice";
