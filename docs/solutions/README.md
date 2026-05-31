# Solutions

本目录用于记录每个 roadmap step 的技术方案。

每个 step 在正式实现前，先创建一份 solution 文档；后续讨论、实现、验证和取舍都持续反补到这份文档中。它既是实现前的技术方案，也是实现后的方案留存。

## 使用方式

1. 从 `docs/roadmap.md` 选择一个即将执行的 step。
2. 复制 `template.md` 创建对应 solution。
3. 先填写背景、目标、非目标、初步方案和待确认问题。
4. 多轮讨论后更新方案对比、设计意图和实现计划。
5. 实现过程中持续更新“实现记录”和“验证记录”。
6. 实现完成后更新最终结论、关键文件和后续演进。

## 命名建议

```txt
0001-monorepo-workspace-and-shared-protocol.md
0002-minimal-chat-stream.md
0003-run-trace-debug-observability.md
0004-deep-thinking.md
0005-web-ui-qianwen-style.md
0006-markdown-block-rendering.md
0007-agent-loop-web-search.md
0008-image-understanding.md
0009-lightweight-memory.md
0010-react-native-client.md
```

## 与其他目录的区别

- `discuss/`：记录开放讨论、背景调研、未稳定结论。
- `docs/roadmap.md`：记录阶段顺序和验收标准。
- `docs/status.md`：记录当前实现状态。
- `docs/handoff.md`：记录跨轮次交接。
- `docs/solutions/`：记录每个 step 的技术方案、实现过程和最终留存。
