# React Native 移动端

## 状态

In Progress

## 对应 Roadmap

- Stage: Stage 8
- Step: React Native Client
- 相关验收项:
  - 移动端能多轮聊天
  - 移动端能流式展示回答
  - 移动端能展示深度思考
  - 移动端能展示搜索来源
  - Android 能本地启动并完成一轮聊天
  - iOS 能本地启动并完成一轮聊天

## 背景

Web 侧已经完成多轮聊天、深度思考、Markdown 渲染、联网搜索来源和 Debug Trace。下一步先把核心聊天能力适配到 `apps/mobile`，验证 shared API client 和 shared 协议在 React Native 环境下可用。

这一步优先做移动端主聊天闭环，并把 Android / iOS 两端本地运行链路打通。不做图片上传；图片理解顺延到 Stage 9。

用户本机预计已经具备 Android 和 iOS 开发环境。实现时优先检测并复用现有环境，例如 Android Studio / Android SDK / emulator、Xcode / iOS Simulator、CocoaPods 或 Expo 相关工具；不要默认重装或大规模改造本机工具链。只有发现具体缺口时，再补最小依赖或给出明确缺失项。

## 视觉参考

参考 `screenshot/mobile` 下的国内版千问移动端截图还原主体验：

- `qianwen-mobile-home-suggestions.jpg`：空会话首页、建议问题、底部 composer。
- `qianwen-mobile-sidebar-history.jpg`：侧边栏会话列表与遮罩层。
- `qianwen-mobile-thinking-analyzing.jpg`：用户消息后，思考模式的分析中状态。
- `qianwen-mobile-searching-sources.jpg`：搜索中卡片、参考资料入口和进行中状态。

实现时只参考聊天主体布局、气泡、composer、侧边栏、思考/搜索状态。不参考顶部系统状态栏、顶部 header 的完整交互，也不实现截图里当前项目尚未支持的功能入口，例如空间、智能体、挑礼物、AI 生图、拍照、语音输入、通知、扫码等。

## 目标

- 实现基础 RN Chat UI。
- 确保 Android 本地能启动。
- 确保 iOS 本地能启动。
- 接入 shared API client。
- 适配 `POST /api/chat/stream` 的流式读取。
- 展示会话列表/抽屉或等价导航。
- 展示普通回答、深度思考和搜索来源入口。
- 保持移动端 UI 只暴露当前真实可用能力。
- 参考移动端截图还原主聊天体验，但隐藏未实现功能入口。

## 非目标

- 不做图片选择和上传。
- 不做 Debug Trace 移动端视图。
- 不实现顶部 header 的完整产品交互。
- 不实现截图中的空间、智能体、挑礼物、AI 生图、拍照、语音输入、通知、扫码等入口。
- 不追求与 Web 完全复用 UI 组件。
- 不实现复杂 Markdown 全量渲染，第一版先覆盖文本、列表、代码和链接等高频内容。

## 初步方案

```txt
apps/mobile
  -> shared api client
  -> conversations/messages APIs
  -> POST stream
  -> local reducer 合并 AgentEvent
  -> RN Chat UI
```

优先验证 RN 的 fetch streaming 能力。如果当前运行环境不支持标准 `ReadableStream`，再单独引入 RN 侧 transport adapter，不反向污染 Web/server 协议。

## 模块拆分

移动端当前按真实职责做轻量拆分：

```txt
apps/mobile/App.tsx
  会话列表、消息列表、发送状态、stream event 合并和页面骨架

apps/mobile/src/components/
  Composer / HomeSuggestions / MessageBubble / ModeBar / Sidebar / SourcesSheet

apps/mobile/src/markdown/MarkdownText.tsx
  react-native-markdown-display 封装、链接打开、代码块横向滚动和 Markdown 样式

apps/mobile/src/styles.ts
  当前 RN 页面共享样式

apps/mobile/src/utils/chat.ts
  乐观消息、source 去重、错误文案等无 UI 小函数
```

暂不继续拆 API client hook、message reducer 或复杂状态层；当前只有一个页面，`App.tsx` 保留 stream 和状态编排更直接。等移动端出现第二个页面或消息状态逻辑继续膨胀，再抽 `useChatSession` / reducer。

## Markdown 渲染方案取舍

RN 初版曾使用 `apps/mobile/App.tsx` 内的轻量行级 Markdown 渲染，仅覆盖 heading、段落、列表、代码块、粗体、行内代码和链接样式。现在已执行短期方案，接入 `react-native-markdown-display` 替换手写 parser，同时保留 Expo Go 验证路径。后续不要继续手写表格、task list、嵌套列表、GFM 或复杂流式未闭合语法，避免把 Markdown parser 变成业务代码。

候选库调研：

- `react-native-markdown-display`
  - 优点：纯 JS / native component 渲染，接入成本低，适合当前 Expo Go 路径；支持自定义 style、rules、link handler，并暴露 `MarkdownIt`，可以关闭图片等不需要的能力。
  - 缺点：项目 README 已提示不再积极维护，并推荐迁移到 `react-native-enriched-markdown`；主要基于 CommonMark/markdown-it，GFM 和 AI 流式体验需要额外验证或插件补齐。
  - 适合：短期替换当前手写 parser，保持 Expo Go 验证链路不变。
- `react-native-enriched-markdown`
  - 优点：Software Mansion 维护，面向 RN 原生 Markdown；支持 CommonMark、GFM、表格、task list、RTL、文本选择、复制、accessibility，并有 streaming 方向。
  - 缺点：包含 native code，要求 React Native New Architecture；Expo app 需要 `expo prebuild`，不能继续依赖 Expo Go。当前仓库还没有切到 dev client / prebuild 路径，直接引入会扩大 Stage 8 验证面。
  - 适合：后续确认要做高质量移动端 Markdown 和流式体验时，作为正式方案，但应与 Expo dev client / native build 切换一起做。
- `react-native-streamdown`
  - 优点：面向 AI token streaming 的 Markdown 渲染，目标更贴近 Chatbox 流式回答。
  - 缺点：生态还很新，依赖 enriched markdown / native 能力，当前不适合作为 Stage 8 最小闭环依赖。
  - 适合：完成 native build 路径后再评估，优先看是否能显著改善未闭合 Markdown 的流式观感。
- `react-native-marked`
  - 优点：Markdown 能力相对完整，包含 marked、表格、svg 等能力。
  - 缺点：依赖面更重，包含 `react-native-svg`、table 相关依赖；对当前仅聊天文本渲染来说偏重，Expo Go 兼容和样式可控性需要额外验证。
  - 适合：暂不优先。
- `markdown -> html -> react-native-render-html`
  - 优点：HTML 渲染库成熟，适合服务端或内容系统已经产出 HTML 的场景。
  - 缺点：本项目消息存储和 Web 渲染都以 Markdown 为一等格式；RN 侧先转 HTML 会增加 sanitizer、HTML 样式和安全边界，不适合 MVP。
  - 适合：暂不采用。

推荐路径：

1. Stage 8 当前已接入 `react-native-markdown-display`，去掉自研 parser，保持 Expo Go 链路不变。
2. 本阶段验收 heading/list/code/link/table 的基础渲染和流式更新性能；不要继续在 RN 业务代码里补 Markdown 解析规则。
3. 如果准备把移动端从 Expo Go 升级到 dev client / prebuild，则直接评估 `react-native-enriched-markdown`，把 GFM、表格、task list、文本选择、流式未闭合语法作为验收项。
4. `react-native-streamdown` 放在 enriched markdown 路径之后评估，不作为第一步依赖。

## 实现计划

- [x] 梳理 `apps/mobile` 当前 Expo / RN 壳子。
- [x] 检测并记录本机 Android 环境现状，优先复用已有 Android Studio / SDK / emulator。
- [x] 检测并记录本机 iOS 环境现状，优先复用已有 Xcode / iOS Simulator / CocoaPods。
- [x] 补齐 Android 启动脚本和本地配置说明。
- [x] 补齐 iOS 启动脚本和本地配置说明。
- [x] 接入 shared API client 或补 RN transport adapter。
- [x] 实现会话列表和当前会话状态。
- [x] 实现 composer 和发送消息。
- [x] 参考截图实现空会话首页、侧边栏、用户消息、思考中、搜索中状态。
- [x] 处理 `answer_delta` / `reasoning_delta` / `tool_call_*` / `search_results` / `done` / `error`。
- [x] 实现基础 Markdown 文本渲染策略。
- [x] 展示深度思考折叠态和搜索来源入口。
- [x] 跑 mobile / shared / 全仓 typecheck。
- [ ] Android 本地启动并完成一轮聊天验证。
- [ ] iOS 本地启动并完成一轮聊天验证。

## 待确认问题

- RN fetch streaming 是否在当前目标运行环境稳定可用。当前移动端优先使用 `expo/fetch`，shared API client 也保留了 `response.body` 缺失时的 text fallback。
- 当前继续走 Expo；为兼容 pnpm workspace，移动端入口改为本包 `index.ts` 调 `registerRootComponent(App)`。
- Android SDK、platform-tools、emulator 和 system-images 存在，但当前没有连接设备，也没有已创建的 AVD；Android 真机/模拟器验证因此暂未完成。
- iOS Xcode 16.0 和 iOS Simulator 可用，已用 iPhone 16 Simulator 跑通 Expo bundle 和页面渲染截图；尚未完成真实发送一轮聊天。
- 移动端 Markdown 已从轻量行级 parser 切到 `react-native-markdown-display`；当前仍需在真机/模拟器上验证表格、代码块横向滚动和流式未闭合 Markdown 的实际观感。
- 搜索来源第一版用 bottom sheet 展示。

## 最终结论

已完成移动端主聊天 UI、shared API client 接入、Expo fetch streaming、SSE-like 事件合并、基础 Markdown、深度思考和搜索来源展示。iOS 已启动到 Expo Go 并完成页面渲染截图；Android 工具链存在但没有 AVD/真机，需创建模拟器或连接设备后继续验证一轮真实聊天。
