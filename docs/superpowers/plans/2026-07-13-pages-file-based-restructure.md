# Pages File-Based Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `app/src/renderer/` 的路由与页面组织改成 file-based 风格——`pages/` 只装路由,根 layout 及其 chrome 进入 `pages/_layout/`,page 私有模块用 `_` 前缀,跨层共享的 hook 提到顶层 `hooks/`。

**Architecture:** 纯结构搬运 + import 路径改写,不改任何运行时逻辑。路由机制保持现状(`createMemoryRouter` 手写路由表),只是 import 来源变。三个任务按依赖顺序执行,每个任务结束都通过 `typecheck`、树可编译、可独立提交。

**Tech Stack:** Electron + electron-vite + React 19 + react-router-dom 6 + TypeScript(strict + `noUncheckedIndexedAccess`)。别名 `@renderer` -> `src/renderer`(在 `electron.vite.config.ts` 与 `vitest.config.ts` 中配置,支持文件夹 -> `index.tsx` 解析)。

## Global Constraints

- 严格 pnpm:`pnpm exec` / `pnpm --filter`,禁止 `npx`/`npm`/`yarn`。
- ESM `.js` import specifiers 规则只适用于 `packages/*` 和 `server`;`app/` 是 Vite/electron-vite,无需 `.js` 后缀——保持各文件现有风格。
- `import type` 用于纯类型导入。
- lint/format 仅在 commit 时由 husky + lint-staged 自动跑(oxlint --fix / oxfmt --write);不要手动跑 format。
- 提交信息用 Conventional Commits(`refactor:` 适用于本计划)。
- **硬规则(本计划的目标 invariant):`pages/` 之外的文件不得 import `pages/` 内部;只有 `router.tsx` 和 `pages/` 自身可以。** 每个任务结束都应满足此规则。

---

## File Structure(最终形态)

```
app/src/renderer/
  App.tsx                          # 不变
  main.tsx                         # 不变
  router.tsx                       # 仅改 1 行(Layout import 路径)
  apis/                            # 不变
  components/
    NoAppState.tsx                 # 留(被 issues + performance 两个 page 用,跨 page)
    ui/                            # 留(跨层 dumb UI)
  context/                         # 不变
  hooks/                           # 顶层共享 hook
    use-apps.ts                    # 不变(已被 context/current-app 用)
    use-issue.ts                   # 由 pages/issues/hooks/ 提上来(Task 1)
    use-issues.ts                  # 由 pages/issues/hooks/ 提上来(Task 1)
  lib/                             # 不变
  pages/
    _layout/                       # 根 layout route(_ 前缀=不可寻址)
      index.tsx                    # 原 renderer/Layout.tsx
      _components/
        Sidebar.tsx                # 原 components/Sidebar.tsx
        Titlebar.tsx               # 原 components/Titlebar.tsx
        CreateAppModal.tsx         # 原 components/CreateAppModal.tsx
        AgentPanel.tsx             # 原 features/agent/index.tsx
        CommandPalette.tsx         # 原 features/command-palette/index.tsx
      _hooks/
        use-create-app.ts          # 原 pages/apps/hooks/use-create-app.ts
    issues/
      index.tsx                    # 不变(/issues)
      detail.tsx                   # 仅改 import 路径(/issues/:id)
      _components/                 # 原 issues/components/(_ 前缀化,Task 2)
        SourceLocation.tsx
        RrwebReplayPlayer.tsx
    performance/
      index.tsx                    # 仅改 import 路径(/performance)
      _hooks/                      # 原 performance/hooks/(_ 前缀化,Task 2)
        use-performance.ts
```

删除的空目录:`features/`、`pages/apps/`、`pages/issues/hooks/`、`store/`。

---

## Task 1: 提升共享 data hook 到顶层 `hooks/`

**Scope:** `use-issues` 被 `components/Sidebar.tsx`(chrome)和 `pages/issues/index.tsx`(page)共用;`use-issue` 被 `features/agent/index.tsx`(chrome)和 `pages/issues/detail.tsx`(page)共用。两者都跨 `pages/` 边界,按规则提到顶层 `hooks/`。被移动的 hook 文件内部只 import `@renderer/apis/*`、`@tanstack/react-query`、`@traceability/protocol`、`react`,均不动,故为纯 `git mv` + 改 importer。

**Files:**
- Move: `app/src/renderer/pages/issues/hooks/use-issue.ts` -> `app/src/renderer/hooks/use-issue.ts`
- Move: `app/src/renderer/pages/issues/hooks/use-issues.ts` -> `app/src/renderer/hooks/use-issues.ts`
- Delete: `app/src/renderer/pages/issues/hooks/`(移空后)
- Modify(importer 改路径):
  - `app/src/renderer/components/Sidebar.tsx:4`
  - `app/src/renderer/features/agent/index.tsx:4`
  - `app/src/renderer/pages/issues/index.tsx:6`
  - `app/src/renderer/pages/issues/detail.tsx:6-11`

**Import-line changes(before -> after):**

`components/Sidebar.tsx:4`:
```
- import { useIssues } from "@renderer/pages/issues/hooks/use-issues";
+ import { useIssues } from "@renderer/hooks/use-issues";
```

`features/agent/index.tsx:4`:
```
- import { useIssue } from "@renderer/pages/issues/hooks/use-issue";
+ import { useIssue } from "@renderer/hooks/use-issue";
```

`pages/issues/index.tsx:6`:
```
- import { useInvalidateIssues, useIssues } from "@renderer/pages/issues/hooks/use-issues";
+ import { useInvalidateIssues, useIssues } from "@renderer/hooks/use-issues";
```

`pages/issues/detail.tsx:6-11`:
```
- import {
-   useIssue,
-   useIssueEvents,
-   useIssueReplays,
-   useReplay,
- } from "@renderer/pages/issues/hooks/use-issue";
+ import {
+   useIssue,
+   useIssueEvents,
+   useIssueReplays,
+   useReplay,
+ } from "@renderer/hooks/use-issue";
```

- [ ] **Step 1: 移动两个 hook 文件到顶层 `hooks/`**

```bash
cd app/src/renderer
git mv pages/issues/hooks/use-issue.ts hooks/use-issue.ts
git mv pages/issues/hooks/use-issues.ts hooks/use-issues.ts
rmdir pages/issues/hooks
```

- [ ] **Step 2: 更新 4 个 importer 的 import 路径**

按上面 "Import-line changes" 用 Edit 工具逐个改 `Sidebar.tsx`、`features/agent/index.tsx`、`pages/issues/index.tsx`、`pages/issues/detail.tsx`。每处 old_string 必须与文件当前内容逐字一致(含缩进)。

- [ ] **Step 3: 全局确认没有遗漏的旧路径引用**

```bash
cd app/src/renderer
grep -rn "pages/issues/hooks" . --include="*.tsx" --include="*.ts"
```
Expected: 无输出(空)。若有输出,补改对应文件。

- [ ] **Step 4: typecheck**

```bash
pnpm --filter @traceability/app typecheck
```
Expected: 通过,0 error。

- [ ] **Step 5: 提交**

```bash
git add -A app/src/renderer
git commit -m "refactor(app): hoist shared issue hooks to top-level hooks/"
```

---

## Task 2: page 私有模块加 `_` 前缀

**Scope:** `pages/issues/components/`(SourceLocation / RrwebReplayPlayer)只被 `pages/issues/detail.tsx` 用 -> 私有,`_components/`。`pages/performance/hooks/use-performance.ts` 只被 `pages/performance/index.tsx` 用 -> 私有,`_hooks/`。纯重命名目录 + 改 importer。

**Files:**
- Rename: `app/src/renderer/pages/issues/components/` -> `app/src/renderer/pages/issues/_components/`
- Rename: `app/src/renderer/pages/performance/hooks/` -> `app/src/renderer/pages/performance/_hooks/`
- Modify(importer 改路径):
  - `app/src/renderer/pages/issues/detail.tsx:4-5`
  - `app/src/renderer/pages/performance/index.tsx:5`

**Import-line changes(before -> after):**

`pages/issues/detail.tsx:4-5`:
```
- import { RrwebReplayPlayer } from "@renderer/pages/issues/components/RrwebReplayPlayer";
- import { SourceLocation } from "@renderer/pages/issues/components/SourceLocation";
+ import { RrwebReplayPlayer } from "@renderer/pages/issues/_components/RrwebReplayPlayer";
+ import { SourceLocation } from "@renderer/pages/issues/_components/SourceLocation";
```

`pages/performance/index.tsx:5`:
```
- import { usePerformanceSummary } from "@renderer/pages/performance/hooks/use-performance";
+ import { usePerformanceSummary } from "@renderer/pages/performance/_hooks/use-performance";
```

- [ ] **Step 1: 重命名两个目录**

```bash
cd app/src/renderer
git mv pages/issues/components pages/issues/_components
git mv pages/performance/hooks pages/performance/_hooks
```

- [ ] **Step 2: 更新 2 个 importer 的 import 路径**

按上面 "Import-line changes" 改 `pages/issues/detail.tsx`、`pages/performance/index.tsx`。

- [ ] **Step 3: 全局确认没有遗漏的旧路径引用**

```bash
cd app/src/renderer
grep -rn "issues/components\|performance/hooks" . --include="*.tsx" --include="*.ts"
```
Expected: 无输出。若有输出,补改。

- [ ] **Step 4: typecheck**

```bash
pnpm --filter @traceability/app typecheck
```
Expected: 通过,0 error。

- [ ] **Step 5: 提交**

```bash
git add -A app/src/renderer
git commit -m "refactor(app): underscore-prefix page-private modules"
```

---

## Task 3: 根 layout + chrome 进入 `pages/_layout/`

**Scope:** 把 `renderer/Layout.tsx` 变成根 layout route `pages/_layout/index.tsx`,把只被 Layout 用的 chrome(Sidebar / Titlebar / CreateAppModal / AgentPanel / CommandPalette)及其私有 hook(use-create-app)colocate 到 `pages/_layout/` 下。删掉空目录 `features/`、`pages/apps/`、`store/`。步骤按"每步树可编译"排序:先移 Layout(其 chrome import 仍走 `@renderer/...` 别名,暂时可解析),再逐个移 chrome 并即时改 Layout 的 import,最后移 use-create-app 并改 CreateAppModal 的 import。

**Files:**
- Move: `app/src/renderer/Layout.tsx` -> `app/src/renderer/pages/_layout/index.tsx`
- Move: `app/src/renderer/components/Titlebar.tsx` -> `app/src/renderer/pages/_layout/_components/Titlebar.tsx`
- Move: `app/src/renderer/components/Sidebar.tsx` -> `app/src/renderer/pages/_layout/_components/Sidebar.tsx`
- Move: `app/src/renderer/components/CreateAppModal.tsx` -> `app/src/renderer/pages/_layout/_components/CreateAppModal.tsx`
- Move: `app/src/renderer/pages/apps/hooks/use-create-app.ts` -> `app/src/renderer/pages/_layout/_hooks/use-create-app.ts`
- Move(+rename): `app/src/renderer/features/agent/index.tsx` -> `app/src/renderer/pages/_layout/_components/AgentPanel.tsx`
- Move(+rename): `app/src/renderer/features/command-palette/index.tsx` -> `app/src/renderer/pages/_layout/_components/CommandPalette.tsx`
- Delete(空): `app/src/renderer/features/`、`app/src/renderer/pages/apps/`、`app/src/renderer/store/`
- Modify(importer 改路径):
  - `app/src/renderer/router.tsx:1`
  - `app/src/renderer/pages/_layout/index.tsx`(原 Layout.tsx)的 4 行 chrome import
  - `app/src/renderer/pages/_layout/_components/Sidebar.tsx`(原 Sidebar)的 CreateAppModal import
  - `app/src/renderer/pages/_layout/_components/CreateAppModal.tsx`(原 CreateAppModal)的 use-create-app import

**Import-line changes(before -> after):**

`router.tsx:1`:
```
- import { Layout } from "@renderer/Layout";
+ import { Layout } from "@renderer/pages/_layout";
```

`pages/_layout/index.tsx`(原 Layout.tsx)行 1-5:
```
- import { Sidebar } from "@renderer/components/Sidebar";
- import { Titlebar } from "@renderer/components/Titlebar";
  import { useCurrentApp } from "@renderer/context/current-app";
- import { AgentPanel } from "@renderer/features/agent";
- import { CommandPalette } from "@renderer/features/command-palette";
+ import { Sidebar } from "./_components/Sidebar";
+ import { Titlebar } from "./_components/Titlebar";
+ import { useCurrentApp } from "@renderer/context/current-app";
+ import { AgentPanel } from "./_components/AgentPanel";
+ import { CommandPalette } from "./_components/CommandPalette";
```
(注意:第 3 行 `useCurrentApp` 不变,保持原相对顺序即可;上面为展示完整块。)

`pages/_layout/_components/Sidebar.tsx`(原 Sidebar)行 1:
```
- import { CreateAppModal } from "@renderer/components/CreateAppModal";
+ import { CreateAppModal } from "./CreateAppModal";
```
(其第 4 行 `useIssues` 已在 Task 1 改为 `@renderer/hooks/use-issues`,本任务不动。)

`pages/_layout/_components/CreateAppModal.tsx`(原 CreateAppModal)行 12:
```
- import { useCreateApp } from "@renderer/pages/apps/hooks/use-create-app";
+ import { useCreateApp } from "../_hooks/use-create-app";
```

其余被移动的 chrome 文件 import 不变:
- `Titlebar.tsx`:仅 `lucide-react` + `react`。
- `AgentPanel.tsx`(原 `features/agent/index.tsx`):`useIssue` 已在 Task 1 改为 `@renderer/hooks/use-issue`,其余(`@renderer/context/current-app`、`@renderer/lib/agent-events`、`@renderer/lib/utils`、`@shared/ipc`、lucide/react/react-router/streamdown)不变。
- `CommandPalette.tsx`(原 `features/command-palette/index.tsx`):全部 import 不变。

- [ ] **Step 1: 移动 Layout -> `pages/_layout/index.tsx`,改 router import**

```bash
cd app/src/renderer
mkdir -p pages/_layout
git mv Layout.tsx pages/_layout/index.tsx
```
然后改 `router.tsx:1`:`@renderer/Layout` -> `@renderer/pages/_layout`。
此时 `pages/_layout/index.tsx` 仍 import `@renderer/components/Sidebar` 等别名,可解析,树可编译。

- [ ] **Step 2: typecheck(中间态)**

```bash
pnpm --filter @traceability/app typecheck
```
Expected: 通过(Layout 经别名仍能找到 chrome)。

- [ ] **Step 3: 移动 Titlebar,改 Layout 的 Titlebar import**

```bash
cd app/src/renderer
mkdir -p pages/_layout/_components
git mv components/Titlebar.tsx pages/_layout/_components/Titlebar.tsx
```
改 `pages/_layout/index.tsx`:`import { Titlebar } from "@renderer/components/Titlebar";` -> `import { Titlebar } from "./_components/Titlebar";`

- [ ] **Step 4: 移动 CreateAppModal + Sidebar(同一步,避免互相断链),改两处 import**

```bash
cd app/src/renderer
git mv components/CreateAppModal.tsx pages/_layout/_components/CreateAppModal.tsx
git mv components/Sidebar.tsx pages/_layout/_components/Sidebar.tsx
```
改 `pages/_layout/index.tsx`:`@renderer/components/Sidebar` -> `./_components/Sidebar`。
改 `pages/_layout/_components/Sidebar.tsx:1`:`@renderer/components/CreateAppModal` -> `./CreateAppModal`。
(CreateAppModal 的 `use-create-app` import 此刻仍指向 `@renderer/pages/apps/hooks/use-create-app`,该路径尚未变,可解析。)

- [ ] **Step 5: 移动 use-create-app,改 CreateAppModal import,清空 pages/apps/**

```bash
cd app/src/renderer
mkdir -p pages/_layout/_hooks
git mv pages/apps/hooks/use-create-app.ts pages/_layout/_hooks/use-create-app.ts
rmdir pages/apps/hooks pages/apps
```
改 `pages/_layout/_components/CreateAppModal.tsx:12`:`@renderer/pages/apps/hooks/use-create-app` -> `../_hooks/use-create-app`。

- [ ] **Step 6: 移动 AgentPanel,改 Layout import**

```bash
cd app/src/renderer
git mv features/agent/index.tsx pages/_layout/_components/AgentPanel.tsx
```
改 `pages/_layout/index.tsx`:`@renderer/features/agent` -> `./_components/AgentPanel`。
(AgentPanel 的 `use-issue` 已在 Task 1 改为 `@renderer/hooks/use-issue`,无需再动。)

- [ ] **Step 7: 移动 CommandPalette,改 Layout import**

```bash
cd app/src/renderer
git mv features/command-palette/index.tsx pages/_layout/_components/CommandPalette.tsx
```
改 `pages/_layout/index.tsx`:`@renderer/features/command-palette` -> `./_components/CommandPalette`。

- [ ] **Step 8: 清理空目录**

```bash
cd app/src/renderer
rmdir features/agent features/command-palette features 2>/dev/null
rmdir store 2>/dev/null
```
若 `features/` 下仍有残留(不应有),用 `git status` 核对后删。

- [ ] **Step 9: 全局确认没有遗漏的旧路径引用**

```bash
cd app/src/renderer
grep -rn "@renderer/Layout\|@renderer/components/Sidebar\|@renderer/components/Titlebar\|@renderer/components/CreateAppModal\|@renderer/features\|@renderer/pages/apps" . --include="*.tsx" --include="*.ts"
```
Expected: 无输出。若有输出,补改。

再确认硬规则(pages 外不 import pages 内部,除 router.tsx):
```bash
cd app/src/renderer
grep -rn "@renderer/pages" . --include="*.tsx" --include="*.ts" | grep -v "^./pages/" | grep -v "^./router.tsx"
```
Expected: 无输出(只有 `pages/` 内部互引和 `router.tsx` 引 pages)。

- [ ] **Step 10: typecheck**

```bash
pnpm --filter @traceability/app typecheck
```
Expected: 通过,0 error。

- [ ] **Step 11: 构建(端到端确认)**

```bash
pnpm --filter @traceability/app build
```
Expected: electron-vite 构建成功(main/preload/renderer 三段都过)。

- [ ] **Step 12: 跑测试(确认未破坏 renderer 测试 import)**

```bash
pnpm --filter @traceability/app test
```
Expected: 现有 `apis/monitor.test.ts` 通过。

- [ ] **Step 13: 提交**

```bash
git add -A app/src/renderer
git commit -m "refactor(app): move root layout and chrome into pages/_layout"
```

---

## Self-Review

**1. Spec coverage:**
- "pages 只装路由" -> Task 3 把 Layout/chrome 移出顶层、把 features 移入 `pages/_layout/`;Task 1 把跨层 hook 移出 pages。覆盖。
- "Layout 也在 pages 下" -> Task 3 Step 1 移 `Layout.tsx` -> `pages/_layout/index.tsx`。覆盖。
- "page 私有模块用 `_` 前缀" -> Task 2(`_components`/`_hooks`)。覆盖。
- "跨层共享 hook 提层" -> Task 1(`use-issues`/`use-issue`)。覆盖。
- `use-create-app` 归属 -> Task 3 Step 5 移到 `pages/_layout/_hooks/`(只被 chrome 用,按规则私有)。覆盖。
- `NoAppState` 跨 page 不动 -> File Structure 明确留 `components/`。覆盖。
- 空目录 `store/` 删除 -> Task 3 Step 8。覆盖。
- `router.tsx` 改动 -> Task 3 Step 1。覆盖。

**2. Placeholder scan:** 无 TBD/TODO;每步都有具体 `git mv` 命令或 before->after import 行。通过。

**3. Type consistency:** 导出符号名未变(`Layout`/`Sidebar`/`Titlebar`/`CreateAppModal`/`AgentPanel`/`CommandPalette`/`useIssue*`/`useCreateApp`/`usePerformanceSummary`),仅文件位置与 import 路径变;`router.tsx` 仍 `import { Layout }`。`features/agent/index.tsx` -> `AgentPanel.tsx`、`features/command-palette/index.tsx` -> `CommandPalette.tsx` 的重命名与 Layout 的 `./_components/AgentPanel`、`./_components/CommandPalette` 一致。通过。
