# Traceability v1 — 设计规格

**日期**：2026-07-08
**状态**：草案 v1
**目标**：基于 Sentry SDK + 自研外壳层 + 自研 server，搭建 web/electron/mf 应用的通用监控与异常修复闭环（v1）

---

## 1. 背景与目标

飞书 wiki（[JFB9wqaTtiUj4CkcaYOcmIBOnkH](https://beike.feishu.cn/wiki/JFB9wqaTtiUj4CkcaYOcmIBOnkH)）已论证：当前 `fee-sdk` 因 UMD 产物、React 19 不兼容、MF 场景下多实例缺陷、FSP 算法失效、作业稳定性盲区等问题需替换为新监控工具。本设计是该新工具的 v1 规格。

**v1 目标**：
- 提供一个**通用**前端监控 SDK（不强耦合业务语义），覆盖 wiki 4.5/4.6/4.8/4.9/4.10 列出的核心采集场景
- 自研 server 接收/存储/聚合事件
- Inbox UI 让研发查看 issue、触发 AI 修复
- CLI 给 coding agent 提供 server 数据访问能力
- Skills 包教 coding agent 如何给业务代码加埋点

**v1 明确不做**：
- server 自动开 GitLab MR
- server 派发 IM/邮件通知
- coding agent 自动轮询任务
- 业务语义 SDK API（消息/电话/坐席专属 API）
- 多租户/权限系统
- 告警阈值配置
- 指标聚合 dashboard

---

## 2. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│                  packages/core（自研外壳层）                    │
│  Sentry SDK 薄封装 + 自研 integrations（白屏/MF守卫/CORS诊断）│
│  + 自研 transport（指向 server/）                              │
└──────────────────┬──────────────────────────────┬───────────┘
                   │                              │
        ┌──────────▼──────────┐         ┌─────────▼──────────┐
        │  Sentry SDK（底层）  │         │ app/（Inbox UI）   │
        │  browser/react/elec │         │ 应用/issue/修复入口│
        └──────────┬──────────┘         └─────────┬──────────┘
                   │ envelope                    │ HTTP/WS
                   ▼                              ▼
        ┌──────────────────────────────────────────────────┐
        │         server/（自研 DNS 替代品）                   │
        │  envelope ingest / 事件存储 / issue 聚合            │
        │  应用管理 CRUD / issue CRUD / patch 接收            │
        └──────────────────────┬───────────────────────────┘
                               │ REST
                               ▼
        ┌──────────────────────────────────────────────────┐
        │  packages/cli  ←→  packages/skills（agent 技能包） │
        │  traceability app/issue/config 子命令              │
        │  skills：教 agent 如何用 core API 加埋点            │
        └──────────────────────────────────────────────────┘
```

**端到端闭环（v1）**：
1. `app/` 创建应用并关联仓库 → server 返回 `appId`
2. Web/Electron 集成 `packages/core` → 上报时携带 `appId`
3. `server` 接收 envelope + 业务事件，聚合 issue
4. `app/` Inbox 显示 issue（WebSocket 实时推送）
5. 研发点"开始 AI 修复" → server 标记 `fix-manual`
6. Inbox 显示 CLI 命令："请在本机执行 `traceability issue show <id>` 拉取详情"
7. coding agent 通过 CLI 拉 issue 详情 → 改代码 → `attach-patch` → `mark-fixed`
8. 研发自己 push + 开 MR
9. app 状态变 `fixed`

---

## 3. SDK 设计原则

- **通用优先**：SDK 不耦合业务语义。提供 `monitor.report/captureException/setTag/setContext/addBreadcrumb` 通用 API；业务方自行调用。
- **底层复用 Sentry**：`@sentry/browser` / `@sentry/react` / `@sentry/electron` 提供 JS 错、Promise 拒绝、资源、API 监控、性能指标、React 19 错误、Electron 主进程等覆盖。
- **自研补充 Sentry 未覆盖部分**：白屏检测、MF 单实例守卫、CORS 诊断。
- **AppId 注入**：所有事件携带 `appId` tag，server 据此聚合并路由到正确应用。

---

## 4. 模块详细设计

### 4.1 packages/core

**职责**：
- Sentry SDK 薄封装
- 自研 integrations（whiteScreen / mfGuard / corsDiagnostic）
- 自研 transport 指向 server

**核心 API**：
```ts
export interface InitOptions {
  dsn: string                    // server envelope endpoint
  appId: string
  release?: string
  environment?: string
  user?: { id: string; [k: string]: any }
  whiteScreen?: {                // opt-in
    rootSelector?: string
    stableWindowMs?: number      // 默认 500
    minContentNodes?: number     // 默认 3
    enableScreenshot?: boolean
  }
  mf?: { host: boolean }
  beforeSend?: (event) => event
}

export function init(opts: InitOptions): void
export function setApp(appName: string): void
export function installGlobalProxy(): void

// 透传 Sentry
export const captureException: typeof Sentry.captureException
export const captureMessage: typeof Sentry.captureMessage
export function report(data: { type: string; payload?: any; tags?: Record<string,string> }): void
export const setTag: typeof Sentry.setTag
export const setContext: typeof Sentry.setContext
export const addBreadcrumb: typeof Sentry.addBreadcrumb
```

**自研 integrations**：

#### 4.1.1 `whiteScreenIntegration`（opt-in）
- 启动 `MutationObserver` 监听根容器子树
- 等待"稳定窗口"：500ms 无 DOM 变化 + 无 pending fetch（自维护轻量 fetch 计数）
- 评估：空 / 错误边界类 / 可见节点 < 阈值
- 上报：`captureMessage('white-screen', { tags: { type: 'white-screen' }, extra: {...} })`
- 截图：默认关闭，开启时按需走 `html2canvas`

#### 4.1.2 `mfGuardIntegration`
- 暴露 `installGlobalProxy()`（Host 调一次）
  - 检查 `window.__MONITOR_PROXY_INSTALLED__`
  - 已存在则跳过
  - 挂 `window.MONITOR_INSTANCE = sentryClient`
- 暴露 `setApp(appName)`（Micro App 调）
  - 不重装 Proxy
  - 通过 `beforeSend` 给 envelope 加 `appName` tag
- PV 守卫：路由变化时检查 `window.__MONITOR_ROUTE_LOCK__`，同路由 100ms 内只报一次

#### 4.1.3 `corsDiagnosticIntegration`
- init 时扫 `<script>` 元素，跨域且无 `crossorigin` → `console.warn` + `captureMessage('cors-config-warning', { level: 'warning' })`

### 4.2 packages/react

**职责**：React 19 错误边界 + hook

**导出**：
- `MonitorErrorBoundary`（包装 `@sentry/react` 的 `ErrorBoundary`，传 fallback prop）
- `useMonitorReport()` hook

**依赖**：`packages/core` + `@sentry/react`

### 4.3 packages/electron

**职责**：Electron 主进程 + 渲染进程

**导出**：
- `initMain(opts)`（主进程，包装 `@sentry/electron/main`）
- `initRenderer(opts)`（渲染进程，包装 `@sentry/electron/renderer`，内部是 `@sentry/browser`）
- `preloadBridge`（preload script 用 contextBridge 暴露主进程监控 API）

**依赖**：`packages/core` + `@sentry/electron`

### 4.4 packages/cli

**职责**：server 的命令行客户端

**子命令**：
```bash
# 配置
traceability config set --server <url> --token <api_token>
traceability config show

# 应用
traceability app list
traceability app create --name <name> --repo-url <url> --branch <branch>
traceability app show <appId>
traceability app update <appId> [--name|--repo-url|--branch]
traceability app delete <appId>

# issue
traceability issue list --appId <id> [--status=<s>] [--limit=20] [--json]
traceability issue show <issueId> [--json]
traceability issue fix-request <issueId>
traceability issue attach-patch <issueId> --patch=./fix.diff
traceability issue mark-fixed <issueId>
```

**输出**：
- 默认人类可读（表格 / 多行 key:value）
- `--json` 输出 JSON（给 coding agent 解析）

**依赖**：`commander`（或类似 CLI 框架）

### 4.5 packages/skills

**结构**：每个 skill 一个目录，含 `SKILL.md`（必须）+ `README.md` + 可选 `references/` / `scripts/` / `assets/`

**v1 包含 3 个 skills**：

#### 4.5.1 `instrumentation/`
- `SKILL.md`：当用户说"在 X 功能加埋点/加监控/加采集"时触发
- `references/core-api.md`：通用 API 参考
- `references/event-types.md`：推荐事件类型与命名
- `assets/templates/`：埋点代码模板

#### 4.5.2 `diagnose-issue/`
- `SKILL.md`：当用户给一个 issue id 需要诊断时触发
- `scripts/fetch-issue.sh`：调 CLI 拉 issue 详情
- 教 agent 读 stacktrace → 定位代码 → 加临时 breadcrumb → 出 patch

#### 4.5.3 `add-boundary/`
- `SKILL.md`：当用户说"给 X 组件加错误边界"时触发
- 教 agent 用 `MonitorErrorBoundary` 包裹组件

### 4.6 app/

**技术栈**：React + TypeScript + Vite（待确认）

**页面**：
| 路径 | 功能 |
|---|---|
| `/login` | API token 登录 |
| `/apps` | 应用列表 |
| `/apps/new` | 创建应用（name / repoUrl / defaultBranch） |
| `/apps/:id` | 应用详情（DSN 展示、关联仓库信息、"查看 issue" 链接到 `/issues?appId=...`） |
| `/issues?appId=` | issue 列表（按 appId 过滤，分页/游标） |
| `/issues/:id` | issue 详情（stacktrace/事件/上下文/"开始 AI 修复"按钮） |
| `/fix/:issueId` | 修复会话（显示 CLI 命令、agent 上传的 patch、状态） |

**实时性**：WebSocket 订阅 issue 新增/计数变更/状态变更

### 4.7 server/

**技术栈**：Node.js + Fastify + TypeScript（待确认）+ SQLite（v1）/ PostgreSQL（v2）

**API 列表**：
| Method | Path | 用途 |
|---|---|---|
| POST | `/api/ingest/envelope/:appId` | 接收 Sentry envelope（v7 协议） |
| GET | `/api/apps` | 应用列表 |
| POST | `/api/apps` | 创建应用 |
| GET | `/api/apps/:id` | 应用详情 |
| PATCH | `/api/apps/:id` | 更新应用 |
| DELETE | `/api/apps/:id` | 删除应用 |
| GET | `/api/issues?appId=&status=&limit=&cursor=` | issue 列表 |
| GET | `/api/issues/:id` | issue 详情 |
| GET | `/api/issues/:id/events` | 完整 events |
| POST | `/api/issues/:id/fix-request` | 标记 `fix-manual` |
| POST | `/api/issues/:id/attach-patch` | agent 上传 patch（multipart） |
| POST | `/api/issues/:id/mark-fixed` | agent 标记修复完成 |
| WS | `/api/ws` | app 订阅 issue 状态变更 |

**数据模型**：
```ts
type IssueStatus = 'open' | 'fix-manual' | 'fixing' | 'fixed' | 'ignored'

interface Application {
  id: string                     // appId
  name: string
  repoUrl: string
  defaultBranch: string
  createdAt: string
}

interface Issue {
  id: string
  appId: string
  fingerprint: string            // 事件指纹
  title: string
  type: 'error' | 'transaction' | 'message' | 'custom'
  firstSeen: string
  lastSeen: string
  count: number
  status: IssueStatus
  metadata: {
    stacktrace?: string
    message?: string
    context?: Record<string, any>
  }
}

interface Event {
  id: string
  issueId: string
  receivedAt: string
  envelope: string               // 原始 envelope JSON
}

interface Patch {
  id: string
  issueId: string
  branch: string
  filePath: string
  attachedAt: string
}
```

**envelope 解析**：
- 使用 `@sentry/core` 暴露的 `parseEnvelope` / `serializeEnvelope`
- v1 简化为只支持 `error` / `transaction` / `message` 三种 item 类型，其他丢弃

**鉴权**：
- v1 简单 API token（CLI / SDK 启动时配置）
- app 登录用 token
- SDK 上报时带 token（DSN 里的 secret 部分）

---

## 5. 风险与缓解

| 风险 | 缓解 |
|---|---|
| envelope v7 协议细节多 | 复用 `@sentry/core` 的 `parseEnvelope`；v1 简化为 3 种 item |
| Sentry transport 自定义 | 配置 `tunnel` / 自定义 `transport`，不重写核心 |
| WebSocket 跨 tab 同步 | v1 简化为每 tab 独立订阅 |
| SQLite 性能 | v1 数据量小可承受；接口不变，上线后切 PG |

---

## 6. 实施路线图

| 里程碑 | 产物 | 工期 |
|---|---|---|
| M0 | 脚手架 + 共享 TS 类型 | 1 天 |
| M1 | server 骨架（envelope ingest + 应用/issue CRUD + WS） | 2-3 天 |
| M2 | packages/core 基础 + 自研 transport | 3-4 天 |
| M3 | app/ 基础 UI（应用管理 + issue 流） | 3-4 天 |
| M4 | packages/react + 自研 integrations（白屏/CORS） | 3-4 天 |
| M5 | packages/cli + app 修复入口 | 2-3 天 |
| M6 | packages/electron + packages/skills + 端到端验证 | 3-4 天 |
| **合计** | | **~16-20 天**（单人串行） |

**详细里程碑**：

### M0：脚手架与契约
- pnpm workspace 初始化
- 6 个空包的 `package.json` + 目录
- `tsconfig.base.json`（strict）
- envelope v7 协议类型（core/server 共享）
- 数据模型类型（server/app/cli 共享）

### M1：server 骨架
- Fastify HTTP 服务
- envelope ingest endpoint
- 应用管理 CRUD
- issue 列表/详情（按 fingerprint 去重 + 计数）
- WebSocket 推送
- 简单 API token 鉴权

### M2：packages/core 基础
- `init()` 包装 Sentry init
- 自研 transport 指向 server
- 透传 API（captureException/captureMessage/report/setTag/...）
- 单元测试

### M3：app/ 基础 UI
- 应用管理页（列表/创建/详情）
- issue 列表 + 详情
- WebSocket 订阅
- API token 登录

### M4：packages/react + 自研 integrations
- `MonitorErrorBoundary`
- `useMonitorReport`
- `whiteScreenIntegration`
- `corsDiagnosticIntegration`

### M5：packages/cli + app 修复入口
- CLI 全套子命令
- app"开始 AI 修复"按钮
- 修复会话页
- server `attach-patch`/`mark-fixed` endpoint

### M6：packages/electron + packages/skills + 端到端
- electron 包
- 3 个 skills
- 端到端 demo 验证

---

## 7. 关键不做什么（YAGNI）

- ❌ server 开 MR（v1 不接 GitLab API）
- ❌ server 派发 IM/邮件通知
- ❌ coding agent 自动轮询任务
- ❌ 业务语义 SDK API（消息/电话/坐席专属）
- ❌ 多租户 / 权限系统
- ❌ 告警阈值配置
- ❌ 指标聚合 dashboard
- ❌ 白屏截图默认开启
- ❌ Web 端内存监控（wiki 4.7 已明确不做）
- ❌ 跨 tab WebSocket 同步

---

## 8. 待确认项

以下问题在 v1 实施前需最终确认：

1. **server 存储选型**：SQLite（v1 简单） vs PostgreSQL（一步到位）
2. **server Web 框架**：Fastify vs Express vs Hono
3. **app/ 前端框架**：React + Vite（假设） vs 其他
4. **packages/cli 框架**：commander vs yargs vs oclif
5. **packages/core 测试框架**：vitest vs jest
6. **app/server 鉴权方式**：v1 简单 API token（假设） vs OAuth
