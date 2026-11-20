/**
 * P1 Real LLM Generation & Self-Repair Eval Suite for `dsh-genui-a2ui`.
 *
 * Provides:
 * 1. 28 realistic natural-language benchmark cases spanning Analytics/BI, Calculators/Forms,
 *    DevOps/SRE/HITL, Update-in-Place constraints, and Negative Markdown-only routing controls.
 * 2. Real Host compiler grading (`SurfaceSessions.compile`) with 8-bucket error taxonomy.
 * 3. Summary aggregation: 0-repair first-pass rate, post-repair rate, routing precision/recall,
 *    component/chart usage heatmap, and P0 Scoped vs. Legacy Monolithic token comparison.
 */

import type { AgentToRendererMessage } from '@a2ui/agent'
import { createGenerator, type SkillDomain, SurfaceSessions } from './generator.ts'
import { SKILL_DOMAINS } from './prompt-compact.ts'

export type EvalCategory = 'analytics' | 'forms' | 'devops' | 'constraints' | 'negative'

export type EvalToolExpectation = 'a2ui_render' | 'a2ui_ask' | 'none'

export interface EvalCase {
  readonly id: string
  readonly title: string
  readonly category: EvalCategory
  readonly prompt: string
  readonly expectedTool: EvalToolExpectation
  readonly expectedPlacement?: 'answer' | 'inline' | 'dock'
  readonly expectedDomain?: SkillDomain
  readonly expectedAnyComponents?: readonly string[]
  readonly expectedAnyChartKinds?: readonly string[]
  readonly forbidComponents?: readonly string[]
  readonly notes?: string
}

export type CompileErrorBucket =
  | 'UNKNOWN_COMPONENT'
  | 'INVALID_PROP_OR_ARG'
  | 'EXPR_IN_DATA_MODEL'
  | 'NESTED_TABLE_CELL'
  | 'SYNTAX_OR_FENCE'
  | 'CALC_SAFETY_OR_SYNTAX'
  | 'LIMIT_EXCEEDED'
  | 'OTHER_VALIDATION'

export interface EvalTurnRecord {
  readonly attempt: number
  readonly toolCalled: EvalToolExpectation
  readonly placement?: string
  readonly ui?: string
  readonly compiledOk: boolean
  readonly errorMessage?: string
  readonly errorBucket?: CompileErrorBucket
  readonly usedComponents: readonly string[]
  readonly usedChartKinds: readonly string[]
}

export interface EvalCaseResult {
  readonly caseId: string
  readonly title: string
  readonly category: EvalCategory
  readonly expectedTool: EvalToolExpectation
  readonly loadedSkills: readonly string[]
  readonly attempts: readonly EvalTurnRecord[]
  readonly routingCorrect: boolean
  readonly firstPassCompiled: boolean
  readonly finalCompiled: boolean
  readonly repaired: boolean
  readonly domainMatch: boolean
  readonly promptTokens: number
  readonly completionTokens: number
  readonly latencyMs: number
  readonly usedComponents: readonly string[]
  readonly usedChartKinds: readonly string[]
}

export interface EvalSummary {
  readonly model: string
  readonly strategy: 'scoped' | 'monolithic'
  readonly mode: 'live' | 'mock'
  readonly timestamp: string
  readonly totalCases: number
  readonly positiveCases: number
  readonly negativeCases: number
  readonly routingAccuracyPct: number
  readonly positiveRecallPct: number
  readonly negativeSpecificityPct: number
  readonly falsePositiveCount: number
  readonly firstPassCompileRatePct: number
  readonly finalCompileRatePct: number
  readonly selfRepairRecoveryPct: number
  readonly domainMatchRatePct: number
  readonly avgPromptTokens: number
  readonly avgCompletionTokens: number
  readonly avgLatencyMs: number
  readonly totalPromptTokens: number
  readonly uniqueComponentsUsed: number
  readonly totalCatalogComponents: number
  readonly componentCounts: Readonly<Record<string, number>>
  readonly chartKindCounts: Readonly<Record<string, number>>
  readonly errorTaxonomy: Readonly<Record<CompileErrorBucket, number>>
  readonly skillLoadCounts: Readonly<Record<string, number>>
  readonly byCategory: Readonly<
    Record<
      EvalCategory,
      {
        readonly total: number
        readonly routingOk: number
        readonly firstPassOk: number
        readonly finalOk: number
      }
    >
  >
  readonly results: readonly EvalCaseResult[]
}

/** 28 benchmark cases covering all 4 skill domains, constraints, and Markdown-only negative controls. */
export const EVAL_BENCHMARK_CASES: readonly EvalCase[] = [
  // --- 1. Analytics & BI (6) ---
  {
    id: 'bi-01-funnel-sankey-radar',
    title: '全链路转化桑基 + 五维雷达大盘',
    category: 'analytics',
    prompt:
      '帮我做一份季度业务增长与全链路转化诊断看板，顶部放四个带趋势微图的核心指标卡，下方同屏放一张四阶桑基流向图和一张五维健康度雷达对比图，再用标签页放区域柱状图和可搜索的渠道明细表。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'analytics',
    expectedAnyComponents: ['Stat', 'Chart', 'Tabs', 'Table'],
    expectedAnyChartKinds: ['sankey', 'radar', 'bar'],
  },
  {
    id: 'bi-02-finops-waterfall-sunburst',
    title: 'FinOps ARR 增减归因瀑布 + 成本旭日图',
    category: 'analytics',
    prompt:
      '生成 2026 Q3 营收增减归因与算力多层成本分摊台，顶部放集群对象头和 4 个核心指标卡，中部并排放带 ¥680w 目标参考线的 ARR 瀑布图和三级算力成本旭日图，底部附可导出汇总的账单表。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'analytics',
    expectedAnyComponents: ['EntityHeader', 'Stat', 'Chart', 'Table'],
    expectedAnyChartKinds: ['waterfall', 'sunburst'],
  },
  {
    id: 'bi-03-combo-slo-calendar',
    title: '双轴混合图 + 滑块 SLO 标线 + 变更日历',
    category: 'analytics',
    prompt:
      '做一个核心网关全天负载与 SLO 诊断看板，顶部放三个圆环水位和可实时拖动调节右轴 SLO 阈值红线的滑块，中部放左轴堆叠流量柱 + 右轴 P99 延迟折线的双轴混合图，下方组合 14 日 SLA 可用性条和生产变更热力日历。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'analytics',
    expectedAnyComponents: ['MetricRing', 'Slider', 'Chart', 'Tracker'],
    expectedAnyChartKinds: ['combo', 'calendar'],
  },
  {
    id: 'bi-04-parallel-model-benchmark',
    title: '五轴平行坐标模型评测 + 方案对比',
    category: 'analytics',
    prompt:
      '用五轴平行坐标图对比 DeepSeek-R1、DeepSeek-V3、Qwen3、Claude-4、Llama-4 在推理得分、首字延迟、吞吐、成本和一次合格率五个维度的表现，下方配选型权衡对比矩阵和基准溯源引用。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'analytics',
    expectedAnyComponents: ['Chart', 'Comparison', 'SourceList'],
    expectedAnyChartKinds: ['parallel'],
  },
  {
    id: 'bi-05-store-area-heatmap',
    title: '连锁门店分时段面积图 + 热力图 + 库存预警表',
    category: 'analytics',
    prompt:
      '模拟连锁咖啡品牌今日实时经营仪表盘，顶部展示营业额、单量、准时率、复购率 4 个指标，下方联动分时段全渠道面积图、门店×时段单量热力图，以及可搜索库存预警表。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'analytics',
    expectedAnyComponents: ['Stat', 'Chart', 'Table'],
    expectedAnyChartKinds: ['area', 'heatmap'],
  },
  {
    id: 'bi-06-market-candlestick-boxplot',
    title: '量化复盘仪表盘 + K 线 + 箱线波动分布',
    category: 'analytics',
    prompt:
      '模拟一份科技指数近 10 个交易日的量化复盘看板，同屏组合情绪仪表盘、日 K 线图以及各细分板块涨跌幅箱线分布图。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'analytics',
    expectedAnyComponents: ['Chart'],
    expectedAnyChartKinds: ['gauge', 'candlestick', 'boxplot'],
  },

  // --- 2. Interactive Calculators & Advanced Forms (5) ---
  {
    id: 'form-01-loan-calc',
    title: '零延迟房贷/算力成本实时测算器',
    category: 'forms',
    prompt:
      '做一个零延迟房贷月供与利息测算器，支持切换等额本息/等额本金，用滑块调节贷款本金（万元）、年限和年化利率，本地 0ms 算出每月月供、累计利息、还款总额，并配本息构成柱状图。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'core',
    expectedAnyComponents: ['ChoicePicker', 'Slider', 'Stat', 'Chart'],
    expectedAnyChartKinds: ['bar'],
  },
  {
    id: 'form-02-gpu-capacity-checkcard',
    title: 'GPU 机型卡片组 + 步进数字框 + 多选可用区 + 级联树',
    category: 'forms',
    prompt:
      '做一个私有化大模型集群容量与规格选型工作台，用选项卡片组切换 GPU 机型档位，用步进数字框调节副本数与单副本并发，多选标签配置容灾可用区，级联树选择目标微服务，并在底部放下一步压测追问建议卡。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'forms',
    expectedAnyComponents: ['CheckCard', 'NumberInput', 'MultiSelect', 'TreeSelect'],
  },
  {
    id: 'form-03-validated-quota-form',
    title: '带 ?check 校验与按钮门控的配额申请表',
    category: 'forms',
    prompt:
      '生成一个自助推理配额申请表单：包含必填且符合正则的服务标识、必填邮箱、范围 200-3000 的峰值 QPS 滑块、必勾确认复选框，并在全部校验通过前禁用提交按钮。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'core',
    expectedAnyComponents: ['TextField', 'Slider', 'CheckBox', 'Button'],
  },
  {
    id: 'form-04-hybrid-search-comparison',
    title: '分段负载切换 + 多维选型对比矩阵 + 溯源引用',
    category: 'forms',
    prompt:
      '对比 PostgreSQL pgvector、Milvus 与 Elasticsearch 三种生产级混合检索方案，顶部用分段控制器切换评估规模，中部展示带推荐标记的多维权衡矩阵，底部附官方文档与压测引用。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'forms',
    expectedAnyComponents: ['Segmented', 'Comparison', 'SourceList'],
  },
  {
    id: 'form-05-api-daterange-rings',
    title: '日期区间选择器 + 圆环水位 + API 契约调试台',
    category: 'forms',
    prompt:
      '生成支付核心网关限流扩容接口的联调面板，顶部放快捷日期区间选择器和三个圆环水位仪表，下方展示带请求/响应 JSON 树与一键复制 cURL 的接口契约卡片。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'devops',
    expectedAnyComponents: ['DateRange', 'MetricRing', 'ApiEndpoint'],
  },

  // --- 3. DevOps, SRE & Human-in-the-Loop (6) ---
  {
    id: 'ops-01-sre-topology-trace-log',
    title: '微服务健康拓扑 + Trace 瀑布树 + 堆栈日志',
    category: 'devops',
    prompt:
      '排查线上支付结算接口 P99 延迟突增，同屏展示含降级旁路与重试环路的微服务实时健康拓扑图、带耗时占比条的分布式调用链瀑布树，以及支持按级别过滤的异常堆栈日志台。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'devops',
    expectedAnyComponents: ['ServiceGraph', 'Tree', 'LogViewer'],
  },
  {
    id: 'ops-02-ddl-approval-terminal-schedule',
    title: '高危变更审批卡 + 终端手册 + 维护窗口甘特条',
    category: 'devops',
    prompt:
      '准备对核心账单表执行历史冷分区在线归档，请生成带二次确认开关的高风险变更审批卡、前置快照校验终端命令卡，以及凌晨维护窗口甘特排期条。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'devops',
    expectedAnyComponents: ['ApprovalCard', 'Terminal', 'Schedule'],
  },
  {
    id: 'ops-03-blocking-diff-ask',
    title: '阻塞式双栏代码差异审批确认单（a2ui_ask）',
    category: 'devops',
    prompt:
      '假设你要把线上网关的灰度权重从 5% 调到 20% 并新增超时熔断参数，请先暂停当前回合弹出交互确认卡片，展示双栏配置差异、生效集群下拉选择和自动回滚开关，等我确认后再继续。',
    expectedTool: 'a2ui_ask',
    expectedDomain: 'devops',
    expectedAnyComponents: ['DiffView', 'Select', 'Switch', 'Button'],
  },
  {
    id: 'ops-04-mermaid-filetree-jsontree',
    title: '分层 Mermaid 架构图 + 文件树 + 配置 JSON 树',
    category: 'devops',
    prompt:
      '梳理当前插件项目的核心模块分层，画一张多层 Mermaid 架构图，并附带工作区关键源码文件树和运行时配置 JSON 检视树。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'devops',
    expectedAnyComponents: ['Mermaid', 'FileTree', 'JsonTree'],
  },
  {
    id: 'ops-05-persistent-dock-pipeline',
    title: '底部常驻多阶段发布流水线进度条（dock）',
    category: 'devops',
    prompt:
      '把一个包含类型检查、分包构建、契约核验、回归测试和打包审计五步的发布流水线进度条固定在输入框上方（dock），展示各阶段状态与整体完成度。',
    expectedTool: 'a2ui_render',
    expectedPlacement: 'dock',
    expectedDomain: 'devops',
    expectedAnyComponents: ['Steps', 'Progress'],
  },
  {
    id: 'ops-06-failover-kanban-timeline-matrix-result',
    title: '容灾演练三泳道看板 + 时间轴 + 热力矩阵 + 回执单',
    category: 'devops',
    prompt:
      '汇总跨可用区容灾演练复盘，同屏组合三泳道任务跟进看板、关键动作时间轴、跨可用区季度延迟热力矩阵，以及最终演练达标回执单。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'analytics',
    expectedAnyComponents: ['Kanban', 'Timeline', 'Matrix', 'Result'],
  },

  // --- 4. Protocol & Grammar Edge Constraints (3) ---
  {
    id: 'edge-01-table-plain-scalar',
    title: 'Table 纯标量单元格约束（禁止嵌套 Badge）',
    category: 'constraints',
    prompt:
      '生成一个包含 6 个微服务的健康巡检表格，带状态列、P99 延迟、错误率与搜索导出功能，注意状态列用清晰图标文本表达即可。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'analytics',
    expectedAnyComponents: ['Table'],
    notes: 'Must not pass nested component IDs/objects inside Table rows.',
  },
  {
    id: 'edge-02-calc-local-variable',
    title: 'calc() 绑定局部变量约束（禁止写入 $/path）',
    category: 'constraints',
    prompt:
      '做一个云主机月费用估算器：用滑块调 vCPU（2–64）和内存 GB（4–256），用公式实时算出单价、折扣后月费和年付节省额并展示在 3 个指标卡中。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'core',
    expectedAnyComponents: ['Slider', 'Stat'],
    notes: 'calc() must be assigned to local vars without $/, never to $/path.',
  },
  {
    id: 'edge-03-accordion-modal-triage',
    title: '故障排查折叠手风琴 + KeyValue + 详情弹窗',
    category: 'constraints',
    prompt:
      '生成线上网关延迟突增的分级排查卡片，用折叠手风琴分层收纳根因摘要、带边框指标键值表与回滚预案，并加一个点击弹出慢查询 SQL 详情的弹窗按钮。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'core',
    expectedAnyComponents: ['Accordion', 'KeyValue', 'Modal', 'Button'],
  },

  // --- 5. Negative Controls — Must Stay in Concise Markdown (5) ---
  {
    id: 'neg-01-concept-qa',
    title: '负例：纯概念解释（不应调 UI）',
    category: 'negative',
    prompt: '简述一下 TCP 三次握手和四次挥手的核心原因是什么？',
    expectedTool: 'none',
  },
  {
    id: 'neg-02-single-fact',
    title: '负例：单值事实查询（不应调 UI）',
    category: 'negative',
    prompt: '2026 年是闰年吗？二月有多少天？',
    expectedTool: 'none',
  },
  {
    id: 'neg-03-translation',
    title: '负例：短文本翻译润色（不应调 UI）',
    category: 'negative',
    prompt:
      '把这句话翻译成地道英文技术文档表述：该插件基于零 Hack 官方扩展接口实现四分包按需懒加载。',
    expectedTool: 'none',
  },
  {
    id: 'neg-04-single-snippet',
    title: '负例：单段代码函数编写（不应调 UI）',
    category: 'negative',
    prompt: '用 TypeScript 写一个带泛型类型推导的防抖函数 debounce。',
    expectedTool: 'none',
  },
  {
    id: 'neg-05-casual-greeting',
    title: '负例：日常闲聊问候（不应调 UI）',
    category: 'negative',
    prompt: '你好，今天帮我一起做代码重构吧。',
    expectedTool: 'none',
  },

  // --- 6. Additional Coverage & Media/Governance (3) ---
  {
    id: 'cov-01-cluster-governance-protable',
    title: '专属集群头 + 20 日 SLA 条 + 边框描述表 + 展开 ProTable',
    category: 'analytics',
    prompt:
      '生成专属推理集群治理台：顶部集群概览头与 20 日 SLA 可用性条，中部带边框描述规格表，底部支持行内展开详情与数值汇总的闲置实例 ProTable。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'analytics',
    expectedAnyComponents: ['EntityHeader', 'Tracker', 'KeyValue', 'Table'],
  },
  {
    id: 'cov-02-horizontal-bar-reference',
    title: '水平排行条形图 + 目标参考线 + 缩放条',
    category: 'analytics',
    prompt:
      '画一张各区域推理集群 GPU 利用率水平排行条形图，带上 80% 扩容警戒竖线和缩放条，同时配一张正负营收/退款堆叠柱状图。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'analytics',
    expectedAnyComponents: ['Chart'],
    expectedAnyChartKinds: ['bar'],
  },
  {
    id: 'cov-03-media-preview-form',
    title: '图文媒体预览 + 多行文本与时间窗表单',
    category: 'forms',
    prompt:
      '生成一个发布公告预览与排期面板，包含发布说明多行输入框、计划发布日期时间选择器、架构预览图和一段告警语音回放条。',
    expectedTool: 'a2ui_render',
    expectedDomain: 'forms',
    expectedAnyComponents: ['TextField', 'DateTimeInput', 'Image', 'AudioPlayer'],
  },
]

/** Classifies a raw `SurfaceSessions.compile()` error string into a structured taxonomy bucket. */
export function classifyCompileError(errorMessage: string): CompileErrorBucket {
  const msg = errorMessage.toLowerCase()
  if (
    msg.includes('cannot store a reactive expression') ||
    (msg.includes('data model') &&
      (msg.includes('expression') || msg.includes('$/path') || msg.includes('@call')))
  ) {
    return 'EXPR_IN_DATA_MODEL'
  }
  if (msg.includes('calc(') || msg.includes('ast') || msg.includes('formula')) {
    return 'CALC_SAFETY_OR_SYNTAX'
  }
  if (msg.includes('table') && (msg.includes('scalar') || msg.includes('nested'))) {
    return 'NESTED_TABLE_CELL'
  }
  if (
    msg.includes('unknown component') ||
    msg.includes('not found in catalog') ||
    msg.includes('not defined in the catalog') ||
    msg.includes('unrecognized component') ||
    /unknown (?:identifier|symbol|type|function)/i.test(errorMessage)
  ) {
    return 'UNKNOWN_COMPONENT'
  }
  if (
    msg.includes('exceeds maximum') ||
    msg.includes('too many') ||
    msg.includes('payload is too large')
  ) {
    return 'LIMIT_EXCEEDED'
  }
  if (
    msg.includes('unexpected token') ||
    msg.includes('syntax') ||
    msg.includes('parse') ||
    msg.includes('unterminated') ||
    msg.includes('expected ')
  ) {
    return 'SYNTAX_OR_FENCE'
  }
  if (
    msg.includes('invalid') ||
    msg.includes('required') ||
    msg.includes('expected type') ||
    msg.includes('unrecognized key') ||
    msg.includes('argument') ||
    msg.includes('enum') ||
    msg.includes('property')
  ) {
    return 'INVALID_PROP_OR_ARG'
  }
  return 'OTHER_VALIDATION'
}

/** Extracts rendered component types and Chart kinds from compiled A2UI wire messages. */
export function extractCompiledArtifacts(messages: readonly AgentToRendererMessage[]): {
  readonly components: readonly string[]
  readonly chartKinds: readonly string[]
} {
  const compSet = new Set<string>()
  const chartSet = new Set<string>()

  const inspectList = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue
      const rec = item as Record<string, unknown>
      if (typeof rec.component === 'string') {
        compSet.add(rec.component)
        if (rec.component === 'Chart' && typeof rec.kind === 'string') {
          chartSet.add(rec.kind)
        }
      }
    }
  }

  for (const msg of messages) {
    const rec = msg as Record<string, unknown>
    if (rec.createSurface && typeof rec.createSurface === 'object') {
      inspectList((rec.createSurface as Record<string, unknown>).components)
    }
    if (rec.updateComponents && typeof rec.updateComponents === 'object') {
      inspectList((rec.updateComponents as Record<string, unknown>).components)
    }
  }

  return {
    components: [...compSet],
    chartKinds: [...chartSet],
  }
}

/** Compiles one candidate UI tool call against the real Host `SurfaceSessions` compiler. */
export function gradeToolAttempt(
  sessions: SurfaceSessions,
  sessionId: string,
  attempt: number,
  toolCalled: EvalToolExpectation,
  ui?: string,
  placement?: string,
): EvalTurnRecord {
  if (toolCalled === 'none' || ui === undefined) {
    return {
      attempt,
      toolCalled,
      placement,
      compiledOk: true,
      usedComponents: [],
      usedChartKinds: [],
    }
  }

  try {
    const messages = sessions.compile(sessionId, ui)
    const { components, chartKinds } = extractCompiledArtifacts(messages)
    return {
      attempt,
      toolCalled,
      placement,
      ui,
      compiledOk: true,
      usedComponents: components,
      usedChartKinds: chartKinds,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return {
      attempt,
      toolCalled,
      placement,
      ui,
      compiledOk: false,
      errorMessage,
      errorBucket: classifyCompileError(errorMessage),
      usedComponents: [],
      usedChartKinds: [],
    }
  }
}

/** Finalizes grading for a single benchmark case across its 1..3 attempts. */
export function finalizeCaseResult(
  testCase: EvalCase,
  attempts: readonly EvalTurnRecord[],
  loadedSkills: readonly string[],
  metrics: {
    readonly promptTokens: number
    readonly completionTokens: number
    readonly latencyMs: number
  },
): EvalCaseResult {
  const first = attempts[0]
  const last = attempts[attempts.length - 1]
  const actualTool = last?.toolCalled ?? 'none'

  let routingCorrect = actualTool === testCase.expectedTool
  if (routingCorrect && testCase.expectedPlacement !== undefined && actualTool === 'a2ui_render') {
    routingCorrect = (last?.placement ?? 'answer') === testCase.expectedPlacement
  }

  const firstPassCompiled =
    testCase.expectedTool === 'none'
      ? actualTool === 'none'
      : Boolean(first && first.toolCalled === testCase.expectedTool && first.compiledOk)

  const finalCompiled =
    testCase.expectedTool === 'none'
      ? actualTool === 'none'
      : Boolean(last && last.toolCalled === testCase.expectedTool && last.compiledOk)

  const repaired = !firstPassCompiled && finalCompiled
  const usedComponents = last?.usedComponents ?? []
  const usedChartKinds = last?.usedChartKinds ?? []

  let domainMatch = true
  if (testCase.expectedTool !== 'none') {
    if (testCase.expectedAnyComponents && testCase.expectedAnyComponents.length > 0) {
      domainMatch = testCase.expectedAnyComponents.some((c) => usedComponents.includes(c))
    }
    if (
      domainMatch &&
      testCase.expectedAnyChartKinds &&
      testCase.expectedAnyChartKinds.length > 0
    ) {
      domainMatch = testCase.expectedAnyChartKinds.some((k) => usedChartKinds.includes(k))
    }
    if (domainMatch && testCase.forbidComponents) {
      domainMatch = !testCase.forbidComponents.some((c) => usedComponents.includes(c))
    }
  }

  return {
    caseId: testCase.id,
    title: testCase.title,
    category: testCase.category,
    expectedTool: testCase.expectedTool,
    loadedSkills,
    attempts,
    routingCorrect,
    firstPassCompiled,
    finalCompiled,
    repaired,
    domainMatch,
    promptTokens: metrics.promptTokens,
    completionTokens: metrics.completionTokens,
    latencyMs: metrics.latencyMs,
    usedComponents,
    usedChartKinds,
  }
}

/** Aggregates all per-case Eval results into headline KPIs, component heatmaps, and error taxonomy. */
export function aggregateEvalSummary(
  results: readonly EvalCaseResult[],
  meta: {
    readonly model: string
    readonly strategy: 'scoped' | 'monolithic'
    readonly mode: 'live' | 'mock'
    readonly timestamp?: string
  },
): EvalSummary {
  const positive = results.filter((r) => r.expectedTool !== 'none')
  const negative = results.filter((r) => r.expectedTool === 'none')

  const routingOk = results.filter((r) => r.routingCorrect).length
  const posRecallOk = positive.filter((r) => r.routingCorrect).length
  const negSpecOk = negative.filter((r) => r.routingCorrect).length
  const falsePositiveCount = negative.length - negSpecOk

  const firstPassOk = positive.filter((r) => r.firstPassCompiled).length
  const finalOk = positive.filter((r) => r.finalCompiled).length
  const failedFirst = positive.length - firstPassOk
  const recovered = positive.filter((r) => r.repaired).length
  const domainMatched = positive.filter((r) => r.finalCompiled && r.domainMatch).length

  const totalPromptTokens = results.reduce((s, r) => s + r.promptTokens, 0)
  const totalCompletionTokens = results.reduce((s, r) => s + r.completionTokens, 0)
  const totalLatencyMs = results.reduce((s, r) => s + r.latencyMs, 0)

  const componentCounts: Record<string, number> = {}
  const chartKindCounts: Record<string, number> = {}
  const skillLoadCounts: Record<string, number> = {}
  const errorTaxonomy: Record<CompileErrorBucket, number> = {
    UNKNOWN_COMPONENT: 0,
    INVALID_PROP_OR_ARG: 0,
    EXPR_IN_DATA_MODEL: 0,
    NESTED_TABLE_CELL: 0,
    SYNTAX_OR_FENCE: 0,
    CALC_SAFETY_OR_SYNTAX: 0,
    LIMIT_EXCEEDED: 0,
    OTHER_VALIDATION: 0,
  }

  const byCategory: Record<
    EvalCategory,
    { total: number; routingOk: number; firstPassOk: number; finalOk: number }
  > = {
    analytics: { total: 0, routingOk: 0, firstPassOk: 0, finalOk: 0 },
    forms: { total: 0, routingOk: 0, firstPassOk: 0, finalOk: 0 },
    devops: { total: 0, routingOk: 0, firstPassOk: 0, finalOk: 0 },
    constraints: { total: 0, routingOk: 0, firstPassOk: 0, finalOk: 0 },
    negative: { total: 0, routingOk: 0, firstPassOk: 0, finalOk: 0 },
  }

  for (const r of results) {
    const cat = byCategory[r.category]
    cat.total += 1
    if (r.routingCorrect) cat.routingOk += 1
    if (r.firstPassCompiled) cat.firstPassOk += 1
    if (r.finalCompiled) cat.finalOk += 1

    for (const c of r.usedComponents) {
      componentCounts[c] = (componentCounts[c] ?? 0) + 1
    }
    for (const k of r.usedChartKinds) {
      chartKindCounts[k] = (chartKindCounts[k] ?? 0) + 1
    }
    for (const sk of r.loadedSkills) {
      skillLoadCounts[sk] = (skillLoadCounts[sk] ?? 0) + 1
    }
    for (const att of r.attempts) {
      if (!att.compiledOk && att.errorBucket) {
        errorTaxonomy[att.errorBucket] += 1
      }
    }
  }

  const pct = (num: number, den: number) => (den === 0 ? 100 : Math.round((num / den) * 1000) / 10)
  const totalCatalogComponents = Object.values(SKILL_DOMAINS).reduce((s, a) => s + a.length, 0)

  return {
    model: meta.model,
    strategy: meta.strategy,
    mode: meta.mode,
    timestamp: meta.timestamp ?? new Date().toISOString(),
    totalCases: results.length,
    positiveCases: positive.length,
    negativeCases: negative.length,
    routingAccuracyPct: pct(routingOk, results.length),
    positiveRecallPct: pct(posRecallOk, positive.length),
    negativeSpecificityPct: pct(negSpecOk, negative.length),
    falsePositiveCount,
    firstPassCompileRatePct: pct(firstPassOk, positive.length),
    finalCompileRatePct: pct(finalOk, positive.length),
    selfRepairRecoveryPct: failedFirst === 0 ? 100 : pct(recovered, failedFirst),
    domainMatchRatePct: pct(domainMatched, positive.length),
    avgPromptTokens: results.length > 0 ? Math.round(totalPromptTokens / results.length) : 0,
    avgCompletionTokens:
      results.length > 0 ? Math.round(totalCompletionTokens / results.length) : 0,
    avgLatencyMs: results.length > 0 ? Math.round(totalLatencyMs / results.length) : 0,
    totalPromptTokens,
    uniqueComponentsUsed: Object.keys(componentCounts).length,
    totalCatalogComponents,
    componentCounts,
    chartKindCounts,
    errorTaxonomy,
    skillLoadCounts,
    byCategory,
    results,
  }
}

/** Creates an isolated compiler session for running eval turns without mutating global state. */
export function createEvalSession(): SurfaceSessions {
  return new SurfaceSessions(createGenerator(), true)
}
