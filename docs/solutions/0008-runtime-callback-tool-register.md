# Agent Runtime 简化与 Tool Register

## 状态

Implemented

## 对应 Roadmap

- Stage: Stage 6
- Step: Agent Runtime 简化 + 极简 Tool Register
- 相关验收项:
  - 现有聊天、深度思考、搜索来源展示行为不变
  - Server/Web 不理解 agent loop 内部循环细节
  - Agent 内部闭环，统一通过 callback 输出稳定事件
  - `web_search` / `web_fetch` 通过极简 register 管理
  - 为 Stage 7 Agent Trace 监控提供 provider request / tool execution 快照

## 参考

- 本地参考：`/Users/bytedance/Documents/github/pi-mono/packages/agent`
- 外部参考：`claude-tap`，用于理解本地 trace viewer 需要展示的 request、messages、tools、tool calls、stream、usage 和 request diff。

## 背景

Stage 5 已经接入 agent loop 和自建联网搜索，但实现还带着“先跑通”的痕迹：

- `runAgent` 是 `AsyncIterable<AgentEvent>`，runtime 内部多处直接 `yield`。
- 工具查找直接依赖 `builtInTools` 对象索引。
- 工具执行、工具结果落 provider message、搜索 sources 事件输出混在 `run-agent.ts`。
- Provider request 的 `messages` 和 `tools` 没有在统一边界形成可观测快照，后续很难做类似 claude-tap 的执行流监控。

这一步不新增用户可见聊天能力，先把运行时边界收紧。

## pi-mono 借鉴点

`pi-mono/packages/agent` 里有几个设计值得吸收：

- 低层 loop 使用 `emit(event)`，事件输出集中在一个边界。
- 每次模型调用前有 `transformContext -> convertToLlm -> stream` 的清晰边界。
- 工具调用不是散落执行，而是 prepare / execute / finalize。
- 工具执行有 start / update / end 事件。
- 工具结果以消息形式重新进入下一轮模型请求。

但我们当前不搬这些概念：

- 不引入 `Agent` class 和内部 mutable state。
- 不引入 turn 作为 public 协议概念。
- 不引入 steering / followUp 队列。
- 不引入 parallel tool execution。
- 不引入 beforeToolCall / afterToolCall hook。
- 不引入可扩展 custom message declaration merging。

我们的实现只保留当前产品路径需要的最小闭环。

## 目标

- Agent Runtime 内部完成 provider stream、tool call 聚合、tool 执行、loop continuation。
- 对 Server/Web 暴露稳定的产品事件回调，而不是让上层感知每一处 `yield`。
- 减少 `run-agent.ts` 内部分散 `yield`，集中在一个 emit 边界。
- 引入极简 tool register，让工具定义、执行、结果摘要和事件转换有明确归属。
- 将工具调用整理成 prepare / execute / finalize 三步。
- 在每次 provider request 前产出可观测快照：model、mode、messages、tools。
- 在工具执行前后产出可观测快照：tool call、args、result summary、duration、error。
- 保持现有 shared `AgentEvent`、DB、Web 展示和 Debug 行为不变。

## 非目标

- 不引入 Runtime class。
- 不引入 LangGraph、MCP、Skill、Subagent。
- 不做插件化工具系统。
- 不做动态工具加载。
- 不做工具权限、审批、并发调度或复杂生命周期。
- 不改搜索产品体验。
- 不实现会话摘要、长期记忆、RN 或图片理解。
- 不在 Stage 6 完整实现 trace viewer，Stage 6 只把可观测数据从 runtime 边界吐出来。

## 关键取舍

### 1. 为什么从 `yield` 收敛到 callbacks

`yield` 很适合快速把 provider stream 转出去，但 agent loop 出现后，runtime 内部已经有多层状态：

- provider delta
- tool call delta 聚合
- provider request messages/tools
- tool execution
- tool result message
- loop continuation
- final answer

如果每层都直接 `yield`，上层会逐渐看到过多内部细节。Stage 6 改为 runtime 内部通过 `emit(event)` 输出 shared `AgentEvent`，Server 传 `onEvent` 收集和转发。这样 Agent 仍可以流式输出，但输出边界只有一个。

本次直接删除旧 async iterable 入口，不保留双轨兼容：

```ts
export async function runAgent(input, options): Promise<AgentRunResult>
```

Server 同步改为 callback 调用。这样所有输出都经过 `onEvent` 一个边界，避免后续继续维护两套 runtime API。

### 2. Tool Register 只做当前需要的最小形态

参考 pi-mono 的注册表思想：工具应该通过统一入口注册和查找。但当前不需要完整框架。

第一版只需要：

```ts
interface RuntimeTool {
  name: string;
  definition: QwenToolDefinition;
  execute(input, context): Promise<unknown>;
  summarize?(output): unknown;
  toEvents?(output, toolCall): AgentEvent[];
}

function createToolRegister(tools: RuntimeTool[]) {
  return {
    definitions: () => tools.map((tool) => tool.definition),
    get: (name) => map.get(name)
  };
}
```

不做 class，不做全局单例。`runAgent` 每次创建或接收一个 register 都可以，先以 built-in register 为默认值。

### 3. Server 只处理产品事件和 trace 落库

Server 仍负责：

- 写 SSE-like chunk
- 保存 assistant message
- 保存 usage / trace
- 收集 sources
- 错误处理中断

Server 不应该关心：

- tool call delta 如何拼接
- 一轮模型为什么继续下一轮
- provider `finish_reason` 是否是 `tool_calls`
- 工具结果如何变成 provider `role: "tool"` message

这些都留在 Agent Runtime。Server 只把 runtime emit 出来的 trace payload 落库。

## 初步设计

```txt
runAgent(input, {
  env,
  fetchImpl,
  onEvent
})
  -> createRuntimeContext
  -> toolRegister = createBuiltInToolRegister()
  -> messages = buildProviderMessages(input.messages)
  -> runAgentLoop
       -> before provider request:
            emit provider_request with messages/tools snapshot
       -> call provider
       -> collect provider deltas
       -> emit reasoning_delta / answer_delta
       -> if tool calls:
            prepareToolCall
            executeToolCall
            finalizeToolCall
            append assistant tool call + tool result
            emit tool/search events through one boundary
            continue
       -> emit done
  -> return result summary
```

`runAgent` 返回值只表达运行结果，不承载 UI 流：

```ts
interface AgentRunResult {
  usage?: TokenUsage;
  sources: SearchSource[];
}
```

实时 UI 继续走 `onEvent`。

## Tool Register 设计

文件建议：

```txt
packages/agent-runtime/src/tools/
  register.ts
  built-ins.ts
  types.ts
  web-search.ts
  web-fetch.ts
```

职责：

- `types.ts`：定义 `RuntimeTool`、`ToolContext`。
- `register.ts`：提供 `createToolRegister`，只做 map、definitions、get。
- `built-ins.ts`：注册 `web_search` / `web_fetch`。
- 具体工具文件只关心 input 校验、执行、输出。

`web_search` 的 sources 事件不要写死在 `run-agent.ts`，放到工具的 `toEvents` 或 runtime 的统一 tool-result adapter 中。

## Runtime 事件边界

Stage 6 可以在 shared `AgentEvent` 中增加少量 debug-only 事件，先服务 Server trace，不要求 Web 主聊天消费：

```ts
type RuntimeDebugEvent =
  | {
      type: "provider_request";
      requestId: string;
      iteration: number;
      model: string;
      mode: "fast" | "deep";
      messages: ProviderMessage[];
      tools: QwenToolDefinition[];
    }
  | {
      type: "provider_response";
      requestId: string;
      iteration: number;
      finishReason?: string;
      usage?: TokenUsage;
      durationMs: number;
    };
```

工具事件继续沿用当前 `tool_call_started` / `tool_call_done` / `search_results`，但内部执行路径改成 prepare / execute / finalize。

## 实现计划

- [x] 新增 `tools/register.ts`，实现极简 `createToolRegister`。
- [x] 调整 `BuiltInTool` 为更通用的 `RuntimeTool`，补充 `name`、`summarize`、`toEvents`。
- [x] 将 `web_search` sources 事件从 `run-agent.ts` 移到工具注册侧或统一 adapter。
- [x] 新增 `prepareToolCall` / `executePreparedToolCall` / `finalizeToolCall` 函数，不做 hook。
- [x] 将 `runAgent` 直接改为 callback 版，通过 `onEvent` 输出 shared `AgentEvent`。
- [x] 删除旧 `AsyncIterable` 生成器入口，不保留兼容包装。
- [x] 在 provider 请求前 emit `provider_request`，包含 messages/tools 快照。
- [x] 在 provider 请求结束后 emit `provider_response`，包含 finishReason / usage / duration。
- [x] Server 改为调用 callback 版，继续负责 SSE 转发、trace、DB 保存。
- [ ] 补 agent-runtime 单元级 mocked stream 验证：工具轮、最终回答轮、iteration limit、provider request 快照。
- [x] 跑 `pnpm --filter @qianwen-agent/agent-runtime typecheck` 和 `pnpm typecheck`。

## 待确认问题

- callback API 是否命名为 `onEvent`，还是拆成 `onDelta` / `onToolEvent` / `onDone`。当前倾向只保留 `onEvent`，因为 shared `AgentEvent` 已经是稳定产品协议。
- `runAgent` 直接改 callback 版，旧 async iterable 不保留。
- Agent Run 的 `runId/messageId/conversationId` 仍由 Server 替换真实值，这一点是否继续保持。当前倾向继续保持，避免 Runtime 反向依赖 Server 存储。
- `provider_request.messages` 可能很大，Stage 6 先完整记录到 debug trace；Stage 7 再考虑 UI 折叠、搜索和脱敏策略。

## 最终结论

Stage 6 已完成核心实现。`runAgent` 已直接切换为 callback 版本，不保留旧 async iterable 入口；Server 改为通过 `onEvent` 接收事件并继续负责 SSE 转发、trace 落库和 assistant message 保存。Agent Runtime 新增极简 tool register，`web_search` / `web_fetch` 在工具侧声明 name、definition、execute、summarize 和 toEvents。Runtime 会在每次 provider 请求前后发出 `provider_request` / `provider_response` debug 事件，Server 只落 trace，不转发给主聊天 Web。

## 验证记录

- `/Users/bytedance/.nvm/versions/node/v22.19.0/bin/pnpm --filter @qianwen-agent/agent-runtime typecheck` 通过。
- `/Users/bytedance/.nvm/versions/node/v22.19.0/bin/pnpm --filter @qianwen-agent/server typecheck` 通过。
- `/Users/bytedance/.nvm/versions/node/v22.19.0/bin/pnpm --filter @qianwen-agent/web typecheck` 通过。
- `/Users/bytedance/.nvm/versions/node/v22.19.0/bin/pnpm typecheck` 通过。
