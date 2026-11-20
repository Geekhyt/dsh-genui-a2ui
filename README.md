# dsh-genui-a2ui

**简体中文** | [English](./README.en.md) | [开发与架构文档](./docs/DEVELOPMENT.zh-CN.md)

[![CI](https://github.com/Geekhyt/dsh-genui-a2ui/actions/workflows/ci.yml/badge.svg)](https://github.com/Geekhyt/dsh-genui-a2ui/actions/workflows/ci.yml) [![npm version](https://img.shields.io/npm/v/dsh-genui-a2ui.svg)](https://www.npmjs.com/package/dsh-genui-a2ui) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE) [![Protocol: A2UI 1.0](https://img.shields.io/badge/Protocol-A2UI%201.0-10b981.svg)](https://github.com/google/A2UI) [![DSH: >= 0.2.0](https://img.shields.io/badge/DeepSeek%20Harness-%3E%3D%200.2.0-4f46e5.svg)](./package.json)

**别只靠文字聊天，让 AI 直接用界面与你沟通。**

`dsh-genui-a2ui` 将 Google 开源的 A2UI（Agent to User Interface）标准带入 DeepSeek Harness。简单问题依然用文字快回；遇到数据对比、测算推演、代码审阅或复杂流程时，AI 会在对话里直接生成可点击、可拖动、可筛选的原生交互界面。

## 快速开始

**方式一：客户端界面一键安装（推荐，免终端与重启）**

打开 DeepSeek Harness 左侧边栏的 **插件** 页面，点击 **添加插件**，输入 `dsh-genui-a2ui` 并选择 **立即启用** 即可直接使用。

**方式二：命令行安装**

```bash
dsh plugin --profile desktop add dsh-genui-a2ui
```

如果是从源码仓库本地体验，克隆后运行 `npm ci && npm run build`，再执行 `dsh plugin --profile desktop add link:./dsh-genui-a2ui` 即可。后续升级版本执行 `dsh plugin --profile desktop add dsh-genui-a2ui@latest`，卸载可执行 `dsh plugin --profile desktop remove dsh-genui-a2ui`。

安装启用后，像平时一样用自然语言提问；点击输入框左下方的 **A2UI** 按钮或输入 `/a2ui off` 可随时切回纯文字模式。

<details>
<summary><strong>点击展开 18 个可直接复制试跑的提示词示例</strong></summary>

1. **转化漏斗与健康度大盘**：`帮我做一份季度业务增长与全链路转化诊断看板，包含四个带趋势微图的核心指标卡，下方同屏放一张四阶桑基流向图和一张五维健康度雷达对比图，再用标签页放区域增长柱状图和可搜索的渠道明细表。`
2. **营收增减归因瀑布与算力旭日图（FinOps）**：`生成 2026 Q3 营收增减归因与算力多层成本分摊台，顶部放集群对象头和 4 张带趋势微图的指标卡，中部并排放一张带 ¥680w 目标参考线的 ARR 增减归因瀑布图和一张可点击下钻的三级算力成本旭日图，底部附带可搜索汇总的云账单明细表。`
3. **双轴柱线混合、实时 SLO 标线与变更热力日历**：`做一个核心网关全天负载与 SLO 诊断看板，顶部放三个圆环水位和可拖动实时调节右轴 SLO 红线的滑块，中部放左轴堆叠吞吐柱 + 右轴 P99 延迟与未命中率双轴混合图（支持缩放），下方组合 14 日 SLA 可用性条和下半年生产变更日历热力图。`
4. **多模型五维平行坐标评测与方案对比**：`用五轴平行坐标图同屏对比 DeepSeek-R1、DeepSeek-V3、Qwen3、Claude-4 和 Llama-4 在推理得分、首字延迟、吞吐、成本和一次合格率五个维度的表现，下方搭配五维雷达图与推荐选型对比矩阵。`
5. **连锁门店实时经营看板**：`模拟一份连锁咖啡品牌今日实时经营仪表盘，顶部展示今日实收、总单量、高峰出杯准时率和缺货预警数，下方联动分时段全渠道面积图、各门店分时段单量热力图，以及可搜索排序的原料库存预警表。`
6. **零延迟算力与缓存成本测算器**：`做一个大模型推理算力与缓存成本实时测算沙盘，支持单选切换主力推理模型（DeepSeek-V3 / R1），并用滑块调节日均调用量、Prompt 缓存命中率和平均输出长度，本地实时算出月度总成本、缓存净节省额、预算水位与费用对比柱状图。`
7. **多规格卡片选型与步进容量规划**：`做一个私有化大模型集群容量与规格选型工作台，用卡片组切换 GPU 机型档位，配合步进数字框调节副本数与单副本并发、多选框配置容灾可用区、级联树绑定目标微服务，并在底部给出下一步压测追问建议卡。`
8. **专属集群健康度与可展开 ProTable**：`生成核心业务专属推理集群的季度巡检与算力治理台，顶部放集群健康概览头和 20 日 SLA 可用性时序条，中部用带边框描述表列出工单规格，底部用支持行内展开详情、导出与汇总的 ProTable 列出闲置实例优化清单。`
9. **微服务健康拓扑与调用链瀑布排障**：`排查线上支付结算接口 P99 延迟突增问题，同屏展示含降级旁路与重试环路的微服务实时健康拓扑图、带耗时占比条的分布式调用链瀑布树，以及关联异常堆栈日志与源码定位。`
10. **高危数据库变更审批与排期甘特条**：`准备对核心账单表执行历史冷分区在线归档，请生成带二次确认开关的高风险变更审批卡、前置快照校验终端手册，以及凌晨维护窗口甘特排期条。`
11. **技术选型对比矩阵与溯源证据卡**：`对比 PostgreSQL pgvector、Milvus 与 Elasticsearch 三种生产级混合检索方案，顶部支持分段切换评估负载规模，中部展示带推荐标记的多维权衡矩阵，底部附上官方文档与压测基准溯源引用。`
12. **接口契约调试台、时间窗与圆环水位**：`生成支付核心网关限流扩容接口的联调与健康诊断面板，顶部展示三个圆环水位仪表和快捷日期区间选择器，下方展示支持一键复制安全 cURL、请求体与响应树的接口契约调试卡。`
13. **应急协同看板、热力矩阵与操作回执**：`汇总一次跨可用区流量容灾演练复盘，同屏组合三泳道任务跟进看板、关键动作时间轴、跨可用区季度延迟热力矩阵，以及最终演练达标回执单。`
14. **代码差异核对与确认单**：`假设你要把线上网关的灰度权重从 5% 调到 20% 并新增超时熔断参数，请先弹出交互确认卡片展示双栏配置差异、生效集群下拉选择和自动回滚开关，等我确认后再继续。`
15. **当前工作区架构图与源码联动**：`梳理当前工作区项目的核心模块分层，画一张多层 Mermaid 架构图，并附上关键源码文件树和核心配置树，方便我点击直接在右侧打开对应文件。`
16. **底部常驻多阶段进度栏**：`把一个包含类型检查、分包构建、契约核验、回归测试和打包审计五步的发布流水线进度条固定在输入框上方，展示各阶段状态与整体完成百分比。`
17. **量化行情 K 线与波动分布**：`模拟一份科技指数近 10 个交易日的量化复盘看板，同屏组合情绪水位仪表盘、日 K 线图以及各细分板块涨跌幅箱线分布图。`
18. **故障排查折叠手风琴与详情弹窗**：`生成一份线上网关延迟突增的分级排查卡片，用折叠手风琴分层收纳根因摘要、关键指标键值表与回滚预案，并附带一个点击弹出慢查询详情的弹窗按钮。`

</details>

## 场景预览

每个场景均原生跟随宿主主题自动切换深色与浅色模式（点击任意配图可查看高清原图）：

### 一屏看清多阶转化流向与多维健康度

顶栏指标卡自动等高对齐并附带趋势微图。下方同屏组合四阶全链路桑基流向图与五维健康度雷达对比图，点击标签页还可切换区域柱状图与可检索明细表。

| 深色模式（Dark） | 浅色模式（Light） |
| :---: | :---: |
| ![全链路转化流向与五维健康度诊断大盘（深色模式）](assets/screenshots/hero-executive-dashboard.png) | ![全链路转化流向与五维健康度诊断大盘（浅色模式）](assets/screenshots/hero-executive-dashboard-light.png) |

### 营收增减归因瀑布与三级算力成本旭日图

组合对象概览头、趋势指标卡、带 `referenceLine` 目标标线的 ARR 增减归因瀑布图（`waterfall`）与支持点击扇区下钻的三级成本分摊旭日图（`sunburst`），业务归因与账单钻取一屏完成。

| 深色模式（Dark） | 浅色模式（Light） |
| :---: | :---: |
| ![营收增减归因瀑布与三级算力成本旭日图（深色模式）](assets/screenshots/finops-waterfall-sunburst.png) | ![营收增减归因瀑布与三级算力成本旭日图（浅色模式）](assets/screenshots/finops-waterfall-sunburst-light.png) |

### 双轴柱线混合图、滑块联动 SLO 红线与变更热力日历

拖动滑块即可在本地 0 ms 实时移动双轴混合图（`combo`）右侧的 SLO 阈值参考线，下方同步串联 14 日 SLA 可用性分片条与 GitHub 风格生产变更日历热力图（`calendar`）。

| 深色模式（Dark） | 浅色模式（Light） |
| :---: | :---: |
| ![双轴柱线混合图与变更热力日历（深色模式）](assets/screenshots/sre-combo-calendar-slo.png) | ![双轴柱线混合图与变更热力日历（浅色模式）](assets/screenshots/sre-combo-calendar-slo-light.png) |

### 连锁门店实时经营与库存预警

汇总多门店今日实收、单量与高峰出杯准时率。同屏联动分时段全渠道面积图、门店客流热力矩阵与可搜索排序的原料库存预警表，异常门店一眼定位。

| 深色模式（Dark） | 浅色模式（Light） |
| :---: | :---: |
| ![连锁门店今日实时经营仪表盘（深色模式）](assets/screenshots/store-operations-dashboard.png) | ![连锁门店今日实时经营仪表盘（浅色模式）](assets/screenshots/store-operations-dashboard-light.png) |

### 多规格选型卡片组、步进容量推演与追问建议

点选 GPU 机型规格卡片或点击步进数字框调节副本数，顶栏网格指标在本地 0 ms 即时重算总吞吐与包月预算；支持多选胶囊配置容灾可用区、级联树绑定目标微服务，并在底部直接点击追问建议卡片开启下一轮压测推演。

| 深色模式（Dark） | 浅色模式（Light） |
| :---: | :---: |
| ![多规格选型卡片组与步进容量规划台（深色模式）](assets/screenshots/antd-capacity-checkcard-planner.png) | ![多规格选型卡片组与步进容量规划台（浅色模式）](assets/screenshots/antd-capacity-checkcard-planner-light.png) |

### 专属集群健康概览、边框规格书与可展开 ProTable

一屏聚合核心生产集群概览头、悬停可查看详情的 SLA 可用性时序条与带表格边框的工单规格书。下方 ProTable 支持一键复制 Markdown、导出 CSV、自动生成数值汇总行，并可点击行首展开内联诊断详情抽屉。

| 深色模式（Dark） | 浅色模式（Light） |
| :---: | :---: |
| ![专属集群健康概览与可展开 ProTable 治理台（深色模式）](assets/screenshots/enterprise-governance-protable.png) | ![专属集群健康概览与可展开 ProTable 治理台（浅色模式）](assets/screenshots/enterprise-governance-protable-light.png) |

### 微服务健康拓扑、全链路调用瀑布树与日志定位

无需加载重型图形库即可秒级绘制实时健康度着色的服务依赖拓扑，同屏联动带比例耗时微条的分布式 Trace 瀑布树与结构化异常日志台，一眼锁定慢调用瓶颈并直跳工作区源码行。

| 深色模式（Dark） | 浅色模式（Light） |
| :---: | :---: |
| ![微服务健康拓扑与全链路调用瀑布诊断台（深色模式）](assets/screenshots/sre-apm-topology-workbench.png) | ![微服务健康拓扑与全链路调用瀑布诊断台（浅色模式）](assets/screenshots/sre-apm-topology-workbench-light.png) |

### 拖动滑块实时推演成本与回报

调整预算、利率或流量假设时，不必反复发消息等待重算。直接在对话内拖动滑块或切换档位，账单金额、预算水位与对比图表会在本地 0 ms 即时更新，不额外消耗 Token。

| 深色模式（Dark） | 浅色模式（Light） |
| :---: | :---: |
| ![实时联动的参数测算器（深色模式）](assets/screenshots/zero-latency-simulator.png) | ![实时联动的参数测算器（浅色模式）](assets/screenshots/zero-latency-simulator-light.png) |

### 关键操作前先核对差异再放行

执行重要配置修改或高影响动作前，输入框上方会弹出确认卡片。核对双栏代码差异、选择生效范围并勾选确认后，任务才会继续执行。

| 深色模式（Dark） | 浅色模式（Light） |
| :---: | :---: |
| ![双栏代码对比与确认面板（深色模式）](assets/screenshots/human-in-the-loop-ask.png) | ![双栏代码对比与确认面板（浅色模式）](assets/screenshots/human-in-the-loop-ask-light.png) |

### 分层系统架构图与右侧源码联动

多层级 Mermaid 系统架构图、工作区文件树与配置树同屏呈现。点击左侧任意文件节点，右侧边栏会直接打开真实工作区文件并跳到对应行号。

| 深色模式（Dark） | 浅色模式（Light） |
| :---: | :---: |
| ![分层系统架构图与右侧边栏源码联动（深色模式）](assets/screenshots/codebase-explorer-sidebar.png) | ![分层系统架构图与右侧边栏源码联动（浅色模式）](assets/screenshots/codebase-explorer-sidebar-light.png) |

### 多步骤任务常驻底部实时跟进

运行长耗时检查或多阶段流水线时，进度条固定在输入框上方原地刷新。向上翻看历史消息时，也能随时掌握当前阶段与整体完成度。

| 深色模式（Dark） | 浅色模式（Light） |
| :---: | :---: |
| ![底部常驻的多阶段任务进度栏（深色模式）](assets/screenshots/persistent-dock-pipeline.png) | ![底部常驻的多阶段任务进度栏（浅色模式）](assets/screenshots/persistent-dock-pipeline-light.png) |

## 为什么选择 A2UI

- **纯数据声明，安全流式渲染**：遵循 Google A2UI 1.0 规范，模型只输出结构化 JSON 描述，不注入外部 HTML 或执行未知脚本，支持边生成边上屏。
- **原生组件绘制，自动跟随主题**：界面由 DeepSeek Harness 原生设计体系渲染，自动适配浅色模式、深色模式与社区皮肤。
- **官方接口实现，按需加载更轻快**：基于官方插件接口构建，无任何宿主魔改；首屏核心包仅 16.5 KB（gzip），图表与流程图引擎仅在实际展示时按需加载。

## 组件与图表目录

内置 57 种原生交互组件、19 类动态图表与 Mermaid 流程图：

| 分类 | 组件 | 用途 |
| :--- | :--- | :--- |
| **布局与对象头** | `Card`、`Row`、`Column`、`Grid`、`Tabs`、`Accordion`、`List`、`Modal`、`Divider`、`EntityHeader` | 响应式多行等宽网格、多栏看板、标签页、折叠面板、弹窗详情与 B 端业务对象概览头 |
| **指标、监控与结果** | `Stat`、`MetricRing`、`Tracker`、`KeyValue`（含表格边框模式）、`Steps`、`Timeline`、`Schedule`、`Progress`、`Result` | 指标卡、圆环水位、Tremor 可用性条、带边框描述列表、步骤条、时间线、甘特排期条与操作回执单 |
| **图表、拓扑与矩阵** | `Chart`、`ServiceGraph`、`Mermaid`、`Comparison`、`Matrix`、`Table`（ProTable，支持行内展开详情）、`Tree`、`Kanban` | 19 类图表、实时健康拓扑、方案对比、热力矩阵、支持展开抽屉/导出/多选的 ProTable、通用层级/调用链树与看板 |
| **研发、接口与风控** | `Code`、`Terminal`、`ApiEndpoint`、`ApprovalCard`、`DiffView`、`LogViewer`、`FileTree`、`JsonTree`、`SourceList` | 代码高亮、运维命令卡、API 调试台、高危变更审批门禁、差异对比、日志台、文件树与溯源引用 |
| **表单与对话建议** | `Button`、`NumberInput`、`MultiSelect`、`DateRange`、`TreeSelect`、`CheckCard`、`Segmented`、`Select`、`Switch`、`Slider`、`ChoicePicker`、`TextField`、`CheckBox`、`DateTimeInput` | 步进数字框、多选标签下拉、日期区间快捷选择、级联树选择、选项卡片组/对话追问建议卡、分段、下拉、开关、滑块与校验输入框 |
| **排版与提示** | `Text`、`Callout`、`Badge`、`Icon` | 文本排版、四色提示框、状态标签与语义图标 |
| **多媒体** | `Image`（原生灯箱放大）、`AudioPlayer`、`Video` | 支持点击大图灯箱预览的图片与对话内音视频播放 |

- **19 类动态图表（`Chart`）**：柱状与横向排行图（`bar`）、折线图（`line`）、面积图（`area`）、双轴柱线混合图（`combo`）、增减归因瀑布图（`waterfall`）、饼图与环图（`pie`）、散点与气泡图（`scatter`）、雷达图（`radar`）、平行坐标图（`parallel`）、漏斗图（`funnel`）、仪表盘（`gauge`）、热力图（`heatmap`）、日历热力图（`calendar`）、矩形树图（`treemap`）、可下钻旭日图（`sunburst`）、桑基图（`sankey`）、箱线图（`boxplot`）、关系网络图（`graph`）、K 线图（`candlestick`），并支持 `referenceLine` 阈值参考标线。
- **结构与流程图（`Mermaid`）**：流程图、时序图、状态机图、类图、ER 图、甘特图、Git 分支图与思维导图，支持 `10%–2000%` 矢量无损缩放、指针中心滚轮缩放、按住拖拽漫游、自适应复位、全屏查看与源码切换。

## 文档与许可

- [开发与架构文档（简体中文）](./docs/DEVELOPMENT.zh-CN.md) | [Developer and architecture guide (English)](./docs/DEVELOPMENT.md)
- [贡献指南](./CONTRIBUTING.md) | [行为准则](./CODE_OF_CONDUCT.md) | [安全策略](./SECURITY.md) | [更新日志](./CHANGELOG.md)
- 基于 [MIT License](./LICENSE) 开源，第三方开源依赖声明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
