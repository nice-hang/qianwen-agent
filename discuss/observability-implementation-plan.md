# 可观测层技术实现规划

本文记录千问类 Chatbox demo 的可观测层实现规划。第一版目标不是做产品运营大盘，而是服务开发调试：看清楚一次回答发生了什么、哪里慢、哪里失败、token 消耗多少。

## 1. 可观测层定位

可观测层横切 UI、Server、Agent 和 Qwen Provider。

第一版重点：

- Run trace。
- Agent 执行时间线。
- 关键性能体验指标。
- Token / usage / 成本。
- 错误定位。
- Debug 可视化。

第一版不做：

- DAU/WAU。
- 用户留存。
- 来源点击率。
- copy rate。
- 点赞/点踩分析。
- 功能漏斗。
- 复杂 APM。
- 产品运营大盘。

一句话：

> 第一版可观测只服务开发和调试，不做产品增长分析。

## 2. 需要回答的问题

一次回答结束后，应该能回答：

- 这次 run 是 fast 还是 deep？
- 用了哪个模型？
- 是否开启搜索？
- 是否包含图片？
- ContextBuilder 花了多久？
- 千问 provider 多久返回第一个事件？
- 首个 reasoning 什么时候出现？
- 首个 answer token 什么时候出现？
- 总耗时多少？
- reasoning token 消耗多少？
- input/output token 各多少？
- 是否失败或被中断？
- 如果失败，失败在哪一步？

## 3. 核心指标

### TTFE

Time To First Event。

从 server 接收到 `/api/chat/stream` 请求，到第一个事件写给前端的时间。

```txt
TTFE = first_event_at - request_started_at
```

用于判断用户是否很快看到“正在思考/处理中”。

### TTFR

Time To First Reasoning。

从请求开始，到首次 `reasoning_delta` 或 `thinking_summary` 出现。

```txt
TTFR = first_reasoning_at - request_started_at
```

只在 deep/thinking 模式下有意义。

### TTFA / TTFT

Time To First Answer / Time To First Token。

从请求开始，到首次 `answer_delta` 出现。

```txt
TTFA = first_answer_delta_at - request_started_at
```

在 Chatbox 场景里可以把 TTFT 定义为“首个可见答案 token 时间”。为避免和 reasoning token 混淆，文档中优先使用 TTFA。

### TTC

Time To Completion。

从请求开始，到 `done` / completed 的总耗时。

```txt
TTC = completed_at - request_started_at
```

### Provider Latency

千问 provider 调用耗时。

```txt
provider_latency = provider_request_done_at - provider_request_start_at
```

### Context Build Latency

ContextBuilder 构造模型输入耗时。

```txt
context_build_latency = context_built_at - context_build_start_at
```

### Stream Duration

从首个 answer token 到完成的时间。

```txt
stream_duration = completed_at - first_answer_delta_at
```

### Token Usage

记录：

- input_tokens
- output_tokens
- reasoning_tokens
- total_tokens
- estimated_cost

重点观察：

- deep 模式相比 fast 模式的 token 放大倍数。
- reasoning_tokens 占比。
- 图片请求的 token/成本变化。

## 4. 数据表

第一版最少三张表：

```txt
agent_runs
agent_events
model_usages
```

### agent_runs

记录一次回答的总体状态和核心指标。

```txt
agent_runs
  id
  conversation_id
  user_message_id
  assistant_message_id
  mode              // fast | deep
  search            // auto | off | force
  model
  status            // running | completed | aborted | failed
  started_at
  completed_at
  total_latency_ms
  ttfe_ms
  ttfr_ms
  ttfa_ms
  provider_latency_ms
  context_build_latency_ms
  stream_duration_ms
  image_count
  error
  created_at
  updated_at
```

### agent_events

记录关键事件时间线。不要保存所有 token delta。

```txt
agent_events
  id
  run_id
  type
  payload_json
  offset_ms
  created_at
```

建议保存：

- `run_created`
- `context_build_start`
- `context_built`
- `provider_request_start`
- `first_event`
- `first_reasoning`
- `first_answer_delta`
- `sources_found`
- `tool_start`
- `tool_result`
- `tool_error`
- `provider_request_done`
- `assistant_message_saved`
- `summary_update_start`
- `summary_update_done`
- `run_completed`
- `run_failed`
- `run_aborted`

对于高频事件：

- `reasoning_delta` 不逐条落库，只记录首次出现和总长度。
- `answer_delta` 不逐条落库，只记录首次出现和总长度。

### model_usages

记录 provider usage。

```txt
model_usages
  id
  run_id
  provider          // qwen
  model
  input_tokens
  output_tokens
  reasoning_tokens
  total_tokens
  estimated_cost
  provider_request_id
  raw_usage_json
  created_at
```

## 5. 结构化日志

除了 DB trace，server 日志也要结构化。

每条关键日志都带：

```txt
request_id
run_id
conversation_id
user_message_id
assistant_message_id
```

示例：

```ts
logger.info({
  event: "provider.request.start",
  requestId,
  runId,
  conversationId,
  model,
  mode,
});
```

错误日志：

```ts
logger.error({
  event: "agent.run.failed",
  requestId,
  runId,
  errorCode,
  errorMessage,
  providerRequestId,
});
```

第一版可以只输出 JSON log 到 console，后续再接 OpenTelemetry、Sentry 或 APM。

## 6. Debug 可视化

第一版需要做开发调试型可视化。

推荐两个页面：

```txt
/debug/runs
/debug/runs/:id
```

### /debug/runs

展示最近 runs：

```txt
Run ID | 时间 | 模式 | 模型 | 状态 | TTFA/TTFT | 总耗时 | tokens | 错误
```

可选过滤：

- status: completed / failed / aborted
- mode: fast / deep
- model

第一版一个表格即可，不需要复杂图表。

### /debug/runs/:id

详情页分四块：

```txt
1. Run Summary
2. Latency Waterfall
3. Event Timeline
4. Token Usage / Raw Metadata
```

#### Run Summary

```txt
run_id
conversation_id
user_message_id
assistant_message_id
mode
search
model
status
started_at
completed_at
error
```

#### Latency Waterfall

简单时间轴即可：

```txt
0ms      run_created
12ms     context_built
120ms    provider_request_start
800ms    first_reasoning
1300ms   first_answer_delta
4200ms   sources_found
6900ms   done
```

第一版可以用 CSS 横条实现，不需要 ECharts。

#### Event Timeline

展示关键 AgentEvent：

```txt
+120ms phase thinking
+800ms first_reasoning
+1300ms first_answer_delta
+4200ms sources_found count=8
+6900ms run_completed
```

对于大 payload 默认折叠：

- reasoning text
- answer delta
- raw provider usage
- source list

#### Token Usage

```txt
input_tokens: 1200
output_tokens: 500
reasoning_tokens: 900
total_tokens: 2600
estimated_cost: ...
raw_usage_json
```

## 7. 实时可视化

第一版不需要实时 debug 页面。

后续可以考虑：

```txt
/debug/runs/:id/live
```

但第一阶段完成后查看详情就足够。

## 8. Server 中如何采集

`POST /api/chat/stream` 开始时：

```txt
create agent_run
record run_created
start request timer
```

ContextBuilder 前后：

```txt
record context_build_start
record context_built
set context_build_latency_ms
```

调用 Qwen provider 前后：

```txt
record provider_request_start
record provider_request_done
set provider_latency_ms
```

流式事件中：

```txt
第一个任意事件
  -> set ttfe_ms
  -> record first_event

第一个 reasoning_delta / thinking_summary
  -> set ttfr_ms
  -> record first_reasoning

第一个 answer_delta
  -> set ttfa_ms
  -> record first_answer_delta

sources_found
  -> record sources_found
```

完成时：

```txt
save assistant message
save model usage
set completed_at
set total_latency_ms
set stream_duration_ms
status = completed
record run_completed
```

失败时：

```txt
status = failed
error = ...
record run_failed
```

中断时：

```txt
status = aborted
record run_aborted
```

## 9. 前端中如何使用

普通用户 UI 不需要展示这些指标。

前端只需要：

- 正常渲染 Chatbox。
- 发送请求时携带或接收 `runId`。
- Debug 页面查询 `/api/debug/runs` 和 `/api/debug/runs/:id`。

可选：

- 开发环境中在消息旁显示 `runId`。
- 错误时提供“查看 trace”入口。

## 10. 第一版实现顺序

```txt
1. 在数据库 schema 中加入 agent_runs
2. 加入 agent_events
3. 加入 model_usages
4. 在 /api/chat/stream 创建 run
5. 在 AgentRuntime 关键节点记录事件
6. 计算 TTFE / TTFR / TTFA / TTC
7. 保存 Qwen usage
8. 输出结构化 JSON logs
9. 实现 /api/debug/runs
10. 实现 /api/debug/runs/:id
11. 实现简单 debug UI 表格
12. 实现 run 详情 timeline
```

## 11. 当前结论

可观测层第一版采用：

> run trace + 关键事件落库 + 性能体验指标 + token usage + debug 可视化。重点看 TTFE、TTFR、TTFA/TTFT、TTC、provider latency、context build latency、reasoning tokens 和 total tokens。不做产品运营指标，后续功能稳定后再补充用户行为和增长分析。
