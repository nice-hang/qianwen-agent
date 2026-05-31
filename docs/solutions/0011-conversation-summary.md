# 会话摘要

## 状态

Planned

## 对应 Roadmap

- Stage: Stage 9
- Step: Conversation Summary
- 相关验收项:
  - 长会话刷新后仍能使用已有摘要构造上下文
  - 最近几轮原文不被摘要替代
  - 摘要失败不影响主回答链路
  - 不实现跨会话长期记忆

## 背景

当前 `conversations` 表已经有 `summary` 字段，但 ContextBuilder 还没有利用它。随着 Stage 5 引入搜索工具、Stage 6 收敛 runtime loop，后续最实际的上下文能力不是长期记忆，而是同一会话摘要：

- 长对话会不断增加 provider 输入 token。
- 用户通常更关心当前会话内的连续上下文，而不是跨会话偏好记忆。
- 摘要可以复用现有 `conversations.summary`，不需要新增 `memories` 表和记忆管理 UI。

因此 Stage 9 只做 conversation summary，不做显式长期记忆。

## 目标

- 为长会话生成和更新摘要。
- ContextBuilder 使用 `summary + recent messages` 构造模型输入。
- 摘要生成不阻塞主回答，失败时静默降级。
- Server 负责持久化 summary，Agent Runtime 负责摘要生成提示与模型调用。
- Debug 记录摘要更新事件，便于观察是否触发。

## 非目标

- 不做跨会话长期记忆。
- 不建立 `memories` 表。
- 不实现 `memory_write` / `memory_delete`。
- 不做 Memory Panel。
- 不让前端控制摘要开关或摘要 prompt。
- 不把摘要展示成主聊天内容。

## 初步方案

```txt
assistant answer done
  -> Server 判断是否需要摘要
  -> 调用 agent-runtime summarizeConversation
  -> 写 conversations.summary
  -> 写 debug event

下一轮聊天
  -> Server 读取 conversation.summary + recent messages
  -> Agent Runtime buildProviderMessages 注入 summary
  -> 正常 runAgent
```

触发策略第一版保持简单：

- 会话消息数超过阈值后触发。
- 或 recent messages 估算字符数超过阈值后触发。
- 每轮回答后最多触发一次，摘要失败不重试阻塞主链路。

上下文策略：

- `summary` 放在 system/developer 语义附近，说明这是当前会话历史摘要。
- 保留最近 N 轮完整消息，避免“这个/上面/刚才”这类短期指代丢失。
- current user message 永远保留原文。

## 实现计划

- [ ] 补 `conversation.summary` 的读写 repository 方法。
- [ ] 新增 Agent Runtime 摘要生成函数，复用 Qwen provider。
- [ ] 在 Server 回答完成后判断是否异步更新 summary。
- [ ] 更新 `buildProviderMessages`，在存在 summary 且消息较长时注入摘要。
- [ ] Debug 记录 summary update started/done/error。
- [ ] 用长会话构造数据验证 summary 被注入，最近消息仍保留。
- [ ] 跑 server / agent-runtime / 全仓 typecheck。

## 待确认问题

- 摘要触发阈值用消息数还是字符数。第一版倾向字符数，因为不需要 tokenizer 也更贴近上下文压力。
- 摘要更新是否同步等待。当前倾向异步 fire-and-forget，但需要避免进程退出或请求结束后 promise 泄漏。
- 是否需要 `summaryUpdatedAt` 字段。当前倾向先不加，除非触发策略必须区分摘要覆盖范围。

## 最终结论

待实现后更新。
