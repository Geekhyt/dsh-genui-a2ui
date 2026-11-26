# ADR-0009: 六分片流式编译器隔离、去 React Aria 化、Mermaid 死代码裁剪与单组件错误隔离

- **状态**: 已采纳
- **日期**: 2026-11-26
- **关联**: [ADR-0001](./ADR-0001-four-chunk-bundle-and-private-zod.md)、[ADR-0005](./ADR-0005-p0-skill-compaction-and-express-lowering.md)、[ADR-0008](./ADR-0008-formal-verification-and-invariants.md)

## 背景

在全量支持 64 个 A2UI 1.0 组件与 26 种 ECharts 图表后，客户端运行与流式编译路径上存在 6 类零争议的性能与稳定性问题：

1. **历史静态会话白背流式编译器**：`lib/client.runtime.js` 同时打包了仅实时流式预览期才需要的 ANTLR4 / `@a2ui/agent` 编译器，导致打开历史会话或静态落盘卡片时被迫下载与解析编译器；且浏览器端打包了仅供服务端 LLM 使用的 Zod `.describe(...)` 长文案。
2. **`react-aria-components` 极低投入产出比**：全仓库仅在 `Progress`、`Slider`、`ChoicePicker` 三个基础控件中使用了 `react-aria-components`，却向运行时引入 ~260 kB 代码与顶层焦点补丁。
3. **Mermaid 打包了大量白名单禁用死代码**：`mermaid-safe.ts` 运行时已禁止 16 种图种且未启用 `katex`，但构建产物 `lib/client.mermaid.js` 仍全量打包这些永远无法触达的模块（~800 kB）。
4. **流式渲染热路径重复计算**：token 流式到达期间每帧重跑 1,438 行 `preprocessExpressProgram` 与全量消息校验，且缺少 `useDeferredValue` 帧节流。
5. **单组件渲染异常导致整张 Surface 白屏**：此前仅在 Surface 根部有 `ErrorBoundary`，任一子组件因边界数据抛错会拖垮同 Surface 其余正常兄弟组件。
6. **常驻系统提示词冗余**：每轮对话常驻携带的 `A2UI_SYSTEM_GUIDANCE` 存在可压缩的重复叙述，直接增加 token 消耗与首字延迟。

## 决策

仅实施上述 6 项零副作用、无双份加载权衡的确定性修复（有意不拆分存在双份加载代价的 `echarts-extra` 或增加异步跳变的表格/扩展分片）：

1. **拆出独立 `lib/client.streaming.js` + AST 剥离 Zod `.describe()` 文案**
   - 保持 6 个自包含构建产物（`lib/index.js`、`lib/client.js`、`lib/client.runtime.js`、`lib/client.streaming.js`、`lib/client.echarts.js`、`lib/client.mermaid.js`），全部纳入 `.bundle-budget.json` 原始/Gzip 棘轮与 `package.json` `files`。
   - `useLazyStreamingExpress` 仅在流式预览期间按需 `require.async('./client.streaming.js')`，配合 `useDeferredValue(ui)` 防止高频 token 阻塞主线程。
   - `build/preset.ts` 通过 TypeScript AST 剥离 `src/shared/catalog-schema.ts` 中的非引用 `.describe()` 文案，保留 `REF:#/$defs/<Name>` 标记与 `redos-detector` 安全防护。
2. **彻底移除 `react-aria-components` 并固化第 39 条静态不变量**
   - 用零依赖原生可访问控件替代：`role="progressbar"`、原生 `<input type="range">` + `<output>`、`role="radiogroup"` + roving `tabIndex` + `Arrow`/`Home`/`End` 键盘导航。
   - 在 `scripts/check-invariants.mjs` 新增规则 `no-react-aria-components` 并在 `build/preset.ts` 禁止其进入浏览器产物。
3. **Mermaid 编译期剔除 16 个白名单禁用图种与 `katex`**
   - 仅 stub `mermaid-safe.ts` 明确禁止的 16 个图种模块及未用 `katex`，保留 `mindmap` 所需的 `cose-bilkent` / `cytoscape`。
4. **流式前缀预处理缓存与 `O(Δ)` 增量校验**
   - `StreamingExpressSession` 缓存最后一个完整换行前缀的预处理结果（同一未闭合行增量到达时直接复用）并仅对新增消息段执行增量校验。
5. **组件级 `ErrorBoundary` 隔离**
   - `defineComponent` 统一包裹响应 `SurfaceResetKeyContext` 的 `<ErrorBoundary>`，单个组件异常仅降级自身，不影响同 Surface 其余组件。
6. **精简常驻 `A2UI_SYSTEM_GUIDANCE`**
   - 压缩冗余叙述，保留完整快路径语法契约与分域 Skill 导航，确保 `eval:check` 64/64 组件与 `100%` 路由/最终编译率不降级。
