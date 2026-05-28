# 最小聊天闭环

## 状态

Implemented

## 对应 Roadmap

- Stage: Stage 1
- Step: 最小聊天闭环
- 相关验收项:
  - 用户能创建/进入会话
  - 用户能发送文本消息
  - 回答能流式展示
  - 刷新页面后能恢复历史消息

## 背景

Stage 0 已经建立 monorepo、shared 协议、Server health check 和 Web 壳子。Stage 1 要把项目从“工程骨架”推进到“可用的最小聊天产品”：用户在 Web 输入文本，Server 保存 user message，Agent Runtime 调 Qwen 普通文本模型，Server 以 SSE-like chunk 流式返回 `answer_delta`，完成后保存 assistant message，刷新页面后从 SQLite 恢复历史消息。

这一阶段是后续深度思考、联网搜索、图片理解和 Run Trace 的基础，因此重点是端到端链路稳定，而不是一次性做全 Agent 能力。

## 目标

- 接入 Prisma + SQLite。
- 建立 conversations / messages 基础表。
- 实现 conversation 列表、详情读取的最小 API；新会话由首条聊天消息自动创建。
- 实现 `POST /api/chat/stream`。
- 实现 QwenProvider 普通文本流式调用。
- Server 保存 user message。
- Server 将模型流转成 shared `AgentEvent`，持续返回 `answer_delta`。
- Server 在模型结束后保存 assistant message。
- Web 实现最小聊天 UI、会话列表、历史消息展示和流式回答。

## 非目标

- 不实现 Run Trace、agent_runs、agent_events、model_usages 落库。
- 不实现深度思考、`reasoning_content` 展示或 `mode: deep`。
- 不实现联网搜索、来源展示或 search 配置。
- 不实现图片上传、多模态输入或 attachments 表。
- 不实现记忆、工具调用、MCP、Skill、Subagent。
- 不实现完整账号体系、多用户隔离和权限。
- 不实现 React Native 聊天 UI，只保持 shared 协议可复用。

## 初步技术方案

采用当前 Stage 0 的边界继续推进：

```txt
apps/web
  React UI
  -> shared API client
  -> POST stream parser

apps/server
  Fastify routes
  -> Prisma repositories
  -> runAgent
  -> SSE-like event writer

packages/agent-runtime
  message projection
  -> QwenProvider
  -> AgentEvent async iterable

packages/shared
  Chat / Conversation / AgentEvent types
  stream parser
  API client
```

Server 仍是产品边界：负责 HTTP、DB、message 持久化和 stream 转发。Agent Runtime 负责读取 provider 配置、把历史消息投影成模型输入、调用 Qwen、输出 `AgentEvent`。

Qwen 调用优先使用千问 OpenAI-compatible Chat Completions stream。Stage 1 只解析普通回答文本，不解析 thinking、tool_calls、search 或 usage。

## 核心流程

```txt
Web load
  -> GET /api/conversations
  -> GET /api/conversations/:id/messages
  -> render history

User sends message
  -> POST /api/chat/stream { conversationId?, message }

Server
  -> create conversation if missing
  -> save user message
  -> load conversation messages
  -> runAgent()

Agent Runtime
  -> maps ChatMessage[] to provider messages
  -> QwenProvider.streamText()
  -> yield { type: "answer_delta", text }
  -> yield { type: "done", runId }

Server stream
  -> write AgentEvent chunks as text/event-stream
  -> accumulate assistant content
  -> save assistant message when model completes

Web stream reader
  -> parse chunks
  -> append answer_delta to optimistic assistant message
  -> on done, reconcile message id / conversation id
```

## 数据结构 / 接口设计

### Prisma schema

```prisma
model Conversation {
  id        String    @id @default(cuid())
  title     String
  summary   String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  messages  Message[]
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           MessageRole
  status         MessageStatus @default(completed)
  content        String
  createdAt      DateTime      @default(now())
}

enum MessageRole {
  user
  assistant
}

enum MessageStatus {
  streaming
  completed
  failed
}
```

Stage 1 暂不建 attachments、agent_runs、usage 表，避免和后续阶段边界混在一起。

### Server API

```ts
GET /health

GET /api/conversations
Response: { conversations: Conversation[] }

GET /api/conversations/:conversationId/messages
Response: { conversation: Conversation; messages: ChatMessage[] }

POST /api/chat/stream
Body: ChatStreamRequest
Response: text/event-stream
```

### Stream events

沿用 Stage 0 的 shared `AgentEvent`：

```ts
type AgentEvent =
  | { type: "answer_delta"; text: string }
  | { type: "done"; runId: string; messageId?: string; conversationId?: string }
  | { type: "error"; message: string; code?: string; conversationId?: string };
```

Stage 1 Runtime 只生成 `runId`，不落库；`messageId` 由 Server 保存 assistant message 后补上。若 provider 失败，Server 返回 `error` event，并带上 `conversationId`，方便前端重新拉取已保存的 user message。

### Qwen provider 配置

```txt
QWEN_API_KEY=...
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
```

如果本地没有 `QWEN_API_KEY` / `DASHSCOPE_API_KEY`，Server 启动可以成功，但发送聊天时返回清晰错误 event。这样 health check 和历史读取不依赖外部 key。

## 方案对比

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| Server 直接调用 Qwen | 最快打通，文件少 | Agent Runtime 边界失效，后续 thinking/search/tool 会挤进 Server | 不采用 |
| Agent Runtime 提供 QwenProvider，Server 负责 DB/stream | 保持 Stage 0 边界，后续能力自然扩展；provider 配置由真正使用方读取 | 初期多几个接口 | 采用 |
| 先 mock provider，后接 Qwen | 无需 key，验证 UI 快 | 不能满足“最小聊天闭环”的真实 provider 目标 | 只作为本地无 key fallback，不作为主路径 |
| GET EventSource | 浏览器 API 简单 | 无法自然携带 POST body，与既定协议不一致 | 不采用 |
| POST + fetch ReadableStream | 符合 README 和 shared parser，便于携带 conversation/message | 需要自己处理 chunk parser | 采用 |

## 设计意图

- 先把 `UI -> Server -> Agent -> Qwen -> DB -> Stream -> UI` 跑通，后续阶段只扩展事件类型、数据表和 UI 区域。
- Server 只保存完整 messages；Agent Runtime 每轮消费精简后的模型输入投影，避免 UI 或 DB schema 直接绑死 provider 格式。
- Stage 1 的 DB schema 保持最小，只建 conversation/message，给 Stage 2/5/6 留清晰扩展点。
- Web UI 先做可用的工作台式聊天界面：会话列表、消息区、输入区、发送状态和错误提示，不做营销页或复杂视觉包装。

## 待确认问题

- 默认模型是否使用 `qwen-plus`，还是需要指定更低成本模型。
- Qwen OpenAI-compatible stream 的 delta 字段在当前模型下是否稳定为 `choices[].delta.content`。
- 发送失败时是否保存 failed assistant message；初步倾向保存 user message，assistant 仅在有内容时保存，错误以 event 和 UI 状态展示。
- conversation title 的生成策略：Stage 1 初步用用户首条消息截断，后续再用模型摘要。

## 实现计划

- [x] 安装并配置 Prisma。
- [x] 创建 `apps/server/prisma/schema.prisma`。
- [x] 增加 SQLite datasource 和 `apps/server/data` 本地路径。
- [x] 生成 Prisma client。
- [x] 实现 conversation/message repository。
- [x] 实现 conversation routes：list/messages。
- [x] 实现 server stream writer。
- [x] 扩展 `packages/agent-runtime`：QwenProvider、真实 `runAgent`。
- [x] 实现 `POST /api/chat/stream` 保存 user message、调用 `runAgent`、保存 assistant message。
- [x] 扩展 shared API client：conversations/messages。
- [x] 实现 Web 聊天 UI：会话列表、消息历史、composer、流式 assistant message。
- [x] 更新 docs/status 和本 solution 验证记录。

## 实现记录

已实现：

- 接入 Prisma 6.19 + SQLite。
- 创建 conversations / messages schema 和 init migration。
- 实现 conversation repository 和 routes。
- 实现 `POST /api/chat/stream`，支持自动创建 conversation、保存 user message、调用 `runAgent`、写出 SSE-like AgentEvent、保存 assistant message。
- 实现 server event writer。
- 实现 Qwen OpenAI-compatible stream provider，解析 `choices[].delta.content` 为 `answer_delta`。
- 扩展 shared API client：conversation list/messages 和 chat stream。
- Web 从 Stage 0 静态页面升级为聊天界面：会话列表、新聊天、历史消息、composer、流式 assistant message、错误提示。
- 增加 CORS，支持 Vite dev server 跨端口访问 server。
- 后续按简洁原则删除了薄 service 层、health noop trace、未使用的 `POST /api/conversations`、`phase` event、`mode/search/attachment` 等提前暴露字段。
- Qwen provider 配置改由 Agent Runtime 自己读取，Server 不再读取后原样透传。

实现偏离：

- 原计划使用最新 Prisma，但 Prisma 7.x 改为 `prisma.config.ts` / adapter 配置。为保持 Stage 1 简洁，固定到 Prisma 6.19.0，沿用 schema 内 datasource URL 的轻量方案。
- 已用真实 `DASHSCOPE_API_KEY` 验证 Qwen OpenAI-compatible stream；同时保留 fake fetch 验证 Agent Runtime stream parser。

## 关键文件

预计涉及：

- `apps/server/prisma/schema.prisma`
- `apps/server/prisma/migrations/20260528121343_init/migration.sql`
- `apps/server/src/config/*`
- `apps/server/src/storage/*`
- `apps/server/src/stream/*`
- `apps/server/src/api/*`
- `packages/agent-runtime/src/index.ts`
- `packages/shared/src/api-client.ts`
- `packages/shared/src/types.ts`
- `apps/web/src/*`

## 验证方式

- [x] `pnpm install`
- [x] `pnpm typecheck`
- [x] `pnpm --filter @qianwen-agent/server prisma migrate dev --name init`
- [x] `pnpm --filter @qianwen-agent/server start`
- [x] `curl http://127.0.0.1:3001/health`
- [x] `curl http://127.0.0.1:3001/api/conversations`
- [x] `curl http://127.0.0.1:3001/api/conversations/:id/messages`
- [x] 无 `QWEN_API_KEY` 调用 `POST /api/chat/stream`，确认返回 error event 且保存 user message
- [x] fake fetch 调用 Agent Runtime，确认返回 `answer_delta` 和 `done`
- [x] `pnpm --filter @qianwen-agent/web dev`
- [x] `curl http://127.0.0.1:3000/`

- [x] 使用真实 `DASHSCOPE_API_KEY` 调用 `POST /api/chat/stream`，确认真实 Qwen 返回 `answer_delta` 和 `done`
- [x] 读取 conversation messages，确认 user / assistant message 均已保存，可用于刷新恢复

未覆盖：

- [ ] 浏览器手工验证真实模型回答的流式展示和刷新恢复

## 验证记录

- `pnpm typecheck`：通过。
- `pnpm --filter @qianwen-agent/server prisma migrate dev --name init`：通过，生成并应用 `20260528121343_init`。
- `pnpm --filter @qianwen-agent/server start`：通过，server 监听 `http://127.0.0.1:3001`。
- `curl -s http://127.0.0.1:3001/api/conversations`：通过，返回 conversations 数组。
- `curl -s http://127.0.0.1:3001/api/conversations/:id/messages`：通过，返回 conversation 和 messages。
- `curl -s -N -X POST http://127.0.0.1:3001/api/chat/stream ...`：在无 key 环境下返回带 `conversationId` 的 `error` event，且 user message 已保存。
- fake fetch Agent Runtime smoke：通过，输出两个 `answer_delta` 和 `done`。
- 真实 Qwen smoke：通过，`POST /api/chat/stream` 返回连续 `answer_delta`，最终返回 `done`，`conversationId` 为 `cmppgpt9t0000jg0rbdza4qyf`。
- DB 恢复 smoke：通过，`GET /api/conversations/cmppgpt9t0000jg0rbdza4qyf/messages` 返回 user message 和 completed assistant message。
- `pnpm --filter @qianwen-agent/web dev`：通过，Vite 监听 `http://localhost:3000/`。
- `curl -s http://127.0.0.1:3000/`：通过，返回 Vite HTML。

## 最终结论

Stage 1 已实现最小聊天闭环，并已通过真实 Qwen OpenAI-compatible stream 验证。浏览器手工交互仍可在后续提交前补测，但 Server / Agent / DB / Stream 的核心闭环已经跑通。

## 后续演进

- Stage 2 在当前 chat run 周围增加 agent_runs / agent_events / model_usages。
- Stage 3 扩展 QwenProvider，开启 thinking 并输出 `reasoning_delta`。
- Stage 4 扩展 provider request，开启 search 并展示 sources。
- Stage 5 增加 attachments 表和多模态 message 投影。
