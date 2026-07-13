import type { AgentMessage, AppUserMessage } from "@earendil-works/pi-agent-core";

import type { AskUserQuestionResolution } from "./ask-user-question-ipc";
import type { AgentSessionScope } from "./events-ipc";
import type { AvailableModel } from "./models-ipc";
import type { PermissionMode, PermissionResolution } from "./permissions-ipc";

// ── Persistence shapes (handoff "Session and Entry shapes") ────────────────

export interface Session {
  id: string;
  name: string;
  cwd: string;
  workspaceId: string | null;
  parentSessionId: string | null;
  leafEntryId: string | null;
  createdAt: number;
  updatedAt: number;
  isTop: boolean;
  appId: string; // Traceability-only isolation key
}

export type EntryType = "message" | "model_change";

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export interface TokenUsage {
  turn: Usage;
  latestCall: Usage;
}

export interface Entry {
  id: string;
  sessionId: string;
  parentId: string | null;
  type: EntryType;
  timestamp: number;
  data: Record<string, unknown>;
  tokenUsage?: TokenUsage | null;
}

// ── Runtime control IPC (in-memory; implemented by AgentPool) ──────────────

export interface AgentSessionIPC {
  prompt: (sessionId: string, message: AppUserMessage) => Promise<void>;
  clearAllQueues: (sessionId: string) => Promise<void>;
  abortPrompt: (sessionId: string) => Promise<void>;
  setHistoryMessages: (sessionId: string, messages: AgentMessage[]) => Promise<void>;
  setSessionId: (sessionId: string, appId: string) => Promise<void>;
  setSessionScope: (sessionId: string, scope: AgentSessionScope) => Promise<void>;
  destroySession: (sessionId: string) => Promise<void>;
  setPermissionMode: (sessionId: string, mode: PermissionMode) => Promise<void>;
  resolvePermissionRequest: (
    sessionId: string,
    requestId: string,
    resolution: PermissionResolution,
  ) => Promise<void>;
  resolveAskUserQuestion: (
    sessionId: string,
    requestId: string,
    resolution: AskUserQuestionResolution,
  ) => Promise<void>;
}

// ── Persistence IPC (SQLite; implemented by SessionService) ────────────────

export interface SessionPersistenceIPC {
  "sessions:create": (appId: string) => Promise<Session>;
  "sessions:list": (appId: string) => Promise<Session[]>;
  "sessions:get": (sessionId: string) => Promise<Session | null>;
  "sessions:getEntries": (sessionId: string) => Promise<Entry[]>;
  "sessions:rename": (sessionId: string, name: string) => Promise<void>;
  "sessions:delete": (sessionId: string) => Promise<void>;
  "sessions:appendEntries": (sessionId: string, entries: Entry[]) => Promise<void>;
}
