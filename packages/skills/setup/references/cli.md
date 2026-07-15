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

> Required: `--name`, `--repo-url`, `--branch`. There is no DSN or token on the application - creating it yields an **appId**.

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

The fix loop - see the `diagnose-issue` skill.
