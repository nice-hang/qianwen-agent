# Agent Trace 体验重构

## 状态

Implemented

## 对应 Roadmap

- Stage: Stage 11
- Step: Agent Trace UX Refactor
- 相关验收项:
  - 顶部最多展示 4 个核心指标，避免第一屏信息过载
  - 核心指标优先展示，并提供中文短解释
  - 能逐轮查看传给模型的 messages、tools 和收到的 provider response
  - 能查看每次工具调用的入参、返回值、摘要、耗时和错误
  - 能区分模型请求、工具调用、文件 RAG、深度思考和最终回答
  - Trace 视图服务面试讲解和 Agent 工程调试

## 背景

当前 Trace Viewer 已经能展示 run、事件 timeline、provider request、tools 和 raw JSON，但它更像工程日志：

- 一轮对话的主路径不够直观，需要逐条事件翻。
- 指标多用英文缩写，TTFE / TTFR / TTFA / TTC 对面试官或非实现者不够友好。
- 重要指标没有优先级，token、耗时、工具次数、RAG 命中等信息散在不同位置。
- Stage 10 引入文件 RAG 后，链路已经从“单次模型请求”变成“文件检索 / 模型请求 / 工具调用 / 回答”的复合链路，更需要一个可下钻的 Trace 面板。

因此 Stage 11 先重构 Trace 体验，把原本的会话摘要顺延到 Stage 12。这个阶段不优先新增 Agent 能力，而是让已有 Agent 行为可观察、可解释、可展示。

## 目标

- 把单个 run 展示成简洁总览 + 逐轮模型审计，而不是事件日志列表。
- 顶部最多展示 4 个做 Agent 的人和面试官最关注的核心指标。
- 所有指标都使用中文名称和短解释，英文缩写作为辅助。
- 每一轮模型请求都能清楚看到本轮传入的 messages、tools、收到的 response 和 SSE/事件摘要。
- 每一次工具调用都能清楚看到 arguments、raw output、summary、sources、耗时和错误。
- 保留 raw JSON、请求 JSON、cURL 和相邻轮次 diff，但放到二级区域，避免第一屏太吓人。
- 支持快速判断一次回答为什么慢、为什么没搜、为什么没命中文件、token 花在哪里。

## 非目标

- 不改 trace 存储表结构，优先基于现有 `AgentRun` / `AgentEvent` 聚合。
- 不做实时火焰图或复杂性能 profiler。
- 不做多 run 聚合分析或运营看板。
- 不引入新的 observability 服务。
- 不改变主聊天链路和 Agent Runtime 行为。

## 指标优先级

第一屏只保留这些指标：

1. **总耗时 TTC**
  - 中文：总完成耗时
  - 含义：从请求开始到回答完成的总时间。
  - 面试关注点：用户体感速度，端到端链路是否可控。
2. **首字时间 TTFA**
  - 中文：首个回答字耗时
  - 含义：用户多久看到第一个正式回答 token。
  - 面试关注点：流式体验是否好，是否被工具/RAG/思考拖慢。
3. **模型耗时 Provider Latency**
  - 中文：模型请求耗时
  - 含义：provider request 到 provider response 的耗时。
  - 面试关注点：慢在模型还是慢在本地 RAG / 工具。
4. **Token 用量**
  - 中文：总 Token
  - 含义：本轮模型总 token 消耗。
  - 面试关注点：成本、上下文膨胀、深度思考开销。

TTFE、TTFR、工具调用、文件 RAG 命中等信息不再放顶部指标区，改到逐轮模型审计、工具专区、RAG 专区或原始事件里查看。

## 视图结构

### 1. Run Header

展示：

- 会话标题 / run 状态 / 模式：快速 or 深度思考
- 用户问题摘要
- 开始时间、结束时间
- 成功 / 失败原因

### 2. 核心指标卡片

第一排：

```txt
总完成耗时 TTC
首字耗时 TTFA
模型请求耗时
总 Token
```

每个指标只带很短的小字解释，例如：

```txt
首字耗时
TTFA · 流式体感
```

### 3. Provider Request 面板

保留当前已有能力，但更产品化。参考形态是“左侧按模型请求轮次导航，右侧展示本轮请求/响应/事件/完整 JSON”：

- 左侧请求列表：
  - 轮次：模型请求 #1 / #2 / #3
  - 模型名、模式、请求时间
  - input / output / reasoning / total token
  - 本轮是否触发工具调用
- 右侧顶部操作：
  - 请求 JSON
  - cURL
  - 对比上次
  - 完整 JSON
- 本轮请求内容：
  - `messages` 按 role 分组展示：system / user / assistant / tool
  - 每条 message 展示 role、content 摘要、完整 content、附件/文件上下文标记
  - `tools` 展示 name、description、parameters schema
  - 支持搜索 messages / tools / prompt 文本
- 本轮响应内容：
  - provider response 原始摘要：finishReason、usage、durationMs
  - assistant delta 聚合后的回答文本
  - tool call delta 聚合后的工具调用列表
  - deep mode 下 reasoning 聚合文本
- SSE / Agent 事件：
  - 本轮产生的 `reasoning_delta` / `answer_delta` / `tool_call_started` / `tool_call_done` / `search_results` 等事件
  - 支持按事件类型过滤
- 对比上次：
  - messages 新增了什么
  - tools 是否变化
  - tool result 如何进入下一轮 messages

验收上必须能回答三个问题：

```txt
这一轮模型到底看到了哪些 messages？
这一轮模型可用哪些 tools？
模型返回了什么，为什么进入下一轮？
```

### 5. RAG / Tool 专区

当 run 有文件检索时展示：

- query
- chunkCount
- injectedChars
- embeddingMs
- 命中文件名、页码、chunk index、score、preview

当 run 有工具调用时展示：

- tool name
- arguments
- raw output
- summarized output
- sources
- duration
- error

工具调用详情需要和 provider 轮次关联：

```txt
模型请求 #1
  -> tool_call_started web_search {"query":"..."}
  -> tool_call_done web_search raw output / summary / sources
模型请求 #2
  -> messages 中出现 tool result
  -> assistant final answer
```

这样面试时可以清楚说明：模型先看到了什么，为什么决定调工具，工具返回了什么，返回值如何进入下一轮模型输入。

## 实现计划

- 梳理现有 trace event 类型，定义前端聚合模型 `RunTraceSummary`。
- 在 Web DebugView 内新增 run 总览 header 和核心指标卡片。
- 顶部指标收敛为 TTC / TTFA / Provider Latency / Total Token 四项，并缩短解释文案。
- 移除阶段化“执行过程”模块，避免第一屏信息过载。
- 重做 Provider Request 面板，按模型请求轮次展示 messages、tools、response、SSE 事件和完整 JSON。
- 支持每轮 request 的 cURL / 请求 JSON / 对比上次。
- 将 tool call 与 provider request 轮次关联，展示 arguments、raw output、summary、sources、duration 和 error。
- 新增 RAG 命中专区：展示 query、chunk、score、注入字符数和耗时。
- 新增工具调用专区：展示参数、耗时、结果摘要和错误。
- 保留 raw JSON 折叠入口，作为调试兜底。
- 用普通聊天、深度思考、文件 RAG 历史 run 验证 trace 聚合展示。
- 用 desktop 截图检查第一屏是否能直观看到核心链路。

## 实现记录

- Web DebugView 已重构为 Stage 11 Trace 工作台：左侧 run 列表，右侧展示简洁 run 总览、逐轮模型审计、工具调用返回值、文件 RAG 命中和原始事件。
- 指标第一屏收敛为中文优先的 4 项：总完成耗时 TTC、首字耗时 TTFA、模型请求耗时 Provider、总 Token。
- Provider request 面板按模型请求轮次展示：请求 JSON、cURL、对比上次、完整 JSON、messages、tools、provider response 和本轮 SSE / Agent events。
- Agent Runtime 在 `tool_call_done` 事件中新增 `rawOutput`，Trace 可以展示工具原始返回值，同时保留摘要 `output` 用于快速浏览。
- 文件 RAG trace 展示 query、命中 chunk 数、注入字符数、embedding 耗时、chunk score、文件名和预览。
- 已执行 `pnpm typecheck`，并用本地 Web 页面检查 Stage 11 Trace 关键文案和桌面布局，浏览器控制台无 error。

## 待确认问题

- 是否需要后端新增聚合 API。第一版倾向前端基于 `/debug/runs/:id` 聚合，避免改存储。
- 当前 `provider_request` / `provider_response` 已经能覆盖 messages、tools 和 response usage；如果要展示完整 provider 原始响应或完整 SSE delta，需要确认 trace 里是否已经足够记录，缺失时只补必要事件字段。
- 文件 RAG 不再进入 assistant sources 后，Trace 是否成为唯一文件命中展示入口。当前倾向是：聊天页不展示文件 source，Trace 页展示 RAG 命中。
- 是否继续压缩顶部总览。当前已移除执行过程模块，并将指标解释压成固定短文案。

## 最终结论

Stage 11 第一版已落地。当前实现优先服务面试讲解和工程调试：顶部只看 4 个核心指标，然后下钻到每轮 provider request 的 messages、tools、response，以及工具/RAG 的真实输入输出。