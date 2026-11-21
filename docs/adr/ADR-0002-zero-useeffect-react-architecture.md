# ADR-0002：零 `useEffect` React 架构与 `dom-hooks.ts` 命令式边界

- **状态**：已采纳（Accepted）
- **涉及范围**：`biome.json`、`src/client/dom-hooks.ts`、`src/client/SurfaceView.tsx`、`src/client/TierControl.tsx`、`src/client/catalog/EChartsWidget.tsx`、`src/client/catalog/ExtendedWidgets.tsx`、`src/client/catalog/LayoutWidgets.tsx`、`src/client/persistence.ts`

## 背景

在 React 业务组件中滥用 `useEffect` / `useLayoutEffect` 会引入二次渲染闪烁、StrictMode 双触发副作用、订阅泄漏与 SSR 水合不一致问题。在包含大量历史 A2UI 卡片的对话时间线里，冗余副作用还会在流式吐字阶段造成级联重渲染和滚动条抖动。

## 决策

1. **所有 `.tsx` 业务与组件文件禁止 `useEffect` / `useLayoutEffect`**：
   - 通过 `biome.json` 中的 `noRestrictedImports` 静态报错与 `tests/react-best-practices.spec.ts` 全量源码扫描双重强制约束。
   - 派生状态（例如卡片切换为 `readOnly` 时自动关闭 `Modal` 或 `Mermaid` 全屏、由 `localStorage` 与对话流 `/a2ui` 命令水位线推导 `A2uiTierControl` 开关状态）一律在 render 期间直接计算。
   - 外部状态订阅（`chunk-loader.ts`、`theme.ts`、`i18n.ts`、`persistence.ts`、`SurfaceSessionStore`）统一走 `useSyncExternalStore`，并对 `MutationObserver` 做全局多订阅者复用去重。
2. **仅将真正的浏览器命令式 API 隔离到 `src/client/dom-hooks.ts`**：
   - `useAutoDismissTimer` / `useTransientFlag` / `useTransientKey`：降级 Toast 与复制/导出瞬态反馈定时器，在 render 阶段同步最新回调 ref 并在卸载时自动 `clearTimeout`，防止卸载后 `setState` 或重置倒计时。
   - `useEscapeKey` / `usePortalPopover`：管理降级 `Modal`/`Lightbox` 及 `Select`/`MultiSelect`/`TreeSelect` Portal 弹层的视口边界重算、`scroll`/`resize` 追踪、外部点击关闭、`Escape` 关闭与焦点恢复。
   - `useEChartsMount`：管理 ECharts `<canvas>` 生命周期、`ResizeObserver`（跳过隐藏/零宽高容器防零尺寸崩塌）、Option 同步与 2x PNG 导出（`try/finally` 清理临时锚点）。
   - `useMermaidViewportDom`：负责绘制前光标锚点滚动补偿（`useLayoutEffect`）、`ResizeObserver`、非 passive 滚轮监听（`{ passive: false }`，用于拦截 `Ctrl+滚轮` 浏览器缩放）、全屏 `Escape` 监听以及 `blur`/卸载/退出全屏时清理拖拽事件。
   - `useStreamingMinHeight`：在 `streaming === true` 期间锁定容器历史最高 `min-height`，防止渐进式 Express 编译帧引起的高度塌陷和聊天视口回跳；流结束后立即释放。
3. **首帧同步的 `SurfaceSessionStore` 与上游 SSR 防护**：
   - `SurfaceSessionStore` 作为组件实例级外部 Store 封装 `MessageProcessor`，确保首帧同步编译表面并恢复本地草稿，且对 React StrictMode 双渲染保持幂等。
   - 上游 `@a2ui/react` 的 `<A2uiSurface>` 在内部 `useSyncExternalStore` 中遗漏了 `getServerSnapshot`，因此 `SurfaceGroupView` 在 SSR 阶段仅渲染安全容器壳，于客户端首帧再水合 `<A2uiSurface>`。
4. **禁止在会话挂载时自动派发 `/a2ui` 命令**：
   - `A2uiTierControl` 绝对不能在挂载时自动调用 `session.command('/a2ui ...')`，因为 DSH 会为每次命令调用插入一条可见命令日志行，且 Host 侧已在 `~/.dsh/dsh-genui-a2ui-state.json` 持久化 `defaultEnabled`。仅在用户主动点击切换按钮时才派发命令。
5. **`EChartsWidget` 按标量与数据字段细粒度 Memo**：
   - `EChartsWidget.tsx` 中的 `useMemo` 显式依赖各个原始字段而非外层 `props` 对象，避免父组件重分配对象导致图表无意义重建和动画重置。

## 影响与约束

- 首帧渲染与流式输出阶段无 Effect 驱动闪烁。
- 后续若新增 Canvas、WebGL、IntersectionObserver 等浏览器命令式 API，必须封装在 `src/client/dom-hooks.ts` 中，禁止在 `.tsx` 中直接引入 Effect。
