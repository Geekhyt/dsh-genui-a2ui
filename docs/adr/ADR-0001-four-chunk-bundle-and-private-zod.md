# ADR-0001：四分包按需加载隔离与私有 Zod v3 打包策略

- **状态**：已采纳（Accepted）
- **涉及范围**：`build/preset.ts`、`build/web-platform.ts`、`src/client/chunk-loader.ts`、`src/client/LazySurfaceGroupView.tsx`、`src/client/theme.ts`、`src/shared/wire-types.ts`、`src/shared/i18n.ts`

## 背景

DeepSeek Harness（DSH）在宿主壳冷启动时会直接加载插件浏览器入口 `lib/client.js`。如果把 `@a2ui/*`、`echarts` 或 `mermaid` 直接打进 `lib/client.js`，冷启动体积会膨胀到数 MB。

同时，DSH 0.2.x 通过冻结的 `staticModules` 模块表（`window.__ModuleLoader__`）向插件共享平台依赖，但宿主内置的是 **Zod v4**，而 `@a2ui/web_core@0.15.0` 强依赖 **Zod v3**（`^3.25.76`）。此外，DSH 官方 `require.async("./client.<name>.js")` 动态分包协议要求每个分包完全自包含，不能出现分包之间的同步相对路径 `require("./client.*.js")` 依赖边。

## 决策

1. **四分包按需加载架构**：
   - `lib/client.js`（冷启动壳，硬门禁 `< 100 kB`，目标 `~60 kB`）：仅注册 DSH 插槽、事件投影与轻量级壳层 UI，严禁引入 `@a2ui/*`、`echarts` 或 `mermaid`。
   - `lib/client.runtime.js`：自包含 A2UI 1.0 核心运行时（`@a2ui/web_core`、`@a2ui/react`、`@a2ui/agent` 流式解析器、React Aria、TanStack Table 以及全部 57 个 Light DOM 组件）。
   - `lib/client.echarts.js`：自包含 19 类 ECharts 可视化引擎。
   - `lib/client.mermaid.js`：自包含 Mermaid 渲染引擎与离屏测量辅助器。
2. **宿主平台外部依赖 vs. 私有 Zod v3**：
   - `build/web-platform.ts` 将 DSH 宿主共享模块（`react`、`cordis`、`ui-slots`、`ui-primitives` 等）声明为 `external`，直接从宿主冻结模块表解析。
   - 刻意将 `zod` 排除在 `PLATFORM_MODULES` 之外，由 `dsh-genui-a2ui` 私有打包 Zod v3，彻底规避与宿主 Zod v4 的 ABI 冲突。
   - `build/preset.ts` 在构建期拒绝跨插件值导入，防止重复实例化运行时或命中宿主模块表不存在的模块。
3. **浏览器原生 UUID 与 `@a2ui/agent` Node 内置模块桩替代**：
   - `build/preset.ts` 将 `uuid` 指向浏览器原生 Web Crypto 实现（`uuid/dist/esm-browser/index.js`），并对 `@a2ui/agent` 桶文件重导出 `FileSystemCatalogProvider` 带入的不可达 Node 内置模块做空桩处理。
4. **双环境分包加载器与瞬时错误自恢复**：
   - `src/client/chunk-loader.ts` 在打包态浏览器环境（`__DSH_BUNDLED_CLIENT__ === true`）下调用 `require.async("./client.<name>.js")`，在 Node / Vitest 测试环境下回退到标准动态 `import()`。
   - 分包加载失败或 Mermaid 瞬时渲染失败不会永久锁死缓存，重新挂载或重试时可正常恢复。
   - `src/client/chunk-loader.ts` 中的 `/* @__PURE__ */` 是 Rollup / tsdown 必需的 Tree-Shaking 编译指令，用于将未使用的 Store 从 `lib/client.js` 中摇树剔除。
5. **面向 Tree-Shaking 的共享层拆分**：
   - `src/shared/wire-types.ts` 严格仅做 `import type` 类型共享，避免 `src/client/` 意外拉入 `src/host/` 代码。
   - `src/shared/i18n.ts` 将词典拆分为 `HOST_MESSAGES`、`SHELL_MESSAGES`、`RUNTIME_MESSAGES`，让打包器自动剔除 `lib/client.js` 不使用的词条。
   - `src/client/theme.ts` 不依赖任何 `@a2ui/*` 运行时，供 `client.js`、`client.echarts.js`、`client.mermaid.js` 零额外负担复用。
   - `build/preset.ts` 在子分包构建完成后刷新 `lib/client.js` 的 `mtime`，确保 DSH 热重载监听器能感知仅子分包发生的改动。

## 影响与约束

- `lib/client.js` 稳定维持在 `~60.5 kB`（由 `tests/bundle.spec.ts` 自动化守卫 `< 100 kB`）。
- 仓库禁注释 Lint（`scripts/check-no-comments.mjs`）必须始终将 `/* @__PURE__ */` 等打包器纯度指令列入白名单。
