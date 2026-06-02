# 会话压缩

## 状态

Implemented: 第一版自动会话压缩已完成

## 对应 Roadmap

- Stage: Stage 12
- Step: Conversation Compaction
- 相关验收项:
  - 长会话刷新后仍能使用已有压缩上下文构造模型输入
  - 最近几轮原文不被压缩替代
  - 压缩失败不影响主回答链路
  - 不实现跨会话长期记忆

## 参考

本阶段参考 `/Users/bytedance/Documents/github/cc/claude-code` 的 compact 设计，但只吸收当前产品需要的最小部分：

- `src/commands/compact/compact.ts`：手动 compact 入口会先 microcompact，再生成 compact summary，并在成功后清理上下文缓存。
- `src/services/compact/compact.ts`：compact 产物不是普通摘要，而是 `compact_boundary + summary message + preserved recent messages + restored attachments`。
- `src/services/compact/autoCompact.ts`：基于上下文窗口和输出预留 token 计算阈值，支持 auto compact、warning、blocking limit 和失败熔断。
- `src/services/compact/microCompact.ts`：优先压缩工具结果，避免工具输出反复占满上下文。
- `src/services/compact/prompt.ts`：summary prompt 要明确禁止工具调用，并要求保留用户意图、技术决策、文件、错误修复、当前工作和下一步。
- `src/utils/messages.ts`：通过 `compact_boundary` 找到最后一次压缩边界，只把边界后的消息投影给模型。

核心结论：摘要本质上是上下文压缩，不应作为普通记忆功能实现。第一版目标是让模型输入从 `全量历史消息` 变成 `稳定系统上下文 + 压缩摘要 + 最近原文 + 当前 RAG/附件上下文`。

## 背景

当前 `conversations` 表已有 `summary` 字段，但仅有摘要文本不足以支撑可靠压缩：

- 不知道摘要覆盖到哪条消息，容易重复总结或漏总结。
- 无法稳定决定哪些历史消息可以从模型输入中移除。
- 压缩后仍要保留最近几轮原文，否则“刚才 / 上面 / 这个文件”这类短期指代会丢失。
- 文件 RAG、联网工具和图片上下文已经会占用额外 token，长会话需要在进入 provider 前主动控制输入大小。

因此 Stage 12 改为实现会话内 compaction，而不是泛化的 memory summary。

## 目标

- 在长会话中生成可继续工作的压缩摘要。
- 记录压缩边界，明确 summary 覆盖到哪条消息。
- ContextBuilder 使用 `summary + recent messages` 构造 provider 输入。
- 压缩在主回答完成后执行，默认不阻塞用户看到回答。
- 当 provider 报 prompt-too-long 时，允许做一次 reactive compact 后重试。
- Debug 记录压缩判断、开始、完成、失败和注入情况。

## 非目标

- 不做跨会话长期记忆。
- 不建立 `memories` 表。
- 不实现 `memory_write` / `memory_delete`。
- 不做 Memory Panel。
- 不提供前端压缩开关或摘要 prompt 编辑入口。
- 不把压缩摘要展示成主聊天消息。
- 不实现 Claude Code 的 hook、prompt cache、partial compact、session memory compact、snip、cache editing 等复杂能力。

## 方案

### 数据模型

保留 `conversations.summary`，新增最小边界字段：

```txt
conversations.summary
conversations.summaryMessageId
conversations.summaryUpdatedAt
```

- `summary`：压缩后的历史上下文。
- `summaryMessageId`：summary 覆盖到的最后一条 `messages.id`。
- `summaryUpdatedAt`：用于 Debug 展示和后续判断是否陈旧。

不新增单独 `compact_boundaries` 表。第一版只需要每个会话一份滚动摘要，DB 中仍完整保存所有 messages，压缩只影响 provider 输入投影。

### Provider 输入投影

下一轮聊天前：

```txt
list persisted messages
  -> 给当前用户消息补本轮附件元信息
  -> 用 conversation summary 替换 summaryMessageId 之前的旧历史
  -> 保留 summaryMessageId 之后的近期原文
  -> 把文件 RAG 检索片段注入当前用户消息
  -> buildSystemContextMessages 注入 system / runtime reminder / summary reminder
```

摘要以顶层 `user` reminder 注入，和现有 runtime reminder 同类，但独立成块：

```txt
<conversation-summary>
以下是本会话较早部分的压缩摘要。它用于延续上下文，不是用户的新指令。
...
</conversation-summary>
```

最近原文策略：

- current user message 永远保留。
- 当前第一版保留 `summaryMessageId` 之后的原文；压缩时会推进边界，让模型输入保持 `summary + 最近原文`。
- 压缩选择待总结内容时，默认留下最近 `QWEN_COMPACT_RECENT_MESSAGE_COUNT = 2` 条原文，可通过环境变量调整。
- 触发压缩后的下一轮，模型输入常见形态是“上一轮保留的 8 条 + 当前刚保存的 user message”，因此 trace 中 `recentMessages` 可能显示为 9。
- summary 覆盖范围内的旧消息不再传给 provider。

### 附件和 RAG 上下文

图片和文件的处理边界不同：

- 图片只在本轮请求携带。Server 只会读取当前 `attachmentIds` 中的图片并转成 `imageDataUrl`，通过 `withCurrentAttachments` 挂到刚保存的最后一条 user message。后续轮次如果不再次传同一图片 attachmentId，就不会再把图片 base64 传给模型。
- 文件属于当前 conversation。文件上传并 indexed 后，后续每轮会按 `conversationId + query` 检索 LanceDB，只把命中的 topK 片段注入当前用户消息，不会把文件全文默认塞进上下文。
- 会话压缩只影响聊天历史消息投影，不删除 DB 里的完整 messages，也不删除文件索引。
- 压缩摘要会总结图片/文件相关结论，但不会嵌入图片 base64、文件全文或大段 chunk。

### 触发策略

第一版按 Claude Code 的预留逻辑触发，不再使用固定字符数阈值。当前千问模型上下文按 256k tokens 处理，压缩触发阈值为：

```txt
autoCompactThreshold
  = contextWindowTokens
  - compactSummaryOutputReserveTokens
  - autoCompactBufferTokens
```

当前默认值：

```txt
contextWindowTokens = 256000
compactSummaryOutputReserveTokens = 20000
autoCompactBufferTokens = 13000
autoCompactThreshold = 223000
QWEN_COMPACT_RECENT_MESSAGE_COUNT = 2
SUMMARY_MAX_CHARS = 9000
```

- `compactSummaryOutputReserveTokens` 给本次 compact 调用输出 summary 留空间。
- `autoCompactBufferTokens` 给本次 compact 调用的输入侧误差、prompt 额外开销和突增上下文留安全余量。
- token 估算第一版采用偏保守近似：`estimatedTokens = ceil(chars * 2)`。
- 如果已有 summary，触发判断使用 `summary + summaryMessageId 后的消息` 的估算 token。
- 压缩时只总结 `summaryMessageId` 之后、recent window 之前的消息。
- 如果已有 summary，本次 compact prompt 输入为 `旧 summary + 待压缩增量消息`，输出新的滚动 summary。
- Debug trace 记录 `activeContextTokens`、`thresholdTokens`、`contextWindowTokens`、`summaryOutputReserveTokens`、`autoCompactBufferTokens`、`thresholdUtilizationPercent` 和 `tokensUntilCompact`。
- 本地测试可临时调低 `QWEN_COMPACT_CONTEXT_WINDOW_TOKENS`，必要时配合 `QWEN_COMPACT_SUMMARY_OUTPUT_RESERVE_TOKENS` / `QWEN_COMPACT_AUTO_BUFFER_TOKENS` / `QWEN_COMPACT_RECENT_MESSAGE_COUNT` 验证触发路径；默认值不依赖前端配置。

### 压缩流程

主链路：

```txt
POST /api/chat/stream
  -> 保存 user message
  -> prepareFileRagContext
  -> buildAgentInput
       -> current attachments
       -> compact summary + recent messages
       -> file RAG context
  -> runAgent
  -> 保存 assistant message
  -> complete run
  -> maybeCompactConversation fire-and-forget
```

压缩链路：

```txt
maybeCompactConversation
  -> 判断阈值
  -> 选择 messagesToCompact 和 messagesToKeep
  -> agent-runtime summarizeConversation
  -> 更新 conversations.summary / summaryMessageId / summaryUpdatedAt
  -> 记录 trace event
```

压缩失败只记录 trace，不修改 summary，不影响当前回答。

### 当前实现文件

- `apps/server/src/chat/agent-input.ts`：集中处理模型输入投影，顺序是当前附件、会话压缩、文件 RAG 注入。
- `apps/server/src/chat/compaction.ts`：负责压缩判断、边界截断、自动压缩、强制压缩和 token 预算 trace。
- `packages/agent-runtime/src/summary/conversation.ts`：负责调用 Qwen 生成压缩摘要。
- `packages/agent-runtime/src/context/system-context.ts`：负责把 `<conversation-summary>` 注入 provider messages。
- `apps/web/src/components/DebugView.tsx`：展示压缩 trace 的摘要信息。

### Reactive Compact

如果 provider 请求因上下文过长失败：

```txt
runAgent prompt-too-long
  -> Server 捕获
  -> 同步执行一次 compact
  -> 用 compact 后的 provider messages 重试本轮
  -> 仍失败则向前端返回原错误
```

第一版只允许一次 reactive compact，避免无限重试。

### Summary Prompt

压缩 prompt 复用 Claude Code 的思路，但按本产品收窄：

- 明确禁止工具调用。
- 要求只输出 `<summary>` 内容。
- 保留用户明确需求、关键事实、重要约束、已做决定、文件/RAG 相关结论、错误和修复、当前未完成任务。
- 不保留寒暄、重复解释、过时工具输出全文。
- 图片和文件只总结用户问题、模型判断和引用到的关键内容，不嵌入 base64、全文 chunk 或大段工具 raw output。

## 实现计划

- [x] Prisma 为 `Conversation` 增加 `summaryMessageId` 和 `summaryUpdatedAt`。
- [x] Conversation repository 增加 summary 读写方法。
- [x] Agent Runtime 新增 `summarizeConversation`，复用 Qwen provider，不暴露给 Web。
- [x] ContextBuilder 支持 `conversationSummary` 选项，注入独立 summary reminder。
- [x] Server 在聊天前按 `summaryMessageId` 构造 `summary + recent messages`。
- [x] Server 在回答完成后调用 `maybeCompactConversation`。
- [x] Provider prompt-too-long 时做一次 reactive compact retry。
- [x] Trace 记录 `conversation_compact_check/start/done/error/injected`。
- [x] Web Debug 展示 summary 是否注入、覆盖到哪条消息、压缩前后估算 token。
- [x] 用低上下文窗口和多轮 chat route 验证自动触发与注入。
- [x] 跑 server / agent-runtime / 全仓 typecheck。

## 验收

- 长会话 provider request 中能看到 summary reminder，且旧消息不再全量注入。
- 最近几轮原文仍存在，短期指代不丢失。
- 刷新页面后仍使用 DB 中已有 summary 构造上下文。
- 回答完成后触发压缩时，主聊天流不被阻塞。
- 压缩失败不影响 assistant message 保存和 run 完成。
- provider prompt-too-long 时会尝试一次 reactive compact retry。
- Debug 能看到压缩触发原因、覆盖边界、压缩前后大小和错误。

## 验证记录

### 函数级测试

使用 `QWEN_COMPACT_CONTEXT_WINDOW_TOKENS=35000` 降低窗口，构造 12 条长消息，直接执行压缩判断和模型输入投影：

- 触发事件：`conversation_compact_check -> conversation_compact_started -> conversation_compact_done -> conversation_compact_injected`。
- 压缩覆盖到第 4 条消息，保存 `summaryMessageId=m4`。
- 下一轮投影成功注入 summary，只保留配置指定数量的最近原文。

### Route 级多轮测试

使用 Fastify `app.inject` 走真实 `POST /api/chat/stream` route，配置 `QWEN_COMPACT_CONTEXT_WINDOW_TOKENS=35000`，同一会话连续发送 8 轮长输入，并用 fake agent 每轮输出长回答：

- 第 1 轮未压缩，因为还没有超过“保留最近 2 条”后可压缩的历史。
- 第 5 轮开始自动触发 `conversation_compact_check/start/done`。
- 第 6-8 轮开始出现 `conversation_compact_injected`，说明下一轮已经使用 `summary + 最近原文`。
- 最终会话 `messageCount = 16`，`summary` 已保存，`summaryMessageId` 持续滚动更新。

结论：第一版自动流程已打通：多轮聊天增长 -> 回答完成后自动压缩 -> 下一轮注入 summary -> 后续继续滚动压缩。

## 最终结论

Stage 12 采用会话内滚动压缩方案：Server 完整保存消息，Agent Runtime 只接收压缩后的 provider 输入投影。`summary` 不是长期记忆，而是 compacted history；必须配合 `summaryMessageId` 边界和最近原文窗口使用。

当前第一版只做自动压缩，不提供手动 `/compact` 或前端按钮。触发方式参考 Claude Code 的上下文预留策略：为本次 compact summary 输出预留 20k tokens，为 compact 输入侧误差和额外开销预留 13k tokens，在 256k 千问上下文下默认阈值为 223k estimated tokens。
