# 本地文件 RAG

## 状态

In Progress

## 对应 Roadmap

- Stage: Stage 10
- Step: Local File RAG with LanceDB
- 相关验收项:
  - 用户能上传文本、PDF、DOCX 等文件
  - Server 能解析文件、切分 chunk、生成 embedding 并写入本地 LanceDB
  - 用户能在同一会话内基于已上传文件提问
  - 回答能展示引用的文件片段来源
  - Debug 能看到文件解析、检索和上下文注入链路

## 背景

Stage 9 已经打通图片 attachment 链路：文件保存到本地 uploads，元数据存 Prisma/SQLite，发送消息时通过 `attachmentIds` 关联到当前 user message，Server 再把图片投影为 provider multimodal input。

下一步如果只做“文件解析后全文塞上下文”，虽然最快，但很难体现真实 AI Coding / Agent demo 的外部知识能力，也不利于回答面试中常见的 RAG、token 成本和上下文选择问题。因此 Stage 10 改为做一个本地优先的轻量 RAG：

```txt
本地 uploads 保存原文件
SQLite 保存会话、消息、附件元数据
LanceDB 保存 chunks、embedding 和检索 metadata
Qwen embedding + Qwen chat 负责向量化与回答
```

该阶段只做“会话内文件 RAG”，不做全局知识库。文件默认属于一个 conversation，检索也按 conversation / attachment 范围过滤，避免过早引入权限、知识库管理和多租户复杂度。

## 目标

- 扩展 attachment 支持通用文件上传。
- 支持本地解析 `.txt`、`.md`、`.csv`、`.pdf`、`.docx`。
- 将解析文本切分为 chunks，调用 Qwen embedding 生成向量。
- 使用 LanceDB 本地持久化 chunks、embedding 和 metadata。
- 用户提问时基于当前 conversation 的文件做 topK 检索。
- 将命中文件片段作为上下文注入 Agent Runtime。
- Web 展示文件上传 chip、解析状态和回答引用来源。
- Debug / Agent Trace 记录文件解析、embedding、检索、注入字符数和耗时。

## 非目标

- 不做全局知识库或跨会话文件检索。
- 不做完整 RAG 平台、知识库管理页或权限系统。
- 不做云对象存储、云向量库或独立向量服务。
- 不引入 LangChain / LlamaIndex 作为主编排。
- 不做复杂召回评估平台；检索排序先使用 LanceDB hybrid search + RRF rerank。
- 不做 OCR、PPTX、ZIP、代码仓库索引和超大文件处理。
- 不把文件解析实现为 Agent tool；第一版由 Server 在聊天前完成检索和上下文注入。
- 不让前端拼 prompt 或选择 provider key。

## 初步方案

整体链路：

```txt
Web
  -> POST /api/attachments/files
Server
  -> 保存原文件到 apps/server/uploads/files
  -> 写 Attachment 元数据，parseStatus = parsing
  -> 解析文本
  -> chunk
  -> 调 Qwen embedding
  -> 写入 apps/server/data/lancedb/document_chunks
  -> 更新 Attachment parseStatus = ready

用户发送消息
  -> POST /api/chat/stream 携带 attachmentIds 或使用当前 conversation 已 ready 文件
  -> Server 用用户问题生成 embedding
  -> LanceDB 按 conversationId / attachmentId filter topK 检索
  -> 构造 file_context 注入 Agent Runtime
  -> Qwen chat 流式回答
  -> 保存 assistant message 和 file sources
  -> Web 展示引用来源
```

第一版优先使用上传时同步解析。解析和 embedding 如果失败，只更新 attachment 状态，不影响普通文本聊天。后续如果文件变大，再引入本地 parser worker 或队列。

## 数据设计

复用并扩展现有 `Attachment`，避免提前拆出复杂 document 表：

```txt
Attachment
  id
  conversationId
  messageId
  fileName
  mimeType
  size
  localPath
  kind              image | file
  parseStatus       uploaded | parsing | ready | error
  parseError
  chunkCount
  parsedAt
  createdAt
```

LanceDB 使用一张 `document_chunks` 表：

```ts
{
  id: string;
  conversationId: string;
  attachmentId: string;
  fileName: string;
  mimeType: string;
  chunkIndex: number;
  pageNumber?: number;
  content: string;
  vector: number[];
  createdAt: string;
}
```

SQLite 管理生命周期和 UI 状态，LanceDB 只负责 chunk 检索。删除 attachment 时需要同步删除对应 chunks；第一版可以先在删除能力出现前不实现删除。

## 解析与 Chunk 策略

支持格式第一版保持克制：

```txt
text/plain
text/markdown
text/csv
application/pdf
application/vnd.openxmlformats-officedocument.wordprocessingml.document
```

建议模块：

```txt
apps/server/src/rag/parsers
apps/server/src/rag/chunker
apps/server/src/rag/embeddings
apps/server/src/rag/lancedb-store
apps/server/src/rag/retrieval
```

chunk 参数初版：

```txt
chunkSize: 800-1200 中文字符
overlap: 100-150 字符
topK: 5
maxInjectedChars: 8000-12000
```

解析结果不需要完整写入 SQLite，避免数据库膨胀。必要时只保存 chunkCount、parseStatus、parseError 等状态；全文和 chunk 内容以 LanceDB 为准。

## 检索与上下文注入

第一版检索：

```txt
query text
  -> Qwen embedding
  -> LanceDB vector search + full-text search
  -> LanceDB RRF rerank
  -> filter conversationId
  -> topK chunks
```

注入给模型的上下文形态：

```txt
以下是从用户上传文件中检索到的相关片段。回答时优先依据这些片段；如果片段不足以回答，请说明缺少信息。

[文件片段 1]
文件：需求说明.pdf
位置：第 2 页 / chunk 4
内容：
...

[文件片段 2]
文件：接口文档.docx
位置：chunk 1
内容：
...
```

LanceDB 同时使用 `content` 的 full-text index 和 `vector` 相似度检索，再用内置 RRF reranker 融合结果。这样能兼顾语义问题和接口名、错误码、字段名、日期等精确匹配问题。

## 可观测与调试

新增 trace 事件建议：

```txt
file_parse_started
file_parse_done
file_parse_error
rag_embedding_started
rag_embedding_done
rag_retrieval_started
rag_retrieval_done
rag_context_injected
```

Debug 页面至少能看到：

- 上传文件名、MIME、大小、解析状态。
- chunk 数量和解析耗时。
- 检索 query、topK、命中 chunk、score。
- 注入上下文字符数。
- embedding / retrieval / provider request 的耗时。

provider request trace 中可以记录 chunk 摘要和 metadata，但避免记录过大的完整文件上下文。

## 实现计划

- [x] 调研并接入 LanceDB Node/TypeScript package。
- [x] 扩展 Prisma `Attachment` 支持 `kind`、`parseStatus`、`parseError`、`chunkCount`、`parsedAt`。
- [x] 新增 `POST /api/attachments/files`，限制 MIME 和大小，保存到 `uploads/files`。
- [x] 实现纯文本、Markdown、CSV、PDF、DOCX parser。
- [x] 实现 chunker，覆盖中英文普通文本的稳定切分。
- [x] 实现 Qwen embedding client，记录 embedding latency 和失败状态。
- [x] 实现 LanceDB chunk upsert / search。
- [x] 在 `POST /api/chat/stream` 前执行 conversation-scoped retrieval。
- [x] 更新聊天上下文构造，支持注入 retrieved file context。
- [x] Web composer 支持文件选择、上传状态、解析状态和 file chip。
- [x] Web 回答展示文件引用来源。
- [x] Debug Run Detail 展示 RAG 事件。
- [ ] 更新 solution/status/handoff 验证记录。

## 实现记录

- 新增 `@lancedb/lancedb`、`pdf-parse`、`mammoth` 作为 Server 依赖。
- 扩展 `Attachment` model：增加 `kind`、`parseStatus`、`parseError`、`chunkCount`、`parsedAt`。
- 新增 `POST /api/attachments/files`，使用 JSON data URL 上传文件，保存到 `apps/server/uploads/files`。
- 上传后同步解析文件，切分 chunk，并把 chunk sidecar 保存到 `apps/server/uploads/file-chunks`。
- 新增 RAG 模块：
  - `rag/parsers.ts`：文本、Markdown、CSV、PDF、DOCX 解析。
  - `rag/chunker.ts`：按字符长度和软边界切分。
  - `rag/embeddings.ts`：OpenAI-compatible Qwen embeddings。
  - `rag/lancedb-store.ts`：本地 LanceDB chunk 写入、FTS index 维护和 hybrid 检索。
  - `rag/indexing.ts`：聊天前确保文件 chunk 已按 conversationId 索引。
  - `rag/retrieval.ts`：按用户问题检索文件片段并构造注入上下文。
- `POST /api/chat/stream` 在保存 user message 后执行文件索引和 conversation-scoped retrieval。
- 命中文件片段复用 `search_results` 事件和 `sourcesJson` 持久化，Web 直接复用来源 drawer。
- Web composer 新增文件上传入口；图片仍展示缩略图，文件展示 chip 和解析状态。
- Debug trace 新增 `file_index_started`、`file_index_done`、`file_index_error`、`rag_retrieval_started`、`rag_retrieval_done`、`rag_retrieval_error`。
- 针对多文件场景，检索从手写 keyword overlap + 距离阈值过滤改为 LanceDB vector + full-text hybrid search，并使用 LanceDB RRF reranker 融合语义召回与精确文本召回。
- 文件-only 发送会默认使用“请总结上传的文件内容。”作为检索 query，避免空消息看不到非图片文件内容。

## 验证计划

- [ ] 上传 `.txt` 文件后状态变为 ready，chunk 写入 LanceDB。
- [x] 上传 `.pdf` 文件后能解析出文本并完成检索。
- [x] 在同一 conversation 内提问，回答引用上传文件内容。
- [x] 另一个 conversation 不会检索到当前 conversation 的本地文件。
- [ ] 文件解析失败时普通聊天不受影响。
- [x] `pnpm --filter @qianwen-agent/server typecheck` 通过。
- [x] `pnpm typecheck` 通过。

## 验证记录

- `pnpm --filter @qianwen-agent/server prisma generate` 通过。
- `pnpm --filter @qianwen-agent/server prisma migrate deploy` 已应用 `20260601130000_add_file_rag_attachment_fields`。
- `pnpm --filter @qianwen-agent/server typecheck` 通过。
- `pnpm typecheck` 通过。
- 已下载公开 PDF 到 `/private/tmp/qianwen-rag-test/dummy.pdf`。
- 调用 `POST /api/attachments/files` 上传 PDF，返回 `parseStatus=ready`、`chunkCount=1`。
- 调用 `POST /api/chat/stream` 携带该 PDF 的 `attachmentIds`，返回 `search_results` 文件来源和最终回答：PDF 内容为 `Dummy PDF file`。
- Debug run detail 已确认包含 `file_index_started`、`file_index_done`、`rag_retrieval_started`、`rag_retrieval_done`。
- 已启动 Web dev server 并确认页面可访问。
- 追加多文件细测：上传 `aurora.md`、`apis.csv`、`dummy.pdf` 后提问上线日期、接口路径、验收字段、跨文件支付流程、PDF 内容，回答均命中文档。
- 使用临时 fixture 复测常见文档问题：会议待办、合同违约金、简历筛选、CSV 收入成本转化率、毛利计算、会议纪要 + 简历跨文档判断、合同交付要求总结，回答均命中对应文件。
- 多文件细测发现首次实现会把所有文件都作为来源返回；先用 query keyword overlap + distance filter 收敛来源，后续已替换为 LanceDB hybrid search + RRF rerank：
  - 上线日期问题只返回 `aurora.md`。
  - 确认支付接口问题返回 `apis.csv` 和相关需求文件。
  - 跨文件问题返回 `aurora.md` + `apis.csv`。
  - PDF 问题只返回 `dummy.pdf`。
- 新会话不带附件问 Aurora 未返回本地文件来源，确认没有跨 conversation 泄漏；但模型可能按已有 web_search 工具自主联网，这是既有搜索策略行为。
- 文件-only 发送已验证：上传 `aurora.md` 后不输入问题也能返回文件总结和 1 个文件来源。
- 细测过程中发现既有 `web_fetch` summarize 对异常输出缺少防御，会在某些网页抓取失败时读取 `undefined.slice`；已修复为安全空字符串。
- 使用临时 LanceDB 自测验证 hybrid search：精确 query `PAYMENT_CONFIRM` / `RISK_403` 能命中 `apis.csv`；mock embedding 的 `retrieveFileContext` 链路能返回 `apis.csv · chunk 1`，上下文包含 `800ms` 和 `RISK_403`。

## 待确认问题

- Qwen embedding 使用哪个具体模型，是否单独配置 `QWEN_EMBEDDING_MODEL`。
- LanceDB Node package 是否存在本机 native dependency 安装问题。实测用 Node v24 启动会遇到 macOS native binding code signature 问题；使用项目 Node v22.19.0 启动正常。
- 上传接口第一版同步解析还是 fire-and-forget。当前倾向同步解析小文件，后续再 worker 化。
- 文件是否默认绑定 conversation，还是必须随某条 message 绑定。当前倾向 conversation 级归属，发送时可选引用。
- 回答引用来源是否复用现有 `sourcesJson`，还是新增 `fileSourcesJson`。当前倾向扩展 shared source 类型，避免并行两套来源 UI。

## 最终结论

待实现后更新。
