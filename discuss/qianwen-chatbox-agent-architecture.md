# 千问类 Chatbox Demo 架构讨论结论

本文沉淀一轮关于“做一个千问 App demo，Android、iOS、Web、服务端 + Agent”的技术取舍。目标不是复刻千问全量能力，而是做出一个链路清晰、能演示、可扩展的 AI Chatbox 核心系统。

## 1. Demo 的核心目标

实现重点不应是能力数量，而是打通现代 AI Chatbox 的核心链路：

```txt
RN / React Client
  -> Server API
  -> Agent Runtime
  -> Model Provider
  -> Built-in Tools
  -> Stream Events
```

推荐重点实现：

- 跨端聊天 UI：React Native 做 Android/iOS，React 做 Web。
- 流式输出：SSE 或 WebSocket，支持停止生成、重新生成、Markdown 渲染。
- 多模态输入：图片上传与图片理解应作为 P0。
- Agent Loop：模型可以自主决定是否调用工具。
- 内置工具：搜索、计算、待办/日程 mock、图片分析等。
- 深度思考 UI：展示过程摘要、工具进度、引用来源，而不是原始思维链。
- 记忆与上下文管理：完整消息存储，但模型输入只注入筛选后的上下文。

可以暂缓或不做：

- 完整 RAG 知识库，当前可以先不做。
- MCP 系统。
- 用户自定义 Skill 系统。
- 多 Agent / Subagent。
- LangGraph 固定编排。
- 插件市场、会员、支付、复杂登录体系。

## 2. 分层建议

推荐整体分为 6 层：

```txt
Client UI
  - RN: Android / iOS
  - React: Web

Shared Client SDK
  - API client
  - message schema
  - stream event parser

Server API / BFF
  - auth
  - conversation APIs
  - file/image upload
  - stream endpoint

Agent Runtime
  - AgentLoop
  - ContextBuilder
  - MemoryManager
  - ThoughtPresenter
  - ToolRegistry

Tools / Capabilities
  - web_search
  - image_analyze
  - calculator
  - todo_create

Storage / Model
  - messages
  - conversations
  - memories
  - files
  - model provider adapter
```

Demo 阶段，server 和 agent 可以放在同一个服务里，但代码上要分模块：

```txt
server/
  src/
    api/
    services/
    agent/
    tools/
    models/
    storage/
```

架构说明：

> 当前 demo 阶段把 API 服务和 Agent Runtime 放在同一个进程中，降低部署复杂度；但通过模块边界隔离 AgentLoop、ToolRegistry、ModelProvider。后续如果 Agent 任务变重或需要独立扩缩容，可以把 agent 模块拆成独立服务。

## 3. 底层应该是 Agent Loop，而不是固定编排

现代 Chatbox 对普通聊天可能只是一次模型调用；但一旦涉及搜索、图片、文件、数据分析、网页操作、外部工具，就更接近 agent loop。

不建议做固定工作流：

```txt
意图识别
  -> 如果是搜索就 search
  -> 如果是图片就 vision
  -> 如果是计算就 calculator
  -> 最后总结
```

推荐做受控 Agent Loop：

```txt
while step < maxSteps:
  context = buildContext()
  response = llm.chat(messages=context.messages, tools=availableTools)

  if response is final_answer:
    stream final answer
    break

  if response has tool_calls:
    validate tool call
    execute tool
    append tool result
    continue
```

服务端负责约束边界：

- 最大循环次数。
- 工具权限。
- 参数校验。
- 超时控制。
- 高风险操作确认。
- 工具执行。
- 流式事件。
- trace 与日志。

模型负责在 loop 中自主决定是否调用工具、调用哪个工具、是否继续调用。

## 4. Skill 和 MCP 暂时不需要

对于千问类 C 端 Chatbox demo，不需要实现完整 Skill 系统和 MCP 系统。

原因：

- Skill/MCP 更偏开发者生态或插件生态。
- 当前产品设定是云端内置能力，而不是让用户添加自定义工具。
- Demo 重点应放在多模态 agent loop、流式体验、上下文管理和内置工具能力上。

保留一个轻量 ToolRegistry 即可：

```ts
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(args: unknown, ctx: RunContext): Promise<ToolResult>;
}
```

架构表达：

> 当前 demo 面向 C 端 Chatbox，工具都是云端内置能力，所以没有实现 Skill/MCP 生态。服务端只保留 ToolRegistry 抽象，后续如果要做开发者平台，可以通过 MCPAdapter 或 SkillRegistry 接入外部能力。

## 5. 图片理解应作为 P0

图片能力比 RAG 更适合当前 demo 优先实现。

推荐支持：

- 上传图片。
- 前端展示缩略图。
- server 存储图片元信息。
- message 中带 image URL 或可访问引用。
- 多模态模型分析图片。
- 结合工具调用生成最终答案。

适合演示的场景：

- 上传页面截图，让 AI 分析 UI 问题。
- 上传表格/票据，提取信息并计算。
- 上传白板/手写图，总结要点。
- 上传商品图，识别内容并生成描述。

不建议优先做生图。图片理解更贴近 Chatbox 主链路。

## 6. RAG 可以暂缓

RAG 对千问类产品有价值，但当前可以先不做。

如果后续要做，推荐只做 RAG-lite：

```txt
文件上传
  -> 文本解析
  -> chunk
  -> embedding
  -> topK 检索
  -> 拼进上下文
  -> 模型回答并附来源
```

当前阶段可以把优先级定为：

```txt
图片理解 > Agent Loop > 工具调用 > 深度思考事件流 > 记忆/上下文管理 > RAG-lite
```

## 7. 深度思考不是原始模型思维链

“深度思考”是产品层概念，不等于模型原始 thinking / reasoning 内容。

可以分三层理解：

```txt
真实执行层
  - model reasoning
  - tool calls
  - agent loop

后端归一层
  - reasoning summary
  - tool events
  - source summary
  - phase events

前端展示层
  - 深度思考卡片
  - 正在搜索
  - 参考了 N 篇结果
  - 正在整理答案
```

前端不应该展示完整工具链和内部推理，只展示后端整理后的展示事件。

推荐事件协议：

```ts
type AgentEvent =
  | { type: "phase"; phase: "thinking"; title: string }
  | { type: "thinking_summary"; text: string }
  | { type: "tool_progress"; label: string }
  | { type: "sources_found"; count: number; sources: Source[] }
  | { type: "phase"; phase: "answering"; title: string }
  | { type: "answer_delta"; text: string }
  | { type: "done" };
```

后端可以引入 `ThoughtPresenter`：

```ts
class ThoughtPresenter {
  onToolCall(call) {
    if (call.name === "web_search") {
      return { type: "tool_progress", label: "正在搜索相关资料" };
    }
  }

  onToolResult(result) {
    if (result.sources?.length) {
      return {
        type: "sources_found",
        count: result.sources.length,
        sources: result.sources,
      };
    }
  }
}
```

如果模型支持 reasoning summary，就用模型摘要；如果只支持 raw thinking，可内部缓存后压缩；如果模型不暴露 thinking，也可以根据工具事件合成过程摘要。

## 8. 搜索为什么发生在“思考阶段”

Agent loop 中，模型不是一边生成最终回答一边偷偷搜索，而是先输出结构化 tool call：

```json
{
  "type": "tool_call",
  "name": "web_search",
  "arguments": {
    "query": "Agent loop vs workflow"
  }
}
```

server 收到后暂停当前模型调用，执行搜索，再把 tool result 作为上下文喂回模型继续推理。

产品 UI 把这些中间事件包装成“深度思考中”：

```txt
深度思考中
  - 正在分析问题
  - 正在搜索相关资料
  - 参考了 17 篇结果
  - 正在整理答案
```

因此，“参考了 N 篇结果”通常来自 search tool 的实际返回，而不是模型凭空生成。

## 9. 完整消息存储与模型上下文注入要分开

server 必须完整保存 messages，但 agent 不应该每次注入全量历史。

建议职责划分：

```txt
ConversationStore
  - 保存完整 user message
  - 保存完整 assistant message
  - 保存 tool call / tool result
  - 保存 image/file metadata
  - 用于前端展示、审计、重跑

ContextBuilder
  - 构造本次模型输入
  - 选择最近消息
  - 注入会话摘要
  - 注入长期记忆
  - 注入附件信息
  - 压缩工具结果
  - 控制 token budget
```

每次模型看到的不是完整历史，而是一个临时构造的 `Model Input Projection`。

推荐模型输入结构：

```txt
system instruction
developer instruction
conversation summary
user memory
recent N messages
current image/file references
current user message
```

注意事项：

- 当前用户输入必须保留。
- 最近几轮对话完整保留。
- 旧消息进入 conversation summary。
- 长期偏好进入 user memory。
- 工具结果只保留摘要、来源和必要结构化字段。
- 如果保留 assistant tool call，必须保留对应 tool result，保证消息结构合法。

更新摘要建议在一轮结束后异步做：

```txt
agent final answer done
  -> save assistant message
  -> if history exceeds threshold
  -> update conversation_summary
  -> keep original messages unchanged
```

核心表达：

> Server 完整持久化 conversation messages，但 Agent 不直接消费全量历史。每次 run 前由 ContextBuilder 根据 token budget 构造 model input projection：当前问题、最近对话、会话摘要、用户长期记忆、相关附件和必要工具结果。完整历史用于展示和审计，压缩后的上下文用于模型推理。

## 10. 记忆怎么做

推荐先做三类记忆：

### 短期记忆

当前会话最近 N 轮消息，用于保持多轮连续性。

### 会话摘要

当会话变长后，把旧消息压缩为 summary：

```txt
本会话之前主要讨论了千问 App demo 架构，用户选择 RN + React，server 和 agent 同服务，底层采用 Agent Loop，不做 MCP/Skill/RAG。
```

### 用户长期记忆

只保存稳定事实和偏好：

- 用户正在实现千问类 Chatbox demo。
- 用户偏好 RN + React。
- 用户希望架构表达工程化。
- 当前项目是千问类 Chatbox。

可以设计为：

```ts
interface UserMemory {
  userId: string;
  key: string;
  value: string;
  type: "preference" | "profile" | "project";
  confidence: number;
  sourceMessageId: string;
  updatedAt: string;
}
```

不要把文档、网页、图片分析结果都塞进长期用户记忆。长期记忆只放稳定偏好和项目事实。

## 11. 推荐最终 MVP

建议最终 demo 做到：

- RN + React 两端共享消息协议。
- Server 提供聊天、图片上传、会话历史接口。
- AgentRuntime 使用 single agent loop。
- 支持普通聊天和深度思考模式。
- 支持图片理解。
- 支持 2-3 个内置工具。
- 支持深度思考事件流。
- 完整 messages 落库。
- ContextBuilder 做上下文筛选和摘要注入。
- 不做 MCP、Skill、Subagent、LangGraph 固定编排。

一句话架构定位：

> 这是一个面向 C 端 Chatbox 的云端 Agent Runtime。核心不是固定流程编排，而是受控 single agent loop：server 负责上下文、权限、工具执行、记忆和流式事件，模型负责在 loop 中自主决定是否调用工具。图片理解是 P0，RAG、MCP、Skill 和 Subagent 作为后续扩展点。
