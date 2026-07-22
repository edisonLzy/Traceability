# Browser Explorer MVP Specification

**Status:** implementation authority for the Browser/Explorer MVP.

## Task

Turn the placeholder `ExplorerPage` into a single-tab, security-constrained Electron browser. Users can navigate an HTTPS or loopback HTTP page, explicitly record safe operation/network/console/heap diagnostics, and select an element to add an in-memory comment. A stopped recording and a submitted comment are printed to the renderer developer console only.

## Scope

In scope:

- One renderer-owned Electron `<webview>` with address navigation, back, forward, refresh, title and loading state.
- A non-persistent `traceability-explorer` guest session with an isolated, sandboxed guest preload and deny-by-default privileges.
- Main-process CDP capture of network metadata, eligible JSON response bodies, warnings/errors/exceptions and heap samples.
- Safe guest-side click/input/submit summaries, one-shot element selection, and local comments.

Explicitly out of scope:

- Agent Panel or LLM interaction, Issue drafts, server calls, persisted data, rrweb recording/replay, screenshots, multiple tabs, pause/resume, request rewriting and cache clearing.

## Authoritative decisions

- This specification supersedes the broader Agent-integrated scope in `docs/product/2026-07-21-explorer-mvp-prd.md` for this implementation. The linked design task explicitly chose an independent Browser/Explorer MVP first.
- Browser domain code lives under `app/src/main/browser/`, not `main/explorer/`.
- `BrowserService` is the single main-process Browser domain entry. It extends `AbstractAgentIPCHandler<BrowserIPC>`, implements `BrowserIPC`, self-registers its handlers in `bind()`, is instantiated by `main/index.ts`, receives `updateBrowserWindow()` on macOS window recreation, and releases resources in `destroyAll()`.
- The recording uses top-level `url`, captured at stop. It must not expose `durationMs`, `initialUrl`, `finalUrl`, a nested `page` object, or navigation history.
- The non-persistent partition is exactly `traceability-explorer`.
- The capture limits are exactly 256 KiB per response body and 5 MiB per recording. Never capture headers, Cookie, Authorization, raw form values or uploaded files.

## Baseline verified on 2026-07-22

- `app/src/renderer/pages/explorer/index.tsx` is a placeholder.
- `app/src/main/index.ts` has `contextIsolation: true` and `nodeIntegration: false`, but does not enable `webviewTag` or create a Browser service.
- Typed renderer-to-main calls are composed by `app/src/shared/events-ipc.ts`; preload only exposes the generic allowlisted `window.electronAPI.invoke` bridge.
- `AgentPool` and `SessionPersistence` are the service-lifecycle templates. `SessionPersistence` now has a node/Vitest test using a mocked Electron module, so Browser services may be tested similarly.
- `pnpm --filter @traceability/app test` passed: 8 files, 69 tests.

## Data contracts

Create `app/src/shared/browser-types.ts` with portable types only:

```ts
export type BrowserInputLength = "empty" | "1-8" | "9-32" | "33-128" | "129+";

export interface BrowserElementSummary {
  tagName: string;
  role: string | null;
  name: string | null;
  selector: string | null;
  text: string | null;
}

export type RecordedOperation =
  | { id: string; at: string; type: "click" | "submit"; target: BrowserElementSummary }
  | {
      id: string;
      at: string;
      type: "input";
      target: BrowserElementSummary;
      input: { fieldType: string; isSensitive: boolean; length: BrowserInputLength };
    };

export type RecordedResponse =
  | { state: "captured"; body: unknown }
  | { state: "skipped"; reason: "not-fetch-xhr" | "not-json" | "resource-limit" }
  | { state: "unavailable"; reason: "body-read-failed" | "invalid-json" | "stopped" }
  | { state: "pending-at-stop" };

export interface RecordedRequest {
  id: string;
  url: string;
  method: string;
  startedAt: string;
  resourceType: string | null;
  status: number | null;
  mimeType: string | null;
  encodedBytes: number;
  response: RecordedResponse;
}

export interface BrowserRecording {
  version: 1;
  id: string;
  startedAt: string;
  endedAt: string;
  url: string;
  operations: RecordedOperation[];
  network: RecordedRequest[];
  console: Array<{ at: string; level: "warning" | "error" | "exception"; message: string }>;
  memory: {
    metric: "JSHeapUsedSize";
    samples: Array<{ at: string; usedBytes: number; totalBytes?: number }>;
    initialBytes: number;
    finalBytes: number;
    deltaBytes: number;
  };
  captureErrors: Array<{ source: "cdp" | "guest"; message: string; at: string }>;
}

export interface BrowserComment {
  id: string;
  createdAt: string;
  url: string;
  element: BrowserElementSummary;
  comment: string;
}
```

Create `app/src/shared/browser-ipc.ts`:

```ts
export interface BrowserIPC {
  registerBrowserGuest(input: { webContentsId: number }): Promise<void>;
  unregisterBrowserGuest(): Promise<void>;
  startBrowserRecording(): Promise<{ recordingId: string }>;
  stopBrowserRecording(): Promise<BrowserRecording>;
}
```

The guest-to-host payload is a portable discriminated union in `browser-types.ts`. It permits only `operation` carrying a `RecordedOperation`, and `element-selected` carrying `BrowserElementSummary` plus URL. It has no path for raw input values.

## Browser service design

`BrowserCaptureService` is a focused state machine, injected with the selected Electron guest `WebContents` and independently unit-tested with a debugger fake. It owns one guest and zero or one active recording.

- `start()` throws when no guest exists or a recording is already active. It creates recording state before CDP attachment so a failed attach is represented in `captureErrors` and the caller may still stop a valid, empty recording.
- It attaches debugger protocol `1.3`, subscribes to `message`, enables `Network`, `Runtime`, `Log`, samples `Performance.getMetrics`, and starts a one-second heap timer.
- `requestWillBeSent`, `responseReceived`, `dataReceived` and `loadingFinished` create and update a request record. Redirects allocate a separate internal sequence; no hop overwrites the preceding record.
- Metadata is kept for every request. A body is eligible only when its resource type is Fetch/XHR and its MIME type is `application/json` or ends in `+json`. The encoded bytes reserve the 256 KiB/5 MiB budgets before `Network.getResponseBody` runs. A base64 body is decoded, JSON parsed and recursively redacted for case-insensitive keys including `token`, `password`, `secret`, `cookie`, `authorization` and `apiKey`.
- Body-reading failures, CDP errors and unsupported bodies become the appropriate response state or a timestamped `captureErrors` entry. They never make browsing fail.
- `stop()` clears its timer, marks unfinished requests `pending-at-stop`, marks active body work `unavailable/stopped`, takes a final heap sample, disables the CDP domains, removes the listener, detaches safely, snapshots the output, and clears Maps/tasks. It does not clear Chromium HTTP cache.

`BrowserGuestSession` owns the `traceability-explorer` Session setup. It must set the compiled guest preload, deny both permission requests and permission checks, prevent downloads, force `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webSecurity: true` in `will-attach-webview`, and reject `javascript:`, `file:`, `data:` and non-loopback `http:` navigation. New windows are denied; valid destinations are loaded in the existing guest.

`BrowserService` composes these two classes. Guest registration resolves `webContents.fromId`, requires a non-destroyed `webview` whose `hostWebContents` is the current BrowserWindow's webContents, then passes it to both the session policy and capture service. Its `bind()` registers exactly the four `BrowserIPC` keys. Destroying/unregistering a guest tears down active capture before releasing the guest.

## Renderer design

`browser-url.ts` is a pure, tested URL normalizer. It prefixes a missing scheme with `https://`, permits `https:` and only loopback `http:`, and returns a stable error for empty, malformed or unsupported input.

`browser-webview.ts` creates exactly one `webview` with `document.createElement`, partition `traceability-explorer`, and hardened `webpreferences`. It exposes a small controller for navigate/back/forward/reload/send, maps DOM-ready/load/title/navigation/guest IPC events into callbacks, and disposes every listener and node. The controller is not recreated by React renders.

`preload/browser-guest.ts` runs only in the top frame. It listens to a host command channel to toggle recording and selection. In recording mode it emits only safe click/input/submit summaries. In selection mode it intercepts exactly the next click with `preventDefault()` and `stopImmediatePropagation()`, emits `element-selected`, and returns to normal mode. A summary prioritizes `data-testid`, then `id`, then `aria-label`, and otherwise uses a bounded CSS path and bounded text.

`ExplorerPage` owns the displayed URL, input text, title, loading/navigation affordances, recording flag, selected element and comments. It registers the webview's ID after DOM ready and unregisters it on unmount. Start calls main then enables the guest; stop disables the guest then calls main and writes:

```ts
console.info("[traceability:explorer-recording]", JSON.stringify(recording, null, 2));
console.info("[traceability:explorer-comment]", JSON.stringify(comment, null, 2));
```

No recording data is sent to Agent, server or local persistence.

## Resulting file structure

```text
app/
├── electron.vite.config.ts                         # second CJS guest preload entry
└── src/
    ├── main/
    │   ├── index.ts                                # webviewTag + BrowserService lifecycle
    │   └── browser/
    │       ├── browser-capture-service.ts
    │       ├── browser-capture-service.test.ts
    │       ├── browser-guest-session.ts
    │       ├── browser-service.ts
    │       └── browser-service.test.ts
    ├── preload/
    │   └── browser-guest.ts
    ├── renderer/pages/explorer/
    │   ├── index.tsx
    │   ├── browser-url.ts
    │   ├── browser-url.test.ts
    │   ├── browser-webview.ts
    │   ├── browser-webview.test.ts
    │   ├── explorer-interactions.ts           # testable async recording/comment coordinator
    │   ├── explorer-interactions.test.ts
    │   └── browser-comment-composer.tsx
    └── shared/
        ├── browser-ipc.ts
        ├── browser-types.ts
        └── events-ipc.ts                           # BrowserIPC composition and allowlist
```

`app/scripts/explorer-fixture-server.mjs` is also added for manual testing with success JSON, 422 JSON, oversized JSON, slow JSON, console error and selectable controls.

## Acceptance criteria

- App tests, typecheck and build pass after the changes.
- The only renderer-to-main Browser channels are the four exact `BrowserIPC` method names and all four have a main handler.
- Guest registration rejects a non-webview or a webview not hosted by the current main window.
- A normal Fetch/XHR JSON response is captured with recursively redacted sensitive keys; non-JSON and non-Fetch/XHR requests expose metadata but no body.
- A response over 256 KiB or aggregate response bodies over 5 MiB are `skipped/resource-limit`; a request pending at stop is `pending-at-stop`; response/CDP failures still yield valid recording JSON.
- Stopping removes timer/listeners and detaches CDP without clearing browser cache.
- Browser navigation and selection work while no recording exists; selection blocks exactly the selected page action.
- No raw form value, file data, header, cookie, authorization value, Agent integration, server call, rrweb capture, durable storage or Issue operation is added.
