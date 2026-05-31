# Status

本文记录当前实现状态。每完成一个阶段或一个可独立验证的功能切片后更新。

## 当前阶段

Stage 7: Agent Trace 监控

## 已完成

- [x] 讨论并确定 MVP 产品范围
- [x] 讨论并确定 Agent / Server / UI / Observability 宏观方案
- [x] 编写 `README.md`
- [x] 编写 `AGENTS.md`
- [x] 编写 `docs/roadmap.md`
- [x] 完成 Stage 0 monorepo workspace 初始化
- [x] 创建 `apps/web`、`apps/mobile`、`apps/server`
- [x] 创建 `packages/shared`、`packages/agent-runtime`、`packages/observability`
- [x] 定义基础 shared 类型、AgentEvent、SSE-like parser 和 API client
- [x] Server 实现 `/health` 并验证能 import agent-runtime / observability
- [x] Web 最小页面能启动并引用 shared 类型
- [x] 完成 Stage 1 Prisma + SQLite 接入
- [x] 建立 conversations/messages 基础表和 migration
- [x] 实现 conversations/messages API
- [x] 实现 `POST /api/chat/stream`
- [x] 实现 Qwen OpenAI-compatible 普通文本流式 provider
- [x] Web 实现会话列表、聊天消息、composer 和流式回答展示
- [x] 完成 Stage 2 Run Trace 与 Debug
- [x] 建立 `agent_runs`、`agent_events`、`model_usages`
- [x] 记录 TTFE / TTFA / TTC 和 provider latency
- [x] 保存 Qwen streaming usage
- [x] 实现 `/debug/runs` 和 `/debug/runs/:runId`
- [x] Web 实现 Debug 视图、run 列表、timeline、耗时和 usage 展示
- [x] 完成 Stage 3 深度思考
- [x] `POST /api/chat/stream` 支持 `mode: fast | deep`
- [x] Agent Runtime 支持 Qwen `enable_thinking`，deep mode 不再显式传 `thinking_budget`
- [x] 解析并流式输出 `reasoning_delta`
- [x] Server 保存 assistant `reasoningContent`
- [x] Debug 记录并展示 TTFR 和 reasoning tokens
- [x] Web 支持 Fast / Deep 模式切换和思考内容展示
- [x] 完成 Stage 3.5 Web UI 千问风格优化
- [x] 使用用户本机登录态采集国内版千问参考截图
- [x] Web 主聊天体验调整为浅色侧栏、中央内容列、底部圆角 composer 和千问风格消息展示
- [x] 隐藏未实现能力入口，Debug 弱化为开发入口
- [x] 采集 desktop、mobile、空会话和思考 composer 状态截图
- [x] 完成 Stage 4 前端 Markdown 区块渲染优化
- [x] 接入 `react-markdown` 和 `remark-gfm`
- [x] Web assistant content 和 reasoningContent 均使用 MarkdownRenderer
- [x] 支持标题、列表、引用、链接、表格、inline code 和 fenced code block 自定义渲染
- [x] CodeBlock 支持语言标签、复制和横向滚动，TableBlock 支持外层横向滚动
- [x] 完成 Stage 5 Agent Loop 与联网搜索基础实现
- [x] Qwen provider 支持 tool calling stream
- [x] 接入 `web_search` / `web_fetch` 内置工具和 sources 持久化
- [x] Web 支持搜索状态、来源 chip 和右侧来源 drawer
- [x] 完成 Stage 6 Agent Runtime 简化与 Tool Register
- [x] `runAgent` 已切换为 callback 版本，旧 `AsyncIterable` 入口已删除
- [x] 新增极简 tool register，`web_search` / `web_fetch` 通过 register 暴露 definition 与 execute
- [x] Runtime 通过 `provider_request` / `provider_response` 输出每轮 messages/tools 快照供 trace 使用
- [x] 完成 Agent Trace Viewer 第一版
- [x] Debug Run Detail 可查看每轮 provider request 的 messages、tools、diff 和 raw JSON
- [x] Debug Run Detail 可查看工具调用 input、output 和耗时

## 进行中

- [x] 已重新规划 Stage 6-10
- [ ] 待真实 `TAVILY_API_KEY` 环境下校准模型是否按预期自动搜索

## 未开始

- [ ] 真实联网搜索效果校准
- [ ] 会话摘要
- [ ] 图片理解

## 进行中

- [ ] React Native 移动端：核心 UI、shared API client、Expo fetch streaming、事件合并、基础 Markdown、深度思考和搜索来源入口已实现；iOS 已启动并截图，Android 因无 AVD/真机尚未完成本地聊天验证。

## 已知风险

- RN 的 fetch streaming 兼容性还需要在真实聊天流里验证；当前移动端优先使用 `expo/fetch`，并为无 `ReadableStream` 的环境保留 text fallback。
- Stage 5 已决定不优先走 Qwen OpenAI-compatible `enable_search` 作为产品主路径，因为其不稳定返回结构化 sources；先建设自建工具 loop。
- 已用真实 Qwen deep stream 验证 `reasoning_content`、TTFR 和 reasoning tokens。
- Agent Trace Viewer 第一版已基于现有 `agent_events` raw payload 实现；后续还需要用真实搜索 run 验证 request1 -> tool -> request2 的完整链路展示。
- Stage 8 RN 默认复用用户本机已有 Android / iOS 环境；已确认 Xcode 16.0 / iOS Simulator 可用，Android SDK / adb / emulator / system-images 存在，但当前没有 AVD 或连接设备。
- 轻量长期记忆暂缓；会话摘要顺延到 Stage 9。
- 本地图片上传转 base64 data URL 需要控制大小，避免超过 provider 限制，已顺延到 RN 之后。
- 已用真实 `DASHSCOPE_API_KEY` 验证 Stage 1 Qwen OpenAI-compatible 流式调用；本地 `.env` 已被 gitignore。

## 下一步

1. 用真实搜索 run 验证 Agent Trace Viewer 的 request/tool/request 链路展示。
2. 校准真实搜索行为：普通知识问题不搜索、时效问题会搜索。
3. Stage 8 继续完成 Android AVD/真机验证和 iOS 真实聊天一轮验证；Stage 9 做会话摘要，Stage 10 再做图片理解。
