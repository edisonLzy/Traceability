---
title: AgentPanel Refactor — Align with Divisor's ActiveSessionContent
description: 将 AgentPanel 重写为 divisor active-session-content.tsx 的结构，移除 traceability 独有功能，对齐 PromptInput props
spec_author: Claude
spec_date: 2026-07-15
status: draft
---

# AgentPanel Refactor — Align with Divisor's ActiveSessionContent

## Motivation

当前 traceability 的 `AgentPanel` 组件有许多 traceability 独有的 UI 功能和 hook 编排，与 divisor 的 `active-session-content.tsx` 差异较大。目标是直接复用 divisor 的代码结构，移除所有 traceability-only 功能，使两个代码库的 chat 组件保持一致，便于后续跨项目维护。

## Removed Features (Traceability-Only)

| Feature | Reason |
|---------|--------|
| Context section (app name + issue/performance chips) | Not in divisor |
| `useAgentExternalEvents()` | DOM custom event dispatching, not in divisor |
| `SessionMenu` + `menuOpen` state | Session switching UI, not in divisor |
| `useCurrentApp()` | App context hook, not in divisor |
| `panelError` state | Not in divisor |
| Footer note ("Read-only access...") | Not in divisor |
| `changeModel()` / `clearContext()` methods | Not in divisor |
| `models` state (model list) + auto-fetch + auto-select | Not in divisor; model management internalized via `useModalSelector` |
| `useAgentSession()` hook | Session CRUD inlined into `CreateSessionButton` + `useActiveSessionChat()` |
| `createSession`/`renameSession` callback params | Replaced by inline IPC calls |
| `ResizablePanelGroup` | Confirmed removal per discussion |
| `motion` animation | Confirmed removal per discussion |

## Preserved Features

| Feature | Reason |
|---------|--------|
| `useAgentMessages()` | Core agent IPC event subscription — AgentPanel is always visible |
| `useAgentTokenUsage()` | Token tracking — AgentPanel is always visible |
| `agentStore` (Zustand store) | State management; adapted to divisor's calling pattern |
| `ChatMessages` component | Existing component, unchanged |
| `PendingMessages` component | Existing component, unchanged |
| `AskUserQuestionPanel` component | Equivalent to divisor's `HumanInTheLoopPanel` |
| `PromptInput` component | Updated to match divisor's props interface |
| `ModalSelector` component | Updated to `useModalSelector` pattern (internal model management) |

## Layout Structure

```
AgentPanel (aside)
  ├── header
  │   ├── CreateSessionButton    (new, inline)
  │   └── <h1> session name
  ├── section (flex-1, overflow-hidden)
  │   └── ChatMessages
  └── section (shrink-0)
      ├── PendingMessages
      ├── AskUserQuestionPanel | PromptInput
      └── (no error display, no footer note)
```

No `ResizablePanelGroup`, no `motion`.

## `useActiveSessionChat()` — Inline Hook

Inlined at the bottom of `index.tsx` (end of file), following divisor's pattern.

### Store reads

```typescript
const activeSessionId = useStore(agentStore, (state) => state.activeSessionId!);
const activeSession = useStore(agentStore, (state) =>
  activeSessionId ? state.getSession(activeSessionId) : undefined,
);
const entryState = activeSessionId
  ? agentStore.getState().getEntryState(activeSessionId)
  : { entries: [], toolStates: EMPTY_TOOL_STATES, status: "idle" as const };
```

### Derived values

- `entries = entryState.entries`
- `messageEntries = entries.filter(isMessageEntry)` — using traceability's existing `isMessageEntry` from `messages/types.ts`
- `toolStates = entryState.toolStates`
- `isRunning = entryState.status === "running"`
- `streamingEntryId = activeSessionId ? agentStore.getState().streamingEntryIds.get(activeSessionId) : undefined`
- `tokenUsage = messageEntries.findLast(entry => entry.tokenUsage)?.tokenUsage`

### Callbacks

**`submitPrompt(submission)`**
1. Sets session status to `running` via store
2. Auto-renames session if: shouldAutoRenameSession && no existing user messages
3. Calls `invoke("prompt", sessionId, appUserMessage)`
4. On error: resets status to `idle`

**`steerPrompt(submission)`** / **`followUpPrompt(submission)`**
1. Creates `AppUserMessage` with kind `"steering"` / `"follow-up"`
2. Adds to pending messages via store
3. Calls `invoke("prompt", sessionId, appUserMessage)`
4. On error: removes from pending messages

**`stopPrompt()`**
1. Calls `invoke("abortPrompt", sessionId)`

All using `useCallback` with appropriate deps.

### Lifecycle hooks

```typescript
useAgentMessages();
useAgentTokenUsage();
```

### PromptInput callbacks

```typescript
const handlePromptInputCreated: PromptInputProps["onCreate"] = ({ editor }) => {
  // no-op in traceability (no extension system)
};
const handlePromptInputDestroyed: PromptInputProps["onDestroy"] = () => {};
```

## `CreateSessionButton` Component

Inline component in `index.tsx`. On click:
1. `invoke("createSession", appId)` — creates session via IPC
2. `agentStore.getState().appendSession(session)` — adds to store
3. `agentStore.getState().setActiveSessionId(session.id)` — activates
4. `invoke("setSessionId", session.id)` / `invoke("setSessionScope", "main")`

Note: `appId` is hardcoded to the app's identifier. The current implementation uses `"traceability"` as fallback — this remains unchanged.

## `PromptInput` — Props Interface Alignment

### Before (traceability)

```typescript
interface PromptInputProps {
  disabled?: boolean;
  isRunning: boolean;
  model: AvailableModel | null;
  models: AvailableModel[];
  onModelChange: (model: AvailableModel | null) => void;
  onFollowUp?: ...
  onSteer?: ...
  onStop: () => void;
  onSubmit: ...
}
```

### After (aligned with divisor)

```typescript
interface PromptInputProps {
  disabled?: boolean;
  isRunning?: boolean;
  initialModel?: AvailableModel | null;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
  onSteer?: (submission: PromptSubmission) => Promise<void> | void;
  onFollowUp?: (submission: PromptSubmission) => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  sessionId: string | null;
  tokenUsage?: TokenUsage;                  // from @renderer/store/agent
  onCreate?: (args: { editor: Editor }) => void;
  onDestroy?: () => void;
}
```

### Internal changes

1. **`useSharedPromptEditor` removed** — replaced by `onCreate`/`onDestroy` callbacks. The `useChatEditor` already forwards these, so just wire them through.

2. **Model management internalized** — `ModalSelector` no longer receives `models`/`onChange` from parent. Instead `useModalSelector(initialModel)` manages the model state internally and fetches models list on mount via `invoke("getAvailableModels")`.

3. **`sessionId` prop added** — for future use (insert prompt text event); currently unused in traceability.

4. **`tokenUsage` prop + ContextUsageControl** — see below.

### Key behavior (unchanged)

- Enter → submit; Shift+Enter → newline
- When running: Enter → steer; Meta/Ctrl+Enter → follow-up
- Stop button (Square icon) when running
- Slash commands integration (unchanged)

## `ContextUsageControl` — New Component

Inline in `prompt-input/index.tsx`, same pattern as divisor.

### New dependencies

| File | Purpose | Source |
|------|---------|--------|
| `app/src/renderer/components/ui/hover-card.tsx` | Hover card for context details | Port from divisor (uses `@base-ui/react/preview-card`) |
| `app/src/renderer/components/ui/progress.tsx` | Progress bar for context usage | Port from divisor (uses `@base-ui/react/progress`) |
| `app/src/renderer/lib/token-usage.ts` | `formatTokenCount()`, `addUsage()`, `getCurrentContextTokens()` | Port from divisor |

### Logic

```
measuredTokens = latestCall.input + latestCall.cacheRead + latestCall.cacheWrite + latestCall.output
contextWindow = model.contextWindow || 128_000
usageRatio = min(contextWindow, measuredTokens) / contextWindow

Color thresholds:
  usageRatio >= 0.85 → destructive (red)
  usageRatio >= 0.65 → signal-yellow
  else              → signal-cyan
```

Display: circular indicator with conic gradient → clicking opens HoverCard with:
- "Context window" label
- `usedTokens / contextWindow · percentage`
- Progress bar
- Status message (varying by threshold)
- Remaining tokens

### Status messages

| Range | Message |
|-------|---------|
| >= 95% | "上下文即将用尽，建议开启新会话。" |
| >= 85% | "上下文使用较高，长任务可能需要压缩历史。" |
| >= 65% | "上下文接近提醒阈值，当前仍可继续。" |
| < 65% | "上下文空间充足，可继续当前任务。" |

## Hook Integration

```typescript
export function AgentPanel() {
  // Inline useActiveSessionChat()
  const { entries, isRunning, ... } = useActiveSessionChat();

  // Store reads
  const activeSessionId = useStore(agentStore, ...);
  const activeSession = useStore(agentStore, ...);
  const pendingHITL = useStore(agentStore, ...);

  // Lifecycle hooks (always visible — panel is always mounted)
  useAgentMessages();
  useAgentTokenUsage();

  // Callbacks
  const handlePromptInputCreated = useCallback(...);
  const handlePromptInputDestroyed = useCallback(...);
  ...
}
```

## File Change Summary

### Modified
| File | Change |
|------|--------|
| `app/src/renderer/pages/_layout/_agent/index.tsx` | Full rewrite — divisor-style layout + inlined `useActiveSessionChat()` + `CreateSessionButton` |
| `app/src/renderer/pages/_layout/_agent/prompt-input/index.tsx` | Props aligned with divisor + ContextUsageControl integration |
| `app/src/renderer/pages/_layout/_agent/prompt-input/modal-selector.tsx` | Rewritten to `useModalSelector` pattern (internal model management, self-fetching) |

### New
| File | Purpose |
|------|---------|
| `app/src/renderer/components/ui/hover-card.tsx` | HoverCard primitive for ContextUsageControl |
| `app/src/renderer/components/ui/progress.tsx` | Progress primitive for ContextUsageControl |
| `app/src/renderer/lib/token-usage.ts` | `formatTokenCount()`, `addUsage()`, `getCurrentContextTokens()` |

### Removed
| File | Reason |
|------|--------|
| `app/src/renderer/pages/_layout/_agent/hooks/use-active-session-chat.ts` | Logic inlined into `index.tsx` |

## Design Decisions

1. **Inline `useActiveSessionChat` in `index.tsx`** — matches divisor's pattern, simplifies the component tree, reduces file count.

2. **PromptInput model via `useModalSelector(initialModel)`** — instead of passing models list from parent, the PromptInput manages model state internally. This simplifies the AgentPanel component and matches divisor's decomposition.

3. **ContextUsageControl ported from divisor** — uses the same `@base-ui/react` primitives already in traceability's dependencies. The implementation is a direct port with minimal adaptation.

4. **`isMessageEntry` kept from traceability** — uses the existing type guard in `messages/types.ts` (equivalent to divisor's `isAgentMessageEntry`).

5. **No PanelHeader / FixedActions from divisor** — the header is kept simple (session name + create button), without divisor's drag region / window controls complexity, since traceability's Electron shell doesn't need those.

## Verification

1. `pnpm --filter @traceability/app typecheck` — verify types pass
2. `pnpm --filter @traceability/app exec vitest run` — verify existing tests pass
3. `pnpm dev:app` — launch app and verify:
   - AgentPanel renders without errors
   - Chat messages display correctly
   - PromptInput works (submit, steer, follow-up)
   - ContextUsageControl shows token usage
   - Session creation button works
   - No console errors related to AgentPanel
