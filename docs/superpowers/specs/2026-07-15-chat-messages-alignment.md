---
title: ChatMessages + UserMessage + AssistantMessage — Align with Divisor
description: 重写 ChatMessages、UserMessage、AssistantMessage，对齐 divisor 的实现，包括 sticky message、编辑模式、processing collapsible 和 toolbar
spec_author: Claude
spec_date: 2026-07-15
status: draft
---

# ChatMessages + UserMessage + AssistantMessage Alignment

## Motivation

当前的 ChatMessages、UserMessage、AssistantMessage 与 divisor 版本有较大差异。为了与 AgentPanel 重构保持一致，需要对齐这三个组件的实现。

## Scope

| Component | File | Changes |
|-----------|------|---------|
| ChatMessages | `messages/index.tsx` | Props, sticky message, virtualizer, empty state, layout |
| UserMessage | `messages/user-message.tsx` | Props, editing support, inline editing |
| AssistantMessage | `messages/assistant-message.tsx` | Props, grid layout, processing collapsible, toolbar |

### Out of scope
- FloatingToolbar — not needed
- Token usage / MessageUsage — not needed
- AssistantToolMessage — keep current implementation
- AssistantThinkingMessage — keep current implementation
- AssistantResponseMessage — keep current, only minor prop changes
- ForkMessageButton — keep as simple stub (no actual fork feature yet)

## File Change Summary

### Modified
| File | Change |
|------|--------|
| `app/src/renderer/pages/_layout/_agent/messages/index.tsx` | Align with divisor — add `isRunning`, `messageEntries` props, sticky message, virtualizer params |
| `app/src/renderer/pages/_layout/_agent/messages/user-message.tsx` | Add editing support + new props (`entryId`, `sessionId`, `isRunning`, `entries`) + `StickyUserMessage` + `useStickyUserMessage` |
| `app/src/renderer/pages/_layout/_agent/messages/assistant-message.tsx` | Align props, add grid layout, processing/collapsible, toolbar |

### New
| File | Purpose |
|------|---------|
| `app/src/renderer/components/ui/collapsible.tsx` | Collapsible primitive (wraps `@base-ui/react/collapsible`) |
| `app/src/renderer/pages/_layout/_agent/messages/toolbar/copy-message-button.tsx` | Copy message text to clipboard |
| `app/src/renderer/pages/_layout/_agent/messages/toolbar/message-toolbar.tsx` | Shared toolbar component |

## 1. Collapsible — New UI Component

A thin wrapper around `@base-ui/react/collapsible`. Since `@base-ui/react` is already a dependency, just create the wrapper component.

**File:** `app/src/renderer/components/ui/collapsible.tsx`

```tsx
"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { cn } from "@renderer/lib/utils";

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />;
}

function CollapsibleContent({ className, children, ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className={cn(
        "overflow-hidden [--radix-collapsible-content-height:var(--collapsible-panel-height)] data-open:animate-collapsible-down data-closed:animate-collapsible-up",
        className,
      )}
      {...props}
    >
      <div className="min-h-0">{children}</div>
    </CollapsiblePrimitive.Panel>
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
```

## 2. ChatMessages — Aligned

**File:** `app/src/renderer/pages/_layout/_agent/messages/index.tsx`

**Props (new):**

```typescript
interface ChatMessagesProps {
  entries: SessionEntry[];
  isRunning: boolean;
  messageEntries: MessageEntry[];
  sessionId: string;
  streamingEntryId?: string;
  toolStates: Map<string, ToolExecutionState>;
}
```

**Changes from current:**
1. Add `isRunning` and `messageEntries` as explicit props (remove internal filter)
2. Virtualizer: `estimateSize: 160, gap: 18`
3. Use `useStickyUserMessage` from `./user-message` for sticky message behavior
4. Auto-scroll only when chunks increase (divisor pattern)
5. Empty state: just "Start a conversation" inside a styled card
6. Each message wrapped in `mx-auto max-w-4xl`
7. Render `UserMessage` / `AssistantMessage` directly based on type guard (not `MessageEntryView`)
8. Add `StickyUserMessage` at top when active

## 3. UserMessage — Editing Support

**File:** `app/src/renderer/pages/_layout/_agent/messages/user-message.tsx`

### Props

```typescript
interface UserMessageProps {
  message: AppUserMessage;
  entryId: string;
  sessionId: string;
  isRunning: boolean;
  entries: SessionEntry[];
}
```

### Behavior

Two modes:
- **Read-only mode**: Display the message content via TipTap editor (as currently), plus edit button
- **Edit mode**: Render an editable TipTap editor + save/cancel buttons. Save calls `invoke("setHistoryMessages", sessionId, updatedEntry)` or similar IPC to persist edits.

### Implementation notes

1. Do NOT import `usePluginPromptInputExtensions` from `@divisor-agent/extension-core` — use plain StarterKit + skillNode extensions (as currently)
2. Do NOT import `getSelectedCommandIds` or `useChatEditor` — the editable version should be simpler than the main prompt input
3. The edit button is a simple icon button (like CopyMessageButton styling)

### Exports

The file also exports `StickyUserMessage` and `useStickyUserMessage`:

```typescript
export function StickyUserMessage({ message, onJump }: { message: AppUserMessage; onJump: () => void }) { ... }
export function useStickyUserMessage({ messageEntries, scrollRef, sessionId, virtualizer }: { ... }) { ... }
```

- `StickyUserMessage`: A fixed card at the top of the chat showing the latest user message with a "Click to jump" button
- `useStickyUserMessage`: Hook that determines when the sticky message should appear (when the user scrolls past the newest user message)

## 4. AssistantMessage — Aligned

**File:** `app/src/renderer/pages/_layout/_agent/messages/assistant-message.tsx`

### Props (new)

```typescript
interface AssistantMessageProps {
  completedAt?: number;
  entries: SessionEntry[];
  entryId: string;
  isStreaming: boolean;
  message: AssistantMessageType;
  sessionId: string;
  startedAt: number;
  tokenUsage?: TokenUsage;     // from @renderer/store/agent (not used for display)
  toolStates: Map<string, ToolExecutionState>;
}
```

### Layout changes

From current flex column:
```
✦ Traceability Agent
[thinking]
[tool calls]
[text response]
[error if any]
```

To divisor-style grid:
```
[AI badge] │ [FloatingToolbar]
            │   ├── Collapsible (processing: thinking + tool calls)
            │   │   ├── ProcessingTip (timer: "正在处理 5s")
            │   │   └── thinking / tool messages
            │   ├── Text content (AssistantResponseMessage)
            │   ├── Error card (if has error + no text)
            │   └── MessageToolbar (copy + fork)
```

### ProcessingTip

A small inline timer showing elapsed processing time:
- "正在处理 5s" (streaming, no error)
- "已处理 5s" (completed, no error)
- "处理失败 5s" (has error)
- Uses `setInterval` to update elapsed time while streaming
- Simple CSS shimmer or none (no `motion` dep in traceability)

### Processing Content (Collapsible)

- Split `message.content` into `processingContent` (thinking + toolCall blocks) and `textContent` (text blocks)
- Collapsible starts OPEN when there's no text content yet, closes once text appears
- Collapsible shows thinking and tool messages inside

### MessageToolbar

A simple toolbar at the bottom of assistant messages (only when not streaming and no error):
- Copy button: copies the assistant's response text

### Removed
- FloatingToolbar — not needed
- Token usage display (MessageUsage + HoverCard) — not needed

### Note on `Message` component

Divisor uses `@renderer/components/ai-elements/message` which wraps content in a max-width container. In traceability, we can achieve the same effect with a simple `div` with `max-w-[95%]` class — no need to port the full `Message` component.

## 5. Toolbar Components

### CopyMessageButton

**File:** `app/src/renderer/pages/_layout/_agent/messages/toolbar/copy-message-button.tsx`

- Uses `navigator.clipboard.writeText(text)`
- Shows "复制" by default, briefly shows "已复制" on success
- Renders as a text-only button (no icon) styled like divisor's ghost variant

```tsx
export function CopyMessageButton({ text }: { text: string }) { ... }
```

### MessageToolbar

**File:** `app/src/renderer/pages/_layout/_agent/messages/toolbar/message-toolbar.tsx`

- Simple horizontal layout container

## 6. Integration with AgentPanel

The ChatMessages usage in `_agent/index.tsx` will need to be updated to pass the new props:

```tsx
<ChatMessages
  entries={entries}
  isRunning={isRunning}
  messageEntries={messageEntries}
  sessionId={activeSessionId ?? ""}
  streamingEntryId={streamingEntryId}
  toolStates={toolStates}
/>
```

## Verification

1. `pnpm --filter @traceability/app typecheck` — types pass
2. `pnpm --filter @traceability/app exec vitest run` — tests pass
3. `pnpm dev:app` — verify:
   - Chat renders with new virtualizer params
   - User messages support edit mode
   - Sticky user message appears when scrolling up
   - Assistant messages show processing collapsible with timer
   - Copy button works
   - Fork button renders but is stub
   - No console errors
