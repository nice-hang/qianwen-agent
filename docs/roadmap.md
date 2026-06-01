# Roadmap

本项目按端到端能力切片渐进式实现，不按“前端/后端/Agent 各自做完再集成”的方式推进。

每个阶段都尽量打通：

```txt
UI -> Server -> Agent -> Qwen -> DB -> Stream -> UI
```

## Stage 0: Monorepo 骨架与共享协议

目标：建立项目骨架，让 UI、Server、Agent 能使用同一套类型和协议。

- [x] 初始化 monorepo
- [x] 创建 `apps/web`
- [x] 创建 `apps/mobile`
- [x] 创建 `apps/server`
- [x] 创建 `packages/shared`
- [x] 创建 `packages/agent-runtime`
- [x] 创建 `packages/observability`
- [x] 在 `apps/server/src/adapters` 建立 Agent/Observability 适配器目录
- [x] 定义基础类型：Message、Conversation、Attachment、AgentEvent
- [x] 定义 SSE-like stream parser 初版
- [x] 定义基础 API client

验收：

- [x] Web 能启动
- [x] Server health check 能访问
- [x] shared 类型能被 Web 和 Server 引用
- [x] `apps/server` 能 import `packages/agent-runtime` 和 `packages/observability`

## Stage 1: 最小聊天闭环

目标：打通最小文本聊天链路。

- [x] 接入 Prisma + SQLite
- [x] 建立 conversations/messages 基础表
- [x] 实现 `POST /api/chat/stream`
- [x] 实现 QwenProvider 普通文本调用
- [x] Server 保存 user message
- [x] Server 流式返回 `answer_delta`
- [x] Server 保存 assistant message
- [x] Web 渲染流式回答
- [x] Web 支持历史消息展示

验收：

- [x] 用户能创建/进入会话
- [x] 用户能发送文本消息
- [x] 回答能流式展示
- [x] 刷新页面后能恢复历史消息

## Stage 2: Run Trace 与 Debug

目标：尽早具备调试可观测能力，方便后续调 Agent。

- [x] 建立 `agent_runs`
- [x] 建立 `agent_events`
- [x] 建立 `model_usages`
- [x] 记录 TTFE / TTFA / TTC
- [x] 记录 provider latency
- [x] 保存 Qwen usage
- [x] 实现 `/debug/runs`
- [x] 实现 `/debug/runs/:id`
- [x] Web 展示 run 列表和详情 timeline

验收：

- [x] 每次回答都有 run trace
- [x] 能看到事件时间线
- [x] 能看到 token usage
- [x] 失败/中断能定位到 run

## Stage 3: 深度思考

目标：接入千问 thinking 能力，并在前端展示产品化思考过程。

- [x] 支持 `mode: fast | deep`
- [x] deep mode 开启 `enable_thinking`
- [x] 移除前端 `thinkingBudget` 透传，deep mode 不再显式传 `thinking_budget`
- [x] 解析 `reasoning_content`
- [x] 输出 `reasoning_delta`
- [x] Web 展示深度思考卡片
- [x] Debug 中记录 TTFR 和 reasoning tokens

验收：

- [x] 快速/深度模式可切换
- [x] deep 模式能看到思考内容
- [x] 最终答案和思考区域分区展示
- [x] Debug 能看到 TTFR / reasoning token

## Stage 3.5: Web UI 千问风格优化

目标：在继续增加能力前，先把 Web 聊天主体验优化到接近国内版千问 Web 端的视觉和交互质感。

- [x] 采集国内版千问登录态参考截图
- [x] 采集当前本地 Web 对应状态截图
- [x] 明确空会话、输入聚焦、普通回答、思考模式、流式中、完成态、移动端等状态基线
- [x] 隐藏当前尚未实现的功能入口
- [x] 优化聊天首页、会话侧栏、消息气泡、composer、思考内容展示
- [x] 保留 Debug 能力，但弱化为开发入口，不干扰主聊天体验
- [x] 用 Playwright 截图做视觉回归验证

验收：

- [x] 主聊天体验接近 `https://www.qianwen.com/` 国内版千问风格
- [x] UI 只展示当前真实可用能力
- [x] 不出现联网搜索、图片理解、记忆等未实现入口
- [x] Desktop 和移动端 viewport 截图无明显布局错位
- [x] 关键状态截图可用于后续视觉回归

## Stage 4: 前端 Markdown 区块渲染优化

目标：把 assistant 的纯文本展示升级为 Markdown-first 的区块渲染，贴近真实 Chatbox 的内容呈现能力。

- [x] 接入 React Markdown 渲染链路
- [x] 支持 GFM：表格、删除线、task list 等
- [x] 自定义标题、段落、列表、引用、分割线、链接样式
- [x] 自定义 inline code 和 fenced code block 渲染
- [x] CodeBlock 支持语言标签、复制、横向滚动和长代码不撑破布局
- [x] TableBlock 支持外层横向滚动和移动端适配
- [x] ThinkingBlock 内部也走 MarkdownRenderer
- [x] 流式输出时未闭合 Markdown 也能保持可读

验收：

- [x] assistant 内容中的标题、列表、代码块、表格、链接能正确渲染
- [x] reasoningContent 和 content 分别作为思考区和回答区渲染
- [x] 代码块有语言标签和复制按钮
- [x] 表格不会撑破消息列或移动端 viewport
- [x] 不改 Qwen system prompt，不改消息存储结构

## Stage 5: Agent Loop 与联网搜索

目标：先把 Agent Runtime 升级为模型可自主调用工具的轻量 agent loop，再接入自建联网搜索工具。

- [x] Agent Runtime 支持轻量 agent loop
- [x] Qwen provider 支持 tool calling stream
- [x] 新增工具事件协议
- [x] 新增 `web_search` 工具
- [x] 新增 `web_fetch` 工具
- [x] 模型自主决定是否搜索
- [x] 输出搜索过程事件
- [x] Web 展示搜索状态和来源 chip
- [x] Web 支持来源右侧栏
- [x] assistant message 持久化 `sourcesJson`
- [x] Debug 记录工具调用、搜索 query、来源和耗时

验收：

- [x] UI 不需要搜索开关，模型能自动判断是否搜索
- [x] 搜索状态能在前端展示
- [x] 有来源时能展示来源数量和列表
- [x] 刷新页面后来源 chip 和来源列表仍可恢复
- [ ] 普通知识问题不搜索，时效问题会搜索
- [x] 工具调用完成后才开始输出最终 answer token

## Stage 6: Agent Runtime 简化与 Tool Register

目标：在继续叠加新能力前，先收敛 Stage 5 的 agent loop 实现边界，让 Agent 内部闭环更清晰，Server/Web 只接收稳定回调事件。

- [x] 参考 `pi-mono/packages/agent` 的设计，只吸收 emit 边界、context transform、tool prepare/execute/finalize 等当前需要的部分
- [x] 不引入 `Agent` class、turn、steering、followUp、parallel tool execution 等当前不需要的概念
- [x] 将 `runAgent` 从 `AsyncIterable` 生成器改为 callback 版本，旧生成器入口直接删除
- [x] Server 不再依赖 Agent loop 内部循环细节，只处理稳定 `onEvent` 输出
- [x] 减少 runtime 内部分散 `yield`，统一由一个 emit 边界输出 shared `AgentEvent`
- [x] 增加极简 `tool register`，参考 pi-mono 的注册表思想，但不引入插件系统、class 或复杂生命周期
- [x] `web_search` / `web_fetch` 通过 register 暴露 definition 与 execute
- [x] 将工具调用整理为 prepare / execute / finalize 三步，明确未知工具、参数解析、结果摘要、搜索 sources 提取的单一位置
- [x] Provider 请求前统一生成可观测快照：本轮 messages、tools、model、mode
- [x] 更新 Debug/trace 仍能记录工具事件

验收：

- [ ] 现有聊天、深度思考、搜索来源展示行为不变
- [x] `apps/server` 不需要理解 tool iteration、provider tool call delta 聚合等 runtime 内部细节
- [x] `agent-runtime` 内部工具注册/查找/执行路径清晰，新增一个工具只需改一处注册表
- [x] 工具事件、搜索 sources、最终 `done` 仍完整到达 Server 和 Web
- [x] trace 中能拿到每次 provider 请求的 messages 和 tools 快照
- [x] `pnpm --filter @qianwen-agent/agent-runtime typecheck` 和 `pnpm typecheck` 通过

## Stage 7: Agent Trace 监控

目标：在 Stage 6 收敛 runtime 边界后，补一个类似 `claude-tap` 的本地 Agent 执行监控视图，能看到一次对话的完整模型请求、工具调用和响应过程。

- [ ] 设计 trace 数据结构，记录每轮 provider request / response / stream summary
- [ ] 记录每轮传给模型的 `messages`
- [ ] 记录每轮传给模型的 `tools`
- [ ] 记录 tool call 前的名称、参数、来源 provider message
- [ ] 记录 tool call 后的结果摘要、耗时、错误状态
- [ ] 记录工具结果进入下一轮模型请求前的 provider messages 变化
- [x] Debug 页面升级为 Agent Trace Viewer：run 列表、请求列表、messages/tools/detail 面板
- [x] 支持相邻 provider request 的简单 diff，优先看 messages/tools 增量
- [ ] 对 API key、Authorization 等敏感信息做脱敏，不记录原始 provider key

验收：

- [x] 任意一次聊天 run 都能看到完整执行链路
- [ ] 搜索问题能看到 first model request、tool call、tool result、second model request、final answer
- [x] 能展开查看每轮 provider request 的 messages 和 tools
- [x] 能看到工具调用前后状态和耗时
- [x] 监控只作为本地调试能力，不影响主聊天体验

## Stage 8: React Native 移动端

目标：在 Web 协议稳定后接入移动端，并确保 Android 和 iOS 都能实际跑起来。

- [x] 实现 RN Chat UI
- [x] 配置 Android 本地运行链路
- [x] 配置 iOS 本地运行链路
- [x] 参考 `screenshot/mobile` 还原移动端主聊天体验，隐藏未实现功能入口
- [x] 接入 shared API client
- [x] 适配 POST stream transport
- [x] 实现会话列表/抽屉
- [x] 实现深度思考卡片
- [x] 展示 Markdown 回答的基础文本、列表、代码和链接
- [x] 展示搜索状态和来源入口

验收：

- [ ] 移动端能多轮聊天
- [ ] 移动端能流式展示回答
- [ ] 移动端能展示深度思考
- [ ] 移动端能展示搜索来源
- [ ] Android 能本地启动并完成一轮聊天
- [ ] iOS 能本地启动并完成一轮聊天

## Stage 9: 图片理解

目标：在 Web、Server、Agent Runtime 和 RN 基础链路稳定后，打通本地图片上传和千问视觉理解链路。

- [x] 建立 attachments 表
- [x] 实现图片上传接口
- [x] 图片保存到 `apps/server/uploads/images`
- [x] Web composer 展示图片缩略图
- [x] RN 适配图片选择和上传
- [x] 发消息时携带 `attachmentIds`
- [x] Server 调模型前临时转 base64 data URL 或可访问 URL
- [x] QwenProvider 支持 multimodal input
- [x] 历史消息展示图片

验收：

- [x] 用户能上传图片
- [x] 用户能发送图文混合消息
- [ ] 模型能基于图片回答
- [x] Web 和 RN 历史消息能恢复图片展示

## Stage 10: 本地文件 RAG

目标：在现有 attachment、Agent Runtime 和 trace 基础上，打通本地文件上传、解析、chunk、embedding、LanceDB 检索和文件引用回答能力。第一版只做会话内文件 RAG，不做全局知识库。

- [ ] 扩展 attachment 支持通用文件，保留图片上传链路
- [ ] 新增 `POST /api/attachments/files`
- [ ] 文件保存到 `apps/server/uploads/files`
- [ ] 支持 `.txt` / `.md` / `.csv` / `.pdf` / `.docx` 解析
- [ ] 实现文本 chunker，控制 chunk size、overlap 和注入字符上限
- [ ] 接入 Qwen embedding，新增 embedding model 配置
- [ ] 使用 LanceDB 本地持久化 chunks、embedding 和 metadata
- [ ] 聊天前按 conversationId / attachmentId 做 topK 检索
- [ ] ContextBuilder 注入 retrieved file context
- [ ] Web composer 展示文件 chip、上传状态和解析状态
- [ ] Web 回答展示文件引用来源
- [ ] Debug 记录文件解析、embedding、检索、命中 chunk 和上下文注入事件

验收：

- [ ] 用户能上传文件并看到解析状态
- [ ] 文件 ready 后，同一会话内提问能基于文件内容回答
- [ ] 另一个会话不会检索到当前会话的文件
- [ ] 回答能展示引用的文件名和片段来源
- [ ] 解析失败不影响普通聊天链路
- [ ] trace 能看到 RAG 检索 query、命中 chunk、score、注入字符数和耗时

## Stage 11: 会话摘要

目标：在文件 RAG 之后，补同一会话内的轻量摘要，降低长对话上下文压力；暂不做跨会话长期记忆。

- [ ] 使用现有 `conversations.summary` 字段保存会话摘要
- [ ] 设计摘要触发策略：消息数、token 估算或回答完成后异步更新
- [ ] ContextBuilder 在长会话中注入 summary + recent messages
- [ ] 摘要生成走 Agent Runtime 内部能力，不暴露给 Web 控制
- [ ] Debug 中记录摘要生成/更新事件
- [ ] Web 可在会话列表或调试页展示摘要状态，主聊天不增加复杂入口

验收：

- [ ] 长会话刷新后仍能使用已有摘要构造上下文
- [ ] 最近几轮原文不被摘要替代，避免短期指代丢失
- [ ] 摘要失败不影响主回答链路
- [ ] 不建立 `memories` 表，不实现 `memory_write` / `memory_delete`
