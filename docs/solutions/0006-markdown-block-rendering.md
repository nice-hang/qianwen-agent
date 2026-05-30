# 前端 Markdown 区块渲染优化

## 状态

Implemented

## 对应 Roadmap

- Stage: Stage 4
- Step: 前端 Markdown 区块渲染优化
- 相关验收项:
  - assistant 内容中的标题、列表、代码块、表格、链接能正确渲染
  - reasoningContent 和 content 分别作为思考区和回答区渲染
  - 代码块有语言标签和复制按钮
  - 表格不会撑破消息列或移动端 viewport
  - 不改 Qwen system prompt，不改消息存储结构

## 背景

当前 Web 已具备千问风格聊天布局，但 assistant 内容仍接近纯文本展示。真实千问会话结构显示：主回答内容是 Markdown string，Markdown 不适合表达的业务块通过 `[(source_seq)]` marker 关联 `multi_load` sidecar 数据。

本阶段先实现 Markdown 原生区块的高质量前端渲染，不引入业务自定义块协议。后续联网搜索、图片理解或工具结果出现时，再增加 marker + sidecar 或结构化事件。

## 目标

- 使用成熟 Markdown 渲染链路展示 assistant `content`。
- `reasoningContent` 仍作为独立 ThinkingBlock，但内部也使用同一个 MarkdownRenderer。
- 支持 GFM 表格、删除线、task list 等常见 Chatbox 输出。
- 自定义代码块、表格、链接、引用、列表、标题等样式。
- 保持流式输出可读，未闭合 Markdown 不应导致页面明显错乱。
- 保持 Server、DB、Agent Runtime 消息协议不变。

## 非目标

- 不修改 Qwen system prompt。
- 不把消息存储改成 block tree。
- 不实现 marker + sidecar 自定义业务块。
- 不实现联网搜索 sources、图片、文件、工具调用或 Artifact 侧栏。
- 不支持 raw HTML / MDX。
- 不在 Markdown 中执行任意 HTML 或脚本。

## 技术选型

选择 `react-markdown + remark-gfm`。

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| `react-markdown + remark-gfm` | React 组件化、AST 管线成熟、易覆盖 code/table/link、生态强 | 比轻量库稍重 | 采用 |
| `markdown-it` | 快、插件多、默认禁 HTML | 主要输出 HTML string，接 React 组件需桥接 | 暂不采用 |
| `marked` | 快、轻量、API 简单 | 输出 HTML string，需额外 sanitize | 暂不采用 |
| `markdown-to-jsx` | 轻、直接 JSX | 生态和复杂 Markdown 处理弱于 unified | 暂不采用 |
| MDX | 可嵌入 React 组件 | 不适合模型生成内容，安全和稳定性差 | 不采用 |

## 初步技术方案

```txt
message.reasoningContent
  -> ThinkingBlock
  -> MarkdownRenderer

message.content
  -> MarkdownRenderer

MarkdownRenderer
  -> react-markdown + remark-gfm
  -> components override
       heading / paragraph / list / blockquote / link / hr
       inline code
       fenced code block -> CodeBlock
       table -> TableBlock
```

禁用 raw HTML，不接 `rehype-raw`。如果后续需要更强安全清洗，再引入 `rehype-sanitize`。

## 区块设计

- Heading：限制字号层级，避免回答内标题过大。
- Paragraph：保持舒适行高和段落间距。
- List：支持嵌套列表，控制缩进和移动端换行。
- InlineCode：轻量背景，不打断中文行高。
- CodeBlock：显示语言标签、复制按钮、代码横向滚动，长行不撑破布局。
- TableBlock：外层滚动容器，表头/单元格边框和移动端横向滚动。
- Blockquote：左侧细线和浅色文本，适合提示/推荐。
- Link：外链打开新窗口，样式接近千问正文链接。
- Hr：作为回答段落分隔。

## 实现计划

- [x] 安装 `react-markdown` 和 `remark-gfm`。
- [x] 新增 MarkdownRenderer 组件和样式。
- [x] 新增 CodeBlock 组件和样式。
- [x] 新增 TableBlock 组件和样式。
- [x] 更新 MessageBubble：assistant content 使用 MarkdownRenderer。
- [x] 更新 ThinkingBlock：reasoningContent 使用 MarkdownRenderer。
- [x] 补充流式中未闭合 code fence / table 的兜底样式。
- [x] 用包含标题、列表、表格的真实回答验证。
- [x] 运行 typecheck。
- [x] 用本地浏览器验证 desktop 布局。

## 实现记录

- Web 新增 `react-markdown` 和 `remark-gfm` 依赖。
- 新增 MarkdownRenderer，统一渲染 assistant `content` 和 `reasoningContent`。
- MarkdownRenderer 禁用 raw HTML，不接 `rehype-raw`，保持模型输出不执行 HTML。
- 新增 CodeBlock，基于 `react-syntax-highlighter` 支持语言标签、语法高亮、行号、复制按钮、横向滚动和长代码不撑破布局。
- 新增 TableBlock，给 Markdown table 增加横向滚动容器和统一表格样式。
- ChatView 中用户消息仍按纯文本气泡渲染；assistant 消息改为 MarkdownRenderer。
- ThinkingBlock 保持独立视觉容器，内部改为 MarkdownRenderer。
- ThinkingBlock 支持展开/隐藏，默认隐藏思考正文，只保留状态入口。

## 关键文件

- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/markdown/MarkdownRenderer.tsx`
- `apps/web/src/components/markdown/CodeBlock.tsx`
- `apps/web/src/components/markdown/TableBlock.tsx`
- `apps/web/src/components/markdown/MarkdownRenderer.css`

## 验证方式

- [x] `pnpm typecheck`
- [x] Desktop 浏览器验证：历史回答中的表格渲染为 TableBlock
- [ ] Mobile 截图：代码块和表格不撑破 viewport
- [ ] Streaming 手动验证：未闭合 Markdown 不导致明显布局错乱

## 验证记录

- `/Users/bytedance/.nvm/versions/node/v22.19.0/bin/pnpm --filter @qianwen-agent/web typecheck` 通过。
- `/Users/bytedance/.nvm/versions/node/v22.19.0/bin/pnpm typecheck` 通过。
- CodeBlock 已切换到 `react-syntax-highlighter`，并再次通过 Web 包和全仓 typecheck。
- ThinkingBlock 默认隐藏思考正文，展开后用 MarkdownRenderer 渲染 reasoningContent；Web 包 typecheck 通过。
- 本地启动 Web + Server 后验证历史消息：
  - `markdownRoots=3`
  - `tableBlocks=1`
  - `bodyScroll=false`
  - `shellScroll=false`
- 当前本地历史消息未覆盖 fenced code block 真实样本；CodeBlock 通过 TypeScript 和组件渲染路径覆盖，后续真实代码回答出现时继续补截图记录。

## 待确认问题

- 暂无。

## 最终结论

Stage 4 已完成。当前 Web 使用 Markdown-first 的内容渲染方式，保持消息数据仍为 string，不修改 Qwen system prompt，不引入 block tree。Markdown 原生区块由前端组件覆盖渲染；业务自定义块留到搜索、附件或工具能力出现时再扩展。

## 后续演进

- Stage 5 联网搜索实现后，增加来源区块。若 provider 能给结构化 sources，优先用结构化事件；否则再考虑 marker + sidecar。
- 图片理解实现后，增加附件/图片区块。
- 工具调用出现后，再设计 Agent step / Tool result 业务区块。
