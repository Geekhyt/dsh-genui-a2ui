/**
 * Isomorphic A2UI 1.0 catalog schema shared by the Node Host (`@a2ui/agent`)
 * and the Browser Client (`@a2ui/react` + `@a2ui/web_core`).
 *
 * Zero DOM, zero React, zero Lit element imports: includes all 18 official
 * A2UI v1.0 Basic Catalog component contracts plus 14 DSH-native extensions
 * (`Chart`, `Table`, `Stat`, `Progress`, `Badge`, `Code`, `DiffView`, `Steps`,
 * `Callout`, `KeyValue`, `Accordion`, `JsonTree`, `FileTree`, `Mermaid`) —
 * 32 components total.
 */
import { z } from 'zod'
import {
  ActionSchema,
  AudioPlayerApi,
  BASIC_FUNCTION_APIS,
  ButtonApi,
  CardApi,
  Catalog,
  CheckBoxApi,
  ChildSchema,
  ChoicePickerApi,
  ColumnApi,
  DateTimeInputApi,
  DividerApi,
  DynamicBooleanSchema,
  DynamicNumberSchema,
  DynamicStringSchema,
  DynamicValueSchema,
  IconApi,
  ImageApi,
  ListApi,
  ModalApi,
  RowApi,
  SliderApi,
  TabsApi,
  TextFieldApi,
  VideoApi,
  WeightSchema,
  spec,
  type CatalogApi,
  type ComponentApi,
  type FunctionApi,
} from '@a2ui/web_core/v1_0'

import {
  A2UI_LIMITS,
  ANSWER_COMMAND,
  ASK_TOOL,
  BASIC_CATALOG_ID,
  CHART_KINDS,
  DSH_CATALOG_ID,
  normalizePlacement,
  RENDER_TOOL,
  SURFACE_PLACEMENTS,
  TIER_COMMAND,
  type A2uiEnabled,
  type ChartKind,
  type SurfacePlacement,
} from './constants.ts'

export {
  A2UI_LIMITS,
  ANSWER_COMMAND,
  ASK_TOOL,
  BASIC_CATALOG_ID,
  CHART_KINDS,
  DSH_CATALOG_ID,
  normalizePlacement,
  RENDER_TOOL,
  SURFACE_PLACEMENTS,
  TIER_COMMAND,
  type A2uiEnabled,
  type ChartKind,
  type SurfacePlacement,
}

export const ChartApi = {
  name: 'Chart',
  schema: spec(
    z
      .object({
        kind: z.enum(CHART_KINDS).describe('Chart visualization type.'),
        data: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array of data row objects (or `{ nodes, links }` for graph), or a $/path binding to an array in the surface data model (recommended so update=true can refresh data incrementally).',
        ),
        title: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Optional chart title.').optional(),
        xField: z
          .string()
          .describe('Property name for the category / X axis (or item label in pie/funnel/gauge/treemap/boxplot, source in sankey/graph, or date in candlestick).')
          .optional(),
        yField: z
          .union([z.string(), z.array(z.string()).min(1)])
          .describe('Property name(s) for numeric series values (or Y category in heatmap); pass an array of field names for multi-series charts.')
          .optional(),
        seriesField: z
          .string()
          .describe('Optional property name used to group rows into separate series (or target node in sankey/graph, parent group in treemap).')
          .optional(),
        sizeField: z
          .string()
          .describe('Optional numeric property name mapped to bubble radius on scatter charts or cell intensity on heatmap charts.')
          .optional(),
        stacked: z
          .boolean()
          .default(false)
          .describe('Whether to stack series in bar, line, or area charts.')
          .optional(),
        horizontal: z
          .boolean()
          .default(false)
          .describe('When true on bar charts, flips axes into a horizontal bar ranking chart.')
          .optional(),
        zoom: z
          .boolean()
          .default(false)
          .describe('When true on Cartesian charts, enables interactive mouse-wheel and slider dataZoom.')
          .optional(),
        height: z
          .number()
          .min(140)
          .max(640)
          .default(260)
          .describe('Canvas height in pixels.')
          .optional(),
        action: ActionSchema.describe('REF:#/$defs/Action').optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Interactive lazy-loaded ECharts visualization bound to structured data rows. Supports 14 chart kinds: bar, line, area, pie, scatter, radar, funnel, gauge, heatmap, treemap, sankey, boxplot, graph, and candlestick.',
      )
      .strict(),
    { mixins: [], required: ['kind', 'data'] },
  ),
} satisfies ComponentApi

export const TableColumnSchema = spec(
  z.object({
    key: z.string().describe('Property key on each row object.'),
    label: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Header label displayed for this column.'),
    align: z.enum(['left', 'center', 'right']).optional(),
    sortable: z.boolean().optional(),
  }),
  { closure: 'additionalProperties' },
)

export const TableApi = {
  name: 'Table',
  schema: spec(
    z
      .object({
        rows: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array of row objects, or a $/path binding to an array in the surface data model.',
        ),
        columns: z
          .array(TableColumnSchema)
          .min(1)
          .describe('Optional explicit column definitions; inferred automatically from row keys when omitted.')
          .optional(),
        title: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Optional table header title.').optional(),
        searchable: z
          .boolean()
          .default(false)
          .describe('When true, displays a search input to filter rows locally.')
          .optional(),
        pageSize: z
          .number()
          .int()
          .min(3)
          .max(100)
          .default(10)
          .describe('Maximum rows shown per page before pagination controls appear.')
          .optional(),
        action: ActionSchema.describe(
          'REF:#/$defs/Action|Optional row drill-down action triggered when the user clicks a table row (attaches the clicked row payload automatically).',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe('Sortable, filterable, paginated data table powered by TanStack Table, with optional row click drill-down action.')
      .strict(),
    { mixins: [], required: ['rows'] },
  ),
} satisfies ComponentApi

export const DshTextApi = {
  name: 'Text',
  schema: spec(
    z
      .object({
        text: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Markdown text (or bound $/path value) to display.',
        ),
        variant: z
          .enum(['body', 'caption', 'h1', 'h2', 'h3', 'h4', 'h5'])
          .describe('Typography style hint: "body" (default), "caption", or heading level "h1".."h5".')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe('Markdown-capable text or heading block.')
      .strict(),
    { mixins: [], required: ['text'] },
  ),
} satisfies ComponentApi

export const StatApi = {
  name: 'Stat',
  schema: spec(
    z
      .object({
        label: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Metric label (e.g. "月活跃用户").'),
        value: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Primary metric value (string, number, $/path, or reactive expression such as calc(...)). Trailing units like %, ms, MB, 万元 are styled automatically.',
        ),
        delta: DynamicValueSchema.describe('REF:#/$defs/DynamicValue|Optional delta badge text or number (e.g. "+14.2%").').optional(),
        trend: z
          .enum(['up', 'down', 'neutral'])
          .describe('Semantic trend direction for coloring the delta tag and sparkline.')
          .optional(),
        spark: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Optional numeric array (or $/path array) rendered as a lightweight inline SVG trend sparkline.',
        ).optional(),
        caption: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Optional secondary note under the metric.').optional(),
        weight: WeightSchema.optional(),
      })
      .describe('Compact KPI metric card displaying a key figure, optional unit split, trend badge, inline SVG sparkline, and caption.')
      .strict(),
    { mixins: [], required: ['label', 'value'] },
  ),
} satisfies ComponentApi

export const ProgressApi = {
  name: 'Progress',
  schema: spec(
    z
      .object({
        value: DynamicNumberSchema.describe('REF:#/$defs/DynamicNumber|Current numeric progress value.'),
        max: z.number().positive().default(100).describe('Maximum value (defaults to 100).').optional(),
        label: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Optional label displayed next to the percentage.').optional(),
        tone: z
          .enum(['brand', 'success', 'warning', 'danger'])
          .default('brand')
          .describe('Visual status color of the progress bar.')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe('Accessible progress bar indicator.')
      .strict(),
    { mixins: [], required: ['value'] },
  ),
} satisfies ComponentApi

export const BadgeApi = {
  name: 'Badge',
  schema: spec(
    z
      .object({
        label: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Badge text content.'),
        tone: z
          .enum(['neutral', 'info', 'success', 'warning', 'danger', 'outline', 'solid'])
          .default('neutral')
          .describe('Semantic color tone.')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe('Compact semantic status tag.')
      .strict(),
    { mixins: [], required: ['label'] },
  ),
} satisfies ComponentApi

export const CodeApi = {
  name: 'Code',
  schema: spec(
    z
      .object({
        code: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Source code or JSON snippet to highlight.'),
        language: z
          .string()
          .default('text')
          .describe('Syntax language identifier such as "typescript", "python", "json", or "bash".')
          .optional(),
        lineNumbers: z.boolean().default(false).describe('Show a line-number gutter.').optional(),
        title: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Optional header label above the code snippet.').optional(),
        filePath: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional workspace file path; renders a 1-click button to open the file in the DSH right sidebar.',
        ).optional(),
        line: DynamicNumberSchema.describe(
          'REF:#/$defs/DynamicNumber|Optional 1-based line number to jump to when opening `filePath`.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe('Syntax-highlighted code block with copy toolbar and optional workspace file jump.')
      .strict(),
    { mixins: [], required: ['code'] },
  ),
} satisfies ComponentApi

export const DiffViewApi = {
  name: 'DiffView',
  schema: spec(
    z
      .object({
        before: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Original text, config, or source code before the change.',
        ),
        after: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Proposed or updated text, config, or source code after the change.',
        ),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional file path or diff header title (e.g. "nginx.conf").',
        ).optional(),
        filePath: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional workspace file path; renders a 1-click button to open the file in the DSH right sidebar.',
        ).optional(),
        line: DynamicNumberSchema.describe(
          'REF:#/$defs/DynamicNumber|Optional 1-based line number to jump to when opening `filePath`.',
        ).optional(),
        language: z
          .string()
          .describe('Optional language hint such as "yaml", "typescript", "json", or "sql".')
          .optional(),
        mode: z
          .enum(['unified', 'split'])
          .default('unified')
          .describe('Initial diff layout: "unified" (inline) or "split" (side-by-side).')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Line-by-line code or config diff viewer with +added/-removed stats, Unified/Split view toggle, and optional workspace file jump.',
      )
      .strict(),
    { mixins: [], required: ['before', 'after'] },
  ),
} satisfies ComponentApi

export const StepsApi = {
  name: 'Steps',
  schema: spec(
    z
      .object({
        items: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array (or $/path array) of step objects `{ title, description?, status?: "done" | "active" | "pending" | "error", meta? }`.',
        ),
        current: DynamicNumberSchema.describe(
          'REF:#/$defs/DynamicNumber|Optional 0-based active step index used when step items omit explicit `status`.',
        ).optional(),
        direction: z
          .enum(['vertical', 'horizontal'])
          .default('vertical')
          .describe('Layout orientation: "vertical" timeline (default) or compact "horizontal" stepper.')
          .optional(),
        title: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Optional stepper header title.').optional(),
        weight: WeightSchema.optional(),
      })
      .describe('Multi-stage execution stepper or incident/workflow timeline.')
      .strict(),
    { mixins: [], required: ['items'] },
  ),
} satisfies ComponentApi

export const CalloutApi = {
  name: 'Callout',
  schema: spec(
    z
      .object({
        title: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Alert headline text.'),
        message: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional Markdown explanation body.',
        ).optional(),
        tone: z
          .enum(['info', 'success', 'warning', 'danger'])
          .default('info')
          .describe('Semantic severity tone.')
          .optional(),
        collapsible: z
          .boolean()
          .default(false)
          .describe('When true, allows collapsing and expanding the callout body.')
          .optional(),
        child: ChildSchema.describe(
          'REF:#/$defs/Child|Optional single child component rendered inside the callout body.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe('Highlighted semantic alert banner (`info`, `success`, `warning`, `danger`) with optional nested child.')
      .strict(),
    { mixins: [], required: ['title'] },
  ),
} satisfies ComponentApi

export const KeyValueApi = {
  name: 'KeyValue',
  schema: spec(
    z
      .object({
        items: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array of `{ label, value, tone?, copyable?, mono? }` entries or a key-value object/$/path map.',
        ),
        title: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Optional section title.').optional(),
        columns: z
          .number()
          .int()
          .min(1)
          .max(3)
          .default(2)
          .describe('Number of grid columns (1 to 3, default 2).')
          .optional(),
        copyable: z
          .boolean()
          .default(false)
          .describe('When true, clicking any value copies it to the clipboard.')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe('Structured key-value attribute grid for metadata, environment configs, HTTP headers, or specs.')
      .strict(),
    { mixins: [], required: ['items'] },
  ),
} satisfies ComponentApi

export const AccordionItemSchema = spec(
  z.object({
    title: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Section header title.'),
    subtitle: DynamicStringSchema.describe(
      'REF:#/$defs/DynamicString|Optional secondary summary shown next to the title.',
    ).optional(),
    badge: DynamicStringSchema.describe(
      'REF:#/$defs/DynamicString|Optional compact status or count tag shown on the header right.',
    ).optional(),
    open: DynamicBooleanSchema.describe(
      'REF:#/$defs/DynamicBoolean|Whether this section starts expanded.',
    ).optional(),
    child: ChildSchema.describe('REF:#/$defs/Child|The ID of the child component rendered inside the panel.'),
  }),
  { closure: 'additionalProperties' },
)

export const AccordionApi = {
  name: 'Accordion',
  schema: spec(
    z
      .object({
        items: z
          .array(AccordionItemSchema)
          .min(1)
          .describe('Ordered list of collapsible sections, each referencing a child component.'),
        multiple: z
          .boolean()
          .default(false)
          .describe('When true, multiple sections may remain expanded simultaneously.')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Collapsible multi-section container (`ChildSchema` flat ID references) for progressive disclosure of detailed panels, FAQs, or diagnostic groups.',
      )
      .strict(),
    { mixins: [], required: ['items'] },
  ),
} satisfies ComponentApi

export const JsonTreeApi = {
  name: 'JsonTree',
  schema: spec(
    z
      .object({
        data: DynamicValueSchema.describe(
        'REF:#/$defs/DynamicValue|Structured JSON object or array (or $/path binding) to inspect.',
        ),
        title: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Optional inspector header title.').optional(),
        expandedDepth: z
          .number()
          .int()
          .min(0)
          .max(8)
          .default(2)
          .describe('Initial tree expansion depth (0..8, default 2).')
          .optional(),
        copyable: z
          .boolean()
          .default(true)
          .describe('Allow copying node values, paths, or JSON subtrees.')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Interactive collapsible JSON inspector powered by DSH shared `JsonTree` primitive with value/path copy support.',
      )
      .strict(),
    { mixins: [], required: ['data'] },
  ),
} satisfies ComponentApi

export const FileTreeApi = {
  name: 'FileTree',
  schema: spec(
    z
      .object({
        items: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array (or $/path array) of `{ path, kind?: "file" | "dir", status?: "added" | "modified" | "deleted" | "renamed", summary?, line? }` entries (or path strings).',
        ),
        title: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Optional file tree header title.').optional(),
        expandedDepth: z
          .number()
          .int()
          .min(0)
          .max(8)
          .default(2)
          .describe('Initial folder expansion depth (default 2).')
          .optional(),
        action: ActionSchema.describe(
          'REF:#/$defs/Action|Optional action dispatched when a file entry is clicked (attaches `{ path, line, item }`).',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Hierarchical workspace directory & change-impact tree; clicking a file opens it in the DSH right sidebar and optionally dispatches an A2UI action.',
      )
      .strict(),
    { mixins: [], required: ['items'] },
  ),
} satisfies ComponentApi

export const MermaidApi = {
  name: 'Mermaid',
  schema: spec(
    z
      .object({
        code: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Mermaid diagram source (`flowchart`, `graph`, `sequenceDiagram`, `stateDiagram-v2`, `classDiagram`, `erDiagram`, `gantt`, `gitGraph`, `journey`, `mindmap`, `timeline`, `pie`).',
        ),
        title: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Optional diagram card header title.').optional(),
        caption: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Optional explanatory note below the diagram.').optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Lazy-loaded Mermaid architecture, sequence, state, ER, Gantt, and mindmap diagram renderer (`securityLevel: "strict"`, SVG-sanitized, with Diagram/Source toggle).',
      )
      .strict(),
    { mixins: [], required: ['code'] },
  ),
} satisfies ComponentApi

/** Standard 18 ComponentApi contracts from the A2UI 1.0 Basic Catalog (with tolerant DshTextApi). */
export const BASIC_COMPONENT_APIS: readonly ComponentApi[] = [
  DshTextApi,
  ImageApi,
  IconApi,
  VideoApi,
  AudioPlayerApi,
  RowApi,
  ColumnApi,
  ListApi,
  CardApi,
  TabsApi,
  ModalApi,
  DividerApi,
  ButtonApi,
  TextFieldApi,
  CheckBoxApi,
  ChoicePickerApi,
  SliderApi,
  DateTimeInputApi,
]

/** DSH-native extended ComponentApi contracts (14 components). */
export const DSH_EXTENDED_COMPONENT_APIS: readonly ComponentApi[] = [
  ChartApi,
  TableApi,
  StatApi,
  ProgressApi,
  BadgeApi,
  CodeApi,
  DiffViewApi,
  StepsApi,
  CalloutApi,
  KeyValueApi,
  AccordionApi,
  JsonTreeApi,
  FileTreeApi,
  MermaidApi,
]

/** Ordered list of all 32 ComponentApi contracts in the DSH A2UI 1.0 catalog. */
export const DSH_COMPONENT_APIS: readonly ComponentApi[] = [
  ...BASIC_COMPONENT_APIS,
  ...DSH_EXTENDED_COMPONENT_APIS,
]

// ---------------------------------------------------------------------------
// DSH-Native Local Renderer Functions (M3)
// ---------------------------------------------------------------------------

/** Copy a resolved text value to the system clipboard on user action (`action=copyText(...)`). */
export const CopyTextApi = {
  name: 'copyText' as const,
  returnType: 'void' as const,
  description: 'Copies the resolved text string to the system clipboard.',
  schema: spec(
    z.object({
      text: DynamicStringSchema.describe('Text or bound $/path to copy.'),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

/** Reactive numeric sum across a bound array (`sum(items=$/rows, field="q2")`). */
export const SumApi = {
  name: 'sum' as const,
  returnType: 'number' as const,
  description: 'Sums numeric values across an array or bound $/path array (optionally reading object[field]).',
  schema: spec(
    z.object({
      items: DynamicValueSchema.describe('Array or bound $/path array of numbers or row objects.'),
      field: z.string().optional().describe('Optional object property name to sum.'),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

/** Reactive numeric average across a bound array (`avg(items=$/rows, field="q2")`). */
export const AvgApi = {
  name: 'avg' as const,
  returnType: 'number' as const,
  description: 'Averages numeric values across an array or bound $/path array (optionally reading object[field]).',
  schema: spec(
    z.object({
      items: DynamicValueSchema.describe('Array or bound $/path array of numbers or row objects.'),
      field: z.string().optional().describe('Optional object property name to average.'),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

/** Zero-latency algebraic formula evaluator (`calc(expr="p * r * (1+r)^n / ((1+r)^n - 1)", vars={ p: $/p, r: $/r, n: $/n }, decimals=2)`). */
export const CalcApi = {
  name: 'calc' as const,
  returnType: 'number' as const,
  description:
    'Evaluates an algebraic formula string safely at 0ms client latency (`+ - * / ^ % ( ) ? : == != < <= > >= && ||` plus `pow, sqrt, exp, log, ln, log10, abs, min, max, clamp, round, floor, ceil, pmt(ratePerPeriod, nper, pv)`) against `vars` (`{ name: $/path }`), validated statically at compile time.',
  schema: spec(
    z.object({
      expr: z
        .string()
        .describe(
          'Algebraic infix expression, e.g. `"w * 10000 * (r/1200) * (1 + r/1200)^(y*12) / ((1 + r/1200)^(y*12) - 1)"` or `"pmt(r/1200, y*12, w*10000)"`.',
        ),
      vars: DynamicValueSchema.optional().describe(
        'Map of variable bindings `{ w: $/wan, y: $/years, r: $/rate }` resolved reactively from $/paths.',
      ),
      decimals: z.number().int().min(0).max(8).optional().describe('Optional decimal rounding (0..8).'),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

/** Reactive equality comparator (`eq(a, b)`), unwrapping single-item ChoicePicker arrays automatically. */
export const EqApi = {
  name: 'eq' as const,
  returnType: 'boolean' as const,
  description: 'Returns true when `a` equals `b` (also matches single-select ChoicePicker array `["x"]` against `"x"`).',
  schema: spec(
    z.object({
      a: DynamicValueSchema.describe('Left value, $/path, or ChoicePicker selection.'),
      b: DynamicValueSchema.describe('Right value or $/path.'),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

/** Reactive strict greater-than (`gt(a, b)`). */
export const GtApi = {
  name: 'gt' as const,
  returnType: 'boolean' as const,
  description: 'Returns true when `a > b` numerically.',
  schema: spec(
    z.object({
      a: DynamicNumberSchema.describe('Left numeric operand or expression.'),
      b: DynamicNumberSchema.describe('Right numeric operand or expression.'),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

/** Reactive strict less-than (`lt(a, b)`). */
export const LtApi = {
  name: 'lt' as const,
  returnType: 'boolean' as const,
  description: 'Returns true when `a < b` numerically.',
  schema: spec(
    z.object({
      a: DynamicNumberSchema.describe('Left numeric operand or expression.'),
      b: DynamicNumberSchema.describe('Right numeric operand or expression.'),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

/** Reactive membership check (`includes(items=$/addons, value="cdn")`). */
export const IncludesApi = {
  name: 'includes' as const,
  returnType: 'boolean' as const,
  description: 'Returns true when array/string `items` contains `value` (ideal for multi-select ChoicePicker).',
  schema: spec(
    z.object({
      items: DynamicValueSchema.describe('Array or string (e.g. ChoicePicker $/path).'),
      value: DynamicValueSchema.describe('Element or substring to test.'),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

/** Reactive ternary selector (`cond(condition=..., truthy="通过", falsy="超标")`). */
export const CondApi = {
  name: 'cond' as const,
  returnType: 'any' as const,
  description: 'Returns `truthy` when `condition` is truthy, otherwise `falsy`.',
  schema: spec(
    z.object({
      condition: DynamicBooleanSchema.describe('Boolean condition or comparator expression (e.g. `gt($/val, 100)`).'),
      truthy: DynamicValueSchema.describe('Value returned when `condition` is true.'),
      falsy: DynamicValueSchema.describe('Value returned when `condition` is false.'),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

export const DSH_FUNCTION_APIS: readonly FunctionApi[] = [
  ...BASIC_FUNCTION_APIS,
  CopyTextApi,
  SumApi,
  AvgApi,
  CalcApi,
  EqApi,
  GtApi,
  LtApi,
  IncludesApi,
  CondApi,
]

export const DSH_CATALOG_INSTRUCTIONS = [
  'Prefer storing mutable form values, step lists, table rows, and chart datasets under $/paths in the surface data model so follow-up turns can update them incrementally with `surface("id", update=true)`.',
  'For KPI overviews, place `Stat(..., spark?=$/trend, weight=1)` items inside a `Row([...])`; for structured metadata/configs, prefer `KeyValue($/meta, columns=2)` or `JsonTree($/payload, title=...)`.',
  'For quantitative visualizations, prefer `Chart(kind, $/data, xField=..., yField=..., title=...)` across its 14 kinds (`bar`, `line`, `area`, `pie`, `scatter`, `radar`, `funnel`, `gauge`, `heatmap`, `treemap`, `sankey`, `boxplot`, `graph`, `candlestick`); for architecture/flow/sequence/state/ER/Gantt diagrams, prefer `Mermaid(code, title=...)`; for >= 4 tabular rows, prefer `Table($/rows, searchable=true)`.',
  'For workspace file trees or change summaries, prefer `FileTree($/files, title=...)`; for config/code review, prefer `DiffView($/before, $/after, title=..., filePath?=...)` or `Code(code, language=..., filePath?=...)`; for progressive disclosure of detailed sections, prefer `Accordion(items=[...])`; for multi-stage plans, prefer `Steps($/stages, current=...)`; for risk warnings, prefer `Callout(title, message, tone=...)`.',
  'Never fabricate real external state: if using illustrative numbers, mark them clearly in titles or captions; never claim an action has executed before receiving `[a2ui-action]`.',
].join('\n')

/** Schema-only catalog consumed by `@a2ui/agent` on the Host and `StreamingExpressSession` on the Client. */
export const dshSchemaCatalog: CatalogApi = new Catalog(
  DSH_CATALOG_ID,
  '1.0',
  DSH_COMPONENT_APIS,
  DSH_FUNCTION_APIS,
  {
    title: 'DeepSeek Harness A2UI 1.0 Catalog',
    description:
      'A2UI 1.0 basic components plus 14 DSH-native extensions: Chart (14 ECharts kinds), Table (TanStack Table), Stat, Progress, Badge, Code, DiffView, Steps, Callout, KeyValue, Accordion, JsonTree, FileTree, and Mermaid.',
    instructions: DSH_CATALOG_INSTRUCTIONS,
    defModels: [WeightSchema],
  },
)
