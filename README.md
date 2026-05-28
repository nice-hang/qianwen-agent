# Qianwen Agent Chatbox

千问类跨端 Chatbox demo。项目采用 monorepo 组织，包含 Web、React Native、Server、Agent Runtime 和调试可观测能力。

MVP 目标：

- 多轮聊天
- 流式输出
- 深度思考
- 联网搜索
- 图片理解
- 轻量记忆
- Run trace 调试面板

MVP 暂不做：

- 完整 RAG 知识库
- MCP / Skill / Subagent
- LangGraph 固定编排
- 生图/视频
- 完整账号体系
- 产品运营大盘

## 架构分层

```txt
UI
  React Web / React Native

Server
  API / 会话 / 消息 / 附件 / 流式网关 / 持久化

Agent
  ContextBuilder / QwenProvider / ThoughtPresenter / ToolRegistry / MemoryManager

Observability
  Run trace / Agent events / Latency / Token usage / Debug UI
```

核心链路：

```txt
UI
  -> POST /api/chat/stream
Server
  -> 保存 user message
  -> 创建 agent_run
Agent
  -> 构造上下文
  -> 调 Qwen API
  -> 输出 AgentEvent
Server
  -> 流式转发
  -> 保存 assistant message / usage / trace
UI
  -> 渲染深度思考、来源、最终回答
```

## Monorepo 目录结构

```txt
qianwen-agent/
  apps/
    web/                    # React Web Chatbox
    mobile/                 # React Native App
    server/                 # Node.js Server，包含 API + Agent Runtime

  packages/
    shared/                 # 前后端共享类型、协议、stream parser
    ui/                     # 可选：跨端可复用的轻 UI/主题 token

  docs/
    product/                # 稳定产品规划
    architecture/           # 稳定架构文档
    implementation/         # roadmap/status/handoff
    adr/                    # 关键技术决策

  discuss/                  # 讨论过程、调研、阶段性结论

  AGENTS.md                 # 给后续 coding agent 的项目入口
  README.md
```

`apps/server` 内部继续分模块：

```txt
apps/server/
  src/
    api/                    # routes/controllers
    services/               # conversation/message/run/upload services
    agent/                  # AgentRuntime、AgentLoop、ContextBuilder
    tools/                  # app 自建工具，如 memory_write
    models/                 # QwenProvider
    storage/                # Prisma client、repositories
    observability/          # run trace、metrics、debug query

  prisma/
    schema.prisma
    migrations/

  data/                     # SQLite db，gitignore
  uploads/                  # 本地图片/文件，gitignore
```

## UI

Web 使用 React，移动端使用 React Native。

共享：

- message schema
- AgentEvent schema
- API client
- SSE-like stream parser
- AgentEvent reducer

不强行复用：

- 页面布局
- 输入框 UI
- 会话侧边栏/抽屉
- 图片选择器
- Markdown renderer

流式通信采用一个 POST：

```txt
POST /api/chat/stream
```

响应为 `text/event-stream` 风格 chunk，前端用 `fetch + ReadableStream` 解析，不使用原生 `EventSource GET`。

## Server

Server 是产品边界层，负责状态与可靠性。

职责：

- conversations / messages 持久化
- attachments 管理
- memories 管理
- agent_runs / model_usages / agent_events
- stream 网关
- abort / regenerate
- provider key 管理
- debug API

MVP 使用：

```txt
Node.js / TypeScript
Prisma
SQLite
```

SQLite 作为本地文件数据库，不需要单独运行数据库服务。后续部署或多用户并发时再迁移 PostgreSQL。

## Agent

Agent 是 Server 内部运行时，不单独部署。

模块：

- `AgentRuntime`
- `QwenProvider`
- `ContextBuilder`
- `ThoughtPresenter`
- `ToolRegistry`
- `MemoryManager`

MVP 使用千问官方 OpenAI-compatible API。

深度思考优先走 provider 能力：

```txt
enable_thinking
thinking_budget
reasoning_content
```

联网搜索优先走 provider 内置能力：

```txt
enable_search
search_options
```

App 自建工具只做项目内状态能力：

- memory_write
- memory_delete
- todo_create 可选
- calculator 可选

## 数据与上下文

Server 完整保存 messages，Agent 每轮只消费 ContextBuilder 构造的模型输入投影：

```txt
system instruction
mode instruction
conversation summary
user memory
recent N messages
current attachments
current user message
```

核心表：

```txt
users
conversations
messages
attachments
memories
agent_runs
agent_events
model_usages
```

图片 MVP 存本地：

```txt
apps/server/uploads/images
```

调用千问视觉模型时，Server 临时转成 base64 data URL。

## Observability

MVP 只做开发调试可观测。

关注：

- run trace
- agent event timeline
- TTFE
- TTFR
- TTFA / TTFT
- TTC
- provider latency
- context build latency
- token usage
- reasoning token usage
- error / abort

调试页面：

```txt
/debug/runs
/debug/runs/:id
```

## 渐进式实现路线

按端到端能力切片推进，不按模块瀑布式实现。

```txt
Stage 0: monorepo 骨架 + shared 协议
Stage 1: Web + Server + Agent 最小聊天闭环
Stage 2: Run trace + Debug 页面
Stage 3: 深度思考
Stage 4: 联网搜索
Stage 5: 图片理解
Stage 6: 轻量记忆
Stage 7: React Native 移动端
```

每个阶段都尽量打通：

```txt
UI -> Server -> Agent -> Qwen -> DB -> Stream -> UI
```

详细讨论过程见 `discuss/`。
