# Agent Core Migration Plan

## Goal

Port the reusable Agent core from `divisor-agent` into Traceability's Electron app. The resulting app must provide a locally persisted, streaming chat Agent with model selection, Skills, TipTap input, session history, and human-in-the-loop flows.

This migration deliberately establishes generic Agent infrastructure first. Traceability monitor tools are out of scope for this phase; the migrated runtime starts with no built-in tools.

## Fixed Decisions

- Mirror `divisor-agent/packages/app/src/main` for all migrated Agent code: core files live directly under `app/src/main`, not in a new `main/agent` directory.
- Add `app/src/main/sessions` for all SQLite session persistence. Do not retain a separate `main/db` directory.
- Keep all renderer Agent feature code under `app/src/renderer/features/agent-panel`, using `divisor-agent/packages/app/src/renderer/pages/workspace/chat` as the structural and behavioral reference.
- Use TipTap for the prompt editor.
- Migrate `models/`, `prompt/`, `skills/`, and `human-in-the-loop/` in addition to the Agent core.
- Do not migrate extensions/plugins, Artifacts, side chat, browser, terminal, filesystem tools, subagents, or monitor tools.
- Persist conversation history from the renderer after `agent_end`, matching divisor-agent's save timing. The main process owns SQLite writes through sessions IPC.
- Keep the session experience linear. Data shapes retain divisor's `parentId`/`leafEntryId`, but no fork, rewind, workspace, or pin UI is implemented.

## Target Layout

```text
app/src/
├── main/
│   ├── agent-ipc.ts
│   ├── agent-pool.ts
│   ├── agent-runtime.ts
│   ├── index.ts
│   ├── env.d.ts
│   ├── human-in-the-loop/
│   │   ├── abstract-human-in-the-loop.ts
│   │   ├── ask-user-question-service.ts
│   │   └── permission-service.ts
│   ├── models/
│   │   ├── index.ts
│   │   └── registry.ts
│   ├── prompt/
│   │   ├── index.ts
│   │   └── system-prompt-service.ts
│   ├── sessions/
│   │   ├── index.ts
│   │   ├── session-schema.ts
│   │   ├── session-service.ts
│   │   └── session-service.test.ts
│   └── skills/
│       ├── index.ts
│       └── skill-service.ts
├── preload/
│   └── index.ts
├── shared/
│   ├── agent-message.ts
│   ├── ask-user-question-ipc.ts
│   ├── events-ipc.ts
│   ├── models-ipc.ts
│   ├── permissions-ipc.ts
│   ├── session-ipc.ts
│   └── skills-ipc.ts
└── renderer/
    └── features/
        └── agent-panel/
            ├── AgentPanel.tsx
            ├── api/sessions.ts
            ├── components/
            │   ├── human-in-the-loop/
            │   ├── messages/
            │   └── prompt-input/
            ├── hooks/
            │   ├── use-agent-messages.ts
            │   ├── use-agent-sessions.ts
            │   └── use-subscribe-agent-events.ts
            ├── richtext/
            │   ├── extensions/slash-commands.tsx
            │   └── skill-node.tsx
            ├── store/
            │   ├── entries-slice.ts
            │   ├── human-in-the-loop-slice.ts
            │   ├── index.ts
            │   ├── pending-messages-slice.ts
            │   ├── permission-policy-slice.ts
            │   └── sessions-slice.ts
            ├── types.ts
            └── use-chat-editor.ts
```

## Data Contracts and Persistence

### Session and Entry shapes

Use divisor-agent's shapes as the public IPC contract.

```ts
interface Session {
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

interface Entry {
  id: string;
  sessionId: string;
  parentId: string | null;
  type: "message" | "model_change";
  timestamp: number;
  data: Record<string, unknown>;
  tokenUsage?: TokenUsage | null;
}
```

- New sessions use `workspaceId = null`, `parentSessionId = null`, and `isTop = false`.
- `cwd` is populated with the Electron user-data path and has no workspace semantics in this phase.
- `parentId` always points to the preceding entry and `leafEntryId` points to the latest appended entry.
- A model selection is represented by a `model_change` entry. The renderer derives the selected model from the latest such entry instead of adding a model field to `Session`.

### SQLite migration

Move database ownership into `sessions/session-schema.ts`. Add a forward-only migration that:

- maps legacy session `title` data to `name`;
- adds `cwd`, `workspace_id`, `parent_session_id`, `leaf_entry_id`, and `is_top` to sessions;
- adds `parent_id` and `timestamp` to entries;
- backfills existing entries in `sequence` order as a linear chain;
- retains `sequence` as an internal stable ordering column;
- leaves legacy runs, artifacts, and HIL tables untouched but no longer reads or writes runs/artifacts.

### Sessions IPC

Expose the following typed channels:

- `sessions:create`, `sessions:list`, `sessions:get`, `sessions:getEntries`
- `sessions:rename`, `sessions:delete`, `sessions:appendEntries`

`appendEntries` accepts the divisor-compatible Entry payload without server-only fields. It validates session ownership and linear parent links, treats repeated entry IDs as idempotent, and updates the session leaf and timestamp in the same SQLite transaction.

## Main Process Migration

1. Move the current Agent entrypoints to root-level `main/agent-ipc.ts`, `main/agent-pool.ts`, and `main/agent-runtime.ts`, adapting divisor's implementation rather than retaining the existing nested `main/agent` structure.
2. Port divisor's typed IPC handler, pooled per-session runtime, Emittery event forwarding, history hydration, prompt/steer/follow-up routing, queue continuation, and abort behavior.
3. Port `models/`, `prompt/`, and `skills/` with their divisor-agent public behavior. `SystemPromptService` composes enabled Skill instructions and the base Traceability identity prompt.
4. Port `human-in-the-loop/` and wire `beforeToolCall`, request cancellation, approval memory, structured question requests, and request resolution into `AgentRuntime`.
5. Construct every Agent with `tools: []` in this phase. The HIL infrastructure remains active and tested but does not trigger until a future tool integration is approved.
6. Validate the session's `appId` on every prompt. `AppUserMessage.metadata.monitoringContext` may carry page context, but its `appId` must match the session before the runtime accepts it.

## Shared IPC and Message Types

- Replace the current narrow `AgentPromptInput` with divisor-compatible `AppUserMessage`: `role`, `content`, `timestamp`, `kind`, `jsonContent`, and metadata for model and Skill IDs.
- Add `monitoringContext` only as a Traceability metadata extension; preserve the divisor fields and their names unchanged.
- Expose a typed, allowlisted `window.electronAPI.invoke()` and `window.electronAPI.on()` from preload.
- Retain only these main-to-renderer events: `agent_start`, `agent_end`, `turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start`, `tool_execution_update`, `tool_execution_end`, `permission_requested`, and `ask_user_question_requested`.
- Add renderer-to-main HIL resolution channels for permission and structured-question responses.

## Renderer Migration

### State and event subscription

Implement all state, IPC wrappers, hooks, and UI under `features/agent-panel`.

- Use a vanilla Zustand store with slices for sessions, entries/streaming entry, pending messages, HIL requests, and permission policy.
- Port divisor's `useSubscribeAgentEvents` behavior exactly: accept an event-to-handler map and optional `shouldHandleEvent`; retain current values in refs; subscribe only named events once per IPC transport; unsubscribe every listener on cleanup.
- Mount `useAgentMessages` and `useAgentSessions` once from `AgentPanel`.
  - `useAgentMessages` owns message stream merging, tool state updates, HIL queueing, and persistence after `agent_end`.
  - `useAgentSessions` owns only lifecycle-derived session status.
  - Both filter events by `sessionId` so one session never mutates another session's state.

### Session lifecycle

- On selection, load Session and Entries through sessions IPC, hydrate Zustand, then call `setSessionId` and `setHistoryMessages` for the runtime.
- On submit, create a pending local session if necessary; create the persisted Session at first successful prompt, then initialize its runtime.
- On `agent_end`, collect all entries whose status is not synced, mark them syncing, call `sessions:appendEntries`, then mark them synced or failed. Failed entries remain eligible for retry on the next save opportunity.
- Persist title changes immediately via `sessions:rename`.

### TipTap and messages

- Port TipTap prompt input, Placeholder, slash-command suggestion UI, and `skillNode`; preserve `JSONContent` in every user message and extract `skillIds` at submit time.
- Input behavior: Enter sends a normal prompt while idle; Enter sends steering while running; Command/Control+Enter sends follow-up while running.
- Normal prompts and follow-ups become persisted message entries. Steering remains a visible pending queue item and is removed when consumed.
- Port divisor-style virtualized message rendering, Streamdown Markdown/code output, thinking blocks, tool cards, and copy/edit controls where they do not depend on forking or artifacts.
- Render HIL panels from the session-scoped request queue; resolve requests through typed IPC and remove them only after dispatch succeeds.

## Validation

- Unit test SQLite migration, linear parent/leaf creation, idempotent batch append, Session deletion, and legacy data backfill.
- Unit test AgentPool/Runtime session isolation, history hydration, prompt/steer/follow-up behavior, abort, model loading, Skill expansion, and rejected mismatched `appId`.
- Unit test HIL request/resolve/cancel flows and permission policy behavior.
- Test event subscriptions for no duplicate listeners, latest-handler dispatch, cleanup, and cross-session isolation.
- Test renderer streaming message merge, tool status transitions, HIL panel resolution, TipTap JSON/Skill extraction, and `agent_end` persistence/retry.
- Manually verify restart recovery: persisted Session/Entry history and model-change selection reload correctly, while an in-flight unsaved turn follows divisor-agent's `agent_end` save semantics.
