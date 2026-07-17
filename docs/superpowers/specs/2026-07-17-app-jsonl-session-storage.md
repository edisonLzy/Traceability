# App JSONL Session Storage

## Task

Replace the Electron app's agent-session persistence implementation with a
Pi-inspired JSONL event store. The public `SessionPersistenceIPC` contract is
unchanged.

## Scope

- In scope: `app/src/main/sessions`, the app package manifest and its tests.
- Out of scope: server storage, server `better-sqlite3`/Drizzle usage, IPC
  channel names and renderer-facing session types.

## Verified baseline

- The app and server currently resolve the same physical
  `better-sqlite3@12.11.1` native addon from pnpm's virtual store.
- The Electron app needs ABI 140 while the Node server needs ABI 127, so an
  Electron rebuild makes the server unable to start.
- The app session model is append-oriented: session metadata plus tree entries
  identified by `id` and `parentId`. `getBranch` already reads all session
  entries and builds an in-memory map.
- App type-check has unrelated, pre-existing errors in `skill-service.ts` and
  the existing persistence test.

## Data contract

Each session is one file at:

```text
<userData>/sessions/<encoded-app-id>/<session-id>.jsonl
```

The first record is a `session` header. Subsequent append-only records are:

- `entries`: an atomic batch of one or more `Entry` values and the resulting
  active leaf;
- `metadata`: the current name and update time;
- `leaf`: the active branch leaf and update time.

The in-memory projection is rebuilt by replaying these records. A missing
trailing newline is treated as an interrupted write and discarded. Corruption
in an earlier record is surfaced instead of silently losing history.

## Change details

1. Add `JsonlSessionStore`, which owns file layout, append/replay, validation,
   deletion and a one-time migration of the legacy SQLite file.
2. Change `SessionPersistence` to delegate to that store while preserving all
   existing IPC methods.
3. Read existing `traceability-agent.sqlite` once with `node:sqlite` only when
   the JSONL directory does not yet exist. Preserve it as a backup after a
   successful import. This migration handles both the legacy linear entries and
   the later `parent_id`/`leaf_entry_id` schema.
4. Remove the app's `better-sqlite3` dependency and Electron native rebuild
   postinstall hook. The server remains the workspace's only consumer.
5. Replace the database mock with real temporary-directory JSONL tests,
   including replay, branches, metadata, persistence across reopen, batch
   validation and recovery of an incomplete final line.

## Constraints and decisions

- JSONL is authoritative. Any future list index is a rebuildable cache, never
  a second source of truth.
- App writes happen in the Electron main process and are synchronous, small,
  newline-terminated and fsynced. This matches the current synchronous storage
  behavior and avoids interleaved writes.
- New files/directories use owner-only permissions where supported.
- The implementation is inspired by Pi Coding Agent's session shape, but does
  not depend on `pi-coding-agent` or promise byte-for-byte format compatibility.

## Resulting file structure

```text
app/src/main/sessions/
  index.ts
  jsonl-session-store.ts
  session-persistence.ts
  session-persistence.test.ts
```

## Acceptance criteria

- No app runtime dependency or lifecycle script rebuilds `better-sqlite3`.
- All `SessionPersistenceIPC` methods retain their behavior.
- Existing SQLite sessions are imported once without changing the original
  database file.
- JSONL replay restores entries, metadata and the active leaf, including tree
  branches.
- A Node server native smoke test can load `better-sqlite3` after a normal
  install, independently from Electron.
