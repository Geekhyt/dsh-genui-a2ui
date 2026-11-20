# ADR-0005：P0 四域 Skill 压缩、引号安全 Express 降糖与同构 `calc()` 引擎

- **状态**：已采纳（Accepted）
- **涉及范围**：`src/host/prompt-compact.ts`、`src/shared/express-preprocess.ts`、`src/shared/calc-engine.ts`、`src/client/streaming.ts`

## 背景

上游 `@a2ui/agent` 自动生成的 57 组件完整 Express 提示词高达约 73.5k 字符（~19.3k tokens），显著拉高首包延迟与上下文成本。与此同时，大模型在生成复杂交互计算器或动态文案时，高频写出自然字符串拼接（`formatNumber(x) + " GB"`）、多层嵌套 `cond(eq(...))` 或链式局部 `calc()` 变量，极易撞上 A2UI 1.0 协议的 `MAX_FUNC_CALL_DEPTH = 5` 递归深度硬上限。

## 决策

1. **无损提示词压缩与四域正交 Skill 拆分（`src/host/prompt-compact.ts`）**：
   - 将 57 个组件重复出现的通用样板说明（如 `weight` 说明）合并为单条头部注释，并裁剪与参数名完全同义的冗余短语，同时 100% 保留全部位置参数签名、枚举值、嵌套对象键列表与非显而易见的行为约束。
   - 仅当上游函数区块包含预期函数清单时才执行紧凑替换，保障上游 SDK 演进时的前向安全。
   - 将全部 57 个组件无重叠切分为 4 个领域 Skill（核心 `a2ui` + `a2ui-analytics`、`a2ui-devops`、`a2ui-forms`），让模型按需按域加载。
2. **三阶段引号安全同构 Express 预降糖（`src/shared/express-preprocess.ts`）**：
   - **Pass 1（`desugarExpressConcat`）**：将包含字符串字面量或 `format*()` 的 `+` 拼接改写为合法的 `concat([...])`，绝不破坏字符串内部字符或纯数值加法。
   - **Pass 2（`foldNestedCondToLookup`）**：将 2 层及以上且最终回退值为静态标量的 `cond(eq(K, "a"), lit1, cond(eq(K, "b"), lit2, fallback))` 链折叠为深度 1 的 `lookup(...)`，并严格保持重复键名时的短路优先语义。
   - **Pass 3（`flattenChainedCalc`）**：将链式局部 `calc()` 变量代数内联为单层扁平 `calc()`，跳过函数调用标识符（紧跟 `(`），并对所有出现次数实施展开体积上限保护以防指数膨胀。
3. **Host 与客户端流式预览降糖一致性（`src/client/streaming.ts`）**：
   - `StreamingExpressSession` 对已完整接收的行（或在 `final=true` 时对全程序）执行同一套共享预降糖管线，使 60fps 实时流式预览与 Host 编译结果一致，且不会因末尾半截未闭合 token 报错；流式中间态语法不完整时保留上一帧有效消息。
4. **同构零 `eval` 代数 `calc()` 引擎（`src/shared/calc-engine.ts`）**：
   - Host 编译期复用同一解析器做静态校验（即时捕获括号未闭合、未知函数、未绑定 `vars` 并指导模型同轮自愈）；浏览器端对预解析 AST 做缓存求值，实现 60fps 滑块/选项拖拽 0ms 响应，同时在线协议上始终保持 `funcDepth = 1`。

## 影响与约束

- 核心 `a2ui` Skill 体积较单体版下降超 65%，且不改变任何 A2UI 1.0 线协议结构。
- 多步交互计算器在 Host 编译与客户端流式两条路径下均稳定满足 `MAX_FUNC_CALL_DEPTH = 5`。
