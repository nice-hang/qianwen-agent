# Agent Loop 与自建联网搜索

## 状态

Partially Implemented

## 对应 Roadmap

- Stage: Stage 5
- Step: Agent Loop + 自建联网搜索
- 相关验收项:
  - Agent Runtime 支持模型自主决定是否调用工具
  - 模型可调用 `web_search` 和 `web_fetch`
  - 前端能看到搜索过程状态
  - 有搜索结果时能展示来源数量和来源列表
  - Debug 能记录工具调用、搜索 query、来源和耗时

## 背景

当前 `agent-runtime` 是一次性 provider stream 封装：

```txt
runAgent
  -> buildProviderMessages
  -> Qwen stream
  -> yield reasoning_delta / answer_delta / done
```

这足够支撑普通聊天和深度思考，但不适合自建搜索工具。联网搜索如果只靠 runtime 规则判断，会把“是否需要搜索”写死在关键词规则里，无法理解用户真实意图，也不利于后续记忆、网页抓取、文件检索等外部工具能力。

真实千问 Web 行为更接近 `auto search`：

- 普通模式下，时效性问题会自动搜索并展示来源。
- 普通知识解释问题不会搜索。
- 思考模式下，搜索过程更完整地出现在思考区里。
- 来源以「参考了 N 篇结果 / N 篇来源」形式出现，点击后展示右侧来源面板。

阿里云百炼文档显示，OpenAI 兼容 Chat Completions 支持基础联网搜索，但不支持结构化返回搜索来源、角标引用标注和提前返回搜索来源。OpenAI 兼容 Responses API 能返回工具调用过程和工具调用次数，但仍不稳定提供 `title/url/siteName/snippet` 这类来源列表。DashScope 原生 Generation API 可通过 `enable_source` 返回 `output.search_info.search_results`，但会引入第二套 provider 协议和响应解析。

因此 Stage 5 改为先建设 Agent Loop，再用自建 `web_search` / `web_fetch` 工具提供可控来源数据。

## 目标

- 将 `runAgent` 内部升级为轻量 agent loop。
- 保持 `@qianwen-agent/agent-runtime` public API 不变。
- 让模型通过 tool calling 自主决定是否搜索，而不是 runtime 用关键词规则决定。
- 第一版支持 `web_search` 和 `web_fetch` 两个工具。
- 工具结果同时供模型回答和前端来源展示使用。
- 输出工具过程事件，让 UI 在最终 answer token 前有明确进度反馈。
- 将搜索来源持久化到 assistant message，刷新后来源 chip 和右侧栏仍可恢复。
- 为后续记忆、文件检索、代码执行等外部工具能力预留自然扩展点。

## 非目标

- 不引入 LangGraph。
- 不引入通用 Runtime class。
- 不引入复杂 ToolRegistry class。
- 不做多 agent / subagent。
- 不做 MCP。
- 不做完整 RAG。
- 不在前端暴露搜索开关。
- 不修改 UI 让用户传 `search: auto | off | force`。
- 不在第一版实现复杂搜索排序、来源可信度评分或引用严格对齐。

## 关键取舍

### 1. 为什么不直接用 Qwen `enable_search`

Qwen OpenAI-compatible `enable_search` 最小接入成本低，但无法稳定拿到结构化 sources。这样只能让模型联网回答，无法复刻千问的来源 chip 和右侧来源栏。

DashScope 原生协议可以返回 sources，但会让 provider 层同时维护 OpenAI-compatible 和 DashScope 两套请求/stream/parser。当前更想沉淀的是产品自己的 agent 能力，而不是被某个 provider 的搜索协议绑定。

结论：Stage 5 不优先使用 provider 内置搜索作为产品主路径。

### 2. 为什么不使用关键词规则判断搜索

规则判断能减少一次模型决策成本，但容易错：

- “今天杭州天气”应该搜。
- “解释 JavaScript 闭包”不应该搜。
- “结合最近两周 AI 新闻总结趋势”可能需要多次搜索和综合。

这些判断更适合交给模型。Agent loop 的首 token 会更晚，但可以通过 `tool_call_started`、`search_started`、`search_results` 等事件让用户先看到进度。

结论：是否搜索由模型通过 tool call 决定。

### 3. 为什么先做轻量 loop 而不是完整 Agent 框架

当前真实需求只有一个工具族：联网搜索。完整 Agent 框架会引入过多抽象、生命周期和状态管理。

第一版只需要：

```txt
while iteration < maxToolIterations:
  call model with tools
  if model calls tool:
    execute tool
    append tool result
    continue
  stream final answer
  break
```

结论：做函数式 orchestration，不做 class 化框架。

### 4. 为什么先做两个工具

只做 `web_search` 可以最快展示来源，但 snippet 经常不够回答复杂问题。

第一版保留两个工具：

- `web_search(query)`：获取候选来源。
- `web_fetch(url)`：抓取少量网页正文，补充 snippet 不足的问题。

`web_fetch` 会严格限制数量、超时和正文长度，避免把系统做重。

## 事件协议初稿

在 `packages/shared` 增加当前真实需要的事件：

```ts
type AgentEvent =
  | { type: "tool_call_started"; toolName: string; toolCallId: string; input?: unknown }
  | { type: "tool_call_done"; toolName: string; toolCallId: string; output?: unknown }
  | { type: "search_results"; toolCallId: string; query: string; sources: SearchSource[] }
  | { type: "reasoning_delta"; text: string }
  | { type: "answer_delta"; text: string }
  | { type: "done"; ... }
  | { type: "error"; ... };
```

`SearchSource` 初稿：

```ts
interface SearchSource {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  siteName?: string;
  publishedAt?: string;
}
```

事件命名保持产品含义清晰，不暴露 provider 私有字段。

## Agent Loop 初步设计

```txt
runAgent(input, options)
  -> normalize runtime config
  -> messages = buildProviderMessages(input.messages)
  -> loopState = []

  for iteration in 0..maxToolIterations:
    stream = qwen.streamChat({ messages, tools, tool_choice: "auto" })

    if stream returns tool calls:
      for each tool call:
        yield tool_call_started
        result = executeTool(toolCall)
        yield tool_call_done
        if tool is web_search:
          yield search_results
        append assistant tool_call message
        append tool result message
      continue

    stream final answer deltas
    yield done
    return

  yield fallback final answer or error
```

第一版限制：

- `maxToolIterations = 3`
- 每轮最多执行少量工具调用
- 只允许 `web_search` 和 `web_fetch`
- 工具失败转成 tool result，由模型决定如何解释
- 不把工具输出直接拼进最终 answer，最终答案仍由模型生成

## Provider 变更

Qwen OpenAI-compatible Chat Completions 继续作为主模型接口，但需要补齐 tool calling 支持：

- 请求增加 `tools` 和 `tool_choice: "auto"`。
- stream parser 支持 `delta.tool_calls`。
- 支持 `finish_reason: "tool_calls"`。
- 工具调用轮不向 UI 输出 `answer_delta`。
- 最后一轮模型不再调用工具时，才输出 `answer_delta`。

深度思考仍沿用现有 `reasoning_content` 解析。是否能在工具决策轮稳定返回 reasoning，不作为第一版验收前提。

## 工具设计

### `web_search`

输入：

```ts
interface WebSearchInput {
  query: string;
}
```

输出：

```ts
interface WebSearchOutput {
  query: string;
  sources: SearchSource[];
}
```

第一版搜索 provider 待实现前确认，可选：

- Tavily
- Brave Search
- Bing Search
- SerpAPI
- 其他国内可用搜索服务

工具输出给模型时控制长度，只注入 top results 的标题、URL、snippet 和站点名。

### `web_fetch`

输入：

```ts
interface WebFetchInput {
  url: string;
}
```

输出：

```ts
interface WebFetchOutput {
  url: string;
  title?: string;
  text: string;
}
```

第一版限制：

- 单轮最多抓取 1-3 个 URL。
- 单网页正文裁剪到固定字符数。
- 超时快速失败。
- 不执行网页脚本。
- 不处理登录页、PDF、图片、视频等复杂资源。

## 与图片理解的关系

图片理解不是 Stage 5 的工具扩展示例。MVP 图片理解应作为 multimodal input 进入 provider message projection，而不是通过 `image_analyze` 工具调用。

图片问题的基础链路应该是：

```txt
UI 上传图片
  -> Server 保存 attachment
  -> Chat message 携带 attachmentIds
  -> buildProviderMessages
       user content = [
         { type: "text", text },
         { type: "image_url", image_url }
       ]
  -> Qwen vision model
  -> answer_delta
```

因此 Stage 5 的 agent loop 和后续图片理解是正交能力：

- Agent loop 负责模型自主调用外部工具，如 `web_search`、`web_fetch`、`memory_search`、`memory_write`。
- Multimodal projection 负责把用户上传的图片作为模型输入。
- 同一轮请求未来可以组合二者，例如“看这张商品截图，并搜索它的最新价格”。

这意味着 Stage 5 的工具表不能假设所有未来能力都是 tool；`buildProviderMessages` 也不能被搜索上下文绑定死，后续仍要能自然加入 image content parts。

## 前端展示方案

第一版 UI 不提供搜索开关。

流式中：

- 收到 `tool_call_started(web_search)`：显示“正在搜索”。
- 收到 `search_results`：在思考区或回答前显示「参考了 N 篇结果 >」。
- 最终答案仍使用 MarkdownRenderer。

完成后：

- assistant message 展示来源 chip。
- 点击 chip 打开右侧来源 drawer。
- drawer 展示 sources 列表：标题、站点名、摘要、URL。

移动端后续用 bottom sheet 或全屏层，第一版可先保证 desktop。

## Server / DB / Debug

Server 需要将新增 AgentEvent 继续写入 `agent_events`。

第一版直接在 assistant message 增加 `sourcesJson`，用于保存本轮回答引用过的搜索来源：

```txt
messages.sources_json TEXT NULL
```

存储内容为 `SearchSource[]` 的 JSON string。当前阶段不单独建 `message_sources` 表，原因是：

- 来源只服务 assistant message 展示，不需要跨消息查询。
- 第一版不做来源去重、引用统计或站点分析。
- SQLite 中 JSON string 足够恢复 UI。
- 等后续需要按来源检索、统计或引用级别持久化时，再拆表。

Server 在流式过程中收集 `search_results.sources`，最终保存 assistant message 时写入 `sourcesJson`。历史消息 API 读取后把它还原为 `message.sources` 或等价字段，Web 刷新后仍能展示来源 chip 和右侧栏。

Debug 需要展示：

- tool call id
- tool name
- input
- output 摘要
- duration
- search sources count

## 实现计划

- [x] 更新 roadmap：Stage 5 改为 Agent Loop + 自建联网搜索。
- [x] 新增 shared `SearchSource` 和工具事件类型。
- [x] Prisma message 增加 `sourcesJson` 字段并生成 migration。
- [x] 扩展 Web stream reducer 支持工具事件，先以最小状态保存 sources。
- [x] 扩展 Qwen provider 请求，支持 `tools` / `tool_choice`。
- [x] 扩展 Qwen stream parser，支持 tool call delta 聚合。
- [x] 在 `agent-runtime` 增加函数式 loop orchestration。
- [x] 增加内置 `web_search` / `web_fetch` 工具并验证 loop。
- [x] 接入 Tavily 作为第一版真实搜索 provider，使用 `TAVILY_API_KEY` 开启。
- [x] 前端展示来源 chip 和右侧 drawer。
- [x] 历史消息恢复来源 chip 和右侧 drawer。
- [x] Debug 展示工具事件。
- [x] 跑 agent-runtime、server、web 和全仓 typecheck。

## 实现记录

- `packages/shared` 增加 `SearchSource`、`tool_call_started`、`tool_call_done`、`search_results`。
- `messages` 表增加 `sourcesJson`，并新增 `20260530125000_add_message_sources` migration。
- Server 在流式过程中收集 `search_results.sources`，保存 assistant message 时写入 `sourcesJson`。
- 历史消息 mapper 会把 `sourcesJson` 还原为 `message.sources`。
- Qwen OpenAI-compatible 请求支持 `tools` 和 `tool_choice: "auto"`。
- Qwen stream parser 支持 `delta.tool_calls` 和 `finish_reason`。
- `runAgent` 改为最多 3 轮函数式 agent loop。
- 内置工具表包含 `web_search` 和 `web_fetch`，但没有引入 ToolRegistry class。
- `web_search` 在配置 `TAVILY_API_KEY` 时调用 Tavily Search API；未配置时返回无来源和明确 note。
- `web_fetch` 支持抓取普通 http/https 页面并抽取裁剪后的文本。
- Web 流式 reducer 支持 `search_results`，会把 sources 合并到当前 assistant message。
- Web 在 `tool_call_started` / `tool_call_done` 之间显示“正在搜索...”或“正在打开网页...”。
- ChatView 增加「参考了 N 篇结果」chip 和右侧来源 drawer。

## 验证方式

- `pnpm --filter @qianwen-agent/agent-runtime typecheck`
- `pnpm --filter @qianwen-agent/server typecheck`
- `pnpm --filter @qianwen-agent/web typecheck`
- `pnpm typecheck`
- 手工验证：
  - 普通知识问题不调用搜索工具。
  - 时效问题调用 `web_search` 后再输出答案。
  - 复杂问题可触发 `web_search` + `web_fetch`。
  - 刷新页面后，已完成回答仍能展示来源 chip 和来源列表。
  - 搜索失败时最终回答能优雅说明或基于已有知识回答。
  - answer 首 token 出现在工具调用完成后的最终模型轮。

## 验证记录

- `/Users/bytedance/.nvm/versions/node/v22.19.0/bin/pnpm --filter @qianwen-agent/agent-runtime typecheck` 通过。
- `/Users/bytedance/.nvm/versions/node/v22.19.0/bin/pnpm --filter @qianwen-agent/server typecheck` 通过。
- `/Users/bytedance/.nvm/versions/node/v22.19.0/bin/pnpm --filter @qianwen-agent/web typecheck` 通过。
- `/Users/bytedance/.nvm/versions/node/v22.19.0/bin/pnpm typecheck` 通过。
- 已运行 mocked Qwen stream 验证 agent loop 事件顺序：
  - `tool_call_started`
  - `tool_call_done`
  - `search_results`
  - `answer_delta`
  - `done`
- 已运行 `pnpm --filter @qianwen-agent/server prisma migrate deploy`，本地 SQLite 已应用 `sourcesJson` migration。
- 已用本地临时 source message 验证刷新后来源 chip 可恢复，点击后右侧来源 drawer 可展示标题、站点和摘要；验证后已删除临时会话。

## 已知风险

- Tool calling stream parser 会比当前 answer/reasoning parser 复杂。
- Agent loop 会增加 TTFA，需要靠搜索进度事件降低等待感。
- 搜索 API 选择会影响成本、稳定性和中文搜索质量。
- `web_fetch` 容易遇到网页反爬、正文抽取噪声和 prompt injection。
- `sourcesJson` 暂时是 JSON string，未来如果需要来源级查询或引用统计，需要迁移为独立表。

## 待确认问题

- 是否继续使用 Tavily 作为默认搜索 provider，还是切到 Brave/Bing/其他国内搜索服务。
- 是否需要为搜索 provider 增加配置化超时和最大结果数。
- 是否需要补 Playwright 截图验证来源 drawer 的桌面/移动端视觉状态。

## 最终结论

待实现后更新。

## 后续演进

- 如果来源需要跨消息查询、统计或精确引用，再从 `sourcesJson` 迁移到 `message_sources` 表。
- 加入引用 marker 与来源列表映射。
- 增加网页正文清洗和 prompt injection 防护。
- 增加 search trace 指标：TTFS、search latency、fetch latency。
- 将 `web_search` / `web_fetch` 的 loop 机制扩展到文件检索、记忆检索和代码执行。
- 图片理解走 multimodal input；未来支持图片输入与搜索工具在同一轮 agent loop 中组合。
