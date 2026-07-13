# App Directory-Level CLAUDE.md Plan

## Goal

Give every directory with a responsibility under `app/` its own `CLAUDE.md` so that editing code in any part of the Electron app has locally-scoped guidance: responsibility, structure, rules, boundaries ("what not to put here"), and a migration pointer where relevant. Resumable across sessions - a future session can pick up at any batch without re-reading the whole codebase.

## Fixed Decisions (locked this session)

- **Language: English.** Matches the root `CLAUDE.md`. Code paths and technical terms are English regardless.
- **Coverage: every directory with a responsibility (~15 total).** Not just top levels - `main/agent/`, `main/db/`, `components/ui`, `pages/<name>` patterns are all documented.
- **Migration handling: describe the CURRENT on-disk layout as authoritative, and add a one-line pointer** to `docs/superpowers/plans/2026-07-13-agent-core-migration.md` only in directories affected by that migration (`main/`, `main/agent/`, `main/db/`, `shared/`, `features/agent`). Do **not** write the target layout as if it were current.
- **Style/depth baseline (set by Batch 1):** 40-70 lines per file. Structure: `# <dir>/` -> `## Responsibility` -> `## Structure` / `## Rules` -> boundary ("what does NOT belong here") -> `## Migration note` (only where affected). Tables and code blocks where they earn their keep; no filler.

## Done (Batch 1) - committed `a9f6cc3`

- [x] `app/CLAUDE.md` - package overview: three-process model table (main/preload/renderer x `.js` suffix x alias), commands, dual-tsconfig typecheck, state ownership, backend/auth (MVP: disabled), Tailwind/shadcn, migration pointer.
- [x] `app/src/shared/CLAUDE.md` - type-only IPC contract; per-process import form (main `../../shared/ipc.js`, preload `../shared/ipc.js`, renderer `@shared/ipc`); "add a channel = change 3 files" rule.
- [x] `app/src/preload/CLAUDE.md` - sole bridge; `api` grouped by domain mirroring `main/index.ts` channels; no business logic; narrow surface; security posture (`contextIsolation: true`, `nodeIntegration: false`).

## Remaining Work

### Batch 2 - main process

- [ ] `app/src/main/CLAUDE.md`
  - Electron lifecycle: `app.whenReady` -> `new LocalDatabase(...)` + `new AgentPool(...)` -> `agentPool.initialize()` -> `registerIpc()` -> `createWindow()`.
  - `registerIpc()` = all `ipcMain.handle` registrations, **every handler zod-parses its args** (this is the security boundary). Channels: `sessions:*`, `agent:*`, `clipboard:writeText`, `window:*`.
  - Main owns all state (DB + pool). `before-quit` disposes pool + closes DB. `requireAgentPool()` guard throws if used before readiness.
  - Rule: every new IPC channel needs (1) zod schema here, (2) typed method on preload, (3) types in `shared/ipc.ts`.
  - `.js` import suffix applies (tsc ESM emit). No path aliases - relative imports.
  - Migration pointer: `main/agent/*` flattens to `main/agent-*.ts`, `main/db` dissolves into `main/sessions/`.

- [ ] `app/src/main/agent/CLAUDE.md`
  - Five-file module. Document each:
    - `agent-pool.ts` - `AgentPool`: per-session `AgentRuntime` map; forwards events to renderer via `webContents.send("agent:event", ...)` (guarded by `isDestroyed` checks); owns `SessionStore` + `ModelRegistry` + monitor axios.
    - `agent-runtime.ts` - wraps `@earendil-works/pi-agent-core` `Agent`; streaming snapshot throttling (500ms `setTimeout`), run lifecycle (`startRun`/`completeRun`/`failRun`), **`appId` scope guard** (`input.context.appId !== this.appId` throws), `hydrate()` from stored entries. Module-private: `buildSystemPrompt`, `extractTokenUsage`, `convertToLlm`.
    - `session-store.ts` - SQLite CRUD for `agent_sessions`/`agent_entries`/`agent_runs`/`agent_artifacts`; `recoverInterruptedRuns()` on boot; auto-derives session title from first user message.
    - `model-registry.ts` - reads `~/.pi/agent/models.json`; `reload()`/`list()`/`resolve()`/`getApiKey()`.
    - `monitor.ts` - **`MonitorClient` + `createMonitorTools`**: main-process self-contained fetch (separate axios via `VITE_SERVER_URL`, NOT via IPC/renderer). Every response zod-validated AND `appId`-ownership-checked so an LLM cannot smuggle another app's data. `createMonitorHttp()` unwraps the server's `{code,data}` envelope.
  - Key tension to state explicitly: this `monitor.ts` is **unrelated** to `renderer/apis/monitor.ts` (different process, different axios, different consumers). See `renderer/apis/CLAUDE.md`.
  - Rule: agent never writes code/issues/settings - `buildSystemPrompt` enforces read-only identity. Tools list is `createMonitorTools(...)` only.
  - `.js` suffix. Migration pointer: flattens to `main/agent-*.ts`.

- [ ] `app/src/main/db/CLAUDE.md`
  - `LocalDatabase` over `node:sqlite` `DatabaseSync` (Node 22+ built-in, **not** better-sqlite3 - note this differs from `server/`).
  - PRAGMAs: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.
  - Forward-only `MIGRATIONS` array + `schema_migrations` table; `migrate()` runs each unapplied migration inside `transaction()`.
  - `desktop_settings` kv (`getSetting`/`setSetting`/`deleteSetting`). `transaction<T>(op)` wrapper (BEGIN IMMEDIATE / COMMIT / ROLLBACK).
  - Tables: `agent_sessions`, `agent_entries`, `agent_runs`, `agent_artifacts`, `agent_hil_requests`, `desktop_settings`.
  - Rule: all schema changes = new migration object with incremented `id`; never edit an applied migration. Writes go through `SessionStore`, not here directly (this file is the engine, `session-store.ts` is the domain layer).
  - Migration pointer: planned to move into `main/sessions/session-schema.ts`.

### Batch 3 - renderer root

- [ ] `app/src/renderer/CLAUDE.md`
  - Routing: `createMemoryRouter` (index -> `/issues`; `issues`, `issues/:id`, `performance`; `*` -> `/issues`). `Layout` is the single route element.
  - Providers: `App.tsx` wires `QueryClientProvider` (refetchOnWindowFocus false, retry 1, staleTime 30s) -> `CurrentAppProvider` -> `RouterProvider` + `Toaster`; `useEffect(connectWs)` once.
  - `Layout.tsx`: 3-column grid `60px | minmax(0,1fr) | var(--agent-width,360px)` = `Sidebar | <Outlet/> | AgentPanel`, plus `CommandPalette` overlay; `--agent-width` CSS var is mutated by the panel's `Resizer`.
  - Aliases `@renderer/*`, `@shared/*` (synced across `tsconfig.json`, `electron.vite.config.ts`, `vitest.config.ts`).
  - Tailwind 4 via `@tailwindcss/vite` plugin - **no `tailwind.config` file**. shadcn new-york primitives in `components/ui/` (`components.json`).
  - State ownership: renderer is stateless beyond React/query cache; all persistent state is in main, reached only via `window.traceability` (preload).
  - Cross-feature comms convention: window `CustomEvent` bus (see `lib/CLAUDE.md`) - `Layout` dispatches `traceability:command-palette`; `features/agent` + `features/command-palette` listen.
  - No `.js` suffix (Vite). `import type` for type-only imports.

### Batch 4 - renderer leaves

- [ ] `app/src/renderer/apis/CLAUDE.md`
  - REST request fns per module: `apps.ts`, `monitor.ts`. Each fn: `Request`/`Response` interface pair + fn using `request.get/post/...`.
  - All requests via `@renderer/lib/request` shared axios instance - **never `fetch` directly**. Auth/server-URL handled by `request` interceptors.
  - **Reference, do not duplicate**, the existing `apis/README.md` (Chinese) which already documents structure + test-mock convention (`vi.mock('@renderer/lib/request')`).
  - State the monitor.ts boundary vs `main/agent/monitor.ts` (mirror the README's note).
  - **FIX stale reference**: `apis/README.md:36` cites `@renderer/store/auth` which does not exist (auth disabled in MVP; `store/` empty). Correct it to describe `lib/request`'s actual `VITE_SERVER_URL` + envelope-unwrap behavior. This is a file edit, part of this batch.

- [ ] `app/src/renderer/components/CLAUDE.md`
  - App-level shared components: `Sidebar`, `Titlebar`, `CreateAppModal`, `NoAppState`.
  - `components/ui/` = shadcn primitives (`button`, `card`, `dialog`, `input`, `select`, `table`, `tabs`, `badge`, `field`, `kbd`, `separator`, `sonner`, `textarea`). **Do not hand-edit** - regenerated/added via `components.json` (style: new-york, icon: lucide). Document the `cn()` + CVA pattern.
  - Boundary: page-specific components live under `pages/<name>/components/`, not here.

- [ ] `app/src/renderer/context/CLAUDE.md`
  - React Context providers. `current-app.tsx`: selected `appId` in `localStorage` (`traceability:current-app`); seeds default / corrects stale id from `useApps()`; throws if `useCurrentApp` used outside provider.
  - Rule: only cross-cutting app-wide context here. Per-feature state stays in the feature.

- [ ] `app/src/renderer/features/CLAUDE.md`
  - Persistent vertical feature slices mounted once in `Layout`: `agent` (chat panel, `index.tsx` entry), `command-palette` (overlay, `index.tsx` entry).
  - Each feature is a directory with an `index.tsx` entry exporting the mounted component. (Subdirectories like `components/`, `hooks/`, `store/` arrive with the migration - see `features/agent-panel/` target.)
  - **Event-bus convention** (critical): features communicate via window `CustomEvent`s, not props/context. Namespace: `traceability:<feature>-<action>` (e.g. `traceability:agent-prompt`, `agent-new-session`, `agent-select-session`, `command-palette`, `open-app-switcher`). Dispatchers live in `lib/agent-events.ts`; consumers `addEventListener` + clean up.
  - Boundary: a feature must not import another feature's internals - only via the event bus or shared `lib/`/`components/`.

- [ ] `app/src/renderer/hooks/CLAUDE.md`
  - Cross-page react-query hooks only. Currently `use-apps.ts`.
  - Boundary: page-specific hooks live under `pages/<name>/hooks/` (e.g. `pages/issues/hooks/use-issues.ts`), not here. A hook goes here only if >=2 unrelated pages consume it.

- [ ] `app/src/renderer/lib/CLAUDE.md`
  - Pure infrastructure/utilities (no React components, no JSX except where a util returns one):
    - `request.ts` - shared axios; `SERVER_URL` from `VITE_SERVER_URL`; response interceptor unwraps `{code,data,timestamp}` envelope (`code===0` success) and toasts business/network errors with copy action.
    - `ws.ts` - WebSocket to `${SERVER_URL}/api/ws` (http->ws rewrite); auto-reconnect 3s; `onIssueEvent` subscribe/unsubscribe.
    - `agent-events.ts` - **the CustomEvent bus dispatchers** (`promptAgent`, `setAgentContext`, `openCommandPalette`). Document the full event-name registry here as the canonical source.
    - `clipboard.ts`, `utils.ts` (`cn` + domain helpers like `issueSource`/`relativeTime`/`statusGroup`).
  - Rule: no business/state logic that belongs in a feature or page. `lib/` is imported by everything, so keep dependencies minimal and side-effect-free where possible (the axios/ws side effects are the documented exceptions).

- [ ] `app/src/renderer/pages/CLAUDE.md`
  - Route-level pages: `issues/` (`index.tsx` list + `detail.tsx` + `components/` + `hooks/`), `performance/` (`index.tsx` + `hooks/`), `apps/` (`hooks/` only - no page component, app management is via `components/CreateAppModal`).
  - Pattern per page: `index.tsx` calls `apis/` **through its `hooks/`**, never `request` directly; `components/` holds page-specific UI (e.g. `RrwebReplayPlayer`, `SourceLocation`).
  - WS-driven invalidation: pages subscribe via `onIssueEvent` -> `useQueryClient().invalidateQueries`.
  - Boundary: nothing page-specific leaks up to `components/` or `hooks/` (top-level).

- [ ] `app/src/renderer/store/CLAUDE.md`
  - **Currently empty/reserved.** Document as: no contents, do not create modules here.
  - State explicitly: the `apis/README.md` reference to `@renderer/store/auth` is stale (auth disabled in MVP; see Batch 4 apis fix).
  - Migration pointer: future Zustand stores land under `features/agent-panel/store/` per the agent-core migration, **not** here. If a genuine app-wide store is ever needed, this is the place - until then leave empty.

## Key Tensions (record once, reference everywhere)

1. **Two `monitor.ts` files.** `renderer/apis/monitor.ts` (UI data layer, axios via `lib/request`) vs `main/agent/monitor.ts` (Agent tools, main-process axios via `VITE_SERVER_URL`, zod + appId-ownership checks). Different process, different axios, different consumers - never merge. Both `apis/CLAUDE.md` and `main/agent/CLAUDE.md` must state this.
2. **`renderer/store/` is empty; `apis/README.md:36` references non-existent `@renderer/store/auth`.** Fix the README reference in Batch 4; document `store/` as reserved.
3. **`.js` import suffix is per-process.** main/preload/shared: yes (tsc ESM emit). renderer: no (Vite). Each directory's CLAUDE.md states the rule for its process.
4. **Window `CustomEvent` bus is the cross-feature architecture.** Not props, not context. Canonical event-name registry lives in `lib/agent-events.ts`; `lib/CLAUDE.md` owns the list, `features/CLAUDE.md` owns the usage convention.
5. **Migration is in flight.** Affected dirs (`main/`, `main/agent/`, `main/db/`, `shared/`, `features/agent`) get a one-line pointer to `2026-07-13-agent-core-migration.md`. Current layout is authoritative in all docs.

## Validation

- Each CLAUDE.md is 40-70 lines and follows the Responsibility -> Structure/Rules -> boundary -> (migration note) structure.
- Every directory under `app/src/` with source files has a CLAUDE.md (verify with `find app/src -type d -exec test -f {}/CLAUDE.md`).
- `apis/README.md` no longer references `@renderer/store/auth`.
- No directory doc describes the migration's *target* layout as current.
- Commit each batch separately (`docs(app): add directory-level CLAUDE.md for <scope>`).
