# Traceability

Sentry-based web/electron/mf monitoring + exception-to-fix loop.

## Packages

| Path                | Description                                                                      |
| ------------------- | -------------------------------------------------------------------------------- |
| `packages/core`     | Thin wrapper over `@sentry/browser` + self-built integrations + server transport |
| `packages/react`    | `MonitorErrorBoundary` + hooks                                                   |
| `packages/electron` | Electron main/renderer/preload                                                   |
| `packages/cli`      | `traceability` CLI client for the server                                         |
| `packages/skills`   | Coding-agent skills (instrumentation / diagnose-issue / add-boundary)            |
| `packages/protocol` | Shared TS types                                                                  |
| `app`               | Inbox Web UI (React + Vite)                                                      |
| `server`            | Self-hosted Sentry-envelope ingest + issue store + REST/WS API                   |

## Prerequisites

- Node.js `>=20` (see `engines.node`)
- [Corepack](https://github.com/nodejs/corepack) — the pnpm version is pinned via the `packageManager` field (`pnpm@10.30.3`), so enable it once and `pnpm` resolves to the right version automatically:

```bash
corepack enable
```

## Quick start

```bash
pnpm install
pnpm -r run build

# 1. start server
cd server && pnpm dev &          # http://localhost:3000

# 2. create an app
cd ../packages/cli && node dist/index.js config set --server http://localhost:3000 --token dev-token
node dist/index.js app create --name demo --repo-url git@x:demo.git --branch main --json
# copy the appId

# 3. start the desktop app (set VITE_SERVER_URL to point at the server)
cd ../../app && echo 'VITE_SERVER_URL=http://localhost:3000' > .env && pnpm dev
```

Auth is intentionally disabled for the MVP: the server accepts all requests with no token, and the desktop app reads its backend address from `VITE_SERVER_URL`. The CLI and SDK still accept a `token` argument, which the server ignores.

## Integrating the SDK

```ts
import { init, report } from "@traceability/core";

init({
  dsn: "http://localhost:3000",
  appId: "<appId from the Inbox>",
  token: "dev-token",
  release: "1.0.0",
});

// custom event
report({ type: "feature-action", payload: { foo: 1 }, tags: { feature: "demo" } });
```

## Performance, source maps and Electron

- The Inbox **Performance** tab groups automatic browser metrics (FCP, LCP, CLS, INP, TTFB and DOMContentLoaded) by application. Send application-defined measurements with `reportPerformance({ name, value, unit })`.
- Upload release-matched source maps to `POST /api/apps/:appId/sourcemaps`; mapped locations and the original source excerpt appear in an issue's Stack trace tab. [`examples/web-demo`](examples/README.md) includes a minified preview build and upload helper.
- [`examples/electron-demo`](examples/electron-demo) validates main-process crash/uncaught errors, CPU/memory/network samples, OS/hardware context, renderer loss and IPC exception capture alongside the renderer SDK.

## The fix loop

1. SDK reports an exception -> server aggregates into an issue -> Inbox shows it.
2. Developer clicks **Start AI Fix** in the Inbox -> issue status becomes `fix-manual`.
3. The Fix Session page shows the CLI command to run locally.
4. A coding agent runs `traceability issue show <id> --json`, edits code, then `attach-patch` + `mark-fixed`.
5. The Inbox shows `fixing` -> `fixed`. The developer pushes the branch and opens the MR (v1 does not auto-open MRs).
