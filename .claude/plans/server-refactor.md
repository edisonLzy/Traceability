# 重构 @traceability/server —— 对齐 neon-server api-gateway 架构

## 目标与已确认决策
- 技术栈/架构对齐 `neon-server/packages/api-gateway`：**Fastify → Express**，引入 pino 日志 + 请求链路追踪、swagger-jsdoc、统一响应中间件、全局异常处理。
- **采用 neon 统一响应信封**：成功 `{code:0, data, timestamp}`，错误 `{code, message, data:null, timestamp, traceId}`；`res.success(data, status?)` 扩展支持 201/202/204。
- 基础能力 **vendor 进 server**（`shared/` + `middlewares/` + `errors/` + `types/`），不跨仓库依赖 `@neon-server/shared`。
- 按 `domains/<模块>/{db.ts, service.ts, routes.ts, ...}` 重组 `api/` + `store/`。
- 保留 **WebSocket(broadcaster)** 与 **SQLite**，仅切换 HTTP 层。
- **不重新引入 auth**（MVP）。

## 依赖变更 (server/package.json)
- 移除：`fastify`, `@fastify/cors`, `@fastify/multipart`, `@fastify/websocket`, `@sentry/core`（server 内未使用）
- 新增：`express`, `cors`, `@types/express`, `@types/cors`, `swagger-jsdoc`, `swagger-ui-express`, `@types/swagger-jsdoc`, `@types/swagger-ui-express`, `pino`, `pino-http`, `pino-pretty`, `dotenv`, `ws`, `@types/ws`
- 新增 devDep：`supertest`, `@types/supertest`（HTTP 烟测）
- 保留：`@traceability/protocol`, `better-sqlite3`, `@types/better-sqlite3`, `source-map-js`, `tsx`, `typescript`, `vitest`

## 目标目录结构
```
server/src/
  index.ts                 # Express 启动入口（镜像 neon api-gateway/src/index.ts）
  config.ts                # port/dbPath（保留）
  db.ts                    # openDb（连接 + 迁移）
  migrations.ts            # 建表 SQL（原 store/migrations.ts 原样搬入）
  types.d.ts               # Express Request/Response 类型增强（res.success, req.user）
  types/index.ts           # ApiResponse
  shared/                  # vendor 自 @neon-server/shared
    index.ts
    logger.ts              # createLogger / getTraceId / createRequestLoggerMiddleware
    isMainModule.ts
  middlewares/
    swagger.ts             # createSwaggerMiddleware
    response.ts            # createResponseMiddleware（res.success(data, status?)）
    error.ts               # createGlobalErrorHandlerMiddleware
  errors/
    app-error.ts           # AppError
  routes/
    health.ts              # GET /health（infra，非业务域）
  ws/
    broadcaster.ts         # 改用 ws 库；新增 attachWebSocket(server) 处理 /api/ws 升级
  domains/
    apps/        { db.ts, service.ts, routes.ts }
    source-maps/ { db.ts, service.ts }            # 无独立路由；上传挂在 /api/apps/:id/sourcemaps
    issues/      { db.ts, service.ts, routes.ts }
    replays/     { db.ts, service.ts, routes.ts } # /api/ingest/rrweb + /api/issues/:id/replays*
    performance/ { db.ts, service.ts, routes.ts } # /api/ingest/performance + /api/performance
    ingest/      { envelope.ts, service.ts, routes.ts }  # /api/ingest/envelope/:appId
  tests/                   # 保留；更新 import 路径 + 新增 http.test.ts
```

## 表 → 域 映射
| 现有 store | 现有 api | 目标 domain |
|---|---|---|
| store/apps.ts | api/apps.ts | domains/apps（+ sourcemap 上传路由） |
| store/sourceMaps.ts | (apps.ts 内) | domains/source-maps（db+service） |
| store/issues.ts | api/issues.ts | domains/issues |
| store/replays.ts | api/replays.ts | domains/replays |
| store/performance.ts | api/performance.ts | domains/performance |
| ingest/envelope.ts + api/ingest.ts | api/ingest.ts | domains/ingest |

域内职责：
- `db.ts`：纯数据访问（= 现有 repo，逻辑原样搬入，签名不变）。
- `service.ts`：业务编排 + 校验 + 抛 `AppError(404/400)` + 触发 broadcaster。
- `routes.ts`：Express Router，调用 service，`res.success(data, status)`，带 `@openapi` JSDoc。
- `ingest/service.ts` 依赖 issues / source-maps / replays service 做跨域编排：解析 envelope → resolveFrames → ingestEvent → appendEvent → attachToIssue → broadcast（与现 api/ingest.ts 行为一致）。

## 启动入口 (index.ts) —— 镜像 neon
顺序：`dotenv/config` → `createLogger('traceability-server')` → `express()` → `http.createServer(app)` →
`createRequestLoggerMiddleware(logger)` → `cors({origin:true,credentials:false})` → `express.json({limit:'1mb'})` →
`createResponseMiddleware()` → `createSwaggerMiddleware({...})(app)` → 各域 router（DI 传入 db/service/broadcaster）→
`createGlobalErrorHandlerMiddleware()` → `server.listen(port,'0.0.0.0')`。
WS：`attachWebSocket(server, broadcaster)`。
Swagger apiPaths：dev `['./src/domains/**/routes.ts','./src/routes/**/*.ts']`，prod `['./dist/domains/**/*.routes.js','./dist/routes/**/*.js']`（实际用 `**/*.js`）；docsRoute `/api-docs`。

## 响应信封与状态码
- `res.success(data, status=200)`：`{code:0, data, timestamp: new Date().toISOString()}`，`res.status(status).json(...)`。
- 201 创建（app / sourcemap / replay）、202 接收（ingest envelope / performance）、204 删除（`res.status(204).end()`，无 body，兼容 CLI 的 204 判断）。
- 错误：全局 handler 输出 `{code, message, data:null, timestamp, traceId}`；HTTP 状态取 `AppError.statusCode`，未识别错误 500。
- DI 方式：每个域 `routes.ts` 导出工厂 `createXxxRouter(deps): Router`，入口聚合。

## Ingest 原始 body 解析（替代 Fastify addContentTypeParser）
- `/api/ingest/envelope/:appId`：路由级 `express.text({ type:['application/octet-stream','text/plain','*/*'], limit:'2mb' })`。
- `/api/ingest/rrweb/:appId`：路由级 `express.json({ limit:'5mb' })`。
- 其余路由用全局 `express.json({ limit:'1mb' })`。

## WebSocket
- `ws/broadcaster.ts`：`WebSocket` 类型来自 `ws`；`createBroadcaster()` 行为不变；新增 `attachWebSocket(server, broadcaster)`：`server.on('upgrade', req => url.pathname(req.url)==='/api/ws' ? wss.handleUpgrade(...) : server... )`，用 `WebSocketServer({ noServer:true })`。
- 渲染端连接 `ws://.../api/ws` 不变。

## 消费端适配（采用信封后必须）
1. `app/src/renderer/lib/request.ts`：响应拦截器解包 `response.data = body.data`（仅当 body 是含 `data` 字段的对象，兼容 204 空体）；错误拦截器已读 `payload.message`，天然兼容。删除“no `{code,data}` envelope”注释。
2. `app/src/main/agent/monitor.ts`：`createMonitorHttp` 的 axios 实例加同样解包拦截器（8 处 `.then(r=>r.data)` 无需逐个改）。
3. `packages/cli/src/lib/api.ts`：`return (await res.json()).data as T`（解包）；保留 `res.status===204` 判断。
4. `examples/*`：ingest / sourcemap 上传仅看状态码（core/transport 只读 `res.status`），不读 body，无需改；核实 `upload-sourcemaps.mjs` 不依赖 body 内容（已确认发 JSON）。

## 测试
- 现有 6 个 repo/envelope 测试：仅更新 import 路径（`store→domains`、`ingest→domains/ingest`），断言不变。
- 新增 `tests/http.test.ts`：supertest 拉起 app，验证成功信封 `{code:0,data}`、404 错误信封、`/health`、ingest 202 —— 锁定新契约。
- `vitest.config.ts` 保留。

## tsconfig & 脚本
- 新增 `server/tsconfig.build.json`（镜像 neon）：`removeComments:false`（swagger 需要）、`declaration:false`、`sourceMap:false`、exclude `**/*.test.ts`。
- `server/package.json`：`build: tsc --project tsconfig.build.json`；`dev`/`start` 不变；`typecheck` 指向 build 配置。
- 仍 extends `../tsconfig.base.json`（Bundler/ESNext 已可与 tsx+tsc 工作，不强行改 NodeNext 以免波及他包）。

## 实施顺序
1. 改 `server/package.json` 依赖 + 安装；建 `shared/`、`middlewares/`、`errors/`、`types`、`types.d.ts` 骨架（vendor neon 代码并适配）。
2. 建 `db.ts` + `migrations.ts`、重写 `ws/broadcaster.ts`（ws 版）。
3. 逐域搬迁：`store/*→domains/*/db.ts`、`api/*→service.ts+routes.ts`（加 `@openapi`）。
4. 重写 `index.ts` 启动 + `routes/health.ts`。
5. 适配消费端（renderer request.ts、monitor.ts、cli api.ts）。
6. 更新测试 import + 新增 `http.test.ts`。
7. 验证：`pnpm --filter @traceability/server typecheck && pnpm --filter @traceability/server test`；手动 `pnpm --filter @traceability/server dev` 检查 `/api-docs`、`/api/ws`、`/api/apps`。

## 不在范围
- 不拆分为多微服务 / 不引入 trpc（保持单服务）。
- 不引入 auth（MVP）。
- 不改 SQLite → Postgres。
- 不改 `@traceability/protocol` 类型。
