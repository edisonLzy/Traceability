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

Extension slash commands (e.g. `/subagent`) need the TipTap slash-command suggestion extension + the `usePluginSlashCommands`/`getSelectedCommandIds` plumbing. This was explicitly excluded by `agent-renderer-migration.md:33,136` but is now required.

**Files (port from divisor, source paths under `/Users/evan/Desktop/coding/divisor-agent/packages/app/src/renderer/`):**
- Create: `app/src/renderer/components/richtext/types.ts` ← divisor `components/richtext/types.ts` (verbatim, 7 lines: `CommandItem`).
- Create: `app/src/renderer/components/richtext/components/icon-node.tsx` ← divisor `components/richtext/components/icon-node.tsx` (verbatim).
- Create: `app/src/renderer/components/richtext/components/suggestions-panel.tsx` ← divisor (verbatim; depends on `fuse.js` + `@renderer/lib/utils`).
- Create: `app/src/renderer/components/richtext/extensions/slash-commands.tsx` ← divisor (verbatim; imports `@renderer/hooks/use-latest`).
- Create: `app/src/renderer/components/richtext/extensions/prompt-ghost-suggestion.ts` ← divisor (verbatim; swap the hardcoded `GHOST_SUGGESTIONS` demo strings for traceability-appropriate ones or empty array).
- Create: `app/src/renderer/components/richtext/inline/skill-node.tsx` ← divisor `components/richtext/inline/skill-node.tsx` (this **replaces** the existing lean `app/src/renderer/pages/_layout/_agent/prompt-input/skill-node.ts`; the old file is deleted in TODO D after its consumers are rewritten. The two coexist during TODO C with no conflict - the new `skillNode` Mention is not loaded into any editor until TODO D).
- Create: `app/src/renderer/hooks/use-latest.ts` ← divisor `hooks/use-latest.ts` (verbatim, ~12 lines).

**New npm deps to add to `app/package.json`:** `fuse.js`, `prosemirror-state`, `prosemirror-view` (all transitive via TipTap; add as direct deps so the imports resolve cleanly).

**Interfaces:**
- Produces: `useSlashCommandsExtension`, `getSelectedCommandIds`, `slashCommandSuggestionPluginKey`, `SlashCommandSelection` (from `slash-commands.tsx`); `skillNode`, `insertSkillNode` (from `skill-node.tsx`); `CommandItem` (from `types.ts`).

- [ ] **Step 1:** Add deps: edit `app/package.json` deps to add `"fuse.js": "^1.6.6"`, `"prosemirror-state": "^2.0.0"`, `"prosemirror-view": "^1.0.0"` (match versions resolved under the installed TipTap 3.27.3 — run `pnpm why prosemirror-state` to confirm). `pnpm install`.
- [ ] **Step 2:** Copy the 7 files above verbatim (adjusting only the `prompt-ghost-suggestion` demo strings). Do NOT delete `app/src/renderer/pages/_layout/_agent/prompt-input/skill-node.ts` yet - its consumers are rewritten in TODO D.
- [ ] **Step 3:** Verify the `slash-commands.tsx` non-standard suggestion options (`decorationContent`, `decorationEmptyClass`) are accepted by `@tiptap/suggestion@3.27.3`; if not, strip them.
- [ ] **Step 4:** `pnpm --filter @traceability/app typecheck` (web). Expected: clean (the new files compile unused; the old `prompt-input/skill-node.ts` still satisfies its current importers `use-chat-editor.ts` + `prompt-input/index.tsx`).
- [ ] **Step 5:** Commit: `feat(app): port richtext slash-commands + skill-node from divisor`.

### TODO D — Integrate extension slash-commands into prompt-input (NEW)

Wire `usePluginSlashCommands()` + `usePluginPromptInputExtensions()` into the chat editor so `/subagent` appears and extension TipTap extensions load. The current `_agent/use-chat-editor.ts` is a lean `StarterKit + Placeholder + skillNode` editor; bring it toward divisor's `use-chat-editor.ts` shape (which composes slash-commands + plugin extensions).

**Files:**
- Modify: `app/src/renderer/pages/_layout/_agent/use-chat-editor.ts` — replace the lean editor with one that composes `useSlashCommandsExtension({commands: [...skillItems, ...pluginItems], ...})` + `usePluginPromptInputExtensions()` + `usePluginSlashCommands()`, mirroring divisor's `pages/workspace/chat/use-chat-editor.ts`.
- Modify: `app/src/renderer/pages/_layout/_agent/prompt-input/index.tsx` — submit builder must call `getSelectedCommandIds(editor)` (not the old `getSkillNodeIds`) to capture slash-command selections including plugin commands.

**Reference:** divisor `pages/workspace/chat/use-chat-editor.ts` (read it; its `useSkillsCommandItems` calls `useAgentSkills` — traceability already has `_agent/hooks/use-agent-skills.ts`, reuse it).

**Interfaces:**
- Consumes: `usePluginSlashCommands`, `usePluginPromptInputExtensions`, `useSharedPromptEditor` from `@extensions/core/renderer`; `useSlashCommandsExtension`, `getSelectedCommandIds` from TODO C.
- Produces: a prompt editor where typing `/` surfaces skill commands + the `subagent` extension command; submit captures their ids.

- [ ] **Step 1:** Read divisor `packages/app/src/renderer/pages/workspace/chat/use-chat-editor.ts` and `prompt-input/index.tsx` for the exact composition.
- [ ] **Step 2:** Rewrite `_agent/use-chat-editor.ts` to compose slash-commands + plugin extensions + skillNode (keep traceability's editor class/placeholder copy).
- [ ] **Step 3:** Update `_agent/prompt-input/index.tsx` submit to use `getSelectedCommandIds(editor)` (replacing `getSkillNodeIds`).
- [ ] **Step 4:** Now that both consumers no longer import it, delete `app/src/renderer/pages/_layout/_agent/prompt-input/skill-node.ts`.
- [ ] **Step 5:** `pnpm --filter @traceability/app typecheck` (web). Expected: clean.
- [ ] **Step 6:** `pnpm dev:app`; type `/` in the prompt — confirm the `subagent` command appears. Commit: `feat(app): integrate extension slash-commands into prompt editor`.

### TODO E — Render assistant blocks in messages (NEW)

So `subagents.list` (the live subagent status block) renders in the assistant message stream.

**Files:**
- Modify: `app/src/renderer/pages/_layout/_agent/messages/assistant-response-message.tsx` — split rendered text with `parseExtensionParts(content)` from `@extensions/core/renderer`; for `kind === "block"` parts, look up the renderer via `useAssistantBlock(part.payload.type)` and render `<BlockRender props={part.payload.props} raw={part.payload.raw} />`; render `kind === "text"` parts with `Streamdown` as today.

**Verify-this-seam (do not guess):** Trace how divisor delivers the `subagents.list` block to the renderer. The `subagents/run` tool returns `content: [{type:"text", text: summarizeProgress(...)}]` (plain text, no `divisor-block` fence) and `details: snapshot` where `snapshot.assistantBlock = {type:"subagents.list", props}`. Determine whether divisor (a) injects a `divisor-block` fence into the assistant text from `details.assistantBlock`, or (b) renders the block from the tool-execution `details` via the tool-message component. Check `divisor packages/app/src/renderer/pages/workspace/chat/messages/assistant-message.tsx` + `assistant-tool-message.tsx` + `use-agent-messages.ts` (the `tool_execution_*` handlers). Implement whichever path divisor uses; if (b), this TODO also requires porting the tool-execution `details` carry-through (but NOT the tool card UI — only the assistant-block bridge).

- [ ] **Step 1:** Trace the seam (above). Write down which path divisor uses.
- [ ] **Step 2:** Implement `parseExtensionParts` + `useAssistantBlock` in `assistant-response-message.tsx` (and the `details`→block bridge if path (b)).
- [ ] **Step 3:** `pnpm dev:app`; trigger `subagents/run` (ask the agent to parallelize a task); confirm the `subagents.list` status block renders and updates live.
- [ ] **Step 4:** Commit: `feat(app): render extension assistant blocks (subagents.list)`.

### TODO F — Finish the `active-session-content` split (execute existing plan, reconciled)

**Execute:** `docs/superpowers/plans/2026-07-13-agent-renderer-migration.md` **Tasks 6–8** (prompt surface, message rendering, integration + remove legacy). The current `_agent/index.tsx` is the monolithic `AgentPanel` to be split.

**Reconciliation edits to that plan (because extensions are now present):**
- Task 6 said "Delete extension prompt-input hooks, extension commands". **Changed:** instead integrate them per TODO D. Keep `usePluginSlashCommands`/`usePluginPromptInputExtensions`.
- Task 7 said "Remove … extension block renderers, … extension registry dependencies". **Changed:** instead add assistant-block rendering per TODO E. Keep `useAssistantBlock`/`parseExtensionParts`.
- Task 7 said "Remove `AssistantToolMessage`". **Keep this** (read-only agent has no tool cards) — UNLESS TODO E's seam trace shows the `subagents.list` block rides on tool `details`, in which case a minimal tool-details-to-block bridge is needed (no tool *card* UI).

- [ ] **Step 1:** Run renderer-migration Task 6 (prompt surface) with the TODO D integration.
- [ ] **Step 2:** Run Task 7 (message rendering) with the TODO E integration.
- [ ] **Step 3:** Run Task 8 (split `active-session-content.tsx` out of `index.tsx`; keep the traceability header/context-chips/session-switcher shell in `index.tsx`; remove the broken legacy renderer pieces).
- [ ] **Step 4:** Commit per the plan's task commits.

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
3. **`prosemirror-state`/`prosemirror-view` versions** must resolve under TipTap 3.27.3 (traceability pins higher than divisor's 3.22.5). Verify with `pnpm why` before assuming.
4. **Scope creep guard:** the existing plans' "no extensions" exclusions existed for good reasons (read-only agent, fewer deps). This session overrode them by user decision. If a future worker questions the extension code, point them at the **CRITICAL** table above and the commit message of `36f843a` — do not revert without re-confirming with the user.
5. **`ExtensionsContextAPI` is trimmed** (no artifact methods). If a later builtin needs artifacts, that requires re-expanding the context AND porting the artifact slice/panel — currently out of scope.
