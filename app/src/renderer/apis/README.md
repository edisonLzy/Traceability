# apis

Renderer 层的 API 请求方法目录。每个文件按功能模块划分，承载该模块对服务端 REST 端点的请求逻辑。

## 文件结构

每个 API 方法遵循以下结构（请求/响应类型与请求函数成组放置）：

```typescript
/** 请求参数类型 */
export interface XxxRequest {
  // ...
}

/** 请求响应类型 */
export interface XxxResponse {
  // ...
}

/** 发起请求 */
export function xxx(req: XxxRequest): Promise<XxxResponse> {
  // 通过 @renderer/lib/request 的 apiFetch 发起调用
}
```

## 现有模块

| 文件         | 说明                                                                 |
| ------------ | -------------------------------------------------------------------- |
| `monitor.ts` | Agent 监控数据请求（Issue / Performance 工具调用的 REST 端点映射）   |

## 约定

- 所有请求统一走 `@renderer/lib/request` 的 `apiFetch`，不要在此处直接 `fetch`。
- 鉴权（token / server URL）由 `apiFetch` 内部从 `@renderer/store/auth` 读取，调用方无需关心。
- 当函数需要可测试时，可像 `fetchMonitorData` 那样把 `apiFetch` 作为依赖注入参数传入，便于在单测中替换。
