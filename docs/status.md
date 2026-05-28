# Status

本文记录当前实现状态。每完成一个阶段或一个可独立验证的功能切片后更新。

## 当前阶段

Stage 0: Monorepo 骨架与共享协议

## 已完成

- [x] 讨论并确定 MVP 产品范围
- [x] 讨论并确定 Agent / Server / UI / Observability 宏观方案
- [x] 编写 `README.md`
- [x] 编写 `AGENTS.md`
- [x] 编写 `docs/roadmap.md`

## 进行中

- [ ] 等待开始 Stage 0 实现

## 未开始

- [ ] Monorepo 初始化
- [ ] Web app
- [ ] Mobile app
- [ ] Server app
- [ ] Shared package
- [ ] Agent Runtime package
- [ ] Observability package
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

1. 初始化 monorepo。
2. 创建 `apps/web`、`apps/server`、`apps/mobile`、`packages/shared`、`packages/agent-runtime`、`packages/observability`。
3. 在 `apps/server/src/adapters` 中建立 Agent/Observability 适配器目录。
4. 定义 shared 类型和 stream event 协议。
5. 启动 Web 和 Server 的最小健康检查。
