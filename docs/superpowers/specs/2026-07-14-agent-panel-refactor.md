# AgentPanel 重构规格（TODO F，修订版）

**日期**：2026-07-14
**状态**：已对齐，待实现
**来源**：`docs/superpowers/plans/2026-07-14-extension-migration-handoff.md` TODO F
**依赖**：TODO D（extension slash-commands + modal-selector 高内聚 + sharedPromptEditor 经 PromptInput 挂载）、TODO E（assistant-block bridge）先实现
**修订说明**：本版反映 TODO D 的 modal-selector 高内聚决策 - models 加载下沉到 `ModalSelector`，故 `useAvailableModels` hook **不再需要**，TODO F 降为 **2 hook**。

---

## 1. 任务做什么

### 1.1 背景

`_agent/index.tsx` 是 398 行的 monolithic `AgentPanel`：所有逻辑（send/submit/steer/followUp/stop、external 事件监听、context、changeModel/clearContext）+ 所有渲染都堆在一个函数里。divisor 的 `active-session-content.tsx` 用 `useActiveSessionChat()` hook 抽离 chat 逻辑，组件只消费 + 渲染，高内聚。

TODO D 已把 models 加载下沉到 `ModalSelector`，故 `AgentPanel` 不再有 models state/loading（line 47/68-85 已删）。TODO D 也已通过 `PromptInput` 的 `onCreate`/`onDestroy` 挂 `sharedPromptEditor`。

### 1.2 目标

**参考 divisor `active-session-content.tsx` 的代码风格重构 `_agent/index.tsx`**：抽离 hook，让 `AgentPanel` 只消费 hook + 渲染。**不新增 `active-session-content.tsx`**。

**2 hook**（精简）：
- `use-active-session-chat.ts`：chat 逻辑 + 派生状态。
- `use-agent-external-events.ts`：external 事件监听。

（`useAvailableModels` 不需要 - models 加载在 `ModalSelector` 内，TODO D。）

### 1.3 Reconciliation

- **KEEP** TODO D 的 `usePluginSlashCommands`/`usePluginPromptInputExtensions` + `ModalSelector` 高内聚。
- **KEEP** TODO E 的 `useAssistantBlock`/`assistant-tool-message` bridge。
- renderer-migration Tasks 6-8 是"从头建"计划，traceability renderer 已存在 -> 本 TODO 是**重构**（抽 hook）。Task 8 legacy cleanup 已完成。

---

## 2. 变更范围

### 2.1 In scope

- 改 `app/src/renderer/pages/_layout/_agent/index.tsx`：重构 `AgentPanel` 调 2 hook + 渲染。
- 新建 `app/src/renderer/pages/_layout/_agent/hooks/use-active-session-chat.ts`：chat 逻辑 + 派生状态。
- 新建 `app/src/renderer/pages/_layout/_agent/hooks/use-agent-external-events.ts`：external 事件监听。

### 2.2 Out of scope

- **不新增** `active-session-content.tsx`。
- **不新增** `use-available-models.ts`（models 在 ModalSelector，TODO D）。
- 不改 `messages/*`、`prompt-input/*`、`use-chat-editor.ts`（TODO D/E 已改）。
- 不改 `useAgentSession`/`useAgentMessages`/`useAgentTokenUsage`/`useAgentSkills`（既有）。
- 不做 Task 8 legacy cleanup（已完成）。
- 不改 shell 视觉（header/context-chips/session-switcher 保持 traceability 风格）。

---

## 3. 现状基线（已核实，TODO D 后状态）

`_agent/index.tsx`（TODO D 后）的组成：models state/loading **已删**（TODO D）；`sharedPromptEditor` 经 `PromptInput` onCreate/onDestroy 挂（TODO D）。

| 区块 | 内容 | 去向 |
|---|---|---|
| store 订阅 | sessions/activeSessionId/activeSession/entryState/pendingQuestion | useActiveSessionChat（派生） |
| `useAgentMessages`/`useAgentTokenUsage` | 既有 hook | 留组件 |
| context memo | MonitoringContext 派生 | useActiveSessionChat |
| `send` | 核心发送（createSession/setMonitoringContext/auto-rename/invoke prompt） | useActiveSessionChat |
| `submitPrompt`/`steerPrompt`/`followUpPrompt` | 基于 send | useActiveSessionChat |
| external 事件监听 | traceability:agent-prompt/context/new-session/session-updated/select-session | useAgentExternalEvents |
| `changeModel`/`clearContext` | model/context 操作 | useActiveSessionChat |
| 渲染：header | session 名 + new + SessionMenu | 组件（shell） |
| 渲染：context-chips | ContextChip 区 | 组件（shell） |
| 渲染：chat area | ChatMessages | 组件（content） |
| 渲染：composer | PendingMessages/AskUserQuestionPanel/PromptInput | 组件（content） |
| 辅助函数 | createAppUserMessage/ContextChip/contextLabel/rangeLabel | 组件或 helper |

### 3.1 divisor 风格参考

divisor `active-session-content.tsx` line 191-344 `useActiveSessionChat`：hook 内 `submitPrompt`/`steerPrompt`/`followUpPrompt`/`stopPrompt`（useCallback）+ 派生 `entries`/`isRunning`/`streamingEntryId`/`toolStates`/`tokenUsage`；组件只消费 + 渲染。traceability 适配：traceability 的 `send` 多耦合 createSession/context/auto-rename，但同样可抽进 hook。

---

## 4. 变更详情

### 4.1 `hooks/use-active-session-chat.ts`（新建）

```ts
export function useActiveSessionChat(deps: {
  appId: string | undefined;
  createSession: () => Promise<AgentSession | null>;
  renameSession: (id: string, name: string) => Promise<void>;
  setPanelError: (e: string | null) => void;
}) {
  const { invoke } = useElectronIPC();
  // store 订阅: activeSessionId, activeSession, entryState, pendingQuestion
  // context memo (MonitoringContext)
  // send(submission, kind, contextOverride?) - 核心逻辑
  // submitPrompt/steerPrompt/followUpPrompt
  // changeModel (invoke setModel + store setModel + rollback on error)
  // clearContext
  return {
    activeSessionId, activeSession, entries: entryState?.entries ?? [],
    isRunning, streamingEntryId, pendingQuestion, context,
    submitPrompt, steerPrompt, followUpPrompt, changeModel, clearContext,
    stopPrompt: () => activeSessionId ? invoke("abortPrompt", activeSessionId) : Promise.resolve(),
  };
}
```

承载 store 订阅 + context + send/submit/steer/followUp/stop + changeModel/clearContext。`createAppUserMessage` 移入此 hook（send 用）。`changeModel` 用 `activeSession?.model`（无 models 数组 - TODO D 已下沉）。

### 4.2 `hooks/use-agent-external-events.ts`（新建）

```ts
export function useAgentExternalEvents(deps: {
  appId: string | undefined;
  activeSessionId: string | null;
  activeSession?: { appId?: string; model?: AvailableModel | null };
  submitPrompt: (s: PromptSubmission, ctx?: MonitoringContext) => void;
  createSession: () => Promise<AgentSession | null>;
  refreshSessions: () => Promise<Session[]>;
  selectSession: (id: string) => Promise<boolean>;
  setMonitoringContext: (sessionId: string, ctx: MonitoringContext) => void;
  setPanelError: (e: string | null) => void;
}) {
  useEffect(() => {
    // traceability:agent-prompt -> model = activeSession?.model ?? null; 无则 setPanelError("No model configured"); 否则 submitPrompt(createTextDocument(prompt), context)
    // traceability:agent-context -> setMonitoringContext
    // traceability:agent-new-session -> createSession
    // traceability:agent-session-updated -> refreshSessions
    // traceability:agent-select-session -> selectSession
    // return cleanup
  }, [deps...]);
}
```

承载 5 个 window 事件监听。**external-prompt model fallback 用 `activeSession?.model`**（无 `models[0]` - models 在 ModalSelector；无 model 则报错）。用 `createTextDocument` from `./prompt-input/rich-text`。

### 4.3 `index.tsx` 重构

`AgentPanel` 组件：
```tsx
export function AgentPanel() {
  const { appId, currentApp } = useCurrentApp();
  const location = useLocation();
  const { createSession, error: sessionError, refreshSessions, renameSession, selectSession } = useAgentSession(appId || undefined);
  const [panelError, setPanelError] = useState<string | null>(null);
  const chat = useActiveSessionChat({ appId, createSession, renameSession, setPanelError });
  useAgentExternalEvents({
    appId, activeSessionId: chat.activeSessionId, activeSession: chat.activeSession,
    submitPrompt: chat.submitPrompt, createSession, refreshSessions, selectSession,
    setMonitoringContext: agentStore.getState().setMonitoringContext, setPanelError,
  });
  useAgentMessages();
  useAgentTokenUsage();
  const { error: skillsError } = useAgentSkills(); // 只取 error
  const sharedPromptEditor = useSharedPromptEditor();

  // 渲染: header + context-chips + ChatMessages + composer
  // <PromptInput initialModel={chat.activeSession?.model ?? null} onModelChange={chat.changeModel}
  //   onCreate={({editor}) => { sharedPromptEditor.editor = editor; }}
  //   onDestroy={() => { sharedPromptEditor.editor = null; }} ... />
  // ContextChip/contextLabel/rangeLabel 留文件底或移 helper
}
```

- 组件只消费 hook + 渲染。
- `panelError` 组件持有，传给 hooks。
- `sharedPromptEditor` 在组件取（`useSharedPromptEditor`），经 `PromptInput` onCreate/onDestroy 挂（TODO D 已定，TODO F 保持）。

---

## 5. 变更后文件结构

```
pages/_layout/_agent/
├── index.tsx                              # 改:AgentPanel 调 2 hook + 渲染(高内聚)
├── hooks/
│   ├── use-active-session-chat.ts         # 新建:chat 逻辑 + 派生状态
│   ├── use-agent-external-events.ts       # 新建:traceability:agent-* 事件监听(model fallback activeSession?.model)
│   ├── use-agent-messages.ts              # 既有(TODO E 加 tool_execution handlers)
│   ├── use-agent-skills.ts                # 既有
│   ├── use-agent-token-usage.ts           # 既有
│   └── use-subscribe-agent-events.ts      # 既有
├── messages/                              # 不变(TODO E 改)
├── prompt-input/                          # 不变(TODO D 改; modal-selector 高内聚)
├── human-in-the-loop/                     # 不变
├── session/                               # 不变
├── pending-messages/                      # 不变
├── prompt-types.ts                        # 不变
├── session-title.ts                       # 不变
└── use-chat-editor.ts                     # 不变(TODO D 改)
```

---

## 6. 实现步骤

1. **Step 1**：新建 `hooks/use-agent-external-events.ts`（§4.2）：5 个 window 事件监听；external-prompt model fallback 用 `activeSession?.model`。
2. **Step 2**：新建 `hooks/use-active-session-chat.ts`（§4.1）：send/submit/steer/followUp/stop + changeModel/clearContext + 派生状态。`createAppUserMessage` 移入。
3. **Step 3**：重构 `_agent/index.tsx`（§4.3）：`AgentPanel` 调 2 hook + 渲染；`panelError` 组件持有；`sharedPromptEditor` 经 PromptInput onCreate/onDestroy 挂；`ContextChip`/`contextLabel`/`rangeLabel` 留文件底或移 helper。
4. **Step 4**：`pnpm --filter @traceability/app typecheck`（web）。预期 clean。
5. **Step 5**：`pnpm dev:app` smoke：完整 chat 流（创建 session -> prompt -> stream -> steer/followUp -> external prompt 事件 -> 切 session）仍工作。`git commit -m "refactor(app): extract AgentPanel hooks for cohesion"`。

---

## 7. 关键约束 / 决策

- **D1 不新增 active-session-content.tsx**：单 panel，只抽 hook。
- **D2 对齐 divisor 风格**：hook 抽离 chat 逻辑，组件只消费 + 渲染。
- **D3 2 hook**：`useActiveSessionChat`（chat 逻辑+派生）+ `useAgentExternalEvents`（external 事件）。**无 `useAvailableModels`**（models 在 ModalSelector，TODO D）。
- **D4 keep extension hooks**：TODO D 的 `usePluginSlashCommands`/`usePluginPromptInputExtensions`/`ModalSelector` 高内聚 保留。
- **D5 keep assistant-block bridge**：TODO E 的 `assistant-tool-message`/`useAssistantBlock` 保留。
- **D6 `panelError` 组件持有**：跨 hooks 共享，组件 `useState` + `setPanelError` 传 hooks。
- **D7 `createAppUserMessage` 移入 useActiveSessionChat**：send 用，内聚。
- **D8 external-prompt model fallback**：`activeSession?.model`（无则报 "No model configured"），**不用 `models[0]`**（models 在 ModalSelector）。
- **D9 sharedPromptEditor 经 PromptInput 挂**：TODO D 已定（onCreate/onDestroy），TODO F 保持（组件取 `useSharedPromptEditor` + 传回调）。
- **D10 依赖 TODO D/E**：重构在 TODO D/E 后。
- **D11 不改 shell 视觉**：header/context-chips/session-switcher 保持 traceability 风格。
- **D12 ESM specifier**：renderer 侧 import 不用 `.js` 后缀。

---

## 8. 参考

- 上层 handoff：`docs/superpowers/plans/2026-07-14-extension-migration-handoff.md` TODO F。
- divisor 风格参考：`/Users/zhiyu/Desktop/coding/divisor-agent/packages/app/src/renderer/pages/workspace/chat/active-session-content.tsx`（`useActiveSessionChat` line 191-344）。
- 现状：`app/src/renderer/pages/_layout/_agent/index.tsx`（398 行 AgentPanel；TODO D 后删 models state/loading）。
- 依赖：TODO D（`use-chat-editor.ts`/`prompt-input/*`/`modal-selector` 高内聚/sharedPromptEditor 经 PromptInput）、TODO E（`messages/assistant-tool-message.tsx`/`entries-slice.ts` toolStates）。

---

## 9. 验收标准

1. `_agent/index.tsx` 的 `AgentPanel` 不再含 chat 业务逻辑（send/submit/steer/followUp/stop/事件监听）- 在 2 个 hook 里。
2. `hooks/use-active-session-chat.ts` 存在，承载 send/submit/steer/followUp/stop/changeModel/clearContext + 派生状态。
3. `hooks/use-agent-external-events.ts` 存在，承载 5 个 traceability:agent-* 事件监听；external-prompt model fallback 用 `activeSession?.model`。
4. **无** `hooks/use-available-models.ts`（models 在 ModalSelector）。
5. **未新增** `active-session-content.tsx`。
6. TODO D 的 `usePluginSlashCommands`/`usePluginPromptInputExtensions`/`ModalSelector` 高内聚 **仍在**。
7. TODO E 的 `assistant-tool-message.tsx`/`useAssistantBlock` **仍在**。
8. `pnpm --filter @traceability/app typecheck`（web）clean。
9. `pnpm dev:app`：完整 chat 流（prompt/stream/steer/followUp/external 事件/切 session）仍工作。
10. 单个 Conventional Commit：`refactor(app): extract AgentPanel hooks for cohesion`。
