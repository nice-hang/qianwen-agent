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

## Stage 4: 联网搜索

目标：优先使用千问 provider 内置搜索能力。

- [ ] 支持 `search: auto | off | force`
- [ ] 接入 `enable_search`
- [ ] 接入 `search_options`
- [ ] 输出搜索过程事件
- [ ] 如果 provider 返回来源，展示来源列表
- [ ] Debug 记录 search 配置和搜索相关 usage

验收：

- [ ] 用户能开启/关闭联网搜索
- [ ] 搜索状态能在前端展示
- [ ] 有来源时能展示来源数量和列表

## Stage 5: 图片理解

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

## Stage 6: 轻量记忆

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

## Stage 7: React Native 移动端

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
