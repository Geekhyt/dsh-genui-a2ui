import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { createAskTool, PendingAskRegistry } from './host/ask-tool.ts'
import { createGenerator, RENDER_TOOL, SurfaceSessions } from './host/generator.ts'
import { DOMAIN_SKILL_META, SKILL_DOMAINS, type SkillDomain } from './host/prompt-compact.ts'
import { createRenderTool, isSubagentCall, sessionIdOf, type ToolExec } from './host/render-tool.ts'
import { ANSWER_COMMAND, TIER_COMMAND } from './shared/catalog-schema.ts'
import { HOST_MESSAGES, resolveHostLocale } from './shared/i18n.ts'
import type { AskAnswerInput } from './shared/wire-types.ts'

export type { SkillDomain }
export { ANSWER_COMMAND, DOMAIN_SKILL_META, SKILL_DOMAINS, TIER_COMMAND }

export const name = 'dsh-genui-a2ui'
export const inject: string[] = []

export interface Config {
  readonly defaultEnabled?: boolean | undefined
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

const warnedStateFiles = new Set<string>()

export function writePersistedEnabled(
  stateFile: string | null,
  enabled: boolean,
  onWarn?: (message: string, err: unknown) => void,
): boolean {
  if (!stateFile) return false
  try {
    mkdirSync(dirname(stateFile), { recursive: true })
    writeFileSync(
      stateFile,
      JSON.stringify({ defaultEnabled: enabled, updatedAt: new Date().toISOString() }, null, 2),
      'utf8',
    )
    return true
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code
    if (code !== 'ENOENT' && !warnedStateFiles.has(stateFile)) {
      warnedStateFiles.add(stateFile)
      const message = `[dsh-genui-a2ui] Failed to persist A2UI switch state to "${stateFile}"`
      if (onWarn) {
        onWarn(message, err)
      } else {
        console.warn(message, err)
      }
    }
    return false
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
export const SYSTEM_PROMPT_SECTION_ORDER = 9200

export const SKILL_NAME = DOMAIN_SKILL_META.core.name
export const DOMAIN_SKILL_NAMES = [
  DOMAIN_SKILL_META.core.name,
  DOMAIN_SKILL_META.analytics.name,
  DOMAIN_SKILL_META.devops.name,
  DOMAIN_SKILL_META.forms.name,
] as const
export const SKILL_DESCRIPTION = DOMAIN_SKILL_META.core.description

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
  '- **Stay in concise Markdown (do NOT call `a2ui_render`)** for: single-fact lookups (one number/date/yes-no), pure conceptual/mechanism explanations ("why/how X works"), casual chat, prose writing/translation, or writing/explaining/editing standalone code functions/snippets (always use normal Markdown fenced code blocks — NEVER call `a2ui_render` just to wrap a `Code(...)` widget).',
  "- **After `a2ui_render` succeeds**: keep your Markdown reply to a brief 1–3 sentence takeaway; never restate the card's numbers or table rows in prose.",
  '- **Honesty & provenance**: without live tool/web data, present only established reference averages or illustrative figures and state the basis visibly inside the UI (e.g. `caption` or `Callout`); never fabricate live readings or claim unperformed actions.',
  '',
  '## Fast-Path A2UI Express Micro-Grammar (1-step `a2ui_render` — no skill load needed for cards or calculators)',
  'Pass raw A2UI Express in `ui` (NO `<a2ui>` tags, NO markdown fences). Start with `surface("snake_id")` (`surface("snake_id", update=true)` to update in place) and assign one entry component to `root`:',
  '- **State vs Reactive Formulas**: store mutable literal state in `$/paths` (`$/wan = 100`, `$/mode = "benxi"`, `$/auto = true`); assign ALL derived formulas (`calc`/`cond`) to **plain local variables WITHOUT `$/`** (`v = { w: $/wan, y: $/years, r: $/rate }`, `pmt = calc("pmt(r/1200, y*12, w*10000)", v, decimals=2)`) — NEVER write `$/x = calc(...)` or `$/x = cond(...)`. Compute each metric directly from `$/paths` in one `calc()` (NEVER nest 3+ `cond(...)` inside `calc(...)` + `formatNumber(...)` — max call depth is 5).',
  '- **Strict Express Syntax Guards**: (1) **NO `+`, `*`, `/`, backticks, `obj.prop`, or `arr[0]`** outside `calc()` — put ALL math inside `calc("...", { a: $/a })` (never `formatNumber(x * 100)` or `formatNumber(x) + " GB"`), and use flat scalar vars (never `g.name`); (2) named component args MUST use `=` (`status="healthy"`), NEVER `:` (`:` is ONLY for `{ k: v }`); (3) actions (`action`, `approveAction`, `rejectAction`) MUST use `Event("name", { ... })`; (4) use `TextField(..., variant="longText")` (no `TextArea`), and keep ALL `tone`/`trend`/`variant` props (use `MetricRing(..., tone="auto")`), `Table.columns`, & `Timeline.items` as static literals (NEVER bind `$/path` or `cond(...)` to `tone`/`trend`; `Timeline` status: `"info"|"success"|"warning"|"danger"|"pending"`).',
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
  '- **Scoped Skills (load only the domain you need)**: `a2ui` (core grammar, 24 basic components, `?check` validation, `a2ui_ask` wizards), `a2ui-analytics` (19-kind `Chart`, `ProTable`, `MetricRing`, `Tracker`, `Comparison`, `Matrix`, `Tree`, `Kanban`, `Mermaid`), `a2ui-devops` (`ServiceGraph`, `DiffView`, `Code`, `Terminal`, `ApiEndpoint`, `ApprovalCard`, `LogViewer`, `FileTree`, `JsonTree`, `Timeline`, `Schedule`, `Steps`, `Result`), `a2ui-forms` (`NumberInput`, `MultiSelect`, `DateRange`, `TreeSelect`, `CheckCard`, `Segmented`, `Image`, `AudioPlayer`, `Video`).',
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

export const SKILL_PREAMBLE = `# Interactive UI with A2UI (Core Grammar, Controls & Validation)

Placements & tools:
- \`a2ui_render\` (\`placement="answer"\` default | \`"dock"\` pinned progress bar refreshed via \`surface("id", update=true)\` | \`"inline"\` compact step card).
- \`a2ui_ask\`: blocking in-turn wizard/approval card with \`Button(..., action=Event(...))\`. For a simple 2-option text question, prefer the lightweight built-in \`ask_user_question\` tool instead.

Modality & safety rules:
- **Availability guard (\`/a2ui off\`)**: If \`a2ui_render\` and \`a2ui_ask\` are absent from your current tool declarations, A2UI is disabled — reply directly in concise Markdown and NEVER run shell commands or inspect plugin state to investigate why.
- Deliver calculators, simulators, and dashboards inline via \`a2ui_render\` unless the user explicitly asks to write a standalone \`.html\` file on disk.
- Store mutable literals in \`$/paths\` and assign reactive formulas to local variables WITHOUT \`$/\` (\`pmt = calc(...)\`); never assign \`fn(...)\` to a \`$/path\`.
- **\`Table\` cells are plain scalar text only**: never pass nested \`Badge\`/\`Button\`/\`Icon\` inside \`Table\` \`rows\` (use \`Comparison\` for badge matrices or emoji prefixes like \`"🟢 正常"\`).
- Uphold **Thin UI, Thick Agent**: use \`calc\` for closed-form scalar math; delegate iterative schedules or external queries to Agent actions via \`Event(...)\` + \`surface("id", update=true)\`.
- Mark illustrative data visibly; never fabricate live readings, claim unperformed actions, ask for secrets, or restate UI data in prose.

## Client Validation Rules (\`?check\`)

Attach zero-latency validation to input controls (\`TextField\`, \`NumberInput\`, \`MultiSelect\`, \`TreeSelect\`, \`CheckCard\`, \`Select\`, \`Segmented\`, \`Switch\`, \`CheckBox\`, \`ChoicePicker\`, \`Slider\`, \`DateTimeInput\`) or \`Button\` (optional custom error message as final arg):
1. **On bound inputs** (bound \`$/path\` injected automatically; errors reveal on blur or submit): \`?required("...")\`, \`?email("...")\`, \`?regex("...", "...")\`, \`?length(min, max, "...")\`, \`?numeric(min, max, "...")\`.
2. **On \`Button\` (submit gate)**: pass target \`$/path\` as first arg to disable until valid, e.g. \`?required($/name, "...")\`, \`?email($/email, "...")\`.

## Canonical Composition Examples

Example 1 — Reactive Dashboard + Chart + Plain-Text Table (\`a2ui_render\`):
\`\`\`
${GOLDEN_DASHBOARD_EXAMPLE}
\`\`\`

Example 2 — 0-Latency Nonlinear Calculator (\`a2ui_render\`):
\`\`\`
${GOLDEN_CALCULATOR_EXAMPLE}
\`\`\`

Example 3 — Config Diff Review + Blocking Confirmation (\`a2ui_ask\`):
\`\`\`
${GOLDEN_ASK_EXAMPLE}
\`\`\`

Example 4 — Validated Form + Gated Submit Button (\`a2ui_render\` / \`a2ui_ask\`):
\`\`\`
${GOLDEN_VALIDATED_FORM_EXAMPLE}
\`\`\`

`

export function apply(ctx: Context, config: Config = {}): void {
  const stateFile = resolveDefaultStateFile(config.stateFile)
  const initialEnabled = config.defaultEnabled ?? readPersistedEnabled(stateFile) ?? true
  const sessions = new SurfaceSessions(createGenerator(), initialEnabled)
  const asks = new PendingAskRegistry()
  const fullCompactSkillContent = SKILL_PREAMBLE + sessions.promptSnippet()
  const scopedSkillContents: Record<SkillDomain, string> = {
    core: SKILL_PREAMBLE + sessions.promptSnippet('core'),
    analytics: sessions.promptSnippet('analytics'),
    devops: sessions.promptSnippet('devops'),
    forms: sessions.promptSnippet('forms'),
  }

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
  const skillDomainsOrder: readonly SkillDomain[] = ['core', 'analytics', 'devops', 'forms']
  const skillCandidates: readonly SkillCandidate[] = skillDomainsOrder.map((domain, idx) => ({
    name: DOMAIN_SKILL_META[domain].name,
    description: DOMAIN_SKILL_META[domain].description,
    invocation: SKILL_INVOCATION,
    source: 'bundled',
    provider: name,
    rank: BUNDLED_SKILL_RANK + idx,
    locator: DOMAIN_SKILL_META[domain].name,
  }))
  const skillDefinitionsByName = new Map<string, SkillDefinition>(
    skillDomainsOrder.map((domain) => [
      DOMAIN_SKILL_META[domain].name,
      {
        name: DOMAIN_SKILL_META[domain].name,
        description: DOMAIN_SKILL_META[domain].description,
        invocation: SKILL_INVOCATION,
        source: 'bundled',
        provider: name,
        content: scopedSkillContents[domain],
      },
    ]),
  )
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
              return Promise.resolve(isEnabledForSkillLookup(options) ? skillCandidates : [])
            },
            get(candidate, options) {
              const def = skillDefinitionsByName.get(candidate.name)
              if (def === undefined || !isEnabledForSkillLookup(options)) {
                control.invalidate()
                return Promise.resolve(undefined)
              }
              return Promise.resolve(def)
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
              content: fullCompactSkillContent,
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
            const logger = (ctx as unknown as { logger?: { warn?: (...a: unknown[]) => void } })
              .logger
            writePersistedEnabled(
              stateFile,
              next,
              typeof logger?.warn === 'function'
                ? (message, err) => logger.warn!(message, err)
                : undefined,
            )
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
            let rawPayload: unknown
            try {
              rawPayload = JSON.parse(trimmed)
            } catch {
              return { kind: 'error', text: msg.invalidPayloadJson }
            }
            if (
              typeof rawPayload !== 'object' ||
              rawPayload === null ||
              Array.isArray(rawPayload)
            ) {
              return { kind: 'error', text: msg.invalidPayloadJson }
            }
            const payload = rawPayload as AskAnswerInput
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

  if (typeof ctx.effect === 'function') {
    ctx.effect(
      () => () => {
        asks.disposeAll()
      },
      'dsh-genui-a2ui: pending asks cleanup',
    )
  } else {
    ctx.on(
      'dispose' as never,
      (() => {
        asks.disposeAll()
      }) as never,
    )
  }

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
