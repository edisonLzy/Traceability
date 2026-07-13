# app/

`@traceability/app` — the Traceability Electron desktop app. Electron 39 + electron-vite + React 19 + Tailwind 4 + react-query + react-router. Private package, `type: module`.

This is the authoritative package-level guide. Each subdirectory under `src/` has its own `CLAUDE.md` with the conventions that apply when editing files there — read the relevant one before changing code.

## Three-process model

electron-vite produces three independent builds from one config (`electron.vite.config.ts`):

| Process | Source | Runtime | `.js` import suffix? | Path alias |
|---------|--------|---------|----------------------|------------|
| **main** | `src/main/` | Node (Electron main) | **Yes** — relative `./x.js` | none (relative imports) |
| **preload** | `src/preload/` | isolated browser context | **Yes** — relative `../x.js` | none (relative imports) |
| **renderer** | `src/renderer/` | browser | **No** | `@renderer/*`, `@shared/*` |

The `.js`-suffix rule is load-bearing: `main`/`preload`/`shared` are emitted by `tsc` as ESM and `tsc` does not rewrite specifiers, so source must already use `.js`. The renderer is bundled by Vite, which rewrites specifiers, so no suffix. **Match the surrounding file.** See `shared/CLAUDE.md` for how `shared/` is imported from each process.

## Commands (run from `app/`)

```bash
pnpm dev          # electron-vite dev --inspect --sourcemap (inspector :5858)
pnpm build        # electron-vite build -> out/{main,preload,renderer}
pnpm test         # vitest run (src/**/*.test.ts)
pnpm typecheck    # tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.node.json
pnpm package      # pnpm build && electron-builder
```

From the repo root these are surfaced as `pnpm dev:app`, `pnpm build`, etc.

## TypeScript layout

`typecheck` runs **two** projects — both must pass:

- `tsconfig.json` — web/shared. `include: src`, `exclude: src/main/**, src/preload/**`. Defines the `@renderer/*` and `@shared/*` path aliases. `jsx: react-jsx`.
- `tsconfig.node.json` — main/preload/shared + `electron.vite.config.ts`. `moduleResolution: Bundler`, `types: node, electron, electron-vite/node`. No path aliases (main/preload import shared via relative paths).
- `tsconfig.web.json` — extends `tsconfig.json` (separate project ref target for the typecheck script).

Note: `src/shared/` is included by **both** projects, so it must satisfy both the web and node configs.

Aliases (`@renderer`, `@shared`) are declared in three places that must stay in sync: `tsconfig.json` paths, `electron.vite.config.ts` renderer.resolve.alias, and `vitest.config.ts` resolve.alias.

## State ownership

The **main process owns all state**: the agent runtime (`src/main/agent/`) and the SQLite database (`src/main/db/`, at `userData/traceability-agent.sqlite`). The renderer is stateless beyond React/query cache and reaches main only through the preload bridge. See `preload/CLAUDE.md` and `shared/CLAUDE.md` for the IPC contract.

## Backend & auth

Auth is **disabled for the MVP** — the server accepts all requests (tokens ignored). The backend address comes from `VITE_SERVER_URL` (build-time). The renderer's `lib/request.ts` and the main process's `agent/monitor.ts` each read it independently (two separate axios instances, two separate endpoint maps — see `renderer/apis/CLAUDE.md` and `main/agent/CLAUDE.md`).

## Styling

Tailwind 4 via `@tailwindcss/vite` (no `tailwind.config`). shadcn (new-york style, `components.json`) primitives live in `src/renderer/components/ui/`. Lucide icons. Format/lint run only on commit (husky + lint-staged); VS Code format-on-save is intentionally off.

## In-progress migration

An agent-core migration (`docs/superpowers/plans/2026-07-13-agent-core-migration.md`) will flatten `main/agent/*` → `main/agent-*.ts`, dissolve `main/db` → `main/sessions/`, split `shared/ipc.ts` → `shared/*-ipc.ts`, and move the renderer chat UI `features/agent` → `features/agent-panel/` with subdirectories. The current code is mid-migration. **Follow the current layout when editing**; affected subdirectory docs note the planned direction.
