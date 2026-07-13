# Traceability Server Refactor (Fastify → Express, neon api-gateway aligned) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `@traceability/server` from a single-process Fastify app to an Express app whose tech stack, layered architecture (`domains/<module>/{db.ts, service.ts, routes.ts}`), and base capabilities (pino request logging + trace IDs, swagger-jsdoc, unified response envelope, global error handler) mirror `neon-server/packages/api-gateway`, while preserving SQLite, the WebSocket broadcaster, and the existing endpoint surface.

**Architecture:** Express app composed of per-domain Routers. Each domain owns `db.ts` (pure data access, relocated from `store/`), `service.ts` (business logic + validation, throws `AppError`), and `routes.ts` (thin Express router with `@openapi` JSDoc). Shared infra (`shared/`, `middlewares/`, `errors/`, `types`) is vendored from neon's `@neon-server/shared` + `api-gateway` into the server package (no cross-repo dependency). All success responses are wrapped `{code:0, data, timestamp}` via `res.success(data, status?)`; errors are `{code, message, data:null, timestamp, traceId}`. WebSocket `/api/ws` is served via the `ws` library on the same HTTP server.

**Tech Stack:** Express 4, `ws`, `swagger-jsdoc` + `swagger-ui-express`, `pino` + `pino-http` + `pino-pretty`, `better-sqlite3`, `source-map-js`, `@traceability/protocol`, `vitest`, `supertest`.

## Global Constraints

- Node `>=20`, pnpm `10.30.3`, ESM (`"type": "module"`), `moduleResolution: "Bundler"` (inherited from root `tsconfig.base.json`) — do not switch to `NodeNext`.
- Package name stays `@traceability/server`; workspace root is the traceability repo (not neon-server). neon-server is read-only reference.
- **No auth** in MVP — do not vendor `auth.ts` middleware; `req.user` type is not added.
- Preserve the exact endpoint paths and HTTP semantics: `GET/POST/GET/PATCH/DELETE /api/apps[/:id]`, `POST /api/apps/:id/sourcemaps`, `GET /api/issues[/:id][/events]`, `POST /api/issues/:id/{fix-request,attach-patch,mark-fixed}`, `GET /api/issues/:id/replays[/:replayId]`, `POST /api/ingest/{envelope,rrweb,performance}/:appId`, `GET /api/performance`, `GET /health`, `GET /api-docs`, `GET /api-docs.json`, `GET /api/ws` (WS).
- Preserve status codes: 200 (default), 201 (create app / upload sourcemap / save replay), 202 (ingest envelope / performance), 204 (delete app, no body), 400/404 (errors).
- SQLite DB path default `server/data/traceability.db` (from `config.ts`); `:memory:` used in tests.
- `Date.now()`/`new Date()` are fine in server runtime code (this is not a Workflow script).
- Old `server/src/{api,store,ingest,index.ts}` files stay in place during Tasks 1–13 (green coexistence); they are deleted in the Task 14 cutover. Do not delete them earlier.

---

## File Structure

**New files (created):**
- `server/src/shared/index.ts`, `server/src/shared/logger.ts`, `server/src/shared/isMainModule.ts` — vendored base utils.
- `server/src/errors/app-error.ts` — `AppError`.
- `server/src/types/index.ts` — `ApiResponse`. `server/src/types.d.ts` — Express `res.success` augmentation.
- `server/src/middlewares/swagger.ts`, `response.ts`, `error.ts`.
- `server/src/db.ts`, `server/src/migrations.ts` — relocated from `store/`.
- `server/src/ws/broadcaster.ts` — rewritten on `ws`.
- `server/src/routes/health.ts`.
- `server/src/domains/source-maps/{db.ts,service.ts}`.
- `server/src/domains/apps/{db.ts,service.ts,routes.ts}`.
- `server/src/domains/issues/{db.ts,service.ts,routes.ts}`.
- `server/src/domains/replays/{db.ts,service.ts,routes.ts}`.
- `server/src/domains/performance/{db.ts,service.ts,routes.ts}`.
- `server/src/domains/ingest/{envelope.ts,service.ts,routes.ts}`.
- `server/src/tests/{shared.test.ts,app-error.test.ts,response.test.ts,error.test.ts,db.test.ts,broadcaster.test.ts,apps.routes.test.ts,issues.routes.test.ts,replays.routes.test.ts,performance.routes.test.ts,ingest.routes.test.ts,http.test.ts}`.

**Modified:**
- `server/package.json` (deps + scripts), `server/tsconfig.json` (exclude tests from build), new `server/tsconfig.build.json`.
- `server/src/index.ts` (rewritten at cutover).
- `app/src/renderer/lib/request.ts`, `app/src/main/agent/monitor.ts`, `packages/cli/src/lib/api.ts` (envelope unwrap).
- `server/src/tests/{db,issues,performance,replays,sourceMaps,envelope}.test.ts` (repoint imports at cutover).

**Deleted (cutover):** `server/src/api/`, `server/src/store/`, `server/src/ingest/`.

---

### Task 1: Project setup — dependencies, tsconfig, skeleton

**Files:**
- Modify: `server/package.json`
- Modify: `server/tsconfig.json`
- Create: `server/tsconfig.build.json`
- Create: `server/src/types.d.ts` (empty placeholder so dirs exist)

**Interfaces:**
- Produces: `tsconfig.build.json` (build config preserving comments for swagger); updated `package.json` scripts (`build` uses `tsconfig.build.json`).

- [ ] **Step 1: Replace `server/package.json`**

Keep `fastify` deps for now (old code still imports them until Task 14). Add new deps.

```json
{
  "name": "@traceability/server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "build": "tsc --project tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@fastify/cors": "^9.0.0",
    "@fastify/multipart": "^8.0.0",
    "@fastify/websocket": "^10.0.0",
    "@traceability/protocol": "workspace:*",
    "better-sqlite3": "^11.0.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "fastify": "^4.28.0",
    "pino": "^9.5.0",
    "pino-http": "^10.3.0",
    "pino-pretty": "^11.3.0",
    "source-map-js": "^1.2.1",
    "swagger-jsdoc": "^6.2.8",
    "swagger-ui-express": "^5.0.1",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/supertest": "^6.0.2",
    "@types/swagger-jsdoc": "^6.0.4",
    "@types/swagger-ui-express": "^4.1.7",
    "@types/ws": "^8.5.13",
    "supertest": "^7.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`@sentry/core` is removed — it was unused in `server/src`.

- [ ] **Step 2: Replace `server/tsconfig.json`**

Exclude tests from the build config but keep them in the typecheck config.

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src"],
  "exclude": ["dist"]
}
```

- [ ] **Step 3: Create `server/tsconfig.build.json`**

`removeComments: false` is required — swagger-jsdoc reads `@openapi` JSDoc from emitted JS in production.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "removeComments": false,
    "declaration": false,
    "sourceMap": false
  },
  "include": ["src"],
  "exclude": ["dist", "src/tests/**/*", "src/**/*.test.ts"]
}
```

- [ ] **Step 4: Install dependencies**

Run: `pnpm install`
Expected: install succeeds; `better-sqlite3` rebuilds (in root `onlyBuiltDependencies`).

- [ ] **Step 5: Verify baseline typecheck still passes (old Fastify code intact)**

Run: `pnpm --filter ./server typecheck`
Expected: PASS (no errors — old code still compiles with both fastify + express present).

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/tsconfig.json server/tsconfig.build.json pnpm-lock.yaml
git commit -m "chore(server): add express/swagger/pino/ws deps + build tsconfig for refactor"
```

---

### Task 2: Vendor shared utilities (logger, isMainModule)

**Files:**
- Create: `server/src/shared/logger.ts`, `server/src/shared/isMainModule.ts`, `server/src/shared/index.ts`
- Test: `server/src/tests/shared.test.ts`

**Interfaces:**
- Produces: `createLogger(serviceName: string): pino.Logger`, `getTraceId(): string | undefined`, `getLoggerTraceIdHeader(): Record<string,string>`, `createRequestLoggerMiddleware(logger: pino.Logger): Express.RequestHandler`, `isMainModule(importMetaUrl: string): boolean`.
- Adaptation from neon: disable the pino-pretty **transport** (worker thread) when `NODE_ENV === 'test'` to keep vitest from hanging.

- [ ] **Step 1: Write the failing test**

`server/src/tests/shared.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getTraceId, isMainModule } from '../shared/index.js'

describe('shared utils', () => {
  it('getTraceId returns undefined outside a request context', () => {
    expect(getTraceId()).toBeUndefined()
  })

  it('isMainModule returns false for a non-entry url', () => {
    expect(isMainModule('file:///not/the/entry.ts')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ./server exec vitest run src/tests/shared.test.ts`
Expected: FAIL — `Cannot find module '../shared/index.js'`.

- [ ] **Step 3: Create `server/src/shared/logger.ts`**

Vendored from neon `packages/shared/src/logger.ts` with the test-env guard on the transport.

```ts
import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { pinoHttp } from 'pino-http'
import pino from 'pino'
import type { NextFunction, Request, Response } from 'express'

const isDev = process.env.NODE_ENV !== 'production'
// pino-pretty spawns a worker-thread transport; avoid it under vitest so the
// test process can exit cleanly.
const isTest = process.env.NODE_ENV === 'test'

const TRACE_HEADER_KEY = 'x-request-id'

interface LoggerContext {
  traceId?: string
  [key: string]: unknown
}

const asyncLocalStorage = new AsyncLocalStorage<LoggerContext>()

export interface LoggerOptions {
  serviceName: string
}

export function createLogger(serviceName: string) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    mixin() {
      const traceId = getTraceId()
      return traceId ? { traceId } : {}
    },
    redact: {
      paths: ['req.headers.authorization', 'password', 'token', 'secret'],
      censor: '***',
    },
    transport: isDev && !isTest
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname', messageFormat: `[${serviceName}] {msg}` } }
      : undefined,
    base: { service: serviceName, pid: process.pid },
  })
}

export function getTraceId(): string | undefined {
  return asyncLocalStorage.getStore()?.traceId
}

export function getLoggerTraceIdHeader(): Record<string, string> {
  const traceId = getTraceId()
  return traceId ? { [TRACE_HEADER_KEY]: traceId } : {}
}

export function createRequestLoggerMiddleware(logger: pino.Logger) {
  const httpLogger = pinoHttp({
    logger,
    genReqId: (req) => (req.headers[TRACE_HEADER_KEY] as string) || randomUUID(),
    serializers: {
      req: (req) => ({ method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    customAttributeKeys: { req: 'req', res: 'res', err: 'err', responseTime: 'responseTime' },
  })

  return (req: Request, res: Response, next: NextFunction) => {
    httpLogger(req, res, () => {
      const traceId = req.id as string
      res.setHeader(TRACE_HEADER_KEY, traceId)
      asyncLocalStorage.run({ traceId }, () => next())
    })
  }
}
```

- [ ] **Step 4: Create `server/src/shared/isMainModule.ts`**

```ts
import { fileURLToPath } from 'node:url'

export function isMainModule(importMetaUrl: string): boolean {
  return process.argv[1] === fileURLToPath(importMetaUrl)
}
```

- [ ] **Step 5: Create `server/src/shared/index.ts`**

```ts
export { createLogger, getTraceId, getLoggerTraceIdHeader, createRequestLoggerMiddleware } from './logger.js'
export { isMainModule } from './isMainModule.js'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter ./server exec vitest run src/tests/shared.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/shared server/src/tests/shared.test.ts
git commit -m "feat(server): vendor shared logger + isMainModule from neon"
```

---

### Task 3: AppError + ApiResponse types

**Files:**
- Create: `server/src/errors/app-error.ts`, `server/src/types/index.ts`, `server/src/types.d.ts`
- Test: `server/src/tests/app-error.test.ts`

**Interfaces:**
- Produces: `class AppError extends Error { statusCode: number; code?: number }`, `interface ApiResponse<T> { code: number; message?: string; data: T; timestamp: string; traceId?: string }`, and global `Express.Response.success<T>(data: T, status?: number): void`.

- [ ] **Step 1: Write the failing test**

`server/src/tests/app-error.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { AppError } from '../errors/app-error.js'

describe('AppError', () => {
  it('carries statusCode and optional code', () => {
    const err = new AppError('not found', 404, 404)
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe(404)
    expect(err.message).toBe('not found')
    expect(err.name).toBe('AppError')
  })

  it('defaults statusCode to 500 and code to undefined', () => {
    const err = new AppError('boom')
    expect(err.statusCode).toBe(500)
    expect(err.code).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ./server exec vitest run src/tests/app-error.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `server/src/errors/app-error.ts`**

```ts
export class AppError extends Error {
  public readonly statusCode: number
  public readonly code?: number

  constructor(message: string, statusCode = 500, code?: number) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.name = 'AppError'
    Error.captureStackTrace(this, this.constructor)
  }
}
```

- [ ] **Step 4: Create `server/src/types/index.ts`**

```ts
export interface ApiResponse<T = unknown> {
  code: number
  message?: string
  data: T
  timestamp: string
  traceId?: string
}
```

- [ ] **Step 5: Create `server/src/types.d.ts`**

```ts
import 'express'

declare global {
  namespace Express {
    interface Response {
      success: <T>(data: T, status?: number) => void
    }
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter ./server exec vitest run src/tests/app-error.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/errors server/src/types server/src/types.d.ts server/src/tests/app-error.test.ts
git commit -m "feat(server): add AppError, ApiResponse, res.success type augmentation"
```

---

### Task 4: Response middleware (`res.success` envelope)

**Files:**
- Create: `server/src/middlewares/response.ts`
- Test: `server/src/tests/response.test.ts`

**Interfaces:**
- Consumes: `ApiResponse` from `../types/index.js`.
- Produces: `createResponseMiddleware(): Express.RequestHandler` that attaches `res.success(data, status=200)` → `res.status(status).json({code:0, data, timestamp})`.

- [ ] **Step 1: Write the failing test**

`server/src/tests/response.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createResponseMiddleware } from '../middlewares/response.js'

describe('response middleware', () => {
  it('wraps data in {code:0, data, timestamp} with 200 by default', async () => {
    const app = express()
    app.use(createResponseMiddleware())
    app.get('/x', (req, res) => res.success({ id: 1 }))
    const r = await request(app).get('/x')
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ code: 0, data: { id: 1 }, timestamp: expect.any(String) })
  })

  it('honours a custom status (201)', async () => {
    const app = express()
    app.use(createResponseMiddleware())
    app.post('/x', (req, res) => res.success({ ok: true }, 201))
    const r = await request(app).post('/x')
    expect(r.status).toBe(201)
    expect(r.body.code).toBe(0)
    expect(r.body.data).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ./server exec vitest run src/tests/response.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `server/src/middlewares/response.ts`**

```ts
import type { Request, Response, NextFunction } from 'express'
import type { ApiResponse } from '../types/index.js'

export function createResponseMiddleware() {
  return (_: Request, res: Response, next: NextFunction) => {
    res.success = function <T>(data: T, status = 200) {
      const response: ApiResponse<T> = {
        code: 0,
        data,
        timestamp: new Date().toISOString(),
      }
      res.status(status).json(response)
    }
    next()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter ./server exec vitest run src/tests/response.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/middlewares/response.ts server/src/tests/response.test.ts
git commit -m "feat(server): add response envelope middleware (res.success)"
```

---

### Task 5: Global error handler middleware

**Files:**
- Create: `server/src/middlewares/error.ts`
- Test: `server/src/tests/error.test.ts`

**Interfaces:**
- Consumes: `AppError`, `getTraceId` from `../shared/index.js`, `ApiResponse`.
- Produces: `createGlobalErrorHandlerMiddleware(): Express.ErrorRequestHandler` → on `AppError` uses `err.statusCode`/`err.code`/`err.message`; on generic `Error` returns 500 with `err.message`; body is the error `ApiResponse` with `traceId` when available.

- [ ] **Step 1: Write the failing test**

`server/src/tests/error.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createResponseMiddleware } from '../middlewares/response.js'
import { createGlobalErrorHandlerMiddleware } from '../middlewares/error.js'
import { AppError } from '../errors/app-error.js'

function build() {
  const app = express()
  app.use(createResponseMiddleware())
  app.get('/boom', () => { throw new AppError('not found', 404, 404) })
  app.get('/crash', () => { throw new Error('kaboom') })
  app.use(createGlobalErrorHandlerMiddleware())
  return app
}

describe('global error handler', () => {
  it('maps AppError to its statusCode/code/message', async () => {
    const r = await request(build()).get('/boom')
    expect(r.status).toBe(404)
    expect(r.body).toMatchObject({ code: 404, message: 'not found', data: null })
    expect(r.body.timestamp).toEqual(expect.any(String))
  })

  it('maps unknown errors to 500', async () => {
    const r = await request(build()).get('/crash')
    expect(r.status).toBe(500)
    expect(r.body).toMatchObject({ code: 500, message: 'kaboom', data: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ./server exec vitest run src/tests/error.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `server/src/middlewares/error.ts`**

```ts
import type { Request, Response, NextFunction } from 'express'
import { getTraceId } from '../shared/index.js'
import { AppError } from '../errors/app-error.js'
import type { ApiResponse } from '../types/index.js'

export function createGlobalErrorHandlerMiddleware() {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let statusCode = 500
    let code = 500
    let message = 'Internal Server Error'

    if (err instanceof AppError) {
      statusCode = err.statusCode
      message = err.message
      code = err.code ?? err.statusCode
    } else if (err instanceof Error) {
      message = err.message
    }

    const response: ApiResponse<null> = {
      code,
      message,
      data: null,
      timestamp: new Date().toISOString(),
      traceId: getTraceId(),
    }
    res.status(statusCode).json(response)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter ./server exec vitest run src/tests/error.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/middlewares/error.ts server/src/tests/error.test.ts
git commit -m "feat(server): add global error handler middleware"
```

---

### Task 6: Relocate db + migrations

**Files:**
- Create: `server/src/migrations.ts` (from `store/migrations.ts`), `server/src/db.ts` (from `store/db.ts`)
- Test: `server/src/tests/db.test.ts` (new minimal test; the old `store/db.ts` + old test stay until Task 14)

**Interfaces:**
- Produces: `openDb(dbPath: string): Database.Database` (runs migrations), `runMigrations(db): void`. Unchanged behavior from `store/db.ts` + `store/migrations.ts`.

- [ ] **Step 1: Write the failing test**

`server/src/tests/db.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { openDb } from '../db.js'

let db: Database
beforeEach(() => { db = openDb(':memory:') })

describe('openDb', () => {
  it('runs migrations and creates core tables', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    const names = tables.map((t) => t.name)
    expect(names).toContain('applications')
    expect(names).toContain('issues')
    expect(names).toContain('events')
    expect(names).toContain('rrweb_replays')
    expect(names).toContain('performance_samples')
    expect(names).toContain('source_maps')
    expect(names).toContain('patches')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ./server exec vitest run src/tests/db.test.ts`
Expected: FAIL — `Cannot find module '../db.js'`.

- [ ] **Step 3: Create `server/src/migrations.ts`**

Verbatim copy of `server/src/store/migrations.ts` (the `runMigrations` function + `db.pragma('journal_mode = WAL')` + the full `db.exec(...)` with all 7 tables + indexes). Copy the entire function body unchanged.

```ts
import type { Database } from 'better-sqlite3'

export function runMigrations(db: Database): void {
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repo_url TEXT NOT NULL,
      default_branch TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'open',
      metadata TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_issues_app_id ON issues(app_id);
    CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_app_fingerprint ON issues(app_id, fingerprint);

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      received_at TEXT NOT NULL,
      envelope TEXT NOT NULL,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_events_issue_id ON events(issue_id);

    CREATE TABLE IF NOT EXISTS performance_samples (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'millisecond',
      measured_at TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_performance_samples_app_time ON performance_samples(app_id, measured_at DESC);

    CREATE TABLE IF NOT EXISTS source_maps (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      release TEXT NOT NULL DEFAULT '',
      file TEXT NOT NULL,
      source_map TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE,
      UNIQUE(app_id, release, file)
    );

    CREATE INDEX IF NOT EXISTS idx_source_maps_lookup ON source_maps(app_id, release, file);

    CREATE TABLE IF NOT EXISTS rrweb_replays (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      issue_id TEXT,
      sentry_event_id TEXT,
      received_at TEXT NOT NULL,
      captured_at TEXT,
      start_at INTEGER,
      end_at INTEGER,
      event_count INTEGER NOT NULL DEFAULT 0,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL DEFAULT '[]',
      metadata TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_rrweb_replays_issue_id ON rrweb_replays(issue_id);
    CREATE INDEX IF NOT EXISTS idx_rrweb_replays_app_id ON rrweb_replays(app_id);
    CREATE INDEX IF NOT EXISTS idx_rrweb_replays_sentry_event_id ON rrweb_replays(sentry_event_id);

    CREATE TABLE IF NOT EXISTS patches (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL,
      branch TEXT NOT NULL,
      file_path TEXT NOT NULL,
      attached_at TEXT NOT NULL,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
    );
  `)
}
```

- [ ] **Step 4: Create `server/src/db.ts`**

```ts
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { runMigrations } from './migrations.js'

export function openDb(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true })
  }
  const db = new Database(dbPath)
  runMigrations(db)
  return db
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter ./server exec vitest run src/tests/db.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add server/src/db.ts server/src/migrations.ts server/src/tests/db.test.ts
git commit -m "feat(server): relocate db + migrations to src root"
```

---

### Task 7: WebSocket broadcaster on `ws`

**Files:**
- Create: `server/src/ws/broadcaster.ts`
- Test: `server/src/tests/broadcaster.test.ts`

**Interfaces:**
- Produces: `interface IssueEvent { kind: 'issue:created'|'issue:updated'|'issue:status-changed'; appId: string; issueId: string; payload: unknown }`, `createBroadcaster(): { add(ws: WebSocket): void; broadcast(event: IssueEvent): void; size(): number }`, `attachWebSocket(server: http.Server, broadcaster: ReturnType<typeof createBroadcaster>): void` (handles `upgrade` for `/api/ws`).
- `broadcast` only sends to sockets whose `readyState === WebSocket.OPEN`.

- [ ] **Step 1: Write the failing test**

`server/src/tests/broadcaster.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { WebSocket } from 'ws'
import { createBroadcaster, type IssueEvent } from '../ws/broadcaster.js'

function fakeSocket(open: boolean) {
  return {
    readyState: open ? WebSocket.OPEN : 3,
    send: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket
}

describe('broadcaster', () => {
  it('broadcasts to open sockets only', () => {
    const bc = createBroadcaster()
    const open = fakeSocket(true)
    const closed = fakeSocket(false)
    bc.add(open)
    bc.add(closed)
    const event: IssueEvent = { kind: 'issue:created', appId: 'a', issueId: 'i', payload: {} }
    bc.broadcast(event)
    expect(open.send).toHaveBeenCalledTimes(1)
    expect(closed.send).not.toHaveBeenCalled()
    expect(JSON.parse((open.send as any).mock.calls[0][0])).toMatchObject({ kind: 'issue:created' })
    expect(bc.size()).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ./server exec vitest run src/tests/broadcaster.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `server/src/ws/broadcaster.ts`**

```ts
import type { Server } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'

export interface IssueEvent {
  kind: 'issue:created' | 'issue:updated' | 'issue:status-changed'
  appId: string
  issueId: string
  payload: unknown
}

export type Broadcaster = ReturnType<typeof createBroadcaster>

export function createBroadcaster() {
  const subscribers = new Set<WebSocket>()
  return {
    add(ws: WebSocket) {
      subscribers.add(ws)
      ws.on('close', () => subscribers.delete(ws))
    },
    broadcast(event: IssueEvent) {
      const msg = JSON.stringify(event)
      for (const ws of subscribers) {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg)
      }
    },
    size(): number {
      return subscribers.size
    },
  }
}

export function attachWebSocket(server: Server, broadcaster: Broadcaster): void {
  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '', 'http://localhost')
    if (pathname === '/api/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        broadcaster.add(ws)
        wss.emit('connection', ws, req)
      })
    } else {
      socket.destroy()
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter ./server exec vitest run src/tests/broadcaster.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add server/src/ws/broadcaster.ts server/src/tests/broadcaster.test.ts
git commit -m "feat(server): rewrite ws broadcaster on the ws library"
```

---

### Task 8: Domain — source-maps (db + service)

**Files:**
- Create: `server/src/domains/source-maps/db.ts` (from `store/sourceMaps.ts`), `server/src/domains/source-maps/service.ts`
- Test: `server/src/tests/source-maps.test.ts` (new; old `store/sourceMaps.ts` + old test stay until Task 14)

**Interfaces:**
- Produces: `createSourceMapsRepo(db): SourceMapsRepo` (methods `upsert(appId, input): void`, `resolveFrames(appId, release, frames): SourceLocation[]`), `createSourceMapsService(repo): { upsert(appId, input): void; resolveFrames(appId, release, frames): SourceLocation[] }` (service throws `AppError('file and sourceMap are required', 400, 400)` on invalid input instead of a plain Error).

- [ ] **Step 1: Write the failing test**

`server/src/tests/source-maps.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { SourceMapGenerator } from 'source-map-js'
import { openDb } from '../db.js'
import { createSourceMapsService } from '../domains/source-maps/service.js'
import { AppError } from '../errors/app-error.js'

let db: Database
beforeEach(() => { db = openDb(':memory:') })

// Insert an application row directly so this test stays independent of the
// apps domain (created in a later task). source_maps has an FK to applications.
function seedApp(db: Database, id = 'app-1'): string {
  db.prepare("INSERT INTO applications (id, name, repo_url, default_branch, created_at) VALUES (?, 'A', 'git@x:a', 'main', '2026-01-01T00:00:00Z')").run(id)
  return id
}

describe('source-maps service', () => {
  it('rejects invalid upload with AppError 400', () => {
    const svc = createSourceMapsService(db)
    expect(() => svc.upsert('app', { file: '', sourceMap: {} } as any)).toThrow(AppError)
  })

  it('resolves a frame through an uploaded map', () => {
    const appId = seedApp(db)
    const svc = createSourceMapsService(db)
    const gen = new SourceMapGenerator({ file: 'app.min.js' })
    gen.addMapping({ generated: { line: 1, column: 0 }, original: { line: 10, column: 4 }, source: 'app.ts' })
    gen.setSourceContent('app.ts', 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12\n')
    svc.upsert(appId, { file: 'app.min.js', sourceMap: JSON.parse(gen.toString()) })
    const [resolved] = svc.resolveFrames(appId, undefined, [{ filename: 'app.min.js', lineno: 1, colno: 1 }])
    expect(resolved?.file).toBe('app.ts')
    expect(resolved?.line).toBe(10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ./server exec vitest run src/tests/source-maps.test.ts`
Expected: FAIL - `createSourceMapsService` not found.

- [ ] **Step 3: Create `server/src/domains/source-maps/db.ts`**

Verbatim copy of `server/src/store/sourceMaps.ts` (the `createSourceMapsRepo`, `resolveFrame`, `artifactCandidates`, `normaliseArtifactFile` helpers — unchanged). Copy the full file content from `store/sourceMaps.ts`.

```ts
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { SourceMapConsumer } from 'source-map-js'
import type { SourceLocation, SourceMapUpload } from '@traceability/protocol'

interface SourceMapRow {
  source_map: string
}

interface StackFrame {
  filename?: string
  function?: string
  lineno?: number
  colno?: number
}

export function createSourceMapsRepo(db: Database) {
  const findMap = (appId: string, release: string | undefined, file: string): Record<string, unknown> | undefined => {
    const candidates = artifactCandidates(file)
    for (const candidate of candidates) {
      const row = db.prepare(
        `SELECT source_map FROM source_maps
         WHERE app_id = ? AND file = ? AND release IN (?, '')
         ORDER BY CASE WHEN release = ? THEN 0 ELSE 1 END
         LIMIT 1`,
      ).get(appId, candidate, release ?? '', release ?? '') as SourceMapRow | undefined
      if (row) return JSON.parse(row.source_map) as Record<string, unknown>
    }
    return undefined
  }

  return {
    upsert(appId: string, input: SourceMapUpload): void {
      if (!input.file || !input.sourceMap || typeof input.sourceMap !== 'object') {
        throw new Error('file and sourceMap are required')
      }
      const file = normaliseArtifactFile(input.file)
      const release = input.release ?? ''
      db.prepare(
        `INSERT INTO source_maps (id, app_id, release, file, source_map, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(app_id, release, file) DO UPDATE SET source_map = excluded.source_map, uploaded_at = excluded.uploaded_at`,
      ).run(randomUUID(), appId, release, file, JSON.stringify(input.sourceMap), new Date().toISOString())
    },

    resolveFrames(appId: string, release: string | undefined, frames: StackFrame[]): SourceLocation[] {
      const resolved: SourceLocation[] = []
      for (const frame of frames) {
        if (!frame.filename || !frame.lineno) continue
        const map = findMap(appId, release, frame.filename)
        if (!map) continue
        const location = resolveFrame(map, frame)
        if (location) resolved.push(location)
      }
      return resolved
    },
  }
}

function resolveFrame(map: Record<string, unknown>, frame: StackFrame): SourceLocation | undefined {
  const consumer = new SourceMapConsumer(map as any)
  const generatedColumn = Math.max(0, (frame.colno ?? 1) - 1)
  const original = consumer.originalPositionFor({ line: frame.lineno!, column: generatedColumn })
  if (!original.source || !original.line) return undefined

  const content = consumer.sourceContentFor(original.source, true)
  const lines = typeof content === 'string' ? content.split(/\r?\n/) : []
  const startLine = Math.max(1, original.line - 2)
  const endLine = Math.min(lines.length, original.line + 2)
  return {
    file: original.source,
    line: original.line,
    column: (original.column ?? 0) + 1,
    function: original.name ?? frame.function,
    generated: { file: frame.filename ?? '', line: frame.lineno!, column: frame.colno ?? 1 },
    ...(lines.length > 0 ? { context: { startLine, lines: lines.slice(startLine - 1, endLine), errorLine: original.line } } : {}),
  }
}

function artifactCandidates(file: string): string[] {
  const normalised = normaliseArtifactFile(file)
  const basename = normalised.split('/').pop()!
  return [...new Set([normalised, basename])]
}

function normaliseArtifactFile(file: string): string {
  try {
    const parsed = new URL(file)
    return parsed.pathname.replace(/^\/+/, '')
  } catch {
    return file.replace(/^\/+/, '').replace(/^\.\//, '')
  }
}
```

- [ ] **Step 4: Create `server/src/domains/source-maps/service.ts`**

```ts
import type { Database } from 'better-sqlite3'
import type { SourceLocation, SourceMapUpload } from '@traceability/protocol'
import { createSourceMapsRepo } from './db.js'
import { AppError } from '../../errors/app-error.js'

interface StackFrame {
  filename?: string
  function?: string
  lineno?: number
  colno?: number
}

export function createSourceMapsService(db: Database) {
  const repo = createSourceMapsRepo(db)
  return {
    upsert(appId: string, input: SourceMapUpload): void {
      if (!input.file || !input.sourceMap || typeof input.sourceMap !== 'object') {
        throw new AppError('file and sourceMap are required', 400, 400)
      }
      repo.upsert(appId, input)
    },
    resolveFrames(appId: string, release: string | undefined, frames: StackFrame[]): SourceLocation[] {
      return repo.resolveFrames(appId, release, frames)
    },
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter ./server exec vitest run src/tests/source-maps.test.ts`
Expected: PASS (2 tests). (This task is self-contained - the test seeds its own application row via SQL, so it does not depend on the apps domain.)

- [ ] **Step 6: Commit**

```bash
git add server/src/domains/source-maps server/src/tests/source-maps.test.ts
git commit -m "feat(server): add source-maps domain (db + service)"
```

---

### Task 9: Domain — apps (db + service + routes)

**Files:**
- Create: `server/src/domains/apps/db.ts` (from `store/apps.ts`), `server/src/domains/apps/service.ts`, `server/src/domains/apps/routes.ts`
- Test: `server/src/tests/apps.routes.test.ts`

**Interfaces:**
- Consumes: `createSourceMapsService` from `../source-maps/service.js`.
- Produces: `createAppsRepo(db)` (list/get/create/update/remove), `createAppsService(db, sourceMaps): AppsService` with `list`, `get(id)` (404), `create(input)` (400 if missing name/repoUrl/defaultBranch), `update(id, input)` (404), `remove(id)` (404), `uploadSourceMap(appId, input)` (404 app, 400 invalid map via sourceMaps service). `createAppsRouter(deps: { appsService }): Router`.

- [ ] **Step 1: Write the failing test**

`server/src/tests/apps.routes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Database } from 'better-sqlite3'
import { openDb } from '../db.js'
import { createResponseMiddleware } from '../middlewares/response.js'
import { createGlobalErrorHandlerMiddleware } from '../middlewares/error.js'
import { createAppsRouter } from '../domains/apps/routes.js'
import { createAppsService } from '../domains/apps/service.js'
import { createSourceMapsService } from '../domains/source-maps/service.js'

let app: express.Express
beforeEach(() => {
  const db: Database = openDb(':memory:')
  const appsService = createAppsService(db, createSourceMapsService(db))
  app = express()
  app.use(express.json())
  app.use(createResponseMiddleware())
  app.use(createAppsRouter({ appsService }))
  app.use(createGlobalErrorHandlerMiddleware())
})

describe('apps routes', () => {
  it('POST /api/apps validates and returns 201 envelope', async () => {
    const r = await request(app).post('/api/apps').send({ name: 'A', repoUrl: 'git@x:a', defaultBranch: 'main' })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ code: 0, data: { name: 'A', repoUrl: 'git@x:a', defaultBranch: 'main' } })
    expect(r.body.data.id).toEqual(expect.any(String))
  })

  it('POST /api/apps 400 when fields missing', async () => {
    const r = await request(app).post('/api/apps').send({ name: 'A' })
    expect(r.status).toBe(400)
    expect(r.body).toMatchObject({ code: 400, data: null })
  })

  it('GET /api/apps/:id 404 envelope', async () => {
    const r = await request(app).get('/api/apps/nope')
    expect(r.status).toBe(404)
    expect(r.body).toMatchObject({ code: 404, data: null })
  })

  it('DELETE /api/apps/:id returns 204 with no body', async () => {
    const created = await request(app).post('/api/apps').send({ name: 'A', repoUrl: 'git@x:a', defaultBranch: 'main' })
    const r = await request(app).delete(`/api/apps/${created.body.data.id}`)
    expect(r.status).toBe(204)
    expect(r.text).toBe('')
  })

  it('POST /api/apps/:id/sourcemaps 404 when app missing', async () => {
    const r = await request(app).post('/api/apps/nope/sourcemaps').send({ file: 'a.js', sourceMap: {} })
    expect(r.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ./server exec vitest run src/tests/apps.routes.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `server/src/domains/apps/db.ts`**

Verbatim copy of `server/src/store/apps.ts` (the `createAppsRepo` function + `rowToApp` + `CreateAppInput`/`UpdateAppInput` — unchanged).

```ts
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { Application } from '@traceability/protocol'

interface CreateAppInput {
  name: string
  repoUrl: string
  defaultBranch: string
}

interface UpdateAppInput {
  name?: string
  repoUrl?: string
  defaultBranch?: string
}

export function createAppsRepo(db: Database) {
  const rowToApp = (r: Record<string, unknown>): Application => ({
    id: r.id as string,
    name: r.name as string,
    repoUrl: r.repo_url as string,
    defaultBranch: r.default_branch as string,
    createdAt: r.created_at as string,
  })

  return {
    list(): Application[] {
      const rows = db.prepare('SELECT * FROM applications ORDER BY created_at DESC').all() as Array<Record<string, unknown>>
      return rows.map(rowToApp)
    },
    get(id: string): Application | undefined {
      const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as Record<string, unknown> | undefined
      return row ? rowToApp(row) : undefined
    },
    create(input: CreateAppInput): Application {
      const app: Application = {
        id: randomUUID(),
        name: input.name,
        repoUrl: input.repoUrl,
        defaultBranch: input.defaultBranch,
        createdAt: new Date().toISOString(),
      }
      db.prepare('INSERT INTO applications (id, name, repo_url, default_branch, created_at) VALUES (?, ?, ?, ?, ?)').run(app.id, app.name, app.repoUrl, app.defaultBranch, app.createdAt)
      return app
    },
    update(id: string, input: UpdateAppInput): Application | undefined {
      const existing = this.get(id)
      if (!existing) return undefined
      const updated: Application = {
        ...existing,
        name: input.name ?? existing.name,
        repoUrl: input.repoUrl ?? existing.repoUrl,
        defaultBranch: input.defaultBranch ?? existing.defaultBranch,
      }
      db.prepare('UPDATE applications SET name = ?, repo_url = ?, default_branch = ? WHERE id = ?').run(updated.name, updated.repoUrl, updated.defaultBranch, id)
      return updated
    },
    remove(id: string): boolean {
      const res = db.prepare('DELETE FROM applications WHERE id = ?').run(id)
      return res.changes > 0
    },
  }
}
```

- [ ] **Step 4: Create `server/src/domains/apps/service.ts`**

```ts
import type { Database } from 'better-sqlite3'
import type { Application, SourceMapUpload } from '@traceability/protocol'
import { createAppsRepo } from './db.js'
import { AppError } from '../../errors/app-error.js'

interface CreateAppInput { name: string; repoUrl: string; defaultBranch: string }
interface UpdateAppInput { name?: string; repoUrl?: string; defaultBranch?: string }

export interface AppsService {
  list(): Application[]
  get(id: string): Application
  create(input: CreateAppInput): Application
  update(id: string, input: UpdateAppInput): Application
  remove(id: string): void
  uploadSourceMap(appId: string, input: SourceMapUpload): void
}

export function createAppsService(db: Database, sourceMaps: { upsert(appId: string, input: SourceMapUpload): void }): AppsService {
  const repo = createAppsRepo(db)
  return {
    list: () => repo.list(),
    get: (id) => {
      const found = repo.get(id)
      if (!found) throw new AppError('not found', 404, 404)
      return found
    },
    create: (input) => {
      if (!input.name || !input.repoUrl || !input.defaultBranch) {
        throw new AppError('name, repoUrl, defaultBranch required', 400, 400)
      }
      return repo.create(input)
    },
    update: (id, input) => {
      const updated = repo.update(id, input)
      if (!updated) throw new AppError('not found', 404, 404)
      return updated
    },
    remove: (id) => {
      if (!repo.remove(id)) throw new AppError('not found', 404, 404)
    },
    uploadSourceMap: (appId, input) => {
      if (!repo.get(appId)) throw new AppError('application not found', 404, 404)
      sourceMaps.upsert(appId, input)
    },
  }
}
```

- [ ] **Step 5: Create `server/src/domains/apps/routes.ts`**

```ts
import { Router } from 'express'
import type { AppsService } from './service.js'

interface AppsRouterDeps {
  appsService: AppsService
}

export function createAppsRouter(deps: AppsRouterDeps): Router {
  const router = Router()
  const { appsService } = deps

  /**
   * @openapi
   * /api/apps:
   *   get:
   *     tags: [Apps]
   *     summary: List applications
   *     responses: { 200: { description: Application list } }
   */
  router.get('/api/apps', (_req, res) => {
    res.success(appsService.list())
  })

  /**
   * @openapi
   * /api/apps:
   *   post:
   *     tags: [Apps]
   *     summary: Create an application
   *     requestBody: { required: true, content: { application/json: { schema: { type: object } } } }
   *     responses: { 201: { description: Created }, 400: { description: Invalid input } }
   */
  router.post('/api/apps', (req, res) => {
    res.success(appsService.create(req.body ?? {}), 201)
  })

  /** @openapi /api/apps/{id}: get: { tags: [Apps], responses: { 200: {description: ok}, 404: {description: not found} } } */
  router.get('/api/apps/:id', (req, res) => {
    res.success(appsService.get(req.params.id))
  })

  /** @openapi /api/apps/{id}: patch: { tags: [Apps], responses: { 200: {description: ok}, 404: {description: not found} } } */
  router.patch('/api/apps/:id', (req, res) => {
    res.success(appsService.update(req.params.id, req.body ?? {}))
  })

  /** @openapi /api/apps/{id}: delete: { tags: [Apps], responses: { 204: {description: deleted}, 404: {description: not found} } } */
  router.delete('/api/apps/:id', (req, res) => {
    appsService.remove(req.params.id)
    res.status(204).end()
  })

  /**
   * @openapi
   * /api/apps/{id}/sourcemaps:
   *   post:
   *     tags: [Apps]
   *     summary: Upload a source map for an application
   *     responses: { 201: {description: uploaded}, 400: {description: invalid}, 404: {description: app not found} }
   */
  router.post('/api/apps/:id/sourcemaps', (req, res) => {
    appsService.uploadSourceMap(req.params.id, req.body)
    res.success({ ok: true }, 201)
  })

  return router
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter ./server exec vitest run src/tests/apps.routes.test.ts src/tests/source-maps.test.ts`
Expected: PASS (both files green; Task 8's source-maps test now resolves `domains/apps/db`).

- [ ] **Step 7: Commit**

```bash
git add server/src/domains/apps server/src/tests/apps.routes.test.ts
git commit -m "feat(server): add apps domain (db + service + routes)"
```

---

### Task 10: Domain — issues (db + service + routes)

**Files:**
- Create: `server/src/domains/issues/db.ts` (from `store/issues.ts`), `server/src/domains/issues/service.ts`, `server/src/domains/issues/routes.ts`
- Test: `server/src/tests/issues.routes.test.ts`

**Interfaces:**
- Consumes: `Broadcaster` from `../../ws/broadcaster.js`, envelope helpers from `../ingest/envelope.js` (Task 13 — create `domains/ingest/envelope.ts` first if running this test before Task 13; see Step 5 note).
- Produces: `createIssuesRepo(db)` (list/get/ingestEvent/appendEvent/listEvents/setStatus/attachPatch/getLatestPatch), `createIssuesService(db, broadcaster): IssuesService` with `list`, `get(id)` (404), `listEvents(id)` (404), `requestFix(id)` (404, broadcasts `issue:status-changed`), `attachPatch(id, {branch,patch})` (404, 400 if missing, broadcasts `issue:updated`), `markFixed(id)` (404, broadcasts), `ingestEvent(...)`, `appendEvent(...)`. `createIssuesRouter(deps: { issuesService }): Router`.

- [ ] **Step 1: Write the failing test**

`server/src/tests/issues.routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Database } from 'better-sqlite3'
import { openDb } from '../db.js'
import { createResponseMiddleware } from '../middlewares/response.js'
import { createGlobalErrorHandlerMiddleware } from '../middlewares/error.js'
import { createIssuesRouter } from '../domains/issues/routes.js'
import { createIssuesService } from '../domains/issues/service.js'
import { createAppsRepo } from '../domains/apps/db.js'
import { createBroadcaster, type Broadcaster } from '../ws/broadcaster.js'

let app: express.Express
let bc: Broadcaster
let issueId: string
beforeEach(async () => {
  const db: Database = openDb(':memory:')
  bc = createBroadcaster()
  bc.broadcast = vi.fn()
  const apps = createAppsRepo(db)
  const created = apps.create({ name: 'A', repoUrl: 'git@x:a', defaultBranch: 'main' })
  const issuesService = createIssuesService(db, bc)
  const { issue } = issuesService.ingestEvent(created.id, { type: 'error', exception: { values: [{ type: 'TypeError', value: 'x' }] } })
  issueId = issue.id
  app = express()
  app.use(express.json())
  app.use(createResponseMiddleware())
  app.use(createIssuesRouter({ issuesService }))
  app.use(createGlobalErrorHandlerMiddleware())
})

describe('issues routes', () => {
  it('GET /api/issues returns envelope with items', async () => {
    const r = await request(app).get('/api/issues')
    expect(r.status).toBe(200)
    expect(r.body.code).toBe(0)
    expect(r.body.data.items).toHaveLength(1)
  })

  it('GET /api/issues/:id 404 envelope', async () => {
    const r = await request(app).get('/api/issues/nope')
    expect(r.status).toBe(404)
  })

  it('POST /api/issues/:id/fix-request broadcasts status-changed', async () => {
    const r = await request(app).post(`/api/issues/${issueId}/fix-request`)
    expect(r.status).toBe(200)
    expect(r.body.data.status).toBe('fix-manual')
    expect(bc.broadcast).toHaveBeenCalled()
  })

  it('POST /api/issues/:id/attach-patch 400 when missing fields', async () => {
    const r = await request(app).post(`/api/issues/${issueId}/attach-patch`).send({})
    expect(r.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ./server exec vitest run src/tests/issues.routes.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `server/src/domains/issues/db.ts`**

Verbatim copy of `server/src/store/issues.ts`. The only change is the import of envelope helpers: `from '../ingest/envelope.js'` (sibling domain). Copy the full `createIssuesRepo` (rowToIssue, list, get, ingestEvent, appendEvent, listEvents, setStatus, attachPatch, getLatestPatch) unchanged.

```ts
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { Issue, Event, Patch, IssueStatus, SourceLocation } from '@traceability/protocol'
import type { SentryEventPayload } from '@traceability/protocol'
import { extractIssueFingerprint, payloadToIssueFields } from '../ingest/envelope.js'

export function createIssuesRepo(db: Database) {
  const rowToIssue = (r: Record<string, unknown>): Issue => ({
    id: r.id as string,
    appId: r.app_id as string,
    fingerprint: r.fingerprint as string,
    title: r.title as string,
    type: r.type as Issue['type'],
    firstSeen: r.first_seen as string,
    lastSeen: r.last_seen as string,
    count: r.count as number,
    status: r.status as IssueStatus,
    metadata: JSON.parse(r.metadata as string) as Issue['metadata'],
  })

  return {
    list(opts: { appId?: string; status?: IssueStatus; limit?: number; cursor?: string }): { items: Issue[]; nextCursor: string | null } {
      const limit = Math.min(opts.limit ?? 50, 200)
      const where: string[] = []
      const params: unknown[] = []
      if (opts.appId) { where.push('app_id = ?'); params.push(opts.appId) }
      if (opts.status) { where.push('status = ?'); params.push(opts.status) }
      if (opts.cursor) { where.push('last_seen < ?'); params.push(opts.cursor) }
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const rows = db.prepare(`SELECT * FROM issues ${whereClause} ORDER BY last_seen DESC LIMIT ?`).all(...params, limit + 1) as Array<Record<string, unknown>>
      const items = rows.slice(0, limit).map(rowToIssue)
      const nextCursor = rows.length > limit ? (rows[limit - 1]!.last_seen as string) : null
      return { items, nextCursor }
    },

    get(id: string): Issue | undefined {
      const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as Record<string, unknown> | undefined
      return row ? rowToIssue(row) : undefined
    },

    ingestEvent(appId: string, payload: SentryEventPayload, resolvedFrames: SourceLocation[] = []): { issue: Issue; created: boolean } {
      const fingerprint = extractIssueFingerprint(payload, appId)
      const fields = payloadToIssueFields(payload, resolvedFrames)
      const now = new Date().toISOString()
      const existing = db.prepare('SELECT * FROM issues WHERE app_id = ? AND fingerprint = ?').get(appId, fingerprint) as Record<string, unknown> | undefined
      if (existing) {
        db.prepare('UPDATE issues SET last_seen = ?, count = count + 1, metadata = ? WHERE id = ?').run(now, JSON.stringify(fields.metadata), existing.id)
        return { issue: this.get(existing.id as string)!, created: false }
      }
      const issue: Issue = { id: randomUUID(), appId, fingerprint, title: fields.title, type: fields.type, firstSeen: now, lastSeen: now, count: 1, status: 'open', metadata: fields.metadata }
      db.prepare(`INSERT INTO issues (id, app_id, fingerprint, title, type, first_seen, last_seen, count, status, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(issue.id, issue.appId, issue.fingerprint, issue.title, issue.type, issue.firstSeen, issue.lastSeen, issue.count, issue.status, JSON.stringify(issue.metadata))
      return { issue, created: true }
    },

    appendEvent(issueId: string, envelope: string): Event {
      const event: Event = { id: randomUUID(), issueId, receivedAt: new Date().toISOString(), envelope }
      db.prepare('INSERT INTO events (id, issue_id, received_at, envelope) VALUES (?, ?, ?, ?)').run(event.id, event.issueId, event.receivedAt, event.envelope)
      return event
    },

    listEvents(issueId: string, limit = 50): Event[] {
      const rows = db.prepare('SELECT * FROM events WHERE issue_id = ? ORDER BY received_at DESC LIMIT ?').all(issueId, limit) as Array<Record<string, unknown>>
      return rows.map((r) => ({ id: r.id as string, issueId: r.issue_id as string, receivedAt: r.received_at as string, envelope: r.envelope as string }))
    },

    setStatus(id: string, status: IssueStatus): Issue | undefined {
      db.prepare('UPDATE issues SET status = ? WHERE id = ?').run(status, id)
      return this.get(id)
    },

    attachPatch(issueId: string, branch: string, filePath: string): Patch {
      const patch: Patch = { id: randomUUID(), issueId, branch, filePath, attachedAt: new Date().toISOString() }
      db.prepare('INSERT INTO patches (id, issue_id, branch, file_path, attached_at) VALUES (?, ?, ?, ?, ?)').run(patch.id, patch.issueId, patch.branch, patch.filePath, patch.attachedAt)
      db.prepare("UPDATE issues SET status = 'fixing' WHERE id = ?").run(issueId)
      return patch
    },

    getLatestPatch(issueId: string): Patch | undefined {
      const row = db.prepare('SELECT * FROM patches WHERE issue_id = ? ORDER BY attached_at DESC LIMIT 1').get(issueId) as Record<string, unknown> | undefined
      if (!row) return undefined
      return { id: row.id as string, issueId: row.issue_id as string, branch: row.branch as string, filePath: row.file_path as string, attachedAt: row.attached_at as string }
    },
  }
}
```

- [ ] **Step 4: Create `server/src/domains/issues/service.ts`**

```ts
import type { Database } from 'better-sqlite3'
import type { Issue, Event, Patch, IssueStatus, SourceLocation, SentryEventPayload } from '@traceability/protocol'
import { createIssuesRepo } from './db.js'
import { AppError } from '../../errors/app-error.js'
import type { Broadcaster } from '../../ws/broadcaster.js'

export interface IssuesService {
  list(opts: { appId?: string; status?: IssueStatus; limit?: number; cursor?: string }): { items: Issue[]; nextCursor: string | null }
  get(id: string): Issue
  listEvents(id: string, limit?: number): Event[]
  requestFix(id: string): Issue
  attachPatch(id: string, input: { branch: string; patch: string }): Patch
  markFixed(id: string): Issue
  ingestEvent(appId: string, payload: SentryEventPayload, resolvedFrames?: SourceLocation[]): { issue: Issue; created: boolean }
  appendEvent(issueId: string, envelope: string): Event
}

export function createIssuesService(db: Database, broadcaster: Broadcaster): IssuesService {
  const repo = createIssuesRepo(db)
  return {
    list: (opts) => repo.list(opts),
    get: (id) => {
      const issue = repo.get(id)
      if (!issue) throw new AppError('not found', 404, 404)
      return issue
    },
    listEvents: (id, limit) => {
      const issue = repo.get(id)
      if (!issue) throw new AppError('not found', 404, 404)
      return repo.listEvents(id, limit)
    },
    requestFix: (id) => {
      const updated = repo.setStatus(id, 'fix-manual')
      if (!updated) throw new AppError('not found', 404, 404)
      broadcaster.broadcast({ kind: 'issue:status-changed', appId: updated.appId, issueId: updated.id, payload: updated })
      return updated
    },
    attachPatch: (id, input) => {
      const issue = repo.get(id)
      if (!issue) throw new AppError('not found', 404, 404)
      if (!input.branch || !input.patch) throw new AppError('branch + patch required', 400, 400)
      const filePath = `patches/${issue.id}-${Date.now()}.diff`
      const created = repo.attachPatch(id, input.branch, filePath)
      broadcaster.broadcast({ kind: 'issue:updated', appId: issue.appId, issueId: issue.id, payload: created })
      return created
    },
    markFixed: (id) => {
      const updated = repo.setStatus(id, 'fixed')
      if (!updated) throw new AppError('not found', 404, 404)
      broadcaster.broadcast({ kind: 'issue:status-changed', appId: updated.appId, issueId: updated.id, payload: updated })
      return updated
    },
    ingestEvent: (appId, payload, resolvedFrames = []) => repo.ingestEvent(appId, payload, resolvedFrames),
    appendEvent: (issueId, envelope) => repo.appendEvent(issueId, envelope),
  }
}
```

- [ ] **Step 5: Create `server/src/domains/issues/routes.ts`**

```ts
import { Router } from 'express'
import type { IssuesService } from './service.js'

interface IssuesRouterDeps {
  issuesService: IssuesService
}

export function createIssuesRouter(deps: IssuesRouterDeps): Router {
  const router = Router()
  const { issuesService } = deps

  /** @openapi /api/issues: get: { tags: [Issues], summary: List issues, responses: { 200: {description: ok} } } */
  router.get('/api/issues', (req, res) => {
    res.success(issuesService.list({
      appId: req.query.appId as string | undefined,
      status: req.query.status as any,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: req.query.cursor as string | undefined,
    }))
  })

  /** @openapi /api/issues/{id}: get: { tags: [Issues], responses: { 200: {description: ok}, 404: {description: not found} } } */
  router.get('/api/issues/:id', (req, res) => {
    res.success(issuesService.get(req.params.id))
  })

  /** @openapi /api/issues/{id}/events: get: { tags: [Issues], responses: { 200: {description: ok}, 404: {description: not found} } } */
  router.get('/api/issues/:id/events', (req, res) => {
    res.success(issuesService.listEvents(req.params.id, req.query.limit ? Number(req.query.limit) : undefined))
  })

  /** @openapi /api/issues/{id}/fix-request: post: { tags: [Issues], responses: { 200: {description: ok}, 404: {description: not found} } } */
  router.post('/api/issues/:id/fix-request', (req, res) => {
    res.success(issuesService.requestFix(req.params.id))
  })

  /** @openapi /api/issues/{id}/attach-patch: post: { tags: [Issues], responses: { 201: {description: created}, 400: {description: bad input}, 404: {description: not found} } } */
  router.post('/api/issues/:id/attach-patch', (req, res) => {
    res.success(issuesService.attachPatch(req.params.id, req.body ?? {}), 201)
  })

  /** @openapi /api/issues/{id}/mark-fixed: post: { tags: [Issues], responses: { 200: {description: ok}, 404: {description: not found} } } */
  router.post('/api/issues/:id/mark-fixed', (req, res) => {
    res.success(issuesService.markFixed(req.params.id))
  })

  return router
}
```

- [ ] **Step 6: Run test to verify it passes**

Note: `issues/db.ts` imports `../ingest/envelope.js`. Create `server/src/domains/ingest/envelope.ts` now (Task 13 Step 3 content) before running, OR run after Task 13. Simplest: create `domains/ingest/envelope.ts` here (it is a pure relocation with no new deps). Do that first:

Create `server/src/domains/ingest/envelope.ts` — verbatim copy of `server/src/ingest/envelope.ts` (the `parseEnvelope`, `filterSupportedItems`, `extractIssueFingerprint`, `payloadToIssueFields`, `isMessagePayload` functions — unchanged, importing types from `@traceability/protocol`). Copy the full file content from `ingest/envelope.ts`.

Then run: `pnpm --filter ./server exec vitest run src/tests/issues.routes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/domains/issues server/src/domains/ingest/envelope.ts server/src/tests/issues.routes.test.ts
git commit -m "feat(server): add issues domain + relocate envelope parser"
```

---

### Task 11: Domain — replays (db + service + routes)

**Files:**
- Create: `server/src/domains/replays/db.ts` (from `store/replays.ts`), `server/src/domains/replays/service.ts`, `server/src/domains/replays/routes.ts`
- Test: `server/src/tests/replays.routes.test.ts`

**Interfaces:**
- Consumes: `IssuesService.get` (for 404 checks on issue-scoped reads).
- Produces: `createRrwebReplaysRepo(db)` (save/attachToIssue/getSummary/get/getForIssue/listByIssue), `createReplaysService(db, issues): ReplaysService` with `save(appId, body)` (400 if no events), `listByIssue(issueId, limit)` (404 if issue missing), `getForIssue(issueId, replayId)` (404), `attachToIssue(...)`. `createReplaysRouter(deps: { replaysService }): Router`.

- [ ] **Step 1: Write the failing test**

`server/src/tests/replays.routes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Database } from 'better-sqlite3'
import { openDb } from '../db.js'
import { createResponseMiddleware } from '../middlewares/response.js'
import { createGlobalErrorHandlerMiddleware } from '../middlewares/error.js'
import { createReplaysRouter } from '../domains/replays/routes.js'
import { createReplaysService } from '../domains/replays/service.js'
import { createIssuesService } from '../domains/issues/service.js'
import { createAppsRepo } from '../domains/apps/db.js'
import { createBroadcaster } from '../ws/broadcaster.js'

let app: express.Express
let appId: string
let issueId: string
beforeEach(() => {
  const db: Database = openDb(':memory:')
  const apps = createAppsRepo(db)
  const created = apps.create({ name: 'A', repoUrl: 'git@x:a', defaultBranch: 'main' })
  appId = created.id
  const issues = createIssuesService(db, createBroadcaster())
  const { issue } = issues.ingestEvent(created.id, { type: 'error', exception: { values: [{ type: 'E', value: 'x' }] } })
  issueId = issue.id
  const replaysService = createReplaysService(db, issues)
  app = express()
  app.use(express.json({ limit: '6mb' }))
  app.use(createResponseMiddleware())
  app.use(createReplaysRouter({ replaysService }))
  app.use(createGlobalErrorHandlerMiddleware())
})

describe('replays routes', () => {
  it('POST /api/ingest/rrweb/:appId 400 when events missing', async () => {
    const r = await request(app).post(`/api/ingest/rrweb/${appId}`).send({ events: [] })
    expect(r.status).toBe(400)
  })

  it('POST /api/ingest/rrweb/:appId 201 and GET list', async () => {
    const r = await request(app).post(`/api/ingest/rrweb/${appId}`).send({ events: [{ type: 2 } as any] })
    expect(r.status).toBe(201)
    const list = await request(app).get(`/api/issues/${issueId}/replays`)
    expect(list.status).toBe(200)
    expect(list.body.data).toHaveLength(0)
  })

  it('GET /api/issues/:id/replays 404 when issue missing', async () => {
    const r = await request(app).get('/api/issues/nope/replays')
    expect(r.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ./server exec vitest run src/tests/replays.routes.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `server/src/domains/replays/db.ts`**

Verbatim copy of `server/src/store/replays.ts` (`createRrwebReplaysRepo` with rowToSummary, rowToReplay, save, attachToIssue, getSummary, get, getForIssue, listByIssue — unchanged).

```ts
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { RrwebReplay, RrwebReplayIngestBody, RrwebReplaySummary } from '@traceability/protocol'

export function createRrwebReplaysRepo(db: Database) {
  const rowToSummary = (r: Record<string, unknown>): RrwebReplaySummary => ({
    id: r.id as string,
    appId: r.app_id as string,
    issueId: (r.issue_id as string | null) ?? undefined,
    sentryEventId: (r.sentry_event_id as string | null) ?? undefined,
    receivedAt: r.received_at as string,
    capturedAt: (r.captured_at as string | null) ?? undefined,
    startAt: (r.start_at as number | null) ?? undefined,
    endAt: (r.end_at as number | null) ?? undefined,
    eventCount: r.event_count as number,
    sizeBytes: r.size_bytes as number,
    metadata: JSON.parse(r.metadata as string) as Record<string, unknown>,
  })

  const rowToReplay = (r: Record<string, unknown>): RrwebReplay => ({ ...rowToSummary(r), events: JSON.parse(r.payload as string) as unknown[] })

  return {
    save(appId: string, body: RrwebReplayIngestBody): RrwebReplay {
      const replayId = body.replayId ?? randomUUID()
      const payload = JSON.stringify(body.events)
      const now = new Date().toISOString()
      const metadata = JSON.stringify(body.metadata ?? {})
      db.prepare(
        `INSERT INTO rrweb_replays (id, app_id, sentry_event_id, received_at, captured_at, start_at, end_at, event_count, size_bytes, payload, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET app_id = excluded.app_id, sentry_event_id = COALESCE(excluded.sentry_event_id, rrweb_replays.sentry_event_id), received_at = excluded.received_at, captured_at = excluded.captured_at, start_at = excluded.start_at, end_at = excluded.end_at, event_count = excluded.event_count, size_bytes = excluded.size_bytes, payload = excluded.payload, metadata = excluded.metadata`,
      ).run(replayId, appId, body.sentryEventId ?? null, now, body.capturedAt ?? null, body.startAt ?? null, body.endAt ?? null, body.events.length, Buffer.byteLength(payload, 'utf8'), payload, metadata)
      return this.get(replayId)!
    },

    attachToIssue(replayId: string, issueId: string, appId: string, sentryEventId?: string): RrwebReplaySummary {
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO rrweb_replays (id, app_id, issue_id, sentry_event_id, received_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET app_id = excluded.app_id, issue_id = excluded.issue_id, sentry_event_id = COALESCE(rrweb_replays.sentry_event_id, excluded.sentry_event_id)`,
      ).run(replayId, appId, issueId, sentryEventId ?? null, now)
      return this.getSummary(replayId)!
    },

    getSummary(id: string): RrwebReplaySummary | undefined {
      const row = db.prepare('SELECT * FROM rrweb_replays WHERE id = ?').get(id) as Record<string, unknown> | undefined
      return row ? rowToSummary(row) : undefined
    },

    get(id: string): RrwebReplay | undefined {
      const row = db.prepare('SELECT * FROM rrweb_replays WHERE id = ?').get(id) as Record<string, unknown> | undefined
      return row ? rowToReplay(row) : undefined
    },

    getForIssue(issueId: string, replayId: string): RrwebReplay | undefined {
      const row = db.prepare('SELECT * FROM rrweb_replays WHERE issue_id = ? AND id = ?').get(issueId, replayId) as Record<string, unknown> | undefined
      return row ? rowToReplay(row) : undefined
    },

    listByIssue(issueId: string, limit = 20): RrwebReplaySummary[] {
      const rows = db.prepare('SELECT * FROM rrweb_replays WHERE issue_id = ? ORDER BY received_at DESC LIMIT ?').all(issueId, Math.min(limit, 100)) as Array<Record<string, unknown>>
      return rows.map(rowToSummary)
    },
  }
}
```

- [ ] **Step 4: Create `server/src/domains/replays/service.ts`**

```ts
import type { Database } from 'better-sqlite3'
import type { RrwebReplay, RrwebReplayIngestBody, RrwebReplaySummary } from '@traceability/protocol'
import { createRrwebReplaysRepo } from './db.js'
import { AppError } from '../../errors/app-error.js'
import type { IssuesService } from '../issues/service.js'

export interface ReplaysService {
  save(appId: string, body: RrwebReplayIngestBody | undefined): RrwebReplay
  listByIssue(issueId: string, limit?: number): RrwebReplaySummary[]
  getForIssue(issueId: string, replayId: string): RrwebReplay
  attachToIssue(replayId: string, issueId: string, appId: string, sentryEventId?: string): RrwebReplaySummary
}

export function createReplaysService(db: Database, issues: IssuesService): ReplaysService {
  const repo = createRrwebReplaysRepo(db)
  return {
    save: (appId, body) => {
      if (!body || !Array.isArray(body.events) || body.events.length === 0) {
        throw new AppError('events required', 400, 400)
      }
      return repo.save(appId, body)
    },
    listByIssue: (issueId, limit) => {
      issues.get(issueId) // throws 404 if missing
      return repo.listByIssue(issueId, limit)
    },
    getForIssue: (issueId, replayId) => {
      issues.get(issueId) // throws 404 if missing
      const replay = repo.getForIssue(issueId, replayId)
      if (!replay) throw new AppError('not found', 404, 404)
      return replay
    },
    attachToIssue: (replayId, issueId, appId, sentryEventId) => repo.attachToIssue(replayId, issueId, appId, sentryEventId),
  }
}
```

- [ ] **Step 5: Create `server/src/domains/replays/routes.ts`**

```ts
import { Router } from 'express'
import type { ReplaysService } from './service.js'

interface ReplaysRouterDeps {
  replaysService: ReplaysService
}

export function createReplaysRouter(deps: ReplaysRouterDeps): Router {
  const router = Router()
  const { replaysService } = deps

  /** @openapi /api/ingest/rrweb/{appId}: post: { tags: [Replays], summary: Ingest an rrweb replay, responses: { 201: {description: saved}, 400: {description: no events} } } */
  router.post('/api/ingest/rrweb/:appId', (req, res) => {
    res.success(replaysService.save(req.params.appId, req.body), 201)
  })

  /** @openapi /api/issues/{id}/replays: get: { tags: [Replays], responses: { 200: {description: ok}, 404: {description: not found} } } */
  router.get('/api/issues/:id/replays', (req, res) => {
    res.success(replaysService.listByIssue(req.params.id, req.query.limit ? Number(req.query.limit) : undefined))
  })

  /** @openapi /api/issues/{id}/replays/{replayId}: get: { tags: [Replays], responses: { 200: {description: ok}, 404: {description: not found} } } */
  router.get('/api/issues/:id/replays/:replayId', (req, res) => {
    res.success(replaysService.getForIssue(req.params.id, req.params.replayId))
  })

  return router
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter ./server exec vitest run src/tests/replays.routes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/domains/replays server/src/tests/replays.routes.test.ts
git commit -m "feat(server): add replays domain (db + service + routes)"
```

---

### Task 12: Domain — performance (db + service + routes)

**Files:**
- Create: `server/src/domains/performance/db.ts` (from `store/performance.ts`), `server/src/domains/performance/service.ts`, `server/src/domains/performance/routes.ts`
- Test: `server/src/tests/performance.routes.test.ts`

**Interfaces:**
- Consumes: `AppsService.get` (for 404 app check on record).
- Produces: `createPerformanceRepo(db)` (record/summary), `createPerformanceService(db, apps): PerformanceService` with `record(appId, metrics)` (404 if app missing), `summary(opts)`. `createPerformanceRouter(deps: { performanceService }): Router`.

- [ ] **Step 1: Write the failing test**

`server/src/tests/performance.routes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Database } from 'better-sqlite3'
import { openDb } from '../db.js'
import { createResponseMiddleware } from '../middlewares/response.js'
import { createGlobalErrorHandlerMiddleware } from '../middlewares/error.js'
import { createPerformanceRouter } from '../domains/performance/routes.js'
import { createPerformanceService } from '../domains/performance/service.js'
import { createAppsService } from '../domains/apps/service.js'
import { createSourceMapsService } from '../domains/source-maps/service.js'

let app: express.Express
let appId: string
beforeEach(() => {
  const db: Database = openDb(':memory:')
  const appsService = createAppsService(db, createSourceMapsService(db))
  appId = appsService.create({ name: 'A', repoUrl: 'git@x:a', defaultBranch: 'main' }).id
  const performanceService = createPerformanceService(db, appsService)
  app = express()
  app.use(express.json())
  app.use(createResponseMiddleware())
  app.use(createPerformanceRouter({ performanceService }))
  app.use(createGlobalErrorHandlerMiddleware())
})

describe('performance routes', () => {
  it('POST /api/ingest/performance/:appId 404 when app missing', async () => {
    const r = await request(app).post('/api/ingest/performance/nope').send({ name: 'LCP', value: 1 })
    expect(r.status).toBe(404)
  })

  it('POST /api/ingest/performance/:appId 202 and GET summary', async () => {
    const r = await request(app).post(`/api/ingest/performance/${appId}`).send({ name: 'LCP', value: 1200 })
    expect(r.status).toBe(202)
    expect(r.body.data).toEqual({ accepted: 1 })
    const s = await request(app).get(`/api/performance?appId=${appId}`)
    expect(s.status).toBe(200)
    expect(s.body.data.apps[0].metrics.LCP.count).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ./server exec vitest run src/tests/performance.routes.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `server/src/domains/performance/db.ts`**

Verbatim copy of `server/src/store/performance.ts` (`createPerformanceRepo` with record + summary — unchanged, full body).

```ts
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { PerformanceAppSummary, PerformanceMetric, PerformanceMetricSummary, PerformanceSummary } from '@traceability/protocol'

interface PerformanceRow { app_id: string; app_name: string; metric: string; value: number; unit: string; measured_at: string }
interface ApplicationRow { id: string; name: string }

export function createPerformanceRepo(db: Database) {
  return {
    record(appId: string, metrics: PerformanceMetric[]): number {
      const statement = db.prepare(`INSERT INTO performance_samples (id, app_id, metric, value, unit, measured_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      const write = db.transaction((items: PerformanceMetric[]) => {
        let accepted = 0
        for (const item of items) {
          if (!item || typeof item.name !== 'string' || !item.name.trim() || !Number.isFinite(item.value)) continue
          statement.run(randomUUID(), appId, item.name.trim().slice(0, 80), item.value, item.unit ?? 'millisecond', item.timestamp ?? new Date().toISOString(), JSON.stringify(item.context ?? {}))
          accepted += 1
        }
        return accepted
      })
      return write(metrics)
    },

    summary(opts: { appId?: string; hours?: number }): PerformanceSummary {
      const hours = Math.max(1, Math.min(opts.hours ?? 24, 24 * 30))
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
      const where = opts.appId ? 'WHERE p.measured_at >= ? AND p.app_id = ?' : 'WHERE p.measured_at >= ?'
      const params = opts.appId ? [since, opts.appId] : [since]
      const rows = db.prepare(`SELECT p.app_id, a.name AS app_name, p.metric, p.value, p.unit, p.measured_at FROM performance_samples p JOIN applications a ON a.id = p.app_id ${where} ORDER BY p.measured_at DESC LIMIT 10000`).all(...params) as PerformanceRow[]

      const apps = new Map<string, { appId: string; appName: string; samples: number; values: Map<string, PerformanceRow[]> }>()
      for (const row of rows) {
        let a = apps.get(row.app_id)
        if (!a) { a = { appId: row.app_id, appName: row.app_name, samples: 0, values: new Map() }; apps.set(row.app_id, a) }
        a.samples += 1
        const values = a.values.get(row.metric) ?? []
        values.push(row)
        a.values.set(row.metric, values)
      }

      const applicationRows = db.prepare(opts.appId ? 'SELECT id, name FROM applications WHERE id = ?' : 'SELECT id, name FROM applications').all(...(opts.appId ? [opts.appId] : [])) as ApplicationRow[]
      for (const application of applicationRows) {
        if (!apps.has(application.id)) apps.set(application.id, { appId: application.id, appName: application.name, samples: 0, values: new Map() })
      }

      const result: PerformanceAppSummary[] = [...apps.values()].map((a) => {
        const metrics: Record<string, PerformanceMetricSummary> = {}
        for (const [name, rowsForMetric] of a.values) {
          const values = rowsForMetric.map((row) => row.value).sort((x, y) => x - y)
          const count = values.length
          const p75Index = Math.max(0, Math.ceil(count * 0.75) - 1)
          metrics[name] = { count, average: values.reduce((t, v) => t + v, 0) / count, p75: values[p75Index] ?? 0, lastSeen: rowsForMetric[0]!.measured_at, unit: rowsForMetric[0]!.unit }
        }
        return { appId: a.appId, appName: a.appName, samples: a.samples, metrics }
      })

      return { since, apps: result.sort((a, b) => a.appName.localeCompare(b.appName)) }
    },
  }
}
```

- [ ] **Step 4: Create `server/src/domains/performance/service.ts`**

```ts
import type { Database } from 'better-sqlite3'
import type { PerformanceMetric, PerformanceSummary } from '@traceability/protocol'
import { createPerformanceRepo } from './db.js'
import { AppError } from '../../errors/app-error.js'
import type { AppsService } from '../apps/service.js'

export interface PerformanceService {
  record(appId: string, body: PerformanceMetric | { metrics?: PerformanceMetric[] }): { accepted: number }
  summary(opts: { appId?: string; hours?: number }): PerformanceSummary
}

export function createPerformanceService(db: Database, apps: AppsService): PerformanceService {
  const repo = createPerformanceRepo(db)
  return {
    record: (appId, body) => {
      apps.get(appId) // throws 404 if missing
      const metrics: PerformanceMetric[] = body && typeof body === 'object' && 'metrics' in body ? (body.metrics ?? []) : [body as PerformanceMetric]
      return { accepted: repo.record(appId, metrics) }
    },
    summary: (opts) => repo.summary(opts),
  }
}
```

- [ ] **Step 5: Create `server/src/domains/performance/routes.ts`**

```ts
import { Router } from 'express'
import type { PerformanceService } from './service.js'

interface PerformanceRouterDeps {
  performanceService: PerformanceService
}

export function createPerformanceRouter(deps: PerformanceRouterDeps): Router {
  const router = Router()
  const { performanceService } = deps

  /** @openapi /api/ingest/performance/{appId}: post: { tags: [Performance], summary: Ingest performance metrics, responses: { 202: {description: accepted}, 404: {description: app not found} } } */
  router.post('/api/ingest/performance/:appId', (req, res) => {
    res.success(performanceService.record(req.params.appId, req.body), 202)
  })

  /** @openapi /api/performance: get: { tags: [Performance], summary: Performance summary, responses: { 200: {description: ok} } } */
  router.get('/api/performance', (req, res) => {
    res.success(performanceService.summary({
      appId: req.query.appId as string | undefined,
      hours: req.query.hours ? Number(req.query.hours) : undefined,
    }))
  })

  return router
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter ./server exec vitest run src/tests/performance.routes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/domains/performance server/src/tests/performance.routes.test.ts
git commit -m "feat(server): add performance domain (db + service + routes)"
```

---

### Task 13: Domain — ingest (service + routes)

**Files:**
- Create: `server/src/domains/ingest/service.ts`, `server/src/domains/ingest/routes.ts` (`envelope.ts` already created in Task 10 Step 6)
- Test: `server/src/tests/ingest.routes.test.ts`

**Interfaces:**
- Consumes: `IssuesService.ingestEvent`/`appendEvent`, `SourceMapsService.resolveFrames`, `ReplaysService.attachToIssue`, `Broadcaster`.
- Produces: `createIngestService(deps): { ingestEnvelope(appId, raw): { accepted: number } }` (400 on invalid envelope), `createIngestRouter(deps): Router`. Route uses `express.text({ type: ['application/octet-stream','text/plain'], limit: '2mb' })`.

- [ ] **Step 1: Write the failing test**

`server/src/tests/ingest.routes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import type { Database } from 'better-sqlite3'
import { openDb } from '../db.js'
import { createResponseMiddleware } from '../middlewares/response.js'
import { createGlobalErrorHandlerMiddleware } from '../middlewares/error.js'
import { createIngestRouter } from '../domains/ingest/routes.js'
import { createIngestService } from '../domains/ingest/service.js'
import { createIssuesService } from '../domains/issues/service.js'
import { createReplaysService } from '../domains/replays/service.js'
import { createSourceMapsService } from '../domains/source-maps/service.js'
import { createAppsRepo } from '../domains/apps/db.js'
import { createBroadcaster } from '../ws/broadcaster.js'

let app: express.Express
let appId: string
beforeEach(() => {
  const db: Database = openDb(':memory:')
  const apps = createAppsRepo(db)
  appId = apps.create({ name: 'A', repoUrl: 'git@x:a', defaultBranch: 'main' }).id
  const issues = createIssuesService(db, createBroadcaster())
  const replays = createReplaysService(db, issues)
  const sourceMaps = createSourceMapsService(db)
  const ingestService = createIngestService({ issues, replays, sourceMaps, broadcaster: createBroadcaster() })
  app = express()
  app.use(createResponseMiddleware())
  app.use(createIngestRouter({ ingestService }))
  app.use(createGlobalErrorHandlerMiddleware())
})

function envelope(): string {
  const header = JSON.stringify({ event_id: 'e1', sent_at: new Date().toISOString() })
  const itemHeader = JSON.stringify({ type: 'event' })
  const itemPayload = JSON.stringify({ event_id: 'e1', type: 'error', exception: { values: [{ type: 'TypeError', value: 'boom' }] } })
  return [header, itemHeader, itemPayload].join('\n')
}

describe('ingest routes', () => {
  it('POST /api/ingest/envelope/:appId 400 on invalid envelope', async () => {
    const r = await request(app).post(`/api/ingest/envelope/${appId}`).set('Content-Type', 'application/octet-stream').send('not-json')
    expect(r.status).toBe(400)
  })

  it('POST /api/ingest/envelope/:appId 202 and creates an issue', async () => {
    const r = await request(app).post(`/api/ingest/envelope/${appId}`).set('Content-Type', 'application/octet-stream').send(envelope())
    expect(r.status).toBe(202)
    expect(r.body.data).toEqual({ accepted: 1 })
  })

  it('rejects empty body with 400', async () => {
    const r = await request(app).post(`/api/ingest/envelope/${appId}`).set('Content-Type', 'application/octet-stream').send('')
    expect(r.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ./server exec vitest run src/tests/ingest.routes.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `server/src/domains/ingest/service.ts`**

```ts
import { parseEnvelope, filterSupportedItems } from './envelope.js'
import type { SentryEventPayload } from '@traceability/protocol'
import { AppError } from '../../errors/app-error.js'
import type { IssuesService } from '../issues/service.js'
import type { ReplaysService } from '../replays/service.js'
import type { SourceMapsService } from '../source-maps/service.js'
import type { Broadcaster } from '../../ws/broadcaster.js'

export interface IngestService {
  ingestEnvelope(appId: string, raw: string): { accepted: number }
}

export interface IngestDeps {
  issues: IssuesService
  replays: ReplaysService
  sourceMaps: SourceMapsService
  broadcaster: Broadcaster
}

function getRrwebReplayId(extra: Record<string, unknown> | undefined): string | undefined {
  const replayId = extra?.rrwebReplayId
  return typeof replayId === 'string' && replayId.length > 0 ? replayId : undefined
}

export function createIngestService(deps: IngestDeps): IngestService {
  return {
    ingestEnvelope(appId, raw) {
      if (!raw || typeof raw !== 'string') throw new AppError('empty body', 400, 400)
      let envelope
      try {
        envelope = parseEnvelope(raw)
      } catch {
        throw new AppError('invalid envelope', 400, 400)
      }
      const supported = filterSupportedItems(envelope)
      for (const { payload } of supported) {
        const frames = (payload as SentryEventPayload).exception?.values?.[0]?.stacktrace?.frames ?? []
        const resolvedFrames = deps.sourceMaps.resolveFrames(appId, (payload as SentryEventPayload).release, frames)
        const { issue, created } = deps.issues.ingestEvent(appId, payload as SentryEventPayload, resolvedFrames)
        deps.issues.appendEvent(issue.id, raw)
        const replayId = getRrwebReplayId((payload as SentryEventPayload).extra)
        if (replayId) deps.replays.attachToIssue(replayId, issue.id, appId, (payload as SentryEventPayload).event_id)
        deps.broadcaster.broadcast({ kind: created ? 'issue:created' : 'issue:updated', appId: issue.appId, issueId: issue.id, payload: issue })
      }
      return { accepted: supported.length }
    },
  }
}
```

- [ ] **Step 4: Create `server/src/domains/ingest/routes.ts`**

```ts
import { Router } from 'express'
import type { IngestService } from './service.js'

interface IngestRouterDeps {
  ingestService: IngestService
}

export function createIngestRouter(deps: IngestRouterDeps): Router {
  const router = Router()
  const { ingestService } = deps

  /**
   * @openapi
   * /api/ingest/envelope/{appId}:
   *   post:
   *     tags: [Ingest]
   *     summary: Ingest a Sentry envelope
   *     requestBody: { required: true, content: { application/octet-stream: { schema: { type: string } } } }
   *     responses: { 202: { description: accepted }, 400: { description: invalid envelope } }
   */
  router.post('/api/ingest/envelope/:appId', (req, res) => {
    res.success(ingestService.ingestEnvelope(req.params.appId, req.body), 202)
  })

  return router
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter ./server exec vitest run src/tests/ingest.routes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/domains/ingest/service.ts server/src/domains/ingest/routes.ts server/src/tests/ingest.routes.test.ts
git commit -m "feat(server): add ingest domain (service + routes)"
```

---

### Task 14: Cutover — Express entrypoint, swagger, delete old code

**Files:**
- Create: `server/src/middlewares/swagger.ts`, `server/src/routes/health.ts`
- Modify: `server/src/index.ts` (full rewrite)
- Delete: `server/src/api/`, `server/src/store/`, `server/src/ingest/`
- Modify: `server/src/tests/{db,issues,performance,replays,sourceMaps,envelope}.test.ts` (repoint imports)
- Modify: `server/package.json` (remove fastify deps)

**Interfaces:**
- Produces: a bootable Express server on `config.port` with `/health`, `/api-docs`, `/api-docs.json`, all domain routers, WS `/api/ws`, global error handler.

- [ ] **Step 1: Create `server/src/middlewares/swagger.ts`**

```ts
import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'
import type { Express } from 'express'

export interface SwaggerMiddlewareOptions {
  apiPaths: string[]
  docsRoute: string
  title: string
  version: string
  description: string
  serverUrl?: string
}

export function createSwaggerMiddleware(options: SwaggerMiddlewareOptions) {
  return (app: Express) => {
    const { apiPaths, docsRoute, title, version, description, serverUrl } = options
    const servers = serverUrl ? [{ url: serverUrl }] : [{ url: '/' }]
    const swaggerDocs = swaggerJsdoc({
      definition: { openapi: '3.0.0', info: { title, version, description }, servers },
      apis: apiPaths,
    })
    app.get(`${docsRoute}.json`, (_req, res) => res.json(swaggerDocs))
    app.use(docsRoute, swaggerUi.serve, swaggerUi.setup(swaggerDocs, { swaggerOptions: { persistAuthorization: true } }))
  }
}
```

- [ ] **Step 2: Create `server/src/routes/health.ts`**

```ts
import { Router } from 'express'

export const healthRouter: Router = Router()

/** @openapi /health: get: { tags: [Health], summary: Health check, responses: { 200: { description: ok } } } */
healthRouter.get('/health', (_req, res) => {
  res.success('ok')
})
```

- [ ] **Step 3: Rewrite `server/src/index.ts`**

```ts
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { createLogger, createRequestLoggerMiddleware, isMainModule } from './shared/index.js'
import { createSwaggerMiddleware } from './middlewares/swagger.js'
import { createResponseMiddleware } from './middlewares/response.js'
import { createGlobalErrorHandlerMiddleware } from './middlewares/error.js'
import { getConfig } from './config.js'
import { openDb } from './db.js'
import { createBroadcaster, attachWebSocket } from './ws/broadcaster.js'
import { healthRouter } from './routes/health.js'
import { createAppsRepo } from './domains/apps/db.js'
import { createIssuesRepo } from './domains/issues/db.js'
import { createRrwebReplaysRepo } from './domains/replays/db.js'
import { createPerformanceRepo } from './domains/performance/db.js'
import { createSourceMapsRepo } from './domains/source-maps/db.js'
import { createAppsService } from './domains/apps/service.js'
import { createIssuesService } from './domains/issues/service.js'
import { createReplaysService } from './domains/replays/service.js'
import { createPerformanceService } from './domains/performance/service.js'
import { createSourceMapsService } from './domains/source-maps/service.js'
import { createIngestService } from './domains/ingest/service.js'
import { createAppsRouter } from './domains/apps/routes.js'
import { createIssuesRouter } from './domains/issues/routes.js'
import { createReplaysRouter } from './domains/replays/routes.js'
import { createPerformanceRouter } from './domains/performance/routes.js'
import { createIngestRouter } from './domains/ingest/routes.js'

const isProduction = process.env.NODE_ENV === 'production'
const logger = createLogger('traceability-server')

const DEVELOPMENT_API_PATHS = ['./src/domains/**/routes.ts', './src/routes/**/*.ts']
const PRODUCTION_API_PATHS = ['./dist/domains/**/routes.js', './dist/routes/**/*.js']

function main() {
  const config = getConfig()
  const db = openDb(config.dbPath)
  const broadcaster = createBroadcaster()

  const appsRepo = createAppsRepo(db)
  const issuesRepo = createIssuesRepo(db)
  const replaysRepo = createRrwebReplaysRepo(db)
  const performanceRepo = createPerformanceRepo(db)
  const sourceMapsRepo = createSourceMapsRepo(db)

  const sourceMapsService = createSourceMapsService(db)
  const appsService = createAppsService(db, sourceMapsService)
  const issuesService = createIssuesService(db, broadcaster)
  const replaysService = createReplaysService(db, issuesService)
  const performanceService = createPerformanceService(db, appsService)
  const ingestService = createIngestService({ issues: issuesService, replays: replaysService, sourceMaps: sourceMapsService, broadcaster })

  const app = express()
  const server = createServer(app)

  app.use(createRequestLoggerMiddleware(logger))
  app.use(cors({ origin: true, credentials: false }))
  app.use(express.json({ limit: '6mb' }))
  app.use(createResponseMiddleware())

  createSwaggerMiddleware({
    apiPaths: isProduction ? PRODUCTION_API_PATHS : DEVELOPMENT_API_PATHS,
    docsRoute: '/api-docs',
    title: 'Traceability Server API',
    version: '1.0.0',
    description: 'Sentry-based web monitoring + exception-to-fix loop',
    serverUrl: process.env.SERVER_URL,
  })(app)

  app.use(healthRouter)
  app.use(createAppsRouter({ appsService }))
  app.use(createIssuesRouter({ issuesService }))
  app.use(createReplaysRouter({ replaysService }))
  app.use(createPerformanceRouter({ performanceService }))
  app.use(createIngestRouter({ ingestService }))

  app.use(createGlobalErrorHandlerMiddleware())

  attachWebSocket(server, broadcaster)

  server.listen(config.port, '0.0.0.0', () => {
    logger.info(`traceability server on http://0.0.0.0:${config.port}`)
    logger.info(`Swagger Docs at http://0.0.0.0:${config.port}/api-docs`)
  })
}

if (isMainModule(import.meta.url)) main()
```

- [ ] **Step 4: Repoint the old tests to the new domain paths**

In each of these files, change the import specifiers (no logic changes):

`server/src/tests/issues.test.ts`:
- `'../store/db.js'` → `'../db.js'`
- `'../store/apps.js'` → `'../domains/apps/db.js'`
- `'../store/issues.js'` → `'../domains/issues/db.js'`

`server/src/tests/performance.test.ts`:
- `'../store/db.js'` → `'../db.js'`
- `'../store/apps.js'` → `'../domains/apps/db.js'`
- `'../store/performance.js'` → `'../domains/performance/db.js'`

`server/src/tests/replays.test.ts`:
- `'../store/db.js'` → `'../db.js'`
- `'../store/apps.js'` → `'../domains/apps/db.js'`
- `'../store/issues.js'` → `'../domains/issues/db.js'`
- `'../store/replays.js'` → `'../domains/replays/db.js'`

`server/src/tests/envelope.test.ts`:
- `'../ingest/envelope.js'` → `'../domains/ingest/envelope.js'`

Do **not** touch `server/src/tests/sourceMaps.test.ts` (the original, camelCase): it is superseded by the new kebab-case `tests/source-maps.test.ts` from Task 8 and is deleted in Step 5. Do **not** touch `server/src/tests/db.test.ts`: Task 6 already overwrote it in place at the same path (it now imports `../db.js`).

- [ ] **Step 5: Delete the old Fastify code**

```bash
git rm -r server/src/api server/src/store server/src/ingest
git rm server/src/tests/sourceMaps.test.ts
```

- [ ] **Step 6: Remove fastify deps from `server/package.json`**

Remove these four lines from `dependencies`: `fastify`, `@fastify/cors`, `@fastify/multipart`, `@fastify/websocket` (all four were kept through Tasks 1-13 so the old Fastify code kept compiling; that code is now deleted in Step 5). Run `pnpm install`.

- [ ] **Step 7: Run the full server test suite + typecheck**

Run: `pnpm --filter ./server typecheck && pnpm --filter ./server test`
Expected: typecheck PASS; all tests PASS (shared, app-error, response, error, db, broadcaster, source-maps, apps.routes, issues.routes, replays.routes, performance.routes, ingest.routes, issues, performance, replays, envelope).

- [ ] **Step 8: Commit**

```bash
git add -A server
git commit -m "refactor(server): cutover to Express + domains; delete Fastify api/store/ingest"
```

---

### Task 15: HTTP integration smoke test (full app)

**Files:**
- Test: `server/src/tests/http.test.ts`

**Interfaces:**
- Produces: a supertest test that boots the real `index.ts` app factory against `:memory:` and asserts the envelope contract across `/health`, `/api/apps`, a 404, `/api-docs`, and `/api-docs.json`.

- [ ] **Step 1: Refactor `index.ts` to export a buildable app (TDD-friendly)**

Add an exported `createApp(db, broadcaster?)` factory below the imports, and have `main()` use it. This lets the test build the app without binding a port. Replace the body from `const app = express()` through the router registration + error handler with a function:

Insert before `function main()`:

```ts
export function createApp(db: ReturnType<typeof openDb>, broadcaster = createBroadcaster()) {
  const sourceMapsService = createSourceMapsService(db)
  const appsService = createAppsService(db, sourceMapsService)
  const issuesService = createIssuesService(db, broadcaster)
  const replaysService = createReplaysService(db, issuesService)
  const performanceService = createPerformanceService(db, appsService)
  const ingestService = createIngestService({ issues: issuesService, replays: replaysService, sourceMaps: sourceMapsService, broadcaster })

  const app = express()
  app.use(createRequestLoggerMiddleware(logger))
  app.use(cors({ origin: true, credentials: false }))
  app.use(express.json({ limit: '6mb' }))
  app.use(createResponseMiddleware())
  createSwaggerMiddleware({
    apiPaths: isProduction ? PRODUCTION_API_PATHS : DEVELOPMENT_API_PATHS,
    docsRoute: '/api-docs',
    title: 'Traceability Server API',
    version: '1.0.0',
    description: 'Sentry-based web monitoring + exception-to-fix loop',
    serverUrl: process.env.SERVER_URL,
  })(app)
  app.use(healthRouter)
  app.use(createAppsRouter({ appsService }))
  app.use(createIssuesRouter({ issuesService }))
  app.use(createReplaysRouter({ replaysService }))
  app.use(createPerformanceRouter({ performanceService }))
  app.use(createIngestRouter({ ingestService }))
  app.use(createGlobalErrorHandlerMiddleware())
  return app
}
```

And rewrite `main()` to:

```ts
function main() {
  const config = getConfig()
  const db = openDb(config.dbPath)
  const broadcaster = createBroadcaster()
  const app = createApp(db, broadcaster)
  const server = createServer(app)
  attachWebSocket(server, broadcaster)
  server.listen(config.port, '0.0.0.0', () => {
    logger.info(`traceability server on http://0.0.0.0:${config.port}`)
    logger.info(`Swagger Docs at http://0.0.0.0:${config.port}/api-docs`)
  })
}
```

Note: `createRequestLoggerMiddleware` uses AsyncLocalStorage; in the test, set `process.env.LOG_LEVEL = 'silent'` to keep output quiet (the test guard from Task 2 already avoids the pino-pretty transport under `NODE_ENV === 'test'`).

- [ ] **Step 2: Write the integration test**

`server/src/tests/http.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { openDb } from '../db.js'
import { createApp } from '../index.js'

const app = createApp(openDb(':memory:'))

describe('http integration', () => {
  it('GET /health returns 200 envelope', async () => {
    const r = await request(app).get('/health')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ code: 0, data: 'ok' })
  })

  it('GET /api/apps returns 200 envelope with array data', async () => {
    const r = await request(app).get('/api/apps')
    expect(r.status).toBe(200)
    expect(r.body.code).toBe(0)
    expect(Array.isArray(r.body.data)).toBe(true)
  })

  it('GET /api/apps/nope returns 404 envelope', async () => {
    const r = await request(app).get('/api/apps/nope')
    expect(r.status).toBe(404)
    expect(r.body).toMatchObject({ code: 404, data: null })
  })

  it('GET /api-docs serves the swagger UI (200)', async () => {
    const r = await request(app).get('/api-docs/')
    expect(r.status).toBe(200)
  })

  it('GET /api-docs.json exposes openapi paths', async () => {
    const r = await request(app).get('/api-docs.json')
    expect(r.status).toBe(200)
    expect(r.body.paths['/health']).toBeDefined()
    expect(r.body.paths['/api/apps']).toBeDefined()
  })
})
```

- [ ] **Step 3: Run the integration test**

Run: `pnpm --filter ./server exec vitest run src/tests/http.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 4: Run the whole suite once more**

Run: `pnpm --filter ./server test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/index.ts server/src/tests/http.test.ts
git commit -m "test(server): add http integration smoke test for full app"
```

---

### Task 16: Adapt consumers to the response envelope

**Files:**
- Modify: `app/src/renderer/lib/request.ts`
- Modify: `app/src/main/agent/monitor.ts`
- Modify: `packages/cli/src/lib/api.ts`

**Interfaces:**
- The server now wraps success bodies in `{code:0, data, timestamp}`. Consumers must read the inner `data`. `204` responses have no body (CLI already guards on `res.status === 204`). The renderer `apis/*.ts` and both app tests need NO change — they read `response.data` / mock past the interceptor and already assume the unwrapped shape.

- [ ] **Step 1: Add an unwrap interceptor to `app/src/renderer/lib/request.ts`**

Replace the success branch of `request.interceptors.response.use` so the inner `data` is surfaced:

```ts
import axios from 'axios'
import { SERVER_URL } from '@renderer/lib/server'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/**
 * Shared axios instance for the renderer.
 *
 * The backend wraps every success response in `{code, data, timestamp}`; this
 * interceptor unwraps it so callers read the inner `data` via `response.data`.
 * 204 responses carry no body and are left untouched. Errors are normalized into
 * {@link ApiError}; the server error envelope carries `message`, which the
 * interceptor reads directly.
 */
export const request = axios.create({ baseURL: SERVER_URL })

request.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body && typeof body === 'object' && 'code' in body && 'data' in body) {
      response.data = body.data
    }
    return response
  },
  (error) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0
      const payload = error.response?.data
      const message = typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.error === 'string'
          ? payload.error
          : error.message ?? 'request failed'
      return Promise.reject(new ApiError(status, message))
    }
    return Promise.reject(error)
  },
)
```

- [ ] **Step 2: Add the same unwrap interceptor to the agent's `createMonitorHttp` in `app/src/main/agent/monitor.ts`**

Replace the `createMonitorHttp` function (lines ~162–165) with:

```ts
export function createMonitorHttp(): AxiosInstance {
  const serverUrl = (import.meta.env.VITE_SERVER_URL ?? '').replace(/\/$/, '')
  const http = axios.create({ baseURL: serverUrl })
  // The server wraps success responses in {code, data, timestamp}; unwrap so
  // `.then(r => r.data)` yields the inner data for zod validation.
  http.interceptors.response.use((response) => {
    const body = response.data
    if (body && typeof body === 'object' && 'code' in body && 'data' in body) {
      response.data = body.data
    }
    return response
  })
  return http
}
```

- [ ] **Step 3: Unwrap in the CLI `packages/cli/src/lib/api.ts`**

Replace the `return (await res.json()) as T` line (and keep the 204 guard above it):

```ts
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const cfg = getConfig()
  const res = await fetch(`${cfg.server.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      // Only send Content-Type: application/json when there is a body.
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  const envelope = (await res.json()) as { code: number; data: T }
  return envelope.data
}
```

- [ ] **Step 4: Typecheck + test the app**

Run: `pnpm --filter ./app typecheck && pnpm --filter ./app test`
Expected: typecheck PASS; `monitor.test.ts` and `agent-runtime.test.ts` PASS (both mock past the interceptor and already assume the unwrapped shape).

- [ ] **Step 5: Typecheck the CLI**

Run: `pnpm --filter ./packages/cli typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/renderer/lib/request.ts app/src/main/agent/monitor.ts packages/cli/src/lib/api.ts
git commit -m "feat(app,cli): unwrap neon response envelope on the client side"
```

---

### Task 17: Final verification + memory update

**Files:**
- Modify: `/Users/evan/.claude/projects/-Users-evan-Desktop-inspiration-traceability/memory/MEMORY.md` + new memory file

- [ ] **Step 1: Full repo typecheck + test**

Run: `pnpm --filter ./server typecheck && pnpm --filter ./server test && pnpm --filter ./app typecheck && pnpm --filter ./app test && pnpm --filter ./packages/cli typecheck`
Expected: all PASS.

- [ ] **Step 2: Build the server**

Run: `pnpm --filter ./server build`
Expected: `dist/` emitted with `dist/domains/**/routes.js` (comments preserved for swagger) and no errors.

- [ ] **Step 3: Manual dev smoke (optional but recommended)**

Run: `pnpm --filter ./server dev` (starts on port 3000). In another shell:
- `curl -s localhost:3000/health` → `{"code":0,"data":"ok",...}`
- `curl -s localhost:3000/api/apps` → `{"code":0,"data":[],...}`
- open `http://localhost:3000/api-docs` in a browser → Swagger UI renders with Apps/Issues/Replays/Performance/Ingest/Health tags.
Stop the dev server.

- [ ] **Step 4: Update memory**

Create `/Users/evan/.claude/projects/-Users-evan-Desktop-inspiration-traceability/memory/server-express-domains.md`:

```markdown
---
name: server-express-domains
description: server migrated to Express + domains/ layout, neon api-gateway aligned, response envelope {code,data,timestamp}
metadata:
  type: project
---

`@traceability/server` is an Express app (was Fastify) mirroring neon-server `packages/api-gateway`: `domains/<module>/{db.ts,service.ts,routes.ts}`, vendored `shared/` (pino logger + traceId), `middlewares/` (swagger/response/error), `errors/AppError`. Success responses are wrapped `{code:0,data,timestamp}` via `res.success(data,status?)`; errors `{code,message,data:null,timestamp,traceId}`. WebSocket `/api/ws` served via `ws` on the same HTTP server. SQLite unchanged. No auth (MVP). Clients unwrap `.data`: renderer `lib/request.ts` + agent `monitor.ts` axios interceptors, CLI `lib/api.ts` reads `envelope.data`. Relates to [[renderer-apis-organization]].
```

Add to `MEMORY.md`:
```
- [Server Express + domains](server-express-domains.md) - server is Express, neon-aligned, {code,data,timestamp} envelope, clients unwrap .data
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore(server): finalize Express refactor, update memory"
```

---

## Self-Review

**1. Spec coverage:**
- "技术栈/架构对齐 api-gateway" → Tasks 2–5, 14 (Express, pino, swagger, response/error middlewares, isMainModule). ✓
- "不同服务在 src 新增 domains/<功能模块>/{db.ts, service.ts, ...}" → Tasks 8–13 (source-maps, apps, issues, replays, performance, ingest). ✓
- "复用 neon 基础服务能力：中间件, swagger, 全局异常处理" → Tasks 2, 4, 5, 14 (swagger). ✓
- Decision: adopt neon envelope fully → Task 4 (res.success), Task 5 (error envelope), Task 16 (consumer unwrap). ✓
- Decision: vendor into server (no @neon-server/shared dep) → Task 2 (shared/), Tasks 4/5/14 (middlewares/errors vendored). ✓
- Preserve endpoints, status codes, WS, SQLite → Tasks 9–15. ✓

**2. Placeholder scan:** No "TBD/TODO/implement later". Every code step shows full code. Relocation steps explicitly say "verbatim copy of <file>" and then reproduce the full content. ✓

**3. Type consistency:**
- `createAppsService(db, sourceMaps)` — Task 9 defines; Task 12 (performance) calls with `createSourceMapsService(db)` + `createAppsService(db, …)`. ✓
- `createIssuesService(db, broadcaster)` — Task 10 defines; Tasks 11, 13, 15 call identically. ✓
- `createReplaysService(db, issues)` — Task 11 defines; Task 13 (ingest) + Task 15 call identically. ✓
- `createIngestService({ issues, replays, sourceMaps, broadcaster })` — Task 13 defines; Task 15 calls identically. ✓
- `res.success(data, status?)` — defined Task 4, used consistently Tasks 9–15. ✓
- `Broadcaster` / `IssueEvent` — Task 7 defines; Tasks 10, 13 consume. ✓
- `AppError(message, statusCode, code?)` — Task 3 defines; used consistently. ✓
- Router factory names `createXxxRouter({ xxxService })` — consistent across Tasks 9–13 and `index.ts` (Task 14). ✓
