# ExtensionsContextAPIProvider 挂载规格（TODO B）

**日期**：2026-07-14
**状态**：已对齐，待实现
**来源**：`docs/superpowers/plans/2026-07-14-extension-migration-handoff.md` TODO B
**目标**：为本 spec 的实现者提供自洽、可执行的契约。

---

## 1. 任务做什么

### 1.1 背景

`app/src/renderer/App.tsx` 现在只挂了 `ExtensionProvider`（extension 注册表），**没有**挂 `ExtensionsContextAPIProvider`。后者提供 `ExtensionsContextAPI = { getActiveSessionId(), sharedPromptEditor }`，是 `useExtensionsContextAPI()` / `useSharedPromptEditor()` 的 React context 来源。

后果：任何 renderer 代码调 `useSharedPromptEditor()` 或 `useExtensionsContextAPI()` 都会抛 `"useExtensionsContextAPI must be used within ExtensionsContextAPIProvider"`。TODO C/D 要从 divisor 移植的 `PromptInput` 会调 `useSharedPromptEditor()`，所以本 TODO 是 TODO C/D 的**前置依赖**，必须先完成。

### 1.2 目标

在 `App.tsx` 挂载 `ExtensionsContextAPIProvider`，提供：
- `getActiveSessionId()`：读 live `agentStore.getState().activeSessionId ?? null`；
- `sharedPromptEditor`：模块单例 `SharedPromptEditor.create()`，供 ported `PromptInput` 把它的 TipTap editor 实例挂上去（onCreate/onDestroy）。

---

## 2. 变更范围

### 2.1 In scope

- 仅改 `app/src/renderer/App.tsx`：
  - 新增 import（`ExtensionsContextAPIProvider` / `SharedPromptEditor` / `type ExtensionsContextAPI` / `agentStore`）；
  - 模块顶层建 `sharedPromptEditor` 单例 + 静态 `extensionsContextAPI`；
  - JSX 在 `ExtensionProvider` 内、`RouterProvider` 外包一层 `ExtensionsContextAPIProvider`。

### 2.2 Out of scope

- 不改 `@extensions/core/renderer` 的任何文件（`contextAPI.tsx` / `sharedPromptEditor.ts` 已就绪）。
- 不改 `agentStore`（`activeSessionId` 已存在于 `sessions-slice`）。
- 不引入 artifact / permission 相关 context 方法（`ExtensionsContextAPI` 已 trimmed 为 `{ getActiveSessionId, sharedPromptEditor }`，保持）。
- 不碰 TODO C/D/E（slash-commands / assistant-blocks）--那些依赖本 TODO 挂好的 context。

---

## 3. 现状基线

### 3.1 `app/src/renderer/App.tsx`（现状）

```tsx
import { installedRendererExtensions } from "@extensions/builtins/index.renderer";
import { ExtensionProvider } from "@extensions/core/renderer";
import { Toaster } from "@renderer/components/ui/sonner";
import { CurrentAppProvider } from "@renderer/context/current-app";
import { ElectronIPCProvider } from "@renderer/context/ElectronIPCProvider";
import { connectWs } from "@renderer/lib/ws";
import { router } from "@renderer/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";

const queryClient = new QueryClient({ /* ... */ });

export function App() {
  useEffect(() => { connectWs(); }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ElectronIPCProvider>
        <CurrentAppProvider>
          <ExtensionProvider extensions={installedRendererExtensions}>
            <RouterProvider router={router} />
            <Toaster />
          </ExtensionProvider>
        </CurrentAppProvider>
      </ElectronIPCProvider>
    </QueryClientProvider>
  );
}
```

### 3.2 已就绪的依赖（无需改）

- `@extensions/core/renderer` 导出 `ExtensionsContextAPIProvider`、`SharedPromptEditor`、`type ExtensionsContextAPI`（见 `app/src/extensions/core/renderer/index.ts`）。
- `ExtensionsContextAPI` 接口（`contextAPI.tsx`）：`{ getActiveSessionId(): string | null; sharedPromptEditor: SharedPromptEditor }`（已 trimmed，无 artifact 方法）。
- `SharedPromptEditor.create()`（`sharedPromptEditor.ts`）：`static create()` 返回 `new SharedPromptEditor()`；`editor` getter/setter 挂 TipTap `Editor` 实例。
- `agentStore`（`@renderer/store/agent`）：`activeSessionId: string | null` 在 `sessions-slice`。

---

## 4. 变更详情

### 4.1 import 改动

```diff
- import { ExtensionProvider } from "@extensions/core/renderer";
+ import {
+   ExtensionProvider,
+   ExtensionsContextAPIProvider,
+   SharedPromptEditor,
+   type ExtensionsContextAPI,
+ } from "@extensions/core/renderer";
+ import { agentStore } from "@renderer/store/agent";
```

> **不要** import `useStore` from "zustand"。handoff 原文列了它但未使用；`getActiveSessionId` 是静态对象上的普通函数，**用不了 hook**，必须用 `agentStore.getState()`。

### 4.2 模块顶层单例 + 静态 api（加在 `queryClient` 之后、`App` 之前）

```tsx
// Single editor holder shared across the app (the ported PromptInput wires its
// editor instance into this via onCreate/onDestroy).
const sharedPromptEditor = SharedPromptEditor.create();

const extensionsContextAPI: ExtensionsContextAPI = {
  getActiveSessionId: () => agentStore.getState().activeSessionId ?? null,
  sharedPromptEditor,
};
```

- `sharedPromptEditor` 是**模块单例**（顶层 `const`），App 每次 render 不重建。
- `getActiveSessionId` 用 `agentStore.getState()`（非 hook），调用时读 store 当前值。

### 4.3 JSX 嵌套改动

```diff
   <ExtensionProvider extensions={installedRendererExtensions}>
+    <ExtensionsContextAPIProvider api={extensionsContextAPI}>
       <RouterProvider router={router} />
       <Toaster />
+    </ExtensionsContextAPIProvider>
   </ExtensionProvider>
```

`ExtensionsContextAPIProvider` 嵌在 `ExtensionProvider` 内、`RouterProvider` + `Toaster` 外。

---

## 5. 变更后文件结构

`App.tsx` 单文件改动，provider 嵌套变为：

```
QueryClientProvider
└── ElectronIPCProvider
    └── CurrentAppProvider
        └── ExtensionProvider            (extensions={installedRendererExtensions})
            └── ExtensionsContextAPIProvider   (api={extensionsContextAPI})   ← 新增
                ├── RouterProvider              (router={router})
                └── Toaster
```

模块顶层新增两个 const：`sharedPromptEditor`、`extensionsContextAPI`。

---

## 6. 实现步骤

1. **Step 1**：改 import（§4.1）--合并 `@extensions/core/renderer` 导入、新增 `agentStore`；不引入 `useStore`。
2. **Step 2**：加模块顶层 `sharedPromptEditor` 单例 + `extensionsContextAPI` 静态对象（§4.2）。
3. **Step 3**：JSX 在 `ExtensionProvider` 内包一层 `ExtensionsContextAPIProvider api={extensionsContextAPI}`，`RouterProvider` + `Toaster` 放其内（§4.3）。
4. **Step 4**：`pnpm --filter @traceability/app typecheck`（web）。预期 clean。
5. **Step 5**：`git commit -m "feat(app): mount ExtensionsContextAPIProvider with shared prompt editor"`。

---

## 7. 关键约束 / 决策

- **D1 单文件**：仅改 `App.tsx`，不碰 extension 源码、不碰 store。
- **D2 模块单例**：`sharedPromptEditor = SharedPromptEditor.create()` 放模块顶层，非组件内 `useState`/`useRef`--避免 App 重渲染时重建 editor holder。
- **D3 getState() 非 hook**：`getActiveSessionId` 是 `ExtensionsContextAPI` 静态对象上的普通函数，用 `agentStore.getState().activeSessionId ?? null`；**不用** `useStore`（hook 在静态对象里非法）。
- **D4 嵌套顺序**：`ExtensionProvider`（外）> `ExtensionsContextAPIProvider`（内）> `{RouterProvider, Toaster}`。`ElectronIPCProvider`/`CurrentAppProvider` 保持现状在 `ExtensionProvider` 外。
- **D5 context 仍 trimmed**：`ExtensionsContextAPI` 只有 `{ getActiveSessionId, sharedPromptEditor }`，不补 artifact/permission 方法（read-only agent，见 handoff Global Constraints）。
- **D6 前置依赖**：本 TODO 必须在 TODO C/D 之前完成（ported `PromptInput` 依赖 `useSharedPromptEditor()`）。

---

## 8. 参考

- 上层 handoff：`docs/superpowers/plans/2026-07-14-extension-migration-handoff.md` TODO B。
- context 实现：`app/src/extensions/core/renderer/contextAPI.tsx`、`sharedPromptEditor.ts`、`index.ts`。
- store：`app/src/renderer/store/agent/sessions-slice.ts`（`activeSessionId`）。
- 现状 App：commit `36f843a` 的 `app/src/renderer/App.tsx`。

---

## 9. 验收标准

1. `App.tsx` 挂载 `ExtensionsContextAPIProvider api={extensionsContextAPI}`，嵌在 `ExtensionProvider` 内、`RouterProvider` 外。
2. `sharedPromptEditor` 为模块顶层单例；`getActiveSessionId` 用 `agentStore.getState().activeSessionId ?? null`。
3. **未** import `useStore` from "zustand"。
4. `pnpm --filter @traceability/app typecheck`（web）clean。
5. 单个 Conventional Commit：`feat(app): mount ExtensionsContextAPIProvider with shared prompt editor`。
