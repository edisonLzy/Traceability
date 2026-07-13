# @traceability/client

`@traceability/client` is the type-safe Axios client for the Traceability server REST API. It is intended for the CLI and desktop application's main-process agent tools.

## Usage

The client logs in with an account and password, then keeps the returned Bearer token only in the client instance's memory.

```ts
import { createTraceabilityClient } from "@traceability/client";

const client = createTraceabilityClient({
  baseUrl: "http://localhost:3000",
});

await client.login({
  account: "alice",
  password: "secret",
});

const issues = await client.issues.list({
  appId: "app-id",
  status: "open",
  limit: 20,
});

const issue = await client.issues.get(issues.items[0]!.id);
```

`login()` calls `POST /api/auth/login` with `{ account, password }`. The server must return its standard response envelope with `data: { token: string }`.

All subsequent calls attach `Authorization: Bearer <token>`. A 401 response clears the in-memory session; call `login()` again before continuing. The client does not persist credentials or tokens.

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
