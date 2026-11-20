/**
 * dsh-genui-a2ui host half.
 *
 * - registers the `tool:a2ui` system-prompt section (answer-topology trigger rule
 *   + 1-step Fast-Path Express micro-grammar; emits 0 tokens when A2UI is OFF);
 * - registers the `a2ui` skill dynamically (full 57-component Express grammar, form
 *   inputs, validation checks, and reactive functions; unregistered when A2UI is OFF);
 * - registers the `a2ui_render` tool (`answer` | `inline` | `dock` placements);
 * - registers the `a2ui_ask` blocking interactive question/form tool;
 * - registers `/a2ui` (`on` | `off` | `status` | toggle switch) and `/a2ui-answer`
 *   (in-turn settlement RPC for `a2ui_ask`, `recordInput: false`).
 * @module dsh-genui-a2ui
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { createAskTool, PendingAskRegistry } from './host/ask-tool.ts'
import { createGenerator, RENDER_TOOL, SurfaceSessions } from './host/generator.ts'
import { createRenderTool, isSubagentCall, sessionIdOf, type ToolExec } from './host/render-tool.ts'
import { ANSWER_COMMAND, TIER_COMMAND } from './shared/catalog-schema.ts'
import { HOST_MESSAGES, resolveHostLocale } from './shared/i18n.ts'
import type { AskAnswerInput } from './shared/wire-types.ts'

export { ANSWER_COMMAND, TIER_COMMAND }

export const name = 'dsh-genui-a2ui'
export const inject: string[] = []

export interface Config {
  readonly defaultEnabled?: boolean | undefined
  /** Optional JSON file path to persist `/a2ui on|off` across Host restarts (`null` disables). */
  readonly stateFile?: string | null | undefined
}

export const Config = z
  .object({
    defaultEnabled: z
      .boolean()
      .optional()
      .describe('Enable A2UI generative surfaces by default in new sessions'),
    stateFile: z
      .string()
      .nullable()
      .optional()
      .describe(
        'Optional JSON file path to persist /a2ui on|off across Host restarts (null disables)',
      ),
  })
  .default({})

function resolveDefaultStateFile(explicit: string | null | undefined): string | null {
  if (explicit === null) return null
  if (typeof explicit === 'string' && explicit.trim() !== '') return explicit
  if (process.env.VITEST) return null
  try {
    const dshDir = join(homedir(), '.dsh')
    return existsSync(dshDir) ? join(dshDir, 'dsh-genui-a2ui-state.json') : null
  } catch {
    return null
  }
}

export function readPersistedEnabled(stateFile: string | null): boolean | undefined {
  if (!stateFile) return undefined
  try {
    let target = stateFile
    if (!existsSync(target) && target.endsWith('dsh-genui-a2ui-state.json')) {
      const legacy = join(dirname(target), 'dsh-a2ui-state.json')
      if (existsSync(legacy)) target = legacy
    }
    if (!existsSync(target)) return undefined
    const parsed = JSON.parse(readFileSync(target, 'utf8')) as { defaultEnabled?: unknown }
    return typeof parsed?.defaultEnabled === 'boolean' ? parsed.defaultEnabled : undefined
  } catch {
    return undefined
  }
}

export function writePersistedEnabled(stateFile: string | null, enabled: boolean): void {
  if (!stateFile) return
  try {
    mkdirSync(dirname(stateFile), { recursive: true })
    writeFileSync(
      stateFile,
      JSON.stringify({ defaultEnabled: enabled, updatedAt: new Date().toISOString() }, null, 2),
      'utf8',
    )
  } catch {
    // Ignore read-only filesystem errors gracefully
  }
}

interface ToolsService {
  register(
    definition: unknown,
    options?: { when?: (ctx: { agent?: ToolExec['agent'] }) => boolean },
  ): () => void
  get?(name: string, scope?: unknown, toolSet?: unknown): unknown
}
interface PromptAssembleContext {
  readonly scope?: unknown
  readonly toolSet?: unknown
}
interface SystemPromptService {
  section(definition: {
    readonly name: string
    readonly order: number
    readonly interpolate?: boolean
    readonly text: string | ((context: PromptAssembleContext) => string)
  }): () => void
}
interface SkillLookupContext {
  readonly cwd?: string | undefined
  readonly signal?: AbortSignal | undefined
  readonly scope?: unknown
}
interface SkillInvocationPolicy {
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
}
interface SkillCandidate {
  readonly name: string
  readonly description: string
  readonly invocation: SkillInvocationPolicy
  readonly source: 'bundled'
  readonly provider: string
  readonly rank: number
  readonly locator: string
}
interface SkillDefinition {
  readonly name: string
  readonly description: string
  readonly invocation: SkillInvocationPolicy
  readonly source: 'bundled'
  readonly provider: string
  readonly content: string
}
interface SkillProviderControl {
  readonly signal: AbortSignal
  readonly invalidate: () => void
}
interface SkillProvider {
  readonly name: string
  readonly list: (options: SkillLookupContext) => Promise<readonly SkillCandidate[]>
  readonly get: (
    candidate: SkillCandidate,
    options: SkillLookupContext,
  ) => Promise<SkillDefinition | undefined>
}
interface SkillsService {
  registerProvider?(create: (control: SkillProviderControl) => SkillProvider): () => void
  register(skill: {
    readonly name: string
    readonly description: string
    readonly content: string
    readonly source: 'bundled'
  }): () => void
}
interface CommandInvocation {
  readonly agent?: ToolExec['agent']
  readonly rawInput: string
}
interface CommandResult {
  readonly kind: 'success' | 'error'
  readonly text?: string
}
interface CommandsService {
  register(definition: {
    readonly name: string
    readonly description: string
    readonly input?: { readonly hint: string; readonly attachments?: boolean }
    readonly recordInput?: boolean
    readonly handler: (invocation: CommandInvocation) => CommandResult | Promise<CommandResult>
  }): () => void
}

export const SYSTEM_PROMPT_SECTION_NAME = 'tool:a2ui'
/** Placed right after `DELIVERABLE_FILE_REFERENCES` (9000) to preserve built-in KV-cache prefix. */
export const SYSTEM_PROMPT_SECTION_ORDER = 9200

export const SKILL_NAME = 'a2ui'
export const SKILL_DESCRIPTION =
  'Full 57-component A2UI 1.0 Express reference: forms (NumberInput, MultiSelect, DateRange, TreeSelect, CheckCard, Segmented, Select, Switch, Slider, TextField), calc(), 19-kind Chart, ProTable, Grid, Tree, Tracker, ServiceGraph, Comparison, Matrix, Terminal, ApprovalCard, ApiEndpoint, Schedule, Result (only load when a2ui_render or a2ui_ask is available).'

export const FAST_PATH_EXAMPLE = [
  'surface("overview")',
  '$/series = [{ stage: "P1", high: 18, low: 6 }, { stage: "P2", high: 12, low: 1 }, { stage: "P3", high: 5, low: -4 }]',
  'kpis = Row([Stat("区间峰值", "18", delta="+6", trend="up", caption="阶段一", weight=1), Stat("区间均值", "8.2", trend="neutral", caption="全周期", weight=1), Stat("关键阈值", "-4", trend="down", caption="阶段三", weight=1)])',
  'specs = KeyValue({ "统计口径": "常年基准均值", "关键节点": "P2 切换期" }, columns=2)',
  'root = Card(Column([kpis, Chart("line", $/series, title="分段走势对比", xField="stage", yField=["high", "low"], height=220), specs, Callout("口径说明与关键提示", "未接入实时数据源时仅展示统计基准参考，请结合最新实况判断。", tone="info")]))',
].join('\n')

export const A2UI_SYSTEM_GUIDANCE = [
  '# Structured Visual Presentation (`a2ui_render` & `a2ui_ask`)',
  '',
  'Decide whether to render UI by the **information topology of your answer**, NOT by whether the user typed UI words ("chart", "table", "dashboard"):',
  '- **Proactively call `a2ui_render`** (even on short 3–6 word queries) whenever your deliverable involves ANY of:',
  '  1. **>=3 parallel metrics, multi-row KPI grids, SLO rings, SLA strips, or entity summaries** -> `Grid(children, columns?=3)`, `Row([Stat(..., spark?), ...])`, `Row([MetricRing(..., weight=1), ...])`, `Tracker(...)`, `EntityHeader(...)`, and/or `KeyValue(..., bordered?=true)`',
  '  2. **Series, trends, bridges, dual-axis combos, hierarchies, multi-axis benchmarks, calendars, matrices, flows, distributions, or shares** -> `Chart("line" | "bar" | "area" | "pie" | "scatter" | "radar" | "funnel" | "gauge" | "heatmap" | "treemap" | "sankey" | "boxplot" | "graph" | "candlestick" | "waterfall" | "combo" | "sunburst" | "parallel" | "calendar", ...)`',
  '  3. **Multi-option trade-offs, cohort/RBAC matrices, task boards, citations, org/trace hierarchies, or >=4-row ProTables** -> `Comparison(...)`, `Matrix(...)`, `Table(..., exportable?=true, selectable?=false, expandKey?=...)`, `Tree(...)`, `Kanban(...)`, `SourceList(...)`, `Tabs(...)`, or `Accordion(...)`',
  '  4. **Service topologies, API contracts, terminals, schedules, incidents/logs, risk gates, follow-up prompts, or diffs** -> `ServiceGraph(...)`, `ApiEndpoint(...)`, `Terminal(...)`, `Schedule(...)`, `Mermaid(...)`, `LogViewer(...)`, `Timeline(...)`, `ApprovalCard(...)`, `Result(...)`, `CheckCard(..., action=...)`, `Steps(...)`, `DiffView(..., filePath?, line?)`, `JsonTree(...)`, `FileTree(...)`, `Callout(...)`',
  '  5. **Interactive calculators, estimators, simulators, or what-if configurators** ("做一个…测算器 / 计算器 / 模拟器 / 预算器") -> `NumberInput(...)` / `MultiSelect(...)` / `DateRange(...)` / `TreeSelect(...)` / `CheckCard(...)` / `Segmented(...)` / `Select(...)` / `Switch(...)` / `Slider(...)` / `ChoicePicker(...)` + 0-latency reactive math + `Stat(...)` / `MetricRing(...)` / `Progress(...)` / `KeyValue(...)` / `Chart(...)`',
  '  - Use `placement="dock"` to pin a live multi-step tracker above the input across turns (refresh in place via `surface("id", update=true)`).',
  '- **In-chat modality first**: Unless the user explicitly asks to create, save, or export a standalone `.html` file or web project on disk, **always** render calculators, simulators, dashboards, and visual cards directly in chat via `a2ui_render` — never pivot to writing single-file HTML pages or running headless browser screenshots.',
  '- **Stay in concise Markdown (do NOT call `a2ui_render`)** for: single-fact lookups (one number/date/yes-no), pure conceptual/mechanism explanations ("why/how X works"), casual chat, prose writing/translation, or single-snippet code edits.',
  "- **After `a2ui_render` succeeds**: keep your Markdown reply to a brief 1–3 sentence takeaway; never restate the card's numbers or table rows in prose.",
  '- **Honesty & provenance**: without live tool/web data, present only established reference averages or illustrative figures and state the basis visibly inside the UI (e.g. `caption` or `Callout`); never fabricate live readings or claim unperformed actions.',
  '',
  '## Fast-Path A2UI Express Micro-Grammar (1-step `a2ui_render` — no skill load needed for cards or calculators)',
  'Pass raw A2UI Express in `ui` (NO `<a2ui>` tags, NO markdown fences). Start with `surface("snake_id")` (`surface("snake_id", update=true)` to update in place) and assign one entry component to `root`:',
  '- **State vs Reactive Formulas**: store mutable literal state in `$/paths` (`$/wan = 100`, `$/mode = "benxi"`, `$/auto = true`); assign reusable reactive formulas to **local variables WITHOUT `$/`** (`v = { w: $/wan, y: $/years, r: $/rate }`, `pmt = calc("pmt(r/1200, y*12, w*10000)", v, decimals=2)`) — NEVER assign `fn(...)` to a `$/path`. Local reactive expressions update `Stat`, `MetricRing`, `Progress`, `KeyValue` maps/arrays, and `Chart` data arrays (`[{ k: "本金", v: $/wan }, { k: "利息", v: interestWan }]`) live at 0ms!',
  '- Layout: `Card(child)` | `Column([c1, c2, ...])` | `Row([c1, c2, ...], justify?="spaceBetween"|"start"|"end"|"center", align?="stretch"|"center"|"start"|"end")` | `Grid([c1, c2, ...], columns?=3, gap?="sm"|"md"|"lg")` | `Tabs([{ title: "Tab", child: c1 }, ...])` | `Accordion([{ title: "分组", subtitle?, badge?, open?=false, child: c1 }, ...], multiple?=false)` | `Divider()` — pass `weight=1` on equal-width peer cards/controls inside `Row([Stat(..., weight=1), ...])`; set `weight` ONLY on direct children of `Row` or `Column`.',
  '- Controls: `NumberInput(label, $/num, min?, max?, step?=1, unit?, prefix?)` | `MultiSelect(label, options=[{ value, label, description? }, ...], value=$/strList, placeholder?, searchable?=true, allowCreate?=false)` | `DateRange(label, start=$/start, end=$/end, presets?=true, enableTime?=false)` | `TreeSelect(label, nodes=[{ label, value?, children? }, ...], value=$/str, placeholder?, searchable?=true)` | `CheckCard(label, options=[{ value, title, description?, badge?, recommended? }, ...], value?=$/val, multiple?=false, columns?=3, action?)` | `Segmented(label, options, value=$/str)` | `Select(label, options, value=$/str, placeholder?, searchable?=false)` | `Switch(label, $/bool, description?)` | `Slider(label, min, max, $/val, steps?)` (`min`/`max`/`steps` static numbers; `steps` = `(max - min) / stepSize`) | `ChoicePicker(label="...", options, value=$/selectedList, variant="mutuallyExclusive"|"multipleSelection", displayStyle="chips"|"checkbox")`',
  '- Text, Metrics, Entities & Trees: `Text(text, variant?="body"|"caption"|"h1".."h5")` | `Badge(label, tone?="neutral"|"info"|"success"|"warning"|"danger")` | `EntityHeader(title, subtitle?, avatarText?, status?="healthy"|"ongoing"|"warning"|"error"|"offline", statusLabel?, badge?, tags?, metrics?, actionLabel?, action?)` | `Stat(label, value, delta?, trend?="up"|"down"|"neutral", caption?, spark?)` | `MetricRing(label, value, max?=100, unit?, sublabel?, tone?="brand"|"success"|"warning"|"danger"|"auto", size?=88)` | `Tracker(data, title?, summary?, mode?="uptime"|"category")` (`uptime`: `[{ label, status?: "ok"|"warning"|"error", note? }]`; `category`: `[{ label, value, tone? }]`) | `KeyValue(items, title?, columns?=2, copyable?=false, bordered?=false)` | `Tree(nodes, title?, summary?, searchable?=false, expandedDepth?=3, action?)` | `SourceList(items, title?, action?)` | `JsonTree(data, title?, expandedDepth?=2, copyable?=true)` | `FileTree(items, title?, expandedDepth?=2, action?)`',
  '- Charts, Topologies, Enterprise Ops & ProTables: `Chart(kind, data, title?, xField?, yField?, y2Field?, seriesField?, sizeField?, referenceLine?, referenceLabel?, stacked?=false, horizontal?=false, zoom?=false, height?=240, action?)` | `ServiceGraph(nodes, edges?, title?, direction?="LR"|"TB", action?)` | `Mermaid(code, title?, caption?)` | `Comparison(options, rows, title?, action?)` | `Matrix(rows, columns, values, title?, cornerLabel?, unit?, colorScale?="brand"|"success"|"warning"|"auto", showTotals?=false)` | `Table(rows, columns?, title?, searchable?=false, pageSize?=10, exportable?=false, selectable?=false, batchLabel?, showSummary?=false, expandKey?, action?)` (plain scalar cells only — NEVER nest `Badge`/`Button` inside `rows`) | `Kanban(columns, title?, action?)` | `Schedule(items, title?, range?, now?, action?)` (`items`: `[{ title, start: "00:00", end: "02:30", progress?: 80, status?: "done"|"active"|"warning"|"pending", owner? }]`) | `Terminal(commands, title?, cwd?, shell?="zsh")` (`commands`: `[{ cmd, output?, stderr?, exitCode? }]`) | `ApiEndpoint(method, path, summary?, status?, latency?, baseUrl?, params?, headers?, requestBody?, responseBody?, action?)` | `ApprovalCard(title, summary?, severity?="high", scope?, impacts?, confirmLabel?, approveLabel?, rejectLabel?, approveAction?, rejectAction?)` | `Result(status="success"|"info"|"warning"|"error"|"empty", title, subtitle?, meta?, actionLabel?, action?, child?)` | `LogViewer(entries, title?, searchable?=true, defaultLevel?="all", maxHeight?=320, action?)` | `Timeline([{ time?, title, description?, actor?, status?, tag?, detail?, child? }, ...], title?, badge?)` | `Steps(items, current?, direction?="vertical"|"horizontal", title?)` | `DiffView(before, after, title?, language?, mode?="unified"|"split", filePath?, line?)` | `Callout(title, message?, tone?="info"|"success"|"warning"|"danger", collapsible?=false, child?)` | `Progress(value, max?=100, label?, tone?="brand"|"success"|"warning"|"danger")` | `Code(code, language?="text", lineNumbers?=false, title?, filePath?, line?)`',
  '- **0-Latency Formula & UI Branching** (Thin UI, Thick Agent: keep client reactivity strictly to closed-form scalar/fixed-item math; delegate multi-row schedules or external simulations to Agent actions via `Event(...)` + `surface("id", update=true)`):',
  '  - Formula Gateway (statically validated): `calc("w * 10000 * (r/1200) * (1 + r/1200)^(y*12) / ((1 + r/1200)^(y*12) - 1)", { w: $/wan, y: $/years, r: $/rate }, decimals=2)` — supports `+ - * / ^ % ( ) ? : == != < <= > >= && ||` plus `pow, sqrt, exp, log, ln, log10, abs, min, max, clamp, round, floor, ceil, pmt(ratePerPeriod, nper, pv)`.',
  '  - Branching, Aggregates & Formatting: `cond(condExpr, truthy, falsy)`, `eq(a, b)` (matches both scalar `$/str` and `ChoicePicker` `["x"]`), `gt(a, b)`, `lt(a, b)`, `includes(items, val)`, `not(b)`, `and([b1, b2])`, `or([b1, b2])`, `sum(items, field?)`, `avg(items, field?)`, `formatNumber(v, decimals?, grouping?)`, `formatCurrency(v, currency, decimals?, grouping?)`',
  '- Example:',
  '```',
  FAST_PATH_EXAMPLE,
  '```',
  '- **Full Grammar (`skill("a2ui")`)**: load `skill("a2ui")` when using `TextField`, `CheckBox`, `DateTimeInput`, `Modal`, `Button(..., action=Event(...))`, validation checks (`?required`, `?regex`), `copyText`/`openUrl`, or `a2ui_ask` blocking wizards.',
].join('\n')

export const GOLDEN_DASHBOARD_EXAMPLE = [
  'surface("overview")',
  '$/rows = [{ mod: "core", kb: 480, pass: 100 }, { mod: "chart", kb: 620, pass: 98.5 }]',
  'kpis = Row([Stat("总包体 (KB)", formatNumber(value=sum(items=$/rows, field="kb")), weight=1), Stat("均值通过率", formatNumber(value=avg(items=$/rows, field="pass")), weight=1)])',
  'tabs = Tabs([{ title: "体积分布", child: Chart("bar", $/rows, xField="mod", yField="kb", height=220) }, { title: "明细表", child: Table($/rows, searchable=true) }])',
  'root = Card(Column([kpis, tabs]))',
].join('\n')

export const GOLDEN_CALCULATOR_EXAMPLE = [
  'surface("loan_calc")',
  '$/wan = 100',
  '$/years = 30',
  '$/rate = 3.85',
  '$/mode = ["benxi"]',
  'v = { w: $/wan, y: $/years, r: $/rate }',
  'pmtBenxi = calc("w * 10000 * (r/1200) * (1 + r/1200)^(y*12) / ((1 + r/1200)^(y*12) - 1)", v, decimals=2)',
  'pmtBenjinFirst = calc("w * 10000 / (y * 12) + w * 10000 * (r / 1200)", v, decimals=2)',
  'monthly = cond(eq($/mode, "benxi"), pmtBenxi, pmtBenjinFirst)',
  'interestWan = cond(eq($/mode, "benxi"), calc("(pmt(r/1200, y*12, w*10000) * y * 12 - w * 10000) / 10000", v, decimals=2), calc("w * (r / 1200) * (y * 12 + 1) / 2", v, decimals=2))',
  'totalWan = calc("w + i", { w: $/wan, i: interestWan }, decimals=2)',
  'breakdown = [{ item: "贷款本金", wan: $/wan }, { item: "累计利息", wan: interestWan }]',
  'root = Card(Column([',
  '  ChoicePicker(label="还款方式", options=[{ value: "benxi", label: "等额本息" }, { value: "benjin", label: "等额本金" }], value=$/mode, variant="mutuallyExclusive", displayStyle="chips"),',
  '  Slider("贷款本金（万元）", 20, 500, $/wan, steps=96),',
  '  Slider("贷款年限（年）", 5, 30, $/years, steps=25),',
  '  Slider("年化利率（%）", 2.5, 5.5, $/rate, steps=60),',
  '  Row([Stat(cond(eq($/mode, "benxi"), "每月月供", "首月月供"), formatCurrency(monthly, "CNY", 2), weight=1), Stat("累计利息（万）", interestWan, weight=1), Stat("还款总额（万）", totalWan, weight=1)]),',
  '  Chart("bar", breakdown, title="本息构成（万元）", xField="item", yField="wan", height=180)',
  ']))',
].join('\n')

export const GOLDEN_ASK_EXAMPLE = [
  'surface("confirm_change")',
  '$/before = "replicas: 2\\nstrategy: RollingUpdate"',
  '$/after = "replicas: 4\\nstrategy: Canary"',
  '$/autoRollback = true',
  'root = Card(Column([',
  '  Callout("即将更新部署配置，请确认差异与回滚策略", tone="warning"),',
  '  DiffView($/before, $/after, title="deployment.yaml", language="yaml"),',
  '  CheckBox("健康检查失败时自动回滚", $/autoRollback),',
  '  Row([Button(Text("确认并继续"), variant="primary", action=Event("apply_deploy", { autoRollback: $/autoRollback }))], justify="end")',
  ']))',
].join('\n')

export const GOLDEN_VALIDATED_FORM_EXAMPLE = [
  'surface("quota_apply")',
  '$/service = ""',
  '$/ownerEmail = ""',
  '$/qps = 500',
  '$/agreed = false',
  'root = Card(Column([',
  '  TextField("服务标识", $/service, placeholder="例如 order-gateway", ?required("请输入服务标识"), ?regex("^[a-z0-9-]{3,32}$", "仅限 3-32 位小写字母、数字或连字符")),',
  '  TextField("负责人邮箱", $/ownerEmail, placeholder="name@example.com", ?required("请输入负责人邮箱"), ?email("邮箱格式不正确")),',
  '  Slider("申请峰值 QPS", 100, 5000, $/qps, steps=49, ?numeric(200, 3000, "自助审批范围为 200–3000 QPS")),',
  '  CheckBox("我已完成压测并确认回滚预案", $/agreed, ?required("提交前请勾选确认项")),',
  '  Row([Button(Text("提交配额申请"), variant="primary", action=Event("submit_quota", { service: $/service, ownerEmail: $/ownerEmail, qps: $/qps }), ?required($/service, "请填写服务标识"), ?regex($/service, "^[a-z0-9-]{3,32}$", "服务标识格式有误"), ?email($/ownerEmail, "请填写有效邮箱"), ?numeric($/qps, 200, 3000, "QPS 超出自助审批范围"), ?required($/agreed, "请勾选确认项"))], justify="end")',
  ']))',
].join('\n')

/** Guidance prepended to the generated grammar. */
export const SKILL_PREAMBLE = `# Interactive UI with A2UI (Full Grammar & Interactive Controls)

Trigger by **answer & deliverable topology**, even when the user asks a brief question without mentioning UI:
- \`a2ui_render\` (\`placement="answer"\`, default): >=3 parallel metrics/grids/SLO rings/SLA strips (\`Grid\`, \`Stat\`, \`MetricRing\`, \`Tracker\`, \`EntityHeader\`, \`KeyValue\`), 19-kind series/bridges/combos/hierarchies/calendars/matrices/flows/distributions (\`Chart\`), live service/module topologies (\`ServiceGraph\`), architecture/sequence/state diagrams (\`Mermaid\`), >=3-item trade-offs, cohort/RBAC matrices, or >=4-row ProTables (\`Comparison\`, \`Matrix\`, \`Table\`, \`Tabs\`, \`Accordion\`), org/trace hierarchies (\`Tree\`), sprint/triage boards (\`Kanban\`), numbered citations/evidence (\`SourceList\`), diagnostic logs, terminals, API workbenches, Gantt schedules & incident timelines (\`LogViewer\`, \`Terminal\`, \`ApiEndpoint\`, \`Schedule\`, \`Timeline\`), risk gates & outcome receipts (\`ApprovalCard\`, \`Result\`), interactive calculators/simulators (\`NumberInput\`, \`MultiSelect\`, \`DateRange\`, \`TreeSelect\`, \`CheckCard\`, \`Segmented\`, \`Select\`, \`Switch\`, \`Slider\`, \`ChoicePicker\` + reactive math), code/config change reviews (\`DiffView\`, \`FileTree\`), JSON payload inspection (\`JsonTree\`), multi-stage plans/routes (\`Steps\`), or highlighted advisories (\`Callout\`).
- \`a2ui_render\` (\`placement="dock"\`): persistent live progress/status bar above the chat input across multi-step work (\`Steps\`, \`Progress\`, \`Stat\`, \`MetricRing\`); refresh later in place with \`surface("id", update=true)\`.
- \`a2ui_render\` (\`placement="inline"\`): compact step-specific visuals strictly inside the tool call row.
- \`a2ui_ask\`: composite in-turn form/review wizard (\`NumberInput\`, \`MultiSelect\`, \`DateRange\`, \`TreeSelect\`, \`CheckCard\`, \`Segmented\`, \`Select\`, \`Switch\`, \`Slider\`, \`ChoicePicker\`, \`CheckBox\`, \`TextField\`, \`DateTimeInput\`, \`Comparison\`, \`ApprovalCard\`, or \`DiffView\`/\`Callout\` approval with \`Button(..., action=Event(...))\`) when you MUST pause the current turn for structured user input. For a single simple 2-option text question, prefer the lightweight built-in \`ask_user_question\` tool instead.

Modality & safety rules:
- **Availability guard (\`/a2ui off\`)**: If \`a2ui_render\` and \`a2ui_ask\` are absent from your current tool declarations, A2UI is disabled for this turn — reply directly in concise Markdown and NEVER run shell commands, inspect processes/bundles, or query plugin settings to investigate why the tools are unavailable.
- Unless the user explicitly asks to create or export a standalone \`.html\` file or web project on disk, always deliver calculators, simulators, and dashboards directly inside chat via \`a2ui_render\` — never escape to single-file HTML pages or headless browser screenshots.
- Store mutable literal inputs in \`$/paths\` and assign reactive formulas to local variables WITHOUT \`$/\` (\`pmt = calc("pmt(r/1200, y*12, p)", { p: $/p, r: $/r, y: $/y }, decimals=2)\`); never assign \`fn(...)\` to a \`$/path\`.
- **\`Table\` cells are plain scalar text only**: \`Table\` cells render strings, numbers, and booleans — NEVER pass nested A2UI components (\`Badge\`, \`Button\`, \`Icon\`) inside \`Table\` \`rows\` (objects stringify as JSON). For option matrices with check/warn/cross semantics and recommendation badges, prefer \`Comparison(options, rows, title=...)\`; for status columns inside \`Table\`, use status text or emoji prefixes such as \`"🟢 正常"\` / \`"🟡 预警"\` / \`"🔴 异常"\`.
- Uphold **Thin UI, Thick Agent**: use \`calc\` for closed-form scalar/KPI reactivity; delegate iterative schedules or external queries to Agent actions via \`Event(...)\` + \`surface("id", update=true)\`.
- Single-fact answers, plain conceptual/mechanism explanations, casual chat, prose writing/translation, or single-snippet code edits — reply directly in concise Markdown.
- Data without live tool/web backing must state its reference basis visibly inside the UI (e.g. historical average or sample data); never fabricate live readings.
- Never claim an action happened ("installed", "verified") unless you actually did it.
- Never ask for passwords, API keys, or other secrets in a UI.
- Keep your reply text short; do not restate the UI in prose.

## Client Validation Rules (\`?check\`)

Attach zero-latency validation rules to \`TextField\`, \`NumberInput\`, \`MultiSelect\`, \`TreeSelect\`, \`CheckCard\`, \`Select\`, \`Segmented\`, \`Switch\`, \`CheckBox\`, \`ChoicePicker\`, \`Slider\`, \`DateTimeInput\`, and \`Button\` by passing \`?rule(...)\` arguments directly in the component call (append an optional custom error message string as the last argument):
1. **On bound input controls** (bound \`value = $/path\` is injected automatically as the first argument; errors stay hidden on initial render and appear after blur or submit attempt):
   - \`?required("必填提示")\` — non-empty string, \`true\` checkbox, or non-empty selection array
   - \`?email("请输入有效邮箱")\` — valid email format
   - \`?regex("^[a-z0-9-]{3,32}$", "格式提示")\` — regular expression match
   - \`?length(min, max, "长度提示")\` — string length bounds (e.g. \`?length(2, 20, "需 2–20 个字符")\`)
   - \`?numeric(min, max, "范围提示")\` — numeric bounds (e.g. \`?numeric(1, 100, "需在 1–100 之间")\`)
2. **On \`Button\` (submit gate)**: \`Button\` has no \`value\` property, so pass the target \`$/path\` explicitly as the **first** argument to disable \`Button\` until valid:
   - \`Button(Text("提交"), variant="primary", action=Event("submit", { name: $/name, email: $/email }), ?required($/name, "请填写姓名"), ?email($/email, "请填写有效邮箱"))\`

## Canonical Composition Examples

Example 1 — Reactive Dashboard + Chart + Searchable Plain-Text Table (\`a2ui_render\`):
\`\`\`
${GOLDEN_DASHBOARD_EXAMPLE}
\`\`\`

Example 2 — 0-Latency Nonlinear Calculator with Sliders, Mode Switch & Live Chart (\`a2ui_render\`):
\`\`\`
${GOLDEN_CALCULATOR_EXAMPLE}
\`\`\`

Example 3 — Config Diff Review + Blocking Confirmation (\`a2ui_ask\`):
\`\`\`
${GOLDEN_ASK_EXAMPLE}
\`\`\`

Example 4 — Form with \`?check\` Validation Rules & Gated Submit Button (\`a2ui_render\` / \`a2ui_ask\`):
\`\`\`
${GOLDEN_VALIDATED_FORM_EXAMPLE}
\`\`\`

`

export function apply(ctx: Context, config: Config = {}): void {
  const stateFile = resolveDefaultStateFile(config.stateFile)
  const initialEnabled = config.defaultEnabled ?? readPersistedEnabled(stateFile) ?? true
  const sessions = new SurfaceSessions(createGenerator(), initialEnabled)
  const asks = new PendingAskRegistry()
  const skillContent = SKILL_PREAMBLE + sessions.promptSnippet()

  const isEnabledForStep = ({ agent }: { agent?: ToolExec['agent'] }) =>
    !isSubagentCall({ agent }) && sessions.isEnabled(sessionIdOf({ agent }))

  ctx.inject(['tools'], (toolsCtx) => {
    const tools = (toolsCtx as unknown as { tools: ToolsService }).tools
    toolsCtx.effect(
      () => tools.register(createRenderTool(sessions), { when: isEnabledForStep }),
      'dsh-genui-a2ui: a2ui_render tool',
    )
    toolsCtx.effect(
      () => tools.register(createAskTool(sessions, asks), { when: isEnabledForStep }),
      'dsh-genui-a2ui: a2ui_ask tool',
    )
  })

  ctx.inject(['systemPrompt', 'tools'], (promptCtx) => {
    const { systemPrompt, tools } = promptCtx as unknown as {
      systemPrompt?: SystemPromptService
      tools?: ToolsService
    }
    if (!systemPrompt || typeof systemPrompt.section !== 'function') return
    promptCtx.effect(
      () =>
        systemPrompt.section({
          name: SYSTEM_PROMPT_SECTION_NAME,
          order: SYSTEM_PROMPT_SECTION_ORDER,
          interpolate: false,
          text: ({ scope, toolSet }) => {
            const agent = scope as ToolExec['agent'] | undefined
            if (!isEnabledForStep({ agent })) return ''
            if (
              tools &&
              typeof tools.get === 'function' &&
              tools.get(RENDER_TOOL, scope, toolSet) === undefined
            ) {
              return ''
            }
            return A2UI_SYSTEM_GUIDANCE
          },
        }),
      'dsh-genui-a2ui: system prompt guidance',
    )
  })

  const BUNDLED_SKILL_RANK = 600
  const SKILL_INVOCATION: SkillInvocationPolicy = {
    modelInvocable: true,
    userInvocable: true,
  }
  const skillCandidate: SkillCandidate = {
    name: SKILL_NAME,
    description: SKILL_DESCRIPTION,
    invocation: SKILL_INVOCATION,
    source: 'bundled',
    provider: name,
    rank: BUNDLED_SKILL_RANK,
    locator: SKILL_NAME,
  }
  const skillDefinition: SkillDefinition = {
    name: SKILL_NAME,
    description: SKILL_DESCRIPTION,
    invocation: SKILL_INVOCATION,
    source: 'bundled',
    provider: name,
    content: skillContent,
  }
  const isEnabledForSkillLookup = (options?: SkillLookupContext): boolean => {
    if (options?.scope !== undefined) {
      return isEnabledForStep({ agent: options.scope as ToolExec['agent'] })
    }
    return sessions.isEnabled('default')
  }

  let syncSkillCatalog: () => void = () => {}

  ctx.inject(['skills'], (skillCtx) => {
    const skills = (skillCtx as unknown as { skills: SkillsService }).skills
    if (typeof skills.registerProvider === 'function') {
      skillCtx.effect(() => {
        let invalidate: (() => void) | undefined
        const dispose = skills.registerProvider!((control) => {
          invalidate = control.invalidate
          return {
            name,
            list(options) {
              return Promise.resolve(isEnabledForSkillLookup(options) ? [skillCandidate] : [])
            },
            get(candidate, options) {
              if (candidate.name !== SKILL_NAME || !isEnabledForSkillLookup(options)) {
                control.invalidate()
                return Promise.resolve(undefined)
              }
              return Promise.resolve(skillDefinition)
            },
          }
        })
        syncSkillCatalog = () => {
          invalidate?.()
        }
        return () => {
          syncSkillCatalog = () => {}
          invalidate = undefined
          dispose()
        }
      }, 'dsh-genui-a2ui: a2ui skill provider')
      return
    }

    skillCtx.effect(() => {
      let disposeRegistered: (() => void) | undefined
      const syncFallback = () => {
        if (sessions.isEnabled('default')) {
          if (disposeRegistered === undefined) {
            disposeRegistered = skills.register({
              name: SKILL_NAME,
              description: SKILL_DESCRIPTION,
              content: skillContent,
              source: 'bundled',
            })
          }
        } else if (disposeRegistered !== undefined) {
          const prev = disposeRegistered
          disposeRegistered = undefined
          prev()
        }
      }
      syncFallback()
      syncSkillCatalog = syncFallback
      return () => {
        syncSkillCatalog = () => {}
        if (disposeRegistered !== undefined) {
          const prev = disposeRegistered
          disposeRegistered = undefined
          prev()
        }
      }
    }, 'dsh-genui-a2ui: a2ui skill')
  })

  ctx.inject(['commands'], (cmdCtx) => {
    const commands = (cmdCtx as unknown as { commands: CommandsService }).commands
    cmdCtx.effect(
      () =>
        commands.register({
          name: TIER_COMMAND,
          description: HOST_MESSAGES[resolveHostLocale()].tierCommandDesc,
          input: { hint: 'on | off | status' },
          recordInput: false,
          handler({ agent, rawInput }) {
            const msg = HOST_MESSAGES[resolveHostLocale()]
            const sid = sessionIdOf({ agent })
            const arg = rawInput.trim().toLowerCase()
            if (arg === 'status') {
              return {
                kind: 'success',
                text: sessions.isEnabled(sid) ? msg.enabledStatus : msg.disabledStatus,
              }
            }
            let next: boolean
            if (arg === '' || arg === 'toggle') {
              next = !sessions.isEnabled(sid)
            } else if (arg === 'on' || arg === 'true' || arg === '1' || arg === 'full') {
              next = true
            } else if (arg === 'off' || arg === 'false' || arg === '0') {
              next = false
            } else {
              return { kind: 'error', text: msg.invalidTierArg(arg) }
            }
            sessions.setEnabled(sid, next)
            sessions.setDefaultEnabled(next)
            syncSkillCatalog()
            writePersistedEnabled(stateFile, next)
            return {
              kind: 'success',
              text: next ? msg.enabledStatus : msg.disabledStatus,
            }
          },
        }),
      'dsh-genui-a2ui: /a2ui command',
    )

    cmdCtx.effect(
      () =>
        commands.register({
          name: ANSWER_COMMAND,
          description: HOST_MESSAGES[resolveHostLocale()].answerCommandDesc,
          recordInput: false,
          handler({ agent, rawInput }) {
            const msg = HOST_MESSAGES[resolveHostLocale()]
            const trimmed = rawInput.trim()
            if (trimmed === '') {
              return { kind: 'error', text: msg.missingPayload }
            }
            let payload: AskAnswerInput
            try {
              payload = JSON.parse(trimmed) as AskAnswerInput
            } catch {
              return { kind: 'error', text: msg.invalidPayloadJson }
            }
            const sid = sessionIdOf({ agent })
            const settled = asks.settle(sid, payload)
            if (!settled) {
              return { kind: 'error', text: msg.noPendingAsk }
            }
            return { kind: 'success' }
          },
        }),
      'dsh-genui-a2ui: /a2ui-answer command',
    )
  })

  ctx.on(
    'session/disposed' as never,
    ((session: { id: unknown }) => {
      const sid = String(session.id)
      sessions.forget(sid)
      asks.forgetSession(sid)
      syncSkillCatalog()
    }) as never,
  )
}
