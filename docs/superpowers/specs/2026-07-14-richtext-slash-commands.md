# Richtext Slash-Commands 层移植规格（TODO C）

**日期**：2026-07-14
**状态**：已对齐，待实现
**来源**：`docs/superpowers/plans/2026-07-14-extension-migration-handoff.md` TODO C
**目标**：为本 spec 的实现者提供自洽、可执行的契约。

---

## 1. 任务做什么

### 1.1 背景

Traceability 的 prompt editor（`app/src/renderer/pages/_layout/_agent/use-chat-editor.ts`）当前是 lean 版：`StarterKit + Placeholder + skillNode`，没有 slash-command 建议机制。TODO D 要把 extension slash-commands（如 `/subagent`）接入 editor，但那需要一整套 TipTap slash-command suggestion 扩展 + `usePluginSlashCommands`/`getSelectedCommandIds` 的前置文件，divisor 有而 traceability 没有。

### 1.2 目标

从 divisor 移植 TipTap slash-command 建议层 + `useLatest` hook 到 traceability，为 TODO D 铺路。

**本 TODO 只移植文件 + 加依赖，不接入任何 editor**（接入在 TODO D）。新文件编译为 unused，不与现有代码冲突。

---

## 2. 变更范围

### 2.1 In scope

- 新建 7 文件（6 个 `app/src/renderer/components/richtext/*` + `app/src/renderer/hooks/use-latest.ts`），divisor verbatim（仅 `prompt-ghost-suggestion.ts` 的 `GHOST_SUGGESTIONS` demo strings 调整）。
- `app/package.json` 加 3 个直接依赖：`fuse.js`、`prosemirror-state`、`prosemirror-view`。

### 2.2 Out of scope

- **不接入** 任何 editor：不改 `use-chat-editor.ts`、不改 `prompt-input/index.tsx`（TODO D 才改）。
- **不删** 现状 `app/src/renderer/pages/_layout/_agent/prompt-input/skill-node.ts`（lean 版；TODO D 才删）。新建的 `components/richtext/inline/skill-node.tsx` 与之**共存**，本 TODO 不把新 `skillNode` Mention 载入任何 editor，无冲突。
- 不加 `@tiptap/extension-mention`（现状已有 `3.27.3`）。
- 不加 `cmdk`/`@floating-ui`（suggestions-panel 用原生 div，不需要）。
- 不碰 TODO D/E（接入 / assistant-blocks）。

---

## 3. 现状基线（commit `36f843a` 之后，已核实）

| 项 | 状态 |
|---|---|
| `app/src/renderer/components/richtext/` | **不存在**（新建） |
| `app/src/renderer/hooks/use-latest.ts` | **不存在**（新建） |
| `app/src/renderer/hooks/` | 存在（`use-apps.ts`/`use-issue.ts`/`use-issues.ts`） |
| `app/src/renderer/lib/utils.ts` | 存在（divisor 文件 import `@renderer/lib/utils` 的 `cn`，可解析） |
| `fuse.js` 直接依赖 | **无**（新增） |
| `prosemirror-state` 直接依赖 | **无**（新增；TipTap 3.27.3 传递依赖 `1.4.4`） |
| `prosemirror-view` 直接依赖 | **无**（新增；TipTap 3.27.3 传递依赖 `1.42.1`） |
| `@tiptap/extension-mention` | **已有** `3.27.3`（lean `skill-node.ts` 在用，不加） |
| `@tiptap/suggestion` | 已有 `3.27.3` |
| `@tiptap/core` / `@tiptap/react` / `@tiptap/starter-kit` / `@tiptap/extension-placeholder` | 已有 |
| `lucide-react` | 已有（divisor `suggestions-panel.tsx` 用 `BoxIcon`、`skill-node.tsx` 用 `Wrench`） |
| `use-chat-editor.ts` | lean 版 `StarterKit + Placeholder + skillNode`（不改） |
| `prompt-input/skill-node.ts` | lean 版 `skillNode`/`insertSkillNode`/`getSkillNodeIds`（不改、不删） |

divisor 7 文件的 import 路径（`@renderer/lib/utils`、`@renderer/hooks/use-latest`、`@renderer/components/richtext/types`、`@shared/skills-ipc`、`@tiptap/*`、`lucide-react`、`prosemirror-state`、`prosemirror-view`）在现状 app 全可解析 - **verbatim 可行**。

### 3.1 divisor 源路径（纠正 handoff）

handoff 写 `/Users/evan/Desktop/coding/divisor-agent/...`，**实际路径是** `/Users/zhiyu/Desktop/coding/divisor-agent/packages/app/src/renderer/`。实现者用后者。

---

## 4. 数据契约 / 接口

### 4.1 7 文件 + 导出

| 新建文件 | divisor 源 | 行数 | 导出 | 复制方式 |
|---|---|---|---|---|
| `components/richtext/types.ts` | `components/richtext/types.ts` | 7 | `CommandItem` (interface) | verbatim |
| `components/richtext/components/icon-node.tsx` | 同 | 23 | `IconNode` (component) | verbatim |
| `components/richtext/components/suggestions-panel.tsx` | 同 | 141 | SuggestionsPanel component | verbatim |
| `components/richtext/extensions/slash-commands.tsx` | 同 | 288 | `slashCommandSuggestionPluginKey`, `SlashCommandSelection`, `useSlashCommandsExtension`, `getSelectedCommandIds` | verbatim |
| `components/richtext/extensions/prompt-ghost-suggestion.ts` | 同 | 95 | `promptGhostSuggestionExtension` | verbatim 但换 `GHOST_SUGGESTIONS` |
| `components/richtext/inline/skill-node.tsx` | 同 | 116 | `insertSkillNode`, `skillNode` | verbatim |
| `hooks/use-latest.ts` | `hooks/use-latest.ts` | 12 | `useLatest<T>` | verbatim |

### 4.2 `CommandItem` 形状（`types.ts`）

```ts
export interface CommandItem {
  id: string;
  group: string;
  name: string;
  description: string;
  extra?: string;
}
```

### 4.3 `slash-commands.tsx` 关键内部（风险点）

`useSlashCommandsExtension` 配置 Mention suggestion 时用了**非标准** options（line 55-56）：

```ts
pluginKey: slashCommandSuggestionPluginKey,
decorationContent: "search slash commands",
decorationEmptyClass: "is-empty",
```

`@tiptap/suggestion@3.27.3` 不一定接受 `decorationContent`/`decorationEmptyClass`。实现者必须验证：若 typecheck 报错或不生效，**剥离**这两个 option（不影响 slash-command 核心功能，仅影响空状态装饰）。

### 4.4 `prompt-ghost-suggestion.ts` 的 `GHOST_SUGGESTIONS`

divisor 用一组 demo 字符串（`const GHOST_SUGGESTIONS = [...]`，line 5）。traceability 版**换成空数组 `[]`**（最简，避免不相关的 demo 文案；ghost-suggestion 功能在 TODO D 接入前不生效）。即：

```ts
const GHOST_SUGGESTIONS: string[] = [];
```

（保留 `promptGhostSuggestionExtension` 导出与逻辑不变；空数组时 `find` 返回 undefined，不渲染 ghost。）

---

## 5. 变更详情

### 5.1 新建文件（7 个，见 §4.1）

逐字复制 divisor 对应文件（源路径见 §3.1），仅 `prompt-ghost-suggestion.ts` 的 `GHOST_SUGGESTIONS` 换成空数组（§4.4）。复制时保持 divisor 的 import 路径不变（`@renderer/*`、`@shared/*`、`@tiptap/*` 等已在 app 解析）。

### 5.2 修改 `app/package.json`

`dependencies` 加 3 项（保持字母序）：

```json
"fuse.js": "^7.4.1",
"prosemirror-state": "^1.4.4",
"prosemirror-view": "^1.0.0",
```

> **版本纠正**：`prosemirror-state` 用 `^1.4.4`（**不是** `^2.0.0`）。`pnpm why prosemirror-state` 确认 TipTap 3.27.3 锁定 `1.4.4`；装 `^2.0.0` 会与 TipTap 内部的 1.4.4 跨主版本冲突，`Plugin`/`PluginKey` 的 `instanceof` 失效。`prosemirror-view` `^1.0.0` 会 dedup 到 `1.42.1`，OK。

`pnpm install` 后 3 个依赖作为直接 dep 可 import，且与 TipTap 传递依赖同版本（无冲突）。

---

## 6. 变更后文件结构

```
app/src/renderer/
├── components/
│   └── richtext/                           # 新增目录
│       ├── types.ts                        # CommandItem (verbatim, 7 行)
│       ├── components/
│       │   ├── icon-node.tsx               # verbatim, 23 行
│       │   └── suggestions-panel.tsx       # verbatim, 141 行 (fuse.js + @renderer/lib/utils)
│       ├── extensions/
│       │   ├── slash-commands.tsx          # verbatim, 288 行 (@tiptap/suggestion + prosemirror-state)
│       │   └── prompt-ghost-suggestion.ts  # verbatim 但 GHOST_SUGGESTIONS=[], 95 行
│       └── inline/
│           └── skill-node.tsx              # verbatim, 116 行 (与 lean prompt-input/skill-node.ts 共存, 不接入)
└── hooks/
    ├── use-apps.ts                         # 既有
    ├── use-issue.ts                        # 既有
    ├── use-issues.ts                       # 既有
    └── use-latest.ts                       # 新增 (verbatim, 12 行)

app/package.json                            # 改: +fuse.js +prosemirror-state +prosemirror-view
```

`pages/_layout/_agent/use-chat-editor.ts`、`pages/_layout/_agent/prompt-input/skill-node.ts`、`prompt-input/index.tsx` **不变**。

---

## 7. 实现步骤

1. **Step 1**：改 `app/package.json` 加 3 依赖（§5.2，`prosemirror-state` 用 `^1.4.4`）。`pnpm install`。
2. **Step 2**：复制 7 文件（§4.1），divisor verbatim；仅 `prompt-ghost-suggestion.ts` 的 `GHOST_SUGGESTIONS` 换空数组（§4.4）。源路径用 `/Users/zhiyu/Desktop/coding/divisor-agent/packages/app/src/renderer/`。**不删** `prompt-input/skill-node.ts`。
3. **Step 3**：验证 `slash-commands.tsx` 的 `decorationContent`/`decorationEmptyClass`（§4.3）能否被 `@tiptap/suggestion@3.27.3` 接受；若 typecheck 报错则剥离这两个 option。
4. **Step 4**：`pnpm --filter @traceability/app typecheck`（web）。预期 clean：新文件编译为 unused，旧 `prompt-input/skill-node.ts` 仍满足 `use-chat-editor.ts` + `prompt-input/index.tsx` 的 import。
5. **Step 5**：`git commit -m "feat(app): port richtext slash-commands + skill-node from divisor"`。

---

## 8. 关键约束 / 决策

- **D1 verbatim 复制**：7 文件从 divisor 逐字复制，仅 `GHOST_SUGGESTIONS` 换空数组。保持 divisor 的 import 路径（`@renderer/*` 等已可解析）。不重写、不"适配"。
- **D2 prosemirror-state 版本**：`^1.4.4`（**纠正 handoff 的 `^2.0.0`**）。理由：TipTap 3.27.3 锁定 1.4.4，跨主版本冲突会破坏 `Plugin`/`PluginKey` instanceof。`prosemirror-view` `^1.0.0`（dedup 1.42.1）。
- **D3 不接入 editor**：本 TODO 只移植文件，不把新 `skillNode`/`useSlashCommandsExtension` 载入任何 editor。接入是 TODO D。
- **D4 不删 lean skill-node.ts**：`prompt-input/skill-node.ts`（lean 版）保留到 TODO D 消费者改写后再删。两 `skillNode` 共存无冲突（新的不载入）。
- **D5 GHOST_SUGGESTIONS 换空数组**：避免 divisor 的 demo 文案；ghost-suggestion 在 TODO D 接入前不生效，空数组安全。
- **D6 decorationContent 验证**：`@tiptap/suggestion@3.27.3` 对 `decorationContent`/`decorationEmptyClass` 的支持未验证；不支持则剥离（不影响核心功能）。
- **D7 @tiptap/extension-mention 不加**：现状已有 `3.27.3`。
- **D8 divisor 源路径**：用 `/Users/zhiyu/Desktop/coding/divisor-agent/...`（handoff 的 `/Users/evan/...` 是错误路径）。
- **D9 ESM specifier**：renderer 侧（`src/renderer/**`、`src/extensions/core/renderer/**`）import **不用** `.js` 后缀（与 main 侧不同）。

---

## 9. 参考

- 上层 handoff：`docs/superpowers/plans/2026-07-14-extension-migration-handoff.md` TODO C。
- divisor 源：`/Users/zhiyu/Desktop/coding/divisor-agent/packages/app/src/renderer/components/richtext/` + `hooks/use-latest.ts`。
- TODO D（接入）：同 handoff TODO D + 后续 spec。
- 现状 editor：`app/src/renderer/pages/_layout/_agent/use-chat-editor.ts`、`prompt-input/skill-node.ts`。

---

## 10. 验收标准

1. `app/src/renderer/components/richtext/{types.ts, components/icon-node.tsx, components/suggestions-panel.tsx, extensions/slash-commands.tsx, extensions/prompt-ghost-suggestion.ts, inline/skill-node.tsx}` + `app/src/renderer/hooks/use-latest.ts` 共 7 文件存在，内容与 divisor 对应文件逐字一致（`prompt-ghost-suggestion.ts` 除外 `GHOST_SUGGESTIONS=[]`）。
2. `app/package.json` 含 `fuse.js` `^7.4.1`、`prosemirror-state` `^1.4.4`、`prosemirror-view` `^1.0.0`；`pnpm install` 成功，无 prosemirror 跨版本冲突。
3. `prompt-input/skill-node.ts`（lean 版）**仍在**，未被删除。
4. `use-chat-editor.ts` / `prompt-input/index.tsx` **未改**。
5. `pnpm --filter @traceability/app typecheck`（web）clean（`skill-service.ts` 的 8 个预存错误是 node 侧，不影响 web typecheck；若 web 有 `decorationContent` 报错则已剥离）。
6. 单个 Conventional Commit：`feat(app): port richtext slash-commands + skill-node from divisor`。
