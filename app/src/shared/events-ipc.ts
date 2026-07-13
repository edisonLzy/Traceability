import type { AgentEvent } from "@earendil-works/pi-agent-core";

import type { AskUserQuestionRequestedEvent } from "./ask-user-question-ipc";
import type { AgentModelsIPC } from "./models-ipc";
import type { PermissionRequestedEvent } from "./permissions-ipc";
import type { AgentSessionIPC, SessionPersistenceIPC } from "./session-ipc";
import type { AgentSkillsIPC } from "./skills-ipc";

export type AgentSessionScope = "main" | "side-chat";
type SessionTagged<T> = T & { scope: AgentSessionScope; sessionId: string };
type AgentRuntimeEvent = AgentEvent | PermissionRequestedEvent | AskUserQuestionRequestedEvent;

// main -> renderer events (handoff allowlist; app_update excluded — out of scope).
export const ALLOWED_MAIN_EXPOSE_EVENTS = [
  "agent_start",
  "agent_end",
  "turn_start",
  "turn_end",
  "message_start",
  "message_update",
  "message_end",
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_end",
  "permission_requested",
  "ask_user_question_requested",
] as const;

/**
 * Each agent event is tagged with the sessionId so the renderer can
 * route multi-session events to the correct session's state store.
 */
export type AllowedMainExposeEvents = {
  [K in AgentRuntimeEvent as K["type"]]: SessionTagged<K>;
};

// renderer -> main

export type TraceabilityInvokeIPC = AgentSessionIPC &
  AgentModelsIPC &
  AgentSkillsIPC &
  SessionPersistenceIPC &
  AppShellIPC;

/**
 * App-shell channels (clipboard, window controls) registered as plain
 * zod-validated `ipcMain.handle` in main/index.ts. Exposed through the typed
 * `invoke` allowlist so the preload surface stays uniform (divisor does the
 * same with SystemIPC).
 */
export interface AppShellIPC {
  "clipboard:writeText": (text: string) => Promise<void>;
  "window:minimize": () => Promise<void>;
  "window:toggleMaximize": () => Promise<void>;
  "window:close": () => Promise<void>;
}

export const ALLOWED_RENDER_INVOKE_EVENTS: (keyof TraceabilityInvokeIPC)[] = [
  // AgentSessionIPC
  "prompt",
  "clearAllQueues",
  "abortPrompt",
  "setHistoryMessages",
  "setSessionId",
  "setSessionScope",
  "destroySession",
  "setPermissionMode",
  "resolvePermissionRequest",
  "resolveAskUserQuestion",
  // AgentModelsIPC
  "setModel",
  "getAvailableModels",
  "getModelConfig",
  "saveModelConfig",
  // AgentSkillsIPC
  "listSkills",
  "setSkillEnabled",
  // SessionPersistenceIPC
  "sessions:create",
  "sessions:list",
  "sessions:get",
  "sessions:getEntries",
  "sessions:rename",
  "sessions:delete",
  "sessions:appendEntries",
  // AppShellIPC
  "clipboard:writeText",
  "window:minimize",
  "window:toggleMaximize",
  "window:close",
];

export type AllowedRenderInvokeEvents = (typeof ALLOWED_RENDER_INVOKE_EVENTS)[number];
