# Extension Migration Handoff & Remaining TODOs

> **For agentic workers:** This is a **handoff + reconciliation** document, not a from-scratch plan. It captures work completed in session `6a9b0c4a` (commit `36f843a`) and reconciles it with three pre-existing detailed plans it partially supersedes. Steps use checkbox (`- [ ]`) syntax. Where a TODO says "execute `<plan>` Task N", open that plan and run its bite-sized steps verbatim, then apply the reconciliation note.

**Goal:** Finish aligning Traceability's agent chat with divisor-agent now that the extension mechanism + subagents plugin have been migrated (full main+renderer, artifacts stripped).

**Architecture:** The extension framework is inlined at `app/src/extensions/{core,builtins}/` + host glue at `app/src/main/extensions/`. The main agent runtime now merges extension tools/prompts and owns a programmatic multi-agent runtime. Remaining work: (1) sessions SQLite persistence (still missing), (2) mount the renderer extension context, (3) port the richtext slash-command layer, (4) wire extension slash-commands + assistant-block rendering into the chat UI, (5) finish the `active-session-content` split.

**Tech Stack:** Electron 39, electron-vite, `@earendil-works/pi-agent-core`/`pi-ai` 0.74, Emittery 2, TipTap 3, better-sqlite3, zustand 5 (vanilla `createStore`), React 19, vitest 4, TypeScript strict + `noUncheckedIndexedAccess`.

## Global Constraints

- **Store name stays `agentStore` / `store/agent/`** (NOT `mainStore`). The `agent-renderer-migration.md` plan fixes this; do not rename. The extension migration did not touch the store.
- **Artifact logic stays excluded.** The read-only agent has no artifacts. `ExtensionsContextAPI` was deliberately trimmed to `{ getActiveSessionId, sharedPromptEditor }` (no `upsertArtifact`/`openArtifact`/`appendSideChatMeta`).
- **Permission/tool-execution UI stays excluded.** The read-only agent emits no `permission_requested` and no tool-execution cards. `subagents.list` is the only assistant block; subagent *tool events* inside a subagent are not surfaced as tool cards in the main panel.
- **Single-pkg app:** extensions are inlined source (not a workspace package). Do not reintroduce `@divisor-agent/extension-core` as a dependency.
- **ESM `.js` import specifiers** in `src/main/**` and `src/extensions/core/{common,main}/**` + `src/extensions/builtins/*/main/**` (main side). Renderer side (`src/extensions/core/renderer/**`, `src/renderer/**`) uses no `.js` suffix. Match each file's side.
- **tsconfig side split:** `tsconfig.node.json` (main, no jsx) includes main-side extension globs; `tsconfig.web.json` (renderer, jsx) excludes them. Do not let main typecheck `.tsx` or renderer typecheck `electron`/`ipcMain`.

---

## Completed This Session (commit `36f843a`)

Migrated the divisor extension mechanism + subagents plugin, full main+renderer, artifacts stripped. Verified: web typecheck clean; node typecheck clean except 8 pre-existing errors in `src/main/skills/skill-service.ts`; `electron-vite build` succeeds (main 27 modules / preload / renderer 4794 modules); `vitest` 11/11 pass.

**Files created:**
- `src/extensions/core/{common,main,renderer}/` — framework (ipc types, divisor-block parsers, `MainExtensionBridge`/`Registry`/`IPC`, renderer `bridge`/`registry`/`provider`/`contextAPI`/`hooks`/`parser`/`sharedPromptEditor`). No `divisor-artifact`.
- `src/main/extensions/{extension-service,runtime-service,installed-extensions,index}.ts` — main host glue (mirrors divisor's `src/main/extensions/`).
- `src/extensions/builtins/subagents/{common,main,renderer}/` + `builtins/index.renderer.tsx` — subagents builtin.

**Main wiring changed:**
- `src/main/agent-runtime.ts` — `AgentRuntime` ctor now `(modelRegistry, skillService, extensionService, options?)`; `options.extensionTools?: ExtensionAgentToolOptions`; merges `extensionService.getToolsForRuntime(...)` into `tools` and `addBuilder(extensionService)` into the system-prompt service; added private `getCurrentModel()`. Type-only `extensionService` import avoids the runtime cycle.
- `src/main/agent-pool.ts` — `AgentPool` owns `ExtensionRuntimeService` + `ExtensionService`, passes `extensionService` to every runtime, forwards subagent events, destroys the runtime service in `destroyAll()`.
- `src/renderer/App.tsx` — mounts `<ExtensionProvider extensions={installedRendererExtensions}>` around the router.
- `electron.vite.config.ts` + `tsconfig.json` — `@extensions/*` alias.
- `tsconfig.{json,node.json}` — side-specific globs for `src/extensions/`.

**Subagents behavior:** `subagents/run` tool spawns 1-4 side-chat sub-agents via `ExtensionRuntimeService.createAgent({scope:"side-chat", mode:"inherit-model"})`, streams snapshots, publishes a `subagents.list` assistant block. Renderer registers the `/subagent` slash command + a non-interactive status list block (click-to-open-artifact removed, `artifactId` field removed).

---

## CRITICAL: Decisions That Supersede the Existing Plans

The three pre-existing agent-migration plans were written assuming **no extensions**. This session's "全量对齐 divisor" + migrate-subagents decision overrides those exclusions. A future worker must NOT "fix" the extension code by reverting it to match these old lines:

| Plan | Old decision (now superseded) | New reality (commit `36f843a`) |
|---|---|---|
| `2026-07-13-agent-core-migration.md:16` | "Do not migrate extensions/plugins, Artifacts, side chat, … subagents" | Extension framework + subagents migrated. Artifacts still excluded. |
| `2026-07-13-agent-main-migration.md:7` | "extensions + builtin tools are out of scope → `tools: []`" | `AgentRuntime` merges `extensionService.getToolsForRuntime(...)`; `AgentPool` owns the extension runtime. `tools` is no longer `[]`. |
| `2026-07-13-agent-renderer-migration.md:22` | "extension renderer APIs" excluded | `ExtensionProvider` mounted at `App.tsx`; `src/extensions/core/renderer/` inlined. |
| `2026-07-13-agent-renderer-migration.md:33,136` | "Do not port tool/artifact/extension components"; "Do not add divisor extension packages" | Extension *framework* ported; slash-command + assistant-block integration is now IN scope (TODOs D, E). Tool/permission/artifact *UI* still excluded. |
| `2026-07-13-agent-renderer-migration.md:271` | "reject imports from `@divisor-agent/extension-*`" | Still reject `@divisor-agent/*` package imports, but `@extensions/*` (the inlined framework) is now the sanctioned path. |

**Unchanged plan decisions to keep respecting:**
- Sessions persistence = main-process SQLite + `sessions:*` IPC (no HTTP server). See `agent-core-migration.md:12,17,132-139` and `agent-main-migration.md` Phase M3.
- Store lives at `renderer/store/agent/` as a single `agentStore` (`agent-renderer-migration.md:7,46,82`). Do not rename to `mainStore`.
- Linear sessions only: no fork/rewind/workspace/pin UI.
- `AskUserQuestion` is the only retained HIL view; no permission approval UI.

---

## Verified Current State (as of `36f843a`)

| Item | Status |
|---|---|
| `src/main/sessions/` (SQLite persistence) | **MISSING** — Phase M3 of `agent-main-migration.md` NOT executed |
| `sessions:*` in `ALLOWED_RENDER_INVOKE_EVENTS` | **MISSING** (0 matches in `src/shared/events-ipc.ts`) |
| Renderer hooks call `sessions:*` via type-bypassing casts | **Still present** in `use-agent-session.ts`, `use-agent-messages.ts`, `CommandPalette.tsx` — throws at runtime at the preload guard |
| `ExtensionsContextAPIProvider` mounted | **NOT mounted** (only `ExtensionProvider` is) |
| `src/renderer/components/richtext/` (slash-commands extension) | **MISSING** |
| prompt-input consumes `usePluginSlashCommands` | **NO** |
| messages render assistant blocks (`useAssistantBlock`/`parseExtensionParts`) | **NO** |
| Store | `agentStore` at `store/agent/` (4 slices: entries, sessions, HITL, pending) — matches renderer plan |
| `_agent/index.tsx` | Monolithic `AgentPanel` (~400 lines), not yet split into `active-session-content` |
| Pre-existing | `src/main/skills/skill-service.ts` has 8 `noUncheckedIndexedAccess` typecheck errors on `feature/agent` — not caused by this work; fix separately or ignore |

---

## Remaining Work — Sequenced TODOs

### TODO A - Sessions SQLite persistence

> **Spec (authoritative):** `docs/superpowers/specs/2026-07-14-session-persistence.md`. The steps below summarize it; the spec carries the exact interfaces and baseline diffs.

**Execute:** `docs/superpowers/plans/2026-07-13-agent-main-migration.md` **Phase M3, Task 15-16 verbatim** (the `database.ts` better-sqlite3 wrapper + `session-schema.ts` id=2 migration + `SessionRow`/`EntryRow`/`toSession`/`toEntry`). **Task 17-18 are NOT verbatim** - the reconciliation below reshapes the service into a self-registering `AbstractAgentIPCHandler` matching the existing `agent-pool.ts` pattern, renames the class, and changes the channel naming.

**Reconciliation notes (supersede M3 Task 17/18; supersede Task 4/5's `sessions:*` colon names):**
- **Class is `SessionPersistence`** (NOT `SessionService`), `extends AbstractAgentIPCHandler<SessionPersistenceIPC> implements SessionPersistenceIPC`. Handlers self-register in `protected override bind()` as arrow-function fields keyed by channel name - mirror `app/src/main/agent-pool.ts` exactly. `main/index.ts` does NOT register handlers; it only `new SessionPersistence(browserWindow)` (and `.updateBrowserWindow(...)` on window recreate, `.destroyAll()` on quit), just like `AgentPool`.
- **`LocalDatabase` is constructed inside `SessionPersistence`'s ctor** (not in `main/index.ts`). Ctor signature `(browserWindow: BrowserWindow)` to satisfy `AbstractAgentIPCHandler`.
- **Channel/method/interface-key naming = descriptive bare names** (NOT `sessions:*` colon-prefixed), matching the existing bare-name `ALLOWED_RENDER_INVOKE_EVENTS` style (`prompt`, `listSkills`, ...). The 7 methods: `createSession(appId): Session`, `listSessions(appId): Session[]`, `getSession(id): Session | null`, `getSessionEntries(id): Entry[]`, `renameSession(id, name): void`, `deleteSession(id): void`, `appendSessionEntries(id, Entry[]): void`. (`deleteSession` has no renderer caller yet but is part of the contract - implement it + allowlist it.)
- **Baseline differs from M3 Task 4/5 text (do NOT copy verbatim):** the live `shared/events-ipc.ts` already uses `AgentRuntimeIPC = AgentModelsIPC & AgentSessionIPC & AgentSkillsIPC` (NOT `TraceabilityInvokeIPC`), a bare-name allowlist, single-arg `setSessionId`, no `AppShellIPC`. Append to this baseline: add `& SessionPersistenceIPC` to the `AgentRuntimeIPC` intersection and push the 7 bare names into `ALLOWED_RENDER_INVOKE_EVENTS`. Do NOT rename to `TraceabilityInvokeIPC`, do NOT add `AppShellIPC`, do NOT change `setSessionId`'s arity. The live `shared/session-ipc.ts` already has the control `AgentSessionIPC`; append the persistence types to it.
- **Renderer uses the typed `invoke` from `useElectronIPC()`** - the current `useAgentSession`/`useAgentMessages`/`CommandPalette` wrap `invoke` in a type-bypassing `invokeSession`/`invokeSessionPersistence` cast that calls `sessions:*`. Drop those wrappers entirely; call the typed `invoke("createSession", ...)` etc. directly. (This is the "useAgentSession should uniformly use `useElectronIPC`" fix.)
- **Do NOT revert `AgentRuntime` to `tools: []`** (M2 Task 11/13 said `tools: []`; superseded by commit `36f843a`).
- **`Session` = divisor shape + `appId`; `Entry`/`Usage`/`TokenUsage` match divisor** (exact interfaces in the spec; `toSession`/`toEntry` mappers in M3 Task 16). DB file: `userData/traceability-agent.sqlite`.
- **No unit test this round:** `SessionPersistence` depends on `electron`'s `ipcMain` (via `AbstractAgentIPCHandler`) and cannot be instantiated under vitest (node), so `session-persistence.test.ts` is NOT created (mirrors `AgentPool`, which also has no unit test). Correctness is covered by `typecheck` + the TODO G smoke flow; a `SessionRepository` split + tests can be added later if needed.
- **`skill-service.ts`** has 8 pre-existing `noUncheckedIndexedAccess` errors unrelated to this work - the only allowed typecheck exception (TODO G). TODO A must add no new errors.

- [ ] **Step 1:** Run M3 Task 15 verbatim -> `app/src/main/sessions/database.ts` (`LocalDatabase`: better-sqlite3 connection + migration runner; id=1 legacy verbatim, id=2 from Task 16). Add `app/src/main/sessions/index.ts` barrel.
- [ ] **Step 2:** Run M3 Task 16 verbatim -> `app/src/main/sessions/session-schema.ts` (migration id=2 SQL + `SessionRow`/`EntryRow` + `toSession`/`toEntry`). Its imports (`Session`/`Entry`/`TokenUsage` from `../../shared/session-ipc.js`) resolve after Step 4.
- [ ] **Step 3:** Create `app/src/main/sessions/session-persistence.ts`: `SessionPersistence extends AbstractAgentIPCHandler<SessionPersistenceIPC> implements SessionPersistenceIPC`; ctor `(browserWindow)` builds `new LocalDatabase(...)` at `userData/traceability-agent.sqlite`; `protected override bind()` registers the 7 bare-name channels against the matching arrow-function methods (mirror `agent-pool.ts`'s `bind()`); `destroyAll()` closes the DB. Implement the 7 methods per the contract above. (No `session-persistence.test.ts` this round - see reconciliation note.)
- [ ] **Step 4:** Append `Session`/`Entry`/`EntryType`/`Usage`/`TokenUsage`/`SessionPersistenceIPC` to `app/src/shared/session-ipc.ts` (interfaces per M3 Task 4, but `SessionPersistenceIPC` keys use the bare names above, NOT `sessions:*`).
- [ ] **Step 5:** In `app/src/shared/events-ipc.ts`, add `& SessionPersistenceIPC` to the `AgentRuntimeIPC` intersection and push the 7 bare names into `ALLOWED_RENDER_INVOKE_EVENTS`.
- [ ] **Step 6:** In `app/src/main/index.ts`, instantiate `new SessionPersistence(browserWindow)` alongside `new AgentPool(browserWindow)`, call `.updateBrowserWindow(browserWindow)` in the `activate` handler, and `.destroyAll()` in the `quit` handler (mirroring `agentPool`).
- [ ] **Step 7:** Drop the `invokeSession`/`invokeSessionPersistence` wrappers in `src/renderer/pages/_layout/_agent/session/use-agent-session.ts`, `hooks/use-agent-messages.ts`, and `_layout/_components/CommandPalette.tsx`; replace all `sessions:*` calls with typed `invoke("<bareName>", ...)` from `useElectronIPC()` (call-site map: `sessions:getEntries`->`getSessionEntries`, `sessions:get`->`getSession`, `sessions:create`->`createSession`, `sessions:list`->`listSessions`, `sessions:rename`->`renameSession`, `sessions:appendEntries`->`appendSessionEntries`).
- [ ] **Step 8:** `pnpm --filter @traceability/app typecheck` (clean except the 8 pre-existing `skill-service.ts` errors) + `pnpm --filter @traceability/app test` (no new session-persistence tests; existing suite must still pass).
- [ ] **Step 9:** Commit: `feat(app): add main-process SQLite session persistence + sessions IPC`.

### TODO B — Mount `ExtensionsContextAPIProvider` (NEW)

> **Spec (authoritative):** `docs/superpowers/specs/2026-07-14-extensions-context-api-provider.md`.

The `ExtensionProvider` is mounted but `ExtensionsContextAPIProvider` is not — `useSharedPromptEditor()` (needed by the ported `PromptInput`) throws without it. `getActiveSessionId()` reads the live `agentStore`.

**Files:**
- Modify: `app/src/renderer/App.tsx`

**Interfaces:**
- Consumes: `agentStore` from `@renderer/store/agent` (provides `activeSessionId`), `SharedPromptEditor.create()` + `ExtensionsContextAPIProvider` from `@extensions/core/renderer`.
- Produces: a mounted context so `useExtensionsContextAPI()`/`useSharedPromptEditor()` resolve anywhere under the router.

- [ ] **Step 1:** Add the provider. The `api` needs `getActiveSessionId` (read `agentStore.getState().activeSessionId`) and a module-singleton `SharedPromptEditor`:

```tsx
import {
  ExtensionProvider,
  ExtensionsContextAPIProvider,
  SharedPromptEditor,
  type ExtensionsContextAPI,
} from "@extensions/core/renderer";
import { installedRendererExtensions } from "@extensions/builtins/index.renderer";
import { agentStore } from "@renderer/store/agent";

// Single editor holder shared across the app (the ported PromptInput wires its
// editor instance into this via onCreate/onDestroy).
const sharedPromptEditor = SharedPromptEditor.create();

const extensionsContextAPI: ExtensionsContextAPI = {
  getActiveSessionId: () => agentStore.getState().activeSessionId ?? null,
  sharedPromptEditor,
};
```

- [ ] **Step 2:** Wrap the router with both providers (ExtensionProvider stays outermost; ExtensionsContextAPIProvider inside it):

```tsx
<ExtensionProvider extensions={installedRendererExtensions}>
  <ExtensionsContextAPIProvider api={extensionsContextAPI}>
    <RouterProvider router={router} />
    <Toaster />
  </ExtensionsContextAPIProvider>
</ExtensionProvider>
```

- [ ] **Step 3:** `pnpm --filter @traceability/app typecheck` (web). Expected: clean.
- [ ] **Step 4:** Commit: `feat(app): mount ExtensionsContextAPIProvider with shared prompt editor`.

### TODO C — Port the richtext slash-commands layer (NEW prerequisite for extension UI)

> **Spec (authoritative):** `docs/superpowers/specs/2026-07-14-richtext-slash-commands.md`.

Extension slash commands (e.g. `/subagent`) need the TipTap slash-command suggestion extension + the `usePluginSlashCommands`/`getSelectedCommandIds` plumbing. This was explicitly excluded by `agent-renderer-migration.md:33,136` but is now required.

**Files (port from divisor, source paths under `/Users/evan/Desktop/coding/divisor-agent/packages/app/src/renderer/`):**
- Create: `app/src/renderer/components/richtext/types.ts` ← divisor `components/richtext/types.ts` (verbatim, 7 lines: `CommandItem`).
- Create: `app/src/renderer/components/richtext/components/icon-node.tsx` ← divisor `components/richtext/components/icon-node.tsx` (verbatim).
- Create: `app/src/renderer/components/richtext/components/suggestions-panel.tsx` ← divisor (verbatim; depends on `fuse.js` + `@renderer/lib/utils`).
- Create: `app/src/renderer/components/richtext/extensions/slash-commands.tsx` ← divisor (verbatim; imports `@renderer/hooks/use-latest`).
- Create: `app/src/renderer/components/richtext/extensions/prompt-ghost-suggestion.ts` ← divisor (verbatim; swap the hardcoded `GHOST_SUGGESTIONS` demo strings for traceability-appropriate ones or empty array).
- Create: `app/src/renderer/components/richtext/inline/skill-node.tsx` ← divisor `components/richtext/inline/skill-node.tsx` (this **replaces** the existing lean `app/src/renderer/pages/_layout/_agent/prompt-input/skill-node.ts`; the old file is deleted in TODO D after its consumers are rewritten. The two coexist during TODO C with no conflict - the new `skillNode` Mention is not loaded into any editor until TODO D).
- Create: `app/src/renderer/hooks/use-latest.ts` ← divisor `hooks/use-latest.ts` (verbatim, ~12 lines).

**New npm deps to add to `app/package.json`:** `fuse.js`, `prosemirror-state`, `prosemirror-view` (all transitive via TipTap; add as direct deps so the imports resolve cleanly). **Verified via `pnpm why`**: TipTap 3.27.3 locks `prosemirror-state@1.4.4` / `prosemirror-view@1.42.1` - use `^1.4.4`/`^1.0.0`, NOT `^2.0.0` (cross-major conflict with TipTap's internal 1.4.4 breaks `Plugin`/`PluginKey` instanceof).

**Interfaces:**
- Produces: `useSlashCommandsExtension`, `getSelectedCommandIds`, `slashCommandSuggestionPluginKey`, `SlashCommandSelection` (from `slash-commands.tsx`); `skillNode`, `insertSkillNode` (from `skill-node.tsx`); `CommandItem` (from `types.ts`).

- [ ] **Step 1:** Add deps: edit `app/package.json` deps to add `"fuse.js": "^1.6.6"`, `"prosemirror-state": "^1.4.4"`, `"prosemirror-view": "^1.0.0"` (match versions resolved under the installed TipTap 3.27.3 — run `pnpm why prosemirror-state` to confirm). `pnpm install`.
- [ ] **Step 2:** Copy the 7 files above verbatim (adjusting only the `prompt-ghost-suggestion` demo strings). Do NOT delete `app/src/renderer/pages/_layout/_agent/prompt-input/skill-node.ts` yet - its consumers are rewritten in TODO D.
- [ ] **Step 3:** Verify the `slash-commands.tsx` non-standard suggestion options (`decorationContent`, `decorationEmptyClass`) are accepted by `@tiptap/suggestion@3.27.3`; if not, strip them.
- [ ] **Step 4:** `pnpm --filter @traceability/app typecheck` (web). Expected: clean (the new files compile unused; the old `prompt-input/skill-node.ts` still satisfies its current importers `use-chat-editor.ts` + `prompt-input/index.tsx`).
- [ ] **Step 5:** Commit: `feat(app): port richtext slash-commands + skill-node from divisor`.

### TODO D - Integrate extension slash-commands into prompt-input (NEW)

> **Spec (authoritative):** `docs/superpowers/specs/2026-07-14-prompt-input-slash-commands-integration.md`.

Port divisor's `prompt-input/` (modal-selector + index) into traceability's **Base UI** stack, strip the token/voice/permission displays, and wire extension slash-commands via `use-chat-editor.ts`. Typing `/` surfaces skill + `subagent` commands; submit captures their ids.

**Files:**
- Modify: `app/src/renderer/pages/_layout/_agent/prompt-input/modal-selector.tsx` - port divisor's searchable `ModalSelector` to Base UI: self-loads models (`invoke("getAvailableModels")`) + auto-selects default (`value===null && models.length>0 -> onChange(models[0])`) + `Input` search filter + `Cpu` icon. Drop `Tooltip` (absent in traceability). Props `{value, onChange}` + export `useModalSelector` (NO `models` prop - high-cohesion).
- Modify: `app/src/renderer/pages/_layout/_agent/prompt-input/index.tsx` - port divisor's skeleton (editor + submit + keydown with `slashCommandSuggestionPluginKey` guard + `ModalSelector`); STRIP token (`ContextUsageControl`/`HoverCard`/`Progress`/`EntryTokenUsage`/`formatTokenCount`/`getCurrentContextTokens`), voice (`useVoiceInput`/`VoiceInputButton`/`toast`/`INSERT_PROMPT_TEXT_EVENT`), permission (`PermissionSelector`), `@tanstack/react-hotkeys` (`matchesKeyboardEvent` -> native). `PromptInputProps`: `initialModel` + `onModelChange` + `onCreate`/`onDestroy` (divisor style; NO `models`/`skills`).
- Modify: `app/src/renderer/pages/_layout/_agent/use-chat-editor.ts` - compose `useSlashCommandsExtension({commands:[...skillItems,...pluginItems]})` + `usePluginPromptInputExtensions()` + `usePluginSlashCommands()` + `skillNode` + `promptGhostSuggestionExtension` (divisor shape; traceability import paths + placeholder/class).
- Modify: `app/src/renderer/pages/_layout/_agent/index.tsx` - `<PromptInput>` call site: drop `models`+`skills` props; pass `initialModel={activeSession?.model ?? null}` + `onModelChange={changeModel}` + `onCreate`/`onDestroy` (mount `sharedPromptEditor`); DELETE the models-loading `useEffect` (line 47/68-85 - now inside `ModalSelector`); `useAgentSkills` only `skillsError`. external-prompt model fallback (line 165) uses `activeSession?.model` (NO `models[0]`).
- Delete: `app/src/renderer/pages/_layout/_agent/prompt-input/skill-node.ts` (lean; replaced by `@renderer/components/richtext/inline/skill-node` from TODO C).

**Reconciliation decisions (verified against divisor + traceability baseline):**
- **Primitive stack mismatch (NOT verbatim copy):** divisor `modal-selector.tsx` is Radix/shadcn; traceability `select.tsx` is `@base-ui/react/select`. Adapt: `SelectValue` accepts ReactNode children (OK); `SelectGroup` not exported by traceability's `select.tsx` - either add the export or drop `SelectGroup` (divisor uses one group, droppable); `SelectContent` has no `alignItemWithTrigger` - drop it; `SelectTrigger` `data-popup-open` - verify/adapt CSS. Drop `Tooltip` entirely (absent; non-essential - it only showed `providerName`).
- **modal-selector high-cohesion (divisor style):** models loading + default selection move INTO `ModalSelector` (out of `AgentPanel`). `AgentPanel` no longer holds `models` state. `useAvailableModels` hook (TODO F) is NOT needed.
- **sharedPromptEditor mounting -> parent (AgentPanel):** divisor's `PromptInput` exposes `onCreate`/`onDestroy`; the PARENT mounts `sharedPromptEditor.editor` via them. This REVISES the earlier "mount inside prompt-input" decision - now parent-mounted (divisor-consistent). (TODO F may later move this into a hook.)
- **Drop the Skills dropdown** (lean `prompt-input/index.tsx` has one; divisor does not). Skills selected ONLY via `/` slash-command. Delete the `<details>` block + `selectedSkillIds` + `skills` prop + `DiscoveredSkill`/`Wrench` imports.
- **keydown `slashCommandSuggestionPluginKey` guard:** before submitting on Enter, check `getState(editor.state)?.active` - if suggestion open, Enter selects a command, does NOT submit. Native `event.key` (no react-hotkeys).
- **Path/signature adaptations:** `useAgentSkills` from `../hooks/use-agent-skills`; `insertSkillNode({editor, skill, range?})` (divisor object signature, called from `use-chat-editor.ts`'s `onSelectCommand`, NOT from `prompt-input/index.tsx`); `useChatEditor` gains `getFloatingReference` (passed `() -> containerRef.current`); `UseChatEditorOptions` adds `content?`/`getFloatingReference?`.
- **Keep traceability placeholder + editorProps class** (`"Ask about this application..."` + existing `ProseMirror` class).
- **`PromptSubmission` shape unchanged** (`{content, jsonContent, model, skillIds}`); `skillIds` from `getSelectedCommandIds(editor)` at submit.

**Interfaces:**
- Consumes: `usePluginSlashCommands`/`usePluginPromptInputExtensions`/`useSharedPromptEditor` from `@extensions/core/renderer`; `useSlashCommandsExtension`/`getSelectedCommandIds`/`slashCommandSuggestionPluginKey` from TODO C; Base UI `Select`/`Input` from `@renderer/components/ui/*`.
- Produces: a prompt editor where `/` surfaces skill + `subagent` commands; submit captures their ids; a self-loading searchable model selector.

- [ ] **Step 1:** Port `modal-selector.tsx` to Base UI (divisor searchable, drop Tooltip, adapt Select API). Export `ModalSelector` + `useModalSelector`.
- [ ] **Step 2:** Rewrite `use-chat-editor.ts` to compose slash-commands + plugin extensions + skillNode (traceability paths/placeholder/class).
- [ ] **Step 3:** Port `prompt-input/index.tsx` from divisor skeleton: editor + submit (`getSelectedCommandIds`) + keydown (suggestion guard, native) + `ModalSelector`; strip token/voice/permission/react-hotkeys. `PromptInputProps` = `initialModel`/`onModelChange`/`onCreate`/`onDestroy` + existing `onSubmit`/`onSteer`/`onFollowUp`/`onStop`/`isRunning`/`disabled`.
- [ ] **Step 4:** Update `_agent/index.tsx` call site: `initialModel`/`onModelChange`/`onCreate`/`onDestroy`, drop `models`+`skills`, delete models-loading `useEffect`, external-prompt fallback -> `activeSession?.model`.
- [ ] **Step 5:** Delete `prompt-input/skill-node.ts`.
- [ ] **Step 6:** `pnpm --filter @traceability/app typecheck` (web). Expected: clean.
- [ ] **Step 7:** `pnpm dev:app`; type `/` - confirm skill + `subagent` commands; confirm model selector self-loads + searchable. Commit: `feat(app): integrate extension slash-commands into prompt editor`.
### TODO E — Render assistant blocks in messages (NEW)

> **Spec (authoritative):** `docs/superpowers/specs/2026-07-14-assistant-blocks-rendering.md`.

**Seam trace (Step 1, verified):** `subagents.list` uses **path (b)** - NOT path (a). The `subagents/run` tool returns `details: snapshot` with `snapshot.assistantBlock = {type:"subagents.list", props}` (already produced by `builtins/subagents/main/index.ts:176`); `tool_execution_*` events carry `details` -> store `toolStates` -> `assistant-tool-message` reads `toolState.details.assistantBlock` -> `useAssistantBlock(type)` renders. The original "modify `assistant-response-message.tsx` + `parseExtensionParts`" (path a) is WRONG for `subagents.list` - do NOT change `assistant-response-message.tsx`. Real scope: add `ToolExecutionState`/`toolStates` to the store, `tool_execution_*` handlers to `use-agent-messages.ts` (details carry-through, NO artifact upsert), a new slim `assistant-tool-message.tsx` (block bridge ONLY, NO tool card UI), and pass `toolStates` through `messages/index.tsx` + `assistant-message.tsx`.

So `subagents.list` (the live subagent status block) renders in the assistant message stream.

**Files:**
- Modify: `app/src/renderer/store/agent/entries-slice.ts` - add `ToolExecutionState` + `toolStates: Map<string, ToolExecutionState>` to `EntryState` + `setToolState` to `EntriesSlice` (slim: status `running`/`done`/`error` only, NO `awaiting_approval`/`requestId`/`approvalStatus` - read-only agent has no permission).
- Modify: `app/src/renderer/pages/_layout/_agent/hooks/use-agent-messages.ts` - add `tool_execution_start`/`update`/`end` handlers that `setToolState` with `details` carry-through (NO `upsertArtifactsFromToolDetails`); use `agentStore.getState()`. Optionally add the `message_update` toolCall fallback (divisor line 182-196) for defense.
- Create: `app/src/renderer/pages/_layout/_agent/messages/assistant-tool-message.tsx` - slim block bridge ONLY (from divisor `assistant-tool-message.tsx`): `getAssistantBlockDescriptor(toolState?.details)` -> `useAssistantBlock(type)` -> `<Block props raw />`; NO tool card UI (Collapsible/Input/output/Shimmer/ChevronRight/formatToolArgs).
- Modify: `app/src/renderer/pages/_layout/_agent/messages/assistant-message.tsx` - accept `toolStates` + `sessionId`; split `message.content` toolCall blocks -> `<AssistantToolMessage toolState={toolStates.get(block.id)} />`.
- Modify: `app/src/renderer/pages/_layout/_agent/messages/index.tsx` - pass `toolStates` (from `getEntryState(sessionId).toolStates`) + `sessionId` to `AssistantMessage`.

**Verify-this-seam (do not guess):** Trace how divisor delivers the `subagents.list` block to the renderer. The `subagents/run` tool returns `content: [{type:"text", text: summarizeProgress(...)}]` (plain text, no `divisor-block` fence) and `details: snapshot` where `snapshot.assistantBlock = {type:"subagents.list", props}`. Determine whether divisor (a) injects a `divisor-block` fence into the assistant text from `details.assistantBlock`, or (b) renders the block from the tool-execution `details` via the tool-message component. Check `divisor packages/app/src/renderer/pages/workspace/chat/messages/assistant-message.tsx` + `assistant-tool-message.tsx` + `use-agent-messages.ts` (the `tool_execution_*` handlers). Implement whichever path divisor uses; if (b), this TODO also requires porting the tool-execution `details` carry-through (but NOT the tool card UI — only the assistant-block bridge).

- [ ] **Step 1:** Trace the seam (above). Write down which path divisor uses.
- [ ] **Step 2:** Implement `parseExtensionParts` + `useAssistantBlock` in `assistant-response-message.tsx` (and the `details`→block bridge if path (b)).
- [ ] **Step 3:** `pnpm dev:app`; trigger `subagents/run` (ask the agent to parallelize a task); confirm the `subagents.list` status block renders and updates live.
- [ ] **Step 4:** Commit: `feat(app): render extension assistant blocks (subagents.list)`.

### TODO F - Refactor `_agent/index.tsx` to divisor's hook-extraction style

> **Spec (authoritative):** `docs/superpowers/specs/2026-07-14-agent-panel-refactor.md`.

**Not** a mechanical split into `active-session-content.tsx` - do NOT create that file. Instead, align `_agent/index.tsx` (398-line monolithic `AgentPanel`) to divisor `active-session-content.tsx`'s code style: **extract hooks, keep features highly cohesive**. The component should only consume hooks + render; chat logic moves into hooks.

**Reference:** divisor `pages/workspace/chat/active-session-content.tsx` - its `useActiveSessionChat()` hook (line 191-344) owns all chat logic (submit/steer/followUp/stop + derived entries/isRunning/streamingEntryId/toolStates/tokenUsage); the component only consumes the hook + renders. Traceability adapts this to its single-panel layout (header + context-chips + chat + composer all in `AgentPanel`) and its extra concerns (external events, models loading, context chips, session management via `useAgentSession`).

**Reconciliation (extensions now present; supersedes renderer-migration Tasks 6-8's "Delete/Remove extension" lines):**
- Task 6/7 said "Delete extension prompt-input hooks/commands; Remove extension block renderers, extension registry dependencies". **Changed:** KEEP `usePluginSlashCommands`/`usePluginPromptInputExtensions` (TODO D) and `useAssistantBlock`/`assistant-tool-message` bridge (TODO E, path b). Do NOT remove them.
- Task 7 said "Remove `AssistantToolMessage`". **Changed:** KEEP the slim `assistant-tool-message.tsx` (TODO E's path-b bridge) - read-only agent has no tool *card* UI, but `subagents.list` rides tool-execution `details`, so the block bridge stays.
- renderer-migration Tasks 6-8 were written as "create files from scratch"; traceability's renderer already exists, so this TODO is a **refactor** (extract hooks), not a creation pass. Task 8's legacy cleanup is already done (`_layout/index.tsx` uses `_agent`; legacy `AgentPanel.tsx` deleted; `rg '@shared/ipc|traceability.(agent|sessions|window)'` clean; `lib/agent-events.ts` already on new contract).

**Hook extraction (2 hooks, fine-grained):**
- `hooks/use-active-session-chat.ts` - chat logic: `send`/`submitPrompt`/`steerPrompt`/`followUpPrompt`/`stopPrompt` + `changeModel`/`clearContext` + derived `isRunning`/`streamingEntryId`/`entries`/`pendingQuestion`/`context`. Mirrors divisor's `useActiveSessionChat`. (NO `useAvailableModels` - models loading moved into `ModalSelector` in TODO D.)
- `hooks/use-agent-external-events.ts` - `traceability:agent-prompt`/`agent-context`/`agent-new-session`/`agent-session-updated`/`agent-select-session` window-event listeners (line 161-217 of current `index.tsx`). external-prompt model fallback uses `activeSession?.model` (no `models[0]` - models owned by `ModalSelector`).

- [ ] **Step 1:** Create `hooks/use-agent-external-events.ts` (external window-event listeners; model fallback via `activeSession?.model`).
- [ ] **Step 2:** Create `hooks/use-active-session-chat.ts` (chat send/submit/steer/followUp/stop + context + derived state).
- [ ] **Step 3:** Refactor `_agent/index.tsx` `AgentPanel` to consume the 2 hooks + render (header/context-chips/chat/composer); keep session management (`useAgentSession`) in the component or a hook; `sharedPromptEditor` mounted via `PromptInput`'s `onCreate`/`onDestroy` (from TODO D).
- [ ] **Step 4:** `pnpm --filter @traceability/app typecheck` (web). Expected: clean.
- [ ] **Step 5:** `pnpm dev:app` smoke (full chat flow still works). Commit per the refactor.

### TODO G — Verification

- [ ] `pnpm --filter @traceability/app typecheck` — web + node clean (the pre-existing `skill-service.ts` errors are the only allowed exceptions).
- [ ] `pnpm --filter @traceability/app test` — all pass.
- [ ] `pnpm dev:app` smoke: create session → prompt → stream → steer (Enter while running) → follow-up (⌘/Ctrl+Enter while running) → pending queue → `AskUserQuestion` HIL → rename → switch session → **restart app, confirm history reloads** (TODO A persistence round-trip) → trigger `subagents/run`, confirm `/subagent` command + live `subagents.list` block (TODOs D, E).
- [ ] `pnpm lint && pnpm format`.

---

## Verified Port-Lists (reference)

Condensed from this session's exploration. Divisor paths under `/Users/evan/Desktop/coding/divisor-agent/packages/app/src/renderer/`.

**Richtext (TODO C):** `components/richtext/{types.ts(7), components/icon-node.tsx(23), components/suggestions-panel.tsx(141), extensions/slash-commands.tsx(288), extensions/prompt-ghost-suggestion.ts(95), inline/skill-node.tsx(116)}` + `hooks/use-latest.ts(12)`. New deps: `fuse.js`, `prosemirror-state`, `prosemirror-view`. No `cmdk`/`@floating-ui` needed (suggestions-panel uses raw divs).

**Chat editor (TODO D):** divisor `pages/workspace/chat/use-chat-editor.ts` (composes `usePluginSlashCommands` + `usePluginPromptInputExtensions` + `useSlashCommandsExtension` + `promptGhostSuggestionExtension` + `skillNode`); `prompt-input/index.tsx` submit uses `getSelectedCommandIds(editor)`.

**Assistant blocks (TODO E):** `parseExtensionParts` + `useAssistantBlock` from `@extensions/core/renderer` (already inlined). Seam to trace: divisor `messages/assistant-message.tsx`, `assistant-tool-message.tsx`, `use-agent-messages.ts` `tool_execution_*` handlers.

**Sessions (TODO A):** spec `docs/superpowers/specs/2026-07-14-session-persistence.md`. M3 Task 15-16 verbatim (`database.ts` + `session-schema.ts`); Task 17-18 reshaped (NOT verbatim) per the TODO A reconciliation. Class `SessionPersistence extends AbstractAgentIPCHandler<SessionPersistenceIPC>` self-registers in `bind()`, ctor builds `LocalDatabase`; `main/index.ts` only instantiates it (mirrors `AgentPool`). Contract (descriptive bare names, NOT `sessions:*`): `createSession(appId):Session`, `listSessions(appId):Session[]`, `getSession(id):Session|null`, `getSessionEntries(id):Entry[]`, `renameSession(id,name):void`, `deleteSession(id):void`, `appendSessionEntries(id,Entry[]):void`. `Session` = divisor shape + `appId`. `Entry` matches divisor. better-sqlite3 at `userData/traceability-agent.sqlite`. Renderer drops its `invokeSession`/`invokeSessionPersistence` casts and uses typed `invoke` via `useElectronIPC()`.

**Store (NO change needed for extensions):** stays `agentStore` / `store/agent/` (4 trimmed slices). Subagents needs no store additions — the `subagents.list` block is component-rendered from message content/details, not store state. (If TODO E's seam trace requires tool `details` carry-through, that rides on the existing `entries-slice` `MessageEntry.data`, still no new slice.)

---

## Open Decisions / Risks

1. **The `subagents.list` delivery seam (TODO E) is unverified.** Must trace divisor's actual mechanism before implementing. Risk: building the wrong bridge (text-fence vs tool-details). Mitigation: TODO E Step 1.
2. **`skill-service.ts` pre-existing typecheck errors** (8, `noUncheckedIndexedAccess`). Unrelated to this work but block a fully clean `typecheck`. Decide: fix inline or track separately.
3. **`prosemirror-state`/`prosemirror-view` versions** - RESOLVED: `pnpm why` confirms TipTap 3.27.3 locks `prosemirror-state@1.4.4` / `prosemirror-view@1.42.1`. TODO C spec pins `^1.4.4`/`^1.0.0`; `^2.0.0` would cross-major conflict with TipTap's internal 1.4.4.
4. **Scope creep guard:** the existing plans' "no extensions" exclusions existed for good reasons (read-only agent, fewer deps). This session overrode them by user decision. If a future worker questions the extension code, point them at the **CRITICAL** table above and the commit message of `36f843a` — do not revert without re-confirming with the user.
5. **`ExtensionsContextAPI` is trimmed** (no artifact methods). If a later builtin needs artifacts, that requires re-expanding the context AND porting the artifact slice/panel — currently out of scope.
