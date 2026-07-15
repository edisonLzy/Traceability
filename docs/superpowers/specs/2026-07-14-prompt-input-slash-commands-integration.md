# Prompt-Input Slash-Commands 接入规格（TODO D，修订版）

**日期**：2026-07-14
**状态**：已对齐，待实现
**来源**：`docs/superpowers/plans/2026-07-14-extension-migration-handoff.md` TODO D
**依赖**：TODO B（`ExtensionsContextAPIProvider` + `sharedPromptEditor` context）、TODO C（`components/richtext/*` + `use-latest.ts`）
**修订说明**：本版替代之前的"重构 lean prompt-input"方案。改为**移植 divisor 的 `prompt-input/`（modal-selector + index）到 traceability 的 Base UI 栈，剥离 token/voice/permission 展示**，slash-commands 经 `use-chat-editor.ts` 接入。

---

## 1. 任务做什么

### 1.1 背景

TODO C 移植了 slash-command 建议层但未接入 editor。现状 `prompt-input/` 是 lean 版（`modal-selector.tsx` 受控原生 `<select>` + `index.tsx` lean + `skill-node.ts` lean + `rich-text.ts`）。divisor 的 `prompt-input/` 更完整：`modal-selector.tsx` 高内聚（自加载 models + 默认选择 + 搜索过滤）+ `index.tsx` 含 editor/submit/keydown + token/voice/permission 展示。

### 1.2 目标

**移植 divisor 的 `prompt-input/` 到 traceability 的 Base UI 栈**，只保留 modal-selector 区域功能，剥离 token/voice/permission 展示；slash-commands 经 `use-chat-editor.ts` 接入。接入后：输入 `/` 出现 skill + `subagent` 命令；submit 捕获命令 id；模型选择器自加载 + 可搜索。

**不能逐字复用** - 原语栈不匹配（divisor=Radix/shadcn，traceability=Base UI）+ traceability 缺 `tooltip.tsx`/`hover-card.tsx`/`progress.tsx`。需适配 + 剥离。

---

## 2. 变更范围

### 2.1 In scope

- 改 `app/src/renderer/pages/_layout/_agent/prompt-input/modal-selector.tsx`：移植 divisor 可搜索 `ModalSelector` 到 Base UI（剥 Tooltip），高内聚自加载 models + 默认选择。
- 改 `app/src/renderer/pages/_layout/_agent/prompt-input/index.tsx`：移植 divisor 骨架（editor + submit + keydown + ModalSelector），剥离 token/voice/permission/react-hotkeys。
- 改 `app/src/renderer/pages/_layout/_agent/use-chat-editor.ts`：组合 slash-commands + plugin extensions + skillNode（divisor 形状）。
- 改 `app/src/renderer/pages/_layout/_agent/index.tsx`：PromptInput 调用处改 `initialModel`/`onModelChange`/`onCreate`/`onDestroy`，删 `models`/`skills` prop + models-loading `useEffect`，external-prompt fallback 改 `activeSession?.model`。
- 删 `app/src/renderer/pages/_layout/_agent/prompt-input/skill-node.ts`（lean 版）。

### 2.2 Out of scope

- 不引入 `@tanstack/react-hotkeys`（原生判断）。
- 不补 `tooltip.tsx`/`hover-card.tsx`/`progress.tsx`（剥离对应功能，不补原语）。
- 不改 `PromptSubmission` 形状。
- 不改 `modal-selector.tsx`/`rich-text.ts`（rich-text 保留）。
- 不碰 TODO E/F。

---

## 3. 现状基线（已核实）

| 项 | 现状 |
|---|---|
| `modal-selector.tsx` | lean 受控原生 `<select>`，props `{disabled?, models, onChange, value}` |
| `prompt-input/index.tsx` | lean：`useChatEditor({disabled})` + `selectedSkillIds` + Skills `<details>` 下拉 + submit 用 `selectedSkillIds` |
| `use-chat-editor.ts` | lean `StarterKit + Placeholder + skillNode` |
| `_agent/index.tsx` | line 47 `models` state；line 68-85 models-loading `useEffect` + 默认 model；line 165 external-prompt `models[0]` fallback；line 316-329 `<PromptInput models={models} skills={skills} ...>` |
| `select.tsx`（ui） | **Base UI**（`@base-ui/react/select`），导出 `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue`；**不导出 `SelectGroup`**；`SelectContent` 支持 `align`/`side`/`sideOffset`（无 `alignItemWithTrigger`） |
| `SelectValue`（base-ui） | `children?: ReactNode \| ((value)=>ReactNode)` - 接受 ReactNode children（divisor 模式可用） |
| `SelectGroup`（base-ui） | 存在（`@base-ui/react/select/group`），但 traceability `select.tsx` 未导出 |
| `tooltip.tsx`/`hover-card.tsx`/`progress.tsx` | **不存在** |
| `@tanstack/react-hotkeys` | **无** |
| `apis/sessions`（EntryTokenUsage） | **无**（剥离 token，不需） |
| `@extensions/core/renderer` hooks | `usePluginSlashCommands`/`usePluginPromptInputExtensions`/`useSharedPromptEditor` 就绪 |

### 3.1 divisor 参考路径

`/Users/zhiyu/Desktop/coding/divisor-agent/packages/app/src/renderer/pages/workspace/chat/prompt-input/{modal-selector.tsx, index.tsx}` + `use-chat-editor.ts`。**仅参考逻辑/结构**，原语适配到 Base UI，剥离 token/voice/permission。

---

## 4. 数据契约

### 4.1 `ModalSelector`（移植到 Base UI）

```tsx
interface ModalSelectorProps {
  value: AvailableModel | null;
  onChange: (value: AvailableModel | null) => void;
}

export function ModalSelector({ value, onChange }: ModalSelectorProps) {
  const { invoke } = useElectronIPC();
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");

  // useEffect: invoke("getAvailableModels") -> setModels (self-load)
  // useEffect: value === null && models.length > 0 -> onChange(models[0]) (auto default)

  const filteredModels = useMemo(() => /* filter by query */, [models, query]);

  return (
    <Select open={open} onOpenChange={...} value={selectedValue} onValueChange={...}>
      <SelectTrigger ...>
        <SelectValue>{value ? <div>{value.modelName}</div> : <span>{isLoading ? "..." : "选择模型"}</span>}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end" sideOffset={8} ...>
        <Input value={query} onChange={...} placeholder="搜索模型..." />
        {/* filteredModels.map -> SelectItem（Cpu 图标 + modelName）NO Tooltip */}
      </SelectContent>
    </Select>
  );
}

export function useModalSelector(initialValue: AvailableModel | null = null): ModalSelectorProps {
  const [value, setValue] = useState(initialValue);
  const handleChange = useCallback((next) => setValue(next), []);
  return useMemo(() => ({ value, onChange: handleChange }), [handleChange, value]);
}
```

**Base UI 适配点**：
- `SelectGroup`：divisor 用了，traceability `select.tsx` 未导出 -> **去掉 `<SelectGroup>`**（divisor 只有一个 group，可直接 `filteredModels.map`），或给 `select.tsx` 加 `export const SelectGroup = SelectPrimitive.Group`。建议去掉（最小改动）。
- `SelectContent`：去掉 `alignItemWithTrigger={false}`（base-ui 无此 prop）。
- `SelectValue` children：ReactNode 形式可用（base-ui 支持）。
- `SelectTrigger` `data-popup-open:bg-accent`：base-ui 的 data 属性可能不同 -> 验证，不生效则去掉该 class 或换成 base-ui 对应属性。
- **剥 Tooltip**：divisor 的 `<Tooltip>`（显示 providerName）整段去掉，`CircleHelp` 图标 + `TooltipProvider`/`TooltipTrigger`/`TooltipContent` import 去掉。保留 `Cpu` 图标。
- 保留：`Input`（搜索）、`useElectronIPC`（自加载）、`cn`、`Cpu` from lucide、搜索过滤逻辑、默认选择逻辑。

### 4.2 `PromptInputProps`（divisor 风格）

```tsx
export interface PromptInputProps extends Pick<UseChatEditorOptions, "onCreate" | "onDestroy"> {
  disabled?: boolean;
  isRunning?: boolean;
  initialModel?: AvailableModel | null;
  onSubmit: (submission: PromptSubmission) => Promise<void> | void;
  onSteer?: (submission: PromptSubmission) => Promise<void> | void;
  onFollowUp?: (submission: PromptSubmission) => Promise<void> | void;
  onStop?: () => void;
}
```

- **去** `models`/`onModelChange` 从外部传 models 的模式 -> 改 `initialModel` + 内部 `useModalSelector(initialModel)` + `onModelChange` 回调。
  - 实际：`const modelSelectorProps = useModalSelector(initialModel);` 内部用；model 变化时调 `onModelChange`。需在 `useModalSelector` 的 `onChange` 里调外部 `onModelChange`，或包一层。
  - 简化：`PromptInput` 内 `const { value: model, onChange: handleModelChange } = useModalSelector(initialModel)`，`handleModelChange` 包一层调 `onModelChange?.(next)`。
- **去** `skills` prop（Skills 下拉删除）。
- **加** `onCreate`/`onDestroy`（父组件挂 sharedPromptEditor）。

### 4.3 `use-chat-editor.ts`（组合 slash-commands，divisor 形状）

divisor `use-chat-editor.ts` 结构（适配 traceability import 路径）：
- `useSkillsCommandItems()`：`useAgentSkills()` -> filter enabled -> map `CommandItem`（`group:"Skills"`，extra 用 scope 中文映射）。
- `usePluginSlashCommands()` + `usePluginPromptInputExtensions()` from `@extensions/core/renderer`。
- `slashCommands = [...skillItems, ...pluginItems]`。
- `handleSelectCommand({command, editor, range})`：`group==="Skills"` -> `insertSkillNode({editor, range, skill:{id,label}})`；否则 `pluginCommand.run({editor, range})`。
- `useSlashCommandsExtension({commands, getFloatingReference, onSelectCommand})`。
- `extensions = [slashCommandsExtension, promptGhostSuggestionExtension]`。
- `useEditor({ extensions: [StarterKit.configure({...}), Placeholder, ...extensions, ...pluginPromptInputExtensions, skillNode], ... })`。

**import 路径适配**：
- `usePluginPromptInputExtensions, usePluginSlashCommands` from `@extensions/core/renderer`（divisor 用 `@divisor-agent/extension-core/renderer`）。
- `promptGhostSuggestionExtension` from `@renderer/components/richtext/extensions/prompt-ghost-suggestion`（TODO C）。
- `SlashCommandSelection, useSlashCommandsExtension` from `@renderer/components/richtext/extensions/slash-commands`（TODO C）。
- `insertSkillNode, skillNode` from `@renderer/components/richtext/inline/skill-node`（TODO C，**非** `./prompt-input/skill-node`）。
- `CommandItem` from `@renderer/components/richtext/types`（TODO C）。
- `useAgentSkills` from `../hooks/use-agent-skills`（divisor 用 `@renderer/hooks/use-agent-skills`）。

**保留 traceability**：placeholder `"Ask about this application…"` + 现有 `ProseMirror` editorProps class（不用 divisor 的）。

### 4.4 `prompt-input/index.tsx`（移植 divisor 骨架，剥离）

从 divisor `prompt-input/index.tsx` 移植：
- **保留**：`useChatEditor({disabled, getFloatingReference, onCreate, onDestroy})` + submit（`getSelectedCommandIds(editor)` + `slashCommandSuggestionPluginKey` active 守卫）+ keydown（Enter/Mod+Enter，native 非 react-hotkeys，含 suggestion 守卫）+ `ModalSelector`（`useModalSelector(initialModel)`）+ `editorContainerRef`。
- **剥离**：
  - token：`ContextUsageControl`/`HoverCard`/`HoverCardContent`/`HoverCardTrigger`/`Progress`/`formatTokenCount`/`getCacheHitRate`/`getCurrentContextTokens`/`EntryTokenUsage`/`tokenUsage` prop/`MessageUsage`。
  - voice：`useVoiceInput`/`VoiceInputButton`/`toast`/`useVoiceInput`/`INSERT_PROMPT_TEXT_EVENT`/`prompt-insert-event`。
  - permission：`PermissionSelector`/`usePermissionSelector`/`permissionSelectorProps`。
  - react-hotkeys：`matchesKeyboardEvent` -> 原生 `event.key === "Enter"` / `(event.metaKey || event.ctrlKey) && event.key === "Enter"`。
- **PromptInputProps**：§4.2。
- **keydown suggestion 守卫**：
  ```ts
  const suggestionState = slashCommandSuggestionPluginKey.getState(editor.state) as { active?: boolean } | undefined;
  if (suggestionState?.active) return; // suggestion 开时 Enter 选命令，不 submit
  ```
- **submit**：`skillIds: getSelectedCommandIds(editor)`（非 `selectedSkillIds`）。

---

## 5. 变更详情

### 5.1 `modal-selector.tsx`（重写）

§4.1。从 divisor 移植可搜索 `ModalSelector` 到 Base UI，剥 Tooltip，去 SelectGroup（或加导出），去 `alignItemWithTrigger`。导出 `ModalSelector` + `useModalSelector`。

### 5.2 `use-chat-editor.ts`（重写）

§4.3。divisor 形状组合 slash-commands + plugin extensions + skillNode + promptGhostSuggestionExtension，traceability import 路径 + placeholder/class。

### 5.3 `prompt-input/index.tsx`（重写）

§4.4。divisor 骨架 + 剥离 token/voice/permission/react-hotkeys + `PromptInputProps`（§4.2）。

### 5.4 `_agent/index.tsx`（改 PromptInput 调用处）

- line 316-329 `<PromptInput>`：
  ```tsx
  <PromptInput
    disabled={!activeSessionId || !appId}
    isRunning={Boolean(isRunning)}
    initialModel={activeSession?.model ?? null}
    onModelChange={(model) => void changeModel(model)}
    onCreate={({ editor }) => { sharedPromptEditor.editor = editor; }}
    onDestroy={() => { sharedPromptEditor.editor = null; }}
    onFollowUp={followUpPrompt}
    onSteer={steerPrompt}
    onStop={() => { if (activeSessionId) void invoke("abortPrompt", activeSessionId); }}
    onSubmit={submitPrompt}
  />
  ```
- 删 `models={models}` + `skills={skills}`。
- line 47 `const [models, setModels] = ...` 删。
- line 68-85 models-loading `useEffect` + 默认 model `useEffect` 删（下沉到 ModalSelector）。
- line 48 `useAgentSkills()` -> 只取 `error: skillsError`（skills 不再用）。
- line 165 external-prompt `activeSession.model ?? models[0]` -> `activeSession?.model ?? null`（无则报 "No model configured"）。
- 加 `const sharedPromptEditor = useSharedPromptEditor();`（需 TODO B 的 context）。

### 5.5 删 `prompt-input/skill-node.ts`

确认无 import 后删（`use-chat-editor.ts` 改用 TODO C 的 `@renderer/components/richtext/inline/skill-node`，`prompt-input/index.tsx` 不再 import）。

---

## 6. 变更后文件结构

```
pages/_layout/_agent/
├── use-chat-editor.ts            # 重写(divisor 形状组合 slash-commands, traceability 路径/placeholder)
├── index.tsx                     # 改:PromptInput initialModel/onModelChange/onCreate/onDestroy; 删 models state/loading; external-prompt activeSession?.model
└── prompt-input/
    ├── index.tsx                 # 重写(divisor 骨架, 剥 token/voice/permission/react-hotkeys)
    ├── modal-selector.tsx        # 重写(divisor 可搜索 -> Base UI, 剥 Tooltip, 高内聚自加载)
    ├── rich-text.ts              # 不变
    └── (skill-node.ts 删除)
```

---

## 7. 实现步骤

1. **Step 1**：重写 `modal-selector.tsx`（§5.1）：divisor 可搜索 `ModalSelector` 移植到 Base UI，剥 Tooltip，去 SelectGroup/alignItemWithTrigger，自加载 + 默认选择。导出 `ModalSelector` + `useModalSelector`。
2. **Step 2**：重写 `use-chat-editor.ts`（§5.2）：divisor 形状组合 slash-commands + plugin extensions + skillNode，traceability import 路径 + placeholder/class。
3. **Step 3**：重写 `prompt-input/index.tsx`（§5.3）：divisor 骨架 + 剥离 + `PromptInputProps`（§4.2）+ keydown suggestion 守卫 + submit `getSelectedCommandIds`。
4. **Step 4**：改 `_agent/index.tsx`（§5.4）：PromptInput 调用处 + 删 models state/loading + external-prompt fallback + `useSharedPromptEditor`。
5. **Step 5**：删 `prompt-input/skill-node.ts`。
6. **Step 6**：`pnpm --filter @traceability/app typecheck`（web）。预期 clean。
7. **Step 7**：`pnpm dev:app`；输入 `/` 确认 skill + `subagent` 命令；确认模型选择器自加载 + 可搜索。`git commit -m "feat(app): integrate extension slash-commands into prompt editor"`。

---

## 8. 关键约束 / 决策

- **D1 移植非 verbatim**：divisor Radix/shadcn -> traceability Base UI，适配 Select API + 剥 Tooltip。
- **D2 modal-selector 高内聚**：models 加载 + 默认选择下沉到 `ModalSelector`（`AgentPanel` 不再持 models）。`useAvailableModels` hook（TODO F）不需要。
- **D3 sharedPromptEditor 父组件挂**：`PromptInput` 经 `onCreate`/`onDestroy` 暴露，`AgentPanel` 挂 `sharedPromptEditor.editor`（修订早前"内部挂"决策，divisor 一致）。
- **D4 剥 Skills 下拉**：skills 只走 `/` slash-command。
- **D5 keydown suggestion 守卫**：`slashCommandSuggestionPluginKey.getState(editor.state)?.active` 为 true 时 Enter 不 submit。
- **D6 不引入 react-hotkeys**：原生 `event.key` 判断 + D5 守卫。
- **D7 useAgentSkills 路径**：`../hooks/use-agent-skills`。
- **D8 insertSkillNode 对象签名**：`{editor, skill, range?}`（TODO C 产出），`use-chat-editor.ts` 的 `onSelectCommand` 调。
- **D9 useChatEditor 加 getFloatingReference**：`() => containerRef.current`。
- **D10 保留 traceability placeholder + editorProps class**。
- **D11 PromptSubmission 形状不变**；`skillIds` = `getSelectedCommandIds(editor)`。
- **D12 依赖 TODO B + TODO C**：sharedPromptEditor context + richtext 文件。
- **D13 ESM specifier**：renderer 侧 import 不用 `.js` 后缀。
- **D14 SelectGroup 处理**：去掉 `<SelectGroup>`（最小）或给 `select.tsx` 加导出。
- **D15 external-prompt model fallback**：`activeSession?.model`（无则报错），不用 `models[0]`。

---

## 9. 参考

- 上层 handoff：`docs/superpowers/plans/2026-07-14-extension-migration-handoff.md` TODO D。
- divisor 参考：`/Users/zhiyu/Desktop/coding/divisor-agent/packages/app/src/renderer/pages/workspace/chat/prompt-input/{modal-selector.tsx, index.tsx}` + `use-chat-editor.ts`（逻辑/结构参考，原语适配 Base UI，剥 token/voice/permission）。
- TODO C 产出：`app/src/renderer/components/richtext/{types.ts, extensions/slash-commands.tsx, extensions/prompt-ghost-suggestion.ts, inline/skill-node.tsx}` + `hooks/use-latest.ts`。
- TODO B 产出：`ExtensionsContextAPIProvider`（`sharedPromptEditor`）。
- Base UI select：`app/src/renderer/components/ui/select.tsx`（导出 Select/SelectContent/SelectItem/SelectTrigger/SelectValue，无 SelectGroup）。

---

## 10. 验收标准

1. `modal-selector.tsx`：Base UI 可搜索 `ModalSelector`，自加载 models + 默认选择 + `Input` 过滤 + `Cpu` 图标，**无 Tooltip**，props `{value, onChange}` + 导出 `useModalSelector`。
2. `prompt-input/index.tsx`：divisor 骨架（editor + submit `getSelectedCommandIds` + keydown suggestion 守卫 + ModalSelector），**无** token/voice/permission/react-hotkeys；`PromptInputProps` = `initialModel`/`onModelChange`/`onCreate`/`onDestroy` + submit/steer/followUp/stop/isRunning/disabled。
3. `use-chat-editor.ts`：组合 `useSlashCommandsExtension` + `usePluginPromptInputExtensions` + `usePluginSlashCommands` + `skillNode` + `promptGhostSuggestionExtension`，traceability import 路径 + placeholder/class。
4. `_agent/index.tsx`：`<PromptInput>` 传 `initialModel`/`onModelChange`/`onCreate`/`onDestroy`，**无** `models`/`skills` prop，**无** models state/loading `useEffect`，external-prompt 用 `activeSession?.model`，挂 `sharedPromptEditor`。
5. `prompt-input/skill-node.ts` **已删**。
6. `pnpm --filter @traceability/app typecheck`（web）clean。
7. `pnpm dev:app`：`/` 出 skill + `subagent` 命令；模型选择器自加载 + 可搜索；suggestion 活跃时 Enter 选命令、否则 submit。
8. 单个 Conventional Commit：`feat(app): integrate extension slash-commands into prompt editor`。
