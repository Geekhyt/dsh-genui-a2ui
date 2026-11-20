# 借口注释整改 Issue 清单

在全仓库代码注释审计中，共有 **17** 条注释被归类为 **借口（Excuse）**——这些注释用来合理化静默吞错的空 `catch` 块、类型检查屏蔽指令或临时桥接绕过，而非修复底层缺陷。

目前全部 17 条借口注释均已从代码中删除：其中 `#498` 已通过补充类型声明直接根治，其余 16 条对应的凑合实现已整理为下方 **9 个具体 GitHub Issue**。

> [!NOTE]
> 当前机器的 `gh` CLI 尚未完成鉴权（`gh auth status` 退出码 4）。执行 `gh auth login` 后，可直接运行文末 [一键批量提交命令](#一键批量提交命令) 在 `Geekhyt/dsh-genui-a2ui` 仓库创建全部 9 个 Issue。

---

## Issue 1：`collectObscuredPointers` 静默空 `catch` 可能导致密码类字段绕过 `localStorage` 脱敏

- **已删注释**：`#041`（`src/client/SurfaceView.tsx:L89` — `// Ignore`）
- **严重级别**：高（安全 / 数据隐私）
- **根因**：`collectObscuredPointers` 用宽泛的 `try { ... } catch {}` 包裹组件树遍历。若 `@a2ui/web_core` 的 `componentsModel` 结构变化或抛错，该函数会静默返回空集合，导致 `variant="obscured"` 的敏感 `TextField` 跳过脱敏直接写入 `localStorage`。
- **修复建议**：改用显式结构守卫替代宽泛捕获；若遍历发生预期外异常，应采取 **fail-closed** 策略（跳过本次草稿持久化并记录结构化调试日志）。

## Issue 2：`persistence.ts` 与 `SurfaceView.tsx` 静默吞掉损坏的 `localStorage` 草稿与 Dock 状态

- **已删注释**：`#058`（`src/client/SurfaceView.tsx:L335`）、`#311`、`#312`、`#314`、`#325`（`src/client/persistence.ts:L54,L66,L91,L284`）
- **严重级别**：中（可靠性）
- **根因**：多处 `JSON.parse` 与 `localStorage` 读写将沙箱/配额不可用（预期回退内存）与存储内容损坏/草稿路径非法混为一谈，全部静默丢弃。
- **修复建议**：封装显式 `StorageAdapter`，区分“存储不可用”与“JSON 数据损坏”；遇到损坏条目时自动清理坏键并在开发态节流告警，恢复草稿前先校验路径合法性。

## Issue 3：`JsonTree` 复制按钮遇循环引用时静默失败且无任何反馈

- **已删注释**：`#155`（`src/client/catalog/ExtendedWidgets.tsx:L212` — `// Ignore circular structure`）
- **严重级别**：低（交互体验）
- **根因**：点击 `JsonTree` 复制按钮时，若数据对象含循环引用，`JSON.stringify` 抛错被空 `catch` 静默吞掉，用户点击无反应也无提示。
- **修复建议**：实现基于 `WeakSet` 的循环引用安全序列化器（循环节点输出 `"[Circular]"`），保证任意对象结构均可确定性复制。

## Issue 4：`chunk-loader.ts` 与 `persistence.ts` 静默吞掉外部 Store 订阅者异常

- **已删注释**：`#233`（`src/client/chunk-loader.ts:L38`）、`#324`（`src/client/persistence.ts:L264`）
- **严重级别**：中（可观测性）
- **根因**：通知监听器遍历循环使用空 `catch {}` 吞掉订阅回调异常，会彻底掩盖 React 组件或订阅逻辑中的真实 Bug。
- **修复建议**：隔离单个订阅者失败以防阻断兄弟监听器，同时通过 `queueMicrotask(() => { throw err })` 或 `console.error` 异步暴露异常。

## Issue 5：`runtime-chunk.ts` 使用宽泛 `try/catch` 掩盖样式注入与卸载异常

- **已删注释**：`#283`、`#284`、`#285`（`src/client/chunks/runtime-chunk.ts:L21,L26,L36`）
- **严重级别**：低（可维护性）
- **根因**：三处空 `catch` 用来敷衍 Node 测试环境缺少 `document`、`document.head` 或 `CSSStyleSheet` 的情况，反而可能掩盖真实浏览器的样式注入失败。
- **修复建议**：改为显式环境能力探测（`typeof document !== 'undefined' && document.head`、`typeof CSSStyleSheet === 'function' && 'adoptedStyleSheets' in document`）。

## Issue 6：`StreamingExpressSession` 静默吞掉 `update=true` 增量预览的种子初始化失败

- **已删注释**：`#339`（`src/client/streaming.ts:L69` — `// Ignore seed failure`）
- **严重级别**：中（流式预览调试性）
- **根因**：流式预览在为 `update=true` 补种历史表面状态时，若补种抛错被直接静默丢弃，导致预览空白却没有任何诊断痕迹。
- **修复建议**：在喂入 `ExpressResponseStream` 前校验种子消息合法性，并在流会话对象上记录可测试的诊断告警状态。

## Issue 7：`render-tool.ts` 中针对双层 JSON 编码参数的临时防御性解包

- **已删注释**：`#416`（`src/host/render-tool.ts:L62`）
- **严重级别**：中（协议卫生）
- **根因**：`parseRenderInput` 为了凑合部分上游工具桥接层把参数二次 `JSON.stringify` 的缺陷，做了临时递归解包，掩盖了真正不合规的桥接方且缺乏 Schema 边界校验与告警。
- **修复建议**：在工具入口改为严格的 Zod 边界校验；若短期仍需兼容字符串化入参，需打印结构化告警并定位修复上游工具桥接层。

## Issue 8：Host 持久化 `~/.dsh/dsh-genui-a2ui-state.json` 失败时静默吞错

- **已删注释**：`#420`（`src/index.ts:L93` — `// Ignore read-only filesystem errors gracefully`）
- **严重级别**：低（可观测性）
- **根因**：在只读文件系统或权限受限环境下写入 `/a2ui on|off` 状态文件失败被静默忽略，用户重启后开关回滚却查不到任何日志原因。
- **修复建议**：捕获非 `ENOENT` 写盘错误时通过 Cordis Logger（`ctx.logger.warn(...)`）输出一次性提示，同时继续在内存中正常运行。

## Issue 9：`scripts/mock-llm.mjs` 请求体解析失败时静默穿透

- **已删注释**：`#024`（`scripts/mock-llm.mjs:L1654` — `// Fall through`）
- **严重级别**：低（开发工具）
- **根因**：Mock LLM 收到非法 JSON 请求体时在空 `catch` 中静默穿透回落到默认场景，容易掩盖本地联调或测试客户端的请求构造错误。
- **修复建议**：解析失败时直接返回 HTTP `400 Bad Request` 及明确 JSON 错误信息，让错误调用快速暴露。

---

## 本次已直接根治

- **`#498`（`tests/catalog-schema.spec.ts:L3` — `// @ts-expect-error plain ESM helper script`）**：已删除 `@ts-expect-error` 规避指令，并补充 [`scripts/mock-llm.d.mts`](../../scripts/mock-llm.d.mts) 类型声明文件，使 `tsc --noEmit` 严格校验测试导入。

---

## 一键批量提交命令

执行 `gh auth login` 后运行：

```bash
gh issue create --repo Geekhyt/dsh-genui-a2ui --label "security,bug" \
  --title "collectObscuredPointers 改为 fail-closed，消除静默吞错导致的脱敏绕过风险" \
  --body "详见 docs/adr/excuse-issues.md#issue-1（原静默 catch 注释位于 src/client/SurfaceView.tsx:89）。"

gh issue create --repo Geekhyt/dsh-genui-a2ui --label "bug,tech-debt" \
  --title "区分 localStorage 不可用与 JSON 数据损坏，避免静默吞错" \
  --body "详见 docs/adr/excuse-issues.md#issue-2（原静默 catch 注释位于 src/client/persistence.ts:54,66,91,284 与 src/client/SurfaceView.tsx:335）。"

gh issue create --repo Geekhyt/dsh-genui-a2ui --label "enhancement" \
  --title "JsonTree 复制按钮改用循环引用安全序列化器" \
  --body "详见 docs/adr/excuse-issues.md#issue-3（原静默 catch 注释位于 src/client/catalog/ExtendedWidgets.tsx:212）。"

gh issue create --repo Geekhyt/dsh-genui-a2ui --label "bug,observability" \
  --title "在 chunk-loader.ts 与 persistence.ts 中暴露外部 Store 订阅者异常" \
  --body "详见 docs/adr/excuse-issues.md#issue-4（原静默 catch 注释位于 src/client/chunk-loader.ts:38 与 src/client/persistence.ts:264）。"

gh issue create --repo Geekhyt/dsh-genui-a2ui --label "tech-debt" \
  --title "将 runtime-chunk.ts 的宽泛 try/catch 替换为显式 DOM 能力守卫" \
  --body "详见 docs/adr/excuse-issues.md#issue-5（原静默 catch 注释位于 src/client/chunks/runtime-chunk.ts:21,26,36）。"

gh issue create --repo Geekhyt/dsh-genui-a2ui --label "bug,observability" \
  --title "StreamingExpressSession 校验并记录 update=true 种子初始化失败诊断" \
  --body "详见 docs/adr/excuse-issues.md#issue-6（原静默 catch 注释位于 src/client/streaming.ts:69）。"

gh issue create --repo Geekhyt/dsh-genui-a2ui --label "tech-debt" \
  --title "用严格边界 Schema 校验替换 render-tool.ts 的双层 JSON 临时解包" \
  --body "详见 docs/adr/excuse-issues.md#issue-7（原绕过注释位于 src/host/render-tool.ts:62）。"

gh issue create --repo Geekhyt/dsh-genui-a2ui --label "observability" \
  --title "通过 Cordis Logger 记录 Host stateFile 写盘失败而非静默吞错" \
  --body "详见 docs/adr/excuse-issues.md#issue-8（原静默 catch 注释位于 src/index.ts:93）。"

gh issue create --repo Geekhyt/dsh-genui-a2ui --label "tech-debt" \
  --title "scripts/mock-llm.mjs 收到非法 JSON 请求体时返回 HTTP 400 而非静默穿透" \
  --body "详见 docs/adr/excuse-issues.md#issue-9（原穿透注释位于 scripts/mock-llm.mjs:1654）。"
```
