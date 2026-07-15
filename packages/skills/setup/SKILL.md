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

- **Succeeds** (prints `server:` / `token:`) -> the CLI is installed and configured (≡ logged in). Continue.
- **Fails** ("No config found") -> tell the user to run:
  ```bash
  traceability config set --server <url> --token <token>
  ```
  then retry. If `traceability` isn't on PATH, use `pnpm --filter @traceability/cli exec traceability …` (see `references/cli.md`).

After this step, **do not deal with the token** - it is the user's secret and lives in the project's `.env`.

## 1. Detect the stack

- **Electron** if any of: `package.json` has `electron` in dependencies/devDependencies; `main` points at an electron entry; `electron-vite` / `electron-builder` present; source imports from `"electron"`.
- **Web** otherwise (Vite/webpack/Next/Nuxt/… with no electron signal).
- If ambiguous (both an electron main and a separate web build), default to **Electron** and tell the user (they can override).

Select `references/web-setup.md` or `references/electron-setup.md`.

## 2. Application

Ask the user whether an application already exists for this project.

- **Already exists** -> ask for the **appId** (this is the value the SDK needs; there is no per-app "DSN"). Validate it:
  ```bash
  traceability app show <appId> --json
  ```
- **Does not exist** -> pre-fill the three `app create` fields from the project, present them for confirmation/edit, then create:
  - `name` ← `package.json` `name`
  - `repoUrl` ← `git remote get-url origin` (skip if no remote; ask the user)
  - `branch` ← `git branch --show-current` (fall back to `main`)
  ```bash
  traceability app create --name <name> --repo-url <url> --branch <branch> --json
  ```
  Take `id` from the JSON output - that is the **appId**.

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
