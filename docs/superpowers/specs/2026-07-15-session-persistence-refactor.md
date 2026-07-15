---
title: Session Persistence Refactor — Neon-Server Aligned Branch Model
description: 基于 neon-server 的 leafEntryId + parentId 链表模型重构 session persistence service，使 rewind/编辑功能具备持久化能力
spec_author: Claude
spec_date: 2026-07-15
status: draft
---

# Session Persistence Refactor — Branch Model

## Motivation

当前 traceability 的 session persistence 存在一个关键问题：**rewind（编辑消息后的截断）仅在内存中生效，不会持久化**。重启 app 或重新激活 session 时，所有旧 entries 都会从数据库全量加载，导致编辑后的消息不可见。

需要参考 neon-server 的 `leafEntryId` + `parentId` 链表模型重构 persistence 层，使 rewind 具备持久化能力。

## Core Concept

Entries 通过 `parentId` 形成链表，session 通过 `leafEntryId` 指向链表末端。

```
entry-A (parentId: null)        ← message "今天天气怎么样"
entry-B (parentId: A)           ← assistant "让我查一下"
entry-C (parentId: B)           ← message "改一下问题"  (编辑后的新分支)
entry-D (parentId: C)           ← assistant "好的..."

sessions: { leafEntryId: D }    ← 指向活跃分支的末端
```

编辑后：
```
setLeaf(sessionId, B)           → leafEntryId: B
appendEntry(C', parentId: B)    → leafEntryId: C'
                                → 旧 C 和 D 从活跃链脱离
```

**数据库始终是 append-only。** 旧 entries 保留但不再出现在 `getBranch` 结果中。

## Schema

已有的 migration #2 已在 `agent_entries` 和 `agent_sessions` 中定义了所需字段：

```sql
-- agent_sessions
leaf_entry_id TEXT              -- 指向活跃链末端的 entry 指针

-- agent_entries
parent_id TEXT                  -- 前一个 entry 的 id，形成链表
timestamp INTEGER               -- entry 创建时间
```

不需要 schema 变更。

## New IPC Channels

### 新增

| Channel | Direction | Params | Returns | Description |
|---------|-----------|--------|---------|-------------|
| `getBranch` | renderer→main | `{ sessionId, leafId? }` | `Entry[]` | 从 leafEntryId 沿 parentId 链往回走，返回活跃链上的 entries |
| `setLeaf` | renderer→main | `{ sessionId, entryId }` | `void` | 设置 session 的 leafEntryId 指针 |
| `buildContext` | renderer→main | `{ sessionId, leafId? }` | `{ messages, model }` | 用 getBranch 构建 agent 运行时上下文 |

### 修改

| Channel | Change |
|---------|--------|
| `appendSessionEntries` | 写入后更新 `leafEntryId` 为最后一条 entry（已有，但需验证） |
| `getSessionEntries` | **保留兼容性**（某些场景需要全量查询），但 renderer 默认用 `getBranch` |
| `createSession` | 返回的 session 包含 `leafEntryId` 字段 |

### IPC Type Contract (shared/*-ipc.ts)

**`session-persistence-ipc.ts`** — 新增接口：

```typescript
interface SessionPersistenceIPC {
  // ... existing methods ...

  getBranch: (sessionId: string, leafId?: string) => Promise<Entry[]>;
  setLeaf: (sessionId: string, entryId: string) => Promise<void>;
  buildContext: (sessionId: string, leafId?: string) => Promise<{
    messages: AgentMessage[];
    model: { providerId: string; modelId: string } | null;
  }>;
}
```

## Service Implementation (`main/sessions/session-persistence.ts`)

### `getBranch(sessionId, leafId?)`

```
1. 读取 leafEntryId（从 session row 或参数 leafId）
2. 若无 leafEntryId，返回空数组
3. SELECT * FROM agent_entries WHERE session_id = ?
   （全量读取，后续可优化为递归 CTE）
4. 构建 Map<entryId, entry>
5. 从 leafEntryId 开始，沿 parentId 链往回走:
   while currentId:
     entry = map.get(currentId)
     if !entry: break
     push to branch
     currentId = entry.parentId
6. 反转 branch（从旧到新）
7. 返回
```

### `setLeaf(sessionId, entryId)`

```
1. 验证 entry 存在且属于该 session
2. UPDATE agent_sessions SET leaf_entry_id = entryId WHERE id = sessionId
```

### `buildContext(sessionId, leafId?)`

```
1. branch = getBranch(sessionId, leafId)
2. 遍历 branch:
   - type === "message" → 构建 messages[]
   - type === "model_change" → 更新 model
3. 返回 { messages, model }
```

### `appendSessionEntries` — 修改点

现有实现已在批量插入后更新 `leafEntryId`。需确保：
- 每条 entry 的 `parentId` 正确设置
- 最后一个 entry 的 id 写入 `leaf_entry_id`

## Renderer 侧变更

### Session 激活 (use-agent-session.ts)

当前：
```typescript
const entries = await invoke("getSessionEntries", session.id);
```

改为：
```typescript
const branch = await invoke("getBranch", session.id);
// branch 只包含活跃链上的 entries
```

### Edit 流程 (user-message.tsx)

**Before (仅内存截断):**
```
entries.slice(0, targetIndex)
setSessionEntries(sessionId, rewindEntries)
setHistoryMessages(sessionId, runtimeMessages)
setSessionStatus(sessionId, "running")
prompt(sessionId, editedMessage)
```

**After (持久化 leaf change):**
```
targetEntry = entries[targetIndex]
parentEntry = entries[targetIndex - 1]（如果存在）

// 1. 设置 leaf 到 edited entry 的父节点
await invoke("setLeaf", sessionId, parentEntry.id)

// 2. 截断 renderer store（与之前一致）
rewindEntries = entries.slice(0, targetIndex)
agentStore.setSessionEntries(sessionId, rewindEntries)

// 3. 同步 agent runtime（与之前一致）
setHistoryMessages(sessionId, runtimeMessages)

// 4. 设置状态为 running + 提交通道
setSessionStatus(sessionId, "running")
prompt(sessionId, editedMessage)
// 新 entries 会通过 appendSessionEntries 自动写入，
// leafEntryId 会更新为新写入的最后一条
```

### Append entries 时确保 parentId

当前 `use-agent-messages.ts` 中的 `persistUnsyncedEntries()` 会通过 `appendSessionEntries` 批量写入 entries。需确认 `parentId` 字段在 `Entry` 类型和写入时正确传递。

`SessionEntry` 类型已有 `parentId` 字段。

## File Change Summary

### Modified
| File | Change |
|------|--------|
| `app/src/shared/session-persistence-ipc.ts` | 新增 `getBranch`、`setLeaf`、`buildContext` 接口 |
| `app/src/main/sessions/session-persistence.ts` | 实现 `getBranch`、`setLeaf`、`buildContext`；`appendSessionEntries` 确保 leafEntryId 更新 |
| `app/src/main/index.ts` | 注册新的 IPC handler |
| `app/src/renderer/pages/_layout/_agent/session/use-agent-session.ts` | 激活 session 时用 `getBranch` 替代 `getSessionEntries` |
| `app/src/renderer/pages/_layout/_agent/messages/user-message.tsx` | Edit 流程中增加 `setLeaf` 调用 |

### Unchanged
| File | Reason |
|------|--------|
| `app/src/renderer/store/agent/entries-slice.ts` | 内存状态管理逻辑不变 |
| `app/src/renderer/pages/_layout/_agent/hooks/use-agent-messages.ts` | Event 订阅和持久化逻辑不变 |
| `app/src/renderer/pages/_layout/_agent/hooks/use-agent-token-usage.ts` | 不涉及 |

### Schema
No changes needed — `parent_id` and `leaf_entry_id` already exist from migration #2.

## Design Decisions

1. **`getBranch` 全量读取后内存遍历** — 而不是用 SQL 递归 CTE。traceability 用 `better-sqlite3`（同步 API），递归 CTE 在 SQLite 中性能有限。每个 session 的 entries 数量通常 < 1000，全量读入内存后在 Map 中遍历已足够快。未来可优化。

2. **保留 `getSessionEntries`** — 某些 debug/迁移场景可能需要全量查询。renderer 默认改用 `getBranch`。

3. **`buildContext` 新增独立通道** — 而非在 renderer 侧做 branch → messages 的转换。将上下文构建逻辑放在主进程，与 neon-server 的 `buildContext` 对齐。

4. **Edit 流程两阶段** — (1) `setLeaf` 持久化指针变更 (2) 旧的内存截断逻辑保留，确保 UI 即时响应。`appendSessionEntries` 会在 agent_end 时将新 entries 持久化。

## Verification

1. `pnpm --filter @traceability/app typecheck` — types pass
2. `pnpm --filter @traceability/app exec vitest run` — tests pass
3. Manual E2E testing:
   - Start a conversation, exchange a few messages
   - Edit a user message → save and resubmit
   - Verify new conversation proceeds from the edit point
   - Restart app → verify the edited conversation loads correctly (no stale entries visible)
   - Verify `leaf_entry_id` in SQLite points to the latest entry
   - Verify `parentId` chain is correct for all entries
