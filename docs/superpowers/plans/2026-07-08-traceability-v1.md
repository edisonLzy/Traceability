# Traceability v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Sentry-based web/electron/mf monitoring SDK + self-hosted server + Inbox UI + CLI + agent skills that form an exception-to-fix loop.

**Architecture:** `packages/core` is a thin wrapper over `@sentry/browser` with self-built integrations (white-screen/MF guard/CORS diagnostic) and a transport pointing to a self-hosted `server/`. The server ingests Sentry envelopes (v7), aggregates issues, manages applications, and exposes REST + WebSocket APIs. `app/` is an Inbox UI. `packages/cli` is a command-line client to the server (used by coding agents). `packages/skills` teaches agents how to instrument code with the SDK.

**Tech Stack:** TypeScript (strict), pnpm workspace, Node.js 20+, Fastify (server), `@sentry/browser`/`@sentry/react`/`@sentry/electron` (SDK core), better-sqlite3 (v1 storage), React 19 + Vite (app UI), commander (CLI), vitest (tests).

**Spec:** `docs/superpowers/specs/2026-07-08-traceability-v1-design.md`
**App design source of truth:** `docs/prototype/index.html` (AI-generated Inbox prototype). The `app/` package MUST reproduce this design.

## Global Constraints

- Node.js >= 20
- pnpm >= 10.30 (root `packageManager` already pinned to `pnpm@10.30.3`). pnpm is the ONLY package manager; never run `npm install` or `yarn`.
- TypeScript strict mode (`strict: true`) in every `tsconfig.json`
- Monorepo packages referenced by workspace protocol (`"@traceability/core": "workspace:*"`).
- Public package scope: `@traceability/*` (core, react, electron, cli).
- Every package exposes an `index.ts` barrel; builds via `tsc` (ESM `dist/`); tests via `vitest`.
- Commits: one logical change per commit; commit message prefix `feat:`/`fix:`/`test:`/`docs:`/`chore:`.
- v1 storage = SQLite via `better-sqlite3`. DB file at `server/data/traceability.db` (gitignored).
- v1 auth = single static API token read from env `TRACEABILITY_API_TOKEN`.
- SDK must NOT couple to business semantics (no `monitor.business.*`).
- Server ingests only Sentry envelope items of type `error` / `transaction` / `message`; others are dropped.
- SDK transport posts to `${serverUrl}/api/ingest/envelope/${appId}`.
- **App UI fidelity:** `app/` must match `docs/prototype/index.html` visually - same CSS variables, same component classes (`.panel`, `.data-table`, `.badge`, `.app-card`, `.tabs`, `.timeline`, `.command`, `.modal`, `.toast`, `.palette`), same dark color scheme. Port the prototype's `<style>` block into `app/src/styles.css` and reuse the class names rather than inventing new inline styles.

---

## File Structure

```
traceability/
├── package.json                      # root workspace
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── types.ts
│   │   │   ├── transport/serverTransport.ts
│   │   │   └── integrations/
│   │   │       ├── whiteScreen.ts
│   │   │       ├── mfGuard.ts
│   │   │       └── corsDiagnostic.ts
│   │   └── tests/
│   │       ├── transport.test.ts
│   │       └── integrations.test.ts
│   ├── react/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── ErrorBoundary.tsx
│   │       └── hooks.ts
│   ├── electron/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── main.ts
│   │       ├── renderer.ts
│   │       └── preload.ts
│   ├── cli/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── lib/api.ts
│   │       ├── lib/output.ts
│   │       ├── lib/config.ts
│   │       └── commands/
│   │           ├── config.ts
│   │           ├── app.ts
│   │           └── issue.ts
│   └── skills/
│       ├── instrumentation/
│       │   ├── SKILL.md
│       │   ├── README.md
│       │   ├── references/core-api.md
│       │   ├── references/event-types.md
│       │   └── assets/templates/report-event.ts
│       ├── diagnose-issue/
│       │   ├── SKILL.md
│       │   ├── README.md
│       │   └── scripts/fetch-issue.sh
│       └── add-boundary/
│           ├── SKILL.md
│           └── README.md
├── app/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── styles.css                 # ported verbatim from docs/prototype/index.html <style>
│       ├── api/client.ts
│       ├── ws/client.ts
│       ├── auth/token.ts
│       ├── components/
│       │   ├── Layout.tsx             # sidebar + topbar shell matching prototype
│       │   ├── IssueStatusBadge.tsx
│       │   ├── Toast.tsx              # .toast context
│       │   └── ui/                    # primitive components mapping prototype classes
│       │       ├── Button.tsx         # .btn / .btn-primary / .btn-danger / .btn-sm
│       │       ├── Panel.tsx          # .panel + .panel-head
│       │       ├── Badge.tsx          # .badge + .dot
│       │       ├── Modal.tsx          # .modal-backdrop + .modal + .field
│       │       └── CommandPalette.tsx # .palette (⌘K)
│       └── pages/
│           ├── Login.tsx
│           ├── Issues.tsx             # metrics + toolbar + .data-table
│           ├── Apps.tsx               # .app-grid cards
│           ├── AppDetail.tsx          # .detail-grid info-list + side-panel
│           ├── IssueDetail.tsx        # .tabs (stack/events/context/breadcrumbs) + side-panel
│           ├── FixSession.tsx         # .command + .patch-file + .timeline
│           └── Settings.tsx           # SDK setup code snippet
├── examples/
│   ├── web-demo/                      # vanilla Vite app integrating @traceability/core
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   └── src/main.ts
│   └── README.md                      # how to run each demo against a local server
└── server/
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── data/.gitkeep
    └── src/
        ├── index.ts
        ├── config.ts
        ├── auth/token.ts
        ├── store/db.ts
        ├── store/migrations.ts
        ├── ingest/envelope.ts
        ├── ws/broadcaster.ts
        ├── api/apps.ts
        ├── api/issues.ts
        ├── api/patches.ts
        ├── api/index.ts
        └── tests/
            ├── envelope.test.ts
            └── issues.test.ts
```

### File responsibilities (shared types anchor)

- `packages/core/src/types.ts` — `InitOptions`, `ReportData`, re-exported by all SDK packages. THE source of SDK option shapes.
- `server/src/store/migrations.ts` — DB schema. `Application`, `Issue`, `Event`, `Patch` tables mirror spec §4.7 data model.
- `server/src/api/index.ts` — REST route registration + auth hook. Every API path in spec §4.7 is wired here.

---

## Task 1: Scaffold pnpm workspace + shared TS config (M0)

**Files:**
- Create: `package.json` (root, overwrite existing empty one)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

**Interfaces:**
- Produces: workspace root that recognizes `packages/*`, `app`, `server`.

- [ ] **Step 1: Overwrite root `package.json`**

```json
{
  "name": "traceability",
  "version": "1.0.0",
  "private": true,
  "description": "Sentry-based web monitoring + exception-to-fix loop",
  "packageManager": "pnpm@10.30.3",
  "scripts": {
    "build": "pnpm -r --filter=./packages/* --filter=./server run build",
    "build:app": "pnpm --filter ./app build",
    "test": "pnpm -r run test",
    "typecheck": "pnpm -r run typecheck"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "app"
  - "server"
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false
  }
}
```

- [ ] **Step 4: Ensure `.gitignore` has the build/runtime entries (merge, do not overwrite)**

A `.gitignore` already exists in the repo (Node template + `.claude/settings.local.json`). Do NOT overwrite it. Append any of these entries that are missing (most already exist):

```gitignore
node_modules/
dist/
*.tsbuildinfo
server/data/*.db
server/data/*.db-journal
.env
.env.local
.DS_Store
coverage/
```

- [ ] **Step 5: Verify install**

Run: `pnpm install`
Expected: exits 0; creates `pnpm-lock.yaml`; warns no packages match yet (acceptable).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore pnpm-lock.yaml
git commit -m "chore: scaffold pnpm workspace + shared tsconfig"
```

---

## Task 2: Shared types package — `@traceability/protocol` (M0)

The spec's "envelope v7 protocol type" and "data model type" are shared by core/server/app/cli. Rather than scatter them, create one tiny `packages/protocol` package.

**Files:**
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/tsconfig.json`
- Create: `packages/protocol/src/index.ts`

**Interfaces:**
- Produces: `@traceability/protocol` exporting `IssueStatus`, `Application`, `Issue`, `Event`, `Patch`, `EnvelopeItem`, `ParsedEnvelope`. Consumed by `server`, `app`, `cli`.

- [ ] **Step 1: Create `packages/protocol/package.json`**

```json
{
  "name": "@traceability/protocol",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Create `packages/protocol/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/protocol/src/index.ts`**

```ts
// ===== Server data model (spec §4.7) =====

export type IssueStatus = 'open' | 'fix-manual' | 'fixing' | 'fixed' | 'ignored'

export interface Application {
  id: string
  name: string
  repoUrl: string
  defaultBranch: string
  createdAt: string
}

export interface Issue {
  id: string
  appId: string
  fingerprint: string
  title: string
  type: 'error' | 'transaction' | 'message' | 'custom'
  firstSeen: string
  lastSeen: string
  count: number
  status: IssueStatus
  metadata: {
    stacktrace?: string
    message?: string
    context?: Record<string, unknown>
  }
}

export interface Event {
  id: string
  issueId: string
  receivedAt: string
  envelope: string
}

export interface Patch {
  id: string
  issueId: string
  branch: string
  filePath: string
  attachedAt: string
}

// ===== Sentry envelope v7 (subset) =====

export type EnvelopeItemType = 'event' | 'transaction' | 'client_report' | 'session' | 'attachment'

export interface EnvelopeHeader {
  sdk?: { name: string; version: string }
  sent_at?: string
  dsn?: string
  [k: string]: unknown
}

export interface EnvelopeItemHeader {
  type: EnvelopeItemType
  // item payload type discriminator; narrows via `type` above
  [k: string]: unknown
}

export type EnvelopeItem = [EnvelopeItemHeader, unknown]

export interface ParsedEnvelope {
  header: EnvelopeHeader
  items: EnvelopeItem[]
}

// Item payload shapes we actually read (v1: event/transaction/message only)
export interface SentryEventPayload {
  event_id?: string
  type?: 'error' | 'transaction' | 'message' | 'default' | 'custom'
  message?: string
  level?: string
  timestamp?: number | string
  platform?: string
  tags?: Array<[string, string]> | Record<string, string>
  exception?: {
    values?: Array<{
      type?: string
      value?: string
      stacktrace?: { frames?: Array<{ filename?: string; function?: string; lineno?: number; colno?: number }> }
    }>
  }
  transaction?: string
  release?: string
  environment?: string
  contexts?: Record<string, unknown>
  extra?: Record<string, unknown>
}
```

- [ ] **Step 4: Verify typecheck**

Run: `cd packages/protocol && pnpm typecheck`
Expected: exits 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol
git commit -m "feat(protocol): shared types for envelope + server data model"
```

---

## Task 3: Scaffold empty `packages/{core,react,electron,cli,skills}` + `app` + `server` stubs (M0)

Each gets a `package.json` + `tsconfig.json` + empty `src/index.ts` so `pnpm install` resolves the workspace graph. Detailed code comes in later tasks.

**Files:**
- Create: `packages/core/{package.json,tsconfig.json,src/index.ts}`
- Create: `packages/react/{package.json,tsconfig.json,src/index.ts}`
- Create: `packages/electron/{package.json,tsconfig.json,src/index.ts}`
- Create: `packages/cli/{package.json,tsconfig.json,src/index.ts}`
- Create: `packages/skills/package.json`
- Create: `server/{package.json,tsconfig.json,src/index.ts,data/.gitkeep}`
- Create: `app/{package.json,tsconfig.json,src/index.ts}`

**Interfaces:**
- Produces: all workspace packages resolvable by name.

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@traceability/core",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": { "types": "./src/index.ts", "import": "./src/index.ts" } },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@sentry/browser": "^8.0.0",
    "@traceability/protocol": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/core/src/index.ts`**

```ts
export const __CORE_STUB__ = true
```

- [ ] **Step 4: Create `packages/react/package.json`**

```json
{
  "name": "@traceability/react",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": { "types": "./src/index.ts", "import": "./src/index.ts" } },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@sentry/react": "^8.0.0",
    "@traceability/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  }
}
```

- [ ] **Step 5: Create `packages/react/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create `packages/react/src/index.ts`**

```ts
export const __REACT_STUB__ = true
```

- [ ] **Step 7: Create `packages/electron/package.json`**

```json
{
  "name": "@traceability/electron",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": { "types": "./src/index.ts", "import": "./src/index.ts" } },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@sentry/electron": "^5.0.0",
    "@traceability/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  },
  "peerDependencies": {
    "electron": ">=30"
  }
}
```

- [ ] **Step 8: Create `packages/electron/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 9: Create `packages/electron/src/index.ts`**

```ts
export const __ELECTRON_STUB__ = true
```

- [ ] **Step 10: Create `packages/cli/package.json`**

```json
{
  "name": "@traceability/cli",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "bin": {
    "traceability": "./dist/index.js"
  },
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "@traceability/protocol": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.0.0"
  }
}
```

- [ ] **Step 11: Create `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 12: Create `packages/cli/src/index.ts`**

```ts
export const __CLI_STUB__ = true
```

- [ ] **Step 13: Create `packages/skills/package.json`**

```json
{
  "name": "@traceability/skills",
  "version": "1.0.0",
  "private": true,
  "description": "Coding-agent skills that teach how to instrument code with @traceability/core"
}
```

- [ ] **Step 14: Create `server/package.json`**

```json
{
  "name": "@traceability/server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@sentry/core": "^8.0.0",
    "@traceability/protocol": "workspace:*",
    "better-sqlite3": "^11.0.0",
    "fastify": "^4.28.0",
    "@fastify/websocket": "^10.0.0",
    "@fastify/multipart": "^8.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "typescript": "^5.5.0",
    "tsx": "^4.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 15: Create `server/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 16: Create `server/src/index.ts`**

```ts
export const __SERVER_STUB__ = true
```

- [ ] **Step 17: Create `server/data/.gitkeep`** (empty file)

- [ ] **Step 18: Create `app/package.json`**

```json
{
  "name": "@traceability/app",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -b && vite build",
    "dev": "vite",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@traceability/protocol": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 19: Create `app/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 20: Create `app/src/index.ts`**

```ts
export const __APP_STUB__ = true
```

- [ ] **Step 21: Install all workspace deps**

Run: `pnpm install`
Expected: exits 0; resolves all `workspace:*` links; installs sentry/fastify/etc.

- [ ] **Step 22: Commit**

```bash
git add packages app server pnpm-lock.yaml
git commit -m "chore: scaffold all workspace packages with stubs"
```

---

## Task 4: Server — DB layer + migrations (M1)

**Files:**
- Create: `server/src/config.ts`
- Create: `server/src/store/db.ts`
- Create: `server/src/store/migrations.ts`
- Create: `server/vitest.config.ts`

**Interfaces:**
- Produces: `openDb()` returning a `BetterSQLite3.Database` with schema migrated; `getConfig()` returning `{ port, apiToken, dbPath }`.
- Consumes: nothing (foundation).

- [ ] **Step 1: Create `server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 2: Create `server/src/config.ts`**

```ts
export interface ServerConfig {
  port: number
  apiToken: string
  dbPath: string
}

export function getConfig(): ServerConfig {
  const apiToken = process.env.TRACEABILITY_API_TOKEN
  if (!apiToken) {
    throw new Error('TRACEABILITY_API_TOKEN env var is required')
  }
  return {
    port: Number(process.env.PORT ?? 3000),
    apiToken,
    dbPath: process.env.TRACEABILITY_DB_PATH ?? 'server/data/traceability.db',
  }
}
```

- [ ] **Step 3: Create `server/src/store/migrations.ts`**

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

- [ ] **Step 4: Create `server/src/store/db.ts`**

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

- [ ] **Step 5: Write failing test `server/src/tests/db.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { openDb } from '../store/db.js'

describe('openDb', () => {
  it('creates all tables on a fresh in-memory db', () => {
    const db = openDb(':memory:')
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>
    const names = tables.map((t) => t.name)
    expect(names).toContain('applications')
    expect(names).toContain('issues')
    expect(names).toContain('events')
    expect(names).toContain('patches')
    db.close()
  })

  it('enforces unique (app_id, fingerprint) on issues', () => {
    const db = openDb(':memory:')
    const insert = db.prepare(
      `INSERT INTO issues (id, app_id, fingerprint, title, type, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    insert.run('i1', 'app1', 'fp1', 't', 'error', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
    expect(() =>
      insert.run('i2', 'app1', 'fp1', 't', 'error', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
    ).toThrowError(/UNIQUE/i)
    db.close()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd server && pnpm test`
Expected: FAIL — `Cannot find module '../store/db.js'` or module resolution error (TS path). If `better-sqlite3` native build fails, see Step 7.

- [ ] **Step 7: Verify build (native dep)**

Run: `cd server && pnpm typecheck`
Expected: exits 0. If `better-sqlite3` fails to install on darwin, ensure Xcode CLI tools present (`xcode-select --install`); do NOT change the dep.

- [ ] **Step 8: Run tests to verify pass**

Run: `cd server && pnpm test`
Expected: 2 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add server
git commit -m "feat(server): sqlite db layer + migrations"
```

---

## Task 5: Server — envelope parser (M1)

**Files:**
- Create: `server/src/ingest/envelope.ts`
- Create: `server/src/tests/envelope.test.ts`

**Interfaces:**
- Produces: `parseEnvelope(body: Buffer | string): ParsedEnvelope`, `extractIssueFingerprint(payload: SentryEventPayload, appId: string): string`, `payloadToIssueFields(payload): { title, type, metadata }`. Consumed by ingest endpoint (Task 6).
- Consumes: `@traceability/protocol` types.

- [ ] **Step 1: Create `server/src/ingest/envelope.ts`**

```ts
import type {
  ParsedEnvelope,
  EnvelopeHeader,
  EnvelopeItem,
  SentryEventPayload,
} from '@traceability/protocol'

/**
 * Sentry envelope v7 wire format: a newline-delimited JSON array.
 * First line = envelope header object; subsequent lines alternate
 * [itemHeader, itemPayload, itemHeader, itemPayload, ...].
 */
export function parseEnvelope(body: Buffer | string): ParsedEnvelope {
  const text = typeof body === 'string' ? body : body.toString('utf8')
  const lines = text.split('\n').filter((l) => l.length > 0)
  if (lines.length < 1) {
    throw new Error('empty envelope')
  }
  const header = JSON.parse(lines[0]!) as EnvelopeHeader
  const items: EnvelopeItem[] = []
  for (let i = 1; i + 1 < lines.length; i += 2) {
    const itemHeader = JSON.parse(lines[i]!) as EnvelopeItem[0]
    const itemPayload = JSON.parse(lines[i + 1]!)
    items.push([itemHeader, itemPayload])
  }
  return { header, items }
}

/**
 * Filter to v1-supported item types: only event/transaction/message payloads.
 */
export function filterSupportedItems(envelope: ParsedEnvelope): Array<{
  header: EnvelopeItem[0]
  payload: SentryEventPayload
}> {
  const supported: Array<{ header: EnvelopeItem[0]; payload: SentryEventPayload }> = []
  for (const [header, payload] of envelope.items) {
    if (header.type === 'event' || header.type === 'transaction') {
      supported.push({ header, payload: payload as SentryEventPayload })
    } else if (header.type === 'client_report' && isMessagePayload(payload)) {
      // client_report is not a message; skip. Kept branch explicit for clarity.
      continue
    }
  }
  return supported
}

function isMessagePayload(p: unknown): p is SentryEventPayload {
  return typeof p === 'object' && p !== null
}

/**
 * Stable fingerprint: appName tag + exception type+value, or message, or transaction name.
 */
export function extractIssueFingerprint(payload: SentryEventPayload, appId: string): string {
  const base = appId
  const exc = payload.exception?.values?.[0]
  if (exc) {
    return `${base}::error::${exc.type ?? 'unknown'}::${exc.value ?? ''}`
  }
  if (payload.transaction) {
    return `${base}::transaction::${payload.transaction}`
  }
  if (payload.message) {
    return `${base}::message::${payload.message.slice(0, 200)}`
  }
  return `${base}::${payload.type ?? 'unknown'}::${payload.event_id ?? 'no-id'}`
}

export function payloadToIssueFields(payload: SentryEventPayload): {
  title: string
  type: 'error' | 'transaction' | 'message' | 'custom'
  metadata: Issue['metadata']
} {
  const exc = payload.exception?.values?.[0]
  if (exc) {
    return {
      title: `${exc.type ?? 'Error'}: ${exc.value ?? ''}`.slice(0, 500),
      type: 'error',
      metadata: {
        stacktrace: JSON.stringify(exc.stacktrace ?? null),
        message: exc.value,
        context: payload.extra,
      },
    }
  }
  if (payload.transaction) {
    return {
      title: `transaction: ${payload.transaction}`.slice(0, 500),
      type: 'transaction',
      metadata: { context: payload.contexts },
    }
  }
  if (payload.message) {
    return {
      title: payload.message.slice(0, 500),
      type: 'message',
      metadata: { message: payload.message, context: payload.extra },
    }
  }
  return {
    title: `${payload.type ?? 'event'} ${payload.event_id ?? ''}`.slice(0, 500),
    type: 'custom',
    metadata: { context: payload.extra },
  }
}

// local import for the return type only
import type { Issue } from '@traceability/protocol'
```

- [ ] **Step 2: Write failing test `server/src/tests/envelope.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { parseEnvelope, filterSupportedItems, extractIssueFingerprint, payloadToIssueFields } from '../ingest/envelope.js'

const sampleEnvelope = [
  JSON.stringify({ sent_at: '2026-01-01T00:00:00Z', dsn: 'https://x@ingest/1' }),
  JSON.stringify({ type: 'event' }),
  JSON.stringify({
    event_id: 'abc',
    type: 'error',
    message: 'boom',
    exception: { values: [{ type: 'TypeError', value: 'boom', stacktrace: { frames: [{ filename: 'a.js', lineno: 10 }] } }] },
  }),
].join('\n')

describe('parseEnvelope', () => {
  it('parses header + items', () => {
    const env = parseEnvelope(sampleEnvelope)
    expect(env.header.dsn).toBe('https://x@ingest/1')
    expect(env.items).toHaveLength(1)
    expect(env.items[0]![0].type).toBe('event')
  })
})

describe('filterSupportedItems', () => {
  it('keeps event/transaction, drops others', () => {
    const env = parseEnvelope(sampleEnvelope)
    const supported = filterSupportedItems(env)
    expect(supported).toHaveLength(1)
    expect(supported[0]!.payload.event_id).toBe('abc')
  })
})

describe('extractIssueFingerprint', () => {
  it('uses appId + exception type/value', () => {
    const env = parseEnvelope(sampleEnvelope)
    const { payload } = filterSupportedItems(env)[0]!
    expect(extractIssueFingerprint(payload, 'app1')).toBe('app1::error::TypeError::boom')
  })
})

describe('payloadToIssueFields', () => {
  it('derives error title + metadata', () => {
    const env = parseEnvelope(sampleEnvelope)
    const { payload } = filterSupportedItems(env)[0]!
    const fields = payloadToIssueFields(payload)
    expect(fields.title).toBe('TypeError: boom')
    expect(fields.type).toBe('error')
    expect(fields.metadata.message).toBe('boom')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && pnpm test`
Expected: FAIL — module not found (TS not yet built to `.js`).

NOTE: vitest with TS source files resolves `.ts` directly via `vite-node`. Update import paths to drop `.js` if vitest complains. If so, change all `from '../x.js'` to `from '../x'` in test files only. Keep server src imports as `.js` (ESM convention for built output). Add to `server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  esbuild: {
    target: 'es2022',
  },
})
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && pnpm test`
Expected: all envelope tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): envelope v7 parser + fingerprint/title extraction"
```

---

## Task 6: Server — apps + issues store repositories (M1)

**Files:**
- Create: `server/src/store/apps.ts`
- Create: `server/src/store/issues.ts`
- Create: `server/src/tests/issues.test.ts`

**Interfaces:**
- Produces: `createAppsRepo(db)`, `createIssuesRepo(db)` returning typed CRUD helpers used by API routes (Task 7) and ingest (Task 8).
- Consumes: `@traceability/protocol`, `better-sqlite3`, envelope helpers (Task 5).

- [ ] **Step 1: Create `server/src/store/apps.ts`**

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
      db.prepare(
        'INSERT INTO applications (id, name, repo_url, default_branch, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(app.id, app.name, app.repoUrl, app.defaultBranch, app.createdAt)
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
      db.prepare('UPDATE applications SET name = ?, repo_url = ?, default_branch = ? WHERE id = ?').run(
        updated.name, updated.repoUrl, updated.defaultBranch, id,
      )
      return updated
    },
    remove(id: string): boolean {
      const res = db.prepare('DELETE FROM applications WHERE id = ?').run(id)
      return res.changes > 0
    },
  }
}
```

- [ ] **Step 2: Create `server/src/store/issues.ts`**

```ts
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { Issue, Event, Patch, IssueStatus } from '@traceability/protocol'
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
      if (opts.appId) {
        where.push('app_id = ?')
        params.push(opts.appId)
      }
      if (opts.status) {
        where.push('status = ?')
        params.push(opts.status)
      }
      if (opts.cursor) {
        where.push('last_seen < ?')
        params.push(opts.cursor)
      }
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const rows = db
        .prepare(`SELECT * FROM issues ${whereClause} ORDER BY last_seen DESC LIMIT ?`)
        .all(...params, limit + 1) as Array<Record<string, unknown>>
      const items = rows.slice(0, limit).map(rowToIssue)
      const nextCursor = rows.length > limit ? (rows[limit - 1]!.last_seen as string) : null
      return { items, nextCursor }
    },

    get(id: string): Issue | undefined {
      const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as Record<string, unknown> | undefined
      return row ? rowToIssue(row) : undefined
    },

    /**
     * Upsert an issue from an ingested event payload. Returns the issue + whether it was newly created
     * (used to drive WS "issue:created" vs "issue:updated").
     */
    ingestEvent(appId: string, payload: SentryEventPayload): { issue: Issue; created: boolean } {
      const fingerprint = extractIssueFingerprint(payload, appId)
      const fields = payloadToIssueFields(payload)
      const now = new Date().toISOString()

      const existing = db
        .prepare('SELECT * FROM issues WHERE app_id = ? AND fingerprint = ?')
        .get(appId, fingerprint) as Record<string, unknown> | undefined

      if (existing) {
        db.prepare(
          `UPDATE issues SET last_seen = ?, count = count + 1, metadata = ? WHERE id = ?`,
        ).run(now, JSON.stringify(fields.metadata), existing.id)
        return { issue: this.get(existing.id as string)!, created: false }
      }

      const issue: Issue = {
        id: randomUUID(),
        appId,
        fingerprint,
        title: fields.title,
        type: fields.type,
        firstSeen: now,
        lastSeen: now,
        count: 1,
        status: 'open',
        metadata: fields.metadata,
      }
      db.prepare(
        `INSERT INTO issues (id, app_id, fingerprint, title, type, first_seen, last_seen, count, status, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        issue.id, issue.appId, issue.fingerprint, issue.title, issue.type,
        issue.firstSeen, issue.lastSeen, issue.count, issue.status, JSON.stringify(issue.metadata),
      )
      return { issue, created: true }
    },

    appendEvent(issueId: string, envelope: string): Event {
      const event: Event = {
        id: randomUUID(),
        issueId,
        receivedAt: new Date().toISOString(),
        envelope,
      }
      db.prepare(
        'INSERT INTO events (id, issue_id, received_at, envelope) VALUES (?, ?, ?, ?)',
      ).run(event.id, event.issueId, event.receivedAt, event.envelope)
      return event
    },

    listEvents(issueId: string, limit = 50): Event[] {
      const rows = db
        .prepare('SELECT * FROM events WHERE issue_id = ? ORDER BY received_at DESC LIMIT ?')
        .all(issueId, limit) as Array<Record<string, unknown>>
      return rows.map((r) => ({
        id: r.id as string,
        issueId: r.issue_id as string,
        receivedAt: r.received_at as string,
        envelope: r.envelope as string,
      }))
    },

    setStatus(id: string, status: IssueStatus): Issue | undefined {
      db.prepare('UPDATE issues SET status = ? WHERE id = ?').run(status, id)
      return this.get(id)
    },

    attachPatch(issueId: string, branch: string, filePath: string): Patch {
      const patch: Patch = {
        id: randomUUID(),
        issueId,
        branch,
        filePath,
        attachedAt: new Date().toISOString(),
      }
      db.prepare(
        'INSERT INTO patches (id, issue_id, branch, file_path, attached_at) VALUES (?, ?, ?, ?, ?)',
      ).run(patch.id, patch.issueId, patch.branch, patch.filePath, patch.attachedAt)
      db.prepare("UPDATE issues SET status = 'fixing' WHERE id = ?").run(issueId)
      return patch
    },

    getLatestPatch(issueId: string): Patch | undefined {
      const row = db
        .prepare('SELECT * FROM patches WHERE issue_id = ? ORDER BY attached_at DESC LIMIT 1')
        .get(issueId) as Record<string, unknown> | undefined
      if (!row) return undefined
      return {
        id: row.id as string,
        issueId: row.issue_id as string,
        branch: row.branch as string,
        filePath: row.file_path as string,
        attachedAt: row.attached_at as string,
      }
    },
  }
}
```

- [ ] **Step 3: Write failing test `server/src/tests/issues.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openDb } from '../store/db.js'
import { createAppsRepo } from '../store/apps.js'
import { createIssuesRepo } from '../store/issues.js'
import type { Database } from 'better-sqlite3'
import type { SentryEventPayload } from '@traceability/protocol'

let db: Database
beforeEach(() => {
  db = openDb(':memory:')
})

describe('issues repo ingestEvent', () => {
  it('creates a new issue on first occurrence', () => {
    const apps = createAppsRepo(db)
    const issues = createIssuesRepo(db)
    const app = apps.create({ name: 'A', repoUrl: 'git@x:a.git', defaultBranch: 'main' })
    const payload: SentryEventPayload = {
      event_id: 'e1',
      type: 'error',
      exception: { values: [{ type: 'TypeError', value: 'x' }] },
    }
    const { issue, created } = issues.ingestEvent(app.id, payload)
    expect(created).toBe(true)
    expect(issue.count).toBe(1)
    expect(issue.status).toBe('open')
  })

  it('increments count on duplicate fingerprint, no new row', () => {
    const apps = createAppsRepo(db)
    const issues = createIssuesRepo(db)
    const app = apps.create({ name: 'A', repoUrl: 'git@x:a.git', defaultBranch: 'main' })
    const payload: SentryEventPayload = {
      type: 'error',
      exception: { values: [{ type: 'TypeError', value: 'x' }] },
    }
    const first = issues.ingestEvent(app.id, payload)
    const second = issues.ingestEvent(app.id, payload)
    expect(second.created).toBe(false)
    expect(second.issue.id).toBe(first.issue.id)
    expect(second.issue.count).toBe(2)
  })

  it('setStatus + attachPatch flow', () => {
    const apps = createAppsRepo(db)
    const issues = createIssuesRepo(db)
    const app = apps.create({ name: 'A', repoUrl: 'git@x:a.git', defaultBranch: 'main' })
    const { issue } = issues.ingestEvent(app.id, { type: 'error', message: 'm', exception: { values: [{ type: 'E', value: 'm' }] } })
    issues.setStatus(issue.id, 'fix-manual')
    expect(issues.get(issue.id)!.status).toBe('fix-manual')
    issues.attachPatch(issue.id, 'fix-branch', 'patches/fix.diff')
    expect(issues.get(issue.id)!.status).toBe('fixing')
    expect(issues.getLatestPatch(issue.id)!.branch).toBe('fix-branch')
  })
})
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && pnpm test`
Expected: all db + envelope + issues tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat(server): apps + issues repositories"
```

---

## Task 7: Server — auth + WebSocket broadcaster (M1)

**Files:**
- Create: `server/src/auth/token.ts`
- Create: `server/src/ws/broadcaster.ts`

**Interfaces:**
- Produces: `createAuthPlugin(expectedToken)` (Fastify preHandler), `createBroadcaster()` (in-memory pub/sub for issue events). Consumed by API (Task 8).
- Consumes: `fastify`.

- [ ] **Step 1: Create `server/src/auth/token.ts`**

```ts
import type { FastifyReply, FastifyRequest } from 'fastify'

export function createAuthPlugin(expectedToken: string) {
  return function authHook(req: FastifyRequest, reply: FastifyReply, done: () => void) {
    // Bearer token from Authorization header, or `?token=` query (for WS upgrade)
    const header = req.headers.authorization
    let token: string | undefined
    if (header?.startsWith('Bearer ')) {
      token = header.slice(7)
    } else if (typeof req.query === 'object' && req.query !== null && 'token' in req.query) {
      token = String((req.query as Record<string, unknown>).token)
    }
    if (token !== expectedToken) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }
    done()
  }
}
```

- [ ] **Step 2: Create `server/src/ws/broadcaster.ts`**

```ts
import type { WebSocket } from '@fastify/websocket'

export interface IssueEvent {
  kind: 'issue:created' | 'issue:updated' | 'issue:status-changed'
  appId: string
  issueId: string
  payload: unknown
}

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
        if (ws.readyState === ws.OPEN) {
          ws.send(msg)
        }
      }
    },
    size(): number {
      return subscribers.size
    },
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd server && pnpm typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add server
git commit -m "feat(server): token auth + ws broadcaster"
```

---

## Task 8: Server — REST API routes (apps/issues/patches) + ingest (M1)

**Files:**
- Create: `server/src/api/apps.ts`
- Create: `server/src/api/issues.ts`
- Create: `server/src/api/index.ts`
- Create: `server/src/api/ingest.ts`
- Modify: `server/src/index.ts` (replace stub)

**Interfaces:**
- Produces: `registerApi(app, { appsRepo, issuesRepo, broadcaster })` wiring every route in spec §4.7. Consumed by Fastify bootstrap.
- Consumes: repos (Task 6), auth (Task 7), envelope parser (Task 5).

- [ ] **Step 1: Create `server/src/api/apps.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import type { createAppsRepo } from '../store/apps.js'

type AppsRepo = ReturnType<typeof createAppsRepo>

export function registerAppsRoutes(app: FastifyInstance, repo: AppsRepo) {
  app.get('/api/apps', async () => repo.list())

  app.post<{ Body: { name: string; repoUrl: string; defaultBranch: string } }>('/api/apps', async (req, reply) => {
    const { name, repoUrl, defaultBranch } = req.body ?? ({} as typeof req.body)
    if (!name || !repoUrl || !defaultBranch) {
      return reply.code(400).send({ error: 'name, repoUrl, defaultBranch required' })
    }
    const created = repo.create({ name, repoUrl, defaultBranch })
    return reply.code(201).send(created)
  })

  app.get<{ Params: { id: string } }>('/api/apps/:id', async (req, reply) => {
    const found = repo.get(req.params.id)
    return found ? found : reply.code(404).send({ error: 'not found' })
  })

  app.patch<{ Params: { id: string }; Body: { name?: string; repoUrl?: string; defaultBranch?: string } }>(
    '/api/apps/:id',
    async (req, reply) => {
      const updated = repo.update(req.params.id, req.body ?? {})
      return updated ? updated : reply.code(404).send({ error: 'not found' })
    },
  )

  app.delete<{ Params: { id: string } }>('/api/apps/:id', async (req, reply) => {
    const ok = repo.remove(req.params.id)
    return ok ? reply.code(204).send() : reply.code(404).send({ error: 'not found' })
  })
}
```

- [ ] **Step 2: Create `server/src/api/issues.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import type { createIssuesRepo } from '../store/issues.js'
import type { IssueStatus } from '@traceability/protocol'
import type { createBroadcaster } from '../ws/broadcaster.js'

type IssuesRepo = ReturnType<typeof createIssuesRepo>
type Broadcaster = ReturnType<typeof createBroadcaster>

export function registerIssuesRoutes(
  app: FastifyInstance,
  repo: IssuesRepo,
  broadcaster: Broadcaster,
) {
  app.get<{
    Querystring: { appId?: string; status?: IssueStatus; limit?: number; cursor?: string }
  }>('/api/issues', async (req) => {
    return repo.list({
      appId: req.query.appId,
      status: req.query.status,
      limit: req.query.limit,
      cursor: req.query.cursor,
    })
  })

  app.get<{ Params: { id: string } }>('/api/issues/:id', async (req, reply) => {
    const issue = repo.get(req.params.id)
    return issue ? issue : reply.code(404).send({ error: 'not found' })
  })

  app.get<{ Params: { id: string } }>('/api/issues/:id/events', async (req, reply) => {
    const issue = repo.get(req.params.id)
    if (!issue) return reply.code(404).send({ error: 'not found' })
    return repo.listEvents(req.params.id)
  })

  app.post<{ Params: { id: string } }>('/api/issues/:id/fix-request', async (req, reply) => {
    const updated = repo.setStatus(req.params.id, 'fix-manual')
    if (!updated) return reply.code(404).send({ error: 'not found' })
    broadcaster.broadcast({ kind: 'issue:status-changed', appId: updated.appId, issueId: updated.id, payload: updated })
    return updated
  })

  app.post<{ Params: { id: string }; Body: { branch: string; patch: string } }>(
    '/api/issues/:id/attach-patch',
    async (req, reply) => {
      const issue = repo.get(req.params.id)
      if (!issue) return reply.code(404).send({ error: 'not found' })
      const { branch, patch } = req.body ?? ({} as typeof req.body)
      if (!branch || !patch) return reply.code(400).send({ error: 'branch + patch required' })
      const filePath = `patches/${issue.id}-${Date.now()}.diff`
      const created = repo.attachPatch(req.params.id, branch, filePath)
      broadcaster.broadcast({ kind: 'issue:updated', appId: issue.appId, issueId: issue.id, payload: created })
      return reply.code(201).send(created)
    },
  )

  app.post<{ Params: { id: string } }>('/api/issues/:id/mark-fixed', async (req, reply) => {
    const updated = repo.setStatus(req.params.id, 'fixed')
    if (!updated) return reply.code(404).send({ error: 'not found' })
    broadcaster.broadcast({ kind: 'issue:status-changed', appId: updated.appId, issueId: updated.id, payload: updated })
    return updated
  })
}
```

- [ ] **Step 3: Create `server/src/api/ingest.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import type { createIssuesRepo } from '../store/issues.js'
import type { createBroadcaster } from '../ws/broadcaster.js'
import { parseEnvelope, filterSupportedItems } from '../ingest/envelope.js'

type IssuesRepo = ReturnType<typeof createIssuesRepo>
type Broadcaster = ReturnType<typeof createBroadcaster>

export function registerIngestRoute(
  app: FastifyInstance,
  repo: IssuesRepo,
  broadcaster: Broadcaster,
) {
  app.post<{ Params: { appId: string } }>('/api/ingest/envelope/:appId', async (req, reply) => {
    const raw = req.body as string
    if (!raw || typeof raw !== 'string') {
      return reply.code(400).send({ error: 'empty body' })
    }
    let envelope
    try {
      envelope = parseEnvelope(raw)
    } catch (e) {
      return reply.code(400).send({ error: 'invalid envelope' })
    }
    const supported = filterSupportedItems(envelope)
    for (const { payload } of supported) {
      const { issue, created } = repo.ingestEvent(req.params.appId, payload)
      repo.appendEvent(issue.id, raw)
      broadcaster.broadcast({
        kind: created ? 'issue:created' : 'issue:updated',
        appId: issue.appId,
        issueId: issue.id,
        payload: issue,
      })
    }
    return reply.code(202).send({ accepted: supported.length })
  })
}
```

- [ ] **Step 4: Create `server/src/api/index.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import type { createAppsRepo } from '../store/apps.js'
import type { createIssuesRepo } from '../store/issues.js'
import type { createBroadcaster } from '../ws/broadcaster.js'
import { createAuthPlugin } from '../auth/token.js'
import { registerAppsRoutes } from './apps.js'
import { registerIssuesRoutes } from './issues.js'
import { registerIngestRoute } from './ingest.js'

interface ApiDeps {
  appsRepo: ReturnType<typeof createAppsRepo>
  issuesRepo: ReturnType<typeof createIssuesRepo>
  broadcaster: ReturnType<typeof createBroadcaster>
  apiToken: string
}

export function registerApi(app: FastifyInstance, deps: ApiDeps) {
  // ingest is authenticated by appId+token; protect all /api/* except ingest
  app.addHook('preHandler', (req, reply, done) => {
    if (req.url.startsWith('/api/ingest/')) return done()
    if (req.url.startsWith('/api/ws')) return done() // WS auth handled at upgrade
    return createAuthPlugin(deps.apiToken)(req, reply, done)
  })

  registerIngestRoute(app, deps.issuesRepo, deps.broadcaster)
  registerAppsRoutes(app, deps.appsRepo)
  registerIssuesRoutes(app, deps.issuesRepo, deps.broadcaster)
}
```

- [ ] **Step 5: Replace `server/src/index.ts`**

```ts
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import { getConfig } from './config.js'
import { openDb } from './store/db.js'
import { createAppsRepo } from './store/apps.js'
import { createIssuesRepo } from './store/issues.js'
import { createBroadcaster } from './ws/broadcaster.js'
import { createAuthPlugin } from './auth/token.js'
import { registerApi } from './api/index.js'

async function main() {
  const config = getConfig()
  const db = openDb(config.dbPath)
  const broadcaster = createBroadcaster()
  const appsRepo = createAppsRepo(db)
  const issuesRepo = createIssuesRepo(db)

  const app = Fastify({ logger: true })
  await app.register(websocket)

  app.get('/api/ws', { websocket: true }, (socket, req) => {
    const token = (req.query as { token?: string }).token
    if (token !== config.apiToken) {
      socket.close(4001, 'unauthorized')
      return
    }
    broadcaster.add(socket)
  })

  registerApi(app, { appsRepo, issuesRepo, broadcaster, apiToken: config.apiToken })

  await app.listen({ port: config.port, host: '0.0.0.0' })
  app.log.info(`traceability server on http://0.0.0.0:${config.port}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 6: Typecheck + build**

Run: `cd server && pnpm typecheck && pnpm build`
Expected: exits 0.

- [ ] **Step 7: Manual smoke test**

```bash
cd server
export TRACEABILITY_API_TOKEN=test-token
pnpm dev &
sleep 2
# create app
curl -s -X POST http://localhost:3000/api/apps \
  -H "Authorization: Bearer test-token" -H "Content-Type: application/json" \
  -d '{"name":"demo","repoUrl":"git@x:demo.git","defaultBranch":"main"}'
# ingest a fake envelope (appId from above)
APP_ID=$(curl -s http://localhost:3000/api/apps -H "Authorization: Bearer test-token" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)[0].id))")
printf '%s\n%s\n%s\n' \
  '{"sent_at":"2026-01-01T00:00:00Z","dsn":"https://x@ingest/1"}' \
  '{"type":"event"}' \
  '{"event_id":"e1","type":"error","exception":{"values":[{"type":"TypeError","value":"boom"}]}}' \
  | curl -s -X POST "http://localhost:3000/api/ingest/envelope/$APP_ID" --data-binary @-
# list issues
curl -s "http://localhost:3000/api/issues?appId=$APP_ID" -H "Authorization: Bearer test-token"
kill %1
```
Expected: create app returns 201 with `id`; ingest returns `{"accepted":1}`; issues list shows 1 issue with title `TypeError: boom`.

- [ ] **Step 8: Commit**

```bash
git add server
git commit -m "feat(server): REST api (apps/issues/patches) + envelope ingest + ws bootstrap"
```

---

## Task 9: `@traceability/core` — types + init + transport (M2)

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/transport/serverTransport.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/tests/transport.test.ts`
- Modify: `packages/core/src/index.ts` (replace stub from Task 3)

**Interfaces:**
- Produces: `init(opts)`, `setApp(name)`, `installGlobalProxy()`, `captureException`, `captureMessage`, `report`, `setTag`, `setContext`, `addBreadcrumb`, plus `createServerTransport({ url, appId })`.
- Consumes: `@sentry/browser`, `@traceability/protocol`.

- [ ] **Step 1: Create `packages/core/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
  resolve: { extensions: ['.ts', '.js'] },
})
```

Add `jsdom` dev dep: append to `packages/core/package.json` `devDependencies`:
```json
    "jsdom": "^25.0.0"
```

- [ ] **Step 2: Create `packages/core/src/types.ts`**

```ts
import type { Event } from '@sentry/browser'

export interface InitOptions {
  /** Full URL of the server ingest endpoint, e.g. http://localhost:3000/api/ingest/envelope */
  dsn: string
  appId: string
  /** API token; sent as Authorization: Bearer */
  token: string
  release?: string
  environment?: string
  user?: { id: string; [k: string]: unknown }
  whiteScreen?: {
    rootSelector?: string
    stableWindowMs?: number
    minContentNodes?: number
    enableScreenshot?: boolean
  }
  mf?: { host: boolean }
  beforeSend?: (event: Event) => Event | null
}

export interface ReportData {
  type: string
  payload?: Record<string, unknown>
  tags?: Record<string, string>
}
```

- [ ] **Step 3: Create `packages/core/src/transport/serverTransport.ts`**

```ts
import type { Transport, TransportMakeRequestResponse, BaseTransportOptions } from '@sentry/core'
import type { ReportEnvelope } from '@sentry/core'

export interface ServerTransportOptions {
  /** Full ingest URL, including appId, e.g. http://host/api/ingest/envelope/<appId> */
  url: string
  token: string
}

/**
 * Minimal transport: serializes the Sentry envelope (the wire format is a
 * newline-delimited JSON of [header, itemHeader, item, ...]) and POSTs it to
 * our self-hosted server. On failure, drops (v1: no retry queue).
 */
export function createServerTransport(opts: ServerTransportOptions): Transport {
  return {
    async send(request: ReportEnvelope): Promise<TransportMakeRequestResponse> {
      // @sentry/core gives us the already-serialized envelope body as a string
      const body =
        typeof request.body === 'string'
          ? request.body
          : new TextDecoder().decode(request.body as Uint8Array)
      const res = await fetch(opts.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          Authorization: `Bearer ${opts.token}`,
        },
        body,
      })
      if (!res.ok && res.status >= 400 && res.status < 500) {
        // permanent client error — drop
      }
      return { statusCode: res.status }
    },
    flush(): Promise<boolean> {
      return Promise.resolve(true)
    },
  } satisfies Transport
}
```

NOTE: the exact `Transport` interface shape depends on `@sentry/core` v8. If typecheck fails on `ReportEnvelope`/`send` signature, run `pnpm why @sentry/core` in `packages/core` and align: the v8 `Transport.send` takes `SentryRequest` and returns `Promise<TransportMakeRequestResponse>`. Adjust the param type to match `import('https://github.com/getsentry/sentry-javascript')`'s actual export. Keep the body extraction + fetch logic identical.

- [ ] **Step 4: Create `packages/core/src/index.ts`** (replaces stub)

```ts
import * as Sentry from '@sentry/browser'
import type { Event } from '@sentry/browser'
import { createServerTransport } from './transport/serverTransport.js'
import type { InitOptions, ReportData } from './types.js'

let initialized = false
let currentAppName: string | undefined

export function init(opts: InitOptions): void {
  if (initialized) return
  initialized = true

  const ingestUrl = `${opts.dsn.replace(/\/$/, '')}/api/ingest/envelope/${opts.appId}`

  Sentry.init({
    dsn: `https://dummy@local/${opts.appId}`, // unused by our transport, but required by Sentry init
    release: opts.release,
    environment: opts.environment,
    transport: createServerTransport({ url: ingestUrl, token: opts.token }) as any,
    beforeSend(event: Event): Event | null {
      event.tags = { ...(event.tags ?? {}), appId: opts.appId }
      if (currentAppName) {
        event.tags.appName = currentAppName
      }
      return opts.beforeSend ? opts.beforeSend(event) : event
    },
    integrations: (defaults) => defaults,
  })

  if (opts.user) {
    Sentry.setUser(opts.user as Parameters<typeof Sentry.setUser>[0])
  }
}

export function setApp(appName: string): void {
  currentAppName = appName
  Sentry.setTag('appName', appName)
}

export function installGlobalProxy(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { __MONITOR_PROXY_INSTALLED__?: boolean }
  if (w.__MONITOR_PROXY_INSTALLED__) return
  w.__MONITOR_PROXY_INSTALLED__ = true
  // Sentry installs its own XHR/fetch proxies via BrowserTracing; the guard
  // prevents consumers from re-init. No additional monkey-patch needed in v1.
}

export const captureException = Sentry.captureException
export const captureMessage = Sentry.captureMessage
export const setTag = Sentry.setTag
export const setContext = Sentry.setContext
export const addBreadcrumb = Sentry.addBreadcrumb

export function report(data: ReportData): void {
  Sentry.captureMessage(data.type, {
    tags: { ...(data.tags ?? {}), event_type: data.type },
    extra: data.payload,
  })
}
```

- [ ] **Step 5: Write failing test `packages/core/tests/transport.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { createServerTransport } from '../src/transport/serverTransport.js'

describe('createServerTransport', () => {
  it('POSTs the serialized envelope body to the ingest URL with bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 })
    vi.stubGlobal('fetch', fetchMock)

    const transport = createServerTransport({ url: 'http://localhost:3000/api/ingest/envelope/app1', token: 'tok' })
    await transport.send({ body: 'header\nitem\npayload' } as any)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://localhost:3000/api/ingest/envelope/app1')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(init.body).toBe('header\nitem\npayload')

    vi.unstubAllGlobals()
  })

  it('returns the response status code', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 })
    vi.stubGlobal('fetch', fetchMock)
    const transport = createServerTransport({ url: 'http://x', token: 't' })
    const res = await transport.send({ body: 'x' } as any)
    expect(res.statusCode).toBe(202)
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 6: Install jsdom dep + run test**

Run: `cd packages/core && pnpm install && pnpm test`
Expected: 2 tests PASS (after fixing any `Transport` type mismatch noted in Task 9 Step 3).

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): init + appId transport + report API"
```

---

## Task 10: `@traceability/core` — corsDiagnostic integration (M2, part of M4)

Splitting integrations into their own tasks keeps each testable in isolation.

**Files:**
- Create: `packages/core/src/integrations/corsDiagnostic.ts`
- Modify: `packages/core/src/index.ts` (wire default integration)
- Create: `packages/core/tests/integrations.test.ts`

**Interfaces:**
- Produces: `corsDiagnosticIntegration()` returning a Sentry `Integration`.
- Consumes: `@sentry/browser`.

- [ ] **Step 1: Create `packages/core/src/integrations/corsDiagnostic.ts`**

```ts
import type { Integration } from '@sentry/browser'
import { captureMessage } from '../index.js'

interface ScriptElement {
  src: string
  crossorigin: string | null
}

function getCrossOriginScripts(doc: Document): ScriptElement[] {
  const scripts = Array.from(doc.querySelectorAll('script[src]')) as HTMLScriptElement[]
  return scripts
    .map((s) => ({ src: s.src, crossorigin: s.getAttribute('crossorigin') }))
    .filter((s) => {
      try {
        const url = new URL(s.src, doc.location.href)
        return url.origin !== doc.location.origin && s.crossorigin === null
      } catch {
        return false
      }
    })
}

export function corsDiagnosticIntegration(): Integration {
  return {
    name: 'CorsDiagnostic',
    setupOnce(): void {
      if (typeof document === 'undefined') return
      // defer until scripts are present
      const check = () => {
        const offenders = getCrossOriginScripts(document)
        if (offenders.length > 0) {
          // eslint-disable-next-line no-console
          console.warn(
            `[traceability] ${offenders.length} cross-origin <script> without crossorigin attribute. ` +
              `This causes "Script error." and lost stacktraces. Add crossorigin="anonymous" + CORS headers.`,
          )
          captureMessage('cors-config-warning', {
            level: 'warning',
            tags: { type: 'cors-config-warning' },
            extra: { offenders: offenders.map((o) => o.src) },
          })
        }
      }
      if (document.readyState === 'complete') {
        check()
      } else {
        window.addEventListener('load', check)
      }
    },
  }
}
```

- [ ] **Step 2: Wire into default integrations in `packages/core/src/index.ts`**

Replace the `integrations: (defaults) => defaults,` line with:

```ts
    integrations: (defaults) => [...defaults, corsDiagnosticIntegration()],
```

And add import at top of `packages/core/src/index.ts`:

```ts
import { corsDiagnosticIntegration } from './integrations/corsDiagnostic.js'
```

- [ ] **Step 3: Write failing test `packages/core/tests/integrations.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { corsDiagnosticIntegration } from '../src/integrations/corsDiagnostic.js'

// captureMessage is imported from ../index.js inside the integration; mock it
vi.mock('../src/index.js', () => ({
  captureMessage: vi.fn(),
}))

import { captureMessage } from '../src/index.js'

describe('corsDiagnosticIntegration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.head.innerHTML = ''
  })

  it('warns + reports when a cross-origin script lacks crossorigin', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const script = document.createElement('script')
    script.src = 'https://other-origin.example/bundle.js'
    document.head.appendChild(script)

    const integration = corsDiagnosticIntegration()
    integration.setupOnce()

    expect(warn).toHaveBeenCalled()
    expect(captureMessage).toHaveBeenCalledWith('cors-config-warning', expect.objectContaining({
      level: 'warning',
    }))
  })

  it('is silent for same-origin scripts', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const script = document.createElement('script')
    script.src = '/local.js'
    document.head.appendChild(script)

    corsDiagnosticIntegration().setupOnce()

    expect(warn).not.toHaveBeenCalled()
    expect(captureMessage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run tests**

Run: `cd packages/core && pnpm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): cors diagnostic integration"
```

---

## Task 11: `@traceability/core` — whiteScreen integration (M2, part of M4)

**Files:**
- Create: `packages/core/src/integrations/whiteScreen.ts`
- Modify: `packages/core/src/index.ts` (opt-in wiring)
- Modify: `packages/core/tests/integrations.test.ts` (append tests)

**Interfaces:**
- Produces: `whiteScreenIntegration(opts)` returning a Sentry `Integration`, exported from core index for opt-in use.

- [ ] **Step 1: Create `packages/core/src/integrations/whiteScreen.ts`**

```ts
import type { Integration } from '@sentry/browser'
import { captureMessage } from '../index.js'

export interface WhiteScreenOptions {
  rootSelector?: string
  stableWindowMs?: number
  minContentNodes?: number
  enableScreenshot?: boolean
}

interface PendingTracker {
  pending: number
  inc(): void
  dec(): void
}

let fetchPending = 0
function patchFetch(tracker: PendingTracker): void {
  if (typeof window === 'undefined' || (window as any).__WS_FETCH_PATCHED__) return
  ;(window as any).__WS_FETCH_PATCHED__ = true
  const orig = window.fetch.bind(window)
  tracker.inc()
  window.fetch = ((...args: Parameters<typeof fetch>) => {
    return orig(...args).finally(() => tracker.dec())
  }) as typeof fetch
  tracker.dec()
}

function countVisibleContent(root: Element, minNodes: number): number {
  let n = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  while (walker.nextNode()) {
    const el = walker.currentNode as Element
    const tag = el.tagName.toLowerCase()
    if (tag === 'img' || (tag === 'div' && (el.textContent?.trim().length ?? 0) > 0)) {
      n++
      if (n >= minNodes) break
    }
  }
  return n
}

export function whiteScreenIntegration(opts: WhiteScreenOptions = {}): Integration {
  const rootSelector = opts.rootSelector ?? '#root,#app,[data-monitor-root]'
  const stableWindowMs = opts.stableWindowMs ?? 500
  const minContentNodes = opts.minContentNodes ?? 3

  const tracker: PendingTracker = {
    pending: 0,
    inc() { this.pending++ },
    dec() { this.pending-- },
  }

  return {
    name: 'WhiteScreen',
    setupOnce(): void {
      if (typeof document === 'undefined') return
      patchFetch(tracker)

      const evaluate = () => {
        const root = document.querySelector(rootSelector)
        if (!root) return
        if (root.childElementCount === 0) {
          reportWhiteScreen('empty-root')
          return
        }
        if (root.querySelector('.dt-white-screen, .error-boundary')) {
          reportWhiteScreen('error-screen')
          return
        }
        const visible = countVisibleContent(root, minContentNodes)
        if (visible < minContentNodes) {
          reportWhiteScreen('low-content', { visibleNodes: visible })
        }
      }

      const scheduleCheck = () => {
        let lastMutation = Date.now()
        const mo = new MutationObserver(() => {
          lastMutation = Date.now()
        })
        const root = document.querySelector(rootSelector)
        if (root) mo.observe(root, { childList: true, subtree: true })

        const tick = () => {
          const stable = Date.now() - lastMutation >= stableWindowMs && tracker.pending <= 0
          if (stable) {
            mo.disconnect()
            evaluate()
          } else {
            setTimeout(tick, stableWindowMs)
          }
        }
        setTimeout(tick, stableWindowMs)
      }

      // re-run on SPA navigation
      const origPush = history.pushState.bind(history)
      history.pushState = function (...args: Parameters<typeof history.pushState>) {
        const r = origPush(...args)
        scheduleCheck()
        return r
      }
      window.addEventListener('popstate', scheduleCheck)
      window.addEventListener('load', scheduleCheck)
    },
  }

  function reportWhiteScreen(reason: string, extra?: Record<string, unknown>): void {
    captureMessage('white-screen', {
      tags: { type: 'white-screen' },
      extra: { reason, ...extra },
    })
  }
}
```

- [ ] **Step 2: Export from `packages/core/src/index.ts`**

Add to imports at top:
```ts
export { whiteScreenIntegration } from './integrations/whiteScreen.js'
export type { WhiteScreenOptions } from './integrations/whiteScreen.js'
export { corsDiagnosticIntegration } from './integrations/corsDiagnostic.js'
```

(Remove the inline import of `corsDiagnosticIntegration` added in Task 10 if it now conflicts; keep the `integrations:` array referencing the function.)

- [ ] **Step 3: Append failing test to `packages/core/tests/integrations.test.ts`**

```ts
import { whiteScreenIntegration } from '../src/integrations/whiteScreen.js'

describe('whiteScreenIntegration', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports white-screen when root has no children after stable window', () => {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)

    whiteScreenIntegration({ stableWindowMs: 100, minContentNodes: 3 }).setupOnce()
    // load event triggers scheduleCheck
    window.dispatchEvent(new Event('load'))
    vi.advanceTimersByTime(300)

    expect(captureMessage).toHaveBeenCalledWith('white-screen', expect.objectContaining({
      tags: { type: 'white-screen' },
    }))
  })
})
```

- [ ] **Step 4: Run tests**

Run: `cd packages/core && pnpm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): white screen detection integration"
```

---

## Task 12: `@traceability/react` — MonitorErrorBoundary + hook (M4)

**Files:**
- Modify: `packages/react/src/index.ts` (replace stub)
- Create: `packages/react/src/ErrorBoundary.tsx`
- Create: `packages/react/src/hooks.ts`
- Modify: `packages/react/package.json` (add `react-dom` devDep + vitest if testing)

**Interfaces:**
- Produces: `MonitorErrorBoundary` (wraps `@sentry/react`'s `ErrorBoundary`), `useMonitorReport()`.

- [ ] **Step 1: Create `packages/react/src/ErrorBoundary.tsx`**

```tsx
import React from 'react'
import { ErrorBoundary } from '@sentry/react'

export interface MonitorErrorBoundaryProps {
  appName?: string
  fallback: React.ReactNode | ((args: { error: Error; componentStack: string | null; resetError: () => void }) => React.ReactNode)
  children: React.ReactNode
  onError?: (error: Error, componentStack: string | null) => void
}

export function MonitorErrorBoundary(props: MonitorErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={props.fallback as any}
      beforeCapture={(scope) => {
        if (props.appName) scope.setTag('appName', props.appName)
      }}
      onError={props.onError}
      showDialog={false}
    >
      {props.children}
    </ErrorBoundary>
  )
}
```

- [ ] **Step 2: Create `packages/react/src/hooks.ts`**

```ts
import { useCallback } from 'react'
import * as core from '@traceability/core'
import type { ReportData } from '@traceability/core'

export function useMonitorReport() {
  return useCallback((data: ReportData) => {
    core.report(data)
  }, [])
}

export function useMonitorTag() {
  return useCallback((key: string, value: string) => {
    core.setTag(key, value)
  }, [])
}
```

- [ ] **Step 3: Replace `packages/react/src/index.ts`**

```ts
export { MonitorErrorBoundary } from './ErrorBoundary.js'
export type { MonitorErrorBoundaryProps } from './ErrorBoundary.js'
export { useMonitorReport, useMonitorTag } from './hooks.js'
export * from '@traceability/core'
```

- [ ] **Step 4: Typecheck**

Run: `cd packages/react && pnpm typecheck`
Expected: exits 0. Add `@types/react` is already in devDeps via root? No — add to `packages/react/package.json` devDependencies:
```json
    "@types/react": "^19.0.0"
```
Then `cd packages/react && pnpm install` and re-run typecheck.

- [ ] **Step 5: Commit**

```bash
git add packages/react
git commit -m "feat(react): MonitorErrorBoundary + useMonitorReport hook"
```

---

## Task 13: `@traceability/electron` — main + renderer + preload (M6, partial)

**Files:**
- Modify: `packages/electron/src/index.ts` (replace stub)
- Create: `packages/electron/src/main.ts`
- Create: `packages/electron/src/renderer.ts`
- Create: `packages/electron/src/preload.ts`

**Interfaces:**
- Produces: `initMain(opts)`, `initRenderer(opts)`, `preloadBridge`.

- [ ] **Step 1: Create `packages/electron/src/main.ts`**

```ts
import * as SentryMain from '@sentry/electron/main'
import type { InitOptions } from '@traceability/core'

export interface MainInitOptions extends InitOptions {}

export function initMain(opts: MainInitOptions): void {
  const ingestUrl = `${opts.dsn.replace(/\/$/, '')}/api/ingest/envelope/${opts.appId}`
  SentryMain.init({
    dsn: `https://dummy@local/${opts.appId}`,
    release: opts.release,
    environment: opts.environment,
    transport: makeElectronMainTransport(ingestUrl, opts.token),
    beforeSend(event) {
      event.tags = { ...(event.tags ?? {}), appId: opts.appId }
      return event
    },
  })
}

function makeElectronMainTransport(url: string, token: string) {
  // @sentry/electron main process has Node fetch available
  return {
    async send(request: { body?: Uint8Array | string }) {
      const body = typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body ?? new Uint8Array())
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${token}` },
          body,
        })
      } catch {
        // drop on failure (v1)
      }
      return { statusCode: 202 }
    },
    flush() { return Promise.resolve(true) },
  }
}
```

- [ ] **Step 2: Create `packages/electron/src/renderer.ts`**

```ts
// The renderer reuses @traceability/core, which uses @sentry/browser under the hood.
export { init as initRenderer, captureException, captureMessage, report, setTag, setContext, addBreadcrumb } from '@traceability/core'
```

- [ ] **Step 3: Create `packages/electron/src/preload.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'

export const preloadBridge = {
  /** Forward a breadcrumb from the renderer to the main process log. */
  addBreadcrumb: (breadcrumb: unknown) => ipcRenderer.send('traceability:breadcrumb', breadcrumb),
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('traceability', preloadBridge)
} else {
  ;(globalThis as any).traceability = preloadBridge
}
```

- [ ] **Step 4: Replace `packages/electron/src/index.ts`**

```ts
export { initMain } from './main.js'
export type { MainInitOptions } from './main.js'
export { initRenderer } from './renderer.js'
export { preloadBridge } from './preload.js'
```

- [ ] **Step 5: Typecheck (electron types optional)**

Run: `cd packages/electron && pnpm typecheck`
Expected: exits 0. If `electron` types missing, add `"electron": "^30.0.0"` to `packages/electron/package.json` devDependencies and `pnpm install`.

- [ ] **Step 6: Commit**

```bash
git add packages/electron
git commit -m "feat(electron): main + renderer + preload bridges"
```

---

## Task 14: `@traceability/cli` — config + api client + output (M5)

**Files:**
- Create: `packages/cli/src/lib/config.ts`
- Create: `packages/cli/src/lib/api.ts`
- Create: `packages/cli/src/lib/output.ts`
- Create: `packages/cli/src/commands/config.ts`
- Modify: `packages/cli/src/index.ts` (bootstrap commander)

**Interfaces:**
- Produces: `getConfig()`/`saveConfig()` (reads `~/.traceability/config.json`), `apiGet/apiPost` helpers, `printJson/printTable`.
- Consumes: `@traceability/protocol`.

- [ ] **Step 1: Create `packages/cli/src/lib/config.ts`**

```ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface CliConfig {
  server: string
  token: string
}

const CONFIG_DIR = join(homedir(), '.traceability')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export function getConfig(): CliConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`No config found. Run: traceability config set --server <url> --token <token>`)
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as CliConfig
}

export function saveConfig(cfg: CliConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 })
}
```

- [ ] **Step 2: Create `packages/cli/src/lib/api.ts`**

```ts
import { getConfig } from './config.js'

export interface ApiOptions {
  json?: boolean
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const cfg = getConfig()
  const res = await fetch(`${cfg.server.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
}
```

- [ ] **Step 3: Create `packages/cli/src/lib/output.ts`**

```ts
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

export function printTable(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string; width?: number }>): void {
  if (rows.length === 0) {
    console.log('(no rows)')
    return
  }
  const header = columns.map((c) => pad(c.label, c.width ?? 20)).join('  ')
  console.log(header)
  console.log('-'.repeat(header.length))
  for (const row of rows) {
    console.log(columns.map((c) => pad(String(row[c.key] ?? ''), c.width ?? 20)).join('  '))
  }
}

function pad(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n)
}
```

- [ ] **Step 4: Create `packages/cli/src/commands/config.ts`**

```ts
import { Command } from 'commander'
import { saveConfig, getConfig } from '../lib/config.js'

export function configCommand(program: Command): void {
  const cmd = program.command('config').description('CLI configuration')
  cmd
    .command('set')
    .requiredOption('--server <url>')
    .requiredOption('--token <token>')
    .action((opts) => {
      saveConfig({ server: opts.server, token: opts.token })
      console.log('Saved.')
    })
  cmd
    .command('show')
    .action(() => {
      const cfg = getConfig()
      console.log(`server: ${cfg.server}`)
      console.log(`token:  ${cfg.token.slice(0, 4)}…`)
    })
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): config store + api client + output helpers"
```

---

## Task 15: `@traceability/cli` — app + issue commands (M5)

**Files:**
- Create: `packages/cli/src/commands/app.ts`
- Create: `packages/cli/src/commands/issue.ts`
- Modify: `packages/cli/src/index.ts` (wire all commands)

**Interfaces:**
- Produces: `traceability app {list,create,show,update,delete}` and `traceability issue {list,show,fix-request,attach-patch,mark-fixed}`.

- [ ] **Step 1: Create `packages/cli/src/commands/app.ts`**

```ts
import { Command } from 'commander'
import { api } from '../lib/api.js'
import { printJson, printTable } from '../lib/output.js'
import type { Application } from '@traceability/protocol'

export function appCommand(program: Command): void {
  const cmd = program.command('app').description('manage applications')
  cmd
    .command('list')
    .option('--json', 'output JSON')
    .action(async (opts) => {
      const apps = await api.get<Application[]>('/api/apps')
      opts.json ? printJson(apps) : printTable(apps, [
        { key: 'id', label: 'ID', width: 36 },
        { key: 'name', label: 'NAME', width: 20 },
        { key: 'defaultBranch', label: 'BRANCH', width: 12 },
      ])
    })

  cmd
    .command('create')
    .requiredOption('--name <name>')
    .requiredOption('--repo-url <url>')
    .requiredOption('--branch <branch>')
    .option('--json', 'output JSON')
    .action(async (opts) => {
      const app = await api.post<Application>('/api/apps', {
        name: opts.name, repoUrl: opts.repoUrl, defaultBranch: opts.branch,
      })
      opts.json ? printJson(app) : console.log(`Created app ${app.id} (${app.name})`)
    })

  cmd
    .command('show <appId>')
    .option('--json', 'output JSON')
    .action(async (appId, opts) => {
      const app = await api.get<Application>(`/api/apps/${appId}`)
      opts.json ? printJson(app) : printJson(app)
    })

  cmd
    .command('update <appId>')
    .option('--name <name>')
    .option('--repo-url <url>')
    .option('--branch <branch>')
    .action(async (appId, opts) => {
      const body: Record<string, string> = {}
      if (opts.name) body.name = opts.name
      if (opts.repoUrl) body.repoUrl = opts.repoUrl
      if (opts.branch) body.defaultBranch = opts.branch
      const app = await api.patch<Application>(`/api/apps/${appId}`, body)
      printJson(app)
    })

  cmd
    .command('delete <appId>')
    .action(async (appId) => {
      await api.delete(`/api/apps/${appId}`)
      console.log('Deleted.')
    })
}
```

- [ ] **Step 2: Create `packages/cli/src/commands/issue.ts`**

```ts
import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { api } from '../lib/api.js'
import { printJson, printTable } from '../lib/output.js'
import type { Issue, IssueStatus } from '@traceability/protocol'

export function issueCommand(program: Command): void {
  const cmd = program.command('issue').description('list and act on issues')
  cmd
    .command('list')
    .requiredOption('--appId <id>')
    .option('--status <status>')
    .option('--limit <n>', 'max results', '20')
    .option('--json', 'output JSON')
    .action(async (opts) => {
      const qs = new URLSearchParams({ appId: opts.appId, limit: opts.limit })
      if (opts.status) qs.set('status', opts.status)
      const res = await api.get<{ items: Issue[] }>(`/api/issues?${qs}`)
      opts.json ? printJson(res) : printTable(res.items, [
        { key: 'id', label: 'ID', width: 36 },
        { key: 'title', label: 'TITLE', width: 40 },
        { key: 'status', label: 'STATUS', width: 12 },
        { key: 'count', label: 'COUNT', width: 6 },
      ])
    })

  cmd
    .command('show <issueId>')
    .option('--json', 'output JSON')
    .action(async (issueId, opts) => {
      const issue = await api.get<Issue>(`/api/issues/${issueId}`)
      printJson(issue)
    })

  cmd
    .command('fix-request <issueId>')
    .action(async (issueId) => {
      const issue = await api.post<Issue>(`/api/issues/${issueId}/fix-request`)
      console.log(`Issue ${issueId} marked fix-manual.`)
    })

  cmd
    .command('attach-patch <issueId>')
    .requiredOption('--patch <path>')
    .requiredOption('--branch <branch>')
    .action(async (issueId, opts) => {
      const patch = readFileSync(opts.patch, 'utf8')
      const res = await api.post<{ id: string }>(`/api/issues/${issueId}/attach-patch`, {
        branch: opts.branch, patch,
      })
      console.log(`Patch attached: ${res.id}`)
    })

  cmd
    .command('mark-fixed <issueId>')
    .action(async (issueId) => {
      await api.post(`/api/issues/${issueId}/mark-fixed`)
      console.log(`Issue ${issueId} marked fixed.`)
    })
}
```

- [ ] **Step 3: Replace `packages/cli/src/index.ts`**

```ts
#!/usr/bin/env node
import { Command } from 'commander'
import { configCommand } from './commands/config.js'
import { appCommand } from './commands/app.js'
import { issueCommand } from './commands/issue.js'

const program = new Command()
program.name('traceability').description('Traceability CLI').version('1.0.0')

configCommand(program)
appCommand(program)
issueCommand(program)

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
```

- [ ] **Step 4: Build + manual smoke (requires running server from Task 8)**

```bash
cd packages/cli && pnpm build
export TRACEABILITY_API_TOKEN=test-token
(cd ../../server && pnpm dev &) ; sleep 2
node dist/index.js config set --server http://localhost:3000 --token test-token
node dist/index.js app create --name demo --repo-url git@x:demo.git --branch main --json
node dist/index.js app list
```
Expected: `app create` prints JSON with `id`; `app list` prints a table with one row.

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): app + issue subcommands"
```

---

## Task 16: `app/` - scaffold + design system (ported from prototype) + auth + clients (M3)

**Design source of truth:** `docs/prototype/index.html`. Port its `<style>` block into `app/src/styles.css` and reuse the prototype's class names (`.panel`, `.data-table`, `.badge`, `.app-card`, `.tabs`, `.timeline`, `.command`, `.modal`, `.toast`, `.palette`) instead of inline styles. The shell (`.shell`/`.sidebar`/`.topbar`) must match the prototype.

**Files:**
- Create: `app/index.html`
- Create: `app/vite.config.ts`
- Create: `app/src/styles.css` (verbatim port of prototype `<style>` - see Step 3)
- Create: `app/src/main.tsx`
- Create: `app/src/App.tsx`
- Create: `app/src/auth/token.ts`
- Create: `app/src/api/client.ts`
- Create: `app/src/ws/client.ts`
- Create: `app/src/components/ui/primitives.tsx` (Button/Panel/Badge/Modal/Field)
- Create: `app/src/components/Toast.tsx` (ToastProvider/useToast)
- Create: `app/src/components/CommandPalette.tsx` (⌘K palette)
- Create: `app/src/components/Layout.tsx`
- Create: `app/src/pages/Login.tsx`

**Interfaces:**
- Produces: Vite dev server at `:5173`; `apiFetch`; `onIssueEvent`; UI primitives (`Button`/`Panel`/`Badge`/`Modal`/`Field`); `ToastProvider`/`useToast`; `CommandPalette`; `Layout`. Pages in Tasks 17/18 import these.

- [ ] **Step 1: Create `app/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Traceability</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `app/vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
```

- [ ] **Step 3: Create `app/src/styles.css` - port the prototype's `<style>` block verbatim**

Open `docs/prototype/index.html`, copy the entire contents of its `<style>...</style>` element (the `:root` variables and every component class), and paste it into `app/src/styles.css` UNCHANGED. Do not rewrite or "improve" it - the page tasks rely on these exact class names: `:root` vars, `.shell`, `.sidebar`, `.brand`, `.workspace`, `.nav-item`, `.main`, `.topbar`, `.breadcrumbs`, `.kbd`, `.btn`/`.btn-primary`/`.btn-danger`/`.btn-sm`, `.content`, `.page`, `.page-header`/`.page-title`/`.page-subtitle`/`.header-actions`, `.metrics`/`.metric`, `.panel`/`.panel-head`/`.panel-title`/`.panel-meta`, `.toolbar`/`.search`/`.select`, `.data-table`, `.severity`, `.issue-main`/`.issue-title`/`.issue-sub`, `.muted`, `.badge`/`.dot`, `.app-grid`/`.app-card`/`.app-icon`/`.app-stats`, `.detail-grid`, `.issue-heading`/`.issue-id`, `.tabs`/`.tab`/`.tab-pane`, `.code`/`.line`/`.ln`/`.hot`/`.fn`/`.str`, `.info-list`/`.info-row`, `.side-panel`/`.side-section`/`.side-label`/`.side-value`/`.full`, `.timeline`/`.timeline-item`/`.timeline-mark`/`.timeline-title`/`.timeline-time`, `.command`, `.patch-file`/`.patch-stats`/`.plus`/`.minus`, `.empty`, `.modal-backdrop`/`.modal`/`.modal-head`/`.modal-body`/`.modal-foot`/`.field`, `.toast`, `.palette`/`.palette-list`/`.palette-item`/`.palette-key`.

- [ ] **Step 4: Create `app/src/auth/token.ts`**

```ts
const KEY = 'traceability.token'
const SERVER_KEY = 'traceability.server'

export function getToken(): string | null {
  return localStorage.getItem(KEY)
}
export function setToken(token: string): void {
  localStorage.setItem(KEY, token)
}
export function getServer(): string {
  return localStorage.getItem(SERVER_KEY) ?? ''
}
export function setServer(server: string): void {
  localStorage.setItem(SERVER_KEY, server)
}
export function clearAuth(): void {
  localStorage.removeItem(KEY)
  localStorage.removeItem(SERVER_KEY)
}
```

- [ ] **Step 5: Create `app/src/api/client.ts`**

```ts
import { getToken, getServer } from '../auth/token'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const server = getServer()
  if (!token || !server) throw new ApiError(401, 'not authenticated')
  const res = await fetch(`${server.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new ApiError(res.status, await res.text().catch(() => res.statusText))
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
```

- [ ] **Step 6: Create `app/src/ws/client.ts`**

```ts
import { getToken, getServer } from '../auth/token'

export interface IssueEvent {
  kind: 'issue:created' | 'issue:updated' | 'issue:status-changed'
  appId: string
  issueId: string
  payload: unknown
}

type Handler = (event: IssueEvent) => void

let socket: WebSocket | null = null
const handlers = new Set<Handler>()

export function connectWs(): void {
  const token = getToken()
  const server = getServer()
  if (!token || !server) return
  const wsUrl = server.replace(/^http/, 'ws').replace(/\/$/, '') + `/api/ws?token=${encodeURIComponent(token)}`
  socket = new WebSocket(wsUrl)
  socket.onmessage = (e) => {
    try {
      const evt = JSON.parse(e.data) as IssueEvent
      handlers.forEach((h) => h(evt))
    } catch {
      // ignore malformed
    }
  }
  socket.onclose = () => {
    socket = null
    setTimeout(connectWs, 3000)
  }
}

export function onIssueEvent(h: Handler): () => void {
  handlers.add(h)
  return () => handlers.delete(h)
}
```

- [ ] **Step 7: Create `app/src/components/ui/primitives.tsx`**

```tsx
import React from 'react'

type BtnVariant = 'default' | 'primary' | 'danger'
export function Button({
  variant = 'default',
  sm,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; sm?: boolean }) {
  const cls = ['btn']
  if (variant === 'primary') cls.push('btn-primary')
  if (variant === 'danger') cls.push('btn-danger')
  if (sm) cls.push('btn-sm')
  cls.push(className)
  return <button className={cls.join(' ')} {...rest} />
}

export function Panel({
  title,
  meta,
  children,
  headExtra,
}: {
  title?: React.ReactNode
  meta?: React.ReactNode
  children: React.ReactNode
  headExtra?: React.ReactNode
}) {
  return (
    <div className="panel">
      {(title || headExtra) && (
        <div className="panel-head">
          {title && <div className="panel-title">{title}</div>}
          {headExtra}
          {meta && <div className="panel-meta">{meta}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

const BADGE: Record<string, { cls: string; label: string }> = {
  open: { cls: 'open', label: 'Open' },
  'fix-manual': { cls: 'fixing', label: 'Fix requested' },
  fixing: { cls: 'fixing', label: 'Fixing' },
  fixed: { cls: 'fixed', label: 'Fixed' },
  ignored: { cls: '', label: 'Ignored' },
}
export function Badge({ status, label }: { status: string; label?: string }) {
  const info = BADGE[status] ?? BADGE.ignored
  return (
    <span className={`badge ${info.cls}`}>
      <span className="dot"></span>
      {label ?? info.label}
    </span>
  )
}

export function Modal({
  show,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  show: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  if (!show) return null
  return (
    <div className="modal-backdrop show" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  )
}

export function Field({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="field">
      <label>{label}</label>
      <input {...rest} />
    </div>
  )
}
```

- [ ] **Step 8: Create `app/src/components/Toast.tsx`**

```tsx
import React, { createContext, useContext, useState, useCallback } from 'react'

const ToastCtx = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('')
  const [show, setShow] = useState(false)
  const show_ = useCallback((m: string) => {
    setMsg(m)
    setShow(true)
    setTimeout(() => setShow(false), 2200)
  }, [])
  return (
    <ToastCtx.Provider value={show_}>
      {children}
      <div className={`toast ${show ? 'show' : ''}`}>{msg}</div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}
```

- [ ] **Step 9: Create `app/src/components/CommandPalette.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const ACTIONS: Array<{ icon: string; label: string; to: string; key: string }> = [
  { icon: '◇', label: 'Go to Issues', to: '/issues', key: 'G then I' },
  { icon: '▦', label: 'Go to Applications', to: '/apps', key: 'G then A' },
  { icon: '⌁', label: 'Go to SDK setup', to: '/settings', key: 'G then S' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  if (!open) return null
  return (
    <>
      <div className="modal-backdrop show" onClick={() => setOpen(false)} />
      <div className="palette show">
        <input placeholder="Search pages and actions…" autoFocus />
        <div className="palette-list">
          {ACTIONS.map((a) => (
            <div
              key={a.to}
              className="palette-item"
              onClick={() => {
                nav(a.to)
                setOpen(false)
              }}
            >
              <span>{a.icon}</span>
              <span>{a.label}</span>
              <span className="kbd palette-key">{a.key}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 10: Create `app/src/components/Layout.tsx`** (matches prototype `.shell`/`.sidebar`/`.topbar`)

```tsx
import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { clearAuth } from '../auth/token'
import { CommandPalette } from './CommandPalette'

export function Layout({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  const crumb = loc.pathname.startsWith('/apps')
    ? 'Applications'
    : loc.pathname.startsWith('/issues')
    ? 'Issues'
    : loc.pathname.startsWith('/fix')
    ? 'AI repair'
    : loc.pathname.startsWith('/settings')
    ? 'SDK setup'
    : 'Issues'
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">T</span>
          <span>Traceability</span>
        </div>
        <div className="workspace">
          <div className="workspace-avatar">FE</div>
          <div className="workspace-copy">
            <div className="workspace-name">Frontend Platform</div>
            <div className="workspace-role">Engineering</div>
          </div>
          <span className="muted">⌄</span>
        </div>
        <nav>
          <div className="nav-label">Workspace</div>
          <NavLink to="/issues" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">◇</span>Issues
          </NavLink>
          <NavLink to="/apps" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">▦</span>Applications
          </NavLink>
          <div className="nav-label">Manage</div>
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon">⌁</span>SDK setup
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="user">
            <div className="avatar">LY</div>
            <div className="user-meta">
              <div className="user-name">研发</div>
              <div className="user-email" style={{ cursor: 'pointer' }} onClick={() => { clearAuth(); location.href = '/login' }}>
                Sign out
              </div>
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Frontend Platform</span>
            <span className="slash">/</span>
            <b>{crumb}</b>
          </div>
          <div className="top-actions">
            <button className="btn btn-sm">Search or jump to… <span className="kbd">⌘ K</span></button>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
      <CommandPalette />
    </div>
  )
}
```

- [ ] **Step 11: Create `app/src/pages/Login.tsx`**

```tsx
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setToken, setServer } from '../auth/token'
import { Button, Field } from '../components/ui/primitives'

export function Login() {
  const [server, setServerState] = useState('http://localhost:3000')
  const [token, setTokenState] = useState('')
  const nav = useNavigate()
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setServer(server)
    setToken(token)
    nav('/apps')
  }
  return (
    <div className="shell" style={{ placeItems: 'center' }}>
      <form onSubmit={submit} className="panel" style={{ width: 380, padding: 24 }}>
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark">T</span>
          <span>Traceability</span>
        </div>
        <Field label="Server URL" value={server} onChange={(e) => setServerState(e.target.value)} />
        <div style={{ height: 15 }} />
        <Field label="API token" type="password" value={token} onChange={(e) => setTokenState(e.target.value)} placeholder="dev-token" />
        <div style={{ marginTop: 18 }}>
          <Button variant="primary" type="submit" className="full">Login</Button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 12: Create `app/src/main.tsx` + `app/src/App.tsx`**

`app/src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
```

`app/src/App.tsx` (pages wired in Tasks 17/18):
```tsx
import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { getToken } from './auth/token'
import { connectWs } from './ws/client'
import { ToastProvider } from './components/Toast'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'

export function App() {
  const token = getToken()
  useEffect(() => {
    if (token) connectWs()
  }, [token])

  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    )
  }
  return (
    <ToastProvider>
      <Layout>
        <Routes>
          <Route path="/login" element={<Navigate to="/apps" />} />
          {/* pages added in Tasks 17/18 */}
          <Route path="*" element={<div className="page">Not found</div>} />
        </Routes>
      </Layout>
    </ToastProvider>
  )
}
```

- [ ] **Step 13: Typecheck + run dev server**

Run: `cd app && pnpm install && pnpm typecheck && pnpm dev`
Expected: Vite serves at http://localhost:5173; login page renders in the dark theme matching the prototype.

- [ ] **Step 14: Commit**

```bash
git add app
git commit -m "feat(app): scaffold + design system ported from prototype + auth/clients"
```

---

## Task 17: `app/` - Applications pages (app-grid + create modal + detail) (M3)

**Design reference:** `docs/prototype/index.html` `#page-apps` (`.app-grid`/`.app-card`) and `#page-app-detail` (`.detail-grid`/`.info-list`/`.side-panel`). Use the primitives from Task 16.

**Files:**
- Create: `app/src/pages/Apps.tsx`
- Create: `app/src/pages/AppDetail.tsx`
- Modify: `app/src/App.tsx` (add routes)

- [ ] **Step 1: Create `app/src/pages/Apps.tsx`** (app-grid cards + create modal)

```tsx
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { useToast } from '../components/Toast'
import { Button, Panel, Modal, Field } from '../components/ui/primitives'
import type { Application } from '@traceability/protocol'

export function Apps() {
  const [apps, setApps] = useState<Application[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('master')
  const nav = useNavigate()
  const toast = useToast()

  const load = () => apiFetch<Application[]>('/api/apps').then(setApps).catch((e) => toast(String(e)))
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!name.trim()) { toast('Enter an application name'); return }
    const app = await apiFetch<Application>('/api/apps', {
      method: 'POST', body: JSON.stringify({ name, repoUrl, defaultBranch: branch }),
    })
    setShowCreate(false); setName(''); setRepoUrl(''); setBranch('master')
    toast('Application created')
    nav(`/apps/${app.id}`)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Applications</h1>
          <p className="page-subtitle">Manage monitored apps, repositories and ingestion endpoints.</p>
        </div>
        <div className="header-actions">
          <Button variant="primary" onClick={() => setShowCreate(true)}>New application</Button>
        </div>
      </div>
      {apps.length === 0 ? (
        <div className="empty">No applications yet. Create one to get a DSN.</div>
      ) : (
        <div className="app-grid">
          {apps.map((a) => (
            <article key={a.id} className="app-card" onClick={() => nav(`/apps/${a.id}`)}>
              <div className="app-top">
                <div className="app-icon">{a.name.slice(0, 2).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="app-name">{a.name}</div>
                  <div className="app-repo">{a.repoUrl}</div>
                </div>
                <span className="badge fixed" style={{ marginLeft: 'auto' }}><span className="dot"></span>Live</span>
              </div>
              <div className="app-stats">
                <div className="app-stat"><b>{a.defaultBranch}</b><span>Default branch</span></div>
                <div className="app-stat"><b>{a.id.slice(0, 6)}</b><span>App ID</span></div>
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal
        show={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create application"
        subtitle="Connect a repository and generate its appId and DSN."
        footer={<>
          <Button onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button variant="primary" onClick={create}>Create application</Button>
        </>}
      >
        <Field label="Application name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. customer-portal" />
        <Field label="Repository URL" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="git@git.example.com:team/repo.git" />
        <Field label="Default branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
      </Modal>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/src/pages/AppDetail.tsx`** (info-list + side-panel, matches `#page-app-detail`)

```tsx
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { useToast } from '../components/Toast'
import { Button } from '../components/ui/primitives'
import type { Application } from '@traceability/protocol'

export function AppDetail() {
  const { id } = useParams<{ id: string }>()
  const [app, setApp] = useState<Application | null>(null)
  const nav = useNavigate()
  const toast = useToast()
  useEffect(() => {
    if (id) apiFetch<Application>(`/api/apps/${id}`).then(setApp).catch((e) => toast(String(e)))
  }, [id])
  if (!app) return <div className="page"><div className="empty">Loading…</div></div>

  const dsn = `${location.origin.replace(/:\d+$/, ':3000')}/api/ingest/envelope/${app.id}`

  const del = async () => {
    await apiFetch(`/api/apps/${app.id}`, { method: 'DELETE' })
    toast('Application deleted')
    nav('/apps')
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Button sm onClick={() => nav('/apps')}>← Applications</Button>
          <h1 className="page-title" style={{ marginTop: 18 }}>{app.name}</h1>
          <p className="page-subtitle">{app.defaultBranch} · created {new Date(app.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="header-actions">
          <Button variant="primary" onClick={() => nav(`/issues?appId=${app.id}`)}>View issues</Button>
        </div>
      </div>
      <div className="detail-grid">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">SDK connection</div>
            <span className="badge fixed" style={{ marginLeft: 'auto' }}><span className="dot"></span>Receiving events</span>
          </div>
          <div className="info-list">
            <div className="info-row"><div className="info-key">App ID</div><div className="info-value">{app.id}</div></div>
            <div className="info-row"><div className="info-key">DSN</div><div className="info-value">{dsn}</div></div>
            <div className="info-row"><div className="info-key">Repository</div><div className="info-value">{app.repoUrl}</div></div>
            <div className="info-row"><div className="info-key">Default branch</div><div className="info-value">{app.defaultBranch}</div></div>
          </div>
        </div>
        <aside className="side-panel">
          <div className="side-section">
            <div className="side-label">Created</div>
            <div className="side-value">{new Date(app.createdAt).toLocaleString()}</div>
          </div>
          <div className="side-section">
            <Button variant="danger" className="full" onClick={del}>Delete application</Button>
          </div>
        </aside>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire routes in `app/src/App.tsx`**

Add imports near the top:
```ts
import { Apps } from './pages/Apps'
import { AppDetail } from './pages/AppDetail'
```
Replace the placeholder routes block:
```tsx
          {/* pages added in Tasks 17/18 */}
          <Route path="*" element={<div className="page">Not found</div>} />
```
with:
```tsx
          <Route path="/apps" element={<Apps />} />
          <Route path="/apps/:id" element={<AppDetail />} />
          <Route path="*" element={<Navigate to="/apps" />} />
```

- [ ] **Step 4: Typecheck + dev run**

Run: `cd app && pnpm typecheck && pnpm dev`
Expected: `/apps` shows the app-grid with a "New application" button opening the modal; creating an app navigates to its detail page showing the DSN.

- [ ] **Step 5: Commit**

```bash
git add app
git commit -m "feat(app): applications grid + create modal + detail page"
```

---

## Task 18: `app/` - Issues + Issue detail (tabs) + Fix session (timeline) + Settings (M3 + M5)

**Design reference:** `docs/prototype/index.html` `#page-issues` (`.metrics`/`.toolbar`/`.data-table`), `#page-issue-detail` (`.issue-heading`/`.tabs`/`.side-panel`), `#page-fix` (`.command`/`.patch-file`/`.timeline`), `#page-settings` (`.code` snippet).

**Files:**
- Create: `app/src/pages/Issues.tsx`
- Create: `app/src/pages/IssueDetail.tsx`
- Create: `app/src/pages/FixSession.tsx`
- Create: `app/src/pages/Settings.tsx`
- Modify: `app/src/App.tsx` (add routes)

- [ ] **Step 1: Create `app/src/pages/Issues.tsx`** (metrics + toolbar + data-table)

```tsx
import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { onIssueEvent } from '../ws/client'
import { Button } from '../components/ui/primitives'
import type { Issue, IssueStatus } from '@traceability/protocol'

export function Issues() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const appId = params.get('appId') ?? ''
  const status = (params.get('status') ?? 'all') as 'all' | IssueStatus
  const [q, setQ] = useState('')
  const [issues, setIssues] = useState<Issue[]>([])

  const load = () => {
    const qs = new URLSearchParams()
    if (appId) qs.set('appId', appId)
    qs.set('limit', '100')
    apiFetch<{ items: Issue[] }>(`/api/issues?${qs}`).then((r) => setIssues(r.items))
  }
  useEffect(() => { load() }, [appId])
  useEffect(() => onIssueEvent(() => load()), [])

  const filtered = useMemo(() => {
    return issues.filter((i) => {
      if (status !== 'all' && i.status !== status) return false
      if (q && !`${i.title} ${i.id} ${i.metadata.message ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false
      return true
    })
  }, [issues, status, q])

  const open = issues.filter((i) => i.status === 'open').length
  const fixing = issues.filter((i) => i.status === 'fix-manual' || i.status === 'fixing').length
  const fixed = issues.filter((i) => i.status === 'fixed').length
  const events24h = issues.reduce((n, i) => n + i.count, 0)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Issues</h1>
          <p className="page-subtitle">Triage errors across all monitored applications.</p>
        </div>
        <div className="header-actions">
          <Button variant="primary" onClick={() => nav('/apps')}>Manage applications</Button>
        </div>
      </div>
      <div className="metrics">
        <div className="metric"><div className="metric-label">Open issues</div><div className="metric-value">{open}</div></div>
        <div className="metric"><div className="metric-label">Events · total</div><div className="metric-value">{events24h}</div></div>
        <div className="metric"><div className="metric-label">Fixing</div><div className="metric-value">{fixing}</div></div>
        <div className="metric"><div className="metric-label">Resolved</div><div className="metric-value">{fixed}</div></div>
      </div>
      <div className="toolbar">
        <div className="search">
          <span>⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search issues…" />
        </div>
        <select className="select" value={appId} onChange={(e) => setParams(e.target.value ? { appId: e.target.value } : {})}>
          <option value="">All applications</option>
        </select>
        <select className="select" value={status} onChange={(e) => setParams({ ...(appId ? { appId } : {}), status: e.target.value })}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="fix-manual">Fix requested</option>
          <option value="fixing">Fixing</option>
          <option value="fixed">Fixed</option>
        </select>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div className="panel-title">All issues</div>
          <div className="panel-meta">{filtered.length} issue{filtered.length === 1 ? '' : 's'}</div>
        </div>
        <table className="data-table">
          <thead><tr><th>Issue</th><th>Status</th><th>Events</th><th>Last seen</th></tr></thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className="clickable" onClick={() => nav(`/issues/${i.id}`)}>
                <td>
                  <div className="issue-main">
                    <span className={`severity ${i.type === 'error' ? '' : 'warn'}`}></span>
                    <div>
                      <div className="issue-title">{i.title}</div>
                      <div className="issue-sub">{i.id.slice(0, 8)} · {i.appId.slice(0, 8)}</div>
                    </div>
                  </div>
                </td>
                <td><span className={`badge ${i.status === 'open' ? 'open' : i.status === 'fixed' ? 'fixed' : 'fixing'}`}><span className="dot"></span>{i.status === 'open' ? 'Open' : i.status === 'fixed' ? 'Fixed' : 'Fix requested'}</span></td>
                <td className="muted">{i.count}</td>
                <td className="muted">{new Date(i.lastSeen).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty">No issues match these filters.</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/src/pages/IssueDetail.tsx`** (issue-heading + tabs + side-panel + fix modal)

```tsx
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { useToast } from '../components/Toast'
import { Button, Modal } from '../components/ui/primitives'
import type { Issue, Event } from '@traceability/protocol'

type Tab = 'stack' | 'events' | 'context' | 'breadcrumbs'

export function IssueDetail() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const toast = useToast()
  const [issue, setIssue] = useState<Issue | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [tab, setTab] = useState<Tab>('stack')
  const [showFix, setShowFix] = useState(false)

  const load = () => {
    if (!id) return
    apiFetch<Issue>(`/api/issues/${id}`).then(setIssue).catch((e) => toast(String(e)))
    apiFetch<Event[]>(`/api/issues/${id}/events`).then(setEvents).catch(() => {})
  }
  useEffect(() => { load() }, [id])

  const startFix = async () => {
    if (!id) return
    await apiFetch(`/api/issues/${id}/fix-request`, { method: 'POST' })
    setShowFix(false)
    toast('AI repair session started')
    nav(`/fix/${id}`)
  }

  if (!issue) return <div className="page"><div className="empty">Loading…</div></div>

  return (
    <div className="page">
      <div className="issue-heading">
        <span className={`severity ${issue.type === 'error' ? '' : 'warn'}`}></span>
        <div style={{ flex: 1 }}>
          <h1>{issue.title}</h1>
          <div className="issue-id">{issue.id.slice(0, 8)} · {issue.appId.slice(0, 8)} · {issue.type}</div>
        </div>
        <div className="header-actions">
          <Button variant="primary" onClick={() => setShowFix(true)}>Start AI fix</Button>
        </div>
      </div>
      <div className="detail-grid">
        <div className="panel">
          <div className="tabs">
            {(['stack', 'events', 'context', 'breadcrumbs'] as Tab[]).map((t) => (
              <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t === 'stack' ? 'Stack trace' : t === 'events' ? `Events · ${events.length}` : t === 'context' ? 'Context' : 'Breadcrumbs'}
              </button>
            ))}
          </div>
          <div className={`tab-pane ${tab === 'stack' ? 'active' : ''}`}>
            <pre className="code">{issue.metadata.stacktrace ?? issue.metadata.message ?? '(no stacktrace)'}</pre>
          </div>
          <div className={`tab-pane ${tab === 'events' ? 'active' : ''}`}>
            <div className="info-list">
              {events.map((e) => (
                <div className="info-row" key={e.id}>
                  <div className="info-key">{new Date(e.receivedAt).toLocaleTimeString()}</div>
                  <div className="info-value">{e.envelope.slice(0, 120)}…</div>
                </div>
              ))}
              {events.length === 0 && <div className="empty">No events.</div>}
            </div>
          </div>
          <div className={`tab-pane ${tab === 'context' ? 'active' : ''}`}>
            <div className="info-list">
              <div className="info-row"><div className="info-key">type</div><div className="info-value">{issue.type}</div></div>
              <div className="info-row"><div className="info-key">fingerprint</div><div className="info-value">{issue.fingerprint}</div></div>
              <div className="info-row"><div className="info-key">context</div><div className="info-value">{JSON.stringify(issue.metadata.context ?? {})}</div></div>
            </div>
          </div>
          <div className={`tab-pane ${tab === 'breadcrumbs' ? 'active' : ''}`}>
            <div className="empty">Breadcrumbs are captured inside each event envelope (see Events tab).</div>
          </div>
        </div>
        <aside className="side-panel">
          <div className="side-section">
            <div className="side-label">Status</div>
            <span className={`badge ${issue.status === 'open' ? 'open' : issue.status === 'fixed' ? 'fixed' : 'fixing'}`}><span className="dot"></span>{issue.status}</span>
            <div className="side-label">First seen</div>
            <div className="side-value">{new Date(issue.firstSeen).toLocaleString()}</div>
            <div className="side-label">Last seen</div>
            <div className="side-value">{new Date(issue.lastSeen).toLocaleString()}</div>
            <div className="side-label">Total events</div>
            <div className="side-value">{issue.count} events</div>
          </div>
          {issue.status !== 'open' && issue.status !== 'fixed' && (
            <div className="side-section">
              <Button variant="primary" className="full" onClick={() => nav(`/fix/${issue.id}`)}>View fix session</Button>
            </div>
          )}
        </aside>
      </div>
      <Modal
        show={showFix}
        onClose={() => setShowFix(false)}
        title="Start AI-assisted fix?"
        subtitle="This changes the issue status to Fix requested."
        footer={<>
          <Button onClick={() => setShowFix(false)}>Cancel</Button>
          <Button variant="primary" onClick={startFix}>Start AI fix</Button>
        </>}
      >
        <p className="muted">Traceability will prepare the issue context for your coding agent. No branch, commit or merge request will be created automatically.</p>
      </Modal>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/src/pages/FixSession.tsx`** (command + patch + timeline, matches `#page-fix`)

```tsx
import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { useToast } from '../components/Toast'
import { Button } from '../components/ui/primitives'
import type { Issue } from '@traceability/protocol'

export function FixSession() {
  const { issueId } = useParams<{ issueId: string }>()
  const nav = useNavigate()
  const toast = useToast()
  const [issue, setIssue] = useState<Issue | null>(null)

  const load = () => {
    if (issueId) apiFetch<Issue>(`/api/issues/${issueId}`).then(setIssue).catch((e) => toast(String(e)))
  }
  useEffect(() => { load() }, [issueId])
  if (!issue) return <div className="page"><div className="empty">Loading…</div></div>

  const cliCmd = `traceability issue show ${issue.id} --json`
  const markFixed = async () => {
    await apiFetch(`/api/issues/${issue.id}/mark-fixed`, { method: 'POST' })
    toast('Issue marked as fixed')
    load()
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(cliCmd); toast('CLI command copied') } catch { toast('Select the command to copy') }
  }

  const done = issue.status === 'fixed'
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Button sm onClick={() => nav(`/issues/${issue.id}`)}>← Issue {issue.id.slice(0, 8)}</Button>
          <h1 className="page-title" style={{ marginTop: 18 }}>AI repair session</h1>
          <p className="page-subtitle">The server is ready for a coding agent to retrieve issue context.</p>
        </div>
        <span className={`badge ${done ? 'fixed' : 'fixing'}`}><span className="dot"></span>{done ? 'Fixed' : 'Fix requested'}</span>
      </div>
      <div className="detail-grid">
        <div>
          <div className="panel" style={{ marginBottom: 18 }}>
            <div className="panel-head"><div className="panel-title">Continue in your coding agent</div></div>
            <div style={{ padding: 18 }}>
              <p className="muted" style={{ marginTop: 0 }}>Run this command in the application repository. The agent will receive the stack trace, event context and reproduction evidence.</p>
              <div className="command">
                <code>{cliCmd}</code>
                <Button sm onClick={copy}>Copy</Button>
              </div>
              <p className="muted" style={{ marginTop: 16 }}>After the agent produces a patch:</p>
              <div className="command" style={{ display: 'block', whiteSpace: 'pre', overflow: 'auto' }}>
                <code>{`traceability issue attach-patch ${issue.id} --patch ./fix.diff --branch fix-${issue.id.slice(0, 6)}
traceability issue mark-fixed ${issue.id}`}</code>
              </div>
            </div>
          </div>
        </div>
        <aside className="side-panel">
          <div className="panel-head"><div className="panel-title">Progress</div></div>
          <div className="timeline">
            <div className={`timeline-item ${issue.status !== 'open' ? 'done' : ''}`}>
              <div className="timeline-mark"></div>
              <div><div className="timeline-title">Fix requested</div><div className="timeline-time">{new Date(issue.lastSeen).toLocaleTimeString()}</div></div>
            </div>
            <div className={`timeline-item ${issue.status === 'fixing' || issue.status === 'fixed' ? 'done' : ''}`}>
              <div className="timeline-mark"></div>
              <div><div className="timeline-title">Issue retrieved by agent</div><div className="timeline-time">{issue.status === 'fixing' || issue.status === 'fixed' ? 'in progress' : 'Waiting'}</div></div>
            </div>
            <div className={`timeline-item ${issue.status === 'fixed' ? 'done' : ''}`}>
              <div className="timeline-mark"></div>
              <div><div className="timeline-title">Marked as fixed</div><div className="timeline-time">{done ? 'Done' : 'Waiting'}</div></div>
            </div>
          </div>
          {!done && (
            <div className="side-section">
              <Button variant="primary" className="full" onClick={markFixed}>Mark as fixed</Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `app/src/pages/Settings.tsx`** (SDK setup snippet, matches `#page-settings`)

```tsx
import React from 'react'
import { Panel } from '../components/ui/primitives'

export function Settings() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">SDK setup</h1>
          <p className="page-subtitle">Connect a web, React, Electron or Module Federation application.</p>
        </div>
      </div>
      <Panel title="Install @traceability/core">
        <pre className="code">
{`pnpm add @traceability/core @sentry/browser

import { init } from '@traceability/core'

init({
  dsn: 'http://localhost:3000',
  appId: '<appId from the application detail page>',
  token: '<api token>',
  environment: 'production',
  whiteScreen: { stableWindowMs: 500 }
})`}
        </pre>
      </Panel>
    </div>
  )
}
```

- [ ] **Step 5: Wire routes in `app/src/App.tsx`**

Add imports:
```ts
import { Issues } from './pages/Issues'
import { IssueDetail } from './pages/IssueDetail'
import { FixSession } from './pages/FixSession'
import { Settings } from './pages/Settings'
```
Replace the `<Route path="/apps/:id" .../>` + wildcard block from Task 17 with:
```tsx
          <Route path="/apps/:id" element={<AppDetail />} />
          <Route path="/issues" element={<Issues />} />
          <Route path="/issues/:id" element={<IssueDetail />} />
          <Route path="/fix/:issueId" element={<FixSession />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/apps" />} />
```

- [ ] **Step 6: Typecheck + dev run**

Run: `cd app && pnpm typecheck && pnpm dev`
Expected: `/issues` shows metrics + filterable data-table; clicking a row opens issue detail with tabs; "Start AI fix" opens the confirmation modal then navigates to the fix session with the CLI command + timeline; `/settings` shows the SDK snippet.

- [ ] **Step 7: Commit**

```bash
git add app
git commit -m "feat(app): issues + issue detail tabs + fix session timeline + settings"
```

---

---

## Task 19: `packages/skills` — instrumentation + diagnose-issue + add-boundary (M6)

**Files:**
- Create: `packages/skills/instrumentation/SKILL.md`
- Create: `packages/skills/instrumentation/README.md`
- Create: `packages/skills/instrumentation/references/core-api.md`
- Create: `packages/skills/instrumentation/references/event-types.md`
- Create: `packages/skills/instrumentation/assets/templates/report-event.ts`
- Create: `packages/skills/diagnose-issue/SKILL.md`
- Create: `packages/skills/diagnose-issue/README.md`
- Create: `packages/skills/diagnose-issue/scripts/fetch-issue.sh`
- Create: `packages/skills/add-boundary/SKILL.md`
- Create: `packages/skills/add-boundary/README.md`

- [ ] **Step 1: Create `packages/skills/instrumentation/SKILL.md`**

```markdown
---
name: traceability-instrumentation
description: Use when the user asks to add instrumentation/monitoring/collection (埋点/监控/采集) to a feature or code path. Teaches how to call @traceability/core APIs at the right call sites.
---

# Instrumentation Skill

When the user says something like "在 XX 功能加埋点 / 加监控 / 加采集" or "add logging/tracing to X", follow this workflow.

## 1. Identify the call site

Find the function / handler / lifecycle method that bounds the feature the user named. Instrumentation belongs at:
- Function entry/exit (timing + errors)
- State transitions (before/after)
- Network call boundaries (before fetch, on success, on error)

## 2. Choose the API

Import from `@traceability/core` (or `@traceability/react` if in a React component):

```ts
import { report, setTag, addBreadcrumb, captureException } from '@traceability/core'
```

- `report({ type, payload, tags })` — custom event with a stable `type`
- `addBreadcrumb({ category, message, level, data })` — attaches context to the next error event
- `setTag(key, value)` — tags all subsequent events (e.g. `setTag('feature', 'message-send')`)
- `captureException(err)` — report a caught error with stacktrace

See `references/core-api.md` for the full signature, and `references/event-types.md` for naming conventions.

## 3. Instrument

Wrap the call site:

```ts
import { report, addBreadcrumb, captureException } from '@traceability/core'

async function sendMessage(msg: Message) {
  addBreadcrumb({ category: 'message', message: 'send start', data: { id: msg.id } })
  try {
    await api.post('/messages', msg)
    report({ type: 'message-sent', payload: { id: msg.id }, tags: { feature: 'message' } })
  } catch (err) {
    report({ type: 'message-send-failed', payload: { id: msg.id, error: String(err) }, tags: { feature: 'message' } })
    captureException(err)
    throw err
  }
}
```

## 4. Verify

- Ensure `init({ dsn, appId, token })` is called once at app startup (usually in `main.ts`).
- Trigger the feature manually; check the Traceability Inbox (or `traceability issue list --appId <id>`) for the new event.
- Use a stable `type` string so events aggregate into one issue.

## 5. Commit

Commit the instrumentation with a `feat:` or `chore:` message referencing the feature.
```

- [ ] **Step 2: Create `packages/skills/instrumentation/README.md`**

```markdown
# traceability-instrumentation

Teaches a coding agent how to add monitoring instrumentation to application code using `@traceability/core`.

## When it triggers
- "在 XX 功能加埋点"
- "add monitoring/logging to X"
- "track when Y happens"

## Files
- `SKILL.md` — workflow the agent follows
- `references/core-api.md` — full API reference
- `references/event-types.md` — recommended event `type` naming
- `assets/templates/report-event.ts` — copy-paste template
```

- [ ] **Step 3: Create `packages/skills/instrumentation/references/core-api.md`**

```markdown
# @traceability/core API reference

## init(opts)
```ts
init({
  dsn: string       // server base URL
  appId: string     // from Traceability app creation
  token: string     // API token
  release?: string
  environment?: string
  user?: { id: string }
})
```
Call once at app startup.

## report(data)
```ts
report({ type: string, payload?: Record<string, unknown>, tags?: Record<string, string> })
```
Custom event. `type` must be a stable string for aggregation.

## captureException(err)
Report an error with its stacktrace.

## captureMessage(msg, opts?)
Report a free-form message.

## setTag(key, value) / setContext(key, obj) / addBreadcrumb(crumb)
Attach context to subsequent events.

## setApp(appName)  (MF only)
Tag subsequent events with the current micro-app name.

## installGlobalProxy()  (MF host only)
Call once in the host app to install shared proxies.
```

- [ ] **Step 4: Create `packages/skills/instrumentation/references/event-types.md`**

```markdown
# Event type naming

Use `kebab-case`, feature-prefixed, action-suffixed:

- `<feature>-<action>` for success: `message-sent`, `call-connected`
- `<feature>-<action>-failed` for failure: `message-send-failed`, `call-signaling-failed`
- `<feature>-<state>` for state: `agent-status-change`, `ws-disconnected`

Avoid generic types like `log` or `event` — they won't aggregate cleanly.
```

- [ ] **Step 5: Create `packages/skills/instrumentation/assets/templates/report-event.ts`**

```ts
import { report, addBreadcrumb, captureException } from '@traceability/core'

// Template: instrument an async operation
export async function instrumentedOperation<T>(
  feature: string,
  action: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>,
): Promise<T> {
  addBreadcrumb({ category: feature, message: `${action} start`, data: context })
  try {
    const result = await fn()
    report({ type: `${feature}-${action}`, payload: { ...context }, tags: { feature } })
    return result
  } catch (err) {
    report({ type: `${feature}-${action}-failed`, payload: { ...context, error: String(err) }, tags: { feature } })
    captureException(err)
    throw err
  }
}
```

- [ ] **Step 6: Create `packages/skills/diagnose-issue/SKILL.md`**

```markdown
---
name: traceability-diagnose-issue
description: Use when the user gives a Traceability issue id and asks to diagnose / fix / investigate it. Walks the agent through pulling the issue, locating the code, adding diagnostic breadcrumbs, and producing a patch.
---

# Diagnose Issue Skill

When the user says "诊断 / 修复 / 排查 issue <id>" or "investigate issue <id>", follow this workflow.

## 1. Fetch the issue

```bash
traceability issue show <id> --json
```
Read `metadata.stacktrace`, `metadata.message`, `metadata.context`, and `tags.appName`.

## 2. Locate the code

Parse the stacktrace's top frames. Open the files at the given `filename:lineno`. Identify the function and the failing expression.

## 3. Add temporary diagnostic instrumentation (optional)

If the root cause is unclear, wrap the suspected call site with `addBreadcrumb` (see `instrumentation` skill) to capture the inputs/state next time it runs. Deploy, let it reproduce, then re-fetch the issue events.

## 4. Produce a fix

Edit the code to fix the root cause. Re-run the project's tests.

## 5. Submit the patch

```bash
git diff > ./fix.diff
traceability issue attach-patch <id> --patch ./fix.diff --branch fix-<id-prefix>
traceability issue mark-fixed <id>
```

The human reviewer will push the branch and open the MR (v1 does not auto-open MRs).

## 6. Report

Tell the user the branch name and that the issue is marked fixed in the Inbox.
```

- [ ] **Step 7: Create `packages/skills/diagnose-issue/README.md`**

```markdown
# traceability-diagnose-issue

Walks a coding agent through diagnosing a Traceability issue and producing a patch.

## When it triggers
- "诊断 issue abc123"
- "fix issue <id>"
- "investigate this error"

## Files
- `SKILL.md` — workflow
- `scripts/fetch-issue.sh` — wrapper that calls `traceability issue show --json`
```

- [ ] **Step 8: Create `packages/skills/diagnose-issue/scripts/fetch-issue.sh`**

```bash
#!/usr/bin/env bash
# Usage: fetch-issue.sh <issueId>
# Requires: traceability CLI installed and configured (traceability config set)
set -euo pipefail
ISSUE_ID="${1:?usage: fetch-issue.sh <issueId>}"
traceability issue show "$ISSUE_ID" --json
```

Make it executable: `chmod +x packages/skills/diagnose-issue/scripts/fetch-issue.sh`

- [ ] **Step 9: Create `packages/skills/add-boundary/SKILL.md`**

```markdown
---
name: traceability-add-boundary
description: Use when the user asks to add an error boundary to a React component (加错误边界). Teaches how to wrap with MonitorErrorBoundary from @traceability/react.
---

# Add Error Boundary Skill

When the user says "给 X 组件加错误边界" or "add an error boundary to X", follow this.

## 1. Import

```tsx
import { MonitorErrorBoundary } from '@traceability/react'
```

## 2. Wrap the target component

```tsx
<MonitorErrorBoundary appName="message-module" fallback={<ErrorUI />}>
  <MessageApp />
</MonitorErrorBoundary>
```

- `appName` tags captured errors with the owning module (useful in MF).
- `fallback` is rendered when the tree throws. It can be a node or a render-prop receiving `{ error, componentStack, resetError }`.

## 3. Recommended placement

- One boundary around each route-level component.
- One boundary around each MF micro-app root.
- Optionally one boundary around flaky subtrees (third-party widgets).

## 4. Verify

Throw inside the wrapped component in dev; confirm an error issue appears in the Traceability Inbox and the fallback UI renders.

## 5. Commit

Commit with `feat: add error boundary to <component>`.
```

- [ ] **Step 10: Create `packages/skills/add-boundary/README.md`**

```markdown
# traceability-add-boundary

Teaches a coding agent how to wrap a React component with `MonitorErrorBoundary` from `@traceability/react`.

## When it triggers
- "给 X 组件加错误边界"
- "add an error boundary to X"

## Files
- `SKILL.md` — workflow
```

- [ ] **Step 11: Commit**

```bash
git add packages/skills
git commit -m "feat(skills): instrumentation + diagnose-issue + add-boundary skills"
```

---

## Task 20: End-to-end verification + README (M6)

**Files:**
- Create: `README.md` (root)

- [ ] **Step 1: Write root `README.md`**

````markdown
# Traceability

Sentry-based web/electron/mf monitoring + exception-to-fix loop.

## Packages

| Path | Description |
|---|---|
| `packages/core` | Thin wrapper over `@sentry/browser` + self-built integrations + server transport |
| `packages/react` | `MonitorErrorBoundary` + hooks |
| `packages/electron` | Electron main/renderer/preload |
| `packages/cli` | `traceability` CLI client for the server |
| `packages/skills` | Coding-agent skills (instrumentation / diagnose-issue / add-boundary) |
| `packages/protocol` | Shared TS types |
| `app` | Inbox Web UI (React + Vite) |
| `server` | Self-hosted Sentry-envelope ingest + issue store + REST/WS API |

## Quick start

```bash
pnpm install
pnpm -r run build

# 1. start server
export TRACEABILITY_API_TOKEN=dev-token
cd server && pnpm dev &          # http://localhost:3000

# 2. create an app
cd ../packages/cli && node dist/index.js config set --server http://localhost:3000 --token dev-token
node dist/index.js app create --name demo --repo-url git@x:demo.git --branch main --json
# copy the appId

# 3. start the Inbox UI
cd ../../app && pnpm dev &        # http://localhost:5173
# login with server=http://localhost:3000 token=dev-token
```

## Integrating the SDK

```ts
import { init, report } from '@traceability/core'

init({
  dsn: 'http://localhost:3000',
  appId: '<appId from the Inbox>',
  token: 'dev-token',
  release: '1.0.0',
})

// custom event
report({ type: 'feature-action', payload: { foo: 1 }, tags: { feature: 'demo' } })
```

## The fix loop

1. SDK reports an exception → server aggregates into an issue → Inbox shows it.
2. Developer clicks **Start AI Fix** in the Inbox → issue status becomes `fix-manual`.
3. The Fix Session page shows the CLI command to run locally.
4. A coding agent runs `traceability issue show <id> --json`, edits code, then `attach-patch` + `mark-fixed`.
5. The Inbox shows `fixing` → `fixed`. The developer pushes the branch and opens the MR (v1 does not auto-open MRs).
````

- [ ] **Step 2: Full build**

Run: `pnpm install && pnpm -r run build`
Expected: every package builds; `server/dist/index.js`, `packages/cli/dist/index.js`, `packages/core/dist/index.js` exist.

- [ ] **Step 3: End-to-end test script**

```bash
export TRACEABILITY_API_TOKEN=dev-token
(cd server && pnpm dev &) ; sleep 3
(cd packages/cli && node dist/index.js config set --server http://localhost:3000 --token dev-token)
APP_JSON=$(cd packages/cli && node dist/index.js app create --name e2e --repo-url git@x:e2e.git --branch main --json)
APP_ID=$(echo "$APP_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
# ingest a fake error envelope
printf '%s\n%s\n%s\n' \
  '{"sent_at":"2026-01-01T00:00:00Z","dsn":"https://x@ingest/1"}' \
  '{"type":"event"}' \
  '{"event_id":"e1","type":"error","exception":{"values":[{"type":"TypeError","value":"e2e boom"}]}}' \
  | curl -s -X POST "http://localhost:3000/api/ingest/envelope/$APP_ID" -H "Authorization: Bearer dev-token" --data-binary @-
# verify issue in list
(cd packages/cli && node dist/index.js issue list --appId "$APP_ID" --json)
# fix-request + attach-patch + mark-fixed
ISSUE_ID=$(cd packages/cli && node dist/index.js issue list --appId "$APP_ID" --json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).items[0].id))")
(cd packages/cli && node dist/index.js issue fix-request "$ISSUE_ID")
echo "fix" > /tmp/fix.diff
(cd packages/cli && node dist/index.js issue attach-patch "$ISSUE_ID" --patch /tmp/fix.diff --branch fix-e2e)
(cd packages/cli && node dist/index.js issue mark-fixed "$ISSUE_ID")
(cd packages/cli && node dist/index.js issue show "$ISSUE_ID" --json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d).status;console.log('final status:',s);process.exit(s==='fixed'?0:1)})")
kill %1 2>/dev/null
```
Expected: final status prints `fixed`; exit 0.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: root README + e2e verification"
```

---

## Task 21: `examples/` - demo project integrating the SDK (M6)

**Goal:** A runnable demo that integrates `@traceability/core` and exercises every reportable event against a local server, so the SDK and the full ingest→Inbox loop can be verified end-to-end without writing app code.

**Files:**
- Create: `examples/package.json`
- Create: `examples/web-demo/package.json`
- Create: `examples/web-demo/vite.config.ts`
- Create: `examples/web-demo/index.html`
- Create: `examples/web-demo/src/main.ts`
- Create: `examples/README.md`

**Interfaces:**
- Produces: `examples/web-demo` - a Vite vanilla-TS app that calls `@traceability/core` `init` + triggers error/white-screen/custom-report events. Documented to run against the local server + an appId created in the Inbox.

- [ ] **Step 1: Create `examples/package.json`** (workspace folder is itself a package so pnpm treats it as a root for the demos)

```json
{
  "name": "@traceability/examples",
  "version": "1.0.0",
  "private": true
}
```

- [ ] **Step 2: Add `examples/*` to `pnpm-workspace.yaml`**

Modify `pnpm-workspace.yaml` to:
```yaml
packages:
  - "packages/*"
  - "app"
  - "server"
  - "examples/*"
```

- [ ] **Step 3: Create `examples/web-demo/package.json`**

```json
{
  "name": "@traceability/example-web-demo",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@traceability/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 4: Create `examples/web-demo/vite.config.ts`**

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: 5174 },
})
```

- [ ] **Step 5: Create `examples/web-demo/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Traceability demo</title>
  </head>
  <body>
    <h1>Traceability SDK demo</h1>
    <p>Open the console. Each button fires an event to the local server.</p>
    <button id="err">Throw TypeError</button>
    <button id="promise">Unhandled promise rejection</button>
    <button id="white">Trigger white screen</button>
    <button id="custom">Custom report</button>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `examples/web-demo/src/main.ts`**

```ts
import { init, report, whiteScreenIntegration } from '@traceability/core'

// Replace these with a real appId (create an app in the Inbox at http://localhost:5173)
// and the server's API token (TRACEABILITY_API_TOKEN).
const APP_ID = localStorage.getItem('demo.appId') ?? 'REPLACE_WITH_APP_ID'
const TOKEN = localStorage.getItem('demo.token') ?? 'dev-token'

init({
  dsn: 'http://localhost:3000',
  appId: APP_ID,
  token: TOKEN,
  environment: 'demo',
  whiteScreen: { stableWindowMs: 500, minContentNodes: 3 },
})

// opt-in white screen integration
// (init already accepts whiteScreen options; this explicit integration is for demo clarity)
void whiteScreenIntegration

document.querySelector('#err')!.addEventListener('click', () => {
  throw new TypeError('demo: Cannot read properties of undefined')
})
document.querySelector('#promise')!.addEventListener('click', () => {
  void Promise.reject(new Error('demo: unhandled rejection'))
})
document.querySelector('#white')!.addEventListener('click', () => {
  document.getElementById('root')!.innerHTML = ''
})
document.querySelector('#custom')!.addEventListener('click', () => {
  report({ type: 'demo-custom-event', payload: { at: Date.now() }, tags: { feature: 'demo' } })
})
```

- [ ] **Step 7: Create `examples/README.md`**

````markdown
# Traceability examples

Runnable demos that integrate `@traceability/core` against a local server.

## web-demo

A vanilla Vite + TypeScript app that fires each reportable event type.

### Prerequisites

1. Start the server (from repo root):
   ```bash
   export TRACEABILITY_API_TOKEN=dev-token
   cd server && pnpm dev
   ```
2. Start the Inbox UI and create an application, copy its `appId`:
   ```bash
   cd app && pnpm dev
   ```
   Open http://localhost:5173, log in (server=http://localhost:3000, token=dev-token), create an app, copy the App ID.

### Run the demo

```bash
cd examples/web-demo
pnpm install
pnpm dev
```

Open http://localhost:5174. In the browser console set the appId/token if needed:

```js
localStorage.setItem('demo.appId', '<paste appId>')
localStorage.setItem('demo.token', 'dev-token')
location.reload()
```

Click the buttons. Each fires an event that the server ingests and aggregates into an issue visible in the Inbox.

### Verify the loop

1. Click "Throw TypeError" → the Inbox Issues page shows a new `TypeError: demo...` issue (live via WebSocket).
2. Open the issue → "Start AI fix" → the Fix Session page shows `traceability issue show <id> --json`.
3. From a terminal:
   ```bash
   cd packages/cli
   node dist/index.js config set --server http://localhost:3000 --token dev-token
   node dist/index.js issue show <issueId> --json
   ```
````

- [ ] **Step 8: Install + run the demo**

Run: `pnpm install && cd examples/web-demo && pnpm dev`
Expected: Vite serves at http://localhost:5174; buttons render. With the server running and a real appId set, clicking "Throw TypeError" makes a new issue appear in the Inbox.

- [ ] **Step 9: Commit**

```bash
git add examples pnpm-workspace.yaml
git commit -m "feat(examples): web-demo integrating @traceability/core"
```

---

## Self-Review (completed)

**1. Spec coverage:**
- §2 architecture (core/server/app/cli/skills) -> Tasks 9–19 ✓
- §3 SDK design principles (generic, appId injection) -> Task 9 (`beforeSend` injects appId) ✓
- §4.1 core (init/transport/report/integrations) -> Tasks 9, 10, 11 ✓
- §4.1.1 whiteScreen -> Task 11 ✓
- §4.1.2 mfGuard (`installGlobalProxy`/`setApp`) -> Task 9 ⚠ PV single-report lock noted below
- §4.1.3 corsDiagnostic -> Task 10 ✓
- §4.2 react (ErrorBoundary/hook) -> Task 12 ✓
- §4.3 electron (main/renderer/preload) -> Task 13 ✓
- §4.4 cli (config/app/issue subcommands) -> Tasks 14, 15 ✓
- §4.5 skills (instrumentation/diagnose-issue/add-boundary) -> Task 19 ✓
- §4.6 app pages (login/apps/issues/fix/settings) -> Tasks 16, 17, 18 (now prototype-faithful) ✓
- §4.7 server (ingest/apps/issues/patches/ws/auth) -> Tasks 4, 5, 6, 7, 8 ✓
- §6 milestones M0–M6 -> mapped across Tasks 1–21 ✓
- **Prototype fidelity** (user requirement) -> Task 16 ports `docs/prototype/index.html` `<style>` into `app/src/styles.css`; Tasks 16/17/18 use the prototype's exact class names and reproduce its `#page-*` structures ✓
- **examples/** (user requirement) -> Task 21 ✓
- **pnpm** (user requirement) -> Global Constraints + all install commands use pnpm ✓

**Gap - mfGuard PV single-report lock:** Task 9 implements `installGlobalProxy`/`setApp` and appId+appName tagging, but the spec's `__MONITOR_ROUTE_LOCK__` 100ms PV dedup guard is NOT implemented (Sentry handles PV/session automatically). Acceptable for v1 because Inbox issues are driven by `error`/`message` events, not PV. Recommend a follow-up issue rather than blocking v1.

**2. Placeholder scan:** No "TBD"/"TODO" in executable steps. The styles.css step (Task 16 Step 3) points to the concrete `docs/prototype/index.html` file with an exhaustive class-name checklist - that is a concrete instruction, not a placeholder. ✓

**3. Type consistency:**
- `Application`/`Issue`/`Event`/`Patch`/`IssueStatus` defined in Task 2 (`@traceability/protocol`), consumed identically in Tasks 6, 8, 15, 16–18. ✓
- `InitOptions`/`ReportData` defined in Task 9, consumed in Tasks 12, 13, 21. ✓
- `createAppsRepo`/`createIssuesRepo`/`createBroadcaster` return types threaded via `ReturnType<typeof …>`. ✓
- `IssueEvent` defined locally in `app/src/ws/client.ts` (Task 16 Step 6) matching the server broadcaster (Task 7). ✓
- Status mapping: server `IssueStatus` (`open`/`fix-manual`/`fixing`/`fixed`/`ignored`) -> prototype badge classes (`open`/`fixing`/`fixed`) via `BADGE` map in `primitives.tsx` (Task 16 Step 7) and inline in Issues/IssueDetail (Task 18). `fix-manual` and `fixing` both render as `fixing`/"Fix requested"/"Fixing" - consistent. ✓

**4. Ambiguity:** `report()` signature `{ type, payload?, tags? }` consistent across core (Task 9), react (Task 12), skills (Task 19), examples (Task 21). ✓
