# Server 技术实现规划

本文记录千问类 Chatbox demo 的 Server 层技术实现规划。当前结论基于产品能力范围和 Agent 层方案：Server 负责产品边界、状态持久化和流式网关，Agent 负责智能运行时。

## 1. Server 层定位

Server 是产品边界层，不是简单的模型 API proxy。

它负责：

- 对外 API。
- 会话管理。
- 完整 messages 持久化。
- 图片/文件上传与元信息管理。
- SSE/WebSocket 流式连接。
- 调用 AgentRuntime。
- 转发 AgentEvent。
- 保存 agent run 与关键事件。
- 维护会话摘要和用户记忆。
- 管理 provider API key、限流、安全和日志。

一句话：

> Agent 负责智能决策，Server 负责系统状态和工程可靠性。

## 2. Server 与 Agent 边界

Server 不直接拼 prompt，也不直接调用千问模型。

Server 做：

```txt
鉴权/用户识别
保存 user message
查询 conversation/messages/attachments/memory
创建 agent_run
调用 AgentRuntime
转发 AgentEvent
保存 assistant message
保存关键事件和 usage
触发 summary/memory 更新
```

Agent 做：

```txt
ContextBuilder
QwenProvider
ThoughtPresenter
ToolRegistry
MemoryManager 逻辑
AgentLoop
```

调用关系：

```txt
Client
  -> Server API
    -> ConversationService
    -> MessageService
    -> RunService
    -> AgentRuntime
      -> QwenProvider / ToolRegistry / ThoughtPresenter
    -> Stream Gateway
  -> Client
```

## 3. 是否需要数据库

需要。

Chatbox 是强状态产品，即使第一版也需要持久化：

- 会话列表。
- 完整 messages。
- 停止生成后的状态。
- 重新生成所需的原始 user message。
- 会话摘要。
- 用户记忆。
- 图片/文件元信息。
- agent run trace。

如果不引入数据库，产品会变成一次性 demo，后续很难支持会话恢复、调试、记忆和多端同步。

## 4. 数据库选型

第一版采用：

```txt
SQLite + Prisma
```

原因：

- SQLite 是本地文件数据库，不需要单独启动数据库服务。
- 适合本地开发和单用户 demo。
- 数据能持久化，重启 server 不会丢。
- Prisma 迁移和类型生成体验好。
- 后续可迁移到 PostgreSQL。

推荐目录：

```txt
server/
  prisma/
    schema.prisma
    migrations/
  data/
    qianwen-agent.db
```

Prisma 配置示例：

```env
DATABASE_URL="file:./data/qianwen-agent.db"
```

`.db` 文件不提交 git：

```gitignore
server/data/*.db
server/data/*.db-*
```

图片和文件不直接存 SQLite，只存文件路径、URL、mime、size、provider file id 等元信息。

## 5. 核心数据表

第一版建议表：

```txt
users
conversations
messages
attachments
memories
agent_runs
agent_events
```

可以先单用户，但表结构保留 `user_id`。

### users

第一版可以 mock user，但保留用户表方便后续扩展。

```txt
users
  id
  name
  created_at
```

### conversations

```txt
conversations
  id
  user_id
  title
  summary
  summary_updated_at
  summary_message_id_until
  created_at
  updated_at
  archived_at
```

`summary` 第一版直接存在 `conversations` 表即可。它是派生缓存，不替代原始 messages。

### messages

核心消息表。

```txt
messages
  id
  conversation_id
  user_id
  role              // user | assistant | tool | system
  status            // completed | streaming | aborted | failed
  content
  reasoning_content
  metadata_json
  parent_message_id
  created_at
```

说明：

- `content` 存最终可展示文本。
- `reasoning_content` 可存完整推理内容，但默认不注入下一轮。
- `metadata_json` 存模型名、token usage、搜索信息、工具信息等。
- `parent_message_id` 为 regenerate 和分支对话预留，第一版可以先不使用。

### attachments

图片和文件不要直接塞进 messages。

```txt
attachments
  id
  message_id
  user_id
  type              // image | file
  mime_type
  filename
  size
  storage_url
  local_path
  provider_file_id
  metadata_json
  created_at
```

图片理解时，Agent 从 attachment 获取可访问 URL 或本地转存后的 URL，再转成千问的 `image_url` content part。

### memories

轻量用户记忆。

```txt
memories
  id
  user_id
  key
  value
  type              // preference | profile | project
  status            // active | deleted
  source_message_id
  confidence
  created_at
  updated_at
```

第一版只支持显式记忆：

```txt
记住：我使用 RN + React
忘记：RAG 暂缓
```

### agent_runs

一次用户消息对应一次 agent run。

```txt
agent_runs
  id
  conversation_id
  user_message_id
  assistant_message_id
  mode              // fast | deep
  model
  status            // running | completed | aborted | failed
  started_at
  completed_at
  usage_json
  error
```

用于 debug 和产品状态恢复。

### agent_events

保存关键流式事件，便于回放和排查。

```txt
agent_events
  id
  run_id
  type
  payload_json
  created_at
```

第一版不必保存所有 token delta，可以保存关键事件：

- `phase`
- `reasoning_summary`
- `tool_start`
- `tool_result`
- `sources_found`
- `final`
- `error`

## 6. Summary 存储策略

Server 完整保存 messages，Agent 不直接消费全量历史。

会话摘要作为派生缓存保存：

```txt
conversations.summary
conversations.summary_updated_at
conversations.summary_message_id_until
```

更新流程：

```txt
agent final answer done
  -> 保存 assistant message
  -> 判断历史是否超过阈值
  -> 异步更新 conversation summary
  -> 不删除原始 messages
```

ContextBuilder 每次使用：

```txt
conversation summary
  + recent N messages
  + user memory
  + current attachments
  + current user message
```

## 7. API 设计

第一版 API 可以保持简单。

### Conversation

```txt
POST /api/conversations
GET  /api/conversations
GET  /api/conversations/:id/messages
PATCH /api/conversations/:id
```

### Chat

```txt
POST /api/chat/stream
POST /api/runs/:id/abort
POST /api/messages/:id/regenerate
```

`POST /api/chat/stream` 请求：

```ts
{
  conversationId?: string;
  content: string;
  mode: "fast" | "deep";
  search: "auto" | "off" | "force";
  attachmentIds: string[];
}
```

如果没有 `conversationId`，server 自动创建会话。

### Attachments

```txt
POST /api/attachments
GET  /api/attachments/:id
```

### Memories

```txt
GET    /api/memories
DELETE /api/memories/:id
```

第一版记忆写入可以先通过 Agent tool `memory_write` 完成，也可以后续补管理 API。

## 8. 流式协议

第一版推荐 SSE。

原因：

- 与大模型流式输出习惯一致。
- Web 端原生支持。
- Server 实现简单。
- 单向流足够支撑 Chatbox。
- RN 可用 EventSource polyfill。

如果 RN 兼容性后续不理想，再切 WebSocket。

SSE 事件由 Server 从 AgentEvent 转发：

```txt
event: phase
data: {"phase":"thinking"}

event: reasoning_delta
data: {"text":"..."}

event: sources_found
data: {"count":8,"sources":[...]}

event: answer_delta
data: {"text":"..."}

event: done
data: {"runId":"...","messageId":"..."}
```

## 9. Abort 和 Regenerate

### Abort

支持两种方式：

```txt
前端断开 SSE
  -> Server 捕获连接关闭
  -> abort provider request
  -> agent_run.status = aborted
  -> assistant message.status = aborted
```

或：

```txt
POST /api/runs/:id/abort
```

第一版至少支持前端断开 SSE 后中止生成。

### Regenerate

重新生成需要找到原始 user message：

```txt
POST /api/messages/:id/regenerate
  -> 找到 user message
  -> 创建新的 agent_run
  -> 创建新的 assistant message
  -> 使用同一 conversation context
```

后续如果支持分支对话，再使用 `parent_message_id` 表达不同回答分支。

## 10. 图片/文件上传

第一版图片上传可先存本地文件系统。

推荐目录：

```txt
server/
  uploads/
    images/
    files/
```

数据库只存元信息：

```txt
local_path
storage_url
mime_type
size
filename
```

注意：

- 上传后要生成可被 Qwen API 访问的 URL。
- 如果本地开发无法直接给公网 URL，需要后续考虑对象存储或临时公网代理。
- 图片不要存入 SQLite blob。

第一版如果只在本地调试视觉模型，可能需要：

- 上传到对象存储。
- 或使用支持公网访问的临时文件服务。
- 或等前端直接传入可访问 URL。

这一点后续实现前需要单独确认。

## 11. Provider Key 和配置

千问 API key 只存在 server 环境变量。

```txt
DASHSCOPE_API_KEY=...
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_TEXT_MODEL=qwen-plus
QWEN_VISION_MODEL=qwen-vl-plus
QWEN_DEEP_MODEL=qwen-plus
```

前端永远不直接持有 provider key。

Server 负责：

- provider request timeout。
- 错误映射。
- usage 记录。
- 模型配置切换。
- 日志脱敏。

## 12. 第一版实现顺序

```txt
1. 初始化 server 项目
2. 接入 Prisma + SQLite
3. 建 users/conversations/messages schema
4. 实现 conversation/message 基础 API
5. 实现 /api/chat/stream SSE
6. 接 AgentRuntime 普通聊天
7. 保存 assistant message
8. 加 agent_runs
9. 支持 abort
10. 支持 regenerate
11. 加 attachments 上传与图片元信息
12. 接 AgentRuntime 图片输入
13. 加 memories 表和 memory 管理
14. 加 conversation summary 更新
15. 加 agent_events 关键事件落库
```

## 13. 当前结论

Server 第一版采用：

> Node.js/TypeScript Server + Prisma + SQLite 本地文件数据库。Server 负责完整持久化 conversations、messages、attachments、memories 和 agent runs，通过 SSE 把 AgentEvent 转发给前端，并调用 AgentRuntime 完成模型与工具能力。SQLite 作为本地持久化文件，不需要单独运行数据库服务；后续需要部署或多用户并发时再迁移 PostgreSQL。
