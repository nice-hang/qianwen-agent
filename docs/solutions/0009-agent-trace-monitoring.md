# Agent Trace 监控

## 状态

Implemented

## 对应 Roadmap

- Stage: Stage 7
- Step: Agent Trace 监控
- 相关验收项:
  - 能看到一次对话的完整执行链路
  - 能展开查看每轮 provider request 的 messages 和 tools
  - 能看到工具调用前后状态和耗时
  - 能对比相邻 provider request 的 messages/tools 增量

## 参考

- `claude-tap`: https://github.com/liaohch3/claude-tap

`claude-tap` 的核心价值不是“有一个 timeline”，而是把真实 API traffic 以可检查的方式保存和展示：system prompts、conversation history、tool schemas、tool calls、streaming responses、token usage、request diffs，并支持本地 live viewer 和 HTML export。

我们不需要做代理，也不需要支持外部 CLI。我们的 Agent Runtime 本来就在应用内，所以可以在 runtime 边界直接记录结构化 trace。

## 背景

当前 Stage 2 Debug 已能看到 run timeline、usage 和部分工具事件。但 Stage 5 agent loop 之后，真正影响模型行为的是每一轮 provider request：

- 本轮传给模型的 messages 是什么。
- 本轮可用 tools 是什么。
- 模型为什么决定调用工具。
- 工具调用参数是什么。
- 工具结果如何进入下一轮 provider request。
- 最终回答前一轮和后一轮的上下文差异是什么。

这些信息目前不完整。Stage 7 要把 Debug 从“事件列表”升级成“Agent Trace Viewer”。

## 目标

- 保存每轮 provider request 的 messages、tools、model、mode。
- 保存 provider response 的 usage、finishReason、duration、stream 摘要。
- 保存 tool call 前后的参数、结果摘要、耗时、错误状态。
- 展示一次 run 的完整链路：request -> tool call -> tool result -> next request -> final response。
- 支持相邻 provider request 的简单 diff，优先 messages/tools 增量。
- 保持本地开发调试定位优先，不做生产运营大盘。

## 非目标

- 不实现 HTTP 代理。
- 不拦截第三方 CLI。
- 不做自包含 HTML export。
- 不做团队共享或云端 trace。
- 不记录 provider API key、Authorization header 或上传文件原文。
- 不把 trace viewer 暴露为主聊天入口。

## 数据设计初稿

第一版优先复用现有 `agent_events`，通过更结构化的 `payloadJson` 保存 trace payload。暂不新增复杂表。

建议事件类型：

```txt
provider_request
provider_response
tool_call_started
tool_call_done
search_results
reasoning_delta
answer_delta
done
error
```

`provider_request.payloadJson`：

```ts
interface ProviderRequestTracePayload {
  requestId: string;
  iteration: number;
  model: string;
  mode: "fast" | "deep";
  messages: unknown[];
  tools: unknown[];
}
```

`provider_response.payloadJson`：

```ts
interface ProviderResponseTracePayload {
  requestId: string;
  iteration: number;
  finishReason?: string;
  usage?: TokenUsage;
  durationMs: number;
}
```

工具事件继续使用已有 payload，但补充：

- `durationMs`
- `isError`
- `resultSummary`
- `providerRequestId`

## UI 方案

在现有 Debug 视图上升级，不影响主聊天：

```txt
Debug
  Run List
  Run Detail
    Summary: model / mode / usage / total duration / event counts
    Request List:
      #1 provider_request
      #1 provider_response
      web_search call
      #2 provider_request
      #2 provider_response
    Detail Panel:
      Messages tab
      Tools tab
      Tool Result tab
      Diff tab
      Raw JSON tab
```

第一版功能：

- request card 展示 iteration、model、messages count、tools count、duration、usage。
- messages tab 按 role 折叠展示。
- tools tab 展示工具 name、description、schema。
- tool call card 展示 input/resultSummary/duration/error。
- diff tab 只比较相邻 request 的 messages 数量变化和新增 role 内容，不做复杂 AST diff。

## 脱敏策略

- 不记录 API key、Authorization、Cookie。
- Provider request 只记录 body 里的 messages/tools/model/mode，不记录 headers。
- 工具结果正文可能很长，trace 中保存 summary；完整结果只在必要时裁剪保存。
- `web_fetch` 正文最多保存裁剪后的前 N 字符。

## 实现计划

- [x] 基于 Stage 6 的 `provider_request` / `provider_response` 事件落库。
- [x] 复用现有 Debug API 返回 provider requests、responses、tool events 的 raw payload。
- [x] Debug Run Detail 增加 Request List。
- [x] 增加 messages/tools/raw JSON 详情面板。
- [x] 增加工具调用详情和耗时展示。
- [x] 增加相邻 provider request 的简单 diff。
- [ ] 用真实搜索 run 验证：request1 -> web_search -> request2 -> final answer。
- [x] 跑 `pnpm --filter @qianwen-agent/server typecheck`、`pnpm --filter @qianwen-agent/web typecheck` 和 `pnpm typecheck`。

## 待确认问题

- 是否需要长期保留完整 messages。第一版倾向本地开发保留，后续可加最大长度和清理策略。
- 是否需要 trace export。当前不做，等本地 viewer 稳定后再考虑。
- 是否把 reasoning/answer delta 全量保存。当前已有事件可记录，但 viewer 第一版优先展示聚合后的 response 摘要，避免 UI 噪声过大。

## 最终结论

Stage 7 第一版已完成。当前 Debug Run Detail 会从 `agent_events` 的 raw payload 中组装 Agent Trace：Provider Requests 显示每轮 model/mode/messages/tools/response duration/finish reason，并可展开查看 Messages、Tools、Diff 和 Raw JSON；Tool Calls 会按 `tool_call_started` / `tool_call_done` 配对，展示 input、output 和耗时。

## 验证记录

- `/Users/bytedance/.nvm/versions/node/v22.19.0/bin/pnpm --filter @qianwen-agent/web typecheck` 通过。
- `/Users/bytedance/.nvm/versions/node/v22.19.0/bin/pnpm --filter @qianwen-agent/server typecheck` 通过。
- `/Users/bytedance/.nvm/versions/node/v22.19.0/bin/pnpm typecheck` 通过。
