# ADR-0007：306px/276px 窄容器适配、ECharts 防碰撞与 0ms 跨组件联动匹配

- **状态**：已采纳（Accepted）
- **涉及范围**：`src/client/catalog/InputWidgets.tsx`、`src/client/catalog/widget-helpers.tsx`、`src/client/catalog/stat-file-helpers.ts`、`src/client/catalog/v3-helpers.ts`、`src/client/catalog/v4-helpers.ts`、`src/client/chunks/echarts-chunk.ts`、`src/client/file-opener.tsx`

## 背景

在 DeepSeek Harness 桌面端标准窗口（`1360x900`）下，聊天主列宽约 `691px`；双列卡片布局时每个独立组件仅获得约 `306px` 宽度，ECharts 画布仅约 `276px`。按传统全屏桌面思路编写的布局与图表配置在窄卡片下极易出现标签重叠、分段控件滑块错行、右列弹层裁切以及 SVG 依赖图边标签被节点遮挡等问题。

## 决策

1. **窄卡片下 `Segmented` 自动切换多行胶囊网格（`src/client/catalog/InputWidgets.tsx`）**：
   - 宿主 `SegmentedControl` 采用单行滑动指示条，在 `306px` 半宽卡片中选项较多或文案较长时会发生换行错位。当选项数量或文案长度超过单行安全容量时，`DshSegmented` 自动切为原生可换行胶囊网格，各选中项独立高亮且无行间重叠。
2. **Portal 弹层视口边界钳位（`src/client/catalog/widget-helpers.tsx`）**：
   - `Select`、`MultiSelect`、`TreeSelect` 使用基于视口边界钳位的固定定位坐标计算，保证右侧栏触发器与矮视口下弹层绝不裁切出屏。
3. **ECharts `276px` 防碰撞与图环安全（`src/client/chunks/echarts-chunk.ts`）**：
   - **Sankey**：送入 ECharts 前先执行破环处理防止运行时抛错，并按拓扑层级深度钳制中间列标签宽度，确保落在列间隙内不碰撞。
   - **跨组件联动高亮降噪**：当 `selected` 非空时对图表 Option 做后处理，将未选中项统一降透明（`opacity: 0.30`），并跳过瀑布图透明辅助基准系列。
   - **Waterfall + `referenceLine` 标签避让**：当参考线或目标胶囊激活时，逐柱检测碰撞——与虚线或胶囊冲突的增量/合计顶部标签优先移入柱内（`'inside'`），若柱内中点仍与参考线胶囊重叠则改落柱底（`'bottom'`）；冲突的减量底部标签翻至柱顶（`'top'`）。
4. **纯函数确定性 SVG 几何排版（`src/client/catalog/v3-helpers.ts`、`stat-file-helpers.ts`）**：
   - `ServiceGraph` 采用带环安全 DFS 识别回边 + 最长路径拓扑分层 + 单轮重心排序减交叉 + 按中英文边标签长度自适应拉宽 LR 层间距 + 画布包围盒正向归一化，保证所有节点、贝塞尔曲线采样点与边标签胶囊 100% 落在正坐标边界内无裁切。
   - `splitStatValueUnit` 将 `"99.95%"`、`"142 ms"`、`"32.5万元"` 等指标拆分为 `{ main, unit }` 实现基线对齐，同时刻意保留 ISO 日期（`"2026-11-12"`）、时钟时间（`"14:30:00"`）与比例（`"3/5"`）不被误拆。
5. **0ms Chart ↔ ProTable 跨组件筛选匹配（`src/client/catalog/v4-helpers.ts`）**：
   - 优先执行大小写无关的精确匹配（防止 `"US"` 误命中 `"US-West"`）；仅当精确匹配数为 0 时才回退到归一化子串匹配，以兼容携带数值后缀的 Sankey 节点标签（如 `"华东 9,860"`）。
6. **兼容 Windows 盘符的工作区文件路径解析（`src/client/file-opener.tsx`）**：
   - 支持解析 `:line`、`:line:col`、`#Lline` 行号后缀的同时保留 `C:\...` Windows 盘符，并严格按照 `@deepseek-ai/dsh-util-workspace-path` 的 `dsh-resource://file/session/<sessionId>/<path>` 契约编码 URI。
7. **306px `LogViewer` 容器查询层叠约束与 WCAG AAA 琥珀对比度（`src/client/catalog/Catalog.module.css`）**：
   - `@container (max-width: 390px)` 中的 `.logMessage { flex: 1 0 100%; order: 10; }` 与 `.logDetailToggle { margin-left: auto; }` 必须声明在基础 `.logMessage` / `.logDetailToggle` 规则之后（容器查询不增加选择器权重），避免详情展开按钮被撑满整行或正文被挤压；
   - 琥珀底 `#f59e0b` 的 `ApiEndpoint` `PUT`/`PATCH` 徽章、`Schedule` 告警进度条与 `Result` 告警徽标统一使用 `#18181b` 深色前景（`8.08:1` WCAG AAA）。

## 影响与约束

- 所有新增图表类型、窄容器样式与几何辅助函数都必须在 `tests/tier1-echarts.spec.ts`、`tests/v3-components.spec.ts`、`tests/audit-fixes-v041.spec.ts` 或 `tests/review-v042-fixes.spec.ts` 中补充 `containerWidth = 276` / `306px` 回归断言。
