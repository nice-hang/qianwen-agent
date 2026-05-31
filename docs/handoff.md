# Handoff

本文用于跨轮次交接。每次完成一段较大的实现、暂停开发或切换任务前更新。

## 当前目标

准备进入 Stage 6：Agent Runtime 简化与 Tool Register。

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
- Stage 3 已完成：Web 支持 Fast / Deep 模式切换，Server / Agent Runtime 支持 `enable_thinking`；当前 deep mode 不再显式传 `thinking_budget`。
- 已用真实 Qwen deep stream 验证 `reasoning_delta`、`answer_delta`、TTFR、reasoning tokens 和刷新后恢复 `reasoningContent`。
- Stage 3.5 已完成：参考国内版千问 `https://www.qianwen.com/` 登录态界面优化当前 Web UI。
- Stage 3.5 已隐藏未实现能力入口，只展示当前真实可用能力。
- Stage 3.5 已采集参考截图和本地 desktop/mobile、空会话、思考 composer 状态截图。
- 已调研国内版千问真实会话结构：普通内容以 Markdown string 为主，Markdown 不适合表达的业务块通过 `[(source_seq)]` marker 关联 `multi_load` sidecar 数据。
- Stage 4 已完成：前端 Markdown 区块渲染优化，不改 Qwen system prompt，不改消息存储结构。
- Stage 4 已接入 `react-markdown` 和 `remark-gfm`，assistant content 和 reasoningContent 均使用 MarkdownRenderer。
- Stage 4 已实现 CodeBlock、TableBlock、inline code、heading、list、blockquote、link、hr 等渲染样式。
- Stage 5 方案已确定：先做轻量 Agent Loop，再接自建 `web_search` / `web_fetch` 工具；不优先用 Qwen OpenAI-compatible `enable_search` 做产品主路径。
- Stage 5 Agent Loop 基础改造已实现：Qwen tool-call stream、内置工具表、sources 持久化、Web 来源 chip / drawer 均已接入。
- `web_search` 第一版使用 `TAVILY_API_KEY` 调 Tavily；未配置时返回空 sources 和明确 note，loop 仍可继续。
- 后续阶段已重新规划：Stage 6 先做 Agent Runtime 简化与极简 tool register，Stage 7 做同一会话摘要，Stage 8 做 React Native，Stage 9 再做图片理解。
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
- MarkdownRenderer 使用 Markdown 原生能力渲染标题、列表、代码块、表格、引用和链接。
- Stage 5 不优先使用千问 provider 的 `enable_search` 作为产品主路径，因为 OpenAI-compatible Chat Completions 无法稳定返回结构化 sources。
- 是否搜索由模型通过 tool calling 自主决定，不由前端传 search 开关，也不由 runtime 关键词规则决定。
- Agent Loop 第一版已跑通，但 Stage 6 需要继续简化运行时边界：减少分散 `yield`，让 Agent 内部闭环，通过 callback 输出稳定 shared `AgentEvent`。
- Tool register 参考 pi-mono 的注册表思想，但保持极简：不引入 Runtime class、LangGraph、MCP、插件系统或复杂生命周期。
- 轻量长期记忆暂缓；下一步更优先做同一会话摘要，复用 `conversations.summary`，解决长会话上下文压力。
- 图片理解后续走 multimodal input / provider message projection，不作为工具扩展示例，并顺延到 RN 之后。
- 搜索来源第一版直接持久化到 assistant message 的 `sourcesJson`，不先建 `message_sources` 表。
- Web UI 优化参考国内版千问，不直接复制商标、官方图形资源或未实现能力入口。
- 图片 MVP 存本地 uploads，调用模型时临时转 base64 data URL。
- 可观测 MVP 只做 run trace、性能指标和 token usage，不做产品运营大盘。

## 下次优先阅读

1. `AGENTS.md`
2. `README.md`
3. `docs/roadmap.md`
4. `docs/status.md`
5. `docs/solutions/0008-runtime-callback-tool-register.md`

需要追溯背景时再读：

- `discuss/product-capability-scope.md`
- `discuss/agent-implementation-plan.md`
- `discuss/server-implementation-plan.md`
- `discuss/frontend-implementation-plan.md`
- `discuss/observability-implementation-plan.md`

## 下一步建议

1. 实现 `docs/solutions/0008-runtime-callback-tool-register.md`：callback 版 `runAgent` + 极简 tool register。
2. 保持现有聊天、深度思考、搜索来源展示行为不变，并跑 agent-runtime / 全仓 typecheck。
3. Stage 6 完成后继续校准真实搜索行为和 Tavily 中文搜索质量。
4. Stage 7 做同一会话摘要，Stage 8 做 RN，Stage 9 再做图片理解。

## 阻塞项

暂无。
