# `traceability-setup` Skill — Design Spec

- **Date:** 2026-07-15
- **Status:** Design (pending implementation plan)
- **Owner:** lizhiyu022
- **Scope:** Add a new `setup` skill to `packages/skills/`, and fold the existing `add-boundary` skill into it.

## 1. Goal

Give a coding agent a single, repeatable workflow for installing and configuring the Traceability monitoring SDK in a project that lives inside this monorepo, plus creating (or locating) the Traceability *application* it reports to. This closes a gap in the current skill set: `instrumentation`, `diagnose-issue`, and `add-boundary` all **assume** the SDK is already installed and an app already exists — nothing teaches an agent how to get there.

## 2. Context & verified facts (from codebase exploration)

The following were checked against the current code and drive the design. They correct a few assumptions in the original request.

### 2.1 Existing skill convention
- Each skill lives at `packages/skills/<name>/` with a `SKILL.md` (frontmatter: `name`, `description`; bilingual CN/EN trigger phrases) and optional `references/*.md`.
- Skills are **not built** (`@traceability/skills` is `private: true`); they are docs consumed by agents.
- The existing three skills are `instrumentation`, `diagnose-issue`, `add-boundary`.

### 2.2 What `app create` actually returns (NOT a "DSN")
- CLI: `traceability app create --name <n> --repo-url <u> --branch <b> --json` → `POST /api/apps` → returns an `Application`:
  ```ts
  // packages/protocol/src/index.ts
  interface Application { id: string; name: string; repoUrl: string; defaultBranch: string; createdAt: string }
  ```
- **There is no `dsn` and no `token` on the application.** Creating an app yields an **`appId`** (its `id`).

### 2.3 What `init()` actually needs
- `@traceability/core` `init(opts)` (`packages/core/src/types.ts`) requires:
  ```ts
  interface InitOptions { dsn: string; appId: string; token: string; release?; environment?; user?; whiteScreen?; replay?; mf?; performance?; beforeSend? }
  ```
- Mapping of those three required values to their real sources:
  - `dsn` = **server base URL** (e.g. `http://localhost:3000`). This is the same value stored by `traceability config set --server`. It is **not** per-app.
  - `appId` = the `id` returned by `app create` (or an existing app's id). This is what creating an app "gives you."
  - `token` = API token. MVP auth is **disabled** server-side (tokens ignored), but the SDK field is required.

### 2.4 CLI credential storage
- `traceability config set --server <url> --token <token>` writes `~/.traceability/config.json` (mode `0600`): `{ server, token }`.
- Every CLI command lazily reads that file via `getConfig()`. `app create` etc. **do not** take a `--token` flag — they use the stored config.
- `traceability config show` prints `server: <url>` and `token: <4 chars>…` (masked).
- The `traceability` bin is `packages/cli/dist/index.js` (`bin.traceability`). If not on PATH, fallback invocations are `pnpm --filter @traceability/cli exec traceability …` or `node packages/cli/dist/index.js …`.

### 2.5 Electron SDK has its own surface
- `@traceability/electron` exports `initMain(opts: MainInitOptions)` (main process), `preloadBridge` (preload), and `initRenderer` (renderer, re-exports `@traceability/core` `init`).
- `MainInitOptions extends InitOptions`, adding `app?: { name; version }` and `system?: { sampleInterval; memoryThreshold; cpuThreshold }`.
- The `electron-demo` (`examples/electron-demo`) shows the **correct** wiring pattern:
  - Main: `initMain({ dsn, appId, token, … })`, registers IPC handlers via `monitor.handle`, and the monitor exposes a `traceability:config` IPC so the renderer can fetch `{ dsn, appId, token, release, environment }` at runtime.
  - Preload: `preloadBridge` (use `dist/preload.cjs` when the preload is bundled as CJS).
  - Renderer: `bridge.getConfig()` → `init({...})`. **The token is not hardcoded into renderer source**; it arrives via IPC from the main process.

### 2.6 Dependencies are monorepo-internal
- All `@traceability/*` packages are `private: true`. Examples use `workspace:*`.
- **Confirmed decision:** this skill targets projects **inside this monorepo only** (e.g. `examples/*`, or a new workspace package). So dependencies are added via `workspace:*` and resolved by running `pnpm install` at the repo root. There is **no** `pnpm add @traceability/core` against an external registry and **no** tarball/git-URL install.

### 2.7 Golden reference examples
- `examples/web-demo` — vanilla Vite + TS, single `init()` in `src/main.ts`.
- `examples/electron-demo` — main/renderer/preload split as described above.
- The reference docs in this skill must keep their code snippets consistent with these two examples.

### 2.8 `add-boundary` has no external references
- `grep` confirms `add-boundary` / `traceability-add-boundary` is referenced **only** inside `packages/skills/add-boundary/` itself and in archived historical docs under `docs/superpowers/plans/` and `docs/superpowers/specs/` (records of v1). No skill, code, or active doc links to it. Deleting the directory leaves no dangling links; the historical docs are left untouched as archives.

## 3. Out of scope

- Publishing `@traceability/*` to a registry or supporting external (non-monorepo) target projects.
- Any CLI source change (no new `--json` flag, no new command). The earlier "add `config show --json`" idea is dropped.
- Auto-opening MRs / CI source-map upload automation (v1 scope, per existing skills).
- Touching `instrumentation` or `diagnose-issue` skills (unchanged).

## 4. Design

### 4.1 Directory structure

```
packages/skills/
├── setup/                      # NEW
│   ├── SKILL.md
│   └── references/
│       ├── cli.md
│       ├── web-setup.md
│       └── electron-setup.md
├── instrumentation/            # unchanged
├── diagnose-issue/             # unchanged
└── add-boundary/               # DELETED (README.md + SKILL.md); content folded into web-setup.md
```

### 4.2 Credential model (final)

| Value        | Source                                              | Who fills it      |
|--------------|-----------------------------------------------------|-------------------|
| `dsn`        | CLI stored config (`traceability config show` → `server:` line) | skill, automatically |
| `appId`      | `app create --json` → `id`, **or** user-provided existing app id | skill / user      |
| `token`      | User obtains from the server admin; **skill never reads or writes the value** | **user** — writes into `.env` |

- The skill **never touches the token value**. It only writes a placeholder/empty `.env` entry for it and tells the user to fill it in.
- Template code reads the token from `process.env` (Electron main / Node) or `import.meta.env` (web/Vite), never hardcoded.
- Terminology correction applied throughout: creating an app yields an **`appId`**, not a "DSN". The "user already has an app" branch asks for the **appId**.

### 4.3 `SKILL.md` — main workflow

Frontmatter:
- `name: traceability-setup`
- `description:` trigger phrases — CN: "在项目里接入/安装/配置 traceability 监控 SDK / 创建 application"; EN: "set up / install / configure traceability in this project / create a traceability application".

**Step 0 — Pre-check CLI.** Run `traceability config show`. If it succeeds, the CLI is installed and configured (≡ "logged in"). If it fails, instruct the user to run `traceability config set --server <url> --token <token>` (or the `pnpm --filter … exec` fallback if the bin isn't on PATH), then retry. **After this step, the skill does not deal with `token` at all.**

**Step 1 — Detect stack.** Signals:
- **Electron** if any of: `package.json` has an `electron` dependency or devDependency; `main` points at an electron entry; `electron-vite`/`electron-builder` present; source contains `import { app, BrowserWindow } from "electron"`.
- **Web** otherwise (Vite/webpack/Next/Nuxt/etc. with no electron signal).
- If ambiguous (e.g. both an electron main and a separate web build), default to **Electron** (an electron project also has a renderer that needs setup) and tell the user.
- Select `references/web-setup.md` or `references/electron-setup.md` accordingly.

**Step 2 — Application.** Ask the user whether an application already exists for this project.
- **Already exists:** ask for the **appId** (this is the "DSN" in the user's original framing). Validate with `traceability app show <appId> --json`.
- **Does not exist:** pre-fill the three `app create` fields from the project:
  - `name` ← `package.json` `name`
  - `repoUrl` ← `git remote get-url origin` (may fail if no remote → leave blank, ask user)
  - `branch` ← `git branch --show-current`; fall back to the app's `defaultBranch` concept, else `main`
  - Present the pre-filled values to the user for confirmation/edit, then run `traceability app create --name <n> --repo-url <u> --branch <b> --json`. Take `id` from the JSON output as the **appId**.

**Step 3 — Install deps + write config.** Follow the chosen reference doc:
- Install dependencies (`workspace:*`) and run `pnpm install` at repo root:
  - Web: `@traceability/core` (required); `@traceability/react` (only if React project — see web-setup §React).
  - Electron: `@traceability/core` + `@traceability/electron` (both required).
- Write the project's `.env` template:
  - Auto-fill `TRACEABILITY_DSN` (from `config show`) and `TRACEABILITY_APP_ID` (from Step 2).
  - Leave `TRACEABILITY_API_TOKEN` empty / placeholder and **instruct the user to fill it**.
- Write the monitor module + wire the entry point (per reference doc).
- Ensure `.env.local` / `.env` is in `.gitignore` (token must not be committed). Add it if missing.

### 4.4 `references/cli.md`

A standalone reference for the `@traceability/cli` commands the skill uses:
- `traceability config show` — pre-check / read `server` (the `dsn`).
- `traceability config set --server <url> --token <token>` — first-time login (user-driven).
- `traceability app create --name <n> --repo-url <u> --branch <b> --json` — create app, parse `id` = appId.
- `traceability app show <appId> --json` — validate an existing appId.
- `traceability app list --json` — (optional) discover existing apps.
- `traceability issue list --appId <id>` — verify events after setup.
- PATH/fallback invocation notes (`pnpm --filter @traceability/cli exec traceability …`, `node packages/cli/dist/index.js …`).
- Note that commands use stored `~/.traceability/config.json`; no `--token` flag on app commands.

### 4.5 `references/web-setup.md`

Target: any non-electron web project (vanilla Vite, React+Vite, Next, etc.). Kept consistent with `examples/web-demo`.

**Dependencies.** `@traceability/core` (required). If the project is React, also add `@traceability/react` (optional — provides `MonitorErrorBoundary` + hooks; re-exports core).

**`.env.local` (Vite env).** Skill fills the first two; user fills the token:
```
VITE_TRACEABILITY_DSN=http://localhost:3000
VITE_TRACEABILITY_APP_ID=<from app create / user>
VITE_TRACEABILITY_TOKEN=<user fills: API token>
```
Remind that `VITE_` prefix is required for Vite to expose via `import.meta.env`.

**Monitor module — `src/traceability.ts`** (Approach B: dedicated module):
```ts
import { init } from "@traceability/core";

export function initTraceability() {
  init({
    dsn: import.meta.env.VITE_TRACEABILITY_DSN,
    appId: import.meta.env.VITE_TRACEABILITY_APP_ID,
    token: import.meta.env.VITE_TRACEABILITY_TOKEN,
    environment: import.meta.env.MODE,
    // release: import.meta.env.VITE_APP_VERSION, // optional, set if versioning exists
    replay: { enabled: true, maxDurationMs: 60_000 },
  });
}
```

**Entry wiring.** Add one call at app entry (`src/main.ts` / `main.tsx`):
```ts
import { initTraceability } from "./traceability";
initTraceability();
```

**If this is a React project (folded from `add-boundary`).** Optional section:
- Install `@traceability/react`.
- Import `import { MonitorErrorBoundary } from "@traceability/react"`.
- Wrap route-level components / micro-app roots:
  ```tsx
  <MonitorErrorBoundary appName="message-module" fallback={<ErrorUI />}>
    <MessageApp />
  </MonitorErrorBoundary>
  ```
  - `appName` tags captured errors with the owning module (useful in MF).
  - `fallback` may be a node or a render-prop `{ error, componentStack, resetError }`.
- Recommended placement: one boundary per route-level component; one per MF micro-app root; optionally around flaky subtrees (third-party widgets).
- Verify: throw inside the wrapped component in dev; confirm an issue appears in the Inbox and the fallback UI renders.

**Verify.** Run the project, trigger `captureException(new Error("setup check"))` or a `report(...)`, confirm an event arrives in the Inbox or via `traceability issue list --appId <id>`.

### 4.6 `references/electron-setup.md`

Target: Electron projects (electron-vite or equivalent). Kept consistent with `examples/electron-demo`.

**Dependencies.** `@traceability/core` + `@traceability/electron` (both required, `workspace:*`). Run `pnpm install` at repo root.

**`.env` (Node env, loaded in main process).** Skill fills first two; user fills token:
```
TRACEABILITY_DSN=http://localhost:3000
TRACEABILITY_APP_ID=<from app create / user>
TRACEABILITY_API_TOKEN=<user fills: API token>
```
Load with `dotenv` (or electron-vite's env loading) in the main process entry, before `initMain`.

**Main process — `src/main/monitor.ts`** (Approach B):
```ts
import "dotenv/config";
import { initMain, type MainMonitor } from "@traceability/electron";

export function initMonitor(): MainMonitor {
  return initMain({
    dsn: process.env.TRACEABILITY_DSN!,
    appId: process.env.TRACEABILITY_APP_ID!,
    token: process.env.TRACEABILITY_API_TOKEN!,
    release: "your-app@1.0.0", // derive from package.json if available
    environment: process.env.NODE_ENV ?? "development",
    app: { name: "your-app", version: "1.0.0" },
    system: { sampleInterval: 30_000, memoryThreshold: 0.85, cpuThreshold: 0.9 },
  });
}
```
- `initMain` already registers the `traceability:config` IPC used by `preloadBridge.getConfig()` — the renderer fetches `{ dsn, appId, token, release, environment }` from the main process at runtime.
- **Token stays in the main process; it is not hardcoded into renderer source.**

**Preload.** Use the package's preload build:
```ts
// preload — points at @traceability/electron preload
export { preloadBridge } from "@traceability/electron";
```
If the preload is bundled as CommonJS (sandboxed renderer), use `dist/preload.cjs` instead of the ESM entry (matches `electron-demo`).

**Renderer.** Fetch config from the main process, then `init`:
```ts
import { init } from "@traceability/core";

declare global {
  interface Window {
    traceability?: {
      getConfig(): Promise<{ dsn: string; appId: string; token: string; release?: string; environment?: string }>;
    };
  }
}

async function start() {
  const cfg = await window.traceability!.getConfig();
  init({
    dsn: cfg.dsn,
    appId: cfg.appId,
    token: cfg.token,
    release: cfg.release,
    environment: cfg.environment,
    replay: { enabled: true, maxDurationMs: 60_000 },
  });
}
void start();
```

**Entry wiring.** Main entry calls `initMonitor()` once on startup (`app.whenReady()`), before creating windows.

**Verify.** Run the app, trigger a renderer `captureException` and (optionally) a main-process error via a `monitor.handle` test handler; confirm events arrive in the Inbox for the appId.

### 4.7 Error handling & boundaries

- **CLI not on PATH:** pre-check surfaces the `pnpm --filter @traceability/cli exec traceability …` / `node packages/cli/dist/index.js …` fallback.
- **CLI not configured:** Step 0 instructs `config set`; skill does not proceed past this.
- **`app create` fails** (e.g. validation error, name conflict): show the CLI stderr verbatim, let the user adjust fields, retry.
- **No git remote:** `repoUrl` pre-fill is skipped; ask the user.
- **Stack ambiguous:** default to Electron and tell the user (they can override).
- **Entry file not found:** ask the user for the entry path; do not guess.
- **`.env` already exists:** merge keys rather than overwrite; never clobber an existing token value.

### 4.8 Verification & commit

- Run the project; trigger one event; confirm it appears in the Inbox / `traceability issue list --appId <id>`.
- Ensure `.env*` is gitignored.
- Commit message: `feat: set up traceability monitoring`.

### 4.9 Testing

The skill is docs-only and has no unit tests. Acceptance is manual: run the full flow against a clean workspace package (one web, one electron) and confirm the Inbox receives an event. Reference snippets must match `examples/web-demo` and `examples/electron-demo` (the golden references; note this in the spec).

## 5. Migration of `add-boundary`

- Delete `packages/skills/add-boundary/` (`README.md` + `SKILL.md`).
- Its content (React `MonitorErrorBoundary` usage, placement guidance, verify step) moves into `references/web-setup.md` §"If this is a React project".
- No other skill/code/doc links to it (verified by grep). Historical plan/spec docs under `docs/superpowers/` are left as archives.
- Commit: `refactor(skills): fold add-boundary into setup/web-setup`.

## 6. Resulting file structure (after implementation)

```
packages/skills/
├── package.json
├── setup/
│   ├── SKILL.md
│   └── references/
│       ├── cli.md
│       ├── web-setup.md
│       └── electron-setup.md
├── instrumentation/
│   ├── README.md
│   ├── SKILL.md
│   └── references/...
└── diagnose-issue/
    ├── README.md
    ├── SKILL.md
    └── scripts/...
```

## 7. Open items / risks

- **`workspace:*` only.** If a target project is later added outside the monorepo, a separate install mechanism (publish / tarball) will be needed; out of scope here.
- **Token ergonomics.** The user must obtain and fill the token manually. This is intentional (token is a server-auth secret the user owns), but the skill must make the `.env` placeholder + instruction prominent.
- **`preload.cjs` vs ESM preload.** Electron setup must detect the preload bundling mode and pick the right entry; the reference documents both.
