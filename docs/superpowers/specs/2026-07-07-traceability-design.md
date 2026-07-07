# Traceability — 全栈监控与AI修复闭环（设计快照）

> **状态**: in-progress (2026-07-07)  
> 本文档是brainstorming过程中的设计快照,不是最终spec。今天讨论已暂定,后续继续完善。

## 1. 目标

搭建 web 应用监控体系,实现"异常采集 → feedback给研发 → AI 自动修复"完整闭环。Loop engineer 思路。

## 2. 范围(已确认)

**全栈**:采集 SDK + loop engineer 闭环(异常→feedback→AI修复→自动MR)。

## 3. 关键技术决策(已确认)

| # | 决策 | 选择 |
|---|------|------|
| 1 | 范围 | 全栈 |
| 2 | Sentry 角色 | 底层引擎 + 自研extension + 自研 DNS server |
| 3 | 用户侧 feedback 入口 | app 中常驻 Inbox 模块,异常时自动新增记录 |
| 4 | AI 修复触发 | 手动点"AI修复"按钮 |
| 5 | packages/cli 角色 | server 的命令行客户端(给 coding agent 用) |
| 6 | app 与 cli 关系 | **相互独立**,cli 是给 coding agent 访问 server 数据的方式 |
| 7 | AI 修复运行位置 | 本机 coding agent(claude code / codex 等) |
| 8 | packages/skills 角色 | 基于 cli 提供的常用 skill 包(coding agent 调用的能力插件) |
| 9 | 闭环终点 | **自动创建 GitLab MR + 通知** |
| 10 | MR 仓库定位 | **应用概念**: app 创建应用时关联仓库,SDK 上报 appId,server 查表得到仓库 |
| 11 | 成功标准 | 全链路贯通 |

## 4. 待确认问题

回看后需要继续澄清:

1. **谁开 MR?**
   - 选项 A: server 用配置的 GitLab token 直接开 MR(agent 不需要仓库写权限)
   - 选项 B: agent 在本机用自己 GitLab 凭证开 MR
   - 选项 C: 其他

2. **agent 怎么知道"有活儿"?**
   - 选项 A: 轮询 `traceability issue list --status=fix-requested`
   - 选项 B: server 主动推(webhook / 飞书 IM 通知)
   - 选项 C: 双轨(轮询 + IM 提示给人)

3. **packages/skills 怎么挂到 agent?**
   - 放进 `.claude/skills/` 或 `.codex/skills/` 目录,被 agent 作为 slash-command 调用
   - 还是其他模式

## 5. 目录结构(已定)

```
traceability/
├── packages/
│   ├── core/          # 自研外壳层,基于 Sentry SDK + 业务 extension
│   ├── react/         # 基于 core 的 React 封装
│   ├── electron/      # 基于 core 的 Electron 封装
│   ├── cli/           # server 的命令行客户端(给 coding agent 用)
│   └── skills/        # 基于 cli 的常用 skill 包
├── app/               # 可视化采集数据的 UI(Inbox 模块)
├── server/            # 自研 DNS 服务(envelope ingest / issue 聚合 / 修复工作流)
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-07-07-traceability-design.md  (本文)
```

## 6. Sentry 覆盖评估

飞书 wiki (JFB9wqaTtiUj4CkcaYOcmIBOnkH) 第 4.5-4.10 节列出 12 类采集场景,Sentry 覆盖评估:

### Sentry 原生支持(7/12)

| 场景 | Sentry 能力 |
|------|-------------|
| JS 运行时错误 | `@sentry/browser` window error |
| Promise 拒绝 | `@sentry/browser` unhandledrejection |
| React 19 组件树错误 | `@sentry/react` ErrorBoundary + onUncaughtError |
| ErrorBoundary 兜底 | `@sentry/react` ErrorBoundary |
| 资源加载失败 | `@sentry/browser` capture event (window error capture phase) |
| API 请求监控 | `@sentry/browser` BrowserTracing + XHR/fetch hooks |
| 性能指标 INP/LCP/FCP/CLS/TTFB | `@sentry/browser` + `web-vitals` 集成 |
| CORS 配置诊断 | `@sentry/browser` 启动时 Script error 检测 |

### 不支持,需自研 extension(5/12)

| 场景 | 原因 |
|------|------|
| 业务链路(消息/电话/坐席) | Sentry 不知道业务语义 |
| 消息丢失自动检测(无 ack) | 业务状态机,Sentry 无感知 |
| RTC 质量监控(WebRTC getStats) | 业务专用 API |
| WebSocket 心跳超时检测 | 业务长连接 |
| 白屏检测(MF 感知) | 业务 DOM 评估 |
| MF 单实例守卫 | 架构适配,不是通用监控问题 |
| 坐席健康(状态时长异常) | 业务状态机 |

## 7. 端到端闭环(已画)

```
[web/electron 应用]
  → packages/core 上报(Sentry envelope + 业务事件 + appId)
    → server
      → envelope ingest
      → issue 聚合
      → 落库
        → app/Inbox 自动新增记录(用户侧"feedback")
        
[研发在 Inbox 点"开始 AI 修复"]
  → server 标记 issue.status = "fix-requested"
  → server 派发通知(飞书 IM / GitLab issue 评论)

[coding agent(本机/CI)]
  → traceability issue list --status=fix-requested
  → traceability issue show <id>        # 拉堆栈/截图/网络/上下文
  → 调 packages/skills 里的 investigate-issue / generate-fix
  → 改代码
  → traceability issue attach-patch <id> --file=...
  → traceability issue mark-fixed <id> --mr-url=...

[server]
  → 收到 patch + MR url
  → 用配置的 GitLab token 自动开 MR (待确认)
  → 落库,Inbox 状态变 "fixed" + 链接到 MR
```

## 8. 仍待讨论的设计点

- 各模块接口与数据 schema(envelope / event / issue / fix-session)
- 存储选型(issue/event/git-patch)
- server API 边界
- 权限模型(app / project / agent token)
- 截图/html2canvas 等附属数据
- dev/prod 行为差异
- 敏感字段脱敏规则
- 测试策略

## 9. 后续步骤

1. 继续澄清"待确认问题"三问
2. 写完数据流 / 模块边界 / 数据 schema
3. self-review
4. 用户 review
5. 转入 writing-plans
