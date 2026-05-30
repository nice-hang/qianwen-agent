# Web UI 千问风格优化

## 状态

Implemented

## 对应 Roadmap

- Stage: Stage 3.5
- Step: Web UI 千问风格优化
- 相关验收项:
  - 主聊天体验接近 `https://www.qianwen.com/` 国内版千问风格
  - UI 只展示当前真实可用能力
  - Desktop 和移动端 viewport 截图无明显布局错位
  - 关键状态截图可用于后续视觉回归

## 背景

Stage 1-3 已经打通文本聊天、流式输出、Run Trace 和深度思考。继续进入联网搜索前，先把 Web 主聊天体验从当前工程验证界面优化成更接近真实产品的聊天应用。

参考对象使用国内版千问 Web：`https://www.qianwen.com/`。由于登录态界面、动态内容和字体渲染会变化，本阶段不追求全页 1px 像素一致，而是用截图作为高保真视觉参考和后续回归基线。

## 目标

- 用用户本机登录态采集国内版千问参考截图，不接触账号密码。
- 采集本地 Web 当前状态截图，建立改造前基线。
- 覆盖空会话、输入聚焦、普通回答、思考模式、思考流式中、答案流式中、完成态、移动端等关键状态。
- 隐藏当前尚未实现的能力入口。
- 隐藏开发向配置项；主界面只保留产品化模式选择。
- 优化聊天首页、会话侧栏、消息气泡、composer、思考内容展示。
- 保留 Debug 能力，但弱化为开发入口，不干扰主聊天体验。
- 用 Playwright 截图验证 desktop/mobile 关键状态。

## 非目标

- 不实现联网搜索、图片理解、记忆、文件上传或插件能力。
- 不展示未实现功能的按钮、灰态入口或占位文案。
- 不直接复制千问官方 logo、商标图形、图片资源或专有文案。
- 不做全页严格像素 diff 作为唯一验收标准。
- 不重构聊天状态管理、Server API 或 Agent Runtime。

## 初步技术方案

```txt
国内版千问登录态截图
  -> 状态/区域视觉清单
  -> 本地 Web 同状态截图
  -> CSS + 少量 JSX 结构调整
  -> Playwright desktop/mobile 截图验证
```

优先保持现有 React 状态和 shared API 不变，只调整 Web 组件结构和样式。未实现能力从 UI 中隐藏，不做 disabled 状态。

## 核心截图状态

- 空会话首屏
- 输入框聚焦并有草稿
- Fast 模式完成态
- Deep 模式开启态
- 思考内容流式中
- 答案流式中
- 完成态包含 Thinking 和 Answer
- 移动端空会话
- 移动端完成态

## 截图比对策略

| 比对 | 用途 | 结论 |
| --- | --- | --- |
| 千问参考截图 vs 本地截图 | 判断视觉方向、布局、密度、组件质感 | 人工区域级对齐，不做严格像素阈值 |
| 本地改造前 vs 改造后 | 确认改造范围和主体验变化 | 保留截图记录 |
| 本地后续变更 vs 本地基线 | 防止回归 | 可用 Playwright screenshot diff |

## 实现计划

- [x] 使用 Chrome 登录态打开并采集 `https://www.qianwen.com/` 参考截图。
- [x] 启动本地 server/web，采集当前 Web 基线截图。
- [x] 整理视觉差异清单和隐藏项清单。
- [x] 调整 Web 主布局、侧栏、composer、消息气泡、思考块和空状态。
- [x] 隐藏未实现能力入口，弱化 Debug 入口。
- [x] 采集 desktop/mobile 关键状态截图。
- [x] 运行 typecheck。
- [x] 更新 roadmap/status/handoff 和本 solution 的验证记录。

## 实现记录

- Web 主界面改为浅色侧栏和中央聊天区，贴近国内版千问的布局密度。
- 侧栏保留品牌、`新建对话`、最近对话列表；移除未实现搜索入口。
- Debug 入口弱化到侧栏底部，不再作为主视图切换按钮组。
- 聊天顶部改为 `Qwen3.6 - 千问` 模型选择样式和轻量状态展示。
- 消息区改为用户浅蓝气泡、assistant 无卡片正文。
- Composer 改为底部居中大圆角输入框，保留已实现的快速/思考模式切换。
- 前端和 Server 不再传递 `thinkingBudget`；Qwen provider 在思考模式下使用内部默认预算 `500`，避免把工程调试参数暴露给上层。
- 全局 CSS 拆分为入口基础样式和组件样式：App / ChatView / DebugView 各自维护样式边界。
- 页面外层固定在 viewport 内，只允许消息区和侧栏列表在各自容器内滚动，避免内容滚动时带动侧栏。
- 移动端隐藏会话列表，避免未实现抽屉前横向列表撑宽页面。

## 关键文件

- `apps/web/src/App.tsx`
- `apps/web/src/App.css`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/ChatView.css`
- `apps/web/src/components/DebugView.css`
- `apps/web/src/styles.css`

## 验证方式

- [x] `pnpm typecheck`
- [x] Playwright desktop 截图
- [x] Playwright mobile 截图
- [x] 手动检查未实现能力入口是否隐藏

## 验证记录

- `/Users/bytedance/.nvm/versions/node/v22.19.0/bin/pnpm --filter @qianwen-agent/web typecheck` 通过。
- `/Users/bytedance/.nvm/versions/node/v22.19.0/bin/pnpm typecheck` 通过。
- 已用用户本机 Chrome 登录态采集国内版千问参考截图：
  - `/private/tmp/qianwen-agent-ui/reference-qianwen-desktop.png`
- 已采集本地关键状态截图：
  - `/private/tmp/qianwen-agent-ui/local-before-desktop.png`
  - `/private/tmp/qianwen-agent-ui/local-final-desktop.png`
  - `/private/tmp/qianwen-agent-ui/local-final-mobile.png`
  - `/private/tmp/qianwen-agent-ui/local-final-empty-desktop.png`
  - `/private/tmp/qianwen-agent-ui/local-final-deep-compose.png`
- 发现并修复移动端会话列表撑宽页面的问题；修复后 `bodyWidth=390`，首个消息气泡位于 viewport 内。
- 已隐藏主界面的 thinking budget 输入框，并把默认预算下沉到 Qwen provider；选择思考模式时上层只传 `mode: "deep"`。
- 已验证新对话空状态输入框位于首屏中下部，外层 `body` 和 `.app-shell` 不产生页面级滚动。

## 待确认问题

- 暂无。

## 最终结论

Stage 3.5 已完成。当前 Web UI 已从工程验证界面调整为接近国内版千问的聊天主体验，且未展示联网搜索、图片理解、记忆等未实现能力入口。后续 Stage 4 可在当前 composer 风格中补充搜索入口和来源展示。

## 后续演进

- Stage 4 联网搜索实现后，再按千问风格补充搜索入口和来源展示。
- Stage 5 图片理解实现后，再补充图片上传入口和缩略图展示。
