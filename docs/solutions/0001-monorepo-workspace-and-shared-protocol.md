# Monorepo 骨架与共享协议

## 状态

Done

## 对应 Roadmap

- Stage: Stage 0
- Step: Monorepo 骨架与共享协议
- 相关验收项:
  - Web 能启动
  - Server health check 能访问
  - shared 类型能被 Web 和 Server 引用
  - `apps/server` 能 import `packages/agent-runtime` 和 `packages/observability`

## 背景

本项目会同时包含 React Web、React Native、Node.js Server、Agent Runtime 和 Observability。为了避免前后端协议分叉、Agent 和 Server 边界混乱，Stage 0 先建立 monorepo 骨架和共享协议。

这一阶段不追求业务功能，只解决后续实现的工程地基：

- 目录结构稳定。
- 包依赖方向清楚。
- TypeScript 类型可以跨包复用。
- Server 可以 import Agent Runtime 和 Observability。
- Web 可以 import shared 类型和基础 client。

## 目标

- 初始化 monorepo workspace。
- 创建 `apps/web`、`apps/mobile`、`apps/server`。
- 创建 `packages/shared`、`packages/agent-runtime`、`packages/observability`。
- 定义基础共享类型：Message、Conversation、Attachment、AgentEvent。
- 定义 SSE-like stream parser 的初版接口。
- 定义基础 API client 的初版接口。
- 建立 Server health check。
- 建立 Web 最小页面。

## 非目标

- 不接真实 Qwen API。
- 不实现数据库 schema。
- 不实现完整聊天链路。
- 不实现 React Native 真实页面。
- 不实现图片上传。
- 不实现 run trace 落库。
- 不引入 RAG、MCP、Skill、Subagent、LangGraph。

## 初步技术方案

采用 TypeScript monorepo，按 apps 和 packages 分层：

```txt
qianwen-agent/
  apps/
    web/
    mobile/
    server/

  packages/
    shared/
    agent-runtime/
    observability/
```

包职责：

```txt
apps/web
  React Web Chatbox 壳子，先验证能启动并引用 shared。

apps/mobile
  React Native 壳子，Stage 0 只建结构，不要求完整运行。

apps/server
  Node.js Server，提供 health check，并验证能 import agent-runtime / observability。

packages/shared
  前后端共享类型、AgentEvent 协议、stream parser、API client 类型。

packages/agent-runtime
  Agent Runtime 内部接口和空实现入口，MVP 被 apps/server import，不单独部署。

packages/observability
  trace/metrics 类型和接口，MVP 被 apps/server 和 agent-runtime 复用。
```

推荐包管理：

```txt
pnpm workspace
```

原因：

- workspace 支持成熟。
- monorepo 包引用简单。
- 后续 Prisma、React、RN、Server 依赖可以按包隔离。
- 比 npm workspace 更适合多包脚本和过滤执行。

## 核心流程

Stage 0 验证链路：

```txt
packages/shared
  -> 导出 Message / AgentEvent

packages/agent-runtime
  -> import packages/shared
  -> 导出 createAgentRuntime 占位入口

packages/observability
  -> import packages/shared 可选
  -> 导出 TraceSink / TraceEvent 类型

apps/server
  -> import shared / agent-runtime / observability
  -> GET /health 返回 ok

apps/web
  -> import shared
  -> 渲染最小页面
```

这一阶段只验证依赖方向，不实现业务闭环。

## 数据结构 / 接口设计

### shared 基础类型

```ts
export type MessageRole = "user" | "assistant" | "system" | "tool";

export type MessageStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "aborted"
  | "failed";

export interface Attachment {
  id: string;
  type: "image" | "file";
  mimeType: string;
  filename: string;
  size: number;
  previewUrl?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  status: MessageStatus;
  content: string;
  attachments?: Attachment[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### AgentEvent 初版

```ts
export type AgentEvent =
  | { type: "phase"; phase: "thinking" | "answering" }
  | { type: "reasoning_delta"; text: string }
  | { type: "thinking_summary"; text: string }
  | { type: "sources_found"; count: number; sources: Source[] }
  | { type: "answer_delta"; text: string }
  | { type: "done"; runId: string; messageId: string }
  | { type: "error"; message: string; code?: string };
```

### stream parser 接口

```ts
export interface SseLikeChunk {
  event?: string;
  data: string;
}

export function parseSseLikeStreamChunk(input: string): SseLikeChunk[];
export function decodeAgentEvent(chunk: SseLikeChunk): AgentEvent | null;
```

Stage 0 可以先实现最小 parser，不要求覆盖所有边界。

### agent-runtime 入口

```ts
export interface AgentRuntime {
  run(input: AgentRunInput): AsyncIterable<AgentEvent>;
}

export function createAgentRuntime(): AgentRuntime;
```

Stage 0 的 `run` 可以是占位实现，不接 Qwen。

### observability 入口

```ts
export interface TraceSink {
  recordEvent(event: TraceEvent): Promise<void>;
  recordModelUsage(usage: ModelUsage): Promise<void>;
}
```

Stage 0 只定义类型，不做落库。

## 方案对比


| 方案                                    | 优点                            | 缺点                                     | 结论   |
| ------------------------------------- | ----------------------------- | -------------------------------------- | ---- |
| pnpm workspace + apps/packages        | 包边界清楚，后续扩展自然，适合多端 + 多 package | 需要配置 workspace 和 TS project references | 采用   |
| 单 apps/server 内部放 agent/observability | 初期目录少，启动快                     | Agent 和观测容易被 Server 绑死，后续边界不清          | 不采用  |
| Nx/Turborepo                          | 任务编排强，缓存能力好                   | 当前阶段偏重，会增加工具复杂度                        | 暂不采用 |
| npm workspace                         | 原生简单                          | 多包过滤、脚本体验弱于 pnpm                       | 暂不采用 |


## 设计意图

- Agent Runtime 和 Observability 虽然 MVP 不独立部署，但作为 package 先拆出来，避免和 Server 强耦合。
- Server 保留应用边界：HTTP、DB、stream、uploads、adapters。
- shared 作为协议源头，保证 Web、Server、Agent 对消息和事件理解一致。
- Stage 0 只验证工程地基，不提前实现业务功能，避免范围膨胀。

## 待确认问题

- React Native 初始化方式：Expo 还是 React Native CLI。使用 Expo
- Server 框架：Fastify、Hono、Express 还是其他。
- Web 构建工具：Vite 还是 Next.js。
- 是否在 Stage 0 就配置 TypeScript project references。
- 是否在 Stage 0 引入 lint/format/test 基础工具。

初步倾向：

- Web 使用 Vite + React。
- Server 使用 Fastify 或 Hono，后续实现前再确认。
- Mobile 倾向 Expo，降低本地运行复杂度。
- Stage 0 可先配置 TypeScript workspace，但测试和 lint 可以轻量起步。

## 实现计划

- 创建 pnpm workspace 配置。
- 创建根 `package.json`。
- 创建根 `tsconfig.base.json`。
- 创建 `apps/web` Vite React 壳子。
- 创建 `apps/server` Node.js/TypeScript 壳子。
- 创建 `apps/mobile` 目录和占位 README 或 Expo 壳子。
- 创建 `packages/shared`。
- 创建 `packages/agent-runtime`。
- 创建 `packages/observability`。
- 在 shared 中定义基础类型。
- 在 shared 中定义 AgentEvent 和 stream parser 初版。
- 在 agent-runtime 中导出占位 AgentRuntime。
- 在 observability 中导出 TraceSink 类型。
- Server 实现 `/health`。
- Web 引用 shared 类型并渲染最小页面。

## 实现记录

已实现 Stage 0 monorepo 骨架：

- 创建 pnpm workspace、根 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`。
- 创建 `apps/web` Vite React 壳子，引用 `@qianwen-agent/shared` 的 `ChatMessage` / `AgentEvent` 类型。
- 创建 `apps/server` Fastify 壳子，提供 `GET /health`，并引用 `@qianwen-agent/shared`、`@qianwen-agent/agent-runtime`、`@qianwen-agent/observability`。
- 创建 `apps/mobile` Expo / React Native 包壳子，引用 shared 类型。
- 创建 `packages/shared`，包含基础消息/会话/附件/AgentEvent 类型、SSE-like parser、AgentEvent encode/decode、基础 API client。
- 创建 `packages/agent-runtime`，导出 `AgentRuntime` 接口和占位 `createAgentRuntime`。
- 创建 `packages/observability`，导出 `TraceEvent`、`ModelUsage`、`TraceSink` 和 noop sink。
- 创建 `apps/server/src/adapters/agent` 与 `apps/server/src/adapters/observability` 目录。

## 关键文件

预计涉及：

- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `tsconfig.base.json`
- `apps/web/*`
- `apps/server/*`
- `apps/mobile/*`
- `packages/shared/*`
- `packages/agent-runtime/*`
- `packages/observability/*`

## 验证方式

- `pnpm install`
- `pnpm --filter web dev`
- `pnpm --filter server dev`
- 访问 Server `/health`
- Web 页面能启动并显示基础内容
- Server 能 import `@qianwen-agent/agent-runtime`
- Server 能 import `@qianwen-agent/observability`
- Web 能 import `@qianwen-agent/shared`

## 验证记录

- `pnpm install`：通过。
- `pnpm typecheck`：通过。
- `pnpm --filter @qianwen-agent/server start`：通过，server 监听 `http://127.0.0.1:3001`。
- `curl -s http://127.0.0.1:3001/health`：返回 `{"ok":true,"service":"qianwen-agent-server","imports":{"agentRuntime":true,"observability":true,"shared":"phase"}}`。
- `pnpm --filter @qianwen-agent/web dev`：通过，Vite 监听 `http://localhost:3000/`。
- `curl -s http://127.0.0.1:3000/`：返回 Vite HTML。
- `curl -s http://127.0.0.1:3000/src/main.tsx`：返回 Vite 转译后的 React 入口，包含 shared 示例渲染内容。

## 最终结论

Stage 0 已完成，满足 Roadmap 对 Monorepo 骨架与共享协议的验收项。下一步进入 Stage 1：最小聊天闭环。

## 后续演进

- Stage 1 基于该骨架实现最小聊天闭环。
- Stage 2 为 `packages/observability` 增加真实 run trace 类型和 Server PrismaTraceSink。
- Stage 3 为 `packages/agent-runtime` 增加 QwenProvider、ContextBuilder 和 ThoughtPresenter。

