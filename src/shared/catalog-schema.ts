import {
  ActionSchema,
  AudioPlayerApi,
  BASIC_FUNCTION_APIS,
  ButtonApi,
  CardApi,
  Catalog,
  type CatalogApi,
  CheckBoxApi,
  CheckRuleSchema,
  ChildListSchema,
  ChildSchema,
  ChoicePickerApi,
  ColumnApi,
  type ComponentApi,
  DateTimeInputApi,
  DividerApi,
  DynamicBooleanSchema,
  DynamicNumberSchema,
  DynamicStringListSchema,
  DynamicStringSchema,
  DynamicValueSchema,
  type FunctionApi,
  IconApi,
  ImageApi,
  ListApi,
  ModalApi,
  RowApi,
  SliderApi,
  spec,
  TabsApi,
  TextFieldApi,
  VideoApi,
  WeightSchema,
} from '@a2ui/web_core/v1_0'
import { z } from 'zod'

import {
  A2UI_LIMITS,
  type A2uiEnabled,
  ANSWER_COMMAND,
  ASK_TOOL,
  BASIC_CATALOG_ID,
  CHART_KINDS,
  type ChartKind,
  DSH_CATALOG_ID,
  normalizePlacement,
  RENDER_TOOL,
  SURFACE_PLACEMENTS,
  type SurfacePlacement,
  TIER_COMMAND,
} from './constants.ts'

export {
  A2UI_LIMITS,
  type A2uiEnabled,
  ANSWER_COMMAND,
  ASK_TOOL,
  BASIC_CATALOG_ID,
  CHART_KINDS,
  type ChartKind,
  DSH_CATALOG_ID,
  normalizePlacement,
  RENDER_TOOL,
  SURFACE_PLACEMENTS,
  type SurfacePlacement,
  TIER_COMMAND,
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
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional chart title.',
        ).optional(),
        xField: z
          .string()
          .describe(
            'Property name for the category / X axis (or item label in pie/funnel/gauge/treemap/sunburst/boxplot/waterfall/parallel, source in sankey/graph, or date in candlestick/calendar).',
          )
          .optional(),
        yField: z
          .union([z.string(), z.array(z.string()).min(1)])
          .describe(
            'Property name(s) for numeric series values (or Y category in heatmap, delta in waterfall, left-axis bar values in combo, parallel axis dimensions in parallel, or daily count in calendar); pass an array of field names for multi-series or parallel charts.',
          )
          .optional(),
        y2Field: z
          .union([z.string(), z.array(z.string()).min(1)])
          .describe(
            'Optional property name(s) plotted as line series on a right-hand secondary Y axis (ideal for `combo` dual-axis charts pairing left-axis volume bars with right-axis rate/latency lines).',
          )
          .optional(),
        seriesField: z
          .string()
          .describe(
            'Optional property name used to group rows into separate series (or target node in sankey/graph, parent group in treemap/sunburst).',
          )
          .optional(),
        sizeField: z
          .string()
          .describe(
            'Optional numeric property name mapped to bubble radius on scatter charts or cell intensity on heatmap charts.',
          )
          .optional(),
        referenceLine: DynamicNumberSchema.describe(
          'REF:#/$defs/DynamicNumber|Optional horizontal (or vertical when `horizontal=true`) dashed threshold/target reference line value (e.g. SLO latency limit or budget target).',
        ).optional(),
        referenceLabel: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional label displayed along `referenceLine` (e.g. `"SLO 200ms"` or `"目标 ¥680w"`).',
        ).optional(),
        stacked: z
          .boolean()
          .default(false)
          .describe('Whether to stack series in bar, line, area, or combo charts.')
          .optional(),
        horizontal: z
          .boolean()
          .default(false)
          .describe('When true on bar charts, flips axes into a horizontal bar ranking chart.')
          .optional(),
        zoom: z
          .boolean()
          .default(false)
          .describe(
            'When true on Cartesian charts, enables interactive mouse-wheel and slider dataZoom.',
          )
          .optional(),
        height: z
          .number()
          .min(140)
          .max(640)
          .default(260)
          .describe('Canvas height in pixels.')
          .optional(),
        selected: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional two-way bound $/path storing the clicked category/item for 0ms local cross-filtering with Table or KPIs (clicking the active item clears it).',
        ).optional(),
        exportable: z
          .boolean()
          .default(true)
          .describe(
            'When true (default), displays compact 1-click PNG download and CSV copy actions in the chart header.',
          )
          .optional(),
        action: ActionSchema.describe('REF:#/$defs/Action').optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Interactive lazy-loaded ECharts visualization bound to structured data rows. Supports 19 chart kinds: bar, line, area, pie, scatter, radar, funnel, gauge, heatmap, treemap, sankey, boxplot, graph, candlestick, waterfall, combo, sunburst, parallel, and calendar.',
      )
      .strict(),
    { mixins: [], required: ['kind', 'data'] },
  ),
} satisfies ComponentApi

export const TableColumnSchema = spec(
  z.object({
    key: z.string().describe('Property key on each row object.'),
    label: DynamicStringSchema.describe(
      'REF:#/$defs/DynamicString|Header label displayed for this column.',
    ),
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
          'REF:#/$defs/DynamicValue|Array of row objects, or a $/path binding to an array in the surface data model. Cell values MUST be plain scalar primitives (strings, numbers, booleans — e.g. `"🟢 正常"` / `"🟡 预警"` / `"🔴 异常"` for status columns); nested A2UI components such as Badge or Button are NOT supported inside Table cells.',
        ),
        columns: z
          .array(TableColumnSchema)
          .min(1)
          .describe(
            'Optional explicit column definitions; inferred automatically from row keys when omitted.',
          )
          .optional(),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional table header title.',
        ).optional(),
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
        exportable: z
          .boolean()
          .default(false)
          .describe(
            'When true, displays 1-click CSV export (UTF-8 BOM) and Markdown copy buttons in the table toolbar.',
          )
          .optional(),
        selectable: z
          .boolean()
          .default(false)
          .describe(
            'When true, displays row selection checkboxes and a batch action button that dispatches selected rows via `action`.',
          )
          .optional(),
        batchLabel: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional label for the batch action button when `selectable=true`.',
        ).optional(),
        showSummary: z
          .boolean()
          .default(false)
          .describe('When true, displays a numeric summary footer row across numeric columns.')
          .optional(),
        expandKey: z
          .string()
          .describe(
            'Optional property key on row objects whose text/JSON content can be expanded inline beneath each row (`▸` / `▾`).',
          )
          .optional(),
        filterField: z
          .string()
          .describe(
            'Optional row property key matched against `filterValue` for 0ms local cross-filtering (matches any column when omitted).',
          )
          .optional(),
        filterValue: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional two-way bound $/path filter value (e.g. paired with `Chart(..., selected=$/region)`) that filters rows locally at 0ms.',
        ).optional(),
        action: ActionSchema.describe(
          'REF:#/$defs/Action|Optional row drill-down or batch selection action triggered when clicking a row or batch action button.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Enterprise ProTable powered by TanStack Table: sortable, filterable, paginated, right-aligned tabular numeric columns, with optional 1-click CSV/Markdown export (`exportable=true`), multi-row batch selection (`selectable=true`), and numeric summary footer (`showSummary=true`). Renders plain text/scalar cells only.',
      )
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
          .describe(
            'Typography style hint: "body" (default), "caption", or heading level "h1".."h5".',
          )
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
        label: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Metric label (e.g. "月活跃用户").',
        ),
        value: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Primary metric value (string, number, $/path, or reactive expression such as calc(...)). Trailing units like %, ms, MB, 万元 are styled automatically.',
        ),
        delta: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Optional delta badge text or number (e.g. "+14.2%").',
        ).optional(),
        trend: z
          .enum(['up', 'down', 'neutral'])
          .describe('Semantic trend direction for coloring the delta tag and sparkline.')
          .optional(),
        spark: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Optional numeric array (or $/path array) rendered as a lightweight inline SVG trend sparkline.',
        ).optional(),
        caption: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional secondary note under the metric.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Compact KPI metric card displaying a key figure, optional unit split, trend badge, inline SVG sparkline, and caption. Pass weight=1 when placing multiple equal-width Stat cards side-by-side in a Row.',
      )
      .strict(),
    { mixins: [], required: ['label', 'value'] },
  ),
} satisfies ComponentApi

export const ProgressApi = {
  name: 'Progress',
  schema: spec(
    z
      .object({
        value: DynamicNumberSchema.describe(
          'REF:#/$defs/DynamicNumber|Current numeric progress value.',
        ),
        max: z
          .number()
          .positive()
          .default(100)
          .describe('Maximum value (defaults to 100).')
          .optional(),
        label: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional label displayed next to the percentage.',
        ).optional(),
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
        code: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Source code or JSON snippet to highlight.',
        ),
        language: z
          .string()
          .default('text')
          .describe('Syntax language identifier such as "typescript", "python", "json", or "bash".')
          .optional(),
        lineNumbers: z.boolean().default(false).describe('Show a line-number gutter.').optional(),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional header label above the code snippet.',
        ).optional(),
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
          .describe(
            'Layout orientation: "vertical" timeline (default) or compact "horizontal" stepper.',
          )
          .optional(),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional stepper header title.',
        ).optional(),
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
      .describe(
        'Highlighted semantic alert banner (`info`, `success`, `warning`, `danger`) with optional nested child.',
      )
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
          'REF:#/$defs/DynamicValue|Array of `{ label, value, tone?, copyable?, mono?, span?: 1 | 2 | 3 }` entries or a key-value object/$/path map.',
        ),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional section title.',
        ).optional(),
        columns: z
          .number()
          .int()
          .min(1)
          .max(4)
          .default(2)
          .describe('Number of grid columns (1 to 4, default 2).')
          .optional(),
        bordered: z
          .boolean()
          .default(false)
          .describe(
            'When true, renders an AntD `<Descriptions bordered>` style enterprise specification sheet with shaded label cells and multi-column `span` support.',
          )
          .optional(),
        copyable: z
          .boolean()
          .default(false)
          .describe('When true, clicking any value copies it to the clipboard.')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Structured key-value attribute grid for metadata, environment configs, HTTP headers, or specs.',
      )
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
    child: ChildSchema.describe(
      'REF:#/$defs/Child|The ID of the child component rendered inside the panel.',
    ),
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
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional inspector header title.',
        ).optional(),
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
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional file tree header title.',
        ).optional(),
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
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional diagram card header title.',
        ).optional(),
        caption: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional explanatory note below the diagram.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Lazy-loaded Mermaid architecture, sequence, state, ER, Gantt, and mindmap diagram renderer (`securityLevel: "strict"`, SVG-sanitized, with Diagram/Source toggle).',
      )
      .strict(),
    { mixins: [], required: ['code'] },
  ),
} satisfies ComponentApi

export const SelectApi = {
  name: 'Select',
  schema: spec(
    z
      .object({
        checks: z.array(CheckRuleSchema.describe('REF:#/$defs/CheckRule')).optional(),
        label: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional field label displayed above the dropdown.',
        ).optional(),
        options: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array (or $/path array) of `{ value, label, description? }` option objects (or plain scalar strings).',
        ),
        value: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Currently selected option value, bound to a scalar string `$/path` in the surface data model.',
        ),
        placeholder: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional placeholder shown when `value` does not match any option.',
        ).optional(),
        searchable: z
          .boolean()
          .default(false)
          .describe('When true, displays a filter input inside the dropdown popover.')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Compact single-select dropdown menu (`HostPrimitives.Menu` + optional search filter) bound directly to a scalar string `$/path`.',
      )
      .strict(),
    { mixins: ['Checkable'], required: ['options', 'value'] },
  ),
} satisfies ComponentApi

export const SegmentedApi = {
  name: 'Segmented',
  schema: spec(
    z
      .object({
        checks: z.array(CheckRuleSchema.describe('REF:#/$defs/CheckRule')).optional(),
        label: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional label displayed above the segmented control.',
        ).optional(),
        options: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array (or $/path array) of `{ value, label }` segment items (2–6 options recommended).',
        ),
        value: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Active segment value bound directly to a scalar string `$/path` (simpler than `ChoicePicker` array bindings for mode/period switches).',
        ),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Compact pill-track segmented mode switch powered by `HostPrimitives.SegmentedControl`, bound to a scalar string `$/path`.',
      )
      .strict(),
    { mixins: ['Checkable'], required: ['options', 'value'] },
  ),
} satisfies ComponentApi

export const SwitchApi = {
  name: 'Switch',
  schema: spec(
    z
      .object({
        checks: z.array(CheckRuleSchema.describe('REF:#/$defs/CheckRule')).optional(),
        label: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Primary toggle switch label.',
        ),
        value: DynamicBooleanSchema.describe(
          'REF:#/$defs/DynamicBoolean|Boolean switch state bound to a `$/path` in the surface data model.',
        ),
        description: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional helper description shown below the toggle title.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'iOS/DSH-style boolean toggle switch row powered by `HostPrimitives.Switch`, with optional secondary description.',
      )
      .strict(),
    { mixins: ['Checkable'], required: ['label', 'value'] },
  ),
} satisfies ComponentApi

export const ComparisonApi = {
  name: 'Comparison',
  schema: spec(
    z
      .object({
        options: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array (or $/path array) of option columns `{ key, title, subtitle?, badge?, recommended?: boolean, summary? }`.',
        ),
        rows: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array (or $/path array) of attribute rows `{ label, values: Record<optionKey, string | number | boolean> }`. Cell values support booleans or `"ok:..."`, `"warn:..."`, `"no:..."` prefixes for semantic status icons.',
        ),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional comparison matrix header title.',
        ).optional(),
        action: ActionSchema.describe(
          'REF:#/$defs/Action|Optional action dispatched when the user clicks to adopt an option column (attaches `{ key, title, option }`).',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Side-by-side technical or product trade-off comparison matrix with recommended column highlight, semantic check/warn/cross cells, and optional selection action.',
      )
      .strict(),
    { mixins: [], required: ['options', 'rows'] },
  ),
} satisfies ComponentApi

export const LogViewerApi = {
  name: 'LogViewer',
  schema: spec(
    z
      .object({
        entries: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array (or $/path array) of structured log entries `{ time?, level?: "info" | "warn" | "error" | "debug", service?, message, detail?, filePath?, line? }` (or raw log lines).',
        ),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional log console header title (e.g. "payment-api · stderr").',
        ).optional(),
        searchable: z
          .boolean()
          .default(true)
          .describe('When true (default), shows level filter pills and a search box.')
          .optional(),
        defaultLevel: z
          .enum(['all', 'error', 'warn', 'info', 'debug'])
          .default('all')
          .describe('Initial severity filter.')
          .optional(),
        maxHeight: z
          .number()
          .int()
          .min(140)
          .max(720)
          .default(320)
          .describe('Maximum scrollable log viewport height in pixels.')
          .optional(),
        action: ActionSchema.describe(
          'REF:#/$defs/Action|Optional action dispatched when clicking to diagnose a log entry.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Structured diagnostic log & stack-trace console with severity filter pills, keyword search, collapsible stack trace details, and 1-click DSH sidebar file jump.',
      )
      .strict(),
    { mixins: [], required: ['entries'] },
  ),
} satisfies ComponentApi

export const TimelineItemSchema = spec(
  z.object({
    time: DynamicStringSchema.describe(
      'REF:#/$defs/DynamicString|Optional timestamp or relative offset (e.g. "10:42:05" or "+45s").',
    ).optional(),
    title: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Event headline.'),
    description: DynamicStringSchema.describe(
      'REF:#/$defs/DynamicString|Optional event summary text (Markdown supported).',
    ).optional(),
    actor: DynamicStringSchema.describe(
      'REF:#/$defs/DynamicString|Optional actor, service, or author name.',
    ).optional(),
    status: z
      .enum(['info', 'success', 'warning', 'danger', 'pending'])
      .default('info')
      .describe('Semantic status indicator color.')
      .optional(),
    tag: DynamicStringSchema.describe(
      'REF:#/$defs/DynamicString|Optional compact tag shown beside the headline.',
    ).optional(),
    detail: DynamicStringSchema.describe(
      'REF:#/$defs/DynamicString|Optional collapsible monospace detail or command output.',
    ).optional(),
    child: ChildSchema.describe(
      'REF:#/$defs/Child|Optional nested A2UI component (e.g. `DiffView`, `KeyValue`, `Code`) rendered inside this event.',
    ).optional(),
  }),
  { closure: 'additionalProperties' },
)

export const TimelineApi = {
  name: 'Timeline',
  schema: spec(
    z
      .object({
        items: z
          .array(TimelineItemSchema)
          .min(1)
          .describe('Ordered chronological, incident, or audit events.'),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional timeline header title.',
        ).optional(),
        badge: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional summary tag in the header (e.g. "MTTR 12m").',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Chronological incident, release, or audit activity stream with timestamps, actor tags, collapsible details, and optional nested A2UI `child` components.',
      )
      .strict(),
    { mixins: [], required: ['items'] },
  ),
} satisfies ComponentApi

export const KanbanApi = {
  name: 'Kanban',
  schema: spec(
    z
      .object({
        columns: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array (or $/path array) of board lanes `{ id?, title, tone?: "neutral" | "info" | "warning" | "success" | "danger", cards: [{ id?, title, description?, priority?: "high" | "medium" | "low", tag?, assignee?, meta? }] }`.',
        ),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional Kanban board header title.',
        ).optional(),
        action: ActionSchema.describe(
          'REF:#/$defs/Action|Optional action dispatched when clicking a task card (attaches `{ columnId, columnTitle, card }`).',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Multi-column sprint, triage, or remediation Kanban board with lane counts, priority tags, and optional card drill-down action.',
      )
      .strict(),
    { mixins: [], required: ['columns'] },
  ),
} satisfies ComponentApi

export const SourceListApi = {
  name: 'SourceList',
  schema: spec(
    z
      .object({
        items: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array (or $/path array) of citation/reference items `{ id?, title, url?, domain?, filePath?, line?, snippet?, score?, publishedAt?, badge? }`.',
        ),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional citation list header title.',
        ).optional(),
        action: ActionSchema.describe(
          'REF:#/$defs/Action|Optional action dispatched when clicking a source item.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Numbered research citation, RAG evidence, and workspace code-reference card list with relevance indicators, safe external links, and 1-click DSH sidebar file jump.',
      )
      .strict(),
    { mixins: [], required: ['items'] },
  ),
} satisfies ComponentApi

export const MetricRingApi = {
  name: 'MetricRing',
  schema: spec(
    z
      .object({
        label: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Metric label displayed beside or under the ring.',
        ),
        value: DynamicNumberSchema.describe(
          'REF:#/$defs/DynamicNumber|Current numeric value (supports reactive `$/path` or `calc(...)`).',
        ),
        max: z
          .number()
          .positive()
          .default(100)
          .describe('Maximum ring value (defaults to 100).')
          .optional(),
        unit: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Unit suffix shown in the ring center (defaults to "%" when `max` is 100).',
        ).optional(),
        sublabel: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional secondary caption (e.g. "42 / 64 GB" or "SLO >= 99.9%").',
        ).optional(),
        tone: z
          .enum(['brand', 'success', 'warning', 'danger', 'auto'])
          .default('brand')
          .describe(
            'Ring stroke color ("auto" switches green -> warning -> danger by utilization thresholds).',
          )
          .optional(),
        size: z
          .number()
          .int()
          .min(64)
          .max(180)
          .default(88)
          .describe('SVG ring diameter in pixels (default 88).')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Zero-chunk lightweight SVG radial progress/SLO ring card (~0 kB bundle cost, instant SSR/first-frame render). Pass `weight=1` when placing multiple `MetricRing` cards in a `Row`.',
      )
      .strict(),
    { mixins: [], required: ['label', 'value'] },
  ),
} satisfies ComponentApi

export const ServiceGraphApi = {
  name: 'ServiceGraph',
  schema: spec(
    z
      .object({
        nodes: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array (or $/path array) of service/dependency nodes `{ id, label, status?: "healthy" | "warning" | "error" | "unknown", metric?, sublabel?, group? }`.',
        ),
        edges: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Optional array (or $/path array) of directed call edges `{ from, to, label?, status?: "healthy" | "warning" | "error" }`.',
        ).optional(),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional service topology header title.',
        ).optional(),
        direction: z
          .enum(['LR', 'TB'])
          .default('LR')
          .describe('Topological rank direction: "LR" (left-to-right) or "TB" (top-to-bottom).')
          .optional(),
        action: ActionSchema.describe(
          'REF:#/$defs/Action|Optional action dispatched when clicking to inspect a service node.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Live health-colored service/module dependency DAG with node metrics, latency edge labels, interactive upstream/downstream inspector, and optional drill-down action.',
      )
      .strict(),
    { mixins: [], required: ['nodes'] },
  ),
} satisfies ComponentApi

export const TrackerApi = {
  name: 'Tracker',
  schema: spec(
    z
      .object({
        data: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|For `mode="uptime"` (default): array of time slices `{ label, status?: "ok" | "warning" | "error" | "unknown", note? }`. For `mode="category"`: array of proportion segments `{ label, value, tone?: "brand" | "success" | "warning" | "danger" | "neutral" }`.',
        ),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional tracker card header title.',
        ).optional(),
        summary: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional right-aligned headline metric (e.g. "99.95% Uptime" or "48.2M tok").',
        ).optional(),
        mode: z
          .enum(['uptime', 'category'])
          .default('uptime')
          .describe(
            '"uptime" renders a Tremor-style 30–90 slice health strip with DSH HoverCard tooltips; "category" renders a multi-segment stacked quota/share bar with legend.',
          )
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Zero-chunk Tremor/Vercel-style SLA uptime slice strip (`mode="uptime"`) or multi-segment category proportion bar (`mode="category"`), integrated with DSH `HoverCard` & `StateDot`.',
      )
      .strict(),
    { mixins: [], required: ['data'] },
  ),
} satisfies ComponentApi

export const TerminalApi = {
  name: 'Terminal',
  schema: spec(
    z
      .object({
        commands: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array (or $/path array) of shell steps `{ cmd, output?, stderr?, exitCode?: number, comment? }`, or a shell command string.',
        ),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional runbook or terminal header title.',
        ).optional(),
        cwd: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional working directory badge (e.g. "~/k8s-prod").',
        ).optional(),
        shell: z
          .string()
          .default('zsh')
          .describe('Optional shell badge (e.g. "zsh", "bash", "psql").')
          .optional(),
        maxHeight: z
          .number()
          .int()
          .min(120)
          .max(680)
          .default(340)
          .describe('Maximum scrollable terminal body height in pixels.')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Vercel Geist / DSH DevOps command & execution receipt card showing `$ command`, exit code pills, stdout/stderr separation, and 1-click copy of pure executable commands.',
      )
      .strict(),
    { mixins: [], required: ['commands'] },
  ),
} satisfies ComponentApi

export const ApprovalCardApi = {
  name: 'ApprovalCard',
  schema: spec(
    z
      .object({
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|High-impact operation or change gate headline.',
        ),
        summary: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional secondary context or justification.',
        ).optional(),
        severity: z
          .enum(['low', 'medium', 'high', 'critical'])
          .default('high')
          .describe('Risk severity tier controlling border & badge color.')
          .optional(),
        scope: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional change ticket ID or target environment tag (e.g. "DDL-2026-1119").',
        ).optional(),
        impacts: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Optional array of blast-radius impact bullet strings.',
        ).optional(),
        confirmLabel: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional explicit acknowledgement toggle label that gates the approve button until switched ON.',
        ).optional(),
        approveLabel: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Custom label for the primary approve button.',
        ).optional(),
        rejectLabel: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Custom label for the secondary reject button.',
        ).optional(),
        approveAction: ActionSchema.describe(
          'REF:#/$defs/Action|Action dispatched when the user approves the gate.',
        ).optional(),
        rejectAction: ActionSchema.describe(
          'REF:#/$defs/Action|Optional action dispatched when the user rejects the gate.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Enterprise B2B risk-confirmation & human-in-the-loop approval gate card (`a2ui_ask` or `a2ui_render`) with severity badge, blast-radius checklist, optional acknowledgement switch gate, and Approve/Reject actions.',
      )
      .strict(),
    { mixins: [], required: ['title'] },
  ),
} satisfies ComponentApi

export const ApiEndpointApi = {
  name: 'ApiEndpoint',
  schema: spec(
    z
      .object({
        method: z
          .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
          .describe('HTTP method.'),
        path: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Endpoint route path (path parameters like `{tenantId}` or `:id` are highlighted automatically).',
        ),
        summary: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional endpoint description.',
        ).optional(),
        status: DynamicNumberSchema.describe(
          'REF:#/$defs/DynamicNumber|Optional HTTP response status code (e.g. 200, 201, 422, 503).',
        ).optional(),
        latency: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional latency note (e.g. "34ms").',
        ).optional(),
        baseUrl: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional base origin used when generating the 1-click cURL snippet.',
        ).optional(),
        params: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Optional array of parameter descriptors `{ name, in?: "path" | "query" | "header", type?, required?: boolean, description? }`.',
        ).optional(),
        headers: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Optional map or `{ name, value }` array of HTTP headers.',
        ).optional(),
        requestBody: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Optional JSON request payload inspected via DSH `JsonTree`.',
        ).optional(),
        responseBody: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Optional JSON response payload inspected via DSH `JsonTree`.',
        ).optional(),
        action: ActionSchema.describe(
          'REF:#/$defs/Action|Optional action to trigger or inspect this endpoint via the Agent.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Scalar/Stripe-style API contract & HTTP request/response workbench with method badge, `{param}` route highlighting, tabbed Response/Request/Params views (`DshJsonTree`), and 1-click `curl` copy.',
      )
      .strict(),
    { mixins: [], required: ['method', 'path'] },
  ),
} satisfies ComponentApi

export const ScheduleApi = {
  name: 'Schedule',
  schema: spec(
    z
      .object({
        items: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array (or $/path array) of schedule tracks `{ id?, title, start, end, progress?: number, status?: "done" | "active" | "warning" | "pending" | "danger", owner?, note? }`. `start`/`end` accept `"HH:MM"` times, `"YYYY-MM-DD"`, or numeric offsets.',
        ),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional schedule or maintenance window header title.',
        ).optional(),
        range: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Optional `[minBound, maxBound]` axis tuple (e.g. `["00:00", "06:00"]` or `[0, 100]`); inferred from `items` when omitted.',
        ).optional(),
        now: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional current-time marker (e.g. `"02:30"`) rendered as a vertical reference line.',
        ).optional(),
        action: ActionSchema.describe(
          'REF:#/$defs/Action|Optional action dispatched when clicking a schedule bar.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Crisp Linear-style horizontal Gantt / maintenance-window schedule bar chart with progress fills, owner tags, and `Now` reference marker.',
      )
      .strict(),
    { mixins: [], required: ['items'] },
  ),
} satisfies ComponentApi

export const ResultApi = {
  name: 'Result',
  schema: spec(
    z
      .object({
        status: z
          .enum(['success', 'info', 'warning', 'error', 'empty'])
          .describe('Outcome or empty-state visual variant.'),
        title: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Primary outcome headline.'),
        subtitle: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional secondary explanation or receipt serial number.',
        ).optional(),
        meta: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Optional receipt key-value map or `{ label, value }` list.',
        ).optional(),
        actionLabel: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional CTA button text.',
        ).optional(),
        action: ActionSchema.describe(
          'REF:#/$defs/Action|Optional follow-up CTA action.',
        ).optional(),
        child: ChildSchema.describe(
          'REF:#/$defs/Child|Optional nested A2UI component rendered beneath the receipt summary.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Enterprise operation receipt & guided empty-state card (`success`, `info`, `warning`, `error`, `empty`) with optional receipt metadata pills, nested `child`, and follow-up CTA.',
      )
      .strict(),
    { mixins: [], required: ['status', 'title'] },
  ),
} satisfies ComponentApi

export const EntityHeaderApi = {
  name: 'EntityHeader',
  schema: spec(
    z
      .object({
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Business entity, tenant, cluster, or ticket title.',
        ),
        subtitle: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional secondary identifier/owner metadata line.',
        ).optional(),
        avatarText: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional 1–3 character monogram shown in the entity emblem (auto-derived from `title` when omitted).',
        ).optional(),
        status: z
          .enum(['healthy', 'ongoing', 'warning', 'error', 'offline'])
          .optional()
          .describe('Optional live health indicator rendered with DSH `StateDot`.'),
        statusLabel: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional text shown next to the status dot (e.g. "运行正常").',
        ).optional(),
        badge: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional tier or category badge (e.g. "KA-Enterprise").',
        ).optional(),
        tags: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Optional string array of supplementary tags.',
        ).optional(),
        metrics: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Optional array of 2–5 summary KPIs `{ label, value, tone? }` (or key-value map).',
        ).optional(),
        actionLabel: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional quick action button label.',
        ).optional(),
        action: ActionSchema.describe(
          'REF:#/$defs/Action|Optional quick action dispatched from the entity header.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Enterprise B2B object summary header (`ProDescriptions` / Salesforce / Linear style) combining monogram emblem, DSH `StateDot`, tags, inline KPI strip, and quick action.',
      )
      .strict(),
    { mixins: [], required: ['title'] },
  ),
} satisfies ComponentApi

export const MatrixApi = {
  name: 'Matrix',
  schema: spec(
    z
      .object({
        rows: DynamicValueSchema.describe('REF:#/$defs/DynamicValue|Array of row header labels.'),
        columns: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array of column header labels.',
        ),
        values: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|2D array `values[rowIdx][colIdx]` of numbers, booleans, `null`, or semantic strings (`"ok:..."`, `"warn:..."`, `"no:..."`, `"✓"`, `"—"`).',
        ),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional matrix card title.',
        ).optional(),
        cornerLabel: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional top-left corner header label.',
        ).optional(),
        unit: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional suffix appended to numeric cells (e.g. "%").',
        ).optional(),
        colorScale: z
          .enum(['brand', 'success', 'warning', 'auto'])
          .default('brand')
          .describe('Heat tint color scale applied automatically to numeric cells.')
          .optional(),
        showTotals: z
          .boolean()
          .default(false)
          .describe('When true on numeric matrices, appends a row-average/total summary column.')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'B2B cross-tabulation conditional-formatting heat matrix (cohort retention, P&L sensitivity, benchmark grids) & RBAC role-permission matrix.',
      )
      .strict(),
    { mixins: [], required: ['rows', 'columns', 'values'] },
  ),
} satisfies ComponentApi

export const NumberInputApi = {
  name: 'NumberInput',
  schema: spec(
    z
      .object({
        checks: z.array(CheckRuleSchema.describe('REF:#/$defs/CheckRule')).optional(),
        label: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional field label displayed above the numeric stepper.',
        ).optional(),
        value: DynamicNumberSchema.describe(
          'REF:#/$defs/DynamicNumber|Numeric value bound directly to a number `$/path` in the surface data model (integrates seamlessly with `calc(...)`).',
        ),
        min: z.number().describe('Optional minimum allowed numeric value.').optional(),
        max: z.number().describe('Optional maximum allowed numeric value.').optional(),
        step: z
          .number()
          .positive()
          .default(1)
          .describe('Increment/decrement step size (e.g. 1, 10, 0.05).')
          .optional(),
        unit: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional trailing unit suffix (e.g. "%", "席", "GB", "万元").',
        ).optional(),
        prefix: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional leading currency or symbol prefix (e.g. "¥", "$").',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'AntD `InputNumber`-style precision numeric stepper (`−` / `+` buttons + keyboard input + `prefix`/`unit` affixes) bound directly to a numeric `$/path`.',
      )
      .strict(),
    { mixins: ['Checkable'], required: ['value'] },
  ),
} satisfies ComponentApi

export const MultiSelectApi = {
  name: 'MultiSelect',
  schema: spec(
    z
      .object({
        checks: z.array(CheckRuleSchema.describe('REF:#/$defs/CheckRule')).optional(),
        label: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional field label above the multi-select box.',
        ).optional(),
        options: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array (or $/path array) of `{ value, label, description? }` option objects or strings.',
        ),
        value: DynamicStringListSchema.describe(
          'REF:#/$defs/DynamicStringList|Selected values bound to a `string[]` array `$/path` in the surface data model.',
        ),
        placeholder: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional placeholder shown when empty.',
        ).optional(),
        searchable: z
          .boolean()
          .default(true)
          .describe('When true (default), allows filtering options inside the dropdown.')
          .optional(),
        allowCreate: z
          .boolean()
          .default(false)
          .describe('When true (`tags` mode), pressing Enter on custom text adds a new tag value.')
          .optional(),
        maxTagCount: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(5)
          .describe('Maximum removable tag pills shown inline before collapsing into `+N`.')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'AntD `Select(mode="multiple" | "tags")` compact tag-pill dropdown multi-selector with search filter and optional custom tag creation.',
      )
      .strict(),
    { mixins: ['Checkable'], required: ['options', 'value'] },
  ),
} satisfies ComponentApi

export const DateRangeApi = {
  name: 'DateRange',
  schema: spec(
    z
      .object({
        label: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional field label above the range picker.',
        ).optional(),
        start: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Start date/datetime string bound to a `$/path` (e.g. `"2026-11-01"`).',
        ),
        end: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|End date/datetime string bound to a `$/path` (e.g. `"2026-11-30"`).',
        ),
        presets: z
          .boolean()
          .default(true)
          .describe(
            'When true (default), displays 1-click range preset pills (Today / 7d / 30d / 90d).',
          )
          .optional(),
        enableTime: z
          .boolean()
          .default(false)
          .describe('When true, switches inputs from `YYYY-MM-DD` to `datetime-local`.')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'AntD `RangePicker`-style dual start/end date range selector with quick B2B range presets, span day counter, and automatic `start <= end` ordering.',
      )
      .strict(),
    { mixins: [], required: ['start', 'end'] },
  ),
} satisfies ComponentApi

export const TreeSelectApi = {
  name: 'TreeSelect',
  schema: spec(
    z
      .object({
        checks: z.array(CheckRuleSchema.describe('REF:#/$defs/CheckRule')).optional(),
        label: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional field label above the tree selector.',
        ).optional(),
        nodes: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Recursive tree array `[{ value?, label, badge?, children?: [...] }]`.',
        ),
        value: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Selected node value bound to a scalar string `$/path`.',
        ),
        placeholder: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional placeholder shown when no node is selected.',
        ).optional(),
        searchable: z
          .boolean()
          .default(true)
          .describe('When true (default), filters tree branches by keyword.')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'AntD `TreeSelect` / `Cascader` hierarchical dropdown selector displaying full breadcrumb path (`Cluster / Namespace / Service`) and binding to a scalar string `$/path`.',
      )
      .strict(),
    { mixins: ['Checkable'], required: ['nodes', 'value'] },
  ),
} satisfies ComponentApi

export const CheckCardApi = {
  name: 'CheckCard',
  schema: spec(
    z
      .object({
        checks: z.array(CheckRuleSchema.describe('REF:#/$defs/CheckRule')).optional(),
        label: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional group headline above the cards.',
        ).optional(),
        options: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Array of rich card items `{ value, title, badge?, description?, recommended?: boolean }`.',
        ),
        value: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Optional bound `$/path` (`string` when `multiple=false`, `string[]` when `multiple=true`). Omit `value` and pass `action` for `@ant-design/x` next-step Prompt cards.',
        ).optional(),
        multiple: z
          .boolean()
          .default(false)
          .describe('When true in bound form mode, allows selecting multiple cards (`string[]`).')
          .optional(),
        columns: z
          .number()
          .int()
          .min(1)
          .max(4)
          .default(3)
          .describe('Responsive card grid column count (1..4, default 3).')
          .optional(),
        action: ActionSchema.describe(
          'REF:#/$defs/Action|Optional action dispatched immediately when clicking a Prompt/Action card.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Dual-purpose AntD Pro `<CheckCard.Group>` visual option selector (when `value` is bound) and `@ant-design/x` `<Prompts>` next-step suggestion card grid (when `action` is set).',
      )
      .strict(),
    { mixins: ['Checkable'], required: ['options'] },
  ),
} satisfies ComponentApi

export const TreeApi = {
  name: 'Tree',
  schema: spec(
    z
      .object({
        nodes: DynamicValueSchema.describe(
          'REF:#/$defs/DynamicValue|Recursive hierarchy array `[{ id?, label, sublabel?, badge?, metric?, sharePct?: number, status?: "healthy" | "warning" | "error" | "neutral", children?: [...] }]`.',
        ),
        title: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional tree header title.',
        ).optional(),
        summary: DynamicStringSchema.describe(
          'REF:#/$defs/DynamicString|Optional right-aligned headline summary (e.g. "Total 480ms").',
        ).optional(),
        searchable: z
          .boolean()
          .default(false)
          .describe('When true, displays a keyword search input and Expand/Collapse All toggle.')
          .optional(),
        expandedDepth: z
          .number()
          .int()
          .min(0)
          .max(8)
          .default(3)
          .describe('Initial expanded tree depth (default 3).')
          .optional(),
        action: ActionSchema.describe(
          'REF:#/$defs/Action|Optional action dispatched when clicking a tree node.',
        ).optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'General-purpose AntD `<Tree>` & APM trace waterfall hierarchy supporting org charts, OKR breakdowns, taxonomies, and proportional `sharePct` latency/weight bars.',
      )
      .strict(),
    { mixins: [], required: ['nodes'] },
  ),
} satisfies ComponentApi

export const GridApi = {
  name: 'Grid',
  schema: spec(
    z
      .object({
        children: ChildListSchema.describe(
          'REF:#/$defs/ChildList|Child components arranged automatically into a multi-row equal-width responsive CSS Grid.',
        ),
        columns: z
          .number()
          .int()
          .min(1)
          .max(6)
          .default(3)
          .describe('Number of equal-width grid columns on desktop (1..6, default 3).')
          .optional(),
        gap: z
          .enum(['sm', 'md', 'lg'])
          .default('md')
          .describe('Grid spacing token ("sm" = 8px, "md" = 12px, "lg" = 16px).')
          .optional(),
        weight: WeightSchema.optional(),
      })
      .describe(
        'Responsive multi-row equal-width CSS Grid container (`columns=2|3|4`) eliminating nested `Column([Row, Row])` boilerplate.',
      )
      .strict(),
    { mixins: [], required: ['children'] },
  ),
} satisfies ComponentApi

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
  SelectApi,
  SegmentedApi,
  SwitchApi,
  ComparisonApi,
  LogViewerApi,
  TimelineApi,
  KanbanApi,
  SourceListApi,
  MetricRingApi,
  ServiceGraphApi,
  TrackerApi,
  TerminalApi,
  ApprovalCardApi,
  ApiEndpointApi,
  ScheduleApi,
  ResultApi,
  EntityHeaderApi,
  MatrixApi,
  NumberInputApi,
  MultiSelectApi,
  DateRangeApi,
  TreeSelectApi,
  CheckCardApi,
  TreeApi,
  GridApi,
]

export const DSH_COMPONENT_APIS: readonly ComponentApi[] = [
  ...BASIC_COMPONENT_APIS,
  ...DSH_EXTENDED_COMPONENT_APIS,
]

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

export const SumApi = {
  name: 'sum' as const,
  returnType: 'number' as const,
  description:
    'Sums numeric values across an array or bound $/path array (optionally reading object[field]).',
  schema: spec(
    z.object({
      items: DynamicValueSchema.describe('Array or bound $/path array of numbers or row objects.'),
      field: z.string().optional().describe('Optional object property name to sum.'),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

export const AvgApi = {
  name: 'avg' as const,
  returnType: 'number' as const,
  description:
    'Averages numeric values across an array or bound $/path array (optionally reading object[field]).',
  schema: spec(
    z.object({
      items: DynamicValueSchema.describe('Array or bound $/path array of numbers or row objects.'),
      field: z.string().optional().describe('Optional object property name to average.'),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

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
      decimals: z
        .number()
        .int()
        .min(0)
        .max(8)
        .optional()
        .describe('Optional decimal rounding (0..8).'),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

export const EqApi = {
  name: 'eq' as const,
  returnType: 'boolean' as const,
  description:
    'Returns true when `a` equals `b` (also matches single-select ChoicePicker array `["x"]` against `"x"`).',
  schema: spec(
    z.object({
      a: DynamicValueSchema.describe('Left value, $/path, or ChoicePicker selection.'),
      b: DynamicValueSchema.describe('Right value or $/path.'),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

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

export const IncludesApi = {
  name: 'includes' as const,
  returnType: 'boolean' as const,
  description:
    'Returns true when array/string `items` contains `value` (ideal for multi-select ChoicePicker).',
  schema: spec(
    z.object({
      items: DynamicValueSchema.describe('Array or string (e.g. ChoicePicker $/path).'),
      value: DynamicValueSchema.describe('Element or substring to test.'),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

export const CondApi = {
  name: 'cond' as const,
  returnType: 'any' as const,
  description: 'Returns `truthy` when `condition` is truthy, otherwise `falsy`.',
  schema: spec(
    z.object({
      condition: DynamicBooleanSchema.describe(
        'Boolean condition or comparator expression (e.g. `gt($/val, 100)`).',
      ),
      truthy: DynamicValueSchema.describe('Value returned when `condition` is true.'),
      falsy: DynamicValueSchema.describe('Value returned when `condition` is false.'),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

export const ConcatApi = {
  name: 'concat' as const,
  returnType: 'string' as const,
  description:
    'Joins an array of strings, numbers, or formatted expressions into a single string (e.g. `concat([formatNumber(v), " GB"])`).',
  schema: spec(
    z.object({
      items: DynamicValueSchema.describe(
        'Array of string/number values or reactive expressions to join.',
      ),
    }),
    { closure: 'unevaluatedProperties' },
  ),
} satisfies FunctionApi

export const LookupApi = {
  name: 'lookup' as const,
  returnType: 'any' as const,
  description:
    'Looks up `key` (auto-unwrapping single-select ChoicePicker `["x"]`) in `table`, returning `fallback` when absent.',
  schema: spec(
    z.object({
      key: DynamicValueSchema.describe('Scalar key or single-select ChoicePicker $/path.'),
      table: DynamicValueSchema.describe('Static key -> value map object (e.g. `{ "a800": 80 }`).'),
      fallback: DynamicValueSchema.describe(
        'Default value when `key` is not in `table`.',
      ).optional(),
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
  ConcatApi,
  LookupApi,
]

export const DSH_CATALOG_INSTRUCTIONS = [
  'Prefer storing mutable form values, step lists, table rows, and chart datasets under $/paths in the surface data model so follow-up turns can update them incrementally with `surface("id", update=true)`.',
  'For multi-row equal-width KPI or card grids, prefer `Grid(children, columns?=3, gap?="md")`; for single-row KPI strips, place `Stat(..., spark?=$/trend, weight=1)` or `MetricRing(..., weight=1)` inside `Row([...])`; for structured metadata/descriptions, prefer `KeyValue($/meta, columns=2, bordered?=true)` or `JsonTree($/payload, title=...)`.',
  'For form & calculator controls bound to $/paths, prefer `NumberInput(label, $/num, min?=..., max?=..., step?=..., unit?=...)`, `MultiSelect(label, options, $/tags, allowCreate?=false)`, `DateRange(label, $/start, $/end, presets?=true)`, `TreeSelect(label, nodes, $/choice)`, `CheckCard(label, options, $/choice)`, `Segmented(label, options, $/mode)`, `Select(label, options, $/choice)`, and `Switch(label, $/enabled)`.',
  'For quantitative visualizations, prefer `Chart(kind, $/data, xField=..., yField=..., y2Field?=..., referenceLine?=..., title=...)` across its 19 kinds (`bar`, `line`, `area`, `pie`, `scatter`, `radar`, `funnel`, `gauge`, `heatmap`, `treemap`, `sankey`, `boxplot`, `graph`, `candlestick`, `waterfall`, `combo`, `sunburst`, `parallel`, `calendar`); for architecture/flow/sequence/state/ER/Gantt diagrams, prefer `Mermaid(code, title=...)`; for live health-colored service/module dependency DAGs, prefer `ServiceGraph($/nodes, $/edges, title=...)`.',
  'For multi-option trade-off matrices, prefer `Comparison($/options, $/rows, title=...)`; for >= 4 tabular rows, prefer `Table($/rows, searchable=true, expandKey?=...)`; for hierarchical org/OKR/APM trace trees, prefer `Tree($/nodes, title=...)`; for sprint/remediation lanes, prefer `Kanban($/columns, title=...)`; for research citations or workspace code evidence, prefer `SourceList($/sources, title=...)`.',
  'For workspace file trees or change summaries, prefer `FileTree($/files, title=...)`; for config/code review, prefer `DiffView($/before, $/after, title=..., filePath?=...)` or `Code(code, language=..., filePath?=...)`; for diagnostic logs & stack traces, prefer `LogViewer($/entries, title=...)`; for chronological incident/release streams, prefer `Timeline(items=[...], title=...)`; for progressive disclosure, prefer `Accordion(items=[...])`; for multi-stage plans, prefer `Steps($/stages, current=...)`; for risk warnings, prefer `Callout(title, message, tone=...)`; for clickable follow-up suggestion cards, prefer `CheckCard(label, options, action=Event("follow_up"))`.',
  'Never fabricate real external state: if using illustrative numbers, mark them clearly in titles or captions; never claim an action has executed before receiving `[a2ui-action]`.',
].join('\n')

export const dshSchemaCatalog: CatalogApi = new Catalog(
  DSH_CATALOG_ID,
  '1.0',
  DSH_COMPONENT_APIS,
  DSH_FUNCTION_APIS,
  {
    title: 'DeepSeek Harness A2UI 1.0 Catalog',
    description:
      'A2UI 1.0 basic components plus 39 DSH-native extensions (57 total): Grid, NumberInput, MultiSelect, DateRange, TreeSelect, CheckCard, Tree, Chart (19 ECharts kinds), Table (ProTable), Stat, MetricRing, Tracker, Progress, Badge, Code, Terminal, DiffView, Steps, Timeline, Schedule, Callout, ApprovalCard, Result, EntityHeader, KeyValue (Descriptions), Accordion, JsonTree, ApiEndpoint, FileTree, Mermaid, ServiceGraph, Select, Segmented, Switch, Comparison, Matrix, LogViewer, Kanban, and SourceList.',
    instructions: DSH_CATALOG_INSTRUCTIONS,
    defModels: [WeightSchema],
  },
)
