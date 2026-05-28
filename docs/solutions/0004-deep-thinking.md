# 深度思考

## 状态

Implemented

## 对应 Roadmap

- Stage: Stage 3
- Step: 深度思考
- 相关验收项:
  - 快速/深度模式可切换
  - deep 模式能看到思考内容或摘要
  - 最终答案和思考区域分区展示
  - Debug 能看到 TTFR / reasoning token

## 背景

Stage 2 已经有聊天闭环和 run trace。Stage 3 在这个基础上接入 Qwen thinking，不引入新编排框架，只扩展当前链路：

```txt
UI mode -> Server -> Agent Runtime -> Qwen enable_thinking -> reasoning_delta / answer_delta -> DB -> UI
```

## 目标

- `POST /api/chat/stream` 支持 `mode: "fast" | "deep"`。
- deep mode 请求 Qwen 时传 `enable_thinking: true`。
- 支持可选 `thinkingBudget`。
- 解析 Qwen stream 中的 `reasoning_content`。
- 输出 `reasoning_delta` 和原有 `answer_delta`。
- Server 保存 assistant 的 `reasoningContent`，刷新后能恢复。
- Run trace 记录 `first_reasoning_delta` 和 `ttfrMs`。
- Debug 展示 TTFR 和 reasoning tokens。
- Web composer 支持 Fast / Deep 模式切换。
- Web assistant 消息分区展示 Thinking 和 Answer。

## 非目标

- 不做 thinking summary 二次总结。
- 不做复杂折叠、分段、引用或审计视图。
- 不抽象多模型 thinking 能力矩阵。
- 不引入 Agent graph / tool orchestration。
- 不保存 provider 原始 chunk。

## 技术方案

### Shared 协议

```ts
type ChatMode = "fast" | "deep";

interface ChatStreamRequest {
  conversationId?: string;
  message: string;
  mode?: ChatMode;
  thinkingBudget?: number;
}

type AgentEvent =
  | { type: "reasoning_delta"; text: string }
  | { type: "answer_delta"; text: string }
  | { type: "done"; ... }
  | { type: "error"; ... };
```

### 数据库

只加当前必须字段：

```prisma
model Message {
  reasoningContent String?
}

model AgentRun {
  ttfrMs Int?
}
```

`reasoningContent` 放在 assistant message 上，保证刷新后能恢复；不额外建 thinking 表。

### Agent Runtime

Qwen OpenAI-compatible stream：

- `delta.reasoning_content` -> `reasoning_delta`
- `delta.content` -> `answer_delta`
- `usage` -> `done.usage`

请求体：

```json
{
  "stream": true,
  "stream_options": { "include_usage": true },
  "enable_thinking": true,
  "thinking_budget": 500
}
```

fast mode 显式传 `enable_thinking: false`，避免 thinking 默认值随模型变化导致行为不稳定。

### Server

聊天链路增加：

- `reasoningParts`
- 首个 `reasoning_delta` 时记录 `first_reasoning_delta`
- 完成时保存 assistant `content` 和 `reasoningContent`
- complete/fail run 写入 `ttfrMs`

### Web

保持组件简单：

- App 持有 `mode` 和 `thinkingBudget`
- ChatView 展示模式切换和预算输入
- MessageBubble 展示：
  - Thinking：`reasoningContent`
  - Answer：`content`

## 实现计划

- [x] 更新 shared 类型。
- [x] 更新 Prisma schema 和 migration。
- [x] 更新 conversation repository message mapper。
- [x] 更新 agent-runtime 请求参数和 stream parser。
- [x] 更新 chat route，处理 reasoning stream、保存 reasoningContent、记录 TTFR。
- [x] 更新 trace repository summary/detail。
- [x] 更新 Web App / ChatView / DebugView。
- [x] 更新 roadmap/status/handoff。
- [x] 运行 typecheck。
- [x] 用真实 Qwen deep 请求验证。

## 实现记录

- Shared 增加 `reasoning_delta`、`mode`、`thinkingBudget`、`reasoningContent` 和 `ttfrMs`。
- Prisma migration `20260529103000_add_deep_thinking` 增加 `Message.reasoningContent` 和 `AgentRun.ttfrMs`。
- Agent Runtime 在 fast mode 显式传 `enable_thinking: false`，deep mode 传 `enable_thinking: true` 和可选 `thinking_budget`。
- Qwen stream parser 支持 `delta.reasoning_content` -> `reasoning_delta`。
- Server 在首个 reasoning delta 记录 `first_reasoning_delta` 和 `ttfrMs`，完成时保存 assistant 的 `reasoningContent`。
- Web composer 增加 Fast / Deep 切换和 thinking budget 输入。
- Web assistant 消息展示 Thinking 和 Answer 两块。
- Debug metrics 增加 TTFR，usage 增加 reasoning tokens。

## 验证记录

- `pnpm typecheck` 通过。
- 已执行 fast 真实请求，返回 `answer_delta` 和 `done`，无 `reasoning_delta`。
- 已执行 deep 真实请求：

```bash
curl --max-time 30 -s -N -X POST http://127.0.0.1:3011/api/chat/stream \
  -H 'content-type: application/json' \
  -d '{"message":"用一句话回答：1+1等于几？","mode":"deep","thinkingBudget":50}'
```

返回多条 `reasoning_delta`、随后 `answer_delta` 和 `done`。

- 已验证 Debug detail：
  - `ttfrMs=359`
  - `ttfaMs=1353`
  - `ttcMs=1415`
  - `reasoningTokens=50`
  - timeline 包含 `first_reasoning_delta` 和 `first_answer_delta`
- 已验证消息列表可恢复 assistant `reasoningContent`。

## 验证计划

- `pnpm typecheck`
- fast 请求验证没有 reasoning_delta。
- deep 请求验证能输出 reasoning_delta 和 answer_delta。
- `GET /debug/runs/:runId` 验证 `ttfrMs`、timeline、usage.reasoningTokens。
- 刷新消息列表后 reasoningContent 仍能显示。
