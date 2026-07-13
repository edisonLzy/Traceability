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
  // 通过 @renderer/lib/request 的 axios 实例 request 发起调用
}
```

## 现有模块

| 文件         | 说明                                                                 |
| ------------ | -------------------------------------------------------------------- |
| `monitor.ts` | 监控数据请求（Issues / Events / Replays / 性能），按端点拆分为独立函数 |
| `apps.ts`    | 应用管理请求（列表 / 详情 / 创建 / 删除）                            |

## 约定

- 所有请求统一走 `@renderer/lib/request` 的 axios 实例 `request`，不要在此处直接 `fetch`。
- 鉴权（token / server URL）由 `request` 的请求拦截器从 `@renderer/store/auth` 读取，调用方无需关心。
- 测试时通过 `vi.mock('@renderer/lib/request')` 替换 `request`（mock `request.get` 等），函数本身直接 `import { request }` 不接收注入依赖。
- 这些函数只服务 UI 数据层（页面经 `@renderer/hooks` 的 react-query 封装调用）。**agent 的 monitor 工具不走 renderer**——它在 main 进程自包含取数（见 `built-in/monitor/main.ts` 的 `MonitorClient`），两者各自实现端点映射。
