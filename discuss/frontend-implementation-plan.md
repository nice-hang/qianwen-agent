# 前端技术实现规划

本文记录千问类 Chatbox demo 的前端技术实现规划。当前结论：移动端使用 React Native，Web 端使用 React；两端共享消息协议、API client、流式 parser 和 AgentEvent reducer，但 UI 布局各自适配。

## 1. 前端层定位

前端负责用户交互和状态展示，不负责 prompt、agent 决策或模型调用。

职责：

- Chatbox UI。
- 会话列表。
- 图片上传与预览。
- 流式消息展示。
- 停止生成。
- 重新生成。
- Markdown 渲染。
- 深度思考面板。
- 搜索来源展示。
- 轻量记忆管理入口。

不做：

- 直接调用千问 API。
- 保存 provider API key。
- 拼接模型上下文。
- 执行工具。
- 决定是否搜索/调用工具。

## 2. 项目结构

推荐结构：

```txt
apps/
  web/           # React Web
  mobile/        # React Native

packages/
  shared/        # types, api client, stream parser, reducers
```

`packages/shared` 放：

```txt
types/
  Message
  Conversation
  Attachment
  Source
  AgentEvent

api/
  chatStream()
  uploadAttachment()
  listConversations()
  listMessages()
  listMemories()

stream/
  parseSseLikeStream()
  encode/decode AgentEvent

state/
  reduceAgentEvent()
  conversation reducer
  message reducer
```

## 3. Web 与 RN 的复用边界

复用：

- 类型定义。
- API client。
- SSE-like stream parser。
- AgentEvent reducer。
- 消息状态机。
- 附件上传流程。
- 业务 hooks。

不强行复用：

- 页面布局。
- 输入框 UI。
- 会话侧边栏。
- 图片选择器。
- 滚动容器。
- Markdown renderer 具体组件。

原因：

Web 和移动端的 Chatbox 布局差异明显，强行复用 UI 容易两边都别扭。

## 4. 页面/视图范围

第一版前端只做这些视图：

```txt
Chat
Conversation List
Memory Panel
Settings Panel
Image Preview Modal
```

Web 布局：

```txt
+----------------+-----------------------------+----------------+
| conversations  | chat messages               | memory/settings|
|                |                             | optional       |
|                | input composer              |                |
+----------------+-----------------------------+----------------+
```

移动端布局：

```txt
+-------------------------+
| Header: title / menu    |
+-------------------------+
| Chat messages           |
|                         |
|                         |
+-------------------------+
| Composer + image button |
+-------------------------+
```

移动端会话列表用 drawer 或单独页面。

## 5. 消息模型

前端消息不能只是一段文本，需要支持状态、附件、来源和思考信息。

```ts
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  status: "pending" | "streaming" | "completed" | "aborted" | "failed";
  content: string;
  reasoning?: {
    status: "hidden" | "streaming" | "completed";
    text?: string;
    summaries?: string[];
  };
  attachments?: Attachment[];
  sources?: Source[];
  events?: DisplayEvent[];
  createdAt: string;
};
```

用于支持：

- 正在回答。
- 已停止。
- 失败重试。
- 深度思考折叠。
- 搜索来源。
- 图片消息。

## 6. 流式通信方案

采用一个 POST stream，贴近千问 Web 的实现方式。

```txt
POST /api/chat/stream
```

请求：

```ts
{
  conversationId?: string;
  content: string;
  mode: "fast" | "deep";
  search: "auto" | "off" | "force";
  attachmentIds: string[];
  regenerateFromMessageId?: string;
}
```

响应：

```txt
Content-Type: text/event-stream
```

返回 SSE-like chunk，而不是原生 `EventSource GET`。

示例：

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

Web 端读取：

```ts
const res = await fetch("/api/chat/stream", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  },
  body: JSON.stringify(input),
  signal,
});

const reader = res.body!.getReader();
```

RN 端：

- 优先尝试同样的 fetch streaming。
- 如果 RN 环境不稳定，再补 WebSocket 或 GET SSE fallback。
- shared 层保持 `ChatTransport` 抽象，避免影响 UI。

## 7. 为什么不用原生 EventSource

原生 EventSource 只能 GET，不适合直接发送复杂 chat body。

我们之前考虑过：

```txt
POST create run
GET subscribe events
```

但观察千问 Web 后，发现它更像：

```txt
POST /api/v2/chat
Accept: application/json, text/event-stream, text/plain, */*
response.body.getReader()
```

因此第一版采用：

> `POST /api/chat/stream` + `fetch ReadableStream` + `SSE-like parser`。

这样更贴近真实 Chatbox 实现，也简化一次发送消息的链路。

## 8. AgentEvent 前端处理

前端不直接在组件里散落处理 stream chunk，而是统一进 reducer。

```txt
SSE-like chunk
  -> parseSseLikeStream()
  -> AgentEvent
  -> reduceAgentEvent()
  -> update current assistant message
  -> render UI
```

事件处理示例：

```txt
phase(thinking)
  -> assistant.reasoning.status = "streaming"

reasoning_delta
  -> append assistant.reasoning.text

thinking_summary
  -> append assistant.reasoning.summaries

sources_found
  -> assistant.sources = sources

answer_delta
  -> append assistant.content

done
  -> assistant.status = "completed"
```

Web/RN 共用 parser 和 reducer。

## 9. 深度思考 UI

前端展示的是产品化思考过程，不是完整工具链，也不是原始模型思维链。

第一版展示：

```txt
[深度思考中 v]
  正在分析问题
  正在联网搜索
  参考了 N 条结果
  正在整理答案
```

如果有 `reasoning_content`：

- 默认折叠。
- 可以展示摘要。
- 不要撑满页面。
- 最终答案和 reasoning 明确分区。

Web：消息内 collapsible block。  
RN：可展开卡片。

## 10. 图片上传流程

第一版采用本地 server uploads 方案。

流程：

```txt
用户选择图片
  -> 前端生成本地预览
  -> POST /api/attachments multipart
  -> Server 保存到 uploads/images
  -> Server 返回 attachmentId + previewUrl
  -> Composer 显示图片缩略图
  -> 用户发送消息，带 attachmentIds
  -> Chat message 展示图片
  -> Agent 调千问时 server 临时转 base64 data URL
```

前端要求：

- 上传时显示 loading。
- 支持删除未发送图片。
- 限制大小，比如 5MB。
- Web 支持 file input / drag drop。
- RN 支持系统相册/拍照，第一版可先相册。

## 11. Stop / Regenerate

### Stop

POST stream 下停止生成：

```txt
用户点停止
  -> AbortController.abort()
  -> UI 标记当前 assistant message 为 aborted
  -> Server 捕获连接断开
  -> Abort provider request
  -> 更新 agent_run/message 状态
```

必要时保留：

```txt
POST /api/runs/:id/abort
```

但第一版点击停止直接 abort 当前 fetch 即可。

### Regenerate

统一使用 `/api/chat/stream`：

```ts
{
  conversationId: "...",
  regenerateFromMessageId: "msg_xxx"
}
```

Server 根据原始 user message 创建新的 assistant response。

## 12. 状态管理

第一版不要上太复杂。

Web：

```txt
TanStack Query
  - conversations
  - messages
  - memories

Zustand
  - current streaming state
  - composer state
  - active conversation
```

RN：

```txt
TanStack Query
  - conversations
  - messages
  - memories

Zustand
  - current streaming state
  - composer state
  - active conversation
```

两端可以复用 reducer 和部分 hooks。

## 13. Markdown 渲染

Web：

- `react-markdown`
- `remark-gfm`
- 代码高亮后续加。

RN：

- `react-native-markdown-display`
- 代码块样式先简单做。

第一版支持：

- 标题。
- 列表。
- 链接。
- 引用。
- 代码块。
- Web 表格优先，RN 表格可降级。

## 14. 第一版实现顺序

建议先 Web 后 RN。

原因：

- Web 调试 stream 最快。
- Web 调试图片上传最方便。
- Server/Agent 协议稳定后，再搬到 RN 少踩坑。

顺序：

```txt
1. shared types: Message / AgentEvent / Attachment
2. shared API client
3. shared SSE-like stream parser
4. shared AgentEvent reducer
5. Web Chat UI
6. Web conversation list
7. Web POST stream 接入
8. Web stop/regenerate
9. Web image upload
10. Web deep thinking panel
11. Web sources display
12. Mobile Chat UI
13. Mobile conversation list/drawer
14. Mobile stream transport 适配
15. Mobile image picker/upload
16. Mobile deep thinking panel
17. Memory panel/settings
```

## 15. 第一版不做

```txt
复杂主题系统
多账号工作区
复杂插件面板
Prompt 模板市场
语音输入
TTS
完整文件管理器
复杂富文本编辑器
原生 EventSource 双请求模式
```

## 16. 当前结论

前端第一版采用：

> React Native 和 React 分别实现适配各自平台的 Chat UI，但共享 message schema、API client、SSE-like stream parser、AgentEvent reducer 和基础状态逻辑。流式通信采用一个 `POST /api/chat/stream`，返回 `text/event-stream` 风格 chunk；Web 用 fetch ReadableStream 读取，RN 优先尝试同方案，必要时再补 transport fallback。
