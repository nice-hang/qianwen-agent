# Status

本文记录当前实现状态。每完成一个阶段或一个可独立验证的功能切片后更新。

## 当前阶段

Stage 1: 最小聊天闭环

## 已完成

- [x] 讨论并确定 MVP 产品范围
- [x] 讨论并确定 Agent / Server / UI / Observability 宏观方案
- [x] 编写 `README.md`
- [x] 编写 `AGENTS.md`
- [x] 编写 `docs/roadmap.md`
- [x] 完成 Stage 0 monorepo workspace 初始化
- [x] 创建 `apps/web`、`apps/mobile`、`apps/server`
- [x] 创建 `packages/shared`、`packages/agent-runtime`、`packages/observability`
- [x] 定义基础 shared 类型、AgentEvent、SSE-like parser 和 API client
- [x] Server 实现 `/health` 并验证能 import agent-runtime / observability
- [x] Web 最小页面能启动并引用 shared 类型

## 进行中

- [ ] 准备开始 Stage 1 最小聊天闭环

## 未开始

- [ ] 最小聊天闭环
- [ ] Run trace
- [ ] 深度思考
- [ ] 联网搜索
- [ ] 图片理解
- [ ] 轻量记忆

## 已知风险

- RN 的 fetch streaming 兼容性需要实际验证。
- 千问 provider 的 `reasoning_content`、`enable_search`、usage 返回格式需要在真实 API 调用中校准。
- 本地图片上传转 base64 data URL 需要控制大小，避免超过 provider 限制。

## 下一步

1. 接入 Prisma + SQLite。
2. 建立 conversations/messages 基础表。
3. 实现 `POST /api/chat/stream` 的最小文本链路。
4. 实现 QwenProvider 普通文本调用。
5. Web 渲染流式回答和历史消息。
