# Assistant Blocks 渲染规格（TODO E）

**日期**：2026-07-14
**状态**：已对齐，待实现
**来源**：`docs/superpowers/plans/2026-07-14-extension-migration-handoff.md` TODO E
**依赖**：subagents extension（commit `36f843a` 已产出 `details.assistantBlock` + 注册 block renderer）；`tool_execution_*` 事件已在 `ALLOWED_MAIN_EXPOSE_EVENTS`
**目标**：为本 spec 的实现者提供自洽、可执行的契约。

---

## 1. 任务做什么

### 1.1 背景

`subagents/run` tool 让 agent 并行派生子任务，并发布一个 `subagents.list` assistant block（实时子任务状态列表）。traceability 的 subagents extension（commit `36f843a`）**已产出**该 block：
- `builtins/subagents/main/index.ts:176`：run tool 返回 `details: snapshot`，`snapshot.assistantBlock = {type: "subagents.list", props}`；
- `builtins/subagents/renderer/index.tsx:87`：注册 `subagents.list` block renderer；
- `builtins/subagents/common/types.ts:41`：`SUBAGENTS_LIST_BLOCK_TYPE = "subagents.list"`。

`tool_execution_*` 事件已 allowlist（`shared/events-ipc.ts`）。但 traceability 的 renderer **缺少整条消费链路**：`use-agent-messages.ts` 不处理 `tool_execution_*`、store 无 `toolStates`、无 `assistant-tool-message` 组件、`messages/index.tsx`+`assistant-message.tsx` 不传 toolStates。结果：`subagents.list` block 永远不渲染。

### 1.2 Seam trace 结论（handoff Step 1，已核实）

`subagents.list` 走 **path (b)**（tool-execution details），**不是** path (a)（text `divisor-block` fence）：

```
subagents/run tool
  -> returns details.assistantBlock = {type:"subagents.list", props}   [已产出]
  -> tool_execution_update/end 事件 carry details                      [事件已 allowlist]
  -> use-agent-messages.ts: setToolState(sessionId, toolCallId, {details})   [缺失 - 本 TODO 补]
  -> store toolStates[toolCallId].details                               [缺失 - 本 TODO 补]
  -> assistant-message.tsx: toolStates.get(block.id) 传给 AssistantToolMessage  [缺失 - 本 TODO 补]
  -> assistant-tool-message.tsx: getAssistantBlockDescriptor(details) -> useAssistantBlock(type) -> <Block>  [缺失 - 本 TODO 补]
```

**handoff 原文说改 `assistant-response-message.tsx` + `parseExtensionParts`（path a）- 错误，不要改 `assistant-response-message.tsx`。**

### 1.3 目标

补 path (b) 整条链路，使 `subagents.list` block 在 assistant 消息流中渲染并实时更新。**只做 assistant-block bridge** - 不要 tool card UI（Collapsible/Input/output）、不要 artifact upsert、不要 permission（read-only agent，见 handoff Global Constraints）。

---

## 2. 变更范围

### 2.1 In scope

- 改 `app/src/renderer/store/agent/entries-slice.ts`：加 `ToolExecutionState` + `toolStates` + `setToolState`。
- 改 `app/src/renderer/pages/_layout/_agent/hooks/use-agent-messages.ts`：加 `tool_execution_start/update/end` handler（details carry-through，无 artifact upsert）。
- 新建 `app/src/renderer/pages/_layout/_agent/messages/assistant-tool-message.tsx`：slim block bridge（无 tool card UI）。
- 改 `app/src/renderer/pages/_layout/_agent/messages/assistant-message.tsx`：接收 `toolStates`+`sessionId`，渲染 toolCall -> `AssistantToolMessage`。
- 改 `app/src/renderer/pages/_layout/_agent/messages/index.tsx`：传 `toolStates`+`sessionId` 给 `AssistantMessage`。

### 2.2 Out of scope

- **不改** `assistant-response-message.tsx`（path a，`subagents.list` 不走）。
- **不要** tool card UI（`assistant-tool-message.tsx` 只渲染 block，无 Collapsible/Input/output/Shimmer）。
- **不要** `upsertArtifactsFromToolDetails`（read-only agent 无 artifacts）。
- **不要** permission/approval（`ToolExecutionState` 无 `awaiting_approval`/`requestId`/`approvalStatus`）。
- **不持久化** `toolStates`（in-memory only，重启后不恢复 tool 状态 - divisor 同样不持久化）。
- 不碰 TODO F（active-session-content 拆分）。

---

## 3. 现状基线（已核实）

| 项 | 现状 |
|---|---|
| subagents extension 产出 `details.assistantBlock` | **已就绪**（`builtins/subagents/main/index.ts:176`） |
| `subagents.list` block renderer 注册 | **已就绪**（`builtins/subagents/renderer/index.tsx:87`） |
| `tool_execution_*` in `ALLOWED_MAIN_EXPOSE_EVENTS` | **已就绪**（`shared/events-ipc.ts`） |
| `useAssistantBlock(type)` hook | **已就绪**（`extensions/core/renderer/hooks.ts`，返回 registration 含 `render`） |
| store `toolStates` / `ToolExecutionState` / `setToolState` | **缺失**（`entries-slice.ts` 的 `EntryState = {entries, status}`） |
| `use-agent-messages.ts` 的 `tool_execution_*` handler | **缺失**（只有 agent_start/end、turn_start、message_start/update/end、ask_user_question_requested） |
| `assistant-tool-message.tsx` | **缺失** |
| `assistant-message.tsx` 传 toolStates / 渲染 toolCall | **缺失**（lean: 只 AssistantThinkingMessage + AssistantResponseMessage） |
| `messages/index.tsx` 传 toolStates | **缺失**（`MessageEntryView` 只传 entry + isStreaming） |
| `AssistantMessage`（pi-ai）content 含 toolCall block | 是（`message.content` 数组，block.type `"text"`/`"thinking"`/`"toolCall"`；toolCall 有 `id`/`name`/`arguments`） |
| `messages/types.ts` | 有 `assistantText`/`assistantThinking`/`isAssistantMessage`（无 toolCall 提取辅助） |

---

## 4. 数据契约

### 4.1 `ToolExecutionState`（精简版，加到 `entries-slice.ts`）

```ts
export type ToolExecutionStatus = "running" | "done" | "error";

export interface ToolExecutionState {
  toolCallId: string;
  toolName: string;
  status: ToolExecutionStatus;
  args: unknown;
  details?: unknown;
  output: string;
}
```

> 比 divisor 精简：去掉 `awaiting_approval`/`ToolApprovalStatus`/`requestId`/`approvalStatus`（read-only agent 无 permission）。`status` 只有 `running`/`done`/`error`。`details` 字段是 `assistantBlock` 的载体（`details.assistantBlock = {type, props}`）。

### 4.2 `EntryState` / `EntriesSlice` 改动（`entries-slice.ts`）

```ts
export interface EntryState {
  entries: SessionEntry[];
  toolStates: Map<string, ToolExecutionState>;   // 新增
  status: SessionStatus;
}

export interface EntriesSlice {
  // ... 现有成员 ...
  setToolState: (sessionId: string, toolCallId: string, state: ToolExecutionState) => void;   // 新增
}

export const EMPTY_ENTRY_STATE: EntryState = {
  entries: [],
  toolStates: new Map(),   // 新增
  status: "idle",
};
```

`setToolState` 实现：复制 `entryStates` map -> 取 `getOrCreateEntryState` -> 复制其 `toolStates` map -> `set(toolCallId, state)` -> 写回。`removeEntryState` 已删整个 `EntryState`（toolStates 随之清），无需额外改。`setSessionEntries`（持久化恢复）不动 `toolStates`（保持 in-memory）。

### 4.3 `tool_execution_*` 事件 payload（来自 `AgentEvent`，pi-agent-core）

- `tool_execution_start`：`{ sessionId, toolCallId, toolName, args }`
- `tool_execution_update`：`{ sessionId, toolCallId, toolName, args, partialResult?: { details? } }`
- `tool_execution_end`：`{ sessionId, toolCallId, toolName, result?: { content?, details? }, isError }`

### 4.4 `assistantBlock` descriptor（`assistant-tool-message.tsx` 内）

```ts
interface AssistantBlockDescriptor {
  props: Record<string, unknown>;
  type: string;
}

function getAssistantBlockDescriptor(details: unknown): AssistantBlockDescriptor | null {
  if (!isRecord(details) || !isRecord(details.assistantBlock)) return null;
  const { assistantBlock } = details;
  if (typeof assistantBlock.type !== "string") return null;
  return {
    props: isRecord(assistantBlock.props) ? assistantBlock.props : {},
    type: assistantBlock.type,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

（从 divisor `assistant-tool-message.tsx` line 98-121 verbatim 移植。）

---

## 5. 变更详情

### 5.1 `store/agent/entries-slice.ts`

- 加 §4.1 的 `ToolExecutionStatus`/`ToolExecutionState`。
- `EntryState` 加 `toolStates: Map<string, ToolExecutionState>`。
- `EntriesSlice` 加 `setToolState`。
- `EMPTY_ENTRY_STATE` 加 `toolStates: new Map()`。
- 实现 `setToolState`（§4.2）。`getOrCreateEntryState` 需确保复制 `toolStates`（与 `entries` 同样的不可变更新模式）。

> 注意：`EMPTY_ENTRY_STATE` 是共享单例，`getOrCreateEntryState` 返回它时不能被 mutate。`setToolState` 必须走 `set((previous) => ...)` 复制路径，不能直接 mutate `EMPTY_ENTRY_STATE.toolStates`。`getOrCreateEntryState` 现状返回 `EMPTY_ENTRY_STATE`（只读 fallback），各 setter 都复制进新 state - `setToolState` 同样复制。

### 5.2 `hooks/use-agent-messages.ts`

在 `useSubscribeAgentEvents` 的 handler 对象加三个 handler（用 `agentStore.getState()`，**无** `upsertArtifactsFromToolDetails`）：

```ts
tool_execution_start: (event) => {
  const { sessionId, toolCallId, toolName, args } = event;
  const existing = agentStore.getState().getEntryState(sessionId).toolStates.get(toolCallId);
  if (existing) return;
  agentStore.getState().setToolState(sessionId, toolCallId, {
    toolCallId, toolName, status: "running", args, output: "",
  });
},

tool_execution_update: (event) => {
  const { sessionId, toolCallId, toolName, args } = event;
  const existing = agentStore.getState().getEntryState(sessionId).toolStates.get(toolCallId);
  if (!existing) return;
  const details = event.partialResult?.details ?? existing.details;
  agentStore.getState().setToolState(sessionId, toolCallId, {
    toolCallId, toolName, status: "running", args, details, output: existing.output,
  });
},

tool_execution_end: (event) => {
  const { sessionId, toolCallId, toolName, result, isError } = event;
  const resultContent = result?.content;
  const output = Array.isArray(resultContent) ? extractToolResultText(resultContent) : "";
  const existing = agentStore.getState().getEntryState(sessionId).toolStates.get(toolCallId);
  agentStore.getState().setToolState(sessionId, toolCallId, {
    toolCallId, toolName,
    status: isError ? "error" : "done",
    args: existing?.args ?? {},
    details: result?.details ?? existing?.details,
    output,
  });
},
```

- `extractToolResultText`：从 `result.content`（`[{type:"text", text}]`）拼 text。可内联一个辅助，或复用 divisor 的逻辑（divisor 从 `@renderer/lib/agent-tool` import `extractToolResultText` - traceability 无此模块，内联实现：`content.filter(b => b.type === "text").map(b => b.text).join("")`）。
- **可选 fallback**：在 `message_update` handler 里，对 `event.message.content` 的 toolCall block，若无 existing toolState 则 `setToolState({status:"running"})`（divisor line 182-196，防御性，应对 `tool_execution_start` 未到的场景）。建议加。

### 5.3 新建 `messages/assistant-tool-message.tsx`（slim block bridge）

```tsx
import { useAssistantBlock } from "@extensions/core/renderer";
import type { ToolExecutionState } from "@renderer/store/agent";

interface AssistantToolMessageProps {
  sessionId: string;
  toolState?: ToolExecutionState;
}

export function AssistantToolMessage({ sessionId, toolState }: AssistantToolMessageProps) {
  const descriptor = getAssistantBlockDescriptor(toolState?.details);
  const registration = useAssistantBlock(descriptor?.type ?? "");
  const Block = registration?.render;

  if (!descriptor || !Block) return null;

  return <Block props={{ ...descriptor.props, sessionId }} raw={JSON.stringify(descriptor)} />;
}

// getAssistantBlockDescriptor + isRecord: 见 §4.4（从 divisor verbatim）
```

- **无** tool card UI：去掉 divisor 的 `Collapsible`/`CollapsibleTrigger`/`CollapsibleContent`/`Shimmer`/`ChevronRightIcon`/`formatToolArgs`/`statusLabel`/Input/output 区。
- 只有 `details.assistantBlock` 存在且 block renderer 已注册时才渲染 `<Block>`，否则 `null`（不占位）。
- `useAssistantBlock` 是 hook，顶层调用；`descriptor?.type ?? ""` 保证 hook 稳定调用。
- props 只需 `sessionId` + `toolState`（不需要 `toolName`/`args` - 无 tool card 展示）。

### 5.4 改 `messages/assistant-message.tsx`

- 加 `toolStates: Map<string, ToolExecutionState>` + `sessionId: string` 到 props。
- 从 `message.content` 分离 toolCall blocks（divisor 的 reduce 模式，或 filter `block.type === "toolCall"`）。
- toolCall block 渲染：`<AssistantToolMessage key={block.id} sessionId={sessionId} toolState={toolStates.get(block.id)} />`。
- 保留 traceability 现有结构：header（"Traceability Agent"）+ `AssistantThinkingMessage` + `AssistantResponseMessage` + error 块。toolCall 渲染插在合适位置（建议 thinking 之后、response 之前，或与 thinking 同区 - 参考 divisor 的 processingContent 顺序）。
- import `AssistantToolMessage` + `ToolExecutionState` type。

### 5.5 改 `messages/index.tsx`

- `ChatMessages` 需取 `toolStates`：从 `agentStore.getState().getEntryState(sessionId).toolStates`。需 `sessionId` - `ChatMessages` 现状不接收 sessionId，需加 prop（从调用方 `_agent/index.tsx` 传入 `activeSessionId`），或从 entry 取 `entry.sessionId`。
- `MessageEntryView` 传 `toolStates` + `sessionId` 给 `AssistantMessage`。
- 建议：`MessageEntryView({ entry, isStreaming, toolStates, sessionId })` -> `AssistantMessage({ ..., toolStates, sessionId })`。

> `ChatMessages` 的调用方（`_agent/index.tsx`）需传 `sessionId`（activeSessionId）。这是 `index.tsx` 的小改动 - spec 涵盖。

---

## 6. 变更后文件结构

```
app/src/renderer/
├── store/agent/
│   └── entries-slice.ts                          # 改:+ToolExecutionState/toolStates/setToolState
└── pages/_layout/_agent/
    ├── hooks/use-agent-messages.ts               # 改:+tool_execution_* handlers(无 artifact upsert)
    └── messages/
        ├── assistant-tool-message.tsx            # 新建(slim block bridge, 无 tool card)
        ├── assistant-message.tsx                 # 改:+toolStates/sessionId, 渲染 toolCall
        ├── index.tsx                             # 改:传 toolStates/sessionId
        ├── assistant-response-message.tsx        # 不变
        ├── assistant-thinking-message.tsx        # 不变
        ├── types.ts                              # 不变(或加 toolCall 提取辅助)
        └── user-message.tsx                      # 不变
```

---

## 7. 实现步骤

1. **Step 1**：改 `entries-slice.ts`（§5.1）：加 `ToolExecutionState`/`toolStates`/`setToolState`。
2. **Step 2**：改 `use-agent-messages.ts`（§5.2）：加 `tool_execution_start/update/end` handler + 可选 `message_update` toolCall fallback + `extractToolResultText` 辅助。
3. **Step 3**：新建 `assistant-tool-message.tsx`（§5.3）：slim block bridge。
4. **Step 4**：改 `assistant-message.tsx`（§5.4）：加 toolStates/sessionId，渲染 toolCall -> AssistantToolMessage。
5. **Step 5**：改 `messages/index.tsx`（§5.5）：传 toolStates/sessionId（调用方 `_agent/index.tsx` 传 sessionId）。
6. **Step 6**：`pnpm --filter @traceability/app typecheck`（web）。预期 clean。
7. **Step 7**：`pnpm dev:app`；触发 `subagents/run`（让 agent 并行一个任务）；确认 `subagents.list` 状态 block 渲染并实时更新。
8. **Step 8**：`git commit -m "feat(app): render extension assistant blocks (subagents.list)"`。

---

## 8. 关键约束 / 决策

- **D1 path (b)**：`subagents.list` 走 tool-execution details，**不**走 `parseExtensionParts`/text fence。不改 `assistant-response-message.tsx`。
- **D2 slim block bridge**：`assistant-tool-message.tsx` 只渲染 `<Block>`，**无** tool card UI（Collapsible/Input/output/Shimmer）。
- **D3 无 artifact upsert**：不移植 `upsertArtifactsFromToolDetails`（read-only agent 无 artifacts）。
- **D4 无 permission**：`ToolExecutionState` 无 `awaiting_approval`/`requestId`/`approvalStatus`；`status` 只有 `running`/`done`/`error`。
- **D5 toolStates 不持久化**：in-memory only，`setSessionEntries` 不动 toolStates。
- **D6 store 不可变更新**：`setToolState` 走 `set((previous) => ...)` 复制路径，不 mutate `EMPTY_ENTRY_STATE.toolStates`。
- **D7 用 `agentStore.getState()`**：traceability 风格（不是 divisor 的 `mainStore`）。
- **D8 `useAssistantBlock` hook 顶层调用**：`descriptor?.type ?? ""` 保证稳定；条件返回 null 在 hook 之后。
- **D9 toolCall.id 关联 toolStates**：`message.content` 的 toolCall block 用 `block.id` 查 `toolStates.get(block.id)`（与 divisor 一致）。
- **D10 依赖 subagents extension（已就绪）+ tool_execution 事件（已 allowlist）**：本 TODO 只补 renderer 消费链路。
- **D11 ESM specifier**：renderer 侧 import 不用 `.js` 后缀。

---

## 9. 参考

- 上层 handoff：`docs/superpowers/plans/2026-07-14-extension-migration-handoff.md` TODO E（含 seam trace 结论）。
- divisor 参考：`/Users/zhiyu/Desktop/coding/divisor-agent/packages/app/src/renderer/pages/workspace/chat/messages/assistant-tool-message.tsx`（`getAssistantBlockDescriptor` verbatim 移植；tool card UI **不**移植）+ `messages/assistant-message.tsx`（toolCall 分离 + toolStates 关联逻辑）+ `pages/workspace/use-agent-messages.ts`（`tool_execution_*` handler 逻辑，去 `upsertArtifactsFromToolDetails`）+ `store/entries-slice.ts`（`ToolExecutionState`/`toolStates`/`setToolState` 形状，精简 permission 字段）。
- subagents extension（已就绪）：`app/src/extensions/builtins/subagents/{main/index.ts:176, common/types.ts:41, renderer/index.tsx:87}`。
- 现状：`entries-slice.ts`、`use-agent-messages.ts`、`messages/{index,assistant-message,assistant-response-message,types}.tsx`、`extensions/core/renderer/hooks.ts`（`useAssistantBlock`）。

---

## 10. 验收标准

1. `entries-slice.ts` 含 `ToolExecutionState`（slim，无 permission 字段）+ `EntryState.toolStates` + `setToolState`；`EMPTY_ENTRY_STATE.toolStates = new Map()`。
2. `use-agent-messages.ts` 处理 `tool_execution_start/update/end`，`setToolState` 含 `details` carry-through；**无** `upsertArtifactsFromToolDetails`。
3. `assistant-tool-message.tsx` 存在：从 `toolState.details` 取 `assistantBlock` -> `useAssistantBlock` -> `<Block>`；无 tool card UI；无 descriptor 时返回 null。
4. `assistant-message.tsx` 接收 `toolStates`+`sessionId`，toolCall block 渲染 `<AssistantToolMessage toolState={toolStates.get(block.id)} />`。
5. `messages/index.tsx` 传 `toolStates`+`sessionId` 给 `AssistantMessage`。
6. `assistant-response-message.tsx` **未改**。
7. `pnpm --filter @traceability/app typecheck`（web）clean。
8. `pnpm dev:app`：触发 `subagents/run`，`subagents.list` block 渲染并实时更新。
9. 单个 Conventional Commit：`feat(app): render extension assistant blocks (subagents.list)`。
