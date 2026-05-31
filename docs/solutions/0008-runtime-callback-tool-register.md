# Agent Runtime 简化与 Tool Register

## 状态

Planned

## 对应 Roadmap

- Stage: Stage 6
- Step: Agent Runtime 简化 + 极简 Tool Register
- 相关验收项:
  - 现有聊天、深度思考、搜索来源展示行为不变
  - Server/Web 不理解 agent loop 内部循环细节
  - Agent 内部闭环，统一通过 callback 输出稳定事件
  - `web_search` / `web_fetch` 通过极简 register 管理

## 背景

Stage 5 已经接入 agent loop 和自建联网搜索，但实现还带着“先跑通”的痕迹：

- `runAgent` 是 `AsyncIterable<AgentEvent>`，runtime 内部多处直接 `yield`。
- 工具查找直接依赖 `builtInTools` 对象索引。
- 工具执行、工具结果落 provider message、搜索 sources 事件输出混在 `run-agent.ts`。
- Server 当前拿到的是一串底层过程事件，后续如果继续叠加摘要、RN、图片，多端都会更容易被 runtime 内部形态影响。

这一步不新增用户可见能力，先把运行时边界收紧。

## 目标

- Agent Runtime 内部完成 provider stream、tool call 聚合、tool 执行、loop continuation。
- 对 Server/Web 暴露稳定的产品事件回调，而不是让上层感知每一处 `yield`。
- 减少 `run-agent.ts` 内部分散 `yield`，集中在一个 emit 边界。
- 引入极简 tool register，让工具定义、执行、结果摘要和事件转换有明确归属。
- 保持现有 shared `AgentEvent`、DB、Web 展示和 Debug 行为不变。
- 为 Stage 7 会话摘要预留自然落点，但本阶段不实现摘要。

## 非目标

- 不引入 Runtime class。
- 不引入 LangGraph、MCP、Skill、Subagent。
- 不做插件化工具系统。
- 不做动态工具加载。
- 不做工具权限、审批、并发调度或复杂生命周期。
- 不改搜索产品体验。
- 不实现会话摘要、长期记忆、RN 或图片理解。

## 关键取舍

### 1. 为什么从 `yield` 收敛到 callbacks

`yield` 很适合快速把 provider stream 转出去，但 agent loop 出现后，runtime 内部已经有多层状态：

- provider delta
- tool call delta 聚合
- tool execution
- tool result message
- loop continuation
- final answer

如果每层都直接 `yield`，上层会逐渐看到过多内部细节。Stage 6 改为 runtime 内部通过 `emit(event)` 输出 shared `AgentEvent`，Server 可以传 `onEvent` 收集和转发。这样 Agent 仍可以流式输出，但输出边界只有一个。

为了降低迁移风险，可以保留一个兼容包装：

```ts
export async function runAgent(input, options): Promise<AgentRunResult>

export async function* runAgentStream(input, options): AsyncIterable<AgentEvent> {
  await runAgent(input, {
    ...options,
    onEvent: (event) => queue.push(event)
  });
}
```

最终 Server 优先使用 callback 版本；兼容包装只服务渐进迁移和测试。

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

### 3. Server 只处理产品事件

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

这些都留在 Agent Runtime。

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
       -> call provider
       -> collect provider deltas
       -> emit reasoning_delta / answer_delta
       -> if tool calls:
            executeRegisteredTool
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

## 实现计划

- [ ] 新增 `tools/register.ts`，实现极简 `createToolRegister`。
- [ ] 调整 `BuiltInTool` 为更通用的 `RuntimeTool`，补充 `name`、`summarize`、`toEvents`。
- [ ] 将 `web_search` sources 事件从 `run-agent.ts` 移到工具注册侧或统一 adapter。
- [ ] 新增 callback 版 `runAgent`，通过 `onEvent` 输出 shared `AgentEvent`。
- [ ] 保留 `AsyncIterable` 兼容包装，降低 Server 迁移风险。
- [ ] Server 改为调用 callback 版，继续负责 SSE 转发、trace、DB 保存。
- [ ] 补 agent-runtime 单元级 mocked stream 验证：工具轮、最终回答轮、iteration limit。
- [ ] 跑 `pnpm --filter @qianwen-agent/agent-runtime typecheck` 和 `pnpm typecheck`。

## 待确认问题

- callback API 是否命名为 `onEvent`，还是拆成 `onDelta` / `onToolEvent` / `onDone`。当前倾向只保留 `onEvent`，因为 shared `AgentEvent` 已经是稳定产品协议。
- 是否保留原 `runAgent` 作为 async iterable，另起 `runAgentWithCallbacks`；还是让 `runAgent` 变 callback 版，新增 `runAgentStream` 兼容。当前倾向后者，但实现前需要看 Server 改动范围。
- Agent Run 的 `runId/messageId/conversationId` 仍由 Server 替换真实值，这一点是否继续保持。当前倾向继续保持，避免 Runtime 反向依赖 Server 存储。

## 最终结论

待实现后更新。
