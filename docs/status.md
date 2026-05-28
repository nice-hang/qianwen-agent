# Status

本文记录当前实现状态。每完成一个阶段或一个可独立验证的功能切片后更新。

## 当前阶段

Stage 4: 联网搜索

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
- [x] `POST /api/chat/stream` 支持 `mode: fast | deep` 和 `thinkingBudget`
- [x] Agent Runtime 支持 Qwen `enable_thinking` / `thinking_budget`
- [x] 解析并流式输出 `reasoning_delta`
- [x] Server 保存 assistant `reasoningContent`
- [x] Debug 记录并展示 TTFR 和 reasoning tokens
- [x] Web 支持 Fast / Deep 模式切换和思考内容展示

## 进行中

- [ ] 准备开始 Stage 4 联网搜索

## 未开始

- [ ] 联网搜索
- [ ] 图片理解
- [ ] 轻量记忆

## 已知风险

- RN 的 fetch streaming 兼容性需要实际验证。
- 千问 provider 的 `enable_search` 和搜索来源返回格式需要在真实 API 调用中校准。
- 已用真实 Qwen deep stream 验证 `reasoning_content`、TTFR 和 reasoning tokens。
- 本地图片上传转 base64 data URL 需要控制大小，避免超过 provider 限制。
- 已用真实 `DASHSCOPE_API_KEY` 验证 Stage 1 Qwen OpenAI-compatible 流式调用；本地 `.env` 已被 gitignore。

## 下一步

1. 编写 Stage 4 联网搜索方案。
2. 在请求协议中加入 `search: auto | off | force`。
3. 调研并接入 Qwen `enable_search` / `search_options`。
4. Web 展示搜索状态和来源，Debug 记录搜索配置与相关 usage。
