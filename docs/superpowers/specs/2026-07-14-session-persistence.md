# Session Persistence 实现规格（TODO A）

**日期**：2026-07-14
**状态**：已对齐，待实现
**来源**：`docs/superpowers/plans/2026-07-14-extension-migration-handoff.md` TODO A
**关联计划**：`docs/superpowers/plans/2026-07-13-agent-main-migration.md` Phase M3（Task 15–16 verbatim；Task 17–18 经本规格改写）
**目标**：为本 spec 的实现者提供自洽、可执行的契约，无需回看会话上下文。

---

## 1. 任务做什么

### 1.1 背景

Traceability 的 agent chat 当前是**纯内存**的：`AgentRuntime`/`AgentPool`（`app/src/main/agent-*.ts`）不持久化会话与消息。重启 app 后历史丢失。

与此同时，renderer **已经在调用** `sessions:*` IPC（`useAgentSession` / `useAgentMessages` / `CommandPalette`），但这些调用走的是**类型绕过 cast**（`invokeSession` / `invokeSessionPersistence` 把类型安全的 `invoke` 强转为 `(name: string, ...args: unknown[]) => Promise<T>`），调用 `sessions:list` / `sessions:get` / `sessions:create` / `sessions:getEntries` / `sessions:rename` / `sessions:appendEntries`。这些通道：

1. 在 `ALLOWED_RENDER_INVOKE_EVENTS` 中**不存在** → preload 守卫 `invoke` 会直接 `throw new Error("IPC channel not allowed")`，运行时必崩；
2. 在 main 侧**没有 handler** → 即便绕过守卫也无人响应；
3. 类型不安全 → 参数/返回值无编译期校验。

### 1.2 目标

补上**主进程 SQLite 持久化层** + **类型安全的 `sessions` IPC**，并把 renderer 的绕过 cast 全部换成类型化 `invoke`，使：

- 会话与消息落盘到 `userData/traceability-agent.sqlite`，重启后可恢复；
- `sessions` IPC 走与 `AgentPool` 一致的自注册 `AbstractAgentIPCHandler` 模式；
- renderer 统一通过 `useElectronIPC()` 的类型化 `invoke` 访问，零 cast。

---

## 2. 变更范围

### 2.1 In scope

- 新建 `app/src/main/sessions/`（`database.ts` / `session-schema.ts` / `session-persistence.ts` / `index.ts`）。
- 在 `app/src/shared/session-ipc.ts` 追加持久化类型（`Session`/`Entry`/`EntryType`/`Usage`/`TokenUsage`/`SessionPersistenceIPC`）。
- 在 `app/src/shared/events-ipc.ts` 把 `SessionPersistenceIPC` 并入 `AgentRuntimeIPC` 并把 7 个通道加入 `ALLOWED_RENDER_INVOKE_EVENTS`。
- 在 `app/src/main/index.ts` 实例化 `SessionPersistence`（与 `AgentPool` 同级）。
- 去除 3 个 renderer 文件的 `invokeSession`/`invokeSessionPersistence` 绕过 cast，改类型化 `invoke`。

### 2.2 Out of scope

- 不改 `AgentRuntime`/`AgentPool` 的运行时逻辑（**不要**把 `tools` 退回 `[]`，commit `36f843a` 已超集）。
- 不改 `AgentSessionIPC`（运行时控制层）的现有签名，尤其 `setSessionId` 保持单参。
- 不引入 `TraceabilityInvokeIPC` / `AppShellIPC`（M3 Task 5 原文有，但现状基线没有，**不补**）。
- 不写单元测试文件（见 §9 决策 D4）；`SessionRepository` 抽离 + 测试留作后续可选项。
- 不碰 `src/main/skills/skill-service.ts` 的 8 个预存类型错误（唯一允许的 typecheck 例外）。
- 不做 renderer 的 `active-session-content` 拆分（TODO F）、不挂 `ExtensionsContextAPIProvider`（TODO B）、不做 slash-command / assistant-block（TODO C/D/E）。

---

## 3. 现状基线（关键：M3 Task 4/5 不能 verbatim）

commit `36f843a` 之后的 live 代码已偏离 M3 Task 4/5 原文。实现者必须在**现状基线上追加**，不能照抄 Task 4/5。

### 3.1 `app/src/shared/events-ipc.ts`（现状）

```ts
export type AgentRuntimeIPC = AgentModelsIPC & AgentSessionIPC & AgentSkillsIPC;

export const ALLOWED_RENDER_INVOKE_EVENTS: (keyof AgentRuntimeIPC)[] = [
  "setModel", "getAvailableModels", "getModelConfig", "saveModelConfig",
  "prompt", "clearAllQueues", "runOneTimeAgent", "abortPrompt",
  "setHistoryMessages", "setSessionId", "setSessionScope", "destroySession",
  "resolveAskUserQuestion", "listSkills", "setSkillEnabled",
];
```

- 用 `AgentRuntimeIPC`（**不是** `TraceabilityInvokeIPC`），裸名 allowlist，**无** `AppShellIPC`，`setSessionId` 单参。
- 与 M3 Task 5 原文（`TraceabilityInvokeIPC` + `AppShellIPC` + `sessions:*` 冒号 + 双参 `setSessionId`）不同 → **不照抄**。

### 3.2 `app/src/shared/session-ipc.ts`（现状）

只有运行时控制接口 `AgentSessionIPC`（且含 `runOneTimeAgent`、单参 `setSessionId`、无 `setPermissionMode`/`resolvePermissionRequest`）。**没有** `Session`/`Entry`/`SessionPersistenceIPC`。→ 在文件末尾追加持久化类型，不动现有 `AgentSessionIPC`。

### 3.3 `app/src/main/index.ts`（现状）

```ts
app.whenReady().then(() => {
  let browserWindow = createWindow();
  const agentPool = new AgentPool(browserWindow);
  app.on("activate", () => { if (!bw || bw.isDestroyed()) { bw = createWindow(); agentPool.updateBrowserWindow(bw); } });
  app.on("quit", () => { void agentPool.destroyAll(); });
});
```

→ 在 `agentPool` 旁加 `sessionPersistence`，三处（实例化 / activate / quit）对称镜像。

### 3.4 renderer 绕过 cast（现状）

三个文件都从 `useElectronIPC()` 拿到类型安全的 `invoke`，却又包一层 cast：

- `pages/_layout/_agent/session/use-agent-session.ts`：`invokeSession`（cast 后调 `sessions:getEntries`/`sessions:get`/`sessions:create`/`sessions:list`/`sessions:rename`）
- `pages/_layout/_agent/hooks/use-agent-messages.ts`：`invokeSessionPersistence`（cast 后调 `sessions:appendEntries`）
- `pages/_layout/_components/CommandPalette.tsx`：`invokeSession`（cast 后调 `sessions:list`）

→ 删除这三个包装函数，所有调用点改 `invoke("<bareName>", ...)`。

### 3.5 自注册模式参考

`app/src/main/agent-pool.ts` 是自注册 `AbstractAgentIPCHandler` 的范本：ctor 里 `this.unbind = this.bind()`；`protected override bind()` 用 `this.typedIpcMain.handle(channel, (this as ...)[channel])` 注册通道，返回清理函数；`destroyAll()` 调 `this.unbind?.()`。`SessionPersistence` 必须复刻这个结构。

---

## 4. 数据契约

### 4.1 持久化类型（追加到 `shared/session-ipc.ts`）

接口形状取自 M3 Task 4（`Session` = divisor 形状 + `appId`；`Entry`/`Usage`/`TokenUsage` 匹配 divisor）：

```ts
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
```

### 4.2 `SessionPersistenceIPC`（裸名版，追加到 `shared/session-ipc.ts`）

> 注意：M3 Task 4 原文用的是 `"sessions:create"` 冒号键。本规格改为**描述性裸名**，与现有 `ALLOWED_RENDER_INVOKE_EVENTS` 的裸名风格一致。实现者**不要**用冒号键。

```ts
export interface SessionPersistenceIPC {
  createSession: (appId: string) => Promise<Session>;
  listSessions: (appId: string) => Promise<Session[]>;
  getSession: (sessionId: string) => Promise<Session | null>;
  getSessionEntries: (sessionId: string) => Promise<Entry[]>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  appendSessionEntries: (sessionId: string, entries: Entry[]) => Promise<void>;
}
```

`deleteSession` 当前没有 renderer 调用方，但属于契约的一部分——必须实现并加入 allowlist。

### 4.3 DB schema（`database.ts` + `session-schema.ts`，M3 Task 15/16 verbatim）

- **id=1（legacy，逐字保留）**：`agent_sessions` / `agent_entries` / `agent_runs` / `agent_artifacts` / `agent_hil_requests` / `desktop_settings`。**不要修改**——已有用户 DB 已标记 applied，跳过；全新 DB 跑 id=1 再 id=2。完整 SQL 见 M3 Task 15。
- **id=2（divisor-compatible，逐字）**：`ALTER TABLE agent_sessions ADD COLUMN name/cwd/workspace_id/parent_session_id/leaf_entry_id/is_top`；`ALTER TABLE agent_entries ADD COLUMN parent_id/timestamp`；回填 `name<-title`、线性 `parent_id`、`leaf_entry_id`。完整 SQL + `SessionRow`/`EntryRow`/`toSession`/`toEntry` 见 M3 Task 16。
- `LocalDatabase`（Task 15）：`constructor(path: string)`（`mkdirSync` 递归 + `journal_mode=WAL` + `foreign_keys=ON` + `busy_timeout=5000` + `migrate()`），`close()`，`transaction<T>(operation)`，`readonly db`。迁移表 `schema_migrations(id, applied_at)`。
- DB 路径：`app.getPath("userData") + "/traceability-agent.sqlite"`（在 `SessionPersistence` ctor 里拼，传给 `new LocalDatabase(path)`）。

### 4.4 `toSession` / `toEntry` 映射（M3 Task 16 verbatim，供实现者核对）

```ts
export function toSession(row: SessionRow): Session {
  return {
    id: row.id, appId: row.app_id,
    name: row.name || row.title || "",
    cwd: row.cwd ?? "", workspaceId: row.workspace_id,
    parentSessionId: row.parent_session_id, leafEntryId: row.leaf_entry_id,
    createdAt: row.created_at, updatedAt: row.updated_at,
    isTop: row.is_top === 1,
  };
}

export function toEntry(row: EntryRow): Entry {
  return {
    id: row.id, sessionId: row.session_id, parentId: row.parent_id,
    type: row.type, timestamp: row.timestamp ?? row.created_at,
    data: parseObject(row.data_json),
    tokenUsage: row.token_usage_json ? parseTokenUsage(row.token_usage_json) : null,
  };
}
```

（`parseObject` / `parseTokenUsage` 辅助函数见 Task 16 原文，逐字复制。）

---

## 5. 变更详情

### 5.1 新建文件

| 文件 | 来源 | 职责 |
|---|---|---|
| `app/src/main/sessions/database.ts` | M3 Task 15 **verbatim** | `LocalDatabase`：better-sqlite3 连接 + 迁移运行器（id=1 legacy + id=2） |
| `app/src/main/sessions/session-schema.ts` | M3 Task 16 **verbatim** | `SESSION_MIGRATIONS`(id=2) + `SessionRow`/`EntryRow` + `toSession`/`toEntry` |
| `app/src/main/sessions/session-persistence.ts` | **本规格原创**（模仿 `agent-pool.ts`） | `SessionPersistence extends AbstractAgentIPCHandler<SessionPersistenceIPC>`；ctor 建 `LocalDatabase`；`bind()` 自注册 7 通道；实现 7 方法 |
| `app/src/main/sessions/index.ts` | barrel | `export { SessionPersistence } from "./session-persistence.js"`（可按需补 `LocalDatabase`） |

### 5.2 修改文件

| 文件 | 改动 |
|---|---|
| `app/src/shared/session-ipc.ts` | 末尾追加 §4.1 + §4.2 的类型（不动现有 `AgentSessionIPC`）。`import type` 保持现状。 |
| `app/src/shared/events-ipc.ts` | `AgentRuntimeIPC` 交集追加 `& SessionPersistenceIPC`；import `SessionPersistenceIPC`；`ALLOWED_RENDER_INVOKE_EVENTS` 末尾追加 7 个裸名。 |
| `app/src/main/index.ts` | `import { SessionPersistence }`；`new SessionPersistence(browserWindow)`；activate 里 `.updateBrowserWindow(browserWindow)`；quit 里 `.destroyAll()`。 |
| `pages/_layout/_agent/session/use-agent-session.ts` | 删 `invokeSession` 包装；5 处 `sessions:*` 调用改类型化 `invoke(...)`。 |
| `pages/_layout/_agent/hooks/use-agent-messages.ts` | 删 `invokeSessionPersistence` 包装与 `ElectronInvoke` 类型（若不再用）；`sessions:appendEntries` 改 `invoke("appendSessionEntries", sessionId, entries)`。 |
| `pages/_layout/_components/CommandPalette.tsx` | 删 `invokeSession` 包装；`sessions:list` 改 `invoke("listSessions", appId)`。 |

### 5.3 命名映射表（renderer 调用点）

| 现状（cast） | 改后（类型化 `invoke`） | 文件 |
|---|---|---|
| `invokeSession("sessions:getEntries", id)` | `invoke("getSessionEntries", id)` | use-agent-session.ts |
| `invokeSession("sessions:get", id)` | `invoke("getSession", id)` | use-agent-session.ts |
| `invokeSession("sessions:create", appId)` | `invoke("createSession", appId)` | use-agent-session.ts |
| `invokeSession("sessions:list", appId)` | `invoke("listSessions", appId)` | use-agent-session.ts / CommandPalette.tsx |
| `invokeSession("sessions:rename", id, name)` | `invoke("renameSession", id, name)` | use-agent-session.ts |
| `invokeSessionPersistence(..., "sessions:appendEntries", id, entries)` | `invoke("appendSessionEntries", id, entries)` | use-agent-messages.ts |

---

## 6. 变更后文件结构

```
app/src/
├── main/
│   ├── agent-ipc.ts                 # AbstractAgentIPCHandler（既有，不改）
│   ├── agent-pool.ts                # 既有自注册范本（不改）
│   ├── agent-runtime.ts             # 既有（不改）
│   ├── index.ts                     # 改：实例化 SessionPersistence（+activate/quit 对称）
│   └── sessions/                    # 新增目录
│       ├── database.ts              # 新（M3 Task 15 verbatim）
│       ├── session-schema.ts        # 新（M3 Task 16 verbatim）
│       ├── session-persistence.ts   # 新（本规格：自注册 handler + 7 方法）
│       └── index.ts                 # 新（barrel）
├── shared/
│   ├── events-ipc.ts                # 改：AgentRuntimeIPC ∪ SessionPersistenceIPC + allowlist +7
│   └── session-ipc.ts               # 改：追加 Session/Entry/Usage/TokenUsage/SessionPersistenceIPC
├── preload/index.ts                 # 既有，不改（typed invoke 自动覆盖新通道）
└── renderer/pages/_layout/
    ├── _agent/session/use-agent-session.ts   # 改：去 cast，类型化 invoke
    ├── _agent/hooks/use-agent-messages.ts    # 改：去 cast，类型化 invoke
    └── _components/CommandPalette.tsx        # 改：去 cast，类型化 invoke
```

---

## 7. `session-persistence.ts` 骨架 + 7 方法行为契约

### 7.1 骨架（模仿 `agent-pool.ts`）

```ts
import { app } from "electron";
import type { BrowserWindow } from "electron";
import { join } from "node:path";

import type { Entry, Session, SessionPersistenceIPC } from "../../shared/session-ipc.js";
import { AbstractAgentIPCHandler } from "../agent-ipc.js";
import { LocalDatabase } from "./database.js";
import { toEntry, toSession /*, SessionRow, EntryRow */ } from "./session-schema.js";
import { v4 as uuidv4 } from "uuid";

export class SessionPersistence
  extends AbstractAgentIPCHandler<SessionPersistenceIPC>
  implements SessionPersistenceIPC
{
  private db: LocalDatabase;

  constructor(browserWindow: BrowserWindow) {
    super(browserWindow);
    this.db = new LocalDatabase(join(app.getPath("userData"), "traceability-agent.sqlite"));
    this.unbind = this.bind();
  }

  protected override bind(): VoidFunction {
    const channels = [
      "createSession", "listSessions", "getSession", "getSessionEntries",
      "renameSession", "deleteSession", "appendSessionEntries",
    ] as const;
    for (const channel of channels) {
      this.typedIpcMain.handle(
        channel,
        (this as unknown as Record<string, unknown>)[channel] as never,
      );
    }
    return () => {
      for (const channel of channels) this.typedIpcMain.removeHandler(channel);
    };
  }

  // ── 7 methods (arrow-function fields, keyed by channel name) ─────────────

  public createSession: SessionPersistenceIPC["createSession"] = async (appId) => { /* §7.2 */ };
  public listSessions: SessionPersistenceIPC["listSessions"] = async (appId) => { /* §7.2 */ };
  public getSession: SessionPersistenceIPC["getSession"] = async (sessionId) => { /* §7.2 */ };
  public getSessionEntries: SessionPersistenceIPC["getSessionEntries"] = async (sessionId) => { /* §7.2 */ };
  public renameSession: SessionPersistenceIPC["renameSession"] = async (sessionId, name) => { /* §7.2 */ };
  public deleteSession: SessionPersistenceIPC["deleteSession"] = async (sessionId) => { /* §7.2 */ };
  public appendSessionEntries: SessionPersistenceIPC["appendSessionEntries"] = async (sessionId, entries) => { /* §7.2 */ };

  public destroyAll() {
    this.unbind?.();
    this.db.close();
  }
}
```

### 7.2 7 方法行为契约

行为取自 M3 Task 17 的测试用例（实现者可读 Task 17 测试段核对预期，但**不要**创建测试文件——见 §9 D4）：

- **`createSession(appId)`**：`id = uuidv4()`；插入 `agent_sessions`，`name=""`、`workspace_id=null`、`parent_session_id=null`、`leaf_entry_id=null`、`is_top=0`、`created_at=updated_at=Date.now()`、`app_id=appId`；返回 `toSession(row)`。
- **`listSessions(appId)`**：`SELECT * FROM agent_sessions WHERE app_id=? ORDER BY updated_at DESC`；`map(toSession)`。其它 appId 返回 `[]`。
- **`getSession(id)`**：`SELECT * WHERE id=?`；存在→`toSession`，否则 `null`。
- **`getSessionEntries(id)`**：`SELECT * FROM agent_entries WHERE session_id=? ORDER BY sequence ASC`；`map(toEntry)`。
- **`renameSession(id, name)`**：`UPDATE name=?, updated_at=Date.now() WHERE id=?`。
- **`deleteSession(id)`**：`DELETE FROM agent_sessions WHERE id=?`（`ON DELETE CASCADE` 级联删 entries）。
- **`appendSessionEntries(id, entries)`**：
  - session 不存在 → `throw /not found/i`；
  - 任一 entry 的 `parentId` 非空且不是本 session 已知 entry（含本次待插入的）→ `throw /parent/i`；
  - **幂等**：按 `id` `INSERT OR IGNORE`，重复 id 不报错、不重复；
  - `sequence` = 该 session 当前 `MAX(sequence)` + 1 + 索引（数组顺序即链顺序）；
  - 插入后更新 `agent_sessions.leaf_entry_id` = 本次最后一条 entry 的 id（取 `MAX(sequence)` 对应），`updated_at=Date.now()`；
  - `data_json = JSON.stringify(entry.data)`，`token_usage_json = entry.tokenUsage ? JSON.stringify(...) : null`，`timestamp = entry.timestamp`，`created_at = Date.now()`，`type = entry.type`，`parent_id = entry.parentId`。

> 实现细节可参考 M3 Task 17 的实现段，但类名用 `SessionPersistence`、方法名用裸名、`new LocalDatabase(path)` 在 ctor（不在测试里）。

---

## 8. 实现步骤

> 不创建测试文件（§9 D4）。顺序保证依赖先就绪：先 shared 类型（Step 4）→ schema（Step 2 依赖 Step 4）→ wrapper → handler → wiring → renderer。

1. **Step 1**：按 M3 Task 15 verbatim 创建 `app/src/main/sessions/database.ts`（`LocalDatabase`）。创建 `app/src/main/sessions/index.ts` barrel（先空 `export {}`，Step 3 后补 `SessionPersistence`）。
2. **Step 2**：按 M3 Task 16 verbatim 创建 `app/src/main/sessions/session-schema.ts`（`SESSION_MIGRATIONS` + `SessionRow`/`EntryRow` + `toSession`/`toEntry` + `parseObject`/`parseTokenUsage`）。其 `import type { Entry, Session, TokenUsage } from "../../shared/session-ipc.js"` 在 Step 4 后才解析——先写无妨。
3. **Step 3**：创建 `app/src/main/sessions/session-persistence.ts`（§7.1 骨架 + §7.2 实现 7 方法）。`index.ts` barrel 补 `export { SessionPersistence } from "./session-persistence.js"`。
4. **Step 4**：在 `app/src/shared/session-ipc.ts` 末尾追加 §4.1（`Session`/`EntryType`/`Usage`/`TokenUsage`/`Entry`）+ §4.2（`SessionPersistenceIPC` 裸名版）。
5. **Step 5**：在 `app/src/shared/events-ipc.ts`：import `SessionPersistenceIPC`；`AgentRuntimeIPC` 追加 `& SessionPersistenceIPC`；`ALLOWED_RENDER_INVOKE_EVENTS` 末尾追加 `createSession`/`listSessions`/`getSession`/`getSessionEntries`/`renameSession`/`deleteSession`/`appendSessionEntries`。
6. **Step 6**：在 `app/src/main/index.ts`：`import { SessionPersistence } from "./sessions/index.js"`；`const sessionPersistence = new SessionPersistence(browserWindow)`；activate 里 `sessionPersistence.updateBrowserWindow(browserWindow)`；quit 里 `void sessionPersistence.destroyAll()`。
7. **Step 7**：3 个 renderer 文件去 cast（§5.3 映射表）：删 `invokeSession`/`invokeSessionPersistence` 包装与不再使用的 `ElectronInvoke` 类型；调用点改 `invoke(...)`。
8. **Step 8**：`pnpm --filter @traceability/app typecheck`（web + node clean，除 `skill-service.ts` 的 8 个预存错误）+ `pnpm --filter @traceability/app test`（不新增 session-persistence 测试；现有套件须全过）。
9. **Step 9**：`git commit -m "feat(app): add main-process SQLite session persistence + sessions IPC"`。

---

## 9. 关键约束 / 决策（对齐结果）

- **D1 类名与模式**：`SessionPersistence`（非 `SessionService`），`extends AbstractAgentIPCHandler<SessionPersistenceIPC> implements SessionPersistenceIPC`，自注册 `bind()`，`main/index.ts` 只实例化（镜像 `AgentPool`）。
- **D2 LocalDatabase 归属**：在 `SessionPersistence` ctor 内 `new LocalDatabase(...)`，**不**在 `main/index.ts` 建。
- **D3 命名**：通道 / 接口键 / 方法名统一用**描述性裸名**（`createSession` 等），**不**用 `sessions:*` 冒号；与现有 `ALLOWED_RENDER_INVOKE_EVENTS` 裸名风格一致。
- **D4 不写单测**：`SessionPersistence` 依赖 `electron` 的 `ipcMain`（经 `AbstractAgentIPCHandler`），vitest（node）下无法实例化，故**不创建** `session-persistence.test.ts`（与 `AgentPool` 一致，后者亦无单测）。正确性由 `typecheck` + TODO G smoke 流程覆盖；日后若需测试，抽 `SessionRepository`（纯逻辑）再补。
- **D5 基线追加**：live `events-ipc.ts`/`session-ipc.ts` 已偏离 M3 Task 4/5 原文——**追加**而非照抄；不引入 `TraceabilityInvokeIPC`/`AppShellIPC`，不改 `setSessionId` 签名。
- **D6 renderer 统一 IPC**：去掉 `invokeSession`/`invokeSessionPersistence` cast，统一用 `useElectronIPC()` 的类型化 `invoke`。
- **D7 不退回 `tools:[]`**：commit `36f843a` 已让 `AgentRuntime` 合并 extension tools；M3 Task 11/13 的 `tools:[]` 已被超集。
- **D8 ESM `.js` specifier**：`src/main/**` 相对 import 用 `.js` 后缀（如 `"./database.js"`、`"../../shared/session-ipc.js"`）；`import type` 用于类型。
- **D9 唯一 typecheck 例外**：`src/main/skills/skill-service.ts` 的 8 个 `noUncheckedIndexedAccess` 错误是预存的、与本任务无关，允许存在；本任务不得新增任何错误。

---

## 10. 参考

- 自注册范本：`app/src/main/agent-pool.ts`、`app/src/main/agent-ipc.ts`。
- DB wrapper + schema + mappers（verbatim）：`docs/superpowers/plans/2026-07-13-agent-main-migration.md` Phase M3 Task 15（`database.ts`）、Task 16（`session-schema.ts`）。
- 7 方法行为契约来源：同计划 Task 17 的测试用例段（仅参考预期行为，**不创建测试文件**）。
- 类型形状来源：同计划 Task 4（`Session`/`Entry`/`Usage`/`TokenUsage`/`SessionPersistenceIPC` 原文用 `sessions:*` 冒号键——本规格改为裸名）。
- 现状基线：commit `36f843a`（`app/src/shared/events-ipc.ts`、`session-ipc.ts`、`main/index.ts`、3 个 renderer 文件）。
- 上层 handoff：`docs/superpowers/plans/2026-07-14-extension-migration-handoff.md` TODO A。

> 注：`divisor-agent`（`/Users/zhiyu/Desktop/coding/divisor-agent`）**没有** `main/sessions/`（divisor 无持久化），不要去找 divisor 的 sessions 实现作参考；参考的是 `agent-pool.ts` 模式 + M3 Task 15–17。

---

## 11. 验收标准

1. `app/src/main/sessions/{database.ts,session-schema.ts,session-persistence.ts,index.ts}` 存在；`SessionPersistence` 自注册 7 通道。
2. `shared/session-ipc.ts` 含 §4.1 + §4.2 类型；`shared/events-ipc.ts` 的 `AgentRuntimeIPC` 含 `SessionPersistenceIPC`、`ALLOWED_RENDER_INVOKE_EVENTS` 含 7 裸名。
3. `main/index.ts` 实例化 `SessionPersistence` 并在 activate/quit 对称调用。
4. 3 个 renderer 文件**无** `invokeSession`/`invokeSessionPersistence`/类型 cast；全部用 `useElectronIPC()` 的 `invoke`。
5. `pnpm --filter @traceability/app typecheck`：web + node clean（`skill-service.ts` 8 个预存错误为唯一例外）。
6. `pnpm --filter @traceability/app test`：现有套件全过（无新增 session-persistence 测试）。
7. `pnpm dev:app` smoke（TODO G 子集）：创建 session → prompt → stream → **重启 app，历史能恢复**（`listSessions` + `getSessionEntries` 回填）→ rename → 切换 session。
8. 单个 Conventional Commit：`feat(app): add main-process SQLite session persistence + sessions IPC`。
