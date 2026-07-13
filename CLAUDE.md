# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` covers conventions in more detail; the essentials are summarized here. Two corrections to AGENTS.md: the **server is Express + `ws`, not Fastify**, and `.npmrc` contains only Electron mirror settings (there is no `node-linker=hoisted`).

## Commands

pnpm 10 workspace (`packageManager` pinned → `corepack enable` once). Node >= 20.

```bash
pnpm install
pnpm build              # build packages/* + server (tsc), then app (electron-vite)
pnpm dev:app            # Electron app dev (electron-vite, inspector on :5858)
# server dev:   cd server && pnpm dev          # tsx watch, http://localhost:3000
# cli dev:      cd packages/cli && pnpm dev    # tsx; or build then node dist/index.js

pnpm test               # vitest run across all packages (pnpm -r run test)
pnpm type-check         # tsc --noEmit per package
pnpm lint               # oxlint --fix   (no eslint/prettier in this repo)
pnpm format             # oxfmt --write
```

Per-package / single test:

```bash
pnpm --filter @traceability/server test -- src/__tests__/issues.test.ts
pnpm --filter @traceability/core exec vitest run -t "transport"
pnpm --filter @traceability/app typecheck
```

Lint/format run **only on commit** via husky + lint-staged (VS Code format-on-save is intentionally off). Commits must be Conventional Commits (`feat`, `fix`, `chore`, `docs`, …); commitlint enforces this with header/body length limits disabled.

## Architecture

Traceability connects frontend error capture to an AI-assisted fix loop. End-to-end flow:

```
SDK (@traceability/core) --Sentry envelope--> server /api/ingest/envelope/:appId
                                                | aggregates events into issues
                                                v
                                 server WS broadcast  <--->  Inbox (Electron app, VITE_SERVER_URL)
                                                |
   fix loop:  traceability issue show <id> --json  ->  agent edits code  ->  attach-patch + mark-fixed
```

**Monorepo** (pnpm workspace + catalog): `packages/*` (SDK + types + CLI + skills), `server`, `app`, `examples/*`. Shared versions live in the `catalog:` block of `pnpm-workspace.yaml` (typescript ^7, vitest ^4, tsx ^4) and are referenced as `"vitest": "catalog:"`. Internal deps use `"workspace:*"`; package names are `@traceability/<name>`.

**`@traceability/core`** wraps `@sentry/browser` with a custom bearer-token POST transport (`transport/serverTransport.ts`) targeting `/api/ingest/envelope/:appId`. `beforeSend` stamps `appId` and attaches an rrweb replay id; the public surface is `init` / `captureException` / `report` / `reportPerformance` / `setApp`. Integrations: CORS diagnostic, white-screen detection, rrweb replay, browser performance metrics (FCP/LCP/CLS/INP/TTFB).

**`server/`** — Express + `ws` + `better-sqlite3` + `drizzle-orm` + `pino` + Swagger. Domain-driven: each `src/domains/<name>/` has `db.ts` (drizzle queries), `service.ts` (logic), `router.ts` (Express routes with JSDoc consumed by Swagger). Domains: `apps`, `ingest`, `issues`, `performance`, `replays`, `source-maps`. Config via env: `PORT` (3000), `TRACEABILITY_DB_PATH` (`server/data/traceability.db`). `src/index.ts` wires middleware (request logging, cors, unified response envelope, swagger at `/api-docs`, global error handler) and attaches the WS broadcaster.

**`app/`** — Electron 39 + electron-vite + React 19 + Tailwind 4 + react-query + react-router. Three builds: `src/main` (Node), `src/preload` (the only main↔renderer bridge), `src/renderer` (browser; aliases `@renderer`, `@shared`). The **main process owns state**: `main/agent/` (`AgentPool`/`AgentRuntime`/`ModelRegistry`/`SessionStore`/`monitor`, built on `@earendil-works/pi-agent-core` + `pi-ai`) and `main/db/database.ts` (SQLite at `userData/traceability-agent.sqlite`). IPC handlers in `main/index.ts` are **zod-validated** and exposed through `preload/index.ts`; the typed contract lives in `shared/ipc.ts`. Renderer routes: `issues`, `issues/:id`, `performance`; the chat agent UI is under `renderer/features/agent-panel`. **Auth is disabled for the MVP** — the server accepts all requests (tokens ignored), and the app reads its backend from `VITE_SERVER_URL`.

> An in-progress migration (`docs/superpowers/plans/2026-07-13-agent-core-migration.md`) targets a flatter `main/` layout (`main/agent-*`, `main/sessions/`, split `shared/*-ipc.ts`). The current code is mid-migration; follow the current layout when editing and consult that plan before large refactors.

**`packages/cli`** — `traceability` binary (commander). Commands: `config set`, `app create`, `issue list|show|fix-request|attach-patch|mark-fixed`. The fix loop (README §"The fix loop") is `issue show <id> --json` → edit → `attach-patch --patch ./fix.diff --branch …` → `mark-fixed`. v1 does not auto-open MRs.

**`packages/skills`** — agent-facing `SKILL.md` modules (`instrumentation`, `diagnose-issue`, `add-boundary`) that teach coding agents how to call the core SDK and run the fix loop. Not built; consumed as docs.

## Conventions that affect code

- **Strictly pnpm** — use `pnpm exec`, never `npx`/`npm`/`yarn`.
- **ESM `.js` import specifiers**: `packages/*` and `server` are `type: module` built with `tsc`. Relative imports use a `.js` suffix (e.g. `import { getConfig } from "./config.js"`) even though the source is `.ts` — `tsc` does not rewrite specifiers, so this matches the emitted JS. The Vite/electron-vite build in `app/` does not require this, but match the surrounding file's style.
- **`import type`** for type-only imports.
- TypeScript strict + `noUncheckedIndexedAccess` (`tsconfig.base.json`); the app splits into `tsconfig.web.json` / `tsconfig.node.json`.
- `onlyBuiltDependencies` in root `package.json` gates native builds (`better-sqlite3`, `electron`, `esbuild`).
