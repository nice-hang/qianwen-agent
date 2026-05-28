# Agent 技术实现规划

本文记录千问类 Chatbox demo 的 Agent 层技术实现规划。当前结论基于产品能力范围：多轮聊天、深度思考、图片理解、联网搜索、轻量记忆。

## 1. Agent 层定位

Agent 层不是独立产品入口，而是 Server 内部的智能运行时。

它负责：

- 构造模型输入。
- 调用千问官方 API。
- 处理流式输出。
- 处理 reasoning_content。
- 接入 provider 内置能力。
- 执行 app 自建工具。
- 输出统一 AgentEvent。
- 管理会话摘要和轻量记忆的注入。

第一版采用受控 single Agent Runtime，不实现 MCP、Skill、Subagent、LangGraph 固定编排和完整 RAG。

## 2. 核心模块

```txt
AgentRuntime
  - QwenProvider
  - ContextBuilder
  - AgentLoop
  - ToolRegistry
  - ThoughtPresenter
  - MemoryManager
  - RunTrace
```

### AgentRuntime

Server 调用 AgentRuntime，而不是直接调用模型。

```ts
agentRuntime.run({
  userId,
  conversationId,
  message,
  attachments,
  mode: "fast" | "deep",
  search: "auto" | "off" | "force",
});
```

AgentRuntime 对外输出统一事件流：

```ts
type AgentEvent =
  | { type: "phase"; phase: "thinking" | "answering" }
  | { type: "reasoning_delta"; text: string }
  | { type: "thinking_summary"; text: string }
  | { type: "tool_start"; tool: string; label: string }
  | { type: "tool_result"; tool: string; summary: string; sources?: Source[] }
  | { type: "sources_found"; count: number; sources: Source[] }
  | { type: "answer_delta"; text: string }
  | { type: "final"; message: AssistantMessage }
  | { type: "error"; message: string };
```

### QwenProvider

第一版后端真实接入千问官方 API，不做 mock。

主要使用 OpenAI-compatible Chat Completions：

- 普通文本聊天。
- 多模态图片输入。
- 深度思考。
- 联网搜索。
- function calling。

后续可以补充 Responses API：

- provider 托管工具更强。
- 适合 web_search、web_extractor、code_interpreter 等内置工具。
- 但上下文和事件模型会更依赖 provider。

### ContextBuilder

ContextBuilder 负责把完整 conversation history 投影成本次模型输入。

模型输入包含：

```txt
system instruction
mode instruction
conversation summary
user memory
recent N messages
current attachments
current user message
```

完整 messages 由 Server 保存，Agent 不直接注入全量历史。

### AgentLoop

AgentLoop 只负责 app 自建工具的循环，不等同于 provider 内部搜索/代码解释器 loop。

```txt
while step < maxAppToolSteps:
  call qwen model
  if final answer:
    stream final
    break
  if function tool call:
    validate args
    execute app tool
    append tool result
    continue
```

第一版 app 自建工具：

- `memory_write`
- `memory_delete`
- `todo_create` 可选
- `calculator` 可选

搜索、网页抓取、代码解释器优先走千问 provider 内置能力，不先自建。

### ToolRegistry

只注册 app 自建工具。

```ts
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(args: unknown, ctx: RunContext): Promise<ToolResult>;
}
```

暂不实现：

- MCP adapter。
- 用户自定义 Skill。
- 插件市场。
- Subagent handoff。

### ThoughtPresenter

ThoughtPresenter 把 provider 输出和 app tool 事件转成前端可展示的“深度思考过程”。

它不展示完整原始思维链，也不展示完整工具链，只展示产品化过程事件：

```txt
正在深度思考
正在联网搜索
参考了 N 条结果
正在整理答案
```

### MemoryManager

第一版只做轻量记忆：

- 会话摘要。
- 用户长期记忆。

长期记忆先只支持显式写入/删除：

```txt
记住：我使用 RN + React
忘记：RAG 暂缓
```

不做隐式自动记忆，避免不可控。

## 3. Provider 内置工具与 App 自建工具

工具分两类。

### Provider 内置工具

由千问/百炼内部执行，server 通常不能完整观测中间链路。

包括：

- `enable_search`
- `web_search`
- `web_extractor`
- `code_interpreter`
- vision input

特点：

- 实现简单。
- 质量由 provider 托管。
- 中间过程不可完全观测。
- 前端只能展示弱过程。

### App 自建工具

由本项目 server 执行，完整可观测。

包括：

- 记忆写入。
- 记忆删除。
- 创建待办。
- 查询项目内数据。

特点：

- 工具调用链路可落库。
- 前端可以展示真实 tool_start/tool_result。
- 需要自己实现权限、参数校验、失败处理。

## 4. 深度思考模式

深度思考不是简单地让 AgentLoop 多跑几轮。

真实实现应该是：

```txt
模型 reasoning 能力
  + 更高 thinking_budget
  + 联网搜索策略
  + 更多 app tool step 上限
  + 前端思考过程展示
```

基于千问官方 API：

```ts
fast:
  enable_thinking: false
  enable_search: false by default
  maxAppToolSteps: 1

deep:
  enable_thinking: true
  thinking_budget: 4096 or 8192
  enable_search: true
  search_options: { search_strategy: "max" | "turbo" }
  maxAppToolSteps: 4
```

`enable_thinking` 控制模型是否先推理；`thinking_budget` 控制最大推理 token；`enable_search` 控制是否启用 provider 内置联网搜索。

## 5. 深度思考前端展示

如果只开启 `enable_thinking`，不开搜索：

```txt
前端展示 reasoning_content 或 reasoning 摘要
没有真实搜索过程可展示
```

如果开启 `enable_thinking + enable_search`：

```txt
搜索发生在 provider 内部
server 不一定拿到每次搜索 query 和网页抓取细节
前端展示弱过程：
  - 正在深度思考
  - 正在联网搜索
  - 正在整理搜索结果
  - 参考了 N 条结果
```

如果后续搜索改为 app 自建工具：

```txt
模型返回 web_search function call
server 执行搜索
server 得到 sources
server 把 tool_result 喂回模型
前端可以展示真实搜索链路
```

第一版采用：

```txt
千问内置 enable_search
  + enable_thinking
  + reasoning_content
  + ThoughtPresenter 弱过程展示
```

## 6. 图片理解

图片理解作为 P0。

第一版将图片作为 multimodal message input 传给千问模型，而不是作为 app tool。

消息格式采用 OpenAI-compatible content parts：

```ts
{
  role: "user",
  content: [
    { type: "image_url", image_url: { url: "https://..." } },
    { type: "text", text: "请分析这张图" }
  ]
}
```

可选模型：

- `qwen-vl-plus`
- `qwen-vl-max`
- `qwen3.6-plus`

具体模型以后根据价格、效果、上下文、多模态支持再确定。

## 7. 联网搜索

第一版采用千问内置搜索。

Chat Completions 方式：

```ts
extra_body: {
  enable_search: true,
  search_options: {
    search_strategy: "max" | "turbo"
  }
}
```

搜索结果和来源展示根据 provider 返回能力处理：

- 如果返回 sources/search_info，则展示真实来源。
- 如果只返回 usage/tool count，则展示“已联网搜索”与工具次数。
- 如果没有可结构化来源，则不伪造来源列表，只展示联网状态。

后续如果需要完整可观测搜索链路，再改成 app 自建 `web_search` tool。

## 8. reasoning_content 存储策略

千问可能在流式输出中返回 `reasoning_content`。

建议：

- DB 可以存完整 `reasoning_content`。
- 前端默认展示摘要或折叠内容。
- 默认不把历史 `reasoning_content` 注入下一轮模型。
- 只有 debug 或用户追问“你刚才为什么这么想”时才考虑注入。

原因：

- 原始 reasoning 很长。
- 计入 token 成本。
- 不适合直接作为稳定上下文。

如果需要让模型参考历史思考过程，可以后续评估 `preserve_thinking`。

## 9. Summary 存储策略

会话摘要由 server/agent 共同维护，但持久化在 server storage。

第一版可以直接存在 `conversations.summary`：

```txt
conversations
  id
  title
  summary
  summary_updated_at
  summary_message_id_until
```

原则：

- 完整 messages 永远保留。
- summary 是派生缓存。
- ContextBuilder 每轮使用 summary + recent messages。
- 当历史超过阈值时，在一轮结束后异步更新 summary。

后续如果需要多版本摘要或审计，再拆 `conversation_summaries` 表。

## 10. 第一版实现顺序

```txt
1. 定义 AgentEvent 协议
2. 实现 QwenProvider Chat Completions stream
3. 支持 enable_thinking 和 reasoning_content
4. 支持 image_url 多模态输入
5. 支持 enable_search 和 search_options
6. 实现 ThoughtPresenter
7. 实现 ContextBuilder
8. 实现 conversation summary 注入
9. 实现 MemoryManager 显式记忆
10. 实现 app 自建 memory tools
```

## 11. 当前结论

Agent 层采用：

> 基于千问官方 API 的受控 single Agent Runtime。深度思考主要映射到 provider 的 `enable_thinking` 与 `thinking_budget`，搜索和图片优先使用 provider 内置能力；app 自建 AgentLoop 只负责记忆、待办等业务工具。Server 完整保存 messages 和 summary，Agent 每轮通过 ContextBuilder 构造模型输入投影，并通过 ThoughtPresenter 输出可展示的深度思考事件。

