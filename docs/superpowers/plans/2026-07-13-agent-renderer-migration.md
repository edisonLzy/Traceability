# Agent Renderer Migration Plan

> **Prerequisite:** complete `docs/superpowers/plans/2026-07-13-agent-main-migration.md` through M3 first. This plan targets its final `window.traceability.invoke/on` API and SQLite-backed `SessionService`; it must not retain dependencies on the current legacy `@shared/ipc` or granular `window.traceability.agent/sessions/window` APIs.

**Goal:** Replace Traceability's monolithic right-side `AgentPanel` with a divisor-agent-derived renderer that streams messages, persists and restores conversation entries, creates and switches application-scoped sessions, and preserves Traceability monitoring context. The agent stays read-only: no tool UI, artifact UI, permission policy UI, or extension renderer integration is migrated.

**Architecture:** Port the useful renderer mechanics from divisor-agent into `pages/_layout/_agent/`, and put all Zustand state in `renderer/store/agent/`. The panel shell remains Traceability-native. A session activation hydrates SQLite entries into the store, initializes the in-memory agent runtime with `setSessionId` + `setHistoryMessages`, then renders from local state. Main-process events update that state as they stream. On `agent_end`, locally-created entries are appended idempotently to SQLite through `sessions:appendEntries`.

## Scope and fixed decisions

### In scope

- Prompt, stream, abort, session creation, session selection, session renaming, restart recovery, model selection, and Skill selection.
- `MonitoringContext` on every prompt, including issue/performance quick prompts dispatched through `renderer/lib/agent-events.ts`.
- Divisor-derived event handling for `agent_start`, `agent_end`, `turn_*`, and `message_*` events.
- Divisor-derived virtualized message rendering and TipTap prompt input, restyled with Traceability's existing dark tokens.
- `ask_user_question_requested` only. This is conversational human input, not a permission escalation.

### Explicitly excluded

- `permission_requested`, `setPermissionMode`, and `resolvePermissionRequest` UI/state. With main's `tools: []`, such events are unreachable. If tools are added later, permission support must be designed and added before exposing them.
- Tool execution cards/events, pending tool approval state, artifact slices/panels, extension renderer APIs, side-chat, STT, attachments, workspace tree, rewinding/forking/editing historical messages, and app-updater UI.
- Copying divisor's app shell, visual theme, settings pages, or server/tRPC session API. Traceability uses the local IPC persistence service instead.

### Why this is a selective port

| Divisor renderer area | Traceability decision | Reason |
| --- | --- | --- |
| `entries-slice`, message lifecycle, `agent_end` persistence | Port and adapt | This is the required streaming + durable-conversation state machine. |
| `use-subscribe-agent-events` | Port and replace provider with `window.traceability.on` | The new preload bridge is already typed and allowlisted. |
| `ChatMessages` virtualization | Port, remove tool props and edit/fork affordances | `@tanstack/react-virtual` is already available; session rewinding is not in the Traceability IPC contract. |
| TipTap input and Skill picker | Port a lean version | Main exposes Skills and accepts `jsonContent`/`skillIds`; extension commands are not available. |
| Tool/artifact/extension components | Do not port | Contradicts the read-only scope and brings extension-only dependencies. |
| Permission selector/panel/slices | Do not port | No tools means no permission request can be emitted. |
| Session sidebar/workspace tree | Do not port | Traceability sessions are scoped by `appId`, not divisor workspaces; retain the existing panel menu and command palette. |

## Target layout

```text
app/src/renderer/
├── store/
│   └── agent/
│       ├── entries-slice.ts             # streamed/persisted Entry state
│       ├── sessions-slice.ts            # Session list, active session, selected model/context
│       ├── human-input-slice.ts         # ask-user-question queue only
│       ├── index.ts                     # one vanilla Zustand agentStore
│       └── agent-store.test.ts          # pure state/event regression tests
├── pages/_layout/
│   ├── _agent/
│   │   ├── index.tsx                    # exported right-side AgentPanel
│   │   ├── active-session-content.tsx   # Traceability panel shell
│   │   ├── hooks/
│   │   │   ├── use-agent-messages.ts    # event-to-entry reducer + persistence
│   │   │   ├── use-agent-skills.ts
│   │   │   ├── use-agent-token-usage.ts
│   │   │   └── use-subscribe-agent-events.ts
│   │   ├── human-in-the-loop/
│   │   │   ├── index.ts
│   │   │   └── ask-user-question.tsx    # conversational HIL only
│   │   ├── messages/
│   │   │   ├── index.tsx                # virtualized list
│   │   │   ├── assistant-message.tsx    # text + thinking only; uses Streamdown
│   │   │   ├── user-message.tsx
│   │   │   └── types.ts                 # narrowed entry/message types
│   │   ├── prompt-input/
│   │   │   ├── index.tsx                # TipTap, Skills, abort/send
│   │   │   ├── model-selector.tsx
│   │   │   ├── rich-text.ts
│   │   │   └── skill-node.ts
│   │   └── session/
│   │       ├── session-menu.tsx
│   │       └── use-agent-session.ts     # app switch, create/select/hydrate
│   ├── _components/
│   │   ├── AgentPanel.tsx               # deleted; replaced by _agent/index.tsx
│   │   ├── CommandPalette.tsx           # retained UI; migrated to invoke/store contract
│   │   └── Titlebar.tsx                 # retained UI; migrated to invoke contract
│   └── index.tsx                        # imports AgentPanel from ./_agent
├── lib/agent-events.ts                  # retains public custom events; uses MonitoringContext
└── electron.d.ts                         # deleted; preload/index.d.ts owns window.traceability
```

Only Zustand implementation files belong in `renderer/store/agent/`; all Agent behavior and presentation belongs in `_layout/_agent/`, as requested.

## IPC contract used by this renderer

| Renderer operation | New allowlisted IPC call |
| --- | --- |
| Load/create/list/rename/delete session | `sessions:get`, `sessions:getEntries`, `sessions:create`, `sessions:list`, `sessions:rename`, `sessions:delete` |
| Restore runtime for a selected session | `setSessionId(sessionId, appId)`, `setSessionScope(sessionId, "main")`, `setHistoryMessages(sessionId, messages)` |
| Send/stop | `prompt(sessionId, AppUserMessage)`, `abortPrompt(sessionId)` |
| Persist completed run | `sessions:appendEntries(sessionId, entries)` |
| Model and Skills | `getAvailableModels`, `setModel`, `listSkills`, `setSkillEnabled` |
| Main-to-renderer stream | `window.traceability.on("agent_start" | "agent_end" | "turn_*" | "message_*" | "ask_user_question_requested", handler)` |
| Answer a conversational question | `resolveAskUserQuestion(sessionId, requestId, answer)` |

The renderer must call `window.traceability.invoke(...)` and `window.traceability.on(...)` exclusively. It must not introduce a generic IPC escape hatch or recreate the old domain-specific preload API.

## Session and message lifecycle

```mermaid
sequenceDiagram
  participant UI as Agent panel
  participant Store as Zustand agentStore
  participant Main as AgentPool
  participant DB as SessionService

  UI->>DB: invoke("sessions:getEntries", sessionId)
  UI->>Main: invoke("setSessionId", sessionId, appId)
  UI->>Main: invoke("setHistoryMessages", sessionId, saved messages)
  UI->>Store: hydrate entries as Synced; set active session
  UI->>Main: invoke("prompt", sessionId, AppUserMessage)
  Main-->>Store: agent_start / message_start / message_update / message_end
  Store->>Store: append/update local Entry and streaming entry id
  Main-->>Store: agent_end
  Store->>DB: invoke("sessions:appendEntries", unsynced entries)
  DB-->>Store: mark entries Synced; refresh session list
```

Important invariants:

- Hydration must finish before `setHistoryMessages`; pass only `type === "message"` entries as `AgentMessage[]`.
- Call `setSessionId(sessionId, appId)` before history or prompt so main can enforce the monitoring-context `appId` check.
- Keep entry state indexed by `sessionId`, not just the selected session. A user may switch away while another session is finishing; its events still must be persisted.
- Entries created from stream events begin `Local`, transition to `Syncing`, and only become `Synced` after `sessions:appendEntries` resolves. Retain `Failed` entries and retry them at the next terminal event or explicit panel retry.
- Convert persisted entries to `Synced` at hydration. Preserve their existing `id`, `parentId`, `timestamp`, `data`, and `tokenUsage`; never generate replacement ids.
- Batch append in the exact local order. Main's persistence service is idempotent by entry id and maintains the linear leaf chain.

## Implementation tasks

### Task 1 — Install only renderer dependencies that survive the scope cut

**Files:** `app/package.json`, `pnpm-lock.yaml`

1. Add `zustand` for the central vanilla store + `useStore` bindings.
2. Add `@tiptap/extension-placeholder`, `@tiptap/extension-mention`, and `@tiptap/suggestion` at the same TipTap version already used by the app. These support the existing main-plan TipTap/Skills contract.
3. Do **not** add divisor extension packages, `@dnd-kit/*`, motion, STT, `@streamdown/mermaid`, or artifact dependencies. Existing `streamdown`, TipTap core/react/starter-kit, `@tanstack/react-virtual`, and CJK/code/math packages are sufficient.
4. Run `pnpm install` and confirm `pnpm --filter @traceability/app typecheck` resolves the new imports once the renderer is implemented.

### Task 2 — Replace the legacy renderer IPC boundary

**Files:**

- Delete: `app/src/renderer/components/AgentPanel.tsx` only if it is still an orphaned root copy
- Delete: `app/src/renderer/pages/_layout/_components/AgentPanel.tsx`
- Delete: `app/src/electron.d.ts`
- Modify: `app/src/renderer/pages/_layout/index.tsx`
- Modify: `app/src/renderer/pages/_layout/_components/CommandPalette.tsx`
- Modify: `app/src/renderer/pages/_layout/_components/Titlebar.tsx`
- Modify: `app/src/renderer/lib/agent-events.ts`

1. Change the layout import to `./_agent`; do not move the surrounding Traceability layout, sidebar, or panel-width/resizer styling.
2. Replace `AgentSessionSummary` with `Session` in the command palette; render `session.name || "New conversation"` and call `invoke("sessions:list", appId)`.
3. Keep the existing `traceability:agent-new-session` and `traceability:agent-select-session` browser events. `_agent` owns their listeners so the command palette remains decoupled from Agent UI state.
4. Replace titlebar calls with `invoke("window:minimize")`, `invoke("window:toggleMaximize")`, and `invoke("window:close")`.
5. Change `agent-events.ts` to expose `MonitoringContext` from `@shared/agent-message` rather than the deleted `AgentPromptInput`. It continues to be the stable quick-prompt API consumed by Issues and Performance pages.
6. Remove all imports of `@shared/ipc` and all `window.traceability.agent`, `.sessions`, and `.window` calls. The new `preload/index.d.ts` supplied by the main migration becomes the sole global declaration.

### Task 3 — Build the centralized, trimmed Zustand store

**Files:** create `app/src/renderer/store/agent/{entries-slice.ts,sessions-slice.ts,human-input-slice.ts,index.ts,agent-store.test.ts}`

1. Port divisor's `entries-slice` concepts, narrowing them to `message` and `model_change` entries. Keep `EntryStatus` (`Local`, `Syncing`, `Synced`, `Failed`), `streamingEntryIds`, `appendMessageEntry`, `updateMessageEntry`, `setStreamingEntryCompletedAt`, `setEntryStatus`, and `setSessionEntries`.
2. Remove `ToolExecutionState`, `toolStates`, all artifact state, permission-policy state, and pending tool approvals.
3. Port the useful session slice with `sessions`, `activeSessionId`, `getSession`, upsert/list replacement, `setActiveSessionId`, `setSelectedModel`, and `setMonitoringContext`. Remove divisor workspaces, pending workspace sessions, cwd editing, branches, and side chat.
4. Add a small `human-input-slice` keyed by session id for `AskUserQuestionRequest` only. It queues, resolves, and clears question requests; it has no permission union.
5. Export a single vanilla `agentStore` using `createStore`, and let UI components select from it through `useStore(agentStore, selector)`. Do not create component-local duplicate session/message state.
6. Add pure tests for: stream entry append/update, status transitions, no cross-session mutation, mapping persisted entries to `Synced`, and clearing a deleted session's entries/question state.

### Task 4 — Port typed event subscription and message lifecycle

**Files:** create `app/src/renderer/pages/_layout/_agent/hooks/{use-subscribe-agent-events.ts,use-agent-messages.ts}` and `messages/types.ts`

1. Port divisor's handler-map pattern from `use-subscribe-agent-events.ts`, but subscribe directly through `window.traceability.on`. Keep handler refs so renders do not cause re-subscriptions, and add an optional `shouldHandleEvent` predicate.
2. Port `useAgentMessages` as the central stream reducer. Handle `agent_start`, `turn_start`, `message_start`, `message_update`, `message_end`, and `agent_end`; restrict it to `scope === "main"`.
3. Keep divisor's multi-turn content merge around `turnContentStartIndices`, even though tools are currently disabled. It makes the rendering resilient if a single agent turn emits multiple assistant updates.
4. On a user `message_start`, append prompt/follow-up messages; ignore steering messages only if this first read-only UI does not expose a queue. On assistant start/update/end, create and update one streaming entry.
5. On `agent_end`, append a failed assistant message if the terminal event contains one not already represented, set completion/error status, then persist every non-`Synced` entry using `invoke("sessions:appendEntries", sessionId, entries)`.
6. Remove divisor's tool-event state logic, artifact extraction, `useExtensionsContextAPI`, and permission event handling. `tool_execution_*` events may remain in the shared allowlist but have no renderer subscriber while `tools: []`.
7. Subscribe to `ask_user_question_requested` separately and enqueue only the narrowed question payload. Its panel calls `resolveAskUserQuestion`; do not import or render divisor's permission panel.
8. After a successful append, refresh the application session list so updated order/name is visible. On failure, retain entries as `Failed`, surface a non-blocking error, and retry on the next `agent_end`/manual retry instead of discarding transcript data.

### Task 5 — Implement creation, selection, hydration, and application isolation

**Files:** create `app/src/renderer/pages/_layout/_agent/session/use-agent-session.ts`

1. On `appId` change, reset the active selection and list only `invoke("sessions:list", appId)`. If the application has no session, create one immediately with `invoke("sessions:create", appId)` to preserve today's AgentPanel behavior; the New Conversation button always creates an additional persisted session.
2. Implement one `activateSession(session, appId)` function used by initial load, panel menu, command palette event, and post-create activation. It must:

   - reject a session whose `session.appId !== appId`;
   - fetch `sessions:getEntries` and map them to `Synced` store entries;
   - invoke `setSessionId(session.id, appId)` and `setSessionScope(session.id, "main")`;
   - invoke `setHistoryMessages(session.id, hydratedMessageData)` after the entries are known;
   - set the active session only after the preceding setup succeeds.

3. Use a cancellation/version guard so a slow response for a previous app/session cannot overwrite the current selection.
4. On create, add the returned `Session` to the store and activate it with the same function; do not fabricate client-only session ids.
5. On delete (if the current menu exposes it), call `destroySession` before `sessions:delete`, remove its store data, then select the next session or create a replacement.
6. Derive the initially selected model from the most recent persisted user message's `metadata.model`, otherwise select the first model returned by `getAvailableModels`. Each new `AppUserMessage` still carries the explicit model, so main can restore it with history and apply it at prompt time.
7. Rename a newly active empty session from its first prompt (bounded/truncated text); optimistically update its `name`, call `sessions:rename(sessionId, name)`, and roll back/show an error on failure.

### Task 6 — Port the read-only prompt surface, models, and Skills

**Files:** create `app/src/renderer/pages/_layout/_agent/prompt-input/{index.tsx,model-selector.tsx,rich-text.ts,skill-node.ts}` and `hooks/use-agent-skills.ts`

1. Start from divisor's TipTap editor and its `PromptSubmission` shape. Retain StarterKit, Placeholder, serialized `JSONContent`, model selection, and a small slash/mention Skill picker backed by `invoke("listSkills")`.
2. Retain only Skill nodes/commands. Delete extension prompt-input hooks, extension commands, MCP/file mentions, voice input, permission selector, and permission mode calls.
3. Build messages as `AppUserMessage` with `role`, string `content`, `timestamp`, `kind: "prompt"`, `jsonContent`, selected `metadata.model`, selected `skillIds`, and current `metadata.monitoringContext`.
4. When the agent is idle, Enter submits the prompt. While it runs, show Stop (`abortPrompt`); this first port may keep the composer disabled rather than introduce divisor's steer/follow-up reordering UI. That omission is deliberate and does not affect normal conversation.
5. Model changes update the store's selected model and call `setModel(sessionId, model)` before the next prompt. The prompt still embeds the model as the durable source of truth.
6. Honor external `traceability:agent-prompt` and `traceability:agent-context` events: validate that their context `appId` matches the current application, select/create a session if needed, set the pinned monitoring context, and submit the supplied prompt.

### Task 7 — Port and trim message rendering

**Files:** create `messages/{index.tsx,user-message.tsx,assistant-message.tsx}`, `human-in-the-loop/{index.ts,ask-user-question.tsx}`, `session/session-menu.tsx`, `active-session-content.tsx`, and `index.tsx`

1. Port divisor's `ChatMessages` virtualization and automatic scroll behavior. Remove `toolStates`, sticky/edit/fork controls, side-chat controls, and artifact affordances.
2. Render user messages from stored TipTap JSON using a read-only editor with only the local Skill-node extension. Do not enable editing: Traceability's persistence contract lacks divisor's `setLeaf`/rewind API.
3. Port the useful portions of assistant rendering: merge text blocks, render them with existing `Streamdown` plus Traceability's installed CJK/code/math support, and display thinking blocks in a native collapsible. Remove `AssistantToolMessage`, extension block renderers, artifact links, and extension registry dependencies.
4. Render terminal error/aborted assistant messages visibly. A failed run must keep the partial response and expose a retry/send-again path in the composer rather than clearing it.
5. Port the Ask User Question panel only, restyled with existing Traceability button/select primitives. It submits one `AskUserQuestionResolution` through `resolveAskUserQuestion` and updates the narrowed store. Do not create, import, or leave a placeholder for `PermissionApprovalPanel`.
6. Preserve the current Traceability header, pinned context chips, suggestions, session switcher, and resizer visual language in `active-session-content.tsx`; inject the new chat area and composer beneath it instead of adopting divisor's workspace layout.

### Task 8 — Complete integration changes and remove the broken legacy renderer

**Files:** modify `app/src/renderer/pages/_layout/index.tsx`, `_components/CommandPalette.tsx`, `_components/Titlebar.tsx`, `lib/agent-events.ts`; delete the old `_components/AgentPanel.tsx` and legacy global declaration.

1. Replace the layout's old panel import with `_agent`'s export while keeping the three-column grid and `--agent-width` behavior.
2. Have command-palette session searches use the new `Session` fields and drive the existing custom selection event. Do not duplicate session state in the palette.
3. Update all remaining legacy agent type imports discovered by `rg '@shared/ipc|traceability\\.(agent|sessions|window)' app/src/renderer` until the command has no results.
4. Confirm Issues and Performance quick prompts preserve their app-specific `MonitoringContext`, including `issueId`, `metricName`, and `hours` when present.

### Task 9 — Tests, type-check, and interactive acceptance

1. Add unit tests for the store and extract any non-React event-to-entry conversion that needs deterministic lifecycle tests. Feed a prompt → assistant start/update/end → agent end sequence and assert the persisted batch has stable ids, parents, timestamps, token usage, and no tool/artifact/permission state.
2. Add a mocked-window test for the session activation helper: it must invoke `setSessionId` with `appId`, hydrate history before a prompt, and reject a cross-application session.
3. Run:

   ```bash
   pnpm --filter @traceability/app test
   pnpm --filter @traceability/app typecheck
   pnpm --filter @traceability/app build
   ```

   Unlike the main-only migration checkpoint, all three must pass after this plan.

4. Run `pnpm dev:app` and verify:

   - selecting an application creates/loads only that application's session list;
   - New Conversation creates and activates a persisted session;
   - selecting a session through both the panel menu and Command Palette restores its messages;
   - a normal prompt streams text progressively, can be aborted, and remains visible after completion;
   - restarting the app restores the active session transcript and permits the next turn;
   - issue/performance quick prompts retain their context chip and are accepted by main's `appId` check;
   - no artifact, tool execution, permission selector, or permission approval UI is rendered.

### Task 10 — Refresh documentation after the contract switch

**Files:** `app/CLAUDE.md`, `app/src/shared/CLAUDE.md`, `app/src/preload/CLAUDE.md`, optionally `app/src/renderer/pages/_layout/_agent/CLAUDE.md`

1. Replace references to the old single `shared/ipc.ts` and granular preload methods with the split shared contracts and typed `invoke/on` bridge.
2. Document that `_agent` is the owner of Agent UI/hooks and `store/agent` is the sole renderer state owner.
3. State the read-only boundary explicitly: renderer does not support tools, artifacts, extensions, or permission approval; `AskUserQuestion` is the only retained HIL view.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| The current branch still has old main IPC code while this plan targets the completed main migration. | Do not begin renderer edits until M1–M3 land in the same worktree; compile against `events-ipc.ts` and `session-ipc.ts`, never compatibility-shim the old API. |
| Session hydration races an app switch or a second selection. | Use a monotonic activation id/cancellation guard and validate `session.appId` before writing store state. |
| A renderer crash/IPC error loses streamed transcript. | Keep unsynced entries locally, mark failed append attempts, retry idempotently, and persist on every terminal agent event. |
| Copying full divisor components silently reintroduces write/tool capabilities. | Copy file-by-file from the allowlisted areas above; reject imports from `@divisor-agent/extension-*`, `artifact`, `permission`, `agent-tool`, and `tool_execution`. |
| The old global `electron.d.ts` conflicts with the main plan's preload declaration. | Delete it as part of the first renderer contract task; use `preload/index.d.ts` only. |

## Acceptance mapping

| Required behavior | Plan coverage |
| --- | --- |
| Normal conversation | Tasks 4, 6, and 7: typed prompt, event-stream reducer, Streamdown rendering, abort. |
| Create session | Task 5: `sessions:create`, store insertion, common activation path. |
| Switch session | Task 5 + Task 8: hydrate persistence, restore runtime history, panel and Command Palette selection. |
| Read-only agent | Scope cut + Tasks 3, 4, 6, and 7: no tools/artifacts/permissions imported or rendered. |
