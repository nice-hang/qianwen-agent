# AGENTS.md

本文件是 coding agent 进入本仓库时的短入口。保持精简；具体实现以 `README.md`、`docs/roadmap.md`、`docs/status.md`、`docs/handoff.md` 和当前 step 的 `docs/solutions/*` 为准。

## 项目定位

本仓库实现一个千问AI Chatbox 全栈应用，采用 monorepo 组织：

```txt
apps/web       React Web
apps/mobile    React Native
apps/server    Node.js Server
packages/shared
packages/agent-runtime
packages/observability
```

MVP 包含：

- 多轮聊天
- 流式输出
- 深度思考
- 联网搜索
- 图片理解
- 轻量记忆
- Run trace 调试面板

## 必读顺序

实现前优先读：

1. `README.md`
2. `docs/roadmap.md`
3. `docs/status.md`
4. `docs/handoff.md`
5. 当前 step 对应的 `docs/solutions/*`，存在时读取

`discuss/` 只作为背景资料，需要追溯决策原因时再看。

## 工作原则

借鉴 Karpathy-inspired coding guidelines：

### 1. 编码前先思考

- 不要默默替用户做关键假设。
- 如果需求有多种解释，先说明差异和取舍。
- 如果存在更简单的方案，直接指出。
- 如果信息不足会影响架构、数据模型或协议，先问清楚。

### 2. 简洁优先

- 用当前阶段需要的最小实现解决问题。
- 不为一次性逻辑提前抽象。
- 不添加未要求的灵活性、插件化、配置化。
- 如果实现明显臃肿，先简化再继续。
- 无内部状态或生命周期的逻辑优先用普通函数/函数工厂，不为了“分层”而写 class。
- 配置由真正使用它的模块读取；不要让上层读取后再原样透传，除非这是明确的启动边界或测试注入点。
- 协议、接口和数据结构只表达当前真实行为；不要为未来可能性预留字段、状态或分支。
- 分层和运行时代码必须服务真实产品路径；如果只是转发、占位或方便测试，优先删除。

### 3. 精准修改

- 只改和当前任务直接相关的文件。
- 不顺手重构无关代码。
- 不改动自己没理解的相邻逻辑。
- 只清理本次改动造成的无用代码。
- 每一行改动都应该能追溯到当前目标。

### 4. 目标驱动执行

- 开始前明确“要实现什么、怎么验证、哪些暂不做”。
- 对多步骤任务先给简短计划。
- 实现后必须说明验证结果。
- 如果无法验证，明确说明原因和剩余风险。

### 5. Git 提交

- commit message 使用中文。
- 如果需要改写历史提交信息，也保持中文表述。

## 实现策略

按端到端能力切片推进，不按模块瀑布式实现。

优先打通：

```txt
UI -> Server -> Agent -> Qwen -> DB -> Stream -> UI
```

不要过早引入：

- 完整 RAG
- MCP / Skill / Subagent
- LangGraph 固定编排
- 独立 Agent 服务
- 产品运营大盘

实现每个阶段时，优先先删掉“看起来以后会用”的字段、接口和分层。只有当当前验收项真的需要它，或下一步已经明确要基于它继续实现时，才保留。

## 边界

- UI 不拼 prompt，不保存 provider key，不执行工具。
- Server 负责 API、持久化、stream 网关、uploads、adapters 和调用 AgentRuntime。
- Agent Runtime 位于 `packages/agent-runtime`，负责 ContextBuilder、QwenProvider、ThoughtPresenter、ToolRegistry、MemoryManager。
- Observability 位于 `packages/observability`，MVP 只关注 run trace、TTFE/TTFR/TTFA/TTC、provider latency 和 token usage。

## 验证

每次实现后说明验证方式。无法验证时，明确说明原因和风险。
