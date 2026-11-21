# ADR-0007：306px/276px 窄容器适配、ECharts 防碰撞与 0ms 跨组件联动匹配

- **状态**：已采纳（Accepted）
- **涉及范围**：`src/client/catalog/InputWidgets.tsx`、`src/client/catalog/widget-helpers.tsx`、`src/client/catalog/stat-file-helpers.ts`、`src/client/catalog/v3-helpers.ts`、`src/client/catalog/v4-helpers.ts`、`src/client/chunks/echarts-chunk.ts`、`src/client/file-opener.tsx`

## 背景

在 DeepSeek Harness 桌面端标准窗口（`1360x900`）下，聊天主列宽约 `691px`；双列卡片布局时每个独立组件仅获得约 `306px` 宽度，ECharts 画布仅约 `276px`。按传统全屏桌面思路编写的布局与图表配置在窄卡片下极易出现标签重叠、分段控件滑块错行、右列弹层裁切以及 SVG 依赖图边标签被节点遮挡等问题。

## 决策

1. **窄卡片下 `Segmented` 自动切换多行胶囊网格（`src/client/catalog/InputWidgets.tsx`）**：
   - 宿主 `SegmentedControl` 采用单行滑动指示条，在 `306px` 半宽卡片中选项较多或文案较长时会发生换行错位。当选项数量或文案长度超过单行安全容量时，`DshSegmented` 自动切为原生可换行胶囊网格，各选中项独立高亮且无行间重叠。
2. **Portal 弹层视口边界钳位与向上锚定（`src/client/catalog/widget-helpers.tsx`、`src/client/dom-hooks.ts`）**：
   - `Select`、`MultiSelect`、`TreeSelect` 通过共享 `usePortalPopover` 与 `computeClampedPopoverBox` 计算固定定位边界；当向下空间不足而向上展开时改用 `bottom` 锚定而非固定 `top`，保证内容收缩或筛选后浮层紧贴触发器不脱节，且关闭时自动归还触发器焦点。
3. **ECharts `276px` 防碰撞、色块细描边光晕与智能图例消歧（`src/client/chunks/echarts-chunk.ts`）**：
   - **Sankey**：送入 ECharts 前先合并重复边并执行破环处理防止运行时抛错，并按拓扑层级深度钳制中间列标签宽度，确保落在列间隙内不碰撞。
   - **色块内文字清晰度（`FILLED_SHAPE_LABEL`）**：`Sunburst`（含第 4+ 层默认项）、`Treemap`、`Funnel`、`Waterfall` 柱内标签与 `Heatmap` 高亮格统一采用轻量细描边 + 柔阴影（`textBorderWidth: 0.8`、`textShadowBlur: 3`），消除粗黑边导致的中文字体发糊发黑问题，兼顾深浅双主题可读性。
   - **智能图例前缀消歧**：默认紧凑截断阈值维持 8 视觉单位；当检测到同一图表中多个图例名截断后发生碰撞（如 `DeepSeek-V3` 与 `DeepSeek-R1`）时，若仅 2 项且 `<= 14` 单位则完整保留全名，否则启用中段省略（保留首尾辨识字符）。
   - **跨组件联动高亮降噪**：当 `selected` 非空时对图表 Option 做后处理，将未选中项统一降透明（`opacity: 0.30`），并跳过瀑布图透明辅助基准系列。
   - **Waterfall 窄柱宽感知避让与负值区精确跟踪**：当参考线或目标胶囊激活时，逐柱检测碰撞并结合 `fitsInsideBar` 评估当前 `containerWidth` 下柱宽是否容得下标签——宽图（`520px`）移入柱内（`'inside'`），窄图（`276px`）则改落柱底留白（`'bottom'`）防止文字撑出柱体两侧；通过 `stepDeltas[]` / `isTotalFlags[]` 精确记录跨零与纯负值步长，杜绝 `--20` 双负号和跨零 Tooltip 截断。
4. **纯函数确定性 SVG 几何排版（`src/client/catalog/v3-helpers.ts`、`stat-file-helpers.ts`）**：
   - `ServiceGraph` 采用带环安全 DFS 识别回边 + 最长路径拓扑分层 + 单轮重心排序减交叉 + 按中英文边标签长度自适应拉宽 LR 层间距 + 画布包围盒正向归一化，保证所有节点、贝塞尔曲线采样点与边标签胶囊 100% 落在正坐标边界内无裁切。
   - `splitStatValueUnit` 将 `"99.95%"`、`"142 ms"`、`"32.5万元"` 等指标拆分为 `{ main, unit }` 实现基线对齐，同时刻意保留 ISO 日期（`"2026-11-12"`）、时钟时间（`"14:30:00"`）与比例（`"3/5"`）不被误拆。
5. **0ms Chart ↔ ProTable 跨组件筛选匹配与格式化数值排序（`src/client/catalog/v4-helpers.ts`、`TableWidget.tsx`）**：
   - 优先执行大小写无关的精确匹配（防止 `"US"` 误命中 `"US-West"`）；仅当精确匹配数为 0 时才回退到带前缀边界校验的匹配（要求筛选值以单元格文本为前缀且紧跟空白/分隔符，并拒绝单字符误命中），在保留 Sankey 携带数值后缀节点（如 `"华东 9,860"`）兼容性的同时避免无关子串误配。
   - 表格排序与汇总行内置格式化数值解析（支持 `¥1,200`、`-¥500`、`99.95%`、`142 ms`），CSV/Markdown 导出始终遵循当前排序后的行顺序，日期字符串不参与数值求平均。
6. **兼容 Windows 盘符的工作区文件路径解析（`src/client/file-opener.tsx`）**：
   - 支持解析 `:line`、`:line:col`、`#Lline` 行号后缀的同时保留 `C:\...` Windows 盘符，并严格按照 `@deepseek-ai/dsh-util-workspace-path` 的 `dsh-resource://file/session/<sessionId>/<path>` 契约编码 URI。
7. **306px 容器查询层叠与 `container-type` 宿主约束（`src/client/catalog/Catalog.module.css`、`LayoutWidgets.tsx`）**：
   - 所有 `@container (max-width: ...)` 覆盖规则（`.logMessage`、`.chartActions`、`.kvCell` 等）必须声明在基础规则之后，避免同权重源码顺序覆盖；容器查询卡片（如 `.chartCard > .chartInner`、`.containerHost`、`Grid`/`Row`/`DockView`/`Accordion`/`Kanban`）显式分离容器宿主与被查询子元素，杜绝元素自查询失效；
   - 琥珀底 `#f59e0b` 的 `ApiEndpoint` `PUT`/`PATCH` 徽章、`Schedule` 告警进度条与 `Result` 告警徽标统一使用 `#18181b` 深色前景（`8.08:1` WCAG AAA）。

## 影响与约束

- 所有新增图表类型、窄容器样式与几何辅助函数都必须在 `tests/tier1-echarts.spec.ts`、`tests/v3-components.spec.ts`、`tests/audit-fixes-v041.spec.ts`、`tests/review-v042-fixes.spec.ts` 或 `tests/review-v044-hardening.spec.ts` 中补充 `containerWidth = 276` / `306px` 回归断言。
