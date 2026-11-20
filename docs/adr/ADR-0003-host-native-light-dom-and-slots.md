# ADR-0003：宿主原生 Light DOM、官方 DSH 插槽、可逆样式生命周期与防御性原语适配

- **状态**：已采纳（Accepted）
- **涉及范围**：`src/client/index.ts`、`src/client/ActionUserChip.tsx`、`src/client/ToolView.tsx`、`src/client/TurnTailView.tsx`、`src/client/DockView.tsx`、`src/client/AskToolView.tsx`、`src/client/turn-surfaces.ts`、`src/client/style-lifecycle.ts`、`src/client/ui/primitives.tsx`、`src/client/i18n.ts`、`src/client/catalog/index.ts`、`src/client/catalog/Catalog.module.css`、`src/dsh-platform.d.ts`

## 背景

DSH 插件直接运行在宿主对话时间线、主题引擎与插件生命周期管理器之中。若使用 Shadow DOM 或 `iframe`，会破坏 `--dsw-*` 主题变量继承、键盘焦点与无障碍语义；若依赖未公开 DOM 选择器，会在 DSH 0.x 迭代中失效；若插件禁用后残留 `<style>` 标签，则会在不刷新窗口的热启停切换中污染宿主页面。

## 决策

1. **100% 接入 DSH 官方扩展缝（由 `scripts/check-host-api.mjs` 校验）**：
   - `ctx.uiConversation.events.register`：将已结算的 `a2ui_render` 结果投影为隐藏 Chat Node（`kind: 'a2ui-surface'`），与 `@deepseek-ai/dsh-client-ui-plan` 架构一致，天然支持刷新重放、对话分叉与跨轮次 `update=true` 延续。
   - `ctx.uiConversation.userText.register` + `conversation.user.text.node`：将 `[a2ui-action]` 协议消息美化为可展开回执胶囊。由于 `@deepseek-ai/dsh-client-ui-conversation` 的 `UserText` 会把子节点包裹在 `<HoverCardGroup as="span">` 内，`ActionUserChip` 严格只使用短语/行内合法标签（`<span>`、`<button>`），杜绝 React `<div>`/`<pre>` 嵌套在 `<span>` 内的警告。
   - `tool.call.toolview`、`conversation.chat.turnTail`、`conversation.input.dock`、`conversation.input.left`：按 `placement` 精准交接渲染权——`answer` 流式期在 `toolview` 预览、结算后无缝交接给 `turnTail`（零双重挂载）；`dock` 结算后固定于输入框上方工作台；`inline` 留在工具折叠行内；`a2ui_ask` 在流式与等待态自动弹驻 `conversation.input.dock`，即使 `stepGrouping: "collapsed"` 折叠了过程组，用户依然可以直接交互。
2. **$O(T)$ 轮次隔离重放与结构化引用记忆**：
   - `resolveTurnTailBatch` 仅重放目标 `visibleSurfaceIds` 对应的历史消息，避免 $O(T^2)$ 隐藏 `SurfaceModel` 累积，并按结构签名缓存批对象引用，确保后续轮次文本流式输出对已结算历史卡片触发 0 次重渲染。
   - `isChatViewActive` 对齐 `@deepseek-ai/dsh-client-ui-chat` 的 `chatViewDefinition.isActive`：当会话为空白或仅含 `command` 节点时 `ChatView` 尚未挂载，因此空白会话下的 `/a2ui` 命令反馈通过临时 Notice/Toast 呈现。
3. **原生 Light DOM 组件目录与 `<a2ui-react-*>` 样式穿透**：
   - `src/client/catalog/index.ts` 同时注册 `DSH_CATALOG_ID` 与 `BASIC_CATALOG_ID` 的 Light DOM React 实现，确保客户端包内零 Lit WebComponent 残留。
   - 由于 `@a2ui/react` 会给子组件包裹 `<a2ui-react-* style="display: contents">` 宿主标签，`Catalog.module.css` 中针对默认 `align="stretch"` 的行内控件居中规则以及同构 KPI 条 `>*>.statCard` 网格规则刻意穿透该包装层。
4. **可逆样式表生命周期与无头测试约束**：
   - `src/client/style-lifecycle.ts` 与 `build/preset.ts` 的 `cssInlinePlugin` 协同管理所有 `<style data-plugin>` 与 `#a2ui-structural-styles` 标签，Cordis 插件销毁时彻底摘除，热重启用时无刷新完整恢复。
   - 在 Node 单元测试中验证可逆样式生命周期时，需先加载懒加载运行时模块再注入最小化 DOM 桩，避免 `react-aria` 顶层浏览器焦点补丁在 Node 假 DOM 上提前激活。
5. **防御性宿主原语适配与响应式多语言**：
   - 所有 `@deepseek-ai/dsh-client-ui-primitives` 引入统一收口在 `src/client/ui/primitives.tsx`，对每个原语提供 `--dsw-*` 令牌降级实现，确保 DSH 0.x 某原语改名或移除时不致白屏。
   - `src/client/i18n.ts` 监听 DSH `LocaleRuntime` 同步到 `document.documentElement.lang` 的语言属性（`"zh-CN"` / `"en"`）实时切换文案；无头 CI 环境未显式指定时确定性默认回落 `'zh'`。

## 影响与约束

- 每次改动涉及宿主原语或插槽后必须通过 `npm run check:host-api` 漂移校验。
- 插件禁用/重启用往返行为受 `tests/oss-readiness.spec.ts` 回归测试保护。
