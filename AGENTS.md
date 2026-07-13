# AGENTS.md

This file provides guidance to AI agents (Claude Code, Copilot, etc.) when working with code in this repository.

## Project Overview

**Traceability** is a Sentry-based web monitoring + exception-to-fix loop toolkit. It connects frontend error capture with session replay and AI-assisted debugging to create a seamless workflow from exception detection to resolution.

### Key Capabilities

- **rrweb session recording**: Capture and replay user sessions alongside errors
- **Sentry error integration**: Bridge between Sentry error events and replay data
- **Exception-to-fix loop**: AI-powered analysis connecting stack traces to source code
- **Desktop application**: Electron app for managing monitoring workflows
- **Server backend**: Fastify-based API server with SQLite storage

## Monorepo Structure

```
traceability/
├── app/                          # Electron desktop application
│   ├── src/
│   │   ├── main/                 # Electron main process
│   │   ├── renderer/             # React renderer (UI)
│   │   └── preload/              # Preload scripts
│   ├── package.json              # @traceability/app
│   └── electron-vite.config.ts
├── server/                       # Fastify-based API server
│   ├── src/                      # Express + WebSocket, Pino logging, better-sqlite3
│   └── package.json              # @traceability/server
├── packages/
│   ├── core/                     # @traceability/core: rrweb recording + Sentry capture
│   ├── protocol/                 # @traceability/protocol: shared type definitions
│   ├── electron/                 # @traceability/electron: Electron-specific Sentry integrations
│   ├── react/                    # @traceability/react: React bindings for traceability
│   ├── cli/                      # @traceability/cli: command-line interface
│   └── skills/                   # @traceability/skills: reusable skill modules
├── examples/                     # Example usage projects
├── docs/                         # Documentation
├── .husky/                       # Git hooks (pre-commit, commit-msg)
├── .vscode/                      # Workspace settings and debug configs
├── AGENTS.md                     # This file
├── pnpm-workspace.yaml           # Workspace + catalog versioning
├── oxlint.config.ts              # Linter configuration
├── oxfmt.config.ts               # Formatter configuration
├── lint-staged.config.mjs        # Pre-commit lint/stage configuration
├── commitlint.config.mjs         # Commit message linting
└── tsconfig.base.json            # Shared TypeScript configuration
```

## Common Commands

```bash
pnpm dev:app          # Start Electron app in dev mode (with inspector on 5858)
pnpm build            # Build all packages, server, and app
pnpm build:app        # Build only the Electron app via electron-vite
pnpm test             # Run all tests across all packages
pnpm type-check       # Type-check all packages (runs tsc --noEmit per package)
pnpm lint             # Lint all files (oxlint --fix)
pnpm format           # Format all files (oxfmt --write)
```

Each package also supports individual commands via `pnpm --filter`:

```bash
pnpm --filter @traceability/core test
pnpm --filter @traceability/server typecheck
pnpm --filter @traceability/app dev
```

## Architecture

| Layer              | Tech                                                             |
| ------------------ | ---------------------------------------------------------------- |
| **Electron App**   | Electron 39, React 19, Vite 7 (electron-vite), Tailwind CSS 4    |
| **Server**         | Express + WebSocket, Pino logging, better-sqlite3, Swagger       |
| **Core Library**   | @rrweb/record + @rrweb/replay, @sentry/browser                   |
| **React Bindings** | React 19, @sentry/react, @tanstack/react-query, @base-ui/react   |
| **Package Mgr**    | pnpm 10 (workspace + catalog), node-linker=hoisted               |

### Key Dependencies

- **Runtime**: Node.js >= 20, pnpm 10.30.3
- **Language**: TypeScript 7.x (catalog-managed)
- **Testing**: Vitest 4.x (catalog-managed) across all packages
- **Linting**: oxlint (not ESLint) with typescript + import plugins
- **Formatting**: oxfmt (not Prettier) with import sorting enabled
- **Editor**: oxlint config at `oxlint.config.ts`, oxfmt config at `oxfmt.config.ts`

## Key Conventions

### Package Manager

- **Strictly `pnpm`**. Never use `npm` or `yarn`.
- Use `pnpm exec <command>` instead of `npx <command>`.
- `nodeLinker=hoisted` is configured in `.npmrc` (flat `node_modules`).

### Shared Versions

- Shared dependency versions are managed via **pnpm catalog** in `pnpm-workspace.yaml`.
- Currently cataloged: `typescript` (^7.0.2), `vitest` (^4.0.16), `tsx` (^4.21.0).

### Code Quality

- **Linting**: `oxlint` with typescript + import plugins. Config at `oxlint.config.ts`.
- **Formatting**: `oxfmt` with import sorting. Config at `oxfmt.config.ts`.
- Both run **only on commit** via `lint-staged` (see below), not on save.

### Git Hooks (Husky + lint-staged)

- **`pre-commit`**: Runs `lint-staged`, which executes:
  - `oxlint --fix` on staged `*.{js,jsx,ts,tsx}` files
  - `oxfmt --write` on staged `*.{js,jsx,ts,tsx,json}` files
- **`commit-msg`**: Runs `commitlint` to enforce **Conventional Commits**.

### Conventional Commits

All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

<optional body>

Co-Authored-By: ...
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`, `ci`, `build`, `revert`.

### Testing

- **Vitest 4.x** (catalog-managed) is the test framework across all packages.
- Each package has its own `vitest.config.ts` and test directory (typically `src/tests/` or at package root).
- Root `pnpm test` runs all package tests via `pnpm -r run test`.

### TypeScript

- All packages use TypeScript 7.x from the workspace catalog.
- Shared base config at `tsconfig.base.json`.
- Each package extends the base config with its own `tsconfig.json`.
- Type-check with `pnpm type-check` (runs `tsc --noEmit` per package).

### Import Type Convention

- Always use `import type { ... }` for pure type imports:

  ```typescript
  // Good
  import type { SomeType } from "./module";
  import { runtimeValue, type SomeType } from "./module";

  // Avoid
  import { SomeType } from "./module"; // when SomeType is only a type
  ```

### Workspace References

- Internal packages are referenced via `workspace:*` protocol in `package.json`.
- Package names follow the `@traceability/<name>` convention.
- The root `package.json` defines `onlyBuiltDependencies` for `better-sqlite3`, `electron`, and `esbuild`.

## VS Code Setup

This repository includes workspace settings in `.vscode/settings.json`:

- **TypeScript SDK**: Pinned to workspace `node_modules/typescript/lib` (not VS Code's built-in).
- **Format on save**: Disabled (oxfmt runs via lint-staged on commit only).
- **Code actions on save**: Disabled (oxlint runs via lint-staged on commit only).

A launch configuration is also provided in `.vscode/launch.json` for attaching the debugger to the Electron main process on port 5858.

## CI/CD

The repository includes a CI workflow at `.github/workflows/ci.yml`. It validates type-checking, linting, formatting, and tests on each push/PR. The `version` file at the project root tracks the current release version.
