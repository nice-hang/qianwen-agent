# Run Trace 与 Debug

## 状态

Implemented

## 对应 Roadmap

- Stage: Stage 2
- Step: Run Trace 与 Debug
- 相关验收项:
  - 每次回答都有 run trace
  - 能看到事件时间线
  - 能看到 token usage
  - 失败/中断能定位到 run

## 背景

Stage 1 已经打通最小文本聊天闭环：Web 发送消息，Server 保存消息，Agent Runtime 调 Qwen，Server 流式返回并保存 assistant message。下一步继续加深度思考、联网搜索和图片理解时，模型请求、流式事件、落库和前端展示都会更复杂。

Stage 2 先建立最小 run trace，让每次聊天可回放关键时间线，能看到首 token 时间、总耗时、provider 耗时和 token usage。目标是帮助调试 Agent，而不是做完整可观测平台。

## 目标

- 建立 `agent_runs`、`agent_events`、`model_usages`。
- 每次 `POST /api/chat/stream` 创建一条 run。
- 记录关键事件时间线。
- 记录 TTFE / TTFA / TTC。
- 记录 provider latency。
- 保存 Qwen usage，如果 provider 返回。
- 实现 `GET /debug/runs`。
- 实现 `GET /debug/runs/:runId`。
- Web 展示最小 Debug 页面：run 列表、run 详情、timeline、耗时和 token usage。

## 非目标

- 不做产品运营大盘。
- 不做告警、监控、采样、导出。
- 不做复杂筛选、分页、图表。
- 不抽象多种 trace backend。
- 不引入 OpenTelemetry。
- 不做独立 observability 服务。
- 不重构聊天主链路，只在关键位置补 trace 记录。
- 不记录完整 prompt 或 provider 原始响应，避免早期引入隐私和体积问题。

## 初步技术方案

Stage 2 直接在 Server 内通过 Prisma 写 run trace，不做 sink 插件化：

```txt
apps/server
  chat route
  -> create agent_run
  -> record agent_events
  -> call runAgent
  -> save model_usage when available
  -> update agent_run status/timing

packages/agent-runtime
  runAgent()
  -> yield answer_delta
  -> yield done with optional usage

apps/web
  /debug view
  -> GET /debug/runs
  -> GET /debug/runs/:runId
```

`packages/observability` 暂时只保留共享类型或轻量 helper；真实落库逻辑放在 `apps/server`，避免为了未来存储替换提前做接口层。

## 核心流程

```txt
POST /api/chat/stream
  -> create agent_run(status=running, startedAt)
  -> record run_started
  -> save user message
  -> record user_message_saved
  -> record provider_request_started
  -> runAgent()
      -> answer_delta
          -> if first delta: record first_answer_delta, compute TTFA
          -> forward event to web
      -> done
          -> save assistant message
          -> save model_usage if usage exists
          -> record assistant_message_saved
          -> update run completed + timings
          -> record run_completed
  -> on error
      -> record run_failed
      -> update run failed + timings
      -> forward error event

Debug UI
  -> list runs
  -> select run
  -> render timeline/events/usage
```

## 数据结构 / 接口设计

### Prisma schema

```prisma
model AgentRun {
  id             String      @id @default(cuid())
  conversationId String?
  status         RunStatus
  startedAt      DateTime    @default(now())
  completedAt    DateTime?
  failedAt       DateTime?
  errorMessage   String?
  ttfeMs         Int?
  ttfaMs         Int?
  ttcMs          Int?
  providerMs     Int?
  events         AgentEvent[]
  usage          ModelUsage?

  @@index([startedAt])
  @@index([conversationId])
}

model AgentEvent {
  id        String   @id @default(cuid())
  runId     String
  run       AgentRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  type      String
  at        DateTime @default(now())
  offsetMs  Int
  message   String?
  dataJson  String?

  @@index([runId, at])
}

model ModelUsage {
  id              String   @id @default(cuid())
  runId           String   @unique
  run             AgentRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  provider        String
  model           String
  inputTokens     Int?
  outputTokens    Int?
  reasoningTokens Int?
  totalTokens     Int?
  rawJson         String?
}

enum RunStatus {
  running
  completed
  failed
}
```

### Debug API

```ts
GET /debug/runs
Response: {
  runs: Array<{
    id: string;
    conversationId?: string;
    status: "running" | "completed" | "failed";
    startedAt: string;
    completedAt?: string;
    failedAt?: string;
    ttfeMs?: number;
    ttfaMs?: number;
    ttcMs?: number;
    providerMs?: number;
    errorMessage?: string;
  }>;
}

GET /debug/runs/:runId
Response: {
  run: AgentRunSummary;
  events: AgentEvent[];
  usage?: ModelUsage;
}
```

### Agent event types

Stage 2 先使用字符串事件类型，不提前做复杂 discriminated union：

```txt
run_started
user_message_saved
provider_request_started
first_answer_delta
assistant_message_saved
run_completed
run_failed
```

### Usage

Qwen OpenAI-compatible stream 默认不返回 usage。Stage 2 在请求体中传入：

```json
{
  "stream_options": { "include_usage": true }
}
```

最后一个 stream chunk 返回 usage 时，`agent-runtime` 转成统一的 `TokenUsage`，Server 在 run 完成时写入 `model_usages`，同时把 usage 带到最终 `done` event。

## 方案对比

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| Server 直接写 Prisma trace | 最少代码，贴近当前聊天链路，容易验证 | 后续换存储时需要再抽象 | 采用 |
| `packages/observability` 提供 TraceSink，Server 注入实现 | 边界漂亮，未来可替换 | 当前只有一种存储，容易过度设计 | 暂不采用 |
| 引入 OpenTelemetry | 标准化，生态完整 | Stage 2 过重，学习和配置成本高 | 不采用 |
| 只打日志不落库 | 实现最快 | Web Debug 无法稳定读取历史 run | 不采用 |

## 设计意图

- Run trace 是为了调 Agent，不是为了做平台能力。
- Trace 表只记录调试需要的摘要和事件，不保存完整 prompt 或大响应。
- 事件类型先用字符串，避免过早为后续 thinking/search/tool 建复杂协议。
- provider usage 有则保存，无则为空，避免为了 token usage 牺牲流式体验。
- Server 是当前唯一落库边界，因此直接写 Prisma，等出现第二种存储再抽象。

## 已确认问题

- Qwen stream 已通过 `stream_options.include_usage` 返回 usage，并完成真实请求验证。
- Debug UI 先放在同一个页面，用 Chat / Debug 按钮切换，避免引入路由。
- `TTFE` 定义为 run started 到第一条 trace event；`TTFA` 定义为 run started 到第一条 `answer_delta`。

## 实现计划

- [x] 更新 Prisma schema，新增 `AgentRun`、`AgentEvent`、`ModelUsage`。
- [x] 生成并应用 migration。
- [x] 新增 server trace repository。
- [x] 在 `POST /api/chat/stream` 关键位置记录 run 和 events。
- [x] 在 run 完成/失败时写入 timings。
- [x] 扩展 `runAgent` 的 done event，支持可选 usage。
- [x] 若 provider 返回 usage，保存到 `model_usages`。
- [x] 实现 `/debug/runs`。
- [x] 实现 `/debug/runs/:runId`。
- [x] 扩展 Web：增加 Debug 视图、run 列表和 timeline。
- [x] 更新 roadmap/status/handoff/solution 验证记录。

## 实现记录

- Prisma 新增 `AgentRun`、`AgentEvent`、`ModelUsage` 和 `RunStatus`，migration 为 `20260528163547_add_run_trace`。
- Server 新增 `createTraceRepository`，负责创建 run、记录事件、完成/失败 run、保存 usage、查询 run 列表和详情。
- `POST /api/chat/stream` 在聊天主链路中记录 `run_started`、`user_message_saved`、`provider_request_started`、`first_answer_delta`、`assistant_message_saved`、`run_completed` / `run_failed`。
- `agent-runtime` 使用 `stream_options.include_usage` 获取 Qwen usage，并在最终 `done` event 中返回。
- Debug API 提供 `GET /debug/runs` 和 `GET /debug/runs/:runId`。
- Web 增加 Chat / Debug 视图切换，Debug 视图可查看 run 列表、耗时、usage 和 timeline。

## 验证记录

- `pnpm typecheck` 通过。
- 已执行真实 Qwen streaming 请求：

```bash
curl --max-time 15 -s -N -X POST http://127.0.0.1:3011/api/chat/stream \
  -H 'content-type: application/json' \
  -d '{"message":"只回复ok"}'
```

返回 `answer_delta` 和 `done`，`done` 中包含 `runId`、`messageId`、`conversationId` 和 usage。

- 已验证 `GET /debug/runs/:runId` 返回 completed run、timeline 和 usage：
  - `ttfeMs=7`
  - `ttfaMs=579`
  - `ttcMs=642`
  - `providerMs=626`
  - `inputTokens=11`
  - `outputTokens=1`
  - `totalTokens=12`
- 已验证会话不存在时会生成 failed run，并能在 Debug run 列表定位错误。

## 关键文件

预计涉及：

- `apps/server/prisma/schema.prisma`
- `apps/server/src/api/chat.ts`
- `apps/server/src/api/debug.ts`
- `apps/server/src/storage/trace-repository.ts`
- `packages/agent-runtime/src/index.ts`
- `packages/shared/src/types.ts`
- `packages/shared/src/api-client.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`

## 验证方式

- [ ] `pnpm typecheck`
- [ ] `pnpm --filter @qianwen-agent/server prisma migrate dev --name add_run_trace`
- [ ] `pnpm --filter @qianwen-agent/server start`
- [ ] 发送一次真实聊天，确认返回流式 answer。
- [ ] `GET /debug/runs` 能看到新 run。
- [ ] `GET /debug/runs/:runId` 能看到 timeline。
- [ ] 断开或使用错误 key 触发失败，确认 run 标记 failed。
- [ ] Web Debug 视图能展示 run 列表和详情。

## 验证记录

尚未实现，暂无验证记录。

## 最终结论

待实现后补充。

## 后续演进

- Stage 3 增加 reasoning 相关事件和 TTFR。
- Stage 4 增加 search 配置和 sources 事件。
- Stage 5 增加 attachment / multimodal 相关 trace 摘要。
