# 图片理解

## 状态

In Progress

## 对应 Roadmap

- Stage: Stage 9
- Step: Image Understanding
- 相关验收项:
  - 用户能上传图片
  - 用户能发送图文混合消息
  - 模型能基于图片回答
  - Web 和 RN 历史消息能恢复图片展示

## 背景

Web 和 React Native 基础聊天链路稳定后，下一步需要把 MVP 中的图片理解能力接入到同一条聊天主链路。图片理解不作为 tool 执行，而是作为当前用户消息的 multimodal input 传给千问视觉模型。

MVP 图片文件存本地，Server 负责上传、持久化附件元数据、构造 provider 输入；UI 只负责选择、预览和随消息提交附件 ID。

## 目标

- 建立图片 attachment 数据模型和上传接口。
- Web composer 支持图片选择、缩略图预览和随消息发送。
- React Native 支持图片选择、上传和图文消息发送。
- Agent Runtime / QwenProvider 支持 multimodal provider message projection。
- 历史消息能恢复图片展示。

## 非目标

- 不做生图、视频理解或文件理解。
- 不做公网对象存储和 CDN。
- 不把图片理解实现为 agent tool。
- 不增加前端 provider key 或 prompt 拼接逻辑。
- 不做复杂图片编辑、裁剪或相册管理。

## 初步方案

1. Server 增加 attachments 表，记录所属 conversation/message、文件名、MIME、大小、本地路径和创建时间。
2. Server 增加图片上传接口，限制 MIME 和大小，保存到 `apps/server/uploads/images`。
3. 前端发送消息时携带 `attachmentIds`，Server 保存 user message 后把附件关联到消息。
4. ContextBuilder 构造当前用户消息时，把图片转成千问视觉模型支持的 multimodal content。
5. QwenProvider 对含图消息切换到支持视觉输入的模型或模型参数。
6. Web / RN 历史消息读取 message attachments 并展示缩略图。

## 实现记录

- 新增 Prisma `Attachment` model，并增加 `20260531120000_add_attachments` migration。
- 新增 `POST /api/attachments/images`，使用 JSON data URL 上传图片并保存到 `apps/server/uploads/images`。
- 新增 `GET /api/attachments/:attachmentId/file` 用于 Web / RN 展示历史图片。
- `POST /api/chat/stream` 支持 `attachmentIds`，发送时绑定 attachment 到 user message。
- Server 调 Agent Runtime 前只给当前用户消息注入 `imageDataUrl`，避免历史消息反复携带图片 base64。
- Agent Runtime 支持把 user message 投影为 OpenAI-compatible `text + image_url` multimodal content。
- 含图请求不切模型，继续使用当前 `QWEN_MODEL`，例如 `qwen3.6-flash`。
- 传图不改变用户选择的 fast / deep，也不禁用现有 web_search / web_fetch tools。
- provider request trace 会把图片 data URL 替换为 `[image data url omitted]`。
- Web composer 已接入图片选择、上传、预览、移除、图文发送和历史图片展示。
- RN 已接入 `expo-image-picker` 和 `expo-image-manipulator`，支持图片选择、压缩上传、预览、移除、图文发送和历史图片展示；上传前会转 JPEG，并按 1600 / 1280 / 960 长边逐级压缩，避免大图触发服务端 8MB 限制。

## 验证记录

- `pnpm --filter @qianwen-agent/server prisma generate` 通过。
- `pnpm --filter @qianwen-agent/server prisma migrate deploy` 已将 attachments migration 应用到本地 `dev.db`。
- `pnpm typecheck` 通过。
- `pnpm --filter @qianwen-agent/mobile typecheck` 通过。
- iOS Simulator 已加载 8082 fresh Metro bundle，可看到 RN composer 图片入口；自动点击被 macOS 辅助访问权限拦截，未完成端到端点选相册验证。
- 用 1x1 PNG data URL 调用 `POST /api/attachments/images`，返回 attachment。
- 调用返回的 `/api/attachments/:id/file`，响应 `200 OK` 且 `content-type: image/png`。

## 待确认问题

- 需要用真实 `QWEN_MODEL` 验证 deep mode、tool calling 和 multimodal input 同轮组合的 provider 支持情况。
- RN 图片选择上传还需在 iOS Simulator / 真机或 Android 设备上做一轮实际操作验证。
