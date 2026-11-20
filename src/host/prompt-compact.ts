export type SkillDomain = 'core' | 'analytics' | 'devops' | 'forms'

export const SKILL_DOMAINS: Readonly<Record<SkillDomain, readonly string[]>> = {
  core: [
    'Card',
    'Column',
    'Row',
    'Grid',
    'Tabs',
    'Accordion',
    'List',
    'Modal',
    'Divider',
    'Text',
    'Badge',
    'Callout',
    'Icon',
    'Stat',
    'Progress',
    'KeyValue',
    'Button',
    'TextField',
    'CheckBox',
    'ChoicePicker',
    'Slider',
    'Select',
    'Switch',
    'DateTimeInput',
  ],
  analytics: [
    'Chart',
    'Table',
    'EntityHeader',
    'MetricRing',
    'Tracker',
    'Comparison',
    'Matrix',
    'Tree',
    'Kanban',
    'SourceList',
    'Mermaid',
  ],
  devops: [
    'ServiceGraph',
    'DiffView',
    'Code',
    'Terminal',
    'ApiEndpoint',
    'ApprovalCard',
    'LogViewer',
    'FileTree',
    'JsonTree',
    'Timeline',
    'Schedule',
    'Steps',
    'Result',
  ],
  forms: [
    'NumberInput',
    'MultiSelect',
    'DateRange',
    'TreeSelect',
    'CheckCard',
    'Segmented',
    'Image',
    'AudioPlayer',
    'Video',
  ],
}

export const DOMAIN_SKILL_META: Readonly<
  Record<
    SkillDomain,
    { readonly name: string; readonly title: string; readonly description: string }
  >
> = {
  core: {
    name: 'a2ui',
    title: 'A2UI Core Grammar, Layout, Basic Controls & Validation',
    description:
      'Core A2UI 1.0 Express grammar, 24 essential layout/KPI/form components, ?check validation, calc(), and golden examples (only load when a2ui_render or a2ui_ask is available).',
  },
  analytics: {
    name: 'a2ui-analytics',
    title: 'A2UI Analytics, 19-Kind ECharts, ProTable, Matrices & Diagrams',
    description:
      'A2UI analytics reference: 19-kind Chart (bar/line/area/combo/waterfall/calendar/sunburst/parallel/sankey/etc.), ProTable, EntityHeader, MetricRing, Tracker, Comparison, Matrix, Tree, Kanban, SourceList, Mermaid (only load when a2ui_render is available).',
  },
  devops: {
    name: 'a2ui-devops',
    title: 'A2UI DevOps, Topology, Code Diff, Terminal, API & Approvals',
    description:
      'A2UI DevOps & workflow reference: ServiceGraph, DiffView, Code, Terminal, ApiEndpoint, ApprovalCard, LogViewer, FileTree, JsonTree, Timeline, Schedule, Steps, Result (only load when a2ui_render or a2ui_ask is available).',
  },
  forms: {
    name: 'a2ui-forms',
    title: 'A2UI Advanced Inputs, Selectors & Media',
    description:
      'A2UI advanced form & media reference: NumberInput, MultiSelect, DateRange, TreeSelect, CheckCard (option cards / follow-up prompts), Segmented, Image, AudioPlayer, Video (only load when a2ui_render or a2ui_ask is available).',
  },
}

const COMPACT_FUNCTIONS_SECTION = [
  '## Positional Function Signatures',
  '',
  'Use these exact positional signatures for check rules, formulas, or formatting:',
  '• calc(expr, vars?, decimals?) — Safe 0ms infix formula (`+ - * / ^ % ( ) ? : == != < <= > >= && ||`, `pow, sqrt, exp, log, ln, log10, abs, min, max, clamp, round, floor, ceil, pmt(ratePerPeriod, nper, pv)`) over `vars` (`{ w: $/wan }`), `decimals` 0..8.',
  '• cond(condition, truthy, falsy) — Ternary branch.',
  '• sum(items, field?) / avg(items, field?) — Aggregate numeric array or row object `field`.',
  '• eq(a, b) — Equality (auto-unwraps single-select ChoicePicker `["x"]` vs `"x"`).',
  '• gt(a, b) / lt(a, b) — Numeric comparison (`a > b`, `a < b`).',
  '• includes(items, value) — Array/string containment (ideal for multi-select ChoicePicker).',
  '• and(values) / or(values) / not(value) — Boolean combinators.',
  '• formatNumber(value, decimals?, grouping?) — Localized number formatting.',
  '• formatCurrency(value, currency, decimals?, grouping?) — ISO 4217 currency (`"CNY"`, `"USD"`).',
  '• formatDate(value, format) — Unicode TR35 pattern (`yyyy`, `MM`, `MMM`, `dd`, `HH:mm`, `h:mm a`, `EEEE`).',
  '• formatString(value) — Interpolates `$' +
    '{/path}` and `$' +
    '{fn(arg:...)}` (`\\$' +
    '{` escapes literal).',
  '• concat(items) — Joins strings/numbers/formatted values (`concat([formatNumber(v), " GB"])`).',
  '• lookup(key, table, fallback?) — Maps scalar/ChoicePicker `key` via `{ k: v }` table at depth 1.',
  '• pluralize(value, other, one?, zero?) — Selects string by count, falling back to `other`.',
  '• required(value) / email(value) / regex(value, pattern) / length(value, min?, max?) / numeric(value, min?, max?) — `?check` validators.',
  '• copyText(text) / openUrl(url) — Client clipboard copy & browser link actions.',
].join('\n')

function compactFunctionsSection(rawFnSec: string): string {
  if (rawFnSec.includes('• calc(') && rawFnSec.includes('• pluralize(')) {
    return COMPACT_FUNCTIONS_SECTION
  }
  return rawFnSec.replace(PLURALIZE_VERBOSE_BLOCK, COMPACT_PLURALIZE).trimEnd()
}

const PLURALIZE_VERBOSE_BLOCK = /• pluralize\([^\n]*\n(?: {2}- [^\n]*\n)+/

const COMPACT_PLURALIZE = [
  '• pluralize(value, other, one?, zero?)',
  '  - Description: Selects a string by count (`value`), falling back to `other`.',
  '',
].join('\n')

const REPEATED_WEIGHT_LINE = /^ {2}- weight: The relative weight of this component[^\n]*\n/gm

const WEIGHT_HEADER_NOTE =
  'Note: Any component with `weight?` accepts a positive number (`flex-grow`) ONLY when it is a direct child of `Row` or `Column`.'

const TRIVIAL_PROP_PATTERNS: readonly RegExp[] = [
  /^ {2}- title: Optional [^.\n]{0,42}title\.?\n/gm,
  /^ {2}- subtitle: Optional [^.\n]{0,48}\.?\n/gm,
  /^ {2}- caption: Optional [^.\n]{0,42}\.?\n/gm,
  /^ {2}- placeholder: Optional [^.\n]{0,42}\.?\n/gm,
  /^ {2}- summary: Optional [^.\n]{0,42}\.?\n/gm,
  /^ {2}- description: Optional [^.\n]{0,48}\.?\n/gm,
  /^ {2}- badge: Optional [^.\n]{0,42}\.?\n/gm,
  /^ {2}- label: (?:Optional )?(?:Display |Field |Control |Metric )?label[^.\n]{0,36}\.?\n/gm,
  /^ {2}- action: Optional (?:click |row |node |card |button )?action[^.\n]{0,65}\.?\n/gm,
]

const COMPACT_CATALOG_INSTRUCTIONS = [
  '',
  'Key catalog rules:',
  '- Store ONLY literal JSON state/datasets/rows in `$/paths` (`$/v = 100`) so `surface("id", update=true)` patches incrementally. NEVER assign `calc()`, `cond()`, or `lookup()` to `$/paths` — assign derived formulas to plain local variables (`total = calc(...)`) instead.',
  '- Keep `Table` cells plain scalars only (never nest `Badge`/`Button`); pass `Table.columns`, `Timeline.items`, and static enum props (like `Callout.tone`) as static literals/local vars (never `$/path` or `cond()`).',
  '- For 0ms Chart ↔ Table local cross-filtering, bind both to the same string path: `$/sel = ""`, `Chart(..., selected=$/sel)` + `Table(..., filterField="region", filterValue=$/sel)`.',
  '- Mark illustrative/sample numbers visibly in titles or captions; never fabricate live state or unperformed actions.',
  '',
].join('\n')

const DOMAIN_DIRECTORY_NOTE = [
  '',
  '## Domain Sub-Skills (Load Only When Needed)',
  'This core skill covers the 24 foundational components + full grammar & functions. For specialized components, load the matching lightweight sub-skill:',
  '- `a2ui-analytics` (11): `Chart` (19 ECharts kinds, `y2Field`, `referenceLine`), `Table` (ProTable), `EntityHeader`, `MetricRing`, `Tracker`, `Comparison`, `Matrix`, `Tree`, `Kanban`, `SourceList`, `Mermaid`',
  '- `a2ui-devops` (13): `ServiceGraph`, `DiffView`, `Code`, `Terminal`, `ApiEndpoint`, `ApprovalCard`, `LogViewer`, `FileTree`, `JsonTree`, `Timeline`, `Schedule`, `Steps`, `Result`',
  '- `a2ui-forms` (9): `NumberInput`, `MultiSelect`, `DateRange`, `TreeSelect`, `CheckCard`, `Segmented`, `Image`, `AudioPlayer`, `Video`',
  '',
].join('\n')

function compactComponentBlock(block: string): string {
  let out = block.replace(REPEATED_WEIGHT_LINE, '')
  for (const re of TRIVIAL_PROP_PATTERNS) {
    out = out.replace(re, '')
  }
  out = out
    .replace(/\s*\(~0 kB bundle cost, instant SSR\/first-frame render\)/g, '')
    .replace(
      /\s*This is similar to the CSS '[^']+' property(?:, but uses camelCase values \([^)]+\))?\./g,
      '',
    )
    .replace(
      /Supports 19 chart kinds: bar, line, area, pie, scatter, radar, funnel, gauge, heatmap, treemap, sankey, boxplot, graph, candlestick, waterfall, combo, sunburst, parallel, and calendar\./g,
      'Supports 19 ECharts kinds (see `kind` enum below).',
    )
    .replace(
      /, or a \$\/path binding to an array in the surface data model \(recommended so update=true can refresh data incrementally\)/g,
      ' or $/path array',
    )
    .replace(/, or a \$\/path binding to an array in the surface data model/g, ' or $/path array')
    .replace(
      /Use an array of strings for a fixed set of children, or a template object to generate children from a data list\. Children cannot be defined inline, they must be referred to by ID\./g,
      'Array of child component IDs or `_template($/list, item)`.',
    )
    .replace(
      /The ID of the child component to render(?: inside [^.\n]+)?\./g,
      'Child component ID.',
    )
    .replace(/\n{3,}/g, '\n\n')
  return out
}

interface ParsedPromptSections {
  readonly beforeComponents: string
  readonly componentLead: string
  readonly components: ReadonlyMap<string, string>
  readonly functionsSection: string
  readonly catalogInstructions: string
}

function parsePromptSections(raw: string): ParsedPromptSections {
  const normalized = raw.replace(PLURALIZE_VERBOSE_BLOCK, COMPACT_PLURALIZE)
  const compMarker = '## Positional Component Signatures'
  const fnMarker = '## Positional Function Signatures'
  const instMarker = '## Catalog Instructions'

  const compIdx = normalized.indexOf(compMarker)
  const fnIdx = normalized.indexOf(fnMarker)
  const instIdx = normalized.indexOf(instMarker)

  if (compIdx === -1 || fnIdx === -1) {
    return {
      beforeComponents: normalized,
      componentLead: '',
      components: new Map(),
      functionsSection: '',
      catalogInstructions: '',
    }
  }

  const beforeComponents = normalized.slice(0, compIdx)
  const compBody = normalized.slice(compIdx + compMarker.length, fnIdx)
  const fnBody = instIdx !== -1 ? normalized.slice(fnIdx, instIdx) : normalized.slice(fnIdx)
  const catalogInstructions = instIdx !== -1 ? normalized.slice(instIdx) : ''

  const firstBulletIdx = compBody.indexOf('\n• ')
  const componentLead =
    firstBulletIdx !== -1 ? compBody.slice(0, firstBulletIdx).trim() : compBody.trim()
  const bulletsRaw = firstBulletIdx !== -1 ? compBody.slice(firstBulletIdx + 1) : ''

  const blocks = bulletsRaw.split(/\n(?=• )/).filter((b) => b.startsWith('• '))
  const components = new Map<string, string>()
  for (const blk of blocks) {
    const match = /^• ([A-Za-z0-9]+)\(/.exec(blk)
    if (match?.[1]) {
      components.set(match[1], compactComponentBlock(blk.endsWith('\n') ? blk : `${blk}\n`))
    }
  }

  return {
    beforeComponents,
    componentLead,
    components,
    functionsSection: compactFunctionsSection(fnBody),
    catalogInstructions,
  }
}

export function compactPromptSnippet(raw: string): string {
  const parsed = parsePromptSections(raw)
  if (parsed.components.size === 0) {
    return raw.replace(PLURALIZE_VERBOSE_BLOCK, COMPACT_PLURALIZE)
  }

  const allBlocks = [...parsed.components.values()].join('')
  return [
    parsed.beforeComponents.trimEnd(),
    '',
    '## Positional Component Signatures',
    '',
    parsed.componentLead,
    WEIGHT_HEADER_NOTE,
    allBlocks.trimEnd(),
    '',
    parsed.functionsSection,
    '',
    '## Catalog Instructions',
    COMPACT_CATALOG_INSTRUCTIONS.trim(),
    '',
  ].join('\n')
}

export function slicePromptSnippetByDomain(raw: string, domain: SkillDomain): string {
  const parsed = parsePromptSections(raw)
  const allowList = SKILL_DOMAINS[domain]
  const selectedBlocks: string[] = []
  for (const compName of allowList) {
    const blk = parsed.components.get(compName)
    if (blk) selectedBlocks.push(blk)
  }

  if (domain === 'core') {
    return [
      parsed.beforeComponents.trimEnd(),
      '',
      '## Positional Component Signatures (Core — 24 Components)',
      '',
      parsed.componentLead,
      WEIGHT_HEADER_NOTE,
      selectedBlocks.join('').trimEnd(),
      DOMAIN_DIRECTORY_NOTE.trimEnd(),
      '',
      parsed.functionsSection,
      '',
      '## Catalog Instructions',
      COMPACT_CATALOG_INSTRUCTIONS.trim(),
      '',
    ].join('\n')
  }

  const meta = DOMAIN_SKILL_META[domain]
  const domainHint =
    domain === 'analytics'
      ? 'Use with `a2ui_render`. For `Chart`, bind row arrays in `$/paths`, use `y2Field` for dual-axis `combo`, and `referenceLine` for dynamic SLO/target thresholds. Keep `Table` cells plain scalars only.'
      : domain === 'devops'
        ? 'Use with `a2ui_render` or `a2ui_ask`. Pass `filePath` (and optional `line`) on `DiffView`, `Code`, `LogViewer`, `FileTree` to enable one-click right-sidebar source jumps.'
        : 'Use with `a2ui_render` or `a2ui_ask`. Bind mutable literals to `$/paths`, assign ALL `calc(...)`/`cond(...)` results to plain local variables (never `$/paths`), avoid nesting 3+ `cond()` inside `calc()` (max call depth 5), and use `TextField(..., variant="longText")` for multiline input (no `TextArea`).'

  return [
    `# ${meta.title}`,
    '',
    `Domain supplement for \`a2ui\` (${selectedBlocks.length} components). ${domainHint}`,
    WEIGHT_HEADER_NOTE,
    '',
    '## Positional Component Signatures',
    '',
    selectedBlocks.join('').trimEnd(),
    '',
  ].join('\n')
}

export interface SkillTelemetry {
  readonly rawFullChars: number
  readonly compactFullChars: number
  readonly fullSavingsPct: number
  readonly domains: Readonly<
    Record<
      SkillDomain,
      {
        readonly name: string
        readonly components: number
        readonly chars: number
        readonly estTokens: number
      }
    >
  >
}

export function measureSkillTelemetry(raw: string, corePreambleChars = 0): SkillTelemetry {
  const compactFull = compactPromptSnippet(raw)
  const rawTotal = raw.length + corePreambleChars
  const compactFullTotal = compactFull.length + corePreambleChars

  const domains = {} as Record<
    SkillDomain,
    {
      readonly name: string
      readonly components: number
      readonly chars: number
      readonly estTokens: number
    }
  >

  for (const domain of ['core', 'analytics', 'devops', 'forms'] as const) {
    const sliced = slicePromptSnippetByDomain(raw, domain)
    const chars = sliced.length + (domain === 'core' ? corePreambleChars : 0)
    domains[domain] = {
      name: DOMAIN_SKILL_META[domain].name,
      components: SKILL_DOMAINS[domain].length,
      chars,
      estTokens: Math.round(chars / 3.8),
    }
  }

  return {
    rawFullChars: rawTotal,
    compactFullChars: compactFullTotal,
    fullSavingsPct: Math.round(((rawTotal - compactFullTotal) / rawTotal) * 1000) / 10,
    domains,
  }
}
