# Prompt-Input Slash-Commands 接入规格（TODO D）

**日期**：2026-07-14
**状态**：已对齐，待实现
**来源**：`docs/superpowers/plans/2026-07-14-extension-migration-handoff.md` TODO D
**依赖**：TODO B（`ExtensionsContextAPIProvider` + `sharedPromptEditor` context）、TODO C（`components/richtext/*` + `use-latest.ts`）
**目标**：为本 spec 的实现者提供自洽、可执行的契约。

---

## 1. 任务做什么

### 1.1 背景

TODO C 移植了 slash-command 建议层（`useSlashCommandsExtension`/`getSelectedCommandIds`/`skillNode`/`promptGhostSuggestionExtension`），但**未接入**任何 editor。现状 `use-chat-editor.ts` 是 lean 版（`StarterKit + Placeholder + skillNode`），`prompt-input/index.tsx` 用 lean `getSkillNodeIds` + 一个 Skills 下拉菜单选 skill。extension slash-commands（`/subagent`）无法出现。

### 1.2 目标

把 extension slash-commands + skill slash-commands 接入 prompt editor：
- 重写 `use-chat-editor.ts` 为 divisor 形状（组合 `useSlashCommandsExtension` + `usePluginPromptInputExtensions` + `usePluginSlashCommands` + `skillNode` + `promptGhostSuggestionExtension`）；
- `prompt-input/index.tsx` submit 改用 `getSelectedCommandIds(editor)`，keydown 加 suggestion-active 检查，挂 `sharedPromptEditor`，**删 Skills 下拉**（纯 divisor 模式）；
- 删 lean `prompt-input/skill-node.ts`；
- `_agent/index.tsx` 调用处去 `skills` prop。

接入后：输入 `/` 出现 skill 命令 + `subagent` extension 命令；Enter 在 suggestion 面板活跃时选命令、否则 submit；submit 捕获所有选中命令的 id。

---

## 2. 变更范围

### 2.1 In scope

- 改 `app/src/renderer/pages/_layout/_agent/use-chat-editor.ts`（重写为 divisor 形状）。
- 改 `app/src/renderer/pages/_layout/_agent/prompt-input/index.tsx`（submit + keydown + sharedPromptEditor + 删下拉）。
- 改 `app/src/renderer/pages/_layout/_agent/index.tsx`（PromptInput 调用处去 `skills` prop）。
- 删 `app/src/renderer/pages/_layout/_agent/prompt-input/skill-node.ts`。

### 2.2 Out of scope

- 不引入 `@tanstack/react-hotkeys`（保持原生 key 判断）。
- 不改 `PromptSubmission` 形状（`{content, jsonContent, model, skillIds}`）。
- 不改 `PromptInput` 的其它 props（`model`/`models`/`onModelChange`/`onSubmit`/`onSteer`/`onFollowUp`/`onStop`/`isRunning`/`disabled` 保留），只删 `skills`。
- 不碰 TODO E（assistant-blocks）/ TODO F（active-session-content 拆分）。
- 不改 `modal-selector.tsx`/`rich-text.ts`。

---

## 3. 现状基线（已核实）

| 项 | 现状 |
|---|---|
| `use-chat-editor.ts` | lean: `StarterKit + Placeholder + skillNode`；`UseChatEditorOptions = {disabled?, onCreate?, onDestroy?}`；placeholder `"Ask about this application…"`；import `skillNode` from `./prompt-input/skill-node` |
| `prompt-input/index.tsx` | lean: `useChatEditor({disabled})`；维护 `selectedSkillIds` state；Skills `<details>` 下拉（点击 `insertSkillNode(editor, {id,label,scope})` + `setSelectedSkillIds(getSkillNodeIds(editor.getJSON()))`）；submit 用 `selectedSkillIds`；import `getSkillNodeIds, insertSkillNode` from `./skill-node`，`DiscoveredSkill` from `@shared/skills-ipc`，`Wrench` from lucide |
| `prompt-input/skill-node.ts` | lean 版：`insertSkillNode(editor, skill, range?)`（位置参数）、`getSkillNodeIds(content)`、`skillNode`（纯 `renderHTML`，无 NodeView） |
| `_agent/index.tsx` | line 48 `const { error: skillsError, skills } = useAgentSkills()`；line 316-329 `<PromptInput ... skills={skills} />`；line 332-334 显示 `skillsError` |
| `useAgentSkills` | `_agent/hooks/use-agent-skills.ts`，返回 `{ skills: DiscoveredSkill[], error, refresh, setEnabled }` |
| `DiscoveredSkill`/`SkillScope` | `@shared/skills-ipc`：`scope: "system"|"user"|"project"`（与 divisor 完全一致） |
| `PromptSubmission` | `{ content, jsonContent, model, skillIds }`（与 divisor 一致） |
| `@extensions/core/renderer` hooks | `usePluginSlashCommands()`/`usePluginPromptInputExtensions()`/`useSharedPromptEditor()` 已就绪（`hooks.ts`） |
| `@tanstack/react-hotkeys` | **无**（divisor 用 `matchesKeyboardEvent`，traceability 不引入） |

### 3.1 divisor 参考路径（纠正 handoff）

divisor 源在 `/Users/zhiyu/Desktop/coding/divisor-agent/packages/app/src/renderer/pages/workspace/chat/`（`use-chat-editor.ts` + `prompt-input/index.tsx`）。**注意**：divisor `prompt-input/index.tsx` 含 token-usage/voice/permission-selector 等 traceability 没有的功能 - **不照抄整体**，只参考 `use-chat-editor.ts` 的组合结构 + `prompt-input/index.tsx` 的 submit/keydown 逻辑。

### 3.2 divisor `use-chat-editor.ts` 关键结构（参考，非 verbatim）

- `useSkillsCommandItems()`：`useAgentSkills()` -> filter `enabled` -> map `CommandItem`（`group: "Skills"`，`extra`: `scope==="user"?"个人":scope==="project"?"项目":"系统"`）。
- `usePluginSlashCommands()` + `usePluginPromptInputExtensions()` from extension renderer。
- `slashCommands = [...skillItems, ...pluginItems]`（pluginItems 从 pluginCommands map 成 CommandItem）。
- `handleSelectCommand({command, editor, range})`：`group==="Skills"` -> `insertSkillNode({editor, range, skill:{id,label}})`；否则找 pluginCommand -> `pluginCommand.run({editor, range})`。
- `useSlashCommandsExtension({commands, getFloatingReference, onSelectCommand})`。
- `extensions = [slashCommandsExtension, promptGhostSuggestionExtension]`。
- `useEditor({ extensions: [StarterKit.configure({...}), Placeholder, ...extensions, ...pluginPromptInputExtensions, skillNode], ... })`。

---

## 4. 变更详情

### 4.1 重写 `use-chat-editor.ts`

按 divisor 结构（§3.2），但适配 traceability：

- **import 路径**：
  - `usePluginPromptInputExtensions, usePluginSlashCommands` from `@extensions/core/renderer`（divisor 用 `@divisor-agent/extension-core/renderer`，改）。
  - `promptGhostSuggestionExtension` from `@renderer/components/richtext/extensions/prompt-ghost-suggestion`。
  - `SlashCommandSelection, useSlashCommandsExtension` from `@renderer/components/richtext/extensions/slash-commands`。
  - `insertSkillNode, skillNode` from `@renderer/components/richtext/inline/skill-node`（TODO C 产出，**不是** `./prompt-input/skill-node`）。
  - `CommandItem` from `@renderer/components/richtext/types`。
  - `useAgentSkills` from `../hooks/use-agent-skills`（divisor 用 `@renderer/hooks/use-agent-skills`，改相对路径）。
  - `EditorOptions, JSONContent` from `@tiptap/core`；`Placeholder`/`useEditor`/`StarterKit` 同 lean。
- **`UseChatEditorOptions`**：`{ content?: JSONContent; disabled: boolean; onCreate?: EditorOptions["onCreate"]; onDestroy?: EditorOptions["onDestroy"]; getFloatingReference?: () => Element | VirtualElement | null }`（加 `content`/`getFloatingReference`，divisor 形状）。
- **`useChatEditor` body**：divisor 结构（§3.2）。
- **保留 traceability 风格**：placeholder `"Ask about this application…"`（不用 divisor 的 `"Ask anything..."`）；`editorProps.attributes.class` 用 traceability 现有的 `"ProseMirror min-h-[46px] max-h-[132px] ..."`（不用 divisor 的 class）。
- **`useSkillsCommandItems()`**：divisor 形状（`useAgentSkills()` -> filter enabled -> map CommandItem，extra 用 scope 中文映射）。

### 4.2 改 `prompt-input/index.tsx`

- **删 import**：`getSkillNodeIds, insertSkillNode` from `./skill-node`；`DiscoveredSkill` from `@shared/skills-ipc`；`Wrench` from lucide（下拉用的）。
- **加 import**：`getSelectedCommandIds, slashCommandSuggestionPluginKey` from `@renderer/components/richtext/extensions/slash-commands`；`useSharedPromptEditor` from `@extensions/core/renderer`。
- **`PromptInputProps`**：删 `skills: DiscoveredSkill[]`。
- **删** `selectedSkillIds` state。
- **`useChatEditor` 调用**：加 `getFloatingReference: () => containerRef.current`；加 `onCreate`/`onDestroy` 挂 `sharedPromptEditor`（见 §4.3）。
- **submit**：`skillIds: getSelectedCommandIds(editor)`（替代 `selectedSkillIds`）；删 `setSelectedSkillIds([])`。
- **keydown handler**：在判断 Enter 前，加 `const suggestionState = slashCommandSuggestionPluginKey.getState(editor.state) as {active?: boolean} | undefined; if (suggestionState?.active) return;`（suggestion 面板活跃时 Enter 不 submit，让 slash-command 处理）。保持原生 `event.key === "Enter"` 判断（不引入 react-hotkeys）。
- **删 Skills `<details>` 下拉块**（lean 版 line 104-143 那段）。

### 4.3 `sharedPromptEditor` 挂载（prompt-input 内部）

```tsx
const sharedPromptEditor = useSharedPromptEditor();
const { editor, hasContent } = useChatEditor({
  disabled,
  getFloatingReference: () => containerRef.current,
  onCreate: ({ editor: nextEditor }) => {
    sharedPromptEditor.editor = nextEditor;
  },
  onDestroy: () => {
    sharedPromptEditor.editor = null;
  },
});
```

> 若 `useChatEditor` 已有自己的 `onCreate`/`onDestroy` 逻辑（如 setHasContent），在 `use-chat-editor.ts` 内部合并：`onCreate` 调用 `onCreateFromUser?.({editor})` + 内部 setHasContent；`onDestroy` 调 `onDestroyFromUser?.()`。即 prompt-input 传入的 onCreate/onDestroy 仅负责 sharedPromptEditor 挂载，use-chat-editor 内部再调它们。

### 4.4 改 `_agent/index.tsx`

- line 328：删 `skills={skills}`。
- line 48：`const { error: skillsError, skills } = useAgentSkills()` -> `const { error: skillsError } = useAgentSkills()`（`skills` 不再用；`skillsError` 保留用于 line 332-334 错误显示）。若决定连错误显示一起去掉，则删整个 `useAgentSkills()` 调用 + `skillsError` 引用 - 但本 spec 默认保留错误显示（最小改动）。

### 4.5 删 `prompt-input/skill-node.ts`

确认无 import 后删（`use-chat-editor.ts` 改用 `@renderer/components/richtext/inline/skill-node`，`prompt-input/index.tsx` 不再 import）。

---

## 5. 变更后文件结构

```
app/src/renderer/pages/_layout/_agent/
├── use-chat-editor.ts            # 重写(divisor 形状, import 适配, 保留 traceability placeholder/class)
├── index.tsx                     # 改:<PromptInput> 去 skills prop; useAgentSkills 只取 skillsError
└── prompt-input/
    ├── index.tsx                 # 改:submit getSelectedCommandIds + keydown suggestion 检查 + sharedPromptEditor 挂载 + 删 Skills 下拉
    ├── modal-selector.tsx        # 不变
    └── rich-text.ts              # 不变
    (skill-node.ts 删除)
```

---

## 6. 实现步骤

1. **Step 1**：读 divisor `pages/workspace/chat/use-chat-editor.ts`（参考组合结构，**不**照抄 import 路径/placeholder/class）。
2. **Step 2**：重写 `_agent/use-chat-editor.ts`（§4.1）：divisor 形状 + traceability import 路径 + 保留 traceability placeholder/class。
3. **Step 3**：改 `_agent/prompt-input/index.tsx`（§4.2）：删下拉/selectedSkillIds/skills prop/lean import；加 getSelectedCommandIds/slashCommandSuggestionPluginKey/useSharedPromptEditor；submit + keydown + sharedPromptEditor 挂载（§4.3）。
4. **Step 4**：改 `_agent/index.tsx`（§4.4）：删 `skills={skills}`，`useAgentSkills` 只取 `skillsError`。
5. **Step 5**：删 `_agent/prompt-input/skill-node.ts`。
6. **Step 6**：`pnpm --filter @traceability/app typecheck`（web）。预期 clean。
7. **Step 7**：`pnpm dev:app`；输入 `/` 确认出现 skill 命令 + `subagent` 命令；Enter 在 suggestion 活跃时选命令、否则 submit。`git commit -m "feat(app): integrate extension slash-commands into prompt editor"`。

---

## 7. 关键约束 / 决策

- **D1 去掉 Skills 下拉**（纯 divisor）：skills 只通过 `/` slash-command 选。删下拉/state/prop/import。
- **D2 sharedPromptEditor 在 prompt-input 内部挂**（onCreate/onDestroy），不碰 `_agent/index.tsx` 的编辑器生命周期、不依赖 TODO F。
- **D3 useAgentSkills 路径**：`../hooks/use-agent-skills`（非 divisor 的 `@renderer/hooks/use-agent-skills`）。
- **D4 insertSkillNode 对象签名**：`insertSkillNode({editor, skill, range?})`（divisor 版，TODO C 产出）。`prompt-input/index.tsx` 不再直接调；`use-chat-editor.ts` 的 `onSelectCommand` 调。
- **D5 useChatEditor 加 getFloatingReference**：slash-commands suggestion 面板定位需要；prompt-input 传 `() => containerRef.current`。
- **D6 keydown 加 suggestion-active 检查**：`slashCommandSuggestionPluginKey.getState(editor.state)?.active` 为 true 时 Enter 不 submit（让 slash-command 选命令）。
- **D7 不引入 @tanstack/react-hotkeys**：保持原生 `event.key` 判断 + 加 D6 守卫。
- **D8 保留 traceability placeholder + editorProps class**（`"Ask about this application…"` + 现有 ProseMirror class）。
- **D9 PromptSubmission 形状不变**；`skillIds` 改由 `getSelectedCommandIds(editor)` 在 submit 时算。
- **D10 依赖 TODO B + TODO C**：sharedPromptEditor context（TODO B）+ richtext 文件（TODO C）必须先就绪。
- **D11 ESM specifier**：renderer 侧 import 不用 `.js` 后缀。

---

## 8. 参考

- 上层 handoff：`docs/superpowers/plans/2026-07-14-extension-migration-handoff.md` TODO D。
- divisor 参考：`/Users/zhiyu/Desktop/coding/divisor-agent/packages/app/src/renderer/pages/workspace/chat/use-chat-editor.ts` + `prompt-input/index.tsx`（仅参考结构/逻辑，不照抄 import 路径/placeholder/class/多余功能）。
- TODO C 产出：`app/src/renderer/components/richtext/{types.ts, extensions/slash-commands.tsx, extensions/prompt-ghost-suggestion.ts, inline/skill-node.tsx}` + `hooks/use-latest.ts`。
- TODO B 产出：`ExtensionsContextAPIProvider`（`sharedPromptEditor`）。
- 现状：`use-chat-editor.ts`、`prompt-input/index.tsx`、`prompt-input/skill-node.ts`、`_agent/index.tsx`、`_agent/hooks/use-agent-skills.ts`。

---

## 9. 验收标准

1. `use-chat-editor.ts` 组合 `useSlashCommandsExtension` + `usePluginPromptInputExtensions` + `usePluginSlashCommands` + `skillNode` + `promptGhostSuggestionExtension`；import 路径适配 traceability；保留 traceability placeholder/class。
2. `prompt-input/index.tsx`：submit 用 `getSelectedCommandIds(editor)`；keydown 有 `slashCommandSuggestionPluginKey` active 检查；`sharedPromptEditor.editor` 在 onCreate/onDestroy 挂载/清空；**无** Skills 下拉、**无** `selectedSkillIds`、**无** `skills` prop、**无** lean `skill-node` import。
3. `_agent/index.tsx`：`<PromptInput>` 不传 `skills`；`useAgentSkills` 只取 `skillsError`（或整体删除）。
4. `prompt-input/skill-node.ts` **已删**。
5. `pnpm --filter @traceability/app typecheck`（web）clean。
6. `pnpm dev:app`：输入 `/` 出现 skill + `subagent` 命令；suggestion 活跃时 Enter 选命令、否则 submit；submit 的 `skillIds` 含选中命令。
7. 单个 Conventional Commit：`feat(app): integrate extension slash-commands into prompt editor`。
