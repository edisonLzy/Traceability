# preload/

The **only** bridge between the main process and the renderer. One file: `index.ts`.

## Responsibility

`index.ts` calls `contextBridge.exposeInMainWorld("traceability", api)`, exposing a small, typed `window.traceability` object to the renderer. It is the entire surface area the renderer can use to reach Node/the OS - everything not on this object is unreachable from the renderer.

## Structure

The `api` object is grouped by domain, mirroring the IPC channels registered in `main/index.ts`:

- `clipboard.writeText`
- `window.minimize` / `toggleMaximize` / `close`
- `sessions.list|create|get|rename|delete|setModel`
- `agent.prompt|abort|listModels|reloadModels|onEvent`

`onEvent` uses the internal `listen()` helper to wrap `ipcRenderer.on` and return an unsubscribe function - the convention for every main->renderer subscription.

## Rules

- **No business logic.** Each method is a one-line `ipcRenderer.invoke(...)` (or `listen` for subscriptions). Validation, state, and side effects all live in main. If you are tempted to add logic here, it belongs in `main/index.ts` (handler) or `main/agent/` (behavior) instead.
- **Types come from `@shared/ipc`.** `import type { ... } from "../shared/ipc.js"`. Every method's return type is asserted against the shared contract (`as Promise<...>`).
- **Every channel here must have a zod-validated handler in `main/index.ts`.** Adding a method here without a matching `ipcMain.handle` (or removing the handler) breaks the bridge. The two files change together.
- **Keep the surface narrow.** Do not expose `ipcRenderer` directly, do not add generic `invoke(channel, ...)` escape hatches. Each capability is a named method with a typed signature.
- Import specifiers use the `.js` suffix (this is a `tsc`-emitted ESM build, see `app/CLAUDE.md`).

## Security posture

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`. The preload runs in an isolated world with Node access; the renderer does not have Node access and can only call what `contextBridge` exposes. Preserve this - never set `nodeIntegration: true` and never expand the preload to forward arbitrary channels.
