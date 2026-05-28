# Handoff

本文用于跨轮次交接。每次完成一段较大的实现、暂停开发或切换任务前更新。

## 当前目标

准备进入 Stage 4：联网搜索。

## 当前状态

- Stage 0 已完成：pnpm workspace、apps/packages 骨架、shared 协议、server health、web 最小页面。
- `pnpm install` 已生成依赖和 lockfile。
- `pnpm typecheck` 已通过。
- `pnpm --filter @qianwen-agent/server start` 可启动 server，`GET /health` 返回 ok。
- `pnpm --filter @qianwen-agent/web dev` 可启动 web，页面引用 `@qianwen-agent/shared` 类型。
- Stage 1 已完成：Prisma + SQLite、conversation/message 表、conversation API、`POST /api/chat/stream`、QwenProvider、Web 聊天 UI。
- 已用真实 `DASHSCOPE_API_KEY` 验证 Qwen OpenAI-compatible stream，能输出连续 `answer_delta` 和 `done`，并保存 assistant message。
- 无 key 时 `POST /api/chat/stream` 会保存 user message，并返回带 `conversationId` 的 error event，便于前端恢复已保存会话。
- Stage 2 已完成：Server 会为每次聊天创建 run trace，记录事件 timeline、TTFE、TTFA、TTC、provider latency 和 Qwen token usage。
- 已实现 `GET /debug/runs` 和 `GET /debug/runs/:runId`，Web 有 Chat / Debug 视图切换，可查看 run 列表、timeline、耗时和 usage。
- 已用真实 Qwen stream 验证 `stream_options.include_usage`，`done` event 和 `model_usages` 都能拿到 token usage。
- Stage 3 已完成：Web 支持 Fast / Deep 模式切换，Server / Agent Runtime 支持 `enable_thinking` 和 `thinking_budget`。
- 已用真实 Qwen deep stream 验证 `reasoning_delta`、`answer_delta`、TTFR、reasoning tokens 和刷新后恢复 `reasoningContent`。
- 详细讨论记录在 `discuss/`。

## 重要决策

- 采用 pnpm workspace monorepo。
- Web 使用 React。
- 移动端使用 React Native。
- Server 使用 Node.js / TypeScript。
- Agent Runtime 拆到 `packages/agent-runtime`，被 `apps/server` import，MVP 不单独部署。
- Observability 拆到 `packages/observability`，提供 trace/metrics 类型和接口；Server 负责 Prisma 落库适配。
- Stage 2 不引入 TraceSink / OpenTelemetry，直接在 Server 用 Prisma 写 run trace，等出现第二种存储再抽象。
- 数据库 MVP 使用 Prisma + SQLite，Stage 1 已接入。
- 流式通信使用 `POST /api/chat/stream` + fetch ReadableStream + SSE-like parser。
- 深度思考优先使用千问 provider 的 `enable_thinking`。
- 深度思考内容保存到 assistant message 的 `reasoningContent`，不单独建 thinking 表。
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

1. 创建 Stage 4 solution：联网搜索。
2. 明确 `search: auto | off | force` 的默认行为。
3. 接入 Qwen `enable_search` / `search_options`。
4. 增加搜索状态事件、来源展示和 Debug 搜索配置记录。

## 阻塞项

暂无。
