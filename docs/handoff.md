# Handoff

本文用于跨轮次交接。每次完成一段较大的实现、暂停开发或切换任务前更新。

## 当前目标

准备进入 Stage 0：Monorepo 骨架与共享协议。

## 当前状态

- 仓库目前主要是规划文档。
- 已有 `README.md` 作为宏观方案。
- 已有 `AGENTS.md` 作为 coding agent 短入口。
- 已有 `docs/roadmap.md` 和 `docs/status.md`。
- 详细讨论记录在 `discuss/`。

## 重要决策

- 采用 monorepo。
- Web 使用 React。
- 移动端使用 React Native。
- Server 使用 Node.js / TypeScript。
- Agent Runtime 拆到 `packages/agent-runtime`，被 `apps/server` import，MVP 不单独部署。
- Observability 拆到 `packages/observability`，提供 trace/metrics 类型和接口；Server 负责 Prisma 落库适配。
- 数据库 MVP 使用 Prisma + SQLite。
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

1. 初始化包管理和 workspace。
2. 创建 monorepo 目录结构。
3. 建立 shared types。
4. 建立 `packages/agent-runtime` 空包和导出入口。
5. 建立 `packages/observability` 空包和导出入口。
6. 建立 server health check。
7. 建立 web 首页。
8. 更新 `docs/status.md`。

## 阻塞项

暂无。
