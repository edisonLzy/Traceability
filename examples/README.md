# Traceability examples

Runnable demos that integrate `@traceability/core` against a local server.

## web-demo

A vanilla Vite + TypeScript app that fires each reportable event type.

### Prerequisites

1. Start the server (from repo root):
   ```bash
   export TRACEABILITY_API_TOKEN=dev-token
   cd server && pnpm dev
   ```
2. Start the Inbox UI and create an application, copy its `appId`:
   ```bash
   cd app && pnpm dev
   ```
   Open http://localhost:5173, log in (server=http://localhost:3000, token=dev-token), create an app, copy the App ID.

### Run the demo

```bash
cd examples/web-demo
pnpm install
pnpm dev
```

Open http://localhost:5174. In the browser console set the appId/token if needed:

```js
localStorage.setItem('demo.appId', '<paste appId>')
localStorage.setItem('demo.token', 'dev-token')
location.reload()
```

Click the buttons. Each fires an event that the server ingests and aggregates into an issue visible in the Inbox.

### Verify the loop

1. Click "Throw TypeError" -> the Inbox Issues page shows a new `TypeError: demo...` issue (live via WebSocket).
2. Open the issue -> "Start AI fix" -> the Fix Session page shows `traceability issue show <id> --json`.
3. From a terminal:
   ```bash
   cd packages/cli
   node dist/index.js config set --server http://localhost:3000 --token dev-token
   node dist/index.js issue show <issueId> --json
   ```
