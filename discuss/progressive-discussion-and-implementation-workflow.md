# 渐进式讨论与实现留存方案

本文记录一套适合本项目的“先讨论、再规划、后实现、持续留存”的工作流。目标是让产品形态、技术决策、实现状态和交接信息都沉淀在仓库中，而不是散落在聊天记录里。

## 1. 借鉴的现有方案

### ADR / MADR

ADR 适合记录重要技术决策的背景、选项、取舍和后果。MADR 是更结构化的 Markdown ADR 模板，强调轻量、可维护、便于长期追溯。

适合本项目记录：

- 是否采用 single agent loop，而不是 LangGraph 固定编排。
- server 和 agent 是否同服务部署。
- 是否暂缓 RAG。
- Skill/MCP 是否暂不实现。
- 前端流式协议选择 SSE 还是 WebSocket。

不适合记录：

- 每个小函数怎么写。
- 临时 bugfix。
- 尚未形成结论的长篇讨论。

### Spec-Driven Development / Spec Kit

GitHub Spec Kit、OpenSpec、Kiro 这类方案的共同点是：先把意图写成结构化 spec，再生成技术 plan 和 tasks，最后才实现。它们的强项是防止 agent 一上来就写代码，也方便跨 session 继续工作。

这类工具一般会分成：

```txt
spec
  -> plan
  -> tasks
  -> implement
```

适合借鉴，但不建议完整引入复杂工具链。原因是当前项目还在产品形态探索期，过早上重流程会增加维护成本。我们可以采用它的产物结构，而不是强绑定 CLI。

### AGENTS.md / CLAUDE.md / Steering Docs

Claude Code、Codex、Cursor、Copilot 等工具都在走“仓库内上下文文件”的方向：

- `AGENTS.md`：给 coding agent 的项目入口说明。
- `CLAUDE.md`：Claude Code 的项目记忆与工作约束。
- `.cursor/rules` / `.github/copilot-instructions.md`：IDE/平台级规则。
- Kiro steering docs：持续指导 spec 和实现的项目背景资料。

这个方向很适合本项目，因为后续实现会跨多轮对话，必须有一个短而稳定的“入口记忆”。

## 2. 推荐采用轻量混合方案

不直接照搬某个工具，而是采用三层留存：

```txt
discuss/
  原始讨论沉淀、阶段性问题、行业调研、非最终结论

docs/
  稳定产品规划、技术规划、ADR、实现计划、状态记录

AGENTS.md
  给后续 agent 的短入口：读哪些文档、当前阶段、怎么继续
```

原则：

- 讨论和结论分开。
- 结论和实现状态分开。
- 大文档和 agent 入口分开。
- 每次完成一段实现后更新状态，而不是等项目结束再补文档。
- 文档要能被人读，也要能被 agent 按需加载。

## 3. 文件结构建议

推荐逐步形成以下结构：

```txt
AGENTS.md

discuss/
  qianwen-chatbox-agent-architecture.md
  progressive-discussion-and-implementation-workflow.md
  research/
    chatbox-agent-runtime.md
    deep-thinking-ui.md
    memory-and-context.md
  notes/
    2026-05-28-initial-product-shape.md

docs/
  product/
    vision.md
    user-scenarios.md
    feature-scope.md
  architecture/
    overview.md
    client.md
    server.md
    agent-runtime.md
    stream-protocol.md
    memory.md
  adr/
    0001-use-single-agent-loop.md
    0002-keep-server-and-agent-in-one-service.md
    0003-defer-rag.md
    0004-do-not-implement-skill-mcp-now.md
  implementation/
    roadmap.md
    status.md
    handoff.md
```

一开始不需要把所有文件都建出来。建议先建：

```txt
AGENTS.md
docs/product/vision.md
docs/architecture/overview.md
docs/implementation/roadmap.md
docs/implementation/status.md
docs/implementation/handoff.md
docs/adr/
```

后续某块内容变复杂时再拆分。

## 4. 两类内容如何区分

### 讨论类

放在 `discuss/`。

用途：

- 记录探索过程。
- 记录对比资料。
- 保存还没完全稳定的想法。
- 记录“为什么我们当时这么想”。

特点：

- 可以长。
- 可以包含未决问题。
- 可以包含被否定的方向。
- 不要求每句话都是最终结论。

### 指导类

放在 `docs/` 和 `AGENTS.md`。

用途：

- 指导后续实现。
- 给 agent 快速恢复上下文。
- 作为验收依据。
- 记录当前已实现到哪一步。

特点：

- 短。
- 稳定。
- 有明确状态。
- 需要持续更新。
- 不放冗长讨论，只放可执行结论。

## 5. 推荐工作流

### Phase 1：讨论与探索

当问题还没定型时，只写 `discuss/`：

```txt
discuss/research/topic.md
```

内容模板：

```md
# 主题

## 背景

## 讨论问题

## 外部参考

## 主要观点

## 暂定结论

## 未决问题
```

### Phase 2：沉淀稳定规划

当一个方向基本确定后，把讨论压缩到 `docs/`：

```txt
docs/product/feature-scope.md
docs/architecture/agent-runtime.md
```

这里不要复制完整讨论，只写最终约定：

- 要做什么。
- 不做什么。
- 为什么。
- 影响哪些模块。
- 后续可扩展点是什么。

### Phase 3：重要决策写 ADR

当一个选择会影响后续实现路径，就写 ADR：

```txt
docs/adr/0001-use-single-agent-loop.md
```

推荐模板：

```md
# ADR-0001: 使用 Single Agent Loop

## Status

Accepted

## Context

## Decision

## Alternatives Considered

## Consequences

## Follow-ups
```

### Phase 4：实现前生成任务

进入实现前，把目标拆成 roadmap/tasks：

```txt
docs/implementation/roadmap.md
```

推荐格式：

```md
# Roadmap

## Stage 0: 项目脚手架

- [ ] 建立 monorepo 结构
- [ ] 建立 shared message schema
- [ ] 建立 server health check

## Stage 1: 基础聊天链路

- [ ] Web Chat UI
- [ ] RN Chat UI
- [ ] Server chat endpoint
- [ ] SSE/WebSocket stream

## Stage 2: Agent Runtime

- [ ] AgentLoop
- [ ] ToolRegistry
- [ ] ContextBuilder
- [ ] ThoughtPresenter
```

### Phase 5：每次实现后更新状态

每完成一组任务，更新：

```txt
docs/implementation/status.md
docs/implementation/handoff.md
```

`status.md` 记录当前事实：

```md
# Implementation Status

## Current Stage

Stage 1: 基础聊天链路

## Completed

- Web Chat UI 初版
- Server `/chat/stream` 初版

## In Progress

- AgentLoop 接入工具调用

## Not Started

- 图片理解
- 长期记忆

## Known Issues

- RN 端流式解析未验证
```

`handoff.md` 给下一轮 agent：

```md
# Handoff

## Current Goal

## Important Decisions

## Current Code State

## Files To Read First

## Next Steps

## Verification

## Blockers / Risks
```

## 6. AGENTS.md 应该怎么写

`AGENTS.md` 不应该很长。它是入口，不是百科。

建议内容：

```md
# AGENTS.md

This repo implements a Qianwen-like cross-platform Chatbox demo.

## Read First

- docs/product/vision.md
- docs/architecture/overview.md
- docs/implementation/status.md
- docs/implementation/handoff.md

## Core Decisions

- Use React Native for Android/iOS and React for Web.
- Keep server API and Agent Runtime in one service for now.
- Use a controlled single Agent Loop, not fixed LangGraph orchestration.
- Prioritize image understanding and tool calling.
- Defer RAG, MCP, Skill system, and subagents.

## Working Rules

- Update docs/implementation/status.md after meaningful implementation progress.
- Update docs/implementation/handoff.md before stopping a multi-step task.
- Create ADRs for decisions that change architecture direction.
- Keep discuss/ for exploration and docs/ for stable guidance.
```

## 7. 为什么不直接全量使用 Spec Kit / OpenSpec

这些方案很强，但当前项目不一定需要完整引入。

暂不直接引入的原因：

- 项目还处在产品形态和技术边界探索阶段。
- 完整 spec workflow 容易带来模板负担。
- 当前最重要的是持续沉淀可读上下文，而不是严格流程自动化。
- 手写 Markdown 更容易按本项目节奏调整。

可以后续引入的时机：

- 功能模块变多。
- 多人协作。
- 每个 feature 都需要验收标准。
- 需要把 spec、plan、tasks 自动串起来。
- 需要让不同 agent 稳定接手。

## 8. 当前项目建议的执行顺序

第一步，整理顶层指导：

- `docs/product/vision.md`
- `docs/architecture/overview.md`
- `docs/implementation/roadmap.md`
- `docs/implementation/status.md`
- `docs/implementation/handoff.md`
- `AGENTS.md`

第二步，把已经确定的重要决策写成 ADR：

- `0001-use-single-agent-loop.md`
- `0002-keep-server-and-agent-in-one-service.md`
- `0003-prioritize-image-understanding.md`
- `0004-defer-rag-skill-mcp-subagent.md`

第三步，再进入实现：

- 搭 monorepo。
- 做 shared message schema。
- 做 Web/RN chat shell。
- 做 server stream endpoint。
- 做 AgentLoop 和 ToolRegistry。
- 做图片理解链路。
- 做 ThoughtPresenter 和深度思考事件。
- 做 ContextBuilder 和记忆。

## 9. 最终采用的原则

一句话：

> 讨论留在 `discuss/`，稳定规划沉淀到 `docs/`，关键决策写 ADR，当前实现状态写 `status.md`，下一轮接手信息写 `handoff.md`，agent 入口只保留短而稳定的 `AGENTS.md`。

这套方案借鉴 ADR、Spec-Driven Development 和 agent memory docs，但不引入过重流程，适合当前这个渐进式实现的项目。
