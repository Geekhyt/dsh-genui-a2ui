# ADR-0006：安全边界——Mermaid 严格净化、`openUrl` 手势门禁、凭据脱敏与 CSV 防注入

- **状态**：已采纳（Accepted）
- **涉及范围**：`src/client/mermaid-safe.ts`、`src/client/chunks/mermaid-chunk.ts`、`src/client/catalog/ExtendedWidgets.tsx`、`src/client/catalog/functions.ts`、`src/client/persistence.ts`、`src/shared/constants.ts`、`src/client/catalog/v4-helpers.ts`

## 背景

生成式 UI 会将模型产出的不可信组件树、URL、Mermaid 源码与表格导出内容直接渲染到用户已鉴权的 DeepSeek Harness 桌面/网页宿主中。必须建立纵深防御，防范 XSS、任意本地协议/路径跳转、原型链污染、敏感输入落盘 `localStorage` 以及电子表格 DDE 公式注入。

## 决策

1. **Mermaid 语义边界、严格沙箱与 SVG 净化**：
   - **协议纯净边界**：`Mermaid` 组件线协议 Schema 仅暴露语义属性（`code`、`title`、`caption`、`weight`），绝不将视口缩放/全屏等临时 UI 状态泄露进大模型 Prompt Token。
   - **指令剥离与串行队列**：`src/client/mermaid-safe.ts` 在渲染前剥离模型写入的 `%%{init: ...}%%` 指令与 YAML Frontmatter，防止降级 `securityLevel: 'strict'` 或篡改主题；`mermaid-chunk.ts` 通过单异步队列串行执行渲染，防止多个 `<Mermaid>` 并发竞态修改全局 `mermaid.initialize(...)` 状态，并将 DSH `--dsw-*`（含 `oklch()` / `color-mix()`）解析为标准 sRGB 传给 `themeVariables`。
   - **双重 SVG 校验**：输出 SVG 经 `DOMPurify` 后再由 `assertSafeSvg` 二次校验，拦截 `<script>` / 嵌入标签、实体混淆的 `javascript:`/`vbscript:` URI，以及仅存在于 HTML/SVG 起始标签内的 `on*=` 事件属性（不误杀 `<text>` 正文）。
   - **无损矢量缩放与防滚动劫持**：`prepareMermaidSvg` 提取真实矢量尺寸并剥离 Mermaid 默认内联 `max-width` / 百分比宽度锁，支持 10%–2000% 清晰缩放；卡片内联模式仅在按住 `Ctrl`/`Cmd`（或触控板捏合）时缩放以免劫持聊天页正常滚动，全屏模式下支持直接滚轮光标锚点缩放与拖拽平移。
   - **零重依赖纯模块**：`mermaid-safe.ts` 不导入 `mermaid`（约 2 kB），使净化逻辑及裸边自动补全 `graph TD`、中文节点标签容错修复均可在 Node 端直接单测。
2. **`openUrl` 强外链与用户手势校验**：
   - `src/client/catalog/functions.ts` 严格校验外链，禁止将相对路径解析到 DSH 宿主源，拒绝 `javascript:`、`file:`、`data:` 协议以及非用户手势触发的调用。
3. **原型链污染防护、HITL `callId` 严格绑定与凭据字段脱敏**：
   - `src/shared/constants.ts` 在清理不可信 JSON 时过滤 `__proto__`、`constructor`、`prototype` 键，并识别独立与复合命名凭据键（如 `password`、`secret`、`token`、`pin`、`otp`、`passcode`、`cvv`、`passphrase`、`credential(s)`、`authorization`、`cookie`、`apiKey`、`privateKey`、`accessKey`、`sshKey`、`signingKey` 等），同时避免误伤 `tokens`/`promptTokens`/`totalTokens` 等指标字段。
   - `src/client/persistence.ts` 与 `src/client/SurfaceView.tsx` 在写入 `localStorage` 草稿与派发 `action.context` 前，均单次 fail-closed 扫描所有 `TextField(..., variant="obscured")` 指针并递归剥离对应字段（含父路径绑定与 `>= 4` 字符值兜底）。
   - `src/host/ask-tool.ts` 严格校验显式 `callId`，拒绝过期、空白或非法 `callId` 回退签批会话内其他活跃 `a2ui_ask`。
4. **CSV 导出防公式注入与 Excel 中文兼容**：
   - `src/client/catalog/v4-helpers.ts` 仅豁免纯数字字面量（`/^[+-]?\d+(?:\.\d+)?$/`），对一切前导空白/换行或以 `=`、`+`、`-`、`@`、`\t`、`\r` 开头的公式/DDE 单元格前置单引号转义，并为 RFC-4180 CSV 添加 UTF-8 BOM（`\uFEFF`）头以确保 Excel 正确显示中文。

## 影响与约束

- 任何涉及 Mermaid、`openUrl`、草稿/动作脱敏、`a2ui_ask` 签批或 CSV 导出的修改都必须保持 `tests/oss-readiness.spec.ts`、`tests/react-best-practices.spec.ts`、`tests/audit-fixes-v041.spec.ts` 与 `tests/review-v042-fixes.spec.ts` 中的安全回归测试全绿。
