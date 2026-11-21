# ADR-0004：工具通道 A2UI Express 编译、事务回滚、跨重启水合与 KV-Cache 提示词落位

- **状态**：已采纳（Accepted）
- **涉及范围**：`src/index.ts`、`src/host/generator.ts`、`src/host/render-tool.ts`、`src/host/ask-tool.ts`

## 背景

上游 `@a2ui/agent` 默认引导模型在正文回复里直接输出 `<a2ui>` 代码块。在 DeepSeek Harness 中，通过工具通道（`a2ui_render`、`a2ui_ask`）承载 A2UI Express 程序，可以获得编译期校验的同轮自愈、结构化落位（`answer | inline | dock`）以及阻塞式人工确认表单。但在长生命周期 Host 会话中维护增量 `RendererState` 时，会面临编译失败污染状态、应用重启后内存冷启动以及系统提示词破坏 KV-Cache 前缀等关键问题。

## 决策

1. **最小化替换工具通道输出契约**：
   - `src/host/generator.ts` 仅替换上游 SDK Express 提示词中关于 `<a2ui>` 正文标签包裹的那一段落，改为工具参数契约，并通过 `tests/prompt.spec.ts` 守卫上游措辞变更，防止升级 SDK 后替换静默失效。
   - `src/host/render-tool.ts` 返回符合 `defineTool` 形状的纯 `ToolDefinition` 对象，使 Host 侧在运行时无需直接导入宿主工具辅助包。
2. **`a2ui_ask` 同轮阻塞 RPC 结算机制**：
   - 与渲染即结束当前工具调用的 `a2ui_render` 不同，`a2ui_ask` 会在当前轮次内挂起等待，直到浏览器端通过 `session.command('/a2ui-answer <json>', { recordInput: false })` 回传结构化 `{ action, userMessage, context, dataModels }`，在不新开对话轮次的前提下原位恢复模型推理。
3. **编译与限额校验的同步事务回滚**：
   - `RendererState` 内部持有实时函数引用，无法使用 `structuredClone` 快照。`SurfaceSessions.compile` 因此将每次解析与安全限额校验（含 `maxCompiledBytes: 512 KB` 字节上限）包裹在 `RendererState` 内置的同步事务帧内：一旦语法、Schema 或限额校验失败，状态自动干净回滚，避免残留半成品 Surface 导致模型自愈重试时触发 `"surface already exists"` 错误。
   - `express-preprocess.ts` 通过单遍预计算括号映射表（`Int32Array`）实现严格 $O(N)$ 预处理（含三引号/原始字符串与注释跳过、嵌套 `cond` 折叠以及链式 `calc` 展平）。
   - 仅当 `calc()` 的 `vars` 参数本身是动态 `$/path` 或 `@call` 表达式时，才跳过编译期静态变量键名检查。
4. **跨重启表面水合（Cross-Restart Hydration）**：
   - 当用户重启 DSH 后在历史会话中继续触发 `surface("id", update=true)`（此时 Host 内存冷启动、尚无该 Surface 记录），`SurfaceSessions.compile` 会自动补种一次占位 Surface 并重试，而非直接报未知 Surface 错误。
5. **保护 KV-Cache 前缀的系统提示词落位**：
   - `tool:a2ui` 系统提示词区块固定挂在优先级 `9200`（位于内置系统提示词尾部之后），避免破坏内置系统提示词的 KV-Cache 前缀复用；且当 A2UI 开关关闭或处于子 Agent 上下文（`parentCallId` 非空）时输出 0 token。

## 影响与约束

- 模型单轮自愈重试不会因前一次失败留下脏状态。
- 应用重启后继续操作旧卡片的 `update=true` 链路保持可用。
