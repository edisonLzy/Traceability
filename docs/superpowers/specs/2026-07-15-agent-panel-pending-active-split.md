---
title: AgentPanel — Split Into PendingSessionContent / ActiveSessionContent
description: 引入 divsor agent 的 pending/active 模式，在 activeSessionId 为 null 时显示欢迎屏，提交时自动创建 session 并提交 prompt；active 时显示现有聊天 UI
spec_author: Claude
spec_date: 2026-07-15
status: draft
---

# AgentPanel — Pending/Active Split

## Motivation

`useActiveSessionChat`（内联于 `_agent/index.tsx`）在 `activeSessionId` 为 null 时所有回调静默 return，导致用户看到的是空的 ChatMessages（"Start a conversation"）和提交后无反应的 PromptInput。`useAgentSession` 虽然定义了自动创建逻辑，但从未被调用。

这与 divisor agent 的体验差异很大：divisor 在无活跃 session 时显示专门的欢迎屏（"我们应该构建什么？"），用户在欢迎屏输入 prompt 时自动完成 create + submit。需要引入相同的 pending/active 模式。

## Scope

| Component | File | Changes |
|-----------|------|---------|
| AgentPanel | `_agent/index.tsx` | 简化为路由选择器，决定渲染 Pending vs Active |
| PendingSessionContent | `_agent/pending-session-content.tsx` | **新建** — 欢迎屏 + create+submit 流程 |
| ActiveSessionContent | `_agent/index.tsx`（保留） | 当前 AgentPanel 的 UI 保持不变（仅包裹条件） |

### Out of scope

- Workspace selector（traceability 不需要，目前只有一个 app）
- Sidebar session list 变更
- store 变更（sessions-slice / entries-slice 已有全部需要的方法）
- `useAgentSession` hook — 保持不动（死代码，另找时机清理）
- `use-agent-messages.ts` / `use-agent-token-usage.ts` 等 hooks — 不变

## Design

### 渲染流程

```tsx
// index.tsx
export function AgentPanel() {
  const activeSessionId = useStore(agentStore, (state) => state.activeSessionId);

  // 无活跃 session → 显示欢迎屏
  if (activeSessionId === null) {
    return <PendingSessionContent />;
  }

  // 有活跃 session → 现有 UI（当前 AgentPanel 代码移入 ActiveSessionContent）
  return <ActiveSessionContent sessionId={activeSessionId} />;
}
```

### PendingSessionContent

交互流程：

```
用户输入 prompt → 点击发送
  │
  ├─ 1. invoke("createSession", "traceability") → Session
  ├─ 2. store.appendSession(session)              // 添加到 sessions 列表
  ├─ 3. store.setActiveSessionId(session.id)       // 触发切换到 ActiveSessionContent
  ├─ 4. invoke("setSessionId", session.id)         // 通知后端 session 身份
  ├─ 5. invoke("setSessionScope", session.id, "main")
  ├─ 6. store.setSessionStatus(session.id, "running")
  ├─ 7. store.setModel(session.id, submission.model)
  ├─ 8. invoke("prompt", session.id, appUserMessage)  // 提交 prompt
  │      └─ 失败 → store.setSessionStatus(session.id, "idle")
  └─ finally: setLoading(false)
```

渲染结构：

```tsx
<aside aria-label="Traceability Agent" className="...">
  <header>
    <Sparkles size={15} />
    <h1>New conversation</h1>
  </header>

  <section className="min-h-0 flex-1 flex items-center justify-center">
    <div className="text-center">
      <h2>What should I help you with?</h2>
    </div>
  </section>

  <section className="shrink-0 border-t ...">
    <PromptInput
      disabled={isLoading}
      initialModel={null}
      isRunning={false}
      onSubmit={submitPrompt}
      sessionId={null}
    />
  </section>
</aside>
```

注意：
- PromptInput 的 `sessionId={null}` 是合法的（其 props 类型 `string | null`）
- `onSubmit` 由 `PendingSessionContent` 自己实现，不做 steer/followUp
- `disabled={isLoading}` —— 创建过程中禁用输入
- 不用 `useAgentMessages()` / `useAgentTokenUsage()` —— 还没有 session 需要监听

### ActiveSessionContent

将当前 `AgentPanel`（`index.tsx` 第 21-106 行）包裹为 `ActiveSessionContent({ sessionId }: { sessionId: string })`：

```tsx
export function ActiveSessionContent({ sessionId }: { sessionId: string }) {
  const chat = useActiveSessionChat(sessionId);
  // ... 渲染代码与原 AgentPanel 一致
}
```

同时，内联的 `useActiveSessionChat` 改为接收 `sessionId: string` 参数（不再从 store 读 `activeSessionId!`），移除所有 `!` 非空断言和 `if (!activeSessionId) return;` 守卫。

### CreateSessionButton

当前 `CreateSessionButton`（`index.tsx` 第 110-135 行）：
- 创建 session → 设置 active → 通知后端
- 在 pending/active 状态下都可以使用
- 建议保留为 `AgentPanel` 的子组件，在两种状态下都能显示

在 `ActiveSessionContent` 中，`CreateSessionButton` 放在 header 的右侧（现有位置）。在 `PendingSessionContent` 中，header 的右侧也放一个 —— 但现有布局已经是新会话，所以点击它等同于"再创建一个"，与 store 的 `setActiveSessionId(null)` 配合。

## File Change Summary

### New files

| File | Purpose |
|------|---------|
| `app/src/renderer/pages/_layout/_agent/pending-session-content.tsx` | 欢迎屏 + create+submit |

### Modified files

| File | Change |
|------|--------|
| `app/src/renderer/pages/_layout/_agent/index.tsx` | AgentPanel 改为路由选择；useActiveSessionChat 改为接收 `sessionId: string`；移除 `!` 断言 |

### No changes

| File | Reason |
|------|--------|
| Store slices | 已有所有需要的方法 |
| useAgentMessages / useAgentTokenUsage | 不变 |
| PromptInput / ChatMessages / sub-components | 不变 |
| Layout (`_layout/index.tsx`) | 不变 — AgentPanel 签名不变 |

## 与 divisor agent 的差异

| 维度 | Divisor | Traceability |
|------|---------|--------------|
| 路由父组件 | `Chat/index.tsx` | `AgentPanel` 自身（没有 Chat 父组件） |
| PendingSession store | `pendingSession: AgentPendingSession`（含 workspaceId） | 无 pendingSession marker（不需要 workspace） |
| Pending 中的 workspace 选择 | 有 | 无（只有一个 app） |
| PromptInput sessionId | 显式传 `sessionId={newSession.id}`（在创建后） | 直接传 `sessionId={null}`（创建前） |

## Verification

1. `pnpm --filter @traceability/app typecheck` — types pass
2. `pnpm --filter @traceability/app exec vitest run` — tests pass
3. `pnpm dev:app` — 验证：
   - **Fresh start（无 session）**：看到欢迎屏（sparkle + "New conversation" + 居中文本 + PromptInput）
   - **提交 prompt**：session 自动创建，UI 切换到 ActiveChat（ChatMessages + running indicator）
   - **已有 session 时**：正常加载并显示第一条 session（现有行为不变）
   - **"New conversation" 按钮**：`store.setActiveSessionId(null)` 后切回欢迎屏
   - **active 状态下输出正常**：steer、followUp、human-in-the-loop 均正常

## 实现步骤

1. **Step 1**：新建 `pending-session-content.tsx`：欢迎屏 + submitPrompt（create + submit 原子流程）
2. **Step 2**：修改 `index.tsx`：AgentPanel 改为路由；useActiveSessionChat 改为接受 `sessionId: string` 参数；移除 `!` 断言和 `if (!activeSessionId) return;` 守卫
3. **Step 3**：`pnpm --filter @traceability/app typecheck` + 修复
4. **Step 4**：`pnpm dev:app` smoke test
5. **Step 5**：Commit `feat(agent): split AgentPanel into PendingSessionContent and ActiveSessionContent`
