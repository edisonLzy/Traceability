# Browser Explorer MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Spec (authoritative):** `docs/superpowers/specs/2026-07-22-browser-explorer-mvp.md`

**Goal:** Replace the Explorer placeholder with a secure one-tab browser that records safe diagnostic evidence and supports local element comments.

**Architecture:** Renderer owns the Electron `<webview>` and local comment state. `main/browser/BrowserService` is the typed-IPC boundary and composes a constrained guest session with a CDP-only capture state machine. A guest preload sends only sanitized user-operation and selected-element messages to its webview host.

**Tech Stack:** Electron 39, React 19, TypeScript, Electron CDP, Vitest 4, pnpm.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-22-browser-explorer-mvp.md`; its scope supersedes the broader Agent-integrated PRD for this work.
- Use `main/browser/` and a self-registering `BrowserService extends AbstractAgentIPCHandler<BrowserIPC>`; do not create `BrowserIPCHandler`.
- Browser partition is exactly `traceability-explorer`; guest is context isolated, sandboxed, web-secure, and has no Node integration.
- `BrowserRecording` has top-level stop-time `url`, not duration, start/end URL pairs, a page wrapper or navigation history.
- Response bodies: Fetch/XHR JSON only, 256 KiB each and 5 MiB per recording, recursive sensitive-key redaction. Never store headers, credentials, raw input values or uploads.
- Single visible guest only; do not add Agent/LLM, server, persistence, rrweb/replay, Issue, multi-tab, pause/resume, screenshot, cache-clearing or request-rewrite features.

---

### Task 1: Shared browser contracts and CDP capture state machine

**Files:**

- Create: `app/src/shared/browser-types.ts`
- Create: `app/src/shared/browser-ipc.ts`
- Create: `app/src/main/browser/browser-capture-service.ts`
- Create: `app/src/main/browser/browser-capture-service.test.ts`

**Interfaces:**

- Produces portable `BrowserRecording`, `RecordedOperation`, `RecordedRequest`, `BrowserElementSummary`, `BrowserComment` and `BrowserIPC` contracts as defined in the authoritative spec.
- Produces `BrowserCaptureService` with `setGuest(webContents)`, `clearGuest()`, `start()`, `stop()` and `destroy()` for Task 2.

- [ ] **Step 1: Write failing capture tests**

  Build an Electron `webContents.debugger` fake that records `attach`, `sendCommand`, `detach`, and EventEmitter listeners. Add separate tests for: normal Fetch JSON recursive redaction; non-JSON/non-Fetch metadata only; one-response and total-byte limits; pending request at stop; console/exception and heap samples; repeated start rejection; and debugger/body failures that still return a valid recording.

- [ ] **Step 2: Run the focused test to verify RED**

  Run: `pnpm --filter @traceability/app exec vitest run src/main/browser/browser-capture-service.test.ts`

  Expected: FAIL because the service and/or shared contracts do not exist.

- [ ] **Step 3: Implement the portable contracts and minimum capture state machine**

  Keep Electron-only types in the main service. Start active state before attach; attach debugger protocol `1.3`; enable Network/Runtime/Log; create a fresh request entry for redirects; reserve budgets before body fetch; recursively redact sensitive JSON keys; and make stop clean timer, listener, CDP and maps without clearing Chromium cache.

- [ ] **Step 4: Run the focused test to verify GREEN**

  Run: `pnpm --filter @traceability/app exec vitest run src/main/browser/browser-capture-service.test.ts`

  Expected: all capture tests PASS.

- [ ] **Step 5: Commit the independently tested state machine**

  ```bash
  git add app/src/shared/browser-types.ts app/src/shared/browser-ipc.ts app/src/main/browser/browser-capture-service.ts app/src/main/browser/browser-capture-service.test.ts
  git commit -m "feat(app): add browser diagnostic capture"
  ```

### Task 2: Secure guest session, BrowserService and main-process IPC lifecycle

**Files:**

- Create: `app/src/main/browser/browser-guest-session.ts`
- Create: `app/src/main/browser/browser-service.ts`
- Create: `app/src/main/browser/browser-service.test.ts`
- Modify: `app/src/shared/events-ipc.ts`
- Modify: `app/src/main/index.ts`
- Modify: `app/electron.vite.config.ts`

**Interfaces:**

- Consumes `BrowserIPC` and `BrowserCaptureService` from Task 1.
- Produces allowlisted `registerBrowserGuest`, `unregisterBrowserGuest`, `startBrowserRecording` and `stopBrowserRecording` renderer calls.
- Produces a built `browser-guest.cjs` path for Task 3.

- [ ] **Step 1: Write failing service tests**

  Mock Electron `ipcMain`, `session`, `webContents.fromId` and a BrowserWindow. Test four self-registered handlers, valid hosted-webview registration, rejected foreign/non-webview registration, unregister/destroy capture cleanup, and `updateBrowserWindow` accepting a recreated window.

- [ ] **Step 2: Run the focused test to verify RED**

  Run: `pnpm --filter @traceability/app exec vitest run src/main/browser/browser-service.test.ts`

  Expected: FAIL because the secure session and Browser service do not exist.

- [ ] **Step 3: Implement secure main-side ownership and lifecycle**

  Add `BrowserIPC` to `AgentRuntimeIPC` and its four keys to the existing runtime allowlist. Implement BrowserService in the `AgentPool` self-binding style, compose the session and capture services, and use `webContents.fromId()` plus `hostWebContents` equality to verify ownership. Configure session preload/permissions/download/navigation/new-window policy and enforce hardened web preferences in `will-attach-webview`. Enable `webviewTag`, construct BrowserService after window creation, forward the macOS window recreation, and destroy it on quit. Add a second CJS preload build input named `browser-guest`.

- [ ] **Step 4: Run focused tests and typecheck to verify GREEN**

  Run: `pnpm --filter @traceability/app exec vitest run src/main/browser/browser-service.test.ts src/main/browser/browser-capture-service.test.ts && pnpm --filter @traceability/app typecheck`

  Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit the main process integration**

  ```bash
  git add app/electron.vite.config.ts app/src/main/index.ts app/src/main/browser app/src/shared/events-ipc.ts
  git commit -m "feat(app): add secure browser service"
  ```

### Task 3: Guest event protocol and renderer webview primitives

**Files:**

- Create: `app/src/preload/browser-guest.ts`
- Create: `app/src/renderer/pages/explorer/browser-url.ts`
- Create: `app/src/renderer/pages/explorer/browser-url.test.ts`
- Create: `app/src/renderer/pages/explorer/browser-webview.ts`
- Create: `app/src/renderer/pages/explorer/browser-webview.test.ts`

**Interfaces:**

- Consumes the guest message and element-summary contracts from Task 1 and the `browser-guest.cjs` build output wired in Task 2.
- Produces `normalizeBrowserUrl`, a disposable `BrowserWebviewController`, and the `traceability:browser-command` / `traceability:browser-guest` guest protocol for Task 4.

- [ ] **Step 1: Write failing URL/controller tests**

  Test missing-scheme HTTPS normalization, loopback-only HTTP acceptance, malformed/non-web URL rejection, callback forwarding for DOM-ready/load/title/navigation/IPC events, hardened webview attributes, guest command forwarding, and complete disposal. Use a minimal fake document/webview EventTarget so the tests remain in Vitest's node environment.

- [ ] **Step 2: Run the focused test to verify RED**

  Run: `pnpm --filter @traceability/app exec vitest run src/renderer/pages/explorer/browser-url.test.ts src/renderer/pages/explorer/browser-webview.test.ts`

  Expected: FAIL because URL and webview helpers do not exist.

- [ ] **Step 3: Implement safe renderer and guest primitives**

  Implement the normalizer and controller without React ownership. Make the controller create one `webview` with the exact partition and hardened preferences. In the guest preload, run only in the top frame; ignore events until recording/selection commands arrive; emit only the portable safe operation fields; and consume exactly one selected click while preventing its page action.

- [ ] **Step 4: Run focused tests, typecheck and preload build to verify GREEN**

  Run: `pnpm --filter @traceability/app exec vitest run src/renderer/pages/explorer/browser-url.test.ts src/renderer/pages/explorer/browser-webview.test.ts && pnpm --filter @traceability/app typecheck && pnpm --filter @traceability/app build`

  Expected: tests/typecheck/build PASS and the packaged preload contains `browser-guest.cjs`.

- [ ] **Step 5: Commit browser primitives**

  ```bash
  git add app/src/preload/browser-guest.ts app/src/renderer/pages/explorer/browser-url.ts app/src/renderer/pages/explorer/browser-url.test.ts app/src/renderer/pages/explorer/browser-webview.ts app/src/renderer/pages/explorer/browser-webview.test.ts
  git commit -m "feat(app): add explorer browser primitives"
  ```

### Task 4: Explorer UI, local comment flow and manual fixture

**Files:**

- Create: `app/src/renderer/pages/explorer/browser-comment-composer.tsx`
- Modify: `app/src/renderer/pages/explorer/index.tsx`
- Create: `app/scripts/explorer-fixture-server.mjs`

**Interfaces:**

- Consumes `BrowserWebviewController`, `normalizeBrowserUrl`, browser IPC through `useElectronIPC`, and guest event payloads from Task 3.
- Produces the complete single-tab Explorer page and a manual fixture command: `node app/scripts/explorer-fixture-server.mjs`.

- [ ] **Step 1: Write failing page-state tests**

  Extract pure page state transitions if needed and cover: start invokes main before enabling guest recording; stop disables guest before invoking main and logs one BrowserRecording; selected element opens comment state; comment submit logs one BrowserComment and does not persist it; unmount unregisters the guest. Keep DOM rendering outside the node test boundary.

- [ ] **Step 2: Run the focused test to verify RED**

  Run: `pnpm --filter @traceability/app exec vitest run src/renderer/pages/explorer`

  Expected: FAIL because the page state module/tests do not exist or the placeholder does not satisfy the transitions.

- [ ] **Step 3: Implement the Explorer composition**

  Replace the placeholder with a browser toolbar, bounded error state, page title/loading indicators, navigation controls, selection and start/stop controls, webview host, and an in-memory comment composer. Create/register the controller exactly once after the host mounts; dispose/unregister on unmount. The only data output uses the two exact `console.info` labels in the spec. Add the fixture endpoints for valid JSON, 422 JSON, oversized JSON, a slow request, console error and selectable elements.

- [ ] **Step 4: Run focused tests and App checks to verify GREEN**

  Run: `pnpm --filter @traceability/app exec vitest run src/renderer/pages/explorer && pnpm --filter @traceability/app typecheck && pnpm --filter @traceability/app build`

  Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit the visible MVP**

  ```bash
  git add app/src/renderer/pages/explorer app/scripts/explorer-fixture-server.mjs
  git commit -m "feat(app): implement explorer browser"
  ```

### Task 5: End-to-end validation and scope audit

**Files:**

- Modify: `docs/superpowers/specs/2026-07-22-browser-explorer-mvp.md` only if a verification-observed baseline correction is necessary.

**Interfaces:**

- Consumes all completed Browser/Explorer deliverables.
- Produces verification evidence only; it adds no new Browser feature.

- [ ] **Step 1: Run the full automated suite**

  Run: `pnpm --filter @traceability/app test && pnpm --filter @traceability/app typecheck && pnpm --filter @traceability/app build`

  Expected: all commands exit 0.

- [ ] **Step 2: Run manual Electron smoke verification**

  Start the fixture, start the App, open its loopback URL, test navigation, start/stop, valid/422/oversized/slow requests, console error, input summary and one element comment. Verify the two expected console JSON logs and verify no cache-clear call occurs.

- [ ] **Step 3: Audit the diff against global constraints**

  Run: `git diff --check && rg -n "clearBrowserCache|rrweb|AgentPanel|createIssue|Authorization|Cookie" app/src/main/browser app/src/renderer/pages/explorer app/src/preload/browser-guest.ts`

  Expected: whitespace check passes and no out-of-scope integration or cache clear is introduced.

- [ ] **Step 4: Commit any verification-only correction**

  ```bash
  git add docs/superpowers/specs/2026-07-22-browser-explorer-mvp.md
  git commit -m "docs: record browser explorer verification"
  ```
