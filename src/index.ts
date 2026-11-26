import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { createAskTool, PendingAskRegistry } from './host/ask-tool.ts'
import { createGenerator, RENDER_TOOL, SurfaceSessions } from './host/generator.ts'
import { DOMAIN_SKILL_META, SKILL_DOMAINS, type SkillDomain } from './host/prompt-compact.ts'
import { createRenderTool, isSubagentCall, sessionIdOf, type ToolExec } from './host/render-tool.ts'
import { A2UI_LIMITS, ANSWER_COMMAND, TIER_COMMAND } from './shared/catalog-schema.ts'
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
  'Decide whether to render UI by the **information topology of your answer**, NOT by whether the user typed UI words:',
  '- **Proactively call `a2ui_render`** (even on short queries) for: (1) >=3 parallel metrics, KPI grids, SLO rings/strips, or entity summaries; (2) trends, distributions, combos, hierarchies, flows, or shares (`Chart`, 26 kinds); (3) trade-offs, matrices, boards, citations, trees, or >=4-row tables; (4) service topologies, diffs, logs, timelines, schedules, terminals, API contracts, checklists, or risk gates; (5) interactive calculators/simulators with 0ms reactive math. Use `placement="dock"` for persistent cross-turn trackers (`update=true`), or `a2ui_ask` to pause for user input.',
  '- **In-chat first**: Unless the user asks to save a standalone `.html` file on disk, render calculators, simulators, and dashboards inline via `a2ui_render`.',
  '- **Stay in Markdown** for single facts, pure conceptual explanations, prose/translation, or standalone code snippets (NEVER wrap a lone `Code(...)`).',
  '- **After `a2ui_render` succeeds**: reply with 1–3 concise takeaway sentences without restating card data. NEVER inspect `dsh-genui-a2ui`, `app.asar`, or `~/.dsh` for grammar; call the tool directly and Repair any compile rejection silently without mentioning errors or retries. State visibly when figures are illustrative; never fabricate live state.',
  '',
  '## Fast-Path A2UI Express Micro-Grammar (1-step `a2ui_render`)',
  'Pass raw A2UI Express in `ui` (NO `<a2ui>` tags or fences). Start with `surface("snake_id")` (`update=true` to patch) and assign `root`:',
  '- **State vs Formulas**: store literal state in `$/paths` (`$/wan = 100`); assign derived formulas (`calc`/`cond`/`lookup`) to plain local vars WITHOUT `$/` (`pmt = calc("...", { w: $/wan }, decimals=2)`). Compute directly from `$/paths` in one `calc()` (max call depth 5).',
  '- **Syntax Guards**: (1) NO `+`, `*`, `/`, backticks, `obj.prop`, or `arr[0]` outside `calc()`; (2) named args use `=` (`status="healthy"`), `:` ONLY inside `{ k: v }` (quoted string keys work everywhere, unquoted keys ASCII only); (3) actions MUST use `Event("name", { ... })`; (4) use `TextField(..., variant="longText")` (no `TextArea`); keep `tone`/`trend`/`variant`, `Table.columns`, & `Timeline.items` static literals (NEVER nest `Badge`/`Button` inside `rows` — use `Table` `columns[].format`); set `weight` ONLY on direct children of `Row`/`Column` (`Row([Stat(..., weight=1), ...])`).',
  '- **Core Fast-Path Signatures**:',
  '  - Layout: `Card(child)` | `Column([c1, ...])` | `Row([c1, ...], justify?, align?)` | `Grid([c1, ...], columns?=3, gap?)` | `Tabs([{ title, child }])` | `Accordion([{ title, subtitle?, badge?, open?, child }], multiple?)` | `Divider()`',
  '  - Metrics & Data: `Text(text, variant?)` | `Badge(label, tone?)` | `Stat(label, value, delta?, trend?="up"|"down"|"neutral", spark?, caption?, tone?="neutral"|"info"|"success"|"warning"|"danger")` | `Progress(value, max?=100, label?, tone?)` | `KeyValue(items, title?, columns?=2, bordered?=false, copyable?=false)` | `Callout(title, message?, tone?, collapsible?, child?)` | `Chart(kind, data, title?, xField?, yField?, y2Field?, seriesField?, sizeField?, referenceLine?, referenceLabel?, stacked?, horizontal?, zoom?, height?=260, selected?, exportable?=true, step?, yScale?, stackMode?, markArea?, referenceX?, referenceXLabel?, bins?, action?)` | `Table(rows, columns?, title?, searchable?, pageSize?=10, exportable?, selectable?, batchLabel?, showSummary?, expandKey?, filterField?, filterValue?, stickyFirstColumn?, action?)` | `DiffView(before?, after?, title?, filePath?, line?, language?, mode?="unified"|"split", files?, annotations?)`',
  '  - Controls & Reactive Math: `Button(child, variant?, action?)` | `TextField(label, $/str, placeholder?, variant?)` | `Slider(label, min, max, $/val, steps?)` | `CheckBox(label, $/bool)` | `Switch(label, $/bool, description?)` | `Select(label, options, value=$/str, searchable?)` | `Segmented(label, options, value=$/str)` | `ChoicePicker(label?, variant?, options, value=$/list, displayStyle?)` | `KvEditor($/entries, title?, keyLabel?, valueLabel?, keyPlaceholder?, valuePlaceholder?, addLabel?, maxItems?)`',
  '  - Functions: `calc(expr, vars?, decimals?)` (`+ - * / ^ % ? : == != < <= > >= && ||`, `pow/sqrt/exp/log/ln/log10/abs/min/max/clamp/round/floor/ceil/sin/cos/tan/pmt`), `cond`, `lookup`, `concat`, `eq`, `gt`, `lt`, `includes`, `not`, `and`, `or`, `sum`/`avg`/`min`/`max`/`count`, `formatNumber`, `formatCurrency`, `formatDate`, `formatString`, `pluralize`.',
  '- Example:',
  '```',
  FAST_PATH_EXAMPLE,
  '```',
  '- **Scoped Skills (load ONLY the domain you need for full prop signatures)**:',
  '  - `a2ui` (core 24 + `?check` validation + `a2ui_ask` wizards)',
  '  - `a2ui-analytics` (26 `Chart` kinds: bar/line/area/pie/scatter/radar/funnel/gauge/heatmap/treemap/sankey/boxplot/graph/candlestick/waterfall/combo/sunburst/parallel/calendar/range/bullet/histogram/dumbbell/rose/radialBar/chord; `Table`, `AnnotationText`, `EntityHeader`, `MetricRing`, `Tracker`, `Comparison`, `Matrix`, `Tree`, `Kanban`, `SourceList`, `Mermaid`)',
  '  - `a2ui-devops` (`ServiceGraph`, `DiffView`, `Code`, `Terminal`, `ApiEndpoint`, `ApprovalCard`, `Checklist`, `LogViewer`, `FileTree`, `JsonTree`, `Timeline`, `Schedule`, `Steps`, `Result`)',
  '  - `a2ui-forms` (`NumberInput`, `RangeSlider`, `MultiSelect`, `DateRange`, `TreeSelect`, `CheckCard`, `Rating`, `SortableList`, `KvEditor`, `Segmented`, `Image`, `ImageCompare`, `AudioPlayer`, `Video`)',
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
- **Availability guard (\`/a2ui off\`)**: When \`a2ui_render\`/\`a2ui_ask\` are absent, reply in Markdown. Never inspect \`dsh-genui-a2ui\`, \`app.asar\`, or \`~/.dsh\` via shell/read — call \`a2ui_render\` directly and repair rejections silently.
- Render calculators, simulators, and dashboards inline via \`a2ui_render\` unless asked for a standalone \`.html\` file.
- Store mutable literals in \`$/paths\`; put reactive formulas & derived \`Chart\` arrays in local vars WITHOUT \`$/\` (\`pmt = calc(...)\`, \`series = [{ x: "A", y: pmt }]\`) — never \`$/path = fn(...)\`.
- **\`Table\` cells are plain scalar text only**: never nest \`Badge\`/\`Button\`/\`Icon\` in \`rows\` (use \`Comparison\` or \`"🟢 正常"\`).
- **Thin UI, Thick Agent**: use \`calc\` for closed-form math; for multi-tier advice use \`tier = calc("v>=18?2:v>=12?1:0", ...)\` + \`lookup(tier, { "0": "...", "1": "...", "2": "..." })\` (depth 2, not nested \`cond\`/\`concat\`); delegate iterative schedules/queries to \`Event(...)\` + \`update=true\`.
- Mark illustrative data visibly; never fabricate live readings, claim unperformed actions, ask for secrets, or restate UI data in prose.

## Client Validation Rules (\`?check\`)

Attach zero-latency validation to inputs (\`TextField\`, \`NumberInput\`, \`RangeSlider\`, \`MultiSelect\`, \`DateRange\`, \`TreeSelect\`, \`CheckCard\`, \`Rating\`, \`Checklist\`, \`KvEditor\`, \`Select\`, \`Segmented\`, \`Switch\`, \`CheckBox\`, \`ChoicePicker\`, \`Slider\`, \`DateTimeInput\`) or \`Button\` (optional message as final arg):
1. **On bound \`value\` inputs** (auto-injects \`$/path\`; errors show on blur/submit): \`?required("...")\`, \`?email("...")\`, \`?regex("...", "...")\`, \`?length(min, max, "...")\`, \`?numeric(min, max, "...")\`. Multi-prop controls (\`DateRange\`, \`RangeSlider\`, \`KvEditor\`) auto-expand \`?required\`; pass explicit \`$/path\` for other checks (e.g. \`?numeric($/lo, 10, 90, "...")\`).
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
    return sessions.getDefaultEnabled()
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
        if (sessions.getDefaultEnabled()) {
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
            if (Buffer.byteLength(trimmed, 'utf8') > A2UI_LIMITS.maxDataModelBytes) {
              return { kind: 'error', text: msg.payloadTooLarge }
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
    ((session: { id?: unknown; header?: { id?: unknown } } | null | undefined) => {
      const rawId =
        typeof session?.id === 'string' && session.id.trim() !== ''
          ? session.id.trim()
          : typeof session?.id === 'number'
            ? session.id
            : session?.header?.id
      if (typeof rawId !== 'string' && typeof rawId !== 'number') return
      const sid = String(rawId).trim()
      if (sid === '') return
      sessions.forget(sid)
      asks.forgetSession(sid)
      syncSkillCatalog()
    }) as never,
  )
}
