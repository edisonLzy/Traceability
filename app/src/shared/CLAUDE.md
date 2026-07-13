# shared/

The typed IPC contract between the main process and the renderer. Currently a single file, `ipc.ts`.

## Responsibility

`ipc.ts` holds **type-only** declarations: the shapes of IPC request args, response payloads, and the `AgentRuntimeEvent` streamed from main to renderer. It is the shared vocabulary every process agrees on before crossing the process boundary.

Three processes import it, each differently:

- **main** (`src/main/**`): `import type { ... } from "../../shared/ipc.js"` - relative, `.js` suffix, `import type`.
- **preload** (`src/preload/index.ts`): `import type { ... } from "../shared/ipc.js"` - relative, `.js` suffix, `import type`.
- **renderer** (`src/renderer/**`): `import type { ... } from "@shared/ipc"` - alias, no suffix.

## Rules

- **Types only.** No runtime values, no functions, no classes. `ipc.ts` must remain importable by both `tsconfig` projects (web + node) and must not pull in Node or DOM globals.
- **No imports from `main/` or `renderer/`.** This directory depends on nothing inside `app/`. (Domain types like `Issue`/`PerformanceSummary` come from `@traceability/protocol` via the renderer's `apis/`, not here.)
- When you add an IPC channel: add the request/response types here, a zod-validated handler in `main/index.ts`, and a typed wrapper in `preload/index.ts`. All three change together; the contract is only as safe as the zod schema in main.
- Keep event types narrow and stable - the renderer branches on `event.type` strings, so renaming a type here is a runtime-breaking change for `features/agent`.

## Migration note

The agent-core migration plans to split this single file into `shared/agent-message.ts`, `shared/ask-user-question-ipc.ts`, `shared/events-ipc.ts`, `shared/models-ipc.ts`, `shared/permissions-ipc.ts`, `shared/session-ipc.ts`, and `shared/skills-ipc.ts`. See `docs/superpowers/plans/2026-07-13-agent-core-migration.md`.
