# @traceability/client

`@traceability/client` is the type-safe Axios client for the Traceability server REST API. It is intended for the CLI and desktop application's main-process agent tools.

## Usage

The client can authenticate in one of two ways:

- **Pre-provisioned token** — pass a static `token` to the factory. The client uses it for every authenticated request. This is how the CLI works (it stores a token in its config), and it is the only option while the server has auth disabled for the MVP.
- **Login** — call `login({ account, password })`, which keeps the returned bearer token in the client instance's memory. The server must expose `POST /api/auth/login` returning the standard envelope with `data: { token: string }`.

### Pre-provisioned token

```ts
import { createTraceabilityClient } from "@traceability/client";

const client = createTraceabilityClient({
  baseUrl: "http://localhost:3000",
  token: process.env.TRACEABILITY_TOKEN,
});

const issues = await client.issues.list({ appId: "app-id", limit: 20 });
```

### Login

```ts
import { createTraceabilityClient } from "@traceability/client";

const client = createTraceabilityClient({
  baseUrl: "http://localhost:3000",
});

await client.login({ account: "alice", password: "secret" });

const issues = await client.issues.list({
  appId: "app-id",
  status: "open",
  limit: 20,
});

const issue = await client.issues.get(issues.items[0]!.id);
```

`login()` calls `POST /api/auth/login` with `{ account, password }`. The server must return its standard response envelope with `data: { token: string }`.

All subsequent calls attach `Authorization: Bearer <token>`. When using `login()`, a 401 response clears the in-memory session; call `login()` again before continuing. A pre-provisioned token is never cleared by a 401. The client does not persist credentials or tokens.

## API

| Group | Methods |
| --- | --- |
| `health` | `check()` |
| `apps` | `list()`, `get()`, `create()`, `update()`, `remove()`, `uploadSourceMap()` |
| `issues` | `list()`, `get()`, `getEvents()`, `requestFix()`, `attachPatch()`, `markFixed()` |
| `replays` | `save()`, `listForIssue()`, `getForIssue()` |
| `performance` | `record()`, `getSummary()` |
| `ingest` | `envelope()` |

All methods return the inner `data` value from the server's `{ code, data, timestamp }` envelope. Path parameters are URL encoded and the raw envelope ingest method sends `text/plain`.

Request and response DTOs—including `Application`, `Issue`, `ListIssuesParams`, and `RrwebReplayIngestBody`—are re-exported from `@traceability/protocol`.

## Errors

Requests reject with `TraceabilityClientError`. It exposes the HTTP `status`, server business `code`, and server `traceId` when available.

```ts
import { TraceabilityClientError } from "@traceability/client";

try {
  await client.apps.get("missing-app");
} catch (error) {
  if (error instanceof TraceabilityClientError) {
    console.error(error.status, error.code, error.traceId, error.message);
  }
}
```

## Development

```bash
pnpm --filter @traceability/client typecheck
pnpm --filter @traceability/client test
pnpm --filter @traceability/client build
```

### Packaging note

The package ships source as its TypeScript entrypoint (`types`) but built JS as its runtime entrypoint (`main`/`exports.import`). Type-checking reads the source, so `pnpm type-check` needs no prior build. Runtime consumers (the CLI's built `dist/index.js`, or `tsx`) resolve to `./dist/index.js`, so build the client once before running them - the root `pnpm build` does this in dependency order (client before CLI).
