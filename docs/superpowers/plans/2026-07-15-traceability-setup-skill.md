# traceability-setup Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `traceability-setup` skill that guides an agent through pre-checking the CLI, detecting the project stack, creating/locating a Traceability application, and wiring the monitoring SDK — and fold the existing `add-boundary` skill into it.

**Architecture:** Docs-only skill under `packages/skills/setup/` (a `SKILL.md` + three `references/*.md`), matching the convention of the existing `instrumentation`/`diagnose-issue` skills. The React error-boundary content from `add-boundary` moves into `references/web-setup.md`; the `add-boundary/` directory is then deleted.

**Tech Stack:** Markdown skill docs; references the real APIs of `@traceability/core`, `@traceability/electron`, `@traceability/react`, and `@traceability/cli`.

## Global Constraints

- This skill targets projects **inside this monorepo only**. Dependencies use `workspace:*`. No registry publish, no tarball/git-URL install. (Spec §2.6, §3.)
- All `@traceability/*` packages are `private: true`. Skills are docs-only and **not built** (`@traceability/skills` is `private: true`). (Spec §2.1.)
- Skill `SKILL.md` uses frontmatter `name` + `description`, with bilingual CN/EN trigger phrases, matching `packages/skills/instrumentation/SKILL.md`. (Spec §2.1, §4.3.)
- The skill **never reads or writes the token value**. It fills `dsn` and `appId` automatically; the user fills the token into `.env`/`.env.local`. (Spec §4.2.)
- Creating an app yields an **appId** (the `id` field of `Application`), not a DSN. The `dsn` is the server base URL, taken from `traceability config show`'s `server:` line. (Spec §2.2, §2.3, §4.2.)
- Reference code snippets must stay consistent with the golden examples `examples/web-demo` and `examples/electron-demo`. (Spec §2.7, §4.9.)
- **No automated tests.** The skill is docs-only; per spec §4.9, verification is manual + source-consistency checks. Each task's "verify" step checks the doc's claims against the real source via `grep`/`Read` with expected output — this is the docs analog of a test.
- Commits are Conventional Commits (`docs`, `refactor`). Use `pnpm`, never npx/npm/yarn. (CLAUDE.md.)

---

## File Structure

```
packages/skills/
├── setup/                      # NEW
│   ├── SKILL.md                # Task 4 — main workflow, references the three docs
│   └── references/
│       ├── cli.md              # Task 1 — @traceability/cli command reference
│       ├── web-setup.md        # Task 2 — web SDK wiring + folded React boundary section
│       └── electron-setup.md   # Task 3 — electron main/preload/renderer wiring
├── instrumentation/            # unchanged
├── diagnose-issue/             # unchanged
└── add-boundary/               # Task 5 — DELETED (content moved to web-setup.md in Task 2)
```

Responsibilities:
- `cli.md` — standalone reference for every CLI command the skill/agent uses (config, app, issue). Referenced by SKILL.md and both setup docs.
- `web-setup.md` — deps, `.env.local`, monitor module, entry wiring, optional React `MonitorErrorBoundary` section (folded from `add-boundary`), verification.
- `electron-setup.md` — deps, `.env`, `initMain` monitor module, preload bridge, renderer `init` via IPC config, entry wiring, verification.
- `SKILL.md` — the 5-step workflow (pre-check → detect stack → application → install+config → verify+commit) that selects between the three references.

Dependencies between tasks: Task 4 (SKILL.md) references files created in Tasks 1–3, so it comes after them. Task 5 (delete `add-boundary`) comes last, after its content exists in Task 2's `web-setup.md`.

---

### Task 1: Create `references/cli.md`

**Files:**
- Create: `packages/skills/setup/references/cli.md`

**Interfaces:**
- Consumes: the real `@traceability/cli` command surface (`packages/cli/src/commands/{app,config,issue}.ts`).
- Produces: `references/cli.md`, referenced by SKILL.md (Step 0, Step 2) and by the verify sections of `web-setup.md`/`electron-setup.md` (the `issue list` command). Later tasks assume the command names and flags documented here match the source.

- [ ] **Step 1: Verify the CLI command surface (so the doc is accurate)**

Run:
```bash
grep -n 'command("set")\|command("show")' packages/cli/src/commands/config.ts
grep -n 'command("list")\|command("create")\|command("show")\|command("update")\|command("delete")' packages/cli/src/commands/app.ts
grep -n 'command("list")\|command("show")\|command("fix-request")\|command("attach-patch")\|command("mark-fixed")\|requiredOption' packages/cli/src/commands/issue.ts
```
Expected: `config.ts` has `set` and `show`; `app.ts` has `list`/`create`/`show`/`update`/`delete`; `issue.ts` has `list` (with `requiredOption("--appId <id>")`), `show`, `fix-request`, `attach-patch`, `mark-fixed`. These confirm the commands and flags the doc will document.

- [ ] **Step 2: Write `packages/skills/setup/references/cli.md`**

Create the file with this exact content:

````markdown
# @traceability/cli reference

The `traceability` CLI manages CLI configuration, applications, and issues. It reads credentials from `~/.traceability/config.json` (written by `config set`); app/issue commands do **not** take a `--token` flag.

## Invocation

If `traceability` is on your PATH:

```bash
traceability <command> ...
```

Fallbacks inside this monorepo (the bin is `packages/cli/dist/index.js`):

```bash
pnpm --filter @traceability/cli exec traceability <command> ...
# or
node packages/cli/dist/index.js <command> ...
```

> If `dist/` is stale, build first: `pnpm --filter @traceability/cli build`.

## Configuration

### `config set --server <url> --token <token>`

Stores `{ server, token }` to `~/.traceability/config.json` (mode `0600`). Run once to "log in". Required before any other command works.

### `config show`

Prints the stored config. The `server` line is the SDK `dsn` (the server base URL). The token is masked.

```text
server: http://localhost:3000
token:  dev-…
```

## Applications

### `app create --name <name> --repo-url <url> --branch <branch> [--json]`

Creates an application. With `--json`, prints the full `Application` object; its `id` field is the **appId** the SDK needs.

```json
{
  "id": "e4eac53d-846d-4c75-a6a0-402c15c69954",
  "name": "my-app",
  "repoUrl": "https://github.com/org/repo",
  "defaultBranch": "main",
  "createdAt": "2026-07-15T00:00:00.000Z"
}
```

> Required: `--name`, `--repo-url`, `--branch`. There is no DSN or token on the application — creating it yields an **appId**.

### `app list [--json]`

Lists applications. Use to discover an existing app's `id`.

### `app show <appId> [--json]`

Fetches one application. Use to validate a user-provided appId before wiring the SDK.

### `app update <appId> [--name <n>] [--repo-url <u>] [--branch <b>]`

Updates an application's metadata.

### `app delete <appId>`

Deletes an application.

## Issues (verification after setup)

### `issue list --appId <id> [--status <status>] [--limit <n>] [--json]`

Lists issues for an app. `--appId` is **required**. Use after setup to confirm events are arriving.

### `issue show <issueId> [--json]`

Fetches one issue (stacktrace, message, context).

### `issue fix-request <issueId>` / `issue attach-patch <issueId> --patch <path> --branch <branch>` / `issue mark-fixed <issueId>`

The fix loop — see the `diagnose-issue` skill.
````

- [ ] **Step 3: Verify the file was written and is well-formed**

Run:
```bash
test -f packages/skills/setup/references/cli.md && echo OK
grep -c '^### ' packages/skills/setup/references/cli.md
```
Expected: `OK`, then a count ≥ `9` (config set, config show, app create, app list, app show, app update, app delete, issue list, issue show = 9; plus the fix-loop heading).

- [ ] **Step 4: Commit**

```bash
git add packages/skills/setup/references/cli.md
git commit -m "docs(skills): add setup/cli reference"
```

---

### Task 2: Create `references/web-setup.md` (folds in `add-boundary`)

**Files:**
- Create: `packages/skills/setup/references/web-setup.md`

**Interfaces:**
- Consumes: `@traceability/core` `init(opts: InitOptions)` (`packages/core/src/types.ts`), `@traceability/react` `MonitorErrorBoundary` (`packages/react/src/ErrorBoundary.tsx`), and `traceability issue list --appId` (Task 1's `cli.md`).
- Produces: `references/web-setup.md`, referenced by SKILL.md (Step 1 web branch, Step 3). Includes the React error-boundary section that replaces `add-boundary/SKILL.md` (deleted in Task 5).

- [ ] **Step 1: Verify the API surface the doc claims**

Run:
```bash
grep -n 'dsn:\|appId:\|token:' packages/core/src/types.ts
grep -n 'appName?\|fallback' packages/react/src/ErrorBoundary.tsx
grep -n 'export { MonitorErrorBoundary' packages/react/src/index.ts
```
Expected:
- `types.ts`: `InitOptions` has `dsn: string;`, `appId: string;`, `token: string;`.
- `ErrorBoundary.tsx`: `appName?: string;` and the `fallback` prop (a `React.ReactNode` or render prop `({ error, componentStack, resetError }) => ReactNode`).
- `react/index.ts`: re-exports `MonitorErrorBoundary`.

- [ ] **Step 2: Write `packages/skills/setup/references/web-setup.md`**

Create the file with this exact content:

````markdown
# Web project setup reference

Target: any non-electron web project (vanilla Vite, React+Vite, Next, Nuxt, …). Golden reference: `examples/web-demo`.

## Dependencies

Add to the target package's `package.json` (monorepo-internal, `workspace:*`):

- `@traceability/core` — required.
- `@traceability/react` — only if the project is React (provides `MonitorErrorBoundary` + hooks; re-exports core).

Then run `pnpm install` at the repo root.

## Environment variables

Create `.env.local` (Vite exposes only `VITE_`-prefixed vars via `import.meta.env`). The skill fills the first two; **the user fills the token**:

```env
VITE_TRACEABILITY_DSN=http://localhost:3000
VITE_TRACEABILITY_APP_ID=<appId from app create, or an existing app id>
VITE_TRACEABILITY_TOKEN=<user fills: API token from the server admin>
```

> `.env.local` must be in `.gitignore` — the token must not be committed.

## Monitor module

Create `src/traceability.ts` (dedicated module, keeps the entry clean):

```ts
import { init } from "@traceability/core";

export function initTraceability() {
  init({
    dsn: import.meta.env.VITE_TRACEABILITY_DSN,
    appId: import.meta.env.VITE_TRACEABILITY_APP_ID,
    token: import.meta.env.VITE_TRACEABILITY_TOKEN,
    environment: import.meta.env.MODE,
    // release: import.meta.env.VITE_APP_VERSION, // set if you version your builds
    replay: { enabled: true, maxDurationMs: 60_000 },
  });
}
```

`init()` builds its ingest URL from `${dsn}/api/ingest/envelope/${appId}`, so `dsn` is the server base URL with no trailing path.

## Entry wiring

Call once at app entry (`src/main.ts` / `src/main.tsx`):

```ts
import { initTraceability } from "./traceability";
initTraceability();
```

## If this is a React project (error boundaries)

Install `@traceability/react`. Wrap route-level components and micro-app roots with `MonitorErrorBoundary`:

```tsx
import { MonitorErrorBoundary } from "@traceability/react";

<MonitorErrorBoundary appName="message-module" fallback={<ErrorUI />}>
  <MessageApp />
</MonitorErrorBoundary>
```

Props:
- `appName?` — tags captured errors with the owning module (useful in micro-frontends).
- `fallback` — a `ReactNode`, or a render prop `({ error, componentStack, resetError }) => ReactNode`.
- `onError?` — `(error: Error, componentStack: string | null) => void`.

Recommended placement:
- One boundary around each route-level component.
- One boundary around each micro-app root.
- Optionally one around flaky subtrees (third-party widgets).

Verify: throw inside the wrapped component in dev; confirm an issue appears in the Inbox and the fallback UI renders.

## Verify the setup

Run the project and trigger one event:

```ts
import { captureException } from "@traceability/core";
captureException(new Error("traceability setup check"));
```

Confirm it appears in the Inbox UI, or via the CLI:

```bash
traceability issue list --appId <appId>
```
````

- [ ] **Step 3: Verify the file and the folded React section**

Run:
```bash
test -f packages/skills/setup/references/web-setup.md && echo OK
grep -c 'MonitorErrorBoundary' packages/skills/setup/references/web-setup.md
grep -n 'appName?\|fallback' packages/skills/setup/references/web-setup.md
```
Expected: `OK`; a count ≥ `3` (import, JSX usage, props mention); the props list line present. This confirms the `add-boundary` content landed here.

- [ ] **Step 4: Commit**

```bash
git add packages/skills/setup/references/web-setup.md
git commit -m "docs(skills): add setup/web-setup reference"
```

---

### Task 3: Create `references/electron-setup.md`

**Files:**
- Create: `packages/skills/setup/references/electron-setup.md`

**Interfaces:**
- Consumes: `@traceability/electron` `initMain`/`preloadBridge` (`packages/electron/src/index.ts`, `main.ts`), `@traceability/core` `init`, the `traceability:config` IPC shape from `initMain`, and `traceability issue list --appId` (Task 1).
- Produces: `references/electron-setup.md`, referenced by SKILL.md (Step 1 electron branch, Step 3).

- [ ] **Step 1: Verify the electron API surface and IPC config shape**

Run:
```bash
grep -n 'initMain\|preloadBridge\|initRenderer' packages/electron/src/index.ts
grep -n 'traceability:config' packages/electron/src/main.ts
sed -n '192,198p' packages/electron/src/main.ts
```
Expected:
- `index.ts` exports `initMain` and `preloadBridge`.
- `main.ts` has a `traceability:config` handler.
- Lines 192–198 show it returns `{ dsn, appId, token, release, environment }` — confirming the renderer's `getConfig()` shape the doc will document.

- [ ] **Step 2: Write `packages/skills/setup/references/electron-setup.md`**

Create the file with this exact content:

````markdown
# Electron project setup reference

Target: Electron projects (electron-vite or equivalent). Golden reference: `examples/electron-demo`.

The Electron SDK has three surfaces: **main** (`initMain`), **preload** (`preloadBridge`), and **renderer** (`init` from `@traceability/core`). The token stays in the main process; the renderer fetches its config over IPC.

## Dependencies

Add to the target package's `package.json` (monorepo-internal, `workspace:*`):

- `@traceability/core` — required.
- `@traceability/electron` — required.

Then run `pnpm install` at the repo root.

## Environment variables

Create `.env` (loaded in the **main** process). The skill fills the first two; **the user fills the token**:

```env
TRACEABILITY_DSN=http://localhost:3000
TRACEABILITY_APP_ID=<appId from app create, or an existing app id>
TRACEABILITY_API_TOKEN=<user fills: API token from the server admin>
```

> `.env` must be in `.gitignore`. Load it in the main entry (e.g. `import "dotenv/config"`, or electron-vite's env loading) before `initMain`.

## Main process

Create `src/main/monitor.ts` (dedicated module):

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

`initMain` automatically registers the `traceability:config` IPC handler, returning `{ dsn, appId, token, release, environment }` — this is how the renderer gets its config at runtime. It also registers `traceability:environment`, `traceability:sample-resources`, and the `traceability:report` / `traceability:breadcrumb` channels.

## Preload

Use the package's preload bridge. In an ESM preload:

```ts
export { preloadBridge } from "@traceability/electron";
```

If the preload is bundled as CommonJS (sandboxed renderer, as in `electron-demo`), point `webPreferences.preload` at the CJS build — resolve the path for your project layout (the demo uses `../../../packages/electron/dist/preload.cjs`):

```ts
import { fileURLToPath } from "node:url";
// inside createWindow's webPreferences:
webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  preload: fileURLToPath(
    new URL("<path-to>@traceability/electron/dist/preload.cjs", import.meta.url),
  ),
}
```

`preloadBridge` exposes `window.traceability` (when `contextIsolation` is on) with `getConfig`, `report`, `invoke`, `addBreadcrumb`, `getEnvironment`, `sampleResources`.

## Renderer

Fetch config from the main process, then init (reusing `@traceability/core`):

```ts
import { init } from "@traceability/core";

declare global {
  interface Window {
    traceability?: {
      getConfig(): Promise<{
        dsn: string;
        appId: string;
        token: string;
        release?: string;
        environment?: string;
      }>;
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

void start().catch((err) => {
  console.error("Could not initialize monitoring:", err);
});
```

The token is **not** hardcoded into renderer source — it arrives via IPC from the main process.

## Entry wiring

Call `initMonitor()` once on startup, before creating windows:

```ts
import { app } from "electron";
import { initMonitor } from "./main/monitor";

app.whenReady().then(() => {
  initMonitor();
  // createWindow() ...
});
```

## Verify the setup

Run the app and trigger a renderer error:

```ts
import { captureException } from "@traceability/core";
captureException(new Error("traceability setup check"));
```

Confirm it appears in the Inbox UI, or via the CLI:

```bash
traceability issue list --appId <appId>
```
````

- [ ] **Step 3: Verify the file and its IPC claims**

Run:
```bash
test -f packages/skills/setup/references/electron-setup.md && echo OK
grep -c 'initMain\|preloadBridge\|getConfig' packages/skills/setup/references/electron-setup.md
grep -n 'dsn, appId, token, release, environment' packages/skills/setup/references/electron-setup.md
```
Expected: `OK`; count ≥ `4`; the IPC config-shape line present. This confirms the doc matches the `traceability:config` handler verified in Step 1.

- [ ] **Step 4: Commit**

```bash
git add packages/skills/setup/references/electron-setup.md
git commit -m "docs(skills): add setup/electron-setup reference"
```

---

### Task 4: Create `SKILL.md` (main workflow)

**Files:**
- Create: `packages/skills/setup/SKILL.md`

**Interfaces:**
- Consumes: the three reference docs from Tasks 1–3 (`references/cli.md`, `references/web-setup.md`, `references/electron-setup.md`), and the frontmatter convention from `packages/skills/instrumentation/SKILL.md`.
- Produces: `packages/skills/setup/SKILL.md` — the agent entry point. This is the final deliverable that makes the skill usable.

- [ ] **Step 1: Verify the reference docs exist and the frontmatter convention**

Run:
```bash
ls packages/skills/setup/references/
sed -n '1,4p' packages/skills/instrumentation/SKILL.md
```
Expected: `cli.md  electron-setup.md  web-setup.md` (all three from Tasks 1–3); the instrumentation skill's frontmatter shows the `name:` / `description:` pattern to match.

- [ ] **Step 2: Write `packages/skills/setup/SKILL.md`**

Create the file with this exact content:

````markdown
---
name: traceability-setup
description: Use when the user asks to set up / install / configure traceability monitoring in a project, or to create a Traceability application (在项目里接入/安装/配置 traceability 监控 SDK / 创建 application). Walks through pre-checking the CLI, detecting the stack, creating or locating an application, and wiring the SDK.
---

# Setup Skill

When the user says "在项目里接入/安装/配置 traceability 监控 / 创建 application" or "set up / install / configure traceability in this project", follow this workflow.

This skill targets projects **inside this monorepo** (dependencies use `workspace:*`). It does not publish packages.

## 0. Pre-check the CLI

```bash
traceability config show
```

- **Succeeds** (prints `server:` / `token:`) → the CLI is installed and configured (≡ logged in). Continue.
- **Fails** ("No config found") → tell the user to run:
  ```bash
  traceability config set --server <url> --token <token>
  ```
  then retry. If `traceability` isn't on PATH, use `pnpm --filter @traceability/cli exec traceability …` (see `references/cli.md`).

After this step, **do not deal with the token** — it is the user's secret and lives in the project's `.env`.

## 1. Detect the stack

- **Electron** if any of: `package.json` has `electron` in dependencies/devDependencies; `main` points at an electron entry; `electron-vite` / `electron-builder` present; source imports from `"electron"`.
- **Web** otherwise (Vite/webpack/Next/Nuxt/… with no electron signal).
- If ambiguous (both an electron main and a separate web build), default to **Electron** and tell the user (they can override).

Select `references/web-setup.md` or `references/electron-setup.md`.

## 2. Application

Ask the user whether an application already exists for this project.

- **Already exists** → ask for the **appId** (this is the value the SDK needs; there is no per-app "DSN"). Validate it:
  ```bash
  traceability app show <appId> --json
  ```
- **Does not exist** → pre-fill the three `app create` fields from the project, present them for confirmation/edit, then create:
  - `name` ← `package.json` `name`
  - `repoUrl` ← `git remote get-url origin` (skip if no remote; ask the user)
  - `branch` ← `git branch --show-current` (fall back to `main`)
  ```bash
  traceability app create --name <name> --repo-url <url> --branch <branch> --json
  ```
  Take `id` from the JSON output — that is the **appId**.

> Creating an app yields an **appId**, not a DSN. The `dsn` (server base URL) comes from `config show`'s `server:` line.

## 3. Install deps + write config

Follow the chosen reference:

1. Add dependencies (`workspace:*`) and run `pnpm install` at the repo root.
   - Web: `@traceability/core` (+ `@traceability/react` if React).
   - Electron: `@traceability/core` + `@traceability/electron`.
2. Write the project's `.env` / `.env.local`:
   - Auto-fill `TRACEABILITY_DSN` / `VITE_TRACEABILITY_DSN` (from `config show`) and `TRACEABILITY_APP_ID` / `VITE_TRACEABILITY_APP_ID` (from Step 2).
   - Leave the token entry empty/placeholder and **instruct the user to fill it**.
3. Write the monitor module + wire the entry point (per the reference doc).
4. Ensure `.env*` is in `.gitignore` (add it if missing). Never clobber an existing token value.

## 4. Verify

Run the project; trigger one event (`captureException(new Error("setup check"))` or a `report(...)`). Confirm it appears in the Inbox UI, or:

```bash
traceability issue list --appId <appId>
```

## 5. Commit

```bash
git add -A
git commit -m "feat: set up traceability monitoring"
```

Tell the user the appId, that they still need to fill the token in `.env`, and that events should now appear in the Inbox.
````

- [ ] **Step 3: Verify the file, frontmatter, and reference links**

Run:
```bash
test -f packages/skills/setup/SKILL.md && echo OK
sed -n '1,4p' packages/skills/setup/SKILL.md
grep -c 'references/cli.md\|references/web-setup.md\|references/electron-setup.md' packages/skills/setup/SKILL.md
```
Expected: `OK`; frontmatter with `name: traceability-setup` and a `description:` line; a count ≥ `1` (SKILL.md references the docs; at minimum `references/cli.md`). All three reference files exist from Tasks 1–3.

- [ ] **Step 4: Commit**

```bash
git add packages/skills/setup/SKILL.md
git commit -m "docs(skills): add setup SKILL.md workflow"
```

---

### Task 5: Delete `add-boundary/` (folded into `web-setup.md`)

**Files:**
- Delete: `packages/skills/add-boundary/README.md`
- Delete: `packages/skills/add-boundary/SKILL.md` (and the now-empty `packages/skills/add-boundary/` directory)

**Interfaces:**
- Consumes: the folded React section now living in `packages/skills/setup/references/web-setup.md` (Task 2). Verified by grep that no active skill/code links to `add-boundary` (Spec §2.8).
- Produces: a clean `packages/skills/` with no standalone `add-boundary` skill; the React boundary guidance lives solely under `setup/`.

- [ ] **Step 1: Confirm the content is already present in web-setup.md (do not delete before this passes)**

Run:
```bash
grep -c 'MonitorErrorBoundary' packages/skills/setup/references/web-setup.md
grep -n 'appName' packages/skills/setup/references/web-setup.md
```
Expected: count ≥ `3`, and an `appName` line. If this fails, **stop** — Task 2 did not land the folded content; fix that before deleting.

- [ ] **Step 2: Confirm no active references to add-boundary outside its own directory and historical docs**

Run:
```bash
grep -rn 'add-boundary\|traceability-add-boundary' packages/ --include='*.md' --include='*.ts' --include='*.tsx' --include='*.json'
```
Expected: matches **only** inside `packages/skills/add-boundary/` itself. No skill, code, or active doc outside that directory references it. (Historical plan/spec docs under `docs/superpowers/` are out of scope and left as archives — Spec §2.8.) If anything outside `add-boundary/` references it, **stop** and update that reference first.

- [ ] **Step 3: Delete the add-boundary directory**

Run:
```bash
git rm -r packages/skills/add-boundary
```
Expected: `rm 'packages/skills/add-boundary/README.md'` and `rm 'packages/skills/add-boundary/SKILL.md'`.

- [ ] **Step 4: Verify the deletion and final skill layout**

Run:
```bash
test ! -e packages/skills/add-boundary && echo DELETED
ls packages/skills/
ls packages/skills/setup/references/
```
Expected: `DELETED`; `packages/skills/` lists `diagnose-issue  instrumentation  setup` (and `package.json`); `references/` lists `cli.md  electron-setup.md  web-setup.md`.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(skills): fold add-boundary into setup/web-setup"
```
(Files were already staged by `git rm -r`.)

---

## Self-Review

**1. Spec coverage:**
- §4.1 directory structure → Tasks 1–4 create `setup/` + 3 references + `SKILL.md`; Task 5 deletes `add-boundary/`. ✓
- §4.2 credential model (dsn+appId auto, token user-only, no CLI change) → encoded in Global Constraints, SKILL.md Step 0/3, and both setup docs' `.env` sections. ✓
- §4.3 SKILL.md workflow (Steps 0–5) → Task 4. ✓
- §4.4 `cli.md` → Task 1. ✓
- §4.5 `web-setup.md` + folded React section → Task 2. ✓
- §4.6 `electron-setup.md` → Task 3. ✓
- §4.7 error handling (CLI not on PATH, no remote, ambiguous stack, entry not found, don't clobber token) → SKILL.md Step 0 (PATH fallback), Step 2 (no remote → ask), Step 1 (ambiguous → default Electron + tell user), Step 3.4 (gitignore, don't clobber). ✓
- §4.8 verify + commit message → SKILL.md Steps 4–5. ✓
- §4.9 testing (docs-only, manual) → Global Constraints. ✓
- §5 migration of add-boundary → Task 5 (with pre-checks in Steps 1–2). ✓

**2. Placeholder scan:** No "TBD"/"TODO"/"implement later". `<appId>`, `<path-to>...`, `"your-app@1.0.0"`, `<url>` are template values the agent substitutes at setup time — real guidance, not plan placeholders. Each code step contains complete content.

**3. Type/name consistency:** `init({ dsn, appId, token, … })` (core) and `initMain({ dsn, appId, token, app, system, … })` (electron) match `types.ts`/`main.ts`. `getConfig()` returns `{ dsn, appId, token, release, environment }` — matches `main.ts:192-198` (verified in Task 3 Step 1). `MonitorErrorBoundary` props (`appName?`, `fallback`, `onError?`) match `ErrorBoundary.tsx` (verified in Task 2 Step 1). `traceability issue list --appId <id>` (required) matches `issue.ts` (verified in Task 1 Step 1). `traceability app create --name/--repo-url/--branch` matches `app.ts`. Reference filenames (`cli.md`, `web-setup.md`, `electron-setup.md`) are consistent across Tasks 1–4 and the SKILL.md links.

No issues remain.
