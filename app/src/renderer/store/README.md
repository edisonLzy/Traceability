# Store 目录说明

本目录管理 renderer 进程的 Zustand 状态。当前仅包含连接 / 鉴权状态，后续如需新增独立状态域，按"一个文件 = 一个 store"的方式扩展。

## 目录结构

```
store/
  auth.ts   -- 连接凭证（server URL + token）状态
```

## auth store

`auth.ts` 是 renderer 连接状态的唯一来源，承担：

- 从主进程引导已持久化的凭证（`bootstrapConnection`）
- 保存 / 清除凭证（`saveConnection` / `clearAuth`）
- 暴露同步读取的 `getToken` / `getServer`，供 `lib/request.ts`、`lib/ws.ts` 这类非 React 模块使用

### 消费方式

- **React 组件**：用 `useAuth()` 订阅凭证，状态变化自动重渲染。
- **非 React 模块**（HTTP / WS 传输层）：用 `getToken()` / `getServer()` 同步读取，它们内部调用 `useAuthStore.getState()`。

### 为什么用主包 `create` 而非 `zustand/vanilla`

traceability 只有一个简单 store、无 slice 组合、无非 React 的 extension 消费者。主包 `create` 返回的 hook 本身挂载了 `getState()`，既能给组件当 hook 用，又能给纯 JS 模块同步读取，无需引入 `vanilla` + `useStore(store, selector)` 的额外包装。若后续出现多 store / slice 组合 / 跨 React 边界消费，再参考 divisor-agent 切换为 `vanilla` + slice 工厂模式。
