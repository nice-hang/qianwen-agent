# Handoff

本文用于跨轮次交接。每次完成一段较大的实现、暂停开发或切换任务前更新。

## 当前目标

正在实现 Stage 8：React Native 移动端，目标是 Android 和 iOS 都能跑起来。

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
- 后续阶段已重新规划：Stage 6 先做 Agent Runtime 简化与极简 tool register，Stage 7 做 Agent Trace 监控，Stage 8 做 React Native，Stage 9 做同一会话摘要，Stage 10 再做图片理解。
- Stage 6 已完成：`runAgent` 已直接切换为 callback 版本，旧 async iterable 入口已删除；Server 改为通过 `onEvent` 接收 runtime 事件。
- Stage 6 已新增极简 tool register，`web_search` / `web_fetch` 在工具侧声明 definition、execute、summarize 和 toEvents。
- Stage 6 已新增 `provider_request` / `provider_response` debug 事件，Server 只落 trace，不转发给主聊天 Web。
- Stage 7 Agent Trace Viewer 第一版已实现：Debug Run Detail 可查看 provider request messages/tools/diff/raw JSON，以及工具调用 input/output/耗时。
- Stage 8 RN 实现时，默认用户本机已有 Android / iOS 开发环境；先检测并复用已有 Android Studio / SDK / emulator、Xcode / iOS Simulator / CocoaPods 或 Expo 工具，不要默认重装工具链。
- Stage 8 RN 视觉参考 `screenshot/mobile`：只参考主聊天、侧边栏、composer、思考/搜索状态；不参考顶部系统状态栏/header 交互，不实现截图中尚未支持的功能入口。
- Stage 8 RN 已实现 Expo 入口、主聊天 UI、会话侧栏、composer、shared API client 接入、Expo fetch streaming、SSE-like 事件合并、深度思考折叠卡片、搜索来源 bottom sheet 和轻量 Markdown 渲染。
- Stage 8 RN 已补 `apps/mobile/index.ts` 使用 `registerRootComponent(App)`，避免 pnpm workspace 下 `expo/AppEntry` 解析 `../../App` 失败。
- Stage 8 RN 已确认 iOS 环境可用：Xcode 16.0，iPhone 16 Simulator 可启动，Expo iOS bundle 成功并完成页面截图。
- Stage 8 RN 已确认 Android SDK / adb / emulator / system-images 存在，但当前没有连接设备，也没有 AVD；Android 真机/模拟器聊天验证还未完成。
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
- Agent Loop 参考 `/Users/bytedance/Documents/github/pi-mono/packages/agent` 的 emit/context/tool 执行设计，但只保留当前需要的 callback emit、极简 tool register、prepare/execute/finalize；不引入 Runtime class、turn、steering、followUp、LangGraph、MCP、插件系统或复杂生命周期。
- Stage 7 做类似 claude-tap 的 Agent Trace 监控，重点能看到每轮 provider request 的 messages/tools、工具调用前后、相邻 request diff。
- 轻量长期记忆暂缓；同一会话摘要顺延到 Stage 9，复用 `conversations.summary`，解决长会话上下文压力。
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
6. `docs/solutions/0009-agent-trace-monitoring.md`
7. `docs/solutions/0010-react-native-client.md`

需要追溯背景时再读：

- `discuss/product-capability-scope.md`
- `discuss/agent-implementation-plan.md`
- `discuss/server-implementation-plan.md`
- `discuss/frontend-implementation-plan.md`
- `discuss/observability-implementation-plan.md`

## 下一步建议

1. 用真实搜索 run 验证 Agent Trace Viewer 的 request1 -> tool call -> request2 -> final answer 链路。
2. 校准真实搜索行为和 Tavily 中文搜索质量。
3. Stage 8 继续补 Android AVD/真机验证，并在 iOS 上完成一轮真实聊天验证；Stage 9 做同一会话摘要，Stage 10 再做图片理解。

## 阻塞项

- Android 当前没有 AVD 或连接设备，需创建一个 AVD 或连接真机后继续验证。
