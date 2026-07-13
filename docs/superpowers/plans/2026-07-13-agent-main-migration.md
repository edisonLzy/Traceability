# Agent Main Process Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the reusable Agent core from `divisor-agent/packages/app/src/main` into Traceability's Electron app main process, plus the shared IPC contract and preload bridge it depends on — yielding a locally-persisted, streaming chat Agent with model selection, Skills, TipTap input surface, and human-in-the-loop flows (tools empty this phase).

**Architecture:** Main-process code is ported as close to divisor-agent as possible (verbatim copies where feasible). Two adaptations are forced: (1) extensions + builtin tools are out of scope → `tools: []` and the extension/stt/app-updater/fs/terminal modules are dropped; (2) `@divisor-agent/extension-core` is not a Traceability dependency → its 5 HIL type definitions are inlined into `shared/ask-user-question-ipc.ts` byte-for-byte. Persistence is Traceability-original (divisor has none): a new `main/sessions/` SQLite layer (better-sqlite3) owns Session/Entry storage; the runtime is persistence-agnostic and stays in-memory, with the renderer batch-persisting after `agent_end` (renderer migration is a separate later plan).

**Tech Stack:** Electron 39, electron-vite, `@earendil-works/pi-agent-core` 0.74 + `@earendil-works/pi-ai` 0.74, Emittery 2, TipTap 3 (`JSONContent`), better-sqlite3 11, uuid 14, zod 4, vitest 4, TypeScript strict.

## Global Constraints

- **Code parity:** Migrated modules MUST stay as close to `divisor-agent/packages/app/src/main` (and `src/shared`, `src/preload`) as possible. Where a file is copied verbatim, the task says "copy verbatim from `<path>`"; the implementer reads that path and reproduces it. Only the exact edits listed in the task are applied. No silent rewrites.
- **ESM `.js` import specifiers:** `app/src/main` and `app/src/shared` are ESM built by electron-vite with `externalizeDeps: true`. Relative imports use a `.js` suffix (e.g. `"./agent-runtime.js"`) even though the source is `.ts` — match divisor's specifier style exactly. (Renderer alias `@shared` does NOT apply in main/preload — use relative paths.)
- **`import type`** for type-only imports. TypeScript strict + `noUncheckedIndexedAccess`.
- **Strictly pnpm:** `pnpm exec` / `pnpm install`, never npx/npm/yarn.
- **Native deps:** `better-sqlite3` is already listed in root `onlyBuiltDependencies`; `app/postinstall` runs `electron-builder install-app-deps` which rebuilds it for Electron's ABI. Use better-sqlite3 (NOT `node:sqlite`) for the sessions DB.
- **`uuid` package:** install and use `import { v4 as uuidv4 } from "uuid"` (matches divisor HIL verbatim — do NOT substitute `node:crypto.randomUUID`).
- **Out of scope this plan:** renderer migration (Zustand store, hooks, TipTap UI, message virtualization, HIL panels, `agent_end` persistence wiring), monitor tools, extensions/plugins, Artifacts, side chat, browser, terminal, filesystem tools, subagents, STT, app-updater, `runOneTimeAgent`.
- **Handoff doc:** `docs/superpowers/plans/2026-07-13-agent-core-migration.md` (fixed decisions + target layout + validation). This plan implements its §"Data Contracts and Persistence", §"Main Process Migration", and §"Shared IPC and Message Types".
- **Reference repo:** divisor-agent is a working directory at `/Users/zhiyu/Desktop/coding/divisor-agent`. All "copy verbatim from" paths are relative to that root.
- **Commits:** Conventional Commits (`feat`, `fix`, `chore`, `docs`, …). Each task ends with a commit. Never commit failing MAIN tests or a failing node-side type-check (`tsconfig.node.json`). The web type-check (`tsconfig.web.json`) and full `electron-vite build` are accepted-red once `shared/ipc.ts` is deleted (Task 13) - the renderer plan repairs them; husky/lint-staged only runs oxlint on staged files, so it will not block these commits.

---

## File Structure

### `app/src/shared/` (replace single `ipc.ts` with split contract)

| File | Responsibility | Source |
|---|---|---|
| `agent-message.ts` | `AppUserMessage` declaration-merge into `@earendil-works/pi-agent-core` + `MonitoringContext` (Traceability-only extension) | edited from divisor `shared/agent-message.ts` |
| `models-ipc.ts` | `AvailableModel`, `ModelsConfigFile`, `ModelsConfigPayload`, `AgentModelsIPC` | verbatim divisor |
| `skills-ipc.ts` | `DiscoveredSkill`, `SkillScope`, `AgentSkillsIPC` | verbatim divisor |
| `permissions-ipc.ts` | `PermissionMode`, `PermissionPayload/Request/Resolution`, `PermissionRequestedEvent`, helpers | verbatim divisor |
| `ask-user-question-ipc.ts` | `AskUserQuestion*` types (inlined from extension-core) + `AskUserQuestionRequest/RequestedEvent/Resolution` | edited (inline extension-core types) |
| `session-ipc.ts` | `Session`, `Entry`, `TokenUsage`/`Usage`, `AgentSessionIPC` (control), `SessionPersistenceIPC` (storage) | original (shapes per handoff) |
| `events-ipc.ts` | `AgentSessionScope`, event allowlist, `AllowedMainExposeEvents`, invoke allowlist, `TraceabilityInvokeIPC` | edited from divisor (drop app_update/system/fs) |
| `ipc.ts` | DELETED | — |

### `app/src/main/` (flatten `main/agent/` + `main/db/`)

| File | Responsibility | Source |
|---|---|---|
| `agent-ipc.ts` | `AbstractAgentIPCHandler` base (browser-window mgmt + `typedIpcMain`) | verbatim divisor |
| `agent-runtime.ts` | `AgentRuntime extends Emittery` — per-session runtime, prompt/steer/follow-up, abort, HIL wiring, appId validation | edited from divisor (strip extensions/tools/runOneTimeAgent + add appId) |
| `agent-runtime.test.ts` | runtime behavior tests | original TDD |
| `agent-pool.ts` | `AgentPool` — per-session runtime map, Emittery forwarding, IPC bind, models/skills passthrough | edited from divisor (strip extensions + appId in setSessionId) |
| `models/index.ts` + `models/registry.ts` | `ModelRegistry` — reads `~/.pi/agent/models.json`, resolve/getConfig/saveConfig | verbatim divisor |
| `prompt/index.ts` + `prompt/system-prompt-service.ts` + `prompt/identity.ts` | `SystemPromptService` + `SystemPromptBuilder` + Traceability identity prompt | first two verbatim divisor; `identity.ts` original |
| `skills/index.ts` + `skills/skill-service.ts` | `SkillService` — discovers `SKILL.md`, `expandSkillReferences`, `buildSystemPrompt` | verbatim divisor (retarget settings path) |
| `human-in-the-loop/abstract-human-in-the-loop.ts` | `AbstractHumanInTheLoop` base | verbatim divisor |
| `human-in-the-loop/ask-user-question-service.ts` | `AskUserQuestionService` | verbatim divisor (import inlined types from shared) |
| `human-in-the-loop/permission-service.ts` | `PermissionService` | verbatim divisor |
| `sessions/database.ts` | `LocalDatabase` — better-sqlite3 connection + migration runner (id=1 legacy + id=2 session schema) | original (replaces old `db/database.ts`) |
| `sessions/session-schema.ts` | migration id=2 SQL + `SessionRow`/`EntryRow` + `toSession`/`toEntry` mappers | original |
| `sessions/session-service.ts` | `SessionService` implements `SessionPersistenceIPC` | original TDD |
| `sessions/session-service.test.ts` | persistence tests | original TDD |
| `sessions/index.ts` | barrel | original |
| `index.ts` | app entry — instantiate pool + DB + session service, register IPC | rewritten |
| `env.d.ts` | electron-vite env (unchanged) | keep |
| `agent/` (dir) | DELETED (agent-pool, agent-runtime, agent-runtime.test, model-registry, monitor, session-store) | — |
| `db/database.ts` | DELETED | — |

### `app/src/preload/`

| File | Responsibility | Source |
|---|---|---|
| `index.ts` | typed allowlisted `window.traceability.invoke()` + `.on()` | edited from divisor (name `traceability`, drop extensions, add sessions channels) |

### `app/src/renderer/` (NOT touched this plan)

| File | Change |
|---|---|
| (all renderer files) | none - the renderer is migrated in the next plan |

The live renderer (`pages/_layout/index.tsx`, `_components/{AgentPanel,CommandPalette,Titlebar,Sidebar}`, `lib/agent-events.ts`, and the issues/performance pages) still imports the deleted `@shared/ipc` and the old `window.traceability.*` granular API. After this plan the web type-check and full `electron-vite build` are **intentionally red**; the next plan rebuilds the renderer against the new `invoke/on` contract. (The root `Layout.tsx` is already orphaned - `router.tsx` uses `@renderer/pages/_layout` - and is left for the renderer plan to clean up.)
---

## Phase M1 — Dependencies & Shared Contract

### Task 1: Install dependencies

**Files:**
- Modify: `app/package.json`

**Interfaces:**
- Produces: `uuid`, `better-sqlite3`, `@types/uuid`, `@types/better-sqlite3`, `@tiptap/core` resolvable from `app/src`.

- [ ] **Step 1: Add dependencies to `app/package.json`**

In `dependencies`, add (keep alphabetical order within the object):

```json
    "@tiptap/core": "catalog:",
    "better-sqlite3": "^11.0.0",
    "uuid": "^14.0.0",
```

In `devDependencies`, add:

```json
    "@types/better-sqlite3": "^7.6.0",
    "@types/uuid": "^11.0.0",
```

(`@tiptap/core` uses `catalog:` because `pnpm-workspace.yaml` catalogs it at `^3.22.5`. `better-sqlite3`/`uuid`/types are not cataloged — use the explicit versions, matching `server/package.json` for better-sqlite3 and divisor's `app/package.json` for uuid.)

- [ ] **Step 2: Install and rebuild native deps**

Run: `pnpm install`
Expected: install succeeds; `app/postinstall` (`electron-builder install-app-deps`) rebuilds `better-sqlite3` against Electron's ABI. `better-sqlite3` is already in root `onlyBuiltDependencies`, so no pnpm gate error.

- [ ] **Step 3: Verify better-sqlite3 loads under Electron's runtime**

Run: `pnpm --filter @traceability/app exec electron-vite build 2>&1 | tail -5` (smoke build; the native module is externalized so build won't bundle it). Then verify the types resolve:

Run: `pnpm --filter @traceability/app exec tsc --noEmit -p app/tsconfig.node.json`
Expected: no "Cannot find module 'better-sqlite3'" / 'uuid' / '@tiptap/core' errors (there may be pre-existing unrelated errors from the not-yet-migrated code — that is fine for this task; only confirm the three new modules resolve).

- [ ] **Step 4: Commit**

```bash
git add app/package.json pnpm-lock.yaml
git commit -m "chore(app): add uuid, better-sqlite3, @tiptap/core for agent core migration"
```

---

### Task 2: `shared/agent-message.ts` — AppUserMessage + MonitoringContext

**Files:**
- Create: `app/src/shared/agent-message.ts`

**Interfaces:**
- Produces: `AppUserMessage` (declaration-merged into `@earendil-works/pi-agent-core`), `AppUserMessageKind`, `MonitoringContext`.
- Consumes: `AvailableModel` from `./models-ipc` (Task 3), `JSONContent` from `@tiptap/core` (Task 1).

- [ ] **Step 1: Write the file**

Create `app/src/shared/agent-message.ts` with this exact content (this is divisor's `shared/agent-message.ts` with the `metadata.monitoringContext` extension added — the only Traceability-specific field; divisor field names/shapes preserved unchanged):

```ts
import "@earendil-works/pi-agent-core";
import type { UserMessage } from "@earendil-works/pi-ai";
import type { JSONContent } from "@tiptap/core";

import type { AvailableModel } from "./models-ipc";

/**
 * Traceability-only extension to the divisor AppUserMessage metadata.
 * Carries the page context the renderer used to attach (issue / performance
 * / metric being viewed). Its `appId` MUST match the session's appId before
 * the runtime accepts the message.
 */
export interface MonitoringContext {
  appId: string;
  source: "general" | "issue" | "performance" | "metric";
  issueId?: string;
  metricName?: string;
  hours?: 1 | 24 | 168;
}

declare module "@earendil-works/pi-agent-core" {
  type AppUserMessageKind = "prompt" | "follow-up" | "steering";

  interface AppUserMessage extends UserMessage {
    kind: AppUserMessageKind;
    jsonContent: JSONContent;
    metadata?: {
      model?: Pick<AvailableModel, "modelId" | "providerId">;
      skillIds?: string[];
      monitoringContext?: MonitoringContext;
    };
  }

  interface CustomAgentMessages {
    AppUserMessage: AppUserMessage;
  }
}
```

- [ ] **Step 2: Verify it type-checks in isolation**

Run: `pnpm --filter @traceability/app exec tsc --noEmit -p app/tsconfig.node.json`
Expected: `agent-message.ts` compiles (it imports `./models-ipc` which doesn't exist yet — so this step will error on that import; that is expected and fine. Proceed; Task 3 creates `models-ipc.ts`.)

- [ ] **Step 3: Commit**

```bash
git add app/src/shared/agent-message.ts
git commit -m "feat(app/shared): add AppUserMessage contract with monitoringContext extension"
```

---

### Task 3: Verbatim shared ports — models-ipc, skills-ipc, permissions-ipc, ask-user-question-ipc

**Files:**
- Create: `app/src/shared/models-ipc.ts`
- Create: `app/src/shared/skills-ipc.ts`
- Create: `app/src/shared/permissions-ipc.ts`
- Create: `app/src/shared/ask-user-question-ipc.ts`

**Interfaces:**
- Produces: `AvailableModel`, `ModelsConfigFile`, `ModelsConfigPayload`, `ModelDefinitionConfig`, `ProviderDefinitionConfig`, `ModelCostConfig`, `AgentModelsIPC` (models); `DiscoveredSkill`, `SkillScope`, `AgentSkillsIPC` (skills); `PermissionMode`, `PermissionPayload`, `PermissionRequest`, `PermissionResolution`, `PermissionRequestedEvent`, `getPermissionCommandText`, `getPermissionCommandPrefix` (permissions); `AskUserQuestionOption`, `AskUserQuestion`, `AskUserQuestionInput`, `AskUserQuestionAnswer`, `AskUserQuestionResult`, `AskUserQuestionRequest`, `AskUserQuestionRequestedEvent`, `AskUserQuestionResolution` (ask-user-question).

- [ ] **Step 1: Copy `models-ipc.ts` verbatim**

Copy `divisor-agent/packages/app/src/shared/models-ipc.ts` → `app/src/shared/models-ipc.ts` byte-for-byte (no changes).

- [ ] **Step 2: Copy `skills-ipc.ts` verbatim**

Copy `divisor-agent/packages/app/src/shared/skills-ipc.ts` → `app/src/shared/skills-ipc.ts` byte-for-byte (no changes).

- [ ] **Step 3: Copy `permissions-ipc.ts` verbatim**

Copy `divisor-agent/packages/app/src/shared/permissions-ipc.ts` → `app/src/shared/permissions-ipc.ts` byte-for-byte (no changes).

- [ ] **Step 4: Write `ask-user-question-ipc.ts` with inlined extension-core types**

divisor's `ask-user-question-ipc.ts` imports `AskUserQuestionInput`/`AskUserQuestionResult` from `@divisor-agent/extension-core/common`, which is not a Traceability dependency. Inline those 5 interfaces verbatim (source: `divisor-agent/packages/extension-core/src/common/human-in-the-loop.ts`) and drop the extension-core import. Create `app/src/shared/ask-user-question-ipc.ts` with this exact content:

```ts
export interface AskUserQuestionOption {
  label: string;
  description: string;
}

export interface AskUserQuestion {
  header: string;
  question: string;
  options: AskUserQuestionOption[];
  multiSelect?: boolean;
}

export interface AskUserQuestionInput {
  questions: AskUserQuestion[];
}

export interface AskUserQuestionAnswer {
  question: string;
  selectedOptions: string[];
  customAnswer?: string;
}

export interface AskUserQuestionResult {
  answers: AskUserQuestionAnswer[];
  additionalNote?: string;
}

export interface AskUserQuestionRequest extends AskUserQuestionInput {
  requestId: string;
  createdAt: number;
  kind: "ask_user_question";
}

export interface AskUserQuestionRequestedEvent extends AskUserQuestionRequest {
  type: "ask_user_question_requested";
}

export type AskUserQuestionResolution = AskUserQuestionResult;
```

- [ ] **Step 5: Verify type-check**

Run: `pnpm --filter @traceability/app exec tsc --noEmit -p app/tsconfig.node.json`
Expected: these four files compile cleanly (Task 2's `agent-message.ts` now resolves `./models-ipc`). Other pre-existing errors elsewhere are still fine.

- [ ] **Step 6: Commit**

```bash
git add app/src/shared/models-ipc.ts app/src/shared/skills-ipc.ts app/src/shared/permissions-ipc.ts app/src/shared/ask-user-question-ipc.ts
git commit -m "feat(app/shared): port models/skills/permissions/ask-user-question IPC from divisor-agent"
```

---

### Task 4: `shared/session-ipc.ts` — Session/Entry shapes + control + persistence IPC

**Files:**
- Create: `app/src/shared/session-ipc.ts`

**Interfaces:**
- Produces: `Session`, `Entry`, `EntryType`, `TokenUsage`, `Usage`, `AgentSessionIPC` (runtime control — consumed by `AgentPool`/`AgentRuntime`), `SessionPersistenceIPC` (storage — consumed by `SessionService`).
- Consumes: `AgentMessage` from `@earendil-works/pi-agent-core`; `AppUserMessage` (Task 2); `AgentSessionScope` from `./events-ipc` (Task 5); `AvailableModel` from `./models-ipc` (Task 3); `PermissionMode`, `PermissionResolution` from `./permissions-ipc` (Task 3); `AskUserQuestionResolution` from `./ask-user-question-ipc` (Task 3).

- [ ] **Step 1: Write the file**

Create `app/src/shared/session-ipc.ts` with this exact content. This is divisor's `AgentSessionIPC` (minus `runOneTimeAgent`, plus `appId` on `setSessionId`) plus the handoff `Session`/`Entry` shapes plus the new `SessionPersistenceIPC`:

```ts
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
```

- [ ] **Step 2: Commit (type-check deferred — events-ipc.ts from Task 5 is the missing import)**

```bash
git add app/src/shared/session-ipc.ts
git commit -m "feat(app/shared): add Session/Entry shapes, AgentSessionIPC, SessionPersistenceIPC"
```

---

### Task 5: `shared/events-ipc.ts` — event + invoke allowlists

**Files:**
- Create: `app/src/shared/events-ipc.ts`

**Interfaces:**
- Produces: `AgentSessionScope`, `ALLOWED_MAIN_EXPOSE_EVENTS`, `AllowedMainExposeEvents`, `ALLOWED_RENDER_INVOKE_EVENTS`, `AllowedRenderInvokeEvents`, `TraceabilityInvokeIPC`, `AppShellIPC`.
- Consumes: `AgentEvent` from `@earendil-works/pi-agent-core`; `AskUserQuestionRequestedEvent` (Task 3); `PermissionRequestedEvent` (Task 3); `AgentSessionIPC`, `SessionPersistenceIPC` (Task 4); `AgentModelsIPC` (Task 3); `AgentSkillsIPC` (Task 3).

- [ ] **Step 1: Write the file**

Create `app/src/shared/events-ipc.ts` with this exact content. This is divisor's `events-ipc.ts` with `app_update`/`AppUpdateIPC`/`AppUpdateEvent`, `FileSystemIPC`, and `SystemIPC` removed (all out of scope), `runOneTimeAgent`/`setModel`(keep setModel)/fs/system/update channels dropped from the invoke allowlist, `SessionPersistenceIPC` added to the union, and the union renamed `TraceabilityInvokeIPC`:

```ts
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
```

- [ ] **Step 2: Verify the whole shared contract type-checks**

Run: `pnpm --filter @traceability/app exec tsc --noEmit -p app/tsconfig.node.json`
Expected: `app/src/shared/*.ts` all compile. (Pre-existing errors in `app/src/main/agent/*` and `app/src/preload/index.ts` are still expected — they still import the old `shared/ipc.ts` and are replaced in M2. Do not fix them here.)

- [ ] **Step 3: Commit**

```bash
git add app/src/shared/events-ipc.ts
git commit -m "feat(app/shared): add trimmed event + invoke allowlists (drop app_update/system/fs)"
```

---

## Phase M2 — Agent Core (in-memory, no persistence)

> M2 ports the divisor agent core verbatim (minus extensions/tools/`runOneTimeAgent`) and wires it into `main/index.ts` + `preload/index.ts`. At the M2 checkpoint the Agent runs fully in-memory (sessions lost on restart — this matches divisor exactly). The old `main/agent/*`, `main/db/*`, and `shared/ipc.ts` are deleted. M3 adds persistence without touching the runtime.

### Task 6: `main/models/` — ModelRegistry (verbatim)

**Files:**
- Create: `app/src/main/models/index.ts`
- Create: `app/src/main/models/registry.ts`

**Interfaces:**
- Produces: `ModelRegistry`, `CustomModel`, `CustomProvider`, `CustomProvidersConfig`.

- [ ] **Step 1: Copy `models/index.ts` verbatim**

Copy `divisor-agent/packages/app/src/main/models/index.ts` → `app/src/main/models/index.ts` byte-for-byte.

- [ ] **Step 2: Copy `models/registry.ts` and make `configPath` injectable**

Copy `divisor-agent/packages/app/src/main/models/registry.ts` -> `app/src/main/models/registry.ts`. (Its `import type { ... } from "../../shared/models-ipc.js"` resolves to the file created in Task 3.) Then make one testability edit - divisor hardcodes `configPath` as a field initializer, which prevents isolated tests from pointing at a temp `models.json`. Promote it to an optional constructor param with the same default (production behavior is identical):

Find:
```ts
export class ModelRegistry {
  private readonly configPath = resolve(homedir(), ".pi", "agent", "models.json");
  private customProvider = new Map<string, CustomProvider>();
  private loadedModels = new Map<ModelKey, Model<any>>();
  private ready: Promise<void>;

  constructor() {
    this.ready = this.reload();
  }
```
Replace with:
```ts
export class ModelRegistry {
  private readonly configPath: string;
  private customProvider = new Map<string, CustomProvider>();
  private loadedModels = new Map<ModelKey, Model<any>>();
  private ready: Promise<void>;

  constructor(configPath = resolve(homedir(), ".pi", "agent", "models.json")) {
    this.configPath = configPath;
    this.ready = this.reload();
  }
```

Leave every other method byte-for-byte identical to divisor. This is the only intentional deviation in the models module, made so `AgentRuntime` tests can load an isolated faux provider config.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/models/
git commit -m "feat(app/main): port ModelRegistry from divisor-agent"
```

---

### Task 7: `main/prompt/` + `main/skills/` (verbatim, one settings-path retarget)

**Files:**
- Create: `app/src/main/prompt/index.ts`
- Create: `app/src/main/prompt/system-prompt-service.ts`
- Create: `app/src/main/prompt/identity.ts`
- Create: `app/src/main/skills/index.ts`
- Create: `app/src/main/skills/skill-service.ts`

**Interfaces:**
- Produces: `SystemPromptService`, `SystemPromptBuilder`, `TRACEABILITY_IDENTITY_PROMPT`, `SkillService`.

- [ ] **Step 1: Copy `prompt/index.ts` verbatim**

Copy `divisor-agent/packages/app/src/main/prompt/index.ts` → `app/src/main/prompt/index.ts` byte-for-byte.

- [ ] **Step 2: Copy `prompt/system-prompt-service.ts` verbatim**

Copy `divisor-agent/packages/app/src/main/prompt/system-prompt-service.ts` → `app/src/main/prompt/system-prompt-service.ts` byte-for-byte.

- [ ] **Step 3: Write `prompt/identity.ts` (original)**

Create `app/src/main/prompt/identity.ts` with this content (the base Traceability identity; `SystemPromptService` composes Skill instructions on top of it). Tools are empty this phase, so the prompt makes no tool claims:

```ts
/**
 * Base identity prompt for the Traceability Agent.
 *
 * `SystemPromptService` composes enabled Skill instructions on top of this
 * string. Kept tool-agnostic because the runtime starts with `tools: []`.
 */
export const TRACEABILITY_IDENTITY_PROMPT = [
  "You are Traceability Agent, a helpful local coding and triage assistant.",
  "Answer clearly and concisely. When the user references a monitored issue or",
  "performance metric, use the provided page context to ground your response.",
  "Never claim to have changed source code, application settings, issue status,",
  "or remote data unless a tool that performs that action is available to you.",
].join("\n");
```

- [ ] **Step 4: Copy `skills/index.ts` verbatim**

Copy `divisor-agent/packages/app/src/main/skills/index.ts` → `app/src/main/skills/index.ts` byte-for-byte.

- [ ] **Step 5: Copy `skills/skill-service.ts` and retarget the settings path**

Copy `divisor-agent/packages/app/src/main/skills/skill-service.ts` → `app/src/main/skills/skill-service.ts`. Then make exactly one edit — change the settings file path from divisor's product dir to Traceability's:

Find:
```ts
const CONFIG_FILE_PATH = join(homedir(), ".divisor-agent", "skills-settings.json");
```
Replace with:
```ts
const CONFIG_FILE_PATH = join(homedir(), ".traceability", "skills-settings.json");
```

Leave everything else (skill discovery paths `~/.pi/agent/skills`, `~/.agents/skills`, `~/.codex/skills`, project `.agents`/`.pi`/`.codex` traversal, `expandSkillReferences`, `buildSystemPrompt`, frontmatter parsing) byte-for-byte identical to divisor.

- [ ] **Step 6: Commit**

```bash
git add app/src/main/prompt/ app/src/main/skills/
git commit -m "feat(app/main): port SystemPromptService + SkillService (retarget settings path)"
```

---

### Task 8: `main/human-in-the-loop/` (verbatim, inlined types)

**Files:**
- Create: `app/src/main/human-in-the-loop/abstract-human-in-the-loop.ts`
- Create: `app/src/main/human-in-the-loop/ask-user-question-service.ts`
- Create: `app/src/main/human-in-the-loop/permission-service.ts`

**Interfaces:**
- Produces: `AbstractHumanInTheLoop`, `HumanInTheLoopRequest`, `HumanInTheLoopCancelledError`, `AskUserQuestionService`, `PermissionService`.

- [ ] **Step 1: Copy `abstract-human-in-the-loop.ts` verbatim**

Copy `divisor-agent/packages/app/src/main/human-in-the-loop/abstract-human-in-the-loop.ts` → `app/src/main/human-in-the-loop/abstract-human-in-the-loop.ts` byte-for-byte. (It uses `import { v4 as uuidv4 } from "uuid"` — keep verbatim; `uuid` is installed in Task 1.)

- [ ] **Step 2: Copy `ask-user-question-service.ts` and repoint the type import**

Copy `divisor-agent/packages/app/src/main/human-in-the-loop/ask-user-question-service.ts` → `app/src/main/human-in-the-loop/ask-user-question-service.ts`. Make exactly one edit — replace the extension-core import with the inlined shared types:

Find:
```ts
import type {
  AskUserQuestionInput,
  AskUserQuestionResult,
} from "@divisor-agent/extension-core/common";

import { AbstractHumanInTheLoop } from "./abstract-human-in-the-loop.js";
```
Replace with:
```ts
import type {
  AskUserQuestionInput,
  AskUserQuestionResult,
} from "../../shared/ask-user-question-ipc.js";

import { AbstractHumanInTheLoop } from "./abstract-human-in-the-loop.js";
```

Leave the rest of the file (validation logic, `parsePayload`, `parseResult`) byte-for-byte identical to divisor.

- [ ] **Step 3: Copy `permission-service.ts` verbatim**

Copy `divisor-agent/packages/app/src/main/human-in-the-loop/permission-service.ts` → `app/src/main/human-in-the-loop/permission-service.ts` byte-for-byte (its imports `../../shared/permissions-ipc.js` and `./abstract-human-in-the-loop.js` both resolve correctly).

- [ ] **Step 4: Commit**

```bash
git add app/src/main/human-in-the-loop/
git commit -m "feat(app/main): port human-in-the-loop services (inline extension-core types)"
```

---

### Task 9: `main/agent-ipc.ts` (verbatim)

**Files:**
- Create: `app/src/main/agent-ipc.ts`

**Interfaces:**
- Produces: `AbstractAgentIPCHandler`, `createTypedIpcMain`.

- [ ] **Step 1: Copy verbatim**

Copy `divisor-agent/packages/app/src/main/agent-ipc.ts` → `app/src/main/agent-ipc.ts` byte-for-byte (no changes).

- [ ] **Step 2: Commit**

```bash
git add app/src/main/agent-ipc.ts
git commit -m "feat(app/main): port AbstractAgentIPCHandler base"
```

---

### Task 10: `main/agent-runtime.ts` — TDD (test then implementation)

**Files:**
- Create: `app/src/main/agent-runtime.test.ts` (test first)
- Create: `app/src/main/agent-runtime.ts` (implementation)
- Test: `app/src/main/agent-runtime.test.ts`

**Interfaces:**
- Consumes: `ModelRegistry` (Task 6), `SkillService` (Task 7), `SystemPromptService` + `TRACEABILITY_IDENTITY_PROMPT` (Task 7), `PermissionService` + `AskUserQuestionService` (Task 8), `AppUserMessage` (Task 2).
- Produces: `AgentRuntime` class — `setSessionId(sessionId, appId)`, `prompt(message)`, `setHistoryMessages(messages)`, `setModel(model)`, `abortPrompt()`, `resolvePermissionRequest(...)`, `resolveAskUserQuestion(...)`, `destroy()`, `waitForIdle()`, plus the `AgentRuntimeDelegate` derived type.

- [ ] **Step 1: Write the failing test**

Create `app/src/main/agent-runtime.test.ts` with this content:

```ts
import { fauxAssistantMessage, fauxText, registerFauxProvider } from "@earendil-works/pi-ai";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AgentRuntime } from "./agent-runtime.js";
import { ModelRegistry } from "./models/index.js";
import { SkillService } from "./skills/index.js";

const fauxProviders: Array<{ unregister: () => void }> = [];

describe("AgentRuntime", () => {
  afterEach(() => {
    for (const provider of fauxProviders.splice(0)) provider.unregister();
  });

  async function makeRuntime(appId = "app-1") {
    const dir = await mkdtemp(join(tmpdir(), "traceability-runtime-"));
    const modelPath = join(dir, "models.json");
    await writeFile(
      modelPath,
      JSON.stringify({
        providers: {
          faux: {
            api: "faux",
            baseUrl: "http://faux.local",
            apiKey: "unused",
            models: [{ id: "rt-test", name: "Runtime Test" }],
          },
        },
      }),
    );
    const models = new ModelRegistry(modelPath);
    await models.reload();
    const runtime = new AgentRuntime(models, new SkillService(dir));
    runtime.setSessionId("session-1", appId);
    return { runtime, models };
  }

  function registerFaux() {
    const faux = registerFauxProvider({
      provider: "faux",
      api: "faux",
      models: [{ id: "rt-test" }],
    });
    fauxProviders.push(faux);
    return faux;
  }

  function userMessage(content: string, overrides: Record<string, unknown> = {}) {
    return {
      role: "user" as const,
      content,
      timestamp: Date.now(),
      kind: "prompt" as const,
      jsonContent: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: content }] }],
      },
      ...overrides,
    };
  }

  it("setModel returns true for a configured model and false for an unknown one", async () => {
    const { runtime } = await makeRuntime();
    await expect(runtime.setModel({ providerId: "faux", modelId: "rt-test" })).resolves.toBe(true);
    await expect(runtime.setModel({ providerId: "faux", modelId: "nope" })).resolves.toBe(false);
  });

  it("routes a normal prompt through agent_start..agent_end", async () => {
    const faux = registerFaux();
    faux.setResponses([fauxAssistantMessage(fauxText("Hello from the agent."))]);
    const { runtime } = await makeRuntime();
    await runtime.setModel({ providerId: "faux", modelId: "rt-test" });

    const events: string[] = [];
    runtime.on("agent_start", () => events.push("agent_start"));
    runtime.on("agent_end", () => events.push("agent_end"));

    await runtime.prompt(userMessage("hi"));
    await runtime.waitForIdle();

    expect(events).toEqual(["agent_start", "agent_end"]);
  });

  it("rejects a prompt whose monitoringContext.appId mismatches the session appId", async () => {
    const { runtime } = await makeRuntime("app-1");
    await expect(
      runtime.prompt(
        userMessage("hi", {
          metadata: { monitoringContext: { appId: "app-2", source: "general" } },
        }),
      ),
    ).rejects.toThrow(/another application/);
  });

  it("hydrates history via setHistoryMessages without error", async () => {
    const { runtime } = await makeRuntime();
    await expect(
      runtime.setHistoryMessages([
        { role: "user", content: "earlier", timestamp: Date.now() - 1000 } as never,
        { role: "assistant", content: "earlier reply", timestamp: Date.now() - 500 } as never,
      ]),
    ).resolves.toBeUndefined();
  });

  it("round-trips an ask-user-question request through the HIL service", async () => {
    const { runtime } = await makeRuntime();

    let capturedRequestId = "";
    runtime.on("ask_user_question_requested", (event) => {
      capturedRequestId = event.requestId;
    });

    const answerPromise = runtime.askUserQuestion({
      questions: [
        {
          header: "Pick",
          question: "Which option?",
          options: [
            { label: "A", description: "first" },
            { label: "B", description: "second" },
          ],
        },
      ],
    });

    // Let the Emittery emit propagate to the listener.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(capturedRequestId).toBeTruthy();

    await runtime.resolveAskUserQuestion(capturedRequestId, {
      answers: [{ question: "Which option?", selectedOptions: ["A"] }],
    });
    const result = await answerPromise;
    expect(result.answers[0]?.selectedOptions).toEqual(["A"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @traceability/app exec vitest run src/main/agent-runtime.test.ts`
Expected: FAIL — `Cannot find module './agent-runtime.js'` (the implementation does not exist yet).

- [ ] **Step 3: Write `main/agent-runtime.ts` (divisor port + appId + strip extensions/tools/runOneTimeAgent)**

Copy `divisor-agent/packages/app/src/main/agent-runtime.ts` → `app/src/main/agent-runtime.ts`, then apply these exact edits:

**Edit A — imports.** Replace the divisor imports block (the `@divisor-agent/extension-core/*` imports, the `ExtensionService` import, and the `tools/index.js` import) with the stripped set. Find the divisor import block:

```ts
import type {
  AskUserQuestionInput,
  AskUserQuestionResult,
} from "@divisor-agent/extension-core/common";
import type {
  ExtensionAgentModel,
  ExtensionAgentToolOptions,
} from "@divisor-agent/extension-core/main";
import { Agent } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import Emittery from "emittery";

import type { AgentSessionScope, AllowedMainExposeEvents } from "../shared/events-ipc.js";
import type { AgentModelsIPC } from "../shared/models-ipc.js";
import type { PermissionMode } from "../shared/permissions-ipc.js";
import type { AgentSessionIPC } from "../shared/session-ipc.js";
import type { AgentSkillsIPC } from "../shared/skills-ipc.js";
import { ExtensionService } from "./extensions/extension-service.js";
import { AskUserQuestionService } from "./human-in-the-loop/ask-user-question-service.js";
import { PermissionService } from "./human-in-the-loop/permission-service.js";
import { ModelRegistry } from "./models/index.js";
import { SystemPromptService } from "./prompt/index.js";
import { SkillService } from "./skills/index.js";
import type { AppTool } from "./tools/index.js";
import { fsReadTextFileTool, fsWriteTextFileTool, terminalCreateTool } from "./tools/index.js";
```

Replace with:

```ts
import type {
  AskUserQuestionInput,
  AskUserQuestionResult,
} from "../shared/ask-user-question-ipc.js";
import { Agent } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import Emittery from "emittery";

import type { AgentSessionScope, AllowedMainExposeEvents } from "../shared/events-ipc.js";
import type { AgentModelsIPC } from "../shared/models-ipc.js";
import type { PermissionMode } from "../shared/permissions-ipc.js";
import type { AgentSessionIPC } from "../shared/session-ipc.js";
import type { AgentSkillsIPC } from "../shared/skills-ipc.js";
import { AskUserQuestionService } from "./human-in-the-loop/ask-user-question-service.js";
import { PermissionService } from "./human-in-the-loop/permission-service.js";
import { ModelRegistry } from "./models/index.js";
import { SystemPromptService } from "./prompt/index.js";
import { SkillService } from "./skills/index.js";
```

**Edit B — `AgentRuntimeDelegate` type.** Remove `runOneTimeAgent` from the `Exclude` list and change `setSessionId` to take `appId`. Find:

```ts
type SessionRoutedMethodNames =
  | Exclude<
      keyof AgentSessionIPC,
      "destroySession" | "runOneTimeAgent" | "setSessionId" | "setSessionScope"
    >
  | "setModel";
```
Replace with:
```ts
type SessionRoutedMethodNames =
  | Exclude<keyof AgentSessionIPC, "destroySession" | "setSessionId" | "setSessionScope">
  | "setModel";
```

Find:
```ts
} & {
  listSkills: AgentSkillsIPC["listSkills"];
  setSessionId(sessionId: string): void;
  setSessionScope(scope: AgentSessionScope): void;
  setSkillEnabled: AgentSkillsIPC["setSkillEnabled"];
};
```
Replace with:
```ts
} & {
  listSkills: AgentSkillsIPC["listSkills"];
  setSessionId(sessionId: string, appId: string): void;
  setSessionScope(scope: AgentSessionScope): void;
  setSkillEnabled: AgentSkillsIPC["setSkillEnabled"];
};
```

**Edit C — `AgentRuntimeOptions` + class fields + constructor.** Drop the `extensionTools` option and the `extensionService` constructor param; add `appId` field. Find:

```ts
export interface AgentRuntimeOptions {
  extensionTools?: ExtensionAgentToolOptions;
  systemPrompt?: string;
}
```
Replace with:
```ts
export interface AgentRuntimeOptions {
  systemPrompt?: string;
}
```

Find:
```ts
  private scope: AgentSessionScope = "main";
  private systemPromptService: SystemPromptService;
  private sessionId: string | undefined;

  constructor(
    private modelRegistry = new ModelRegistry(),
    private skillService: SkillService,
    private extensionService: ExtensionService,
    private options: AgentRuntimeOptions = {},
  ) {
    super();
    this.permissionMode = "default";
    this.permissionService = new PermissionService();
    this.askUserQuestionService = new AskUserQuestionService();
    this.systemPromptService = new SystemPromptService();
    this.systemPromptService.addBuilder(this.skillService);
    this.systemPromptService.addBuilder(this.extensionService);

    this.agent = this.createInternalAgent();
  }
```
Replace with:
```ts
  private scope: AgentSessionScope = "main";
  private systemPromptService: SystemPromptService;
  private sessionId: string | undefined;
  private appId: string | undefined;

  constructor(
    private modelRegistry = new ModelRegistry(),
    private skillService: SkillService,
    private options: AgentRuntimeOptions = {},
  ) {
    super();
    this.permissionMode = "default";
    this.permissionService = new PermissionService();
    this.askUserQuestionService = new AskUserQuestionService();
    this.systemPromptService = new SystemPromptService();
    this.systemPromptService.addBuilder(this.skillService);

    this.agent = this.createInternalAgent();
  }
```

**Edit D — `createInternalAgent`: drop extension tools, set `tools: []`.** Find the whole `createInternalAgent` method body from `private createInternalAgent() {` through its closing `return agent; }` and replace with:

```ts
  private createInternalAgent() {
    this.permissionService.on("human-in-the-loop", ({ data: request }) => {
      this.emit("permission_requested", {
        type: "permission_requested",
        ...request,
      });
    });

    this.askUserQuestionService.on("human-in-the-loop", ({ data: request }) => {
      this.emit("ask_user_question_requested", {
        type: "ask_user_question_requested",
        ...request,
      });
    });

    const agent = new Agent({
      convertToLlm: (messages) => {
        return messages.flatMap((message): Message[] => {
          if (message.role === "user") {
            return [
              {
                role: "user",
                content: message.content,
                timestamp: message.timestamp,
              },
            ];
          }

          if (message.role === "assistant" || message.role === "toolResult") {
            return [message];
          }

          return [];
        });
      },
      beforeToolCall: async (context) => {
        if (this.permissionMode === "bypasspermission") {
          return undefined;
        }

        const tool = context.context.tools?.find(
          (candidate) => candidate.name === context.toolCall.name,
        ) as { riskLevel?: "safe" | "high"; label?: string } | undefined;
        const args = isRecord(context.args) ? context.args : {};

        // Tools start empty this phase; any future high-risk tool routes here.
        if ((tool?.riskLevel ?? "safe") !== "high") {
          return undefined;
        }

        const permissionRequest = {
          toolCallId: context.toolCall.id,
          toolName: context.toolCall.name,
          toolLabel: tool?.label ?? context.toolCall.name,
          operation: context.toolCall.name,
          args,
        };

        if (this.permissionService.shouldAutoApprove(permissionRequest)) {
          return undefined;
        }

        const resolution = await this.permissionService.requestPermission(permissionRequest);

        if (resolution.approved) {
          return undefined;
        }

        return {
          block: true,
          reason: resolution.reason?.trim() || "Permission request denied by user",
        };
      },
      getApiKey: (provider) => {
        return this.modelRegistry.resolveApiKey(provider);
      },
      initialState: {
        systemPrompt: this.systemPromptService.buildSystemPrompt(
          this.options.systemPrompt ?? "",
        ),
        tools: [],
      },
    });

    agent.subscribe((event) => {
      this.emit(event.type, event);

      if (event.type === "agent_end" && this.agent.hasQueuedMessages()) {
        this.scheduleQueuedContinue();
      }
    });

    return agent;
  }
```

(This drops the `excludedToolNames`/`builtinTools`/`extensionService.getToolsForRuntime` logic and the `AppTool` cast — `tools: []` instead. The `beforeToolCall` body is retained verbatim from divisor but with the `AppTool` cast removed so no `tools/index.js` import is needed; it is inert while `tools: []`.)

**Edit E — `setSessionId` stores appId.** Find:

```ts
  public setSessionId: AgentRuntimeDelegate["setSessionId"] = (sessionId) => {
    this.sessionId = sessionId;
    this.agent.sessionId = sessionId;
  };
```
Replace with:
```ts
  public setSessionId: AgentRuntimeDelegate["setSessionId"] = (sessionId, appId) => {
    this.sessionId = sessionId;
    this.appId = appId;
    this.agent.sessionId = sessionId;
  };
```

**Edit F — `askUserQuestion` scope check stays, no edit.** (Keep divisor's `scope !== "main"` guard verbatim.)

**Edit G — `prompt` validates appId.** Find the start of the `prompt` method:

```ts
  public prompt: AgentRuntimeDelegate["prompt"] = async (message) => {
    if (message.metadata?.model) {
      await this.setModel(message.metadata.model);
    }

    this.agent.state.systemPrompt = this.systemPromptService.buildSystemPrompt(
      this.options.systemPrompt ?? "",
    );
```
Replace with (insert the appId validation guard at the top):
```ts
  public prompt: AgentRuntimeDelegate["prompt"] = async (message) => {
    const monitoringContext = message.metadata?.monitoringContext;
    if (monitoringContext && monitoringContext.appId !== this.appId) {
      throw new Error("Agent sessions cannot access another application");
    }

    if (message.metadata?.model) {
      await this.setModel(message.metadata.model);
    }

    this.agent.state.systemPrompt = this.systemPromptService.buildSystemPrompt(
      this.options.systemPrompt ?? "",
    );
```

Leave the rest of `prompt` (skill expansion, `kind` routing to `steer`/`followUp`/`prompt`) and all remaining methods (`clearAllQueues`, `abortPrompt`, `listSkills`, `setSkillEnabled`, `setPermissionMode`, `resolvePermissionRequest`, `resolveAskUserQuestion`, `destroy`, `waitForIdle`, `scheduleQueuedContinue`, the `isRecord` helper) byte-for-byte identical to divisor. **Delete** divisor's private `getCurrentModel` method entirely - its return type is `ExtensionAgentModel | undefined` (the import Edit A drops), and its only caller was the `extensionService.getToolsForRuntime({ getModel: () => this.getCurrentModel() })` block that Edit D removed, so it is both broken and dead after the port.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @traceability/app exec vitest run src/main/agent-runtime.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/agent-runtime.ts app/src/main/agent-runtime.test.ts
git commit -m "feat(app/main): port AgentRuntime (strip extensions/tools, add appId validation)"
```

---

### Task 11: `main/agent-pool.ts` (verbatim minus extensions + appId)

**Files:**
- Create: `app/src/main/agent-pool.ts`

**Interfaces:**
- Consumes: `AgentRuntime` (Task 10), `ModelRegistry` (Task 6), `SkillService` (Task 7), `AbstractAgentIPCHandler` (Task 9), `TRACEABILITY_IDENTITY_PROMPT` (Task 7), shared IPC types.
- Produces: `AgentPool` implementing `AgentSessionIPC & AgentModelsIPC & AgentSkillsIPC`.

- [ ] **Step 1: Copy and edit**

Copy `divisor-agent/packages/app/src/main/agent-pool.ts` → `app/src/main/agent-pool.ts`, then apply these exact edits:

**Edit A — imports.** Drop extension imports. Find:

```ts
import { AllowedMainExposeEvents } from "../shared/events-ipc.js";
import { AgentModelsIPC } from "../shared/models-ipc.js";
import { AgentSessionIPC } from "../shared/session-ipc.js";
import { AgentSkillsIPC } from "../shared/skills-ipc.js";
import { AbstractAgentIPCHandler } from "./agent-ipc.js";
import { AgentRuntime } from "./agent-runtime.js";
import { ExtensionService } from "./extensions/index.js";
import { ExtensionRuntimeService } from "./extensions/runtime-service.js";
import { ModelRegistry } from "./models/index.js";
import { SkillService } from "./skills/index.js";
```
Replace with:
```ts
import { AllowedMainExposeEvents } from "../shared/events-ipc.js";
import { AgentModelsIPC } from "../shared/models-ipc.js";
import { AgentSessionIPC } from "../shared/session-ipc.js";
import { AgentSkillsIPC } from "../shared/skills-ipc.js";
import { AbstractAgentIPCHandler } from "./agent-ipc.js";
import { AgentRuntime } from "./agent-runtime.js";
import { ModelRegistry } from "./models/index.js";
import { TRACEABILITY_IDENTITY_PROMPT } from "./prompt/identity.js";
import { SkillService } from "./skills/index.js";
```

**Edit B — fields + constructor (drop extension services).** Find:

```ts
  private modelRegistry: ModelRegistry;
  private runtimes: Map<string, AgentRuntime>;
  private skillService: SkillService;
  private extensionService: ExtensionService;
  private extensionRuntimeService: ExtensionRuntimeService;

  constructor(browserWindow: BrowserWindow) {
    super(browserWindow);

    this.modelRegistry = new ModelRegistry();
    this.runtimes = new Map();
    this.skillService = new SkillService();
    this.extensionRuntimeService = new ExtensionRuntimeService(
      this.modelRegistry,
      this.skillService,
    );
    this.extensionRuntimeService.onAny(({ name, data }) => {
      if (typeof name !== "string") return;

      (this.events.emit as (...args: unknown[]) => Promise<void>)(name, data);
    });
    this.extensionService = new ExtensionService(
      this.extensionRuntimeService,
      () => this.currentBrowserWindow,
    );

    // Bind IPC channels + Emittery forwarding last, after all internal state is ready.
    this.unbind = this.bind();
  }
```
Replace with:
```ts
  private modelRegistry: ModelRegistry;
  private runtimes: Map<string, AgentRuntime>;
  private skillService: SkillService;

  constructor(browserWindow: BrowserWindow) {
    super(browserWindow);

    this.modelRegistry = new ModelRegistry();
    this.runtimes = new Map();
    this.skillService = new SkillService();

    // Bind IPC channels + Emittery forwarding last, after all internal state is ready.
    this.unbind = this.bind();
  }
```

**Edit C — `createRuntime` passes identity prompt, no extensions.** Find:

```ts
  private createRuntime(sessionId: string): AgentRuntime {
    const runtime = new AgentRuntime(this.modelRegistry, this.skillService, this.extensionService);

    // Re-emit all events tagged with sessionId
    runtime.onAny(({ name, data }) => {
      if (typeof name !== "string") return;

      (this.events.emit as (...args: unknown[]) => Promise<void>)(name, {
        scope: runtime.getScope(),
        sessionId,
        ...(data as object),
      });
    });

    return runtime;
  }
```
Replace with:
```ts
  private createRuntime(sessionId: string): AgentRuntime {
    const runtime = new AgentRuntime(this.modelRegistry, this.skillService, {
      systemPrompt: TRACEABILITY_IDENTITY_PROMPT,
    });

    // Re-emit all events tagged with sessionId
    runtime.onAny(({ name, data }) => {
      if (typeof name !== "string") return;

      (this.events.emit as (...args: unknown[]) => Promise<void>)(name, {
        scope: runtime.getScope(),
        sessionId,
        ...(data as object),
      });
    });

    return runtime;
  }
```

**Edit D — `destroyAll` drops extension cleanup.** Find:

```ts
  async destroyAll() {
    for (const sessionId of [...this.runtimes.keys()]) {
      await this.destroyAgent(sessionId);
    }
    this.extensionRuntimeService.destroyAll();
    this.extensionService.dispose();
    this.events.clearListeners();
    this.unbind?.();
  }
```
Replace with:
```ts
  async destroyAll() {
    for (const sessionId of [...this.runtimes.keys()]) {
      await this.destroyAgent(sessionId);
    }
    this.events.clearListeners();
    this.unbind?.();
  }
```

**Edit E — `bind()` channel list drops `runOneTimeAgent`.** Find:

```ts
    const channels = [
      "setModel",
      "getAvailableModels",
      "getModelConfig",
      "saveModelConfig",
      "prompt",
      "runOneTimeAgent",
      "abortPrompt",
      "setHistoryMessages",
      "setSessionId",
      "setSessionScope",
      "destroySession",
      "setPermissionMode",
      "resolvePermissionRequest",
      "resolveAskUserQuestion",
      "listSkills",
      "setSkillEnabled",
    ] as const;
```
Replace with:
```ts
    const channels = [
      "setModel",
      "getAvailableModels",
      "getModelConfig",
      "saveModelConfig",
      "prompt",
      "abortPrompt",
      "setHistoryMessages",
      "setSessionId",
      "setSessionScope",
      "destroySession",
      "setPermissionMode",
      "resolvePermissionRequest",
      "resolveAskUserQuestion",
      "listSkills",
      "setSkillEnabled",
    ] as const;
```

**Edit F — `setSessionId` passes appId.** Find:

```ts
  public setSessionId: AgentSessionIPC["setSessionId"] = async (sessionId: string) => {
    const runtime = this.getOrCreateRuntime(sessionId);
    runtime.setSessionId(sessionId);
  };
```
Replace with:
```ts
  public setSessionId: AgentSessionIPC["setSessionId"] = async (sessionId, appId) => {
    const runtime = this.getOrCreateRuntime(sessionId);
    runtime.setSessionId(sessionId, appId);
  };
```

**Edit G — delete `runOneTimeAgent` + its helpers.** Delete the entire `runOneTimeAgent` method and the two module-level helper functions `convertAgentMessagesToLlmMessages` and `cleanOneTimeAgentOutput` at the bottom of the file. (They are referenced only by `runOneTimeAgent`.) Keep `abortPrompt` — but edit its extension fallback: find:

```ts
  public abortPrompt: AgentSessionIPC["abortPrompt"] = async (sessionId) => {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) {
      await this.extensionRuntimeService.abortAgent(sessionId);
      return;
    }

    await runtime.abortPrompt();
  };
```
Replace with:
```ts
  public abortPrompt: AgentSessionIPC["abortPrompt"] = async (sessionId) => {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) return;

    await runtime.abortPrompt();
  };
```

Leave `setModel`, `getAvailableModels`, `getModelConfig`, `saveModelConfig`, `listSkills`, `setSkillEnabled`, `setSessionScope`, `destroySession`, `setHistoryMessages`, `setPermissionMode`, `resolvePermissionRequest`, `resolveAskUserQuestion`, `prompt`, `clearAllQueues`, `getOrCreateRuntime`, `destroyAgent`, `activeCount` byte-for-byte identical to divisor.

- [ ] **Step 2: Verify type-check**

Run: `pnpm --filter @traceability/app exec tsc --noEmit -p app/tsconfig.node.json`
Expected: `agent-pool.ts` compiles. (Old `main/agent/*` and `preload/index.ts` still error — fixed in Task 13/14.)

- [ ] **Step 3: Commit**

```bash
git add app/src/main/agent-pool.ts
git commit -m "feat(app/main): port AgentPool (strip extensions + runOneTimeAgent, thread appId)"
```

---

### Task 12: `preload/index.ts` — typed allowlisted invoke/on

**Files:**
- Modify: `app/src/preload/index.ts`

**Interfaces:**
- Produces: `window.traceability` with typed `invoke<C>(channel, ...args)` + `on<E>(event, callback)` + `platform`.

- [ ] **Step 1: Replace the file**

Overwrite `app/src/preload/index.ts` with this content (divisor's preload structure, renamed `electronAPI`→`traceability`, extensions API dropped, allowlists come from the new shared `events-ipc`):

```ts
import { contextBridge, ipcRenderer } from "electron";

import type {
  AllowedMainExposeEvents,
  AllowedRenderInvokeEvents,
  TraceabilityInvokeIPC,
} from "../shared/events-ipc.js";
import { ALLOWED_MAIN_EXPOSE_EVENTS, ALLOWED_RENDER_INVOKE_EVENTS } from "../shared/events-ipc.js";

type InvokeArgs<C extends keyof TraceabilityInvokeIPC> = Parameters<TraceabilityInvokeIPC[C]>;

contextBridge.exposeInMainWorld("traceability", {
  platform: process.platform,
  invoke: <C extends AllowedRenderInvokeEvents>(
    channel: C,
    ...args: InvokeArgs<C>
  ): Promise<Awaited<ReturnType<TraceabilityInvokeIPC[C]>>> => {
    if (!(ALLOWED_RENDER_INVOKE_EVENTS as readonly string[]).includes(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }

    return ipcRenderer.invoke(channel, ...args) as Promise<
      Awaited<ReturnType<TraceabilityInvokeIPC[C]>>
    >;
  },

  on: <E extends keyof AllowedMainExposeEvents>(
    event: E,
    callback: (payload: AllowedMainExposeEvents[E]) => void,
  ) => {
    if (!(ALLOWED_MAIN_EXPOSE_EVENTS as readonly string[]).includes(event)) {
      throw new Error(`IPC event not allowed: ${event}`);
    }

    const subscription = (
      _event: Electron.IpcRendererEvent,
      payload: AllowedMainExposeEvents[E],
    ) => {
      callback(payload);
    };

    ipcRenderer.on(event, subscription);

    return () => {
      ipcRenderer.removeListener(event, subscription);
    };
  },
});
```

- [ ] **Step 2: Add the `traceability` global type declaration**

The renderer references `window.traceability`. Add a global declaration. Create `app/src/preload/index.d.ts` (divisor has one too) with:

```ts
import type { AllowedMainExposeEvents, AllowedRenderInvokeEvents, TraceabilityInvokeIPC } from "../shared/events-ipc";

type InvokeArgs<C extends keyof TraceabilityInvokeIPC> = Parameters<TraceabilityInvokeIPC[C]>;

declare global {
  interface Window {
    traceability: {
      platform: string;
      invoke: <C extends AllowedRenderInvokeEvents>(
        channel: C,
        ...args: InvokeArgs<C>
      ) => Promise<Awaited<ReturnType<TraceabilityInvokeIPC[C]>>>;
      on: <E extends keyof AllowedMainExposeEvents>(
        event: E,
        callback: (payload: AllowedMainExposeEvents[E]) => void,
      ) => () => void;
    };
  }
}

export {};
```

- [ ] **Step 3: Commit**

```bash
git add app/src/preload/index.ts app/src/preload/index.d.ts
git commit -m "feat(app/preload): typed allowlisted window.traceability invoke/on"
```

---

### Task 13: Rewire `main/index.ts`, delete old main + shared

**Files:**
- Modify: `app/src/main/index.ts`
- Delete: `app/src/main/agent/` (agent-pool.ts, agent-runtime.ts, agent-runtime.test.ts, model-registry.ts, monitor.ts, session-store.ts)
- Delete: `app/src/main/db/database.ts`
- Delete: `app/src/shared/ipc.ts`

**Interfaces:**
- Produces: a `main/index.ts` that instantiates `AgentPool`, binds typed agent IPC, retains zod-validated app-shell (`window:*`, `clipboard:writeText`) handlers, and emits named events via the pool. No DB / SessionStore yet (M3 adds `SessionService`).

- [ ] **Step 1: Replace `main/index.ts`**

Overwrite `app/src/main/index.ts` with:

```ts
import { join } from "node:path";

import { app, BrowserWindow, clipboard, ipcMain } from "electron";
import { z } from "zod";

import { AgentPool } from "./agent-pool.js";

let mainWindow: BrowserWindow | null = null;
let agentPool: AgentPool | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    backgroundColor: "#101115",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // electron-vite emits the preload entry as ESM (`index.mjs`). Keeping this
      // explicit is important in production: without the preload the renderer
      // cannot reach the deliberately small, validated IPC surface.
      preload: join(__dirname, "../preload/index.mjs"),
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function requireAgentPool(): AgentPool {
  if (!agentPool) throw new Error("Agent runtime is unavailable before application readiness");
  return agentPool;
}

function registerAppShellIpc(): void {
  ipcMain.handle("clipboard:writeText", (_event, text: unknown) => {
    clipboard.writeText(z.string().parse(text));
  });

  // Custom titlebar window controls (titleBarStyle is "hidden" / "hiddenInset").
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:toggleMaximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
}

app.whenReady().then(async () => {
  await createWindow();
  agentPool = new AgentPool(mainWindow as BrowserWindow);
  // Agent control channels (prompt/abort/setModel/listSkills/...) are bound
  // inside AgentPool.bind(). App-shell channels are registered here.
  registerAppShellIpc();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
      if (mainWindow) agentPool?.updateBrowserWindow(mainWindow);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  void agentPool?.destroyAll();
});
```

> Note: `AgentPool`'s constructor binds the typed agent channels and forwards Emittery events to the renderer via `sendMessageToRenderer`. The `BrowserWindow` is captured at construction (after `createWindow()`); on macOS `activate` recreate, `agentPool.updateBrowserWindow(mainWindow)` re-points the pool at the new window (inherited from `AbstractAgentIPCHandler`). This matches divisor's `new AgentPool(browserWindow)` pattern.

- [ ] **Step 2: Do NOT touch the renderer**

The renderer migration is the next plan. The live renderer (`pages/_layout/index.tsx` + `_components/{AgentPanel,CommandPalette,Titlebar}` + `lib/agent-events.ts` + the issues/performance pages) still imports the deleted `@shared/ipc` and uses the old `window.traceability.*` granular API. After this task the **web type-check and full `electron-vite build` will fail** - that is expected and accepted; the renderer plan rebuilds these against the new `invoke/on` contract. Do not edit, stub, or delete any renderer file in this plan.

(For reference: the root `app/src/renderer/Layout.tsx` is already orphaned - `router.tsx` imports `Layout` from `@renderer/pages/_layout`, not from the root. Leave it alone; the renderer plan cleans it up.)

- [ ] **Step 3: Delete the old main + shared files**

```bash
git rm app/src/main/agent/agent-pool.ts \
       app/src/main/agent/agent-runtime.ts \
       app/src/main/agent/agent-runtime.test.ts \
       app/src/main/agent/model-registry.ts \
       app/src/main/agent/monitor.ts \
       app/src/main/agent/session-store.ts \
       app/src/main/db/database.ts \
       app/src/shared/ipc.ts
rmdir app/src/main/agent app/src/main/db 2>/dev/null || true
```

- [ ] **Step 4: Verify main/preload/shared no longer import the deleted modules**

Run: `grep -rn "main/agent\|main/db/database\|shared/ipc" app/src/main app/src/preload app/src/shared --include="*.ts" --include="*.tsx" || echo "clean"`
Expected: prints `clean`. (Renderer references to `@shared/ipc` ARE expected and accepted - see Step 2.)

- [ ] **Step 5: Commit**

```bash
git add app/src/main/index.ts
git commit -m "feat(app/main): rewire entry to AgentPool, drop old agent/db/ipc"
```

---

### Task 14: M2 checkpoint — main type-check + tests

**Files:**
- Verify only.

> Scope: this checkpoint verifies the **main process only** (`tsconfig.node.json` covers `main/` + `preload/` + `shared/`). The renderer (`tsconfig.web.json`) and the full `electron-vite build` are **intentionally red** at this point - the live renderer still imports the deleted `@shared/ipc` and the old `window.traceability.*` API. Renderer repair is the next plan. Do not attempt to make the web build green here.

- [ ] **Step 1: Node-side type-check**

Run: `pnpm --filter @traceability/app exec tsc --noEmit -p app/tsconfig.node.json`
Expected: PASS (main + preload + shared all type-check).

- [ ] **Step 2: Run main tests**

Run: `pnpm --filter @traceability/app exec vitest run src/main/agent-runtime.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 3: Tag the checkpoint**

```bash
git add -A
git commit -m "chore(app): M2 checkpoint - main agent core type-checks and tests green" --allow-empty
```

> **M2 outcome:** the Agent runs in-memory with model selection, Skills, HIL wiring, and `tools: []`. Sessions are not persisted yet (lost on restart). M3 adds persistence. The renderer is broken and deferred to the next plan.

---

## Phase M3 — Sessions Persistence (better-sqlite3, separate from runtime)

> M3 adds the `main/sessions/` SQLite layer. The runtime is untouched. `SessionService` implements `SessionPersistenceIPC`; `main/index.ts` instantiates it and registers `sessions:*` handlers. Migration id=2 extends the legacy schema (id=1) with divisor-compatible columns and backfills a linear parent/leaf chain.

### Task 15: `main/sessions/database.ts` — better-sqlite3 wrapper + migration runner

**Files:**
- Create: `app/src/main/sessions/database.ts`

**Interfaces:**
- Produces: `LocalDatabase` class — `db` (better-sqlite3 `Database`), `transaction<T>(fn)`, `close()`. Runs migrations id=1 (legacy, verbatim from the old `db/database.ts`) then id=2 (from `session-schema.ts`, Task 16).

- [ ] **Step 1: Write the file**

Create `app/src/main/sessions/database.ts` with:

```ts
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { SESSION_MIGRATIONS } from "./session-schema.js";

// id=1 is the legacy schema, preserved verbatim so existing user DBs (already
// marked applied) skip it. Fresh DBs run id=1 then id=2. Do NOT modify id=1.
const LEGACY_MIGRATIONS: Array<{ id: number; sql: string }> = [
  {
    id: 1,
    sql: `
      CREATE TABLE agent_sessions (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        model_provider_id TEXT,
        model_id TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_agent_sessions_app_updated ON agent_sessions(app_id, updated_at DESC);

      CREATE TABLE agent_entries (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        data_json TEXT NOT NULL,
        token_usage_json TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE(session_id, sequence)
      );
      CREATE INDEX idx_agent_entries_session_sequence ON agent_entries(session_id, sequence);

      CREATE TABLE agent_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        user_entry_id TEXT NOT NULL REFERENCES agent_entries(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        partial_message_json TEXT,
        error_json TEXT,
        started_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE INDEX idx_agent_runs_session_started ON agent_runs(session_id, started_at DESC);

      CREATE TABLE agent_artifacts (
        id TEXT NOT NULL,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        extension_id TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT,
        content_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(session_id, id)
      );

      CREATE TABLE agent_hil_requests (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
        extension_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        request_json TEXT NOT NULL,
        resolution_json TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
      );

      CREATE TABLE desktop_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
  },
];

const MIGRATIONS = [...LEGACY_MIGRATIONS, ...SESSION_MIGRATIONS];

export class LocalDatabase {
  readonly db: BetterSqliteDatabase;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }

  private migrate(): void {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)",
    );
    const applied = new Set(
      (
        this.db.prepare("SELECT id FROM schema_migrations").all() as Array<{ id: number }>
      ).map((row) => row.id),
    );

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue;
      this.transaction(() => {
        this.db.exec(migration.sql);
        this.db
          .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
          .run(migration.id, Date.now());
      });
    }
  }
}
```

- [ ] **Step 2: Commit (compiles only after Task 16 creates `session-schema.ts`)**

```bash
git add app/src/main/sessions/database.ts
git commit -m "feat(app/main/sessions): better-sqlite3 LocalDatabase + migration runner"
```

---

### Task 16: `main/sessions/session-schema.ts` — migration id=2 + rows + mappers

**Files:**
- Create: `app/src/main/sessions/session-schema.ts`

**Interfaces:**
- Produces: `SESSION_MIGRATIONS`, `SessionRow`, `EntryRow`, `toSession(row)`, `toEntry(row)`.
- Consumes: `Session`, `Entry`, `TokenUsage` from `../../shared/session-ipc.js`.

- [ ] **Step 1: Write the file**

Create `app/src/main/sessions/session-schema.ts` with:

```ts
import type { Entry, Session, TokenUsage } from "../../shared/session-ipc.js";

// id=2: divisor-compatible session/entry schema. Adds the columns the new
// Session/Entry shapes need, backfills them from legacy data, and leaves
// legacy runs/artifacts/HIL tables + columns untouched (no longer read/written).
export const SESSION_MIGRATIONS: Array<{ id: number; sql: string }> = [
  {
    id: 2,
    sql: `
      ALTER TABLE agent_sessions ADD COLUMN name TEXT NOT NULL DEFAULT '';
      ALTER TABLE agent_sessions ADD COLUMN cwd TEXT;
      ALTER TABLE agent_sessions ADD COLUMN workspace_id TEXT;
      ALTER TABLE agent_sessions ADD COLUMN parent_session_id TEXT;
      ALTER TABLE agent_sessions ADD COLUMN leaf_entry_id TEXT;
      ALTER TABLE agent_sessions ADD COLUMN is_top INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE agent_entries ADD COLUMN parent_id TEXT;
      ALTER TABLE agent_entries ADD COLUMN timestamp INTEGER;

      -- name <- title
      UPDATE agent_sessions SET name = title WHERE name = '' AND title IS NOT NULL;

      -- entries: linear chain by sequence, parent_id + timestamp backfill
      UPDATE agent_entries
      SET parent_id = (
        SELECT e2.id FROM agent_entries e2
        WHERE e2.session_id = agent_entries.session_id
          AND e2.sequence < agent_entries.sequence
        ORDER BY e2.sequence DESC LIMIT 1
      ),
      timestamp = created_at
      WHERE parent_id IS NULL;

      -- sessions: leaf_entry_id = max-sequence entry
      UPDATE agent_sessions
      SET leaf_entry_id = (
        SELECT e.id FROM agent_entries e
        WHERE e.session_id = agent_sessions.id
        ORDER BY e.sequence DESC LIMIT 1
      )
      WHERE leaf_entry_id IS NULL;
    `,
  },
];

export interface SessionRow {
  id: string;
  app_id: string;
  name: string;
  title: string | null;
  cwd: string | null;
  workspace_id: string | null;
  parent_session_id: string | null;
  leaf_entry_id: string | null;
  is_top: number;
  created_at: number;
  updated_at: number;
}

export interface EntryRow {
  id: string;
  session_id: string;
  sequence: number;
  parent_id: string | null;
  type: Entry["type"];
  data_json: string;
  token_usage_json: string | null;
  timestamp: number | null;
  created_at: number;
}

export function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    appId: row.app_id,
    name: row.name || row.title || "",
    cwd: row.cwd ?? "",
    workspaceId: row.workspace_id,
    parentSessionId: row.parent_session_id,
    leafEntryId: row.leaf_entry_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isTop: row.is_top === 1,
  };
}

export function toEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    sessionId: row.session_id,
    parentId: row.parent_id,
    type: row.type,
    timestamp: row.timestamp ?? row.created_at,
    data: parseObject(row.data_json),
    tokenUsage: row.token_usage_json ? parseTokenUsage(row.token_usage_json) : null,
  };
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseTokenUsage(value: string): TokenUsage | null {
  const parsed = parseObject(value);
  return "turn" in parsed && "latestCall" in parsed ? (parsed as unknown as TokenUsage) : null;
}
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm --filter @traceability/app exec tsc --noEmit -p app/tsconfig.node.json`
Expected: `sessions/database.ts` + `sessions/session-schema.ts` compile.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/sessions/session-schema.ts
git commit -m "feat(app/main/sessions): migration id=2 + SessionRow/EntryRow + mappers"
```

---

### Task 17: `main/sessions/session-service.ts` — TDD (test then implementation)

**Files:**
- Create: `app/src/main/sessions/session-service.test.ts` (test first)
- Create: `app/src/main/sessions/session-service.ts` (implementation)
- Create: `app/src/main/sessions/index.ts` (barrel)
- Test: `app/src/main/sessions/session-service.test.ts`

**Interfaces:**
- Consumes: `LocalDatabase` (Task 15), `Session`/`Entry` from `../../shared/session-ipc.js`.
- Produces: `SessionService` implementing `SessionPersistenceIPC`: `create(appId)`, `list(appId)`, `get(sessionId)`, `getEntries(sessionId)`, `rename(sessionId, name)`, `delete(sessionId)`, `appendEntries(sessionId, entries)`.

- [ ] **Step 1: Write the failing test**

Create `app/src/main/sessions/session-service.test.ts` with:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { LocalDatabase } from "./database.js";
import { SessionService } from "./session-service.js";

describe("SessionService", () => {
  const dbs: LocalDatabase[] = [];

  afterEach(() => {
    for (const db of dbs.splice(0)) db.close();
  });

  async function makeService() {
    const dir = await mkdtemp(join(tmpdir(), "traceability-sessions-"));
    const db = new LocalDatabase(join(dir, "test.sqlite"));
    dbs.push(db);
    return new SessionService(db);
  }

  function entry(id: string, parentId: string | null, sessionId: string, type: "message" | "model_change" = "message"): import("../../shared/session-ipc.js").Entry {
    return {
      id,
      sessionId,
      parentId,
      type,
      timestamp: Date.now(),
      data: { role: "user", content: id },
    };
  }

  it("creates a session with divisor-compatible defaults and lists it by appId", async () => {
    const service = await makeService();
    const session = await service.create("app-1");
    expect(session.appId).toBe("app-1");
    expect(session.workspaceId).toBeNull();
    expect(session.parentSessionId).toBeNull();
    expect(session.leafEntryId).toBeNull();
    expect(session.isTop).toBe(false);
    expect(session.name).toBe("");

    const listed = await service.list("app-1");
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(session.id);

    expect(await service.list("app-2")).toEqual([]);
  });

  it("appends entries as a linear chain and updates leafEntryId idempotently", async () => {
    const service = await makeService();
    const session = await service.create("app-1");

    await service.appendEntries(session.id, [
      entry("e1", null, session.id),
      entry("e2", "e1", session.id),
      entry("e3", "e2", session.id),
    ]);

    const stored = await service.get(session.id);
    expect(stored?.leafEntryId).toBe("e3");

    const entries = await service.getEntries(session.id);
    expect(entries.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
    expect(entries.map((e) => e.parentId)).toEqual([null, "e1", "e2"]);

    // Re-append e3 (idempotent): no duplicate, leaf unchanged.
    await service.appendEntries(session.id, [entry("e3", "e2", session.id)]);
    expect((await service.getEntries(session.id)).map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("rejects an append whose parentId is not a known entry in the session", async () => {
    const service = await makeService();
    const session = await service.create("app-1");
    await expect(service.appendEntries(session.id, [entry("e1", "missing", session.id)])).rejects.toThrow(
      /parent/i,
    );
  });

  it("rejects an append to an unknown session", async () => {
    const service = await makeService();
    await expect(service.appendEntries("nope", [entry("e1", null, "nope")])).rejects.toThrow(
      /not found/i,
    );
  });

  it("renames and deletes a session", async () => {
    const service = await makeService();
    const session = await service.create("app-1");
    await service.rename(session.id, "My session");
    expect((await service.get(session.id))?.name).toBe("My session");

    await service.delete(session.id);
    expect(await service.get(session.id)).toBeNull();
    expect(await service.getEntries(session.id)).toEqual([]);
  });

  it("backfills legacy rows when migration id=2 runs: title->name, linear parent_id, leaf_entry_id", async () => {
    // Build a genuine pre-id=2 DB: legacy id=1 schema + legacy data, id=1 marked
    // applied, id=2 NOT. Then construct LocalDatabase, which runs migrate() ->
    // sees id=1 applied, runs id=2 (ALTER + backfill UPDATEs against the legacy rows).
    const dir = await mkdtemp(join(tmpdir(), "traceability-legacy-"));
    const dbPath = join(dir, "legacy.sqlite");
    const raw = new Database(dbPath);
    raw.exec(`CREATE TABLE agent_sessions (
        id TEXT PRIMARY KEY, app_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
        model_provider_id TEXT, model_id TEXT, status TEXT NOT NULL DEFAULT 'idle',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    raw.exec(`CREATE TABLE agent_entries (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, sequence INTEGER NOT NULL,
        type TEXT NOT NULL, data_json TEXT NOT NULL, token_usage_json TEXT,
        created_at INTEGER NOT NULL)`);
    raw.exec("CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)");
    const now = Date.now();
    raw.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(1, now);
    raw.prepare(
      "INSERT INTO agent_sessions (id, app_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("legacy-1", "app-1", "Legacy Title", "idle", now, now);
    const ins = raw.prepare(
      "INSERT INTO agent_entries (id, session_id, sequence, type, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    ins.run("le1", "legacy-1", 1, "message", JSON.stringify({ role: "user", content: "a" }), now);
    ins.run("le2", "legacy-1", 2, "message", JSON.stringify({ role: "assistant", content: "b" }), now);
    raw.close();

    const db = new LocalDatabase(dbPath); // triggers id=2 migration + backfill
    dbs.push(db);
    const service = new SessionService(db);

    const session = await service.get("legacy-1");
    expect(session?.name).toBe("Legacy Title");
    expect(session?.leafEntryId).toBe("le2");

    const entries = await service.getEntries("legacy-1");
    expect(entries.map((e) => e.id)).toEqual(["le1", "le2"]);
    expect(entries[1].parentId).toBe("le1");
    expect(entries[0].parentId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @traceability/app exec vitest run src/main/sessions/session-service.test.ts`
Expected: FAIL — `Cannot find module './session-service.js'`.

- [ ] **Step 3: Write `session-service.ts`**

Create `app/src/main/sessions/session-service.ts` with:

```ts
import { randomUUID } from "node:crypto";
import { app } from "electron";
import { join } from "node:path";

import type { Entry, Session, SessionPersistenceIPC } from "../../shared/session-ipc.js";
import type { LocalDatabase } from "./database.js";
import { toEntry, toSession, type EntryRow, type SessionRow } from "./session-schema.js";

export class SessionService implements SessionPersistenceIPC {
  constructor(private readonly database: LocalDatabase) {}

  private get db() {
    return this.database.db;
  }

  async create(appId: string): Promise<Session> {
    const now = Date.now();
    const row: SessionRow = {
      id: randomUUID(),
      app_id: appId,
      name: "",
      title: "",
      cwd: join(app.getPath("userData"), "sessions"),
      workspace_id: null,
      parent_session_id: null,
      leaf_entry_id: null,
      is_top: 0,
      created_at: now,
      updated_at: now,
    };
    this.database.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO agent_sessions
            (id, app_id, title, name, cwd, workspace_id, parent_session_id, leaf_entry_id, is_top, status, created_at, updated_at)
           VALUES (@id, @app_id, @title, @name, @cwd, @workspace_id, @parent_session_id, @leaf_entry_id, @is_top, 'idle', @created_at, @updated_at)`,
        )
        .run(row);
    });
    return toSession(row);
  }

  async list(appId: string): Promise<Session[]> {
    const rows = this.db
      .prepare("SELECT * FROM agent_sessions WHERE app_id = ? ORDER BY updated_at DESC LIMIT 100")
      .all(appId) as SessionRow[];
    return rows.map(toSession);
  }

  async get(sessionId: string): Promise<Session | null> {
    const row = this.db.prepare("SELECT * FROM agent_sessions WHERE id = ?").get(sessionId) as
      | SessionRow
      | undefined;
    return row ? toSession(row) : null;
  }

  async getEntries(sessionId: string): Promise<Entry[]> {
    const rows = this.db
      .prepare("SELECT * FROM agent_entries WHERE session_id = ? ORDER BY sequence ASC")
      .all(sessionId) as EntryRow[];
    return rows.map(toEntry);
  }

  async rename(sessionId: string, name: string): Promise<void> {
    const result = this.db
      .prepare("UPDATE agent_sessions SET name = ?, updated_at = ? WHERE id = ?")
      .run(name.trim(), Date.now(), sessionId);
    if (result.changes === 0) throw new Error("Session not found");
  }

  async delete(sessionId: string): Promise<void> {
    this.db.prepare("DELETE FROM agent_sessions WHERE id = ?").run(sessionId);
  }

  async appendEntries(sessionId: string, entries: Entry[]): Promise<void> {
    this.database.transaction(() => {
      const session = this.db.prepare("SELECT * FROM agent_sessions WHERE id = ?").get(sessionId) as
        | SessionRow
        | undefined;
      if (!session) throw new Error("Session not found");

      const existingIds = new Set(
        (this.db
          .prepare("SELECT id FROM agent_entries WHERE session_id = ?")
          .all(sessionId) as Array<{ id: string }>).map((r) => r.id),
      );

      // Validate linear parent links against existing + to-be-inserted ids.
      const insertingIds = new Set(
        entries.filter((e) => !existingIds.has(e.id)).map((e) => e.id),
      );
      const knownIds = new Set([...existingIds, ...insertingIds]);
      let lastInsertedId = session.leaf_entry_id;

      for (const entry of entries) {
        if (existingIds.has(entry.id)) continue; // idempotent
        if (entry.parentId !== null && !knownIds.has(entry.parentId)) {
          throw new Error(`Entry ${entry.id} has an unknown parent: ${entry.parentId}`);
        }

        const sequenceRow = this.db
          .prepare(
            "SELECT COALESCE(MAX(sequence), 0) AS max_sequence FROM agent_entries WHERE session_id = ?",
          )
          .get(sessionId) as { max_sequence: number };
        const row: EntryRow = {
          id: entry.id,
          session_id: sessionId,
          sequence: sequenceRow.max_sequence + 1,
          parent_id: entry.parentId,
          type: entry.type,
          data_json: JSON.stringify(entry.data),
          token_usage_json: entry.tokenUsage ? JSON.stringify(entry.tokenUsage) : null,
          timestamp: entry.timestamp,
          created_at: entry.timestamp,
        };
        this.db
          .prepare(
            `INSERT INTO agent_entries
              (id, session_id, sequence, parent_id, type, data_json, token_usage_json, timestamp, created_at)
             VALUES (@id, @session_id, @sequence, @parent_id, @type, @data_json, @token_usage_json, @timestamp, @created_at)`,
          )
          .run(row);
        existingIds.add(entry.id);
        lastInsertedId = entry.id;
      }

      if (lastInsertedId && lastInsertedId !== session.leaf_entry_id) {
        this.db
          .prepare("UPDATE agent_sessions SET leaf_entry_id = ?, updated_at = ? WHERE id = ?")
          .run(lastInsertedId, Date.now(), sessionId);
      }
    });
  }
}
```

- [ ] **Step 4: Write the barrel `index.ts`**

Create `app/src/main/sessions/index.ts` with:

```ts
export { LocalDatabase } from "./database.js";
export { SessionService } from "./session-service.js";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @traceability/app exec vitest run src/main/sessions/session-service.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/main/sessions/session-service.ts app/src/main/sessions/session-service.test.ts app/src/main/sessions/index.ts
git commit -m "feat(app/main/sessions): SessionService with linear/idempotent append + legacy backfill"
```

---

### Task 18: Wire `SessionService` + `sessions:*` handlers into `main/index.ts`

**Files:**
- Modify: `app/src/main/index.ts`

**Interfaces:**
- Consumes: `LocalDatabase`, `SessionService` (Task 17), `Entry`/`Session` types (Task 4).
- Produces: `sessions:*` IPC handlers (zod-validated) registered alongside the agent + app-shell handlers.

- [ ] **Step 1: Add DB + SessionService wiring**

Open `app/src/main/index.ts`. Add imports after the `AgentPool` import:

```ts
import { SessionService } from "./sessions/index.js";
import { LocalDatabase } from "./sessions/index.js";
import type { Entry } from "../shared/session-ipc.js";
```

Add module-level handles next to `agentPool`:

```ts
let database: LocalDatabase | null = null;
let sessionService: SessionService | null = null;
```

- [ ] **Step 2: Add a `registerSessionsIpc` function**

Add this function below `registerAppShellIpc`:

```ts
function requireSessionService(): SessionService {
  if (!sessionService) throw new Error("Session service is unavailable before application readiness");
  return sessionService;
}

function registerSessionsIpc(): void {
  const entrySchema = z.object({
    id: z.string(),
    sessionId: z.string(),
    parentId: z.string().nullable(),
    type: z.enum(["message", "model_change"]),
    timestamp: z.number(),
    data: z.record(z.unknown()),
    tokenUsage: z.unknown().nullable().optional(),
  });

  ipcMain.handle("sessions:create", (_event, appId: unknown) =>
    requireSessionService().create(z.string().parse(appId)),
  );
  ipcMain.handle("sessions:list", (_event, appId: unknown) =>
    requireSessionService().list(z.string().parse(appId)),
  );
  ipcMain.handle("sessions:get", (_event, sessionId: unknown) =>
    requireSessionService().get(z.string().parse(sessionId)),
  );
  ipcMain.handle("sessions:getEntries", (_event, sessionId: unknown) =>
    requireSessionService().getEntries(z.string().parse(sessionId)),
  );
  ipcMain.handle("sessions:rename", (_event, sessionId: unknown, name: unknown) =>
    requireSessionService().rename(
      z.string().parse(sessionId),
      z.string().min(1).max(200).parse(name),
    ),
  );
  ipcMain.handle("sessions:delete", (_event, sessionId: unknown) =>
    requireSessionService().delete(z.string().parse(sessionId)),
  );
  ipcMain.handle("sessions:appendEntries", (_event, sessionId: unknown, entries: unknown) =>
    requireSessionService().appendEntries(
      z.string().parse(sessionId),
      z.array(entrySchema).parse(entries) as Entry[],
    ),
  );
}
```

- [ ] **Step 3: Instantiate DB + SessionService and register handlers in `app.whenReady`**

Replace the `app.whenReady().then(...)` block with:

```ts
app.whenReady().then(async () => {
  await createWindow();
  database = new LocalDatabase(join(app.getPath("userData"), "traceability-agent.sqlite"));
  sessionService = new SessionService(database);
  agentPool = new AgentPool(mainWindow as BrowserWindow);
  registerAppShellIpc();
  registerSessionsIpc();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
      if (mainWindow) agentPool?.updateBrowserWindow(mainWindow);
    }
  });
});
```

- [ ] **Step 4: Close the DB on quit**

Replace the `before-quit` handler with:

```ts
app.on("before-quit", () => {
  void agentPool?.destroyAll();
  database?.close();
});
```

- [ ] **Step 5: Verify main type-check + all main tests**

Run: `pnpm --filter @traceability/app exec tsc --noEmit -p app/tsconfig.node.json`
Expected: PASS.

Run: `pnpm --filter @traceability/app exec vitest run src/main/`
Expected: all runtime + session-service tests PASS.

(The full `electron-vite build` remains red until the renderer plan - see Task 13 Step 2. Do not run it here.)

- [ ] **Step 6: Commit**

```bash
git add app/src/main/index.ts
git commit -m "feat(app/main): wire SessionService + sessions:* IPC handlers"
```

---

## Validation Summary (handoff §Validation, main-only subset)

- **AgentRuntime** (Task 10 tests): model loading (`setModel` true/false), prompt -> agent_start..agent_end, rejected mismatched appId, history hydration (`setHistoryMessages` no-throw), HIL ask-user-question request/resolve round-trip. ✓
- **Verbatim-port trusted, not re-tested** (covered by divisor's own tests + the runtime tests that exercise them as integration): prompt/steer/follow-up routing, abort + queue continuation, skill expansion, permission auto-approve memory. The `beforeToolCall` permission path is inert while `tools: []` and is NOT exercised this phase. ⏳ (exercised once a tool integration lands)
- **AgentPool multi-session isolation**: trusted from the verbatim divisor port (no separate unit test this phase). ⏳
- **HIL cancel path**: `abortPrompt` cancels pending HIL via `cancelAll` (verbatim divisor); not unit-tested this phase. ⏳
- **SQLite migration** (Task 17 test): id=2 backfills name/parent_id/leaf_entry_id. ✓
- **Linear parent/leaf creation** (Task 17 test): appendEntries chain. ✓
- **Idempotent batch append** (Task 17 test): re-append e3. ✓
- **Session deletion** (Task 17 test). ✓
- **Legacy data backfill** (Task 17 test): title→name, linear parent, leaf. ✓
- **Restart recovery**: persisted Session/Entry + model-change selection reload — requires the renderer (P3) to call `sessions:get`/`getEntries` + `setHistoryMessages`. The storage layer (M3) is verified; the reload wiring is the renderer plan's responsibility. ⏳ (deferred to renderer plan)

## Out of Scope (this plan)

- Renderer migration: Zustand store, `useSubscribeAgentEvents`/`useAgentMessages`/`useAgentSessions`, TipTap UI, virtualized messages, HIL panels, `agent_end` persistence/retry.
- Monitor tools, extensions/plugins, Artifacts, side chat, browser, terminal, filesystem tools, subagents, STT, app-updater, `runOneTimeAgent`.
- The `features/agent/` vs `features/agent-panel/` path question (irrelevant to main; resolved in the renderer plan).
- Directory-level `CLAUDE.md` updates under `app/src/shared` and `app/src/main` (the shared/main CLAUDE.md files describe the old layout — update them in a follow-up `docs(app):` commit, or fold into the first renderer-plan task).
