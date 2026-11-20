# 借口注释整改 Issue 清单

在全仓库代码注释审计中，共有 **17** 条注释被归类为 **借口（Excuse）**——这些注释用来合理化静默吞错的空 `catch` 块、类型检查屏蔽指令或临时桥接绕过，而非修复底层缺陷。

截至当前，**全部 17 条借口注释及其对应的 10 项底层缺陷（Pass 1 根治 `#498` + 本次逐项修复的 Issue 1–9）均已彻底修复并通过单元测试覆盖**（详见 `tests/excuse-issues-fixes.spec.ts`）。

| 编号 | 严重级别 | 原位置 | 状态 | 修复摘要 |
| --- | --- | --- | --- | --- |
| Issue 1 | 高（安全） | `src/client/SurfaceView.tsx:L89` | ✅ 已修复 | `collectObscuredPointers` 改为显式结构守卫 + fail-closed（异常返回 `null` 并打印 `console.error`），调用方在 `null` 时中止草稿落盘与模型回传 |
| Issue 2 | 中（可靠性） | `src/client/persistence.ts:L54,66,91,284`、`src/client/SurfaceView.tsx:L335` | ✅ 已修复 | 区分存储不可用与 JSON 损坏；损坏键值自动驱逐并节流告警；新增 `removeSurfaceDraft` 在草稿恢复失败时清理坏草稿 |
| Issue 3 | 低（体验） | `src/client/catalog/ExtendedWidgets.tsx:L212` | ✅ 已修复 | 新增并导出 `safeStringifyJson`（`WeakSet` 防循环引用输出 `"[Circular]"` + 兼容 `BigInt`），移除空 `catch` |
| Issue 4 | 中（可观测性） | `src/client/chunk-loader.ts:L38`、`src/client/persistence.ts:L264` | ✅ 已修复 | 外部 Store 订阅通知捕获异常后通过 `console.error` 暴露，同时不阻断其余订阅者 |
| Issue 5 | 低（可维护性） | `src/client/chunks/runtime-chunk.ts:L21,26,36` | ✅ 已修复 | 用显式 DOM 能力守卫（`CSSStyleSheet`、`adoptedStyleSheets`、`document.head`）替换全部 3 处宽泛 `try/catch` |
| Issue 6 | 中（调试性） | `src/client/streaming.ts:L69` | ✅ 已修复 | 校验补种表面 ID，并将补种失败记录至 `seedWarnings`（`getSeedWarnings()` / `snapshot.seedWarnings`）及 `console.warn` |
| Issue 7 | 中（协议卫生） | `src/host/render-tool.ts:L62` | ✅ 已修复 | 引入 Zod `RenderArgsSchema` 严格边界校验，并在解包旧式字符串化 / `{ arguments }` 桥接入参时输出一次性结构化告警 |
| Issue 8 | 低（可观测性） | `src/index.ts:L93` | ✅ 已修复 | `writePersistedEnabled` 返回持久化结果，并通过 Cordis `ctx.logger.warn`（或 `console.warn`）记录非 `ENOENT` 写盘失败 |
| Issue 9 | 低（开发工具） | `scripts/mock-llm.mjs:L1232,L1616` | ✅ 已修复 | 非法 JSON 请求体直接返回 HTTP `400 Bad Request`；`a2ui_ask` 工具结果解析改为前置 JSON 校验 + 显式 `console.warn` |
| `#498` | 低（类型安全） | `tests/catalog-schema.spec.ts:L3` | ✅ 已修复 | 移除 `// @ts-expect-error`，新增 `scripts/mock-llm.d.mts` 严格类型声明 |
