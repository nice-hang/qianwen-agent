# Handoff

本文用于跨轮次交接。每次完成一段较大的实现、暂停开发或切换任务前更新。

## 当前目标

准备进入 Stage 1：最小聊天闭环。

## 当前状态

- Stage 0 已完成：pnpm workspace、apps/packages 骨架、shared 协议、server health、web 最小页面。
- `pnpm install` 已生成依赖和 lockfile。
- `pnpm typecheck` 已通过。
- `pnpm --filter @qianwen-agent/server start` 可启动 server，`GET /health` 返回 ok。
- `pnpm --filter @qianwen-agent/web dev` 可启动 web，页面引用 `@qianwen-agent/shared` 类型。
- 详细讨论记录在 `discuss/`。

## 重要决策

- 采用 pnpm workspace monorepo。
- Web 使用 React。
- 移动端使用 React Native。
- Server 使用 Node.js / TypeScript。
- Agent Runtime 拆到 `packages/agent-runtime`，被 `apps/server` import，MVP 不单独部署。
- Observability 拆到 `packages/observability`，提供 trace/metrics 类型和接口；Server 负责 Prisma 落库适配。
- 数据库 MVP 使用 Prisma + SQLite，Stage 1 开始接入。
- 流式通信使用 `POST /api/chat/stream` + fetch ReadableStream + SSE-like parser。
- 深度思考优先使用千问 provider 的 `enable_thinking`。
- 联网搜索优先使用千问 provider 的 `enable_search`。
- 图片 MVP 存本地 uploads，调用模型时临时转 base64 data URL。
- 可观测 MVP 只做 run trace、性能指标和 token usage，不做产品运营大盘。

## 下次优先阅读

1. `AGENTS.md`
2. `README.md`
3. `docs/roadmap.md`
4. `docs/status.md`

需要追溯背景时再读：

- `discuss/product-capability-scope.md`
- `discuss/agent-implementation-plan.md`
- `discuss/server-implementation-plan.md`
- `discuss/frontend-implementation-plan.md`
- `discuss/observability-implementation-plan.md`

## 下一步建议

1. 接入 Prisma + SQLite。
2. 建立 conversations/messages 基础表。
3. 实现 `POST /api/chat/stream`。
4. 实现 QwenProvider 普通文本调用。
5. Server 保存 user / assistant message。
6. Web 渲染流式回答和历史消息。

## 阻塞项

暂无。
