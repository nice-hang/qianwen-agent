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
- [x] 配置 `thinking_budget`
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

## Stage 6: 图片理解

目标：打通本地图片上传和千问视觉理解链路。

- [ ] 建立 attachments 表
- [ ] 实现图片上传接口
- [ ] 图片保存到 `apps/server/uploads/images`
- [ ] Web composer 展示图片缩略图
- [ ] 发消息时携带 `attachmentIds`
- [ ] Server 调模型前临时转 base64 data URL
- [ ] QwenProvider 支持 multimodal input
- [ ] 历史消息展示图片

验收：

- [ ] 用户能上传图片
- [ ] 用户能发送图文混合消息
- [ ] 模型能基于图片回答
- [ ] 历史消息能恢复图片展示

## Stage 7: 轻量记忆

目标：实现显式长期记忆。

- [ ] 建立 memories 表
- [ ] 实现 `memory_write`
- [ ] 实现 `memory_delete`
- [ ] ContextBuilder 注入 active memories
- [ ] Web 实现 Memory Panel

验收：

- [ ] 用户能要求系统记住一条偏好/项目事实
- [ ] 新会话能使用已记忆内容
- [ ] 用户能查看和删除记忆

## Stage 8: React Native 移动端

目标：在 Web 协议稳定后接入移动端。

- [ ] 实现 RN Chat UI
- [ ] 接入 shared API client
- [ ] 适配 POST stream transport
- [ ] 实现会话列表/抽屉
- [ ] 实现图片选择和上传
- [ ] 实现深度思考卡片

验收：

- [ ] 移动端能多轮聊天
- [ ] 移动端能流式展示回答
- [ ] 移动端能上传图片
- [ ] 移动端能展示深度思考
