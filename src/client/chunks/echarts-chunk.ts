/**
 * Self-contained ECharts lazy chunk (`lib/client.echarts.js`).
 *
 * Loaded on demand via `require.async("./client.echarts.js")` only when a
 * surface mounts `<Chart>`. Supports all 19 chart kinds plus `y2Field`,
 * `referenceLine`, `horizontal`, `zoom`, and `sizeField`, deriving all colors
 * from DSH `--dsw-*` tokens.
 */
import * as echarts from 'echarts/core'
import {
  BarChart,
  BoxplotChart,
  CandlestickChart,
  FunnelChart,
  GaugeChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  ParallelChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  SunburstChart,
  TreemapChart,
} from 'echarts/charts'
import {
  CalendarComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  ParallelComponent,
  RadarComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import { LabelLayout, LegacyGridContainLabel } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'
import type { ChartKind } from '../../shared/catalog-schema.ts'
import { resolveClientLocale, RUNTIME_MESSAGES } from '../../shared/i18n.ts'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  RadarChart,
  FunnelChart,
  GaugeChart,
  HeatmapChart,
  TreemapChart,
  SunburstChart,
  ParallelChart,
  SankeyChart,
  BoxplotChart,
  GraphChart,
  CandlestickChart,
  GridComponent,
  LabelLayout,
  LegacyGridContainLabel,
  TooltipComponent,
  LegendComponent,
  RadarComponent,
  ParallelComponent,
  CalendarComponent,
  MarkLineComponent,
  VisualMapComponent,
  DataZoomComponent,
  CanvasRenderer,
])

export type EChartsInstance = echarts.ECharts

export interface ChartOptionInput {
  readonly kind: ChartKind
  readonly data: unknown
  readonly title?: string | undefined
  readonly xField?: string | undefined
  readonly yField?: string | string[] | undefined
  readonly y2Field?: string | string[] | undefined
  readonly seriesField?: string | undefined
  readonly sizeField?: string | undefined
  readonly referenceLine?: number | undefined
  readonly referenceLabel?: string | undefined
  readonly stacked?: boolean | undefined
  readonly horizontal?: boolean | undefined
  readonly zoom?: boolean | undefined
  readonly height?: number | undefined
  readonly selected?: string | undefined
}

export function initChartInstance(el: HTMLElement): EChartsInstance {
  return echarts.init(el)
}

export function sanitizeChartLabel(input: unknown): string {
  if (input === null || input === undefined) return ''
  return String(input).replace(/(?:image|http|https|javascript|data):\/\/\S+/gi, '')
}

function toNumber(input: unknown): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0
  if (typeof input === 'string') {
    const parsed = Number(input.replace(/,/g, '').trim())
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function normalizeChartRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return []
  return data.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item),
  )
}

function readToken(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return val !== '' ? val : fallback
}

function resolvePalette(dark: boolean) {
  const brand = readToken('--dsw-alias-brand-primary', dark ? '#60a5fa' : '#2563eb')
  const success = readToken('--dsw-alias-state-success-primary', dark ? '#34d399' : '#10b981')
  const warn = readToken('--dsw-alias-state-warn-primary', dark ? '#fbbf24' : '#f59e0b')
  const danger = readToken('--dsw-alias-state-error-primary', dark ? '#f87171' : '#ef4444')
  const colors = dark
    ? [brand, success, warn, '#a78bfa', '#38bdf8', '#f472b6', danger]
    : [brand, success, warn, '#7c3aed', '#0284c7', '#db2777', danger]
  return {
    brand,
    success,
    warn,
    danger,
    colors,
    textPrimary: readToken('--dsw-alias-label-primary', dark ? '#e5e7eb' : '#111827'),
    textSecondary: readToken('--dsw-alias-label-secondary', dark ? '#9ca3af' : '#4b5563'),
    border: readToken('--dsw-alias-border-l1', dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'),
    tooltipBg: readToken('--dsw-alias-tooltip-bg', dark ? '#1f2937' : '#ffffff'),
    heatLow: dark ? 'rgba(96, 165, 250, 0.14)' : 'rgba(37, 99, 235, 0.08)',
  }
}

function inferFields(
  rows: readonly Record<string, unknown>[],
  explicitX: string | undefined,
  explicitY: string | string[] | undefined,
): { xKey: string; yKeys: string[] } {
  const sample = rows[0] ?? {}
  const keys = Object.keys(sample)
  const xKey = explicitX ?? keys.find((k) => typeof sample[k] === 'string') ?? keys[0] ?? 'label'

  if (typeof explicitY === 'string' && explicitY !== '') {
    return { xKey, yKeys: [explicitY] }
  }
  if (Array.isArray(explicitY) && explicitY.length > 0) {
    return { xKey, yKeys: explicitY }
  }
  const numericKeys = keys.filter((k) => k !== xKey && typeof sample[k] === 'number')
  return {
    xKey,
    yKeys: numericKeys.length > 0 ? numericKeys : keys.filter((k) => k !== xKey).slice(0, 1),
  }
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]!
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sorted[base + 1] ?? sorted[base]!
  return Number((sorted[base]! + rest * (next - sorted[base]!)).toFixed(2))
}

function extractBoxplotFive(
  row: Record<string, unknown>,
): [number, number, number, number, number] {
  if (Array.isArray(row.values) && row.values.length >= 5) {
    const nums = row.values
      .slice(0, 5)
      .map(toNumber)
      .sort((a, b) => a - b)
    return [nums[0]!, nums[1]!, nums[2]!, nums[3]!, nums[4]!]
  }
  const sampleArr = Array.isArray(row.samples)
    ? row.samples
    : Array.isArray(row.data)
      ? row.data
      : null
  if (sampleArr && sampleArr.length > 0) {
    const sorted = sampleArr.map(toNumber).sort((a, b) => a - b)
    return [
      quantile(sorted, 0),
      quantile(sorted, 0.25),
      quantile(sorted, 0.5),
      quantile(sorted, 0.75),
      quantile(sorted, 1),
    ]
  }
  const min = toNumber(row.min ?? row.low ?? row.p10 ?? row.q0)
  const q1 = toNumber(row.q1 ?? row.p25 ?? row.open ?? min)
  const med = toNumber(row.median ?? row.med ?? row.p50 ?? row.q2 ?? q1)
  const q3 = toNumber(row.q3 ?? row.p75 ?? row.close ?? med)
  const max = toNumber(row.max ?? row.high ?? row.p90 ?? row.q4 ?? q3)
  const ordered = [min, q1, med, q3, max].sort((a, b) => a - b)
  return [ordered[0]!, ordered[1]!, ordered[2]!, ordered[3]!, ordered[4]!]
}

/** Break accidental cycles so ECharts Sankey never throws on cyclic graph edges. */
function filterAcyclicLinks<T extends { source: string; target: string }>(
  links: readonly T[],
): T[] {
  const adj = new Map<string, Set<string>>()
  const canReach = (from: string, goal: string, visited = new Set<string>()): boolean => {
    if (from === goal) return true
    if (visited.has(from)) return false
    visited.add(from)
    const nexts = adj.get(from)
    if (!nexts) return false
    for (const next of nexts) {
      if (canReach(next, goal, visited)) return true
    }
    return false
  }

  const safe: T[] = []
  for (const link of links) {
    if (!link.source || !link.target || link.source === link.target) continue
    if (canReach(link.target, link.source)) continue
    let set = adj.get(link.source)
    if (!set) {
      set = new Set<string>()
      adj.set(link.source, set)
    }
    set.add(link.target)
    safe.push(link)
  }
  return safe
}

function buildZoomConfig(
  enabled: boolean | undefined,
  horizontal: boolean | undefined,
  border: string,
) {
  if (!enabled) return undefined
  return horizontal
    ? [
        { type: 'inside', yAxisIndex: 0 },
        { type: 'slider', yAxisIndex: 0, width: 14, right: 6, borderColor: border },
      ]
    : [
        { type: 'inside', xAxisIndex: 0 },
        { type: 'slider', xAxisIndex: 0, height: 16, bottom: 4, borderColor: border },
      ]
}

function niceUpperBound(v: number): number {
  if (v <= 0) return 0
  const mag = 10 ** Math.floor(Math.log10(v))
  const norm = v / mag
  const step =
    norm <= 1.2
      ? 1.2
      : norm <= 1.5
        ? 1.5
        : norm <= 2
          ? 2
          : norm <= 2.5
            ? 2.5
            : norm <= 3
              ? 3
              : norm <= 4
                ? 4
                : norm <= 5
                  ? 5
                  : norm <= 6
                    ? 6
                    : norm <= 8
                      ? 8
                      : 10
  return Number((step * mag).toPrecision(6))
}

function computeRefAxisBounds(
  values: readonly number[],
  refLine: number | undefined,
  scale = false,
): { min?: number | undefined; max?: number | undefined } {
  if (refLine === undefined || !Number.isFinite(refLine)) return {}
  const finiteVals = values.filter(Number.isFinite)
  const dataMax = finiteVals.length > 0 ? Math.max(...finiteVals) : 0
  const dataMin = finiteVals.length > 0 ? Math.min(...finiteVals) : 0

  let max: number | undefined
  let min: number | undefined

  const dataSpan = Math.max(1, dataMax - dataMin)

  if (refLine > 0 && refLine >= dataMax * 0.94) {
    if (scale && dataSpan < dataMax * 0.35) {
      const target = Math.max(dataMax, refLine) + Math.max(1, dataSpan * 0.28)
      const step = 10 ** Math.max(0, Math.floor(Math.log10(dataSpan)) - 1)
      max = Math.ceil(target / step) * step
    } else {
      max = niceUpperBound(Math.max(dataMax, refLine) * 1.1)
    }
  } else if (refLine <= 0 && refLine > dataMax) {
    max = Math.ceil(refLine + Math.max(1, Math.abs(dataMin - refLine) * 0.1))
  }

  if (refLine < 0 && refLine <= dataMin * 0.94) {
    min = -niceUpperBound(Math.abs(Math.min(dataMin, refLine)) * 1.1)
  } else if (scale && refLine < dataMin) {
    min = refLine >= 0 ? Math.floor(refLine * 0.92) : -niceUpperBound(Math.abs(refLine) * 1.1)
  }

  return { min, max }
}

function pickMarkLinePosition(
  leftValues: readonly number[],
  rightValues: readonly number[],
  refLine: number | undefined,
): 'insideStartTop' | 'insideEndTop' {
  if (refLine === undefined || !Number.isFinite(refLine)) return 'insideEndTop'
  if (leftValues.length === 0 || rightValues.length === 0) return 'insideEndTop'
  const bandLow = refLine - Math.max(1, Math.abs(refLine) * 0.05)
  const obstruction = (vals: readonly number[]) =>
    vals.reduce(
      (score, v) =>
        v >= bandLow ? score + 1000 + Math.max(0, 200 - Math.abs(v - refLine)) : score,
      0,
    )
  const leftScore = obstruction(leftValues)
  const rightScore = obstruction(rightValues)
  if (leftScore !== rightScore) {
    return leftScore < rightScore ? 'insideStartTop' : 'insideEndTop'
  }
  return Math.max(...leftValues) < Math.max(...rightValues) ? 'insideStartTop' : 'insideEndTop'
}

function buildReferenceMarkLine(
  value: number | undefined,
  label: string | undefined,
  horizontal: boolean | undefined,
  color: string,
  dark: boolean,
  position: 'insideStartTop' | 'insideEndTop' = 'insideEndTop',
): Record<string, unknown> | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  const text =
    label !== undefined && label.trim() !== '' ? sanitizeChartLabel(label) : String(value)
  return {
    silent: true,
    symbol: ['none', 'none'],
    lineStyle: { color, type: 'dashed', width: 1.5 },
    label: {
      formatter: text,
      position: horizontal ? 'start' : position,
      rotate: horizontal ? 0 : undefined,
      distance: 4,
      color,
      backgroundColor: dark ? 'rgba(20, 24, 36, 0.90)' : 'rgba(255, 255, 255, 0.92)',
      borderColor: color,
      borderWidth: 1,
      borderRadius: 4,
      padding: [2, 5],
      fontSize: 10,
      fontWeight: 600,
    },
    data: [horizontal ? { xAxis: value } : { yAxis: value }],
  }
}

function buildHierarchyTree(
  rows: readonly Record<string, unknown>[],
  props: ChartOptionInput,
  xKey: string,
  primaryY: string,
): Record<string, unknown>[] {
  const nameField = props.xField ?? 'name'
  const valField = (typeof props.yField === 'string' ? props.yField : undefined) ?? 'value'
  const sample = rows[0] ?? {}
  const implicitGroup =
    typeof sample.parent === 'string'
      ? 'parent'
      : typeof sample.group === 'string'
        ? 'group'
        : undefined
  const groupField = props.seriesField ?? implicitGroup

  if (rows.some((r) => Array.isArray(r.children))) {
    const mapNode = (node: Record<string, unknown>): Record<string, unknown> => ({
      name: sanitizeChartLabel(node[nameField] ?? node.name ?? node.label),
      value:
        node[valField] !== undefined || node.value !== undefined
          ? toNumber(node[valField] ?? node.value)
          : undefined,
      children: Array.isArray(node.children)
        ? (node.children as Record<string, unknown>[])
            .filter((c) => c && typeof c === 'object')
            .map(mapNode)
        : undefined,
    })
    return rows.map(mapNode)
  }

  if (groupField) {
    const groups = new Map<string, { name: string; value: number }[]>()
    const otherLabel = RUNTIME_MESSAGES[resolveClientLocale()].chartOtherGroup
    for (const r of rows) {
      const g = sanitizeChartLabel(r[groupField] ?? otherLabel)
      const list = groups.get(g) ?? []
      list.push({
        name: sanitizeChartLabel(r[nameField] ?? r.name ?? r.label ?? r[xKey]),
        value: toNumber(r[valField] ?? r.value ?? r[primaryY]),
      })
      groups.set(g, list)
    }
    return [...groups.entries()].map(([gName, children]) => ({ name: gName, children }))
  }

  return rows.map((r) => ({
    name: sanitizeChartLabel(r[nameField] ?? r.name ?? r.label ?? r[xKey]),
    value: toNumber(r[valField] ?? r.value ?? r[primaryY]),
  }))
}

function normalizeIsoDate(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const text = String(raw).trim()
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text)
  if (isoMatch) {
    const y = isoMatch[1]!
    const m = isoMatch[2]!.padStart(2, '0')
    const d = isoMatch[3]!.padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function extractCategoryAxisLabels(option: Record<string, unknown>): readonly string[] | null {
  for (const axisKey of ['xAxis', 'yAxis'] as const) {
    const raw = option[axisKey]
    const axis = Array.isArray(raw) ? raw[0] : raw
    if (
      typeof axis === 'object' &&
      axis !== null &&
      (axis as Record<string, unknown>).type === 'category' &&
      Array.isArray((axis as Record<string, unknown>).data)
    ) {
      return ((axis as Record<string, unknown>).data as unknown[]).map((v) =>
        sanitizeChartLabel(v).trim().toLowerCase(),
      )
    }
  }
  return null
}

/**
 * Post-processes any built ECharts option when `selected` is non-empty, dimming
 * non-selected bars/slices/nodes (`opacity: 0.30`) and accenting the active item
 * so Chart ↔ Table cross-filtering has immediate in-canvas visual feedback.
 */
function applyCrossFilterSelection(
  option: echarts.EChartsCoreOption,
  rawSelected: string | undefined,
  dark: boolean,
): echarts.EChartsCoreOption {
  const q = (rawSelected ?? '').trim().toLowerCase()
  if (q === '' || typeof option !== 'object' || option === null) return option

  const opt = option as Record<string, unknown>
  if (!Array.isArray(opt.series)) return option

  const categories = extractCategoryAxisLabels(opt)
  const highlightBorder = dark ? 'rgba(248, 250, 252, 0.92)' : 'rgba(15, 23, 42, 0.82)'

  const nextSeries = (opt.series as Record<string, unknown>[]).map((s) => {
    if (typeof s !== 'object' || s === null) return s
    const type = String(s.type ?? '')
    const seriesNameNorm = sanitizeChartLabel(s.name).trim().toLowerCase()
    const seriesMatched = seriesNameNorm !== '' && seriesNameNorm === q

    if (
      (type === 'pie' || type === 'funnel' || type === 'treemap' || type === 'sunburst') &&
      Array.isArray(s.data)
    ) {
      const nextData = (s.data as unknown[]).map((item) => {
        if (typeof item !== 'object' || item === null) return item
        const rec = item as Record<string, unknown>
        const nameNorm = sanitizeChartLabel(rec.name).trim().toLowerCase()
        const isMatch = nameNorm === q || (nameNorm !== '' && nameNorm.includes(q))
        const prevStyle =
          typeof rec.itemStyle === 'object' && rec.itemStyle !== null
            ? (rec.itemStyle as Record<string, unknown>)
            : {}
        return {
          ...rec,
          itemStyle: {
            ...prevStyle,
            opacity: isMatch ? 1 : 0.3,
            ...(isMatch ? { borderColor: highlightBorder, borderWidth: 1.5 } : {}),
          },
        }
      })
      return { ...s, data: nextData }
    }

    if ((type === 'bar' || type === 'line') && Array.isArray(s.data) && categories) {
      // Skip waterfall transparent helper series
      if (
        typeof s.itemStyle === 'object' &&
        s.itemStyle !== null &&
        (s.itemStyle as Record<string, unknown>).color === 'transparent'
      ) {
        return s
      }
      const nextData = (s.data as unknown[]).map((pt, idx) => {
        const cat = categories[idx] ?? ''
        const isMatch = seriesMatched || cat === q || (cat !== '' && cat.includes(q))
        if (typeof pt === 'object' && pt !== null && !Array.isArray(pt)) {
          const rec = pt as Record<string, unknown>
          const prevStyle =
            typeof rec.itemStyle === 'object' && rec.itemStyle !== null
              ? (rec.itemStyle as Record<string, unknown>)
              : {}
          return {
            ...rec,
            itemStyle: {
              ...prevStyle,
              opacity: isMatch ? 1 : 0.28,
              ...(isMatch && type === 'bar'
                ? { borderColor: highlightBorder, borderWidth: 1.2 }
                : {}),
            },
          }
        }
        return {
          value: pt,
          itemStyle: {
            opacity: isMatch ? 1 : 0.28,
            ...(isMatch && type === 'bar'
              ? { borderColor: highlightBorder, borderWidth: 1.2 }
              : {}),
          },
        }
      })
      return { ...s, data: nextData }
    }

    if ((type === 'sankey' || type === 'graph') && Array.isArray(s.data)) {
      const nextNodes = (s.data as unknown[]).map((node) => {
        if (typeof node !== 'object' || node === null) return node
        const rec = node as Record<string, unknown>
        const nameNorm = sanitizeChartLabel(rec.name).trim().toLowerCase()
        const isMatch = nameNorm === q || (nameNorm !== '' && nameNorm.includes(q))
        const prevStyle =
          typeof rec.itemStyle === 'object' && rec.itemStyle !== null
            ? (rec.itemStyle as Record<string, unknown>)
            : {}
        return {
          ...rec,
          itemStyle: {
            ...prevStyle,
            opacity: isMatch ? 1 : 0.3,
          },
        }
      })
      return { ...s, data: nextNodes }
    }

    return s
  })

  return { ...opt, series: nextSeries }
}

export function buildChartOption(
  props: ChartOptionInput,
  dark: boolean,
  containerWidth?: number,
): echarts.EChartsCoreOption {
  const raw = buildChartOptionInternal(props, dark, containerWidth)
  return applyCrossFilterSelection(raw, props.selected, dark)
}

function buildChartOptionInternal(
  props: ChartOptionInput,
  dark: boolean,
  containerWidth?: number,
): echarts.EChartsCoreOption {
  const rows = normalizeChartRows(props.data)
  const theme = resolvePalette(dark)
  const { xKey, yKeys } = inferFields(rows, props.xField, props.yField)
  const primaryY = yKeys[0] ?? 'value'
  const isCompact = containerWidth !== undefined && containerWidth > 0 && containerWidth < 400

  const baseTooltip = {
    renderMode: 'richText' as const,
    backgroundColor: theme.tooltipBg,
    borderColor: theme.border,
    textStyle: { color: theme.textPrimary, fontSize: 12 },
  }

  /* ── 1 & 2: Pie & Funnel ── */
  if (props.kind === 'pie' || props.kind === 'funnel') {
    const items = rows.map((r) => ({
      name: sanitizeChartLabel(r[xKey] ?? r.name ?? r.label),
      value: toNumber(r[primaryY] ?? r.value),
    }))
    const hideOuterPieLabels = isCompact || items.length > 5
    return {
      color: theme.colors,
      tooltip: {
        ...baseTooltip,
        trigger: 'item',
        formatter: props.kind === 'pie' ? '{b}: {c} ({d}%)' : undefined,
      },
      legend: {
        type: isCompact && items.length >= 4 ? 'scroll' : 'plain',
        bottom: 0,
        itemWidth: 10,
        itemHeight: 8,
        itemGap: 8,
        textStyle: { color: theme.textSecondary, fontSize: 11 },
      },
      series: [
        props.kind === 'pie'
          ? hideOuterPieLabels
            ? {
                type: 'pie',
                radius: ['38%', '64%'],
                center: ['50%', '43%'],
                itemStyle: { borderRadius: 6 },
                label: { show: false, position: 'center' },
                labelLine: { show: false },
                emphasis: {
                  scale: true,
                  scaleSize: 4,
                  label: {
                    show: true,
                    fontSize: 13,
                    fontWeight: 600,
                    lineHeight: 18,
                    color: theme.textPrimary,
                    formatter: '{b}\n{d}%',
                  },
                },
                data: items,
              }
            : {
                type: 'pie',
                radius: ['38%', '62%'],
                center: ['50%', '43%'],
                avoidLabelOverlap: true,
                itemStyle: { borderRadius: 6 },
                label: {
                  color: theme.textSecondary,
                  fontSize: 11.5,
                  formatter: '{b} {d}%',
                  overflow: 'truncate',
                  width: 92,
                },
                data: items,
              }
          : {
              type: 'funnel',
              top: 10,
              bottom: isCompact ? 36 : 38,
              left: isCompact ? '6%' : '12%',
              width: isCompact ? '88%' : '76%',
              minSize: isCompact ? '32%' : '14%',
              labelLayout: { hideOverlap: true },
              label: isCompact
                ? {
                    position: 'inside',
                    color: '#ffffff',
                    textBorderColor: 'rgba(15, 23, 42, 0.72)',
                    textBorderWidth: 2,
                    fontSize: 10,
                    fontWeight: 500,
                    overflow: 'truncate',
                    width: 112,
                  }
                : { color: theme.textPrimary, fontSize: 11.5 },
              data: items,
            },
      ],
    }
  }

  /* ── 3: Gauge ── */
  if (props.kind === 'gauge') {
    const first = rows[0] ?? {}
    const val = toNumber(first[primaryY] ?? first.value ?? 0)
    const name = sanitizeChartLabel(first[xKey] ?? first.name ?? props.title ?? '')
    return {
      color: theme.colors,
      series: [
        {
          type: 'gauge',
          progress: { show: true, width: 12 },
          axisLine: { lineStyle: { width: 12, color: [[1, theme.border]] } },
          axisLabel: { color: theme.textSecondary, fontSize: 10 },
          detail: {
            valueAnimation: true,
            fontSize: 20,
            color: theme.textPrimary,
            offsetCenter: [0, '65%'],
          },
          title: { color: theme.textSecondary, fontSize: 12, offsetCenter: [0, '90%'] },
          data: [{ value: val, name }],
        },
      ],
    }
  }

  /* ── 4: Radar ── */
  if (props.kind === 'radar') {
    const maxVal = Math.max(100, ...rows.flatMap((r) => yKeys.map((k) => toNumber(r[k]))))
    const indicator = rows.map((r) => ({
      name: sanitizeChartLabel(r[xKey]),
      max: Math.ceil(maxVal * 1.15),
    }))
    const isUltraNarrow = containerWidth !== undefined && containerWidth > 0 && containerWidth < 300
    const radiusPct = isUltraNarrow ? 0.38 : isCompact ? 0.48 : yKeys.length > 1 ? 0.58 : 0.65
    const estW = containerWidth !== undefined && containerWidth > 0 ? containerWidth : 520
    const estH = Math.min(640, Math.max(140, props.height ?? 260))
    const rPx = (Math.min(estW, estH) / 2) * radiusPct
    const sideLabelWidth = isCompact
      ? Math.max(42, Math.floor(estW / 2 - rPx - (isUltraNarrow ? 8 : 12)))
      : 96
    const fontPx = isUltraNarrow ? 10 : 11

    const formatRadarAxisName = (raw: string): string => {
      const clean = sanitizeChartLabel(raw)
      if (!isCompact) return clean
      const lines: string[] = []
      let cur = ''
      let curPx = 0
      for (const ch of clean) {
        const w = (ch.codePointAt(0) ?? 0) > 0xff ? fontPx : fontPx * 0.62
        if (cur !== '' && curPx + w > sideLabelWidth) {
          if (lines.length >= 1) {
            lines.push(`${cur}…`)
            return lines.join('\n')
          }
          lines.push(cur)
          cur = ch
          curPx = w
        } else {
          cur += ch
          curPx += w
        }
      }
      if (cur !== '') lines.push(cur)
      return lines.join('\n')
    }

    return {
      color: theme.colors,
      tooltip: { ...baseTooltip, trigger: 'item' },
      legend:
        yKeys.length > 1
          ? {
              type: isUltraNarrow ? 'scroll' : 'plain',
              bottom: 0,
              textStyle: { color: theme.textSecondary, fontSize: 11 },
            }
          : undefined,
      radar: {
        center: yKeys.length > 1 ? ['50%', '46%'] : ['50%', '50%'],
        radius: `${Math.round(radiusPct * 100)}%`,
        axisNameGap: isUltraNarrow ? 6 : 12,
        indicator: indicator.length > 0 ? indicator : [{ name: '-', max: 100 }],
        axisName: {
          color: theme.textSecondary,
          fontSize: fontPx,
          lineHeight: 13,
          formatter: formatRadarAxisName,
        },
        splitLine: { lineStyle: { color: theme.border } },
        splitArea: { show: false },
      },
      series: [
        {
          type: 'radar',
          areaStyle: { opacity: dark ? 0.18 : 0.14 },
          data: yKeys.map((k) => ({
            name: sanitizeChartLabel(k),
            value: rows.map((r) => toNumber(r[k])),
          })),
        },
      ],
    }
  }

  /* ── 5: Heatmap ── */
  if (props.kind === 'heatmap') {
    const sample = rows[0] ?? {}
    const sampleKeys = Object.keys(sample)
    const stringKeys = sampleKeys.filter((k) => typeof sample[k] === 'string')
    const numericKeys = sampleKeys.filter((k) => typeof sample[k] === 'number')

    const hxKey = props.xField ?? stringKeys[0] ?? sampleKeys[0] ?? 'x'
    const explicitYStr = typeof props.yField === 'string' ? props.yField : undefined
    const hyKey =
      explicitYStr && typeof sample[explicitYStr] === 'string'
        ? explicitYStr
        : (props.seriesField ?? stringKeys.find((k) => k !== hxKey) ?? sampleKeys[1] ?? 'y')
    const valKey =
      props.sizeField ??
      (explicitYStr && typeof sample[explicitYStr] === 'number' ? explicitYStr : undefined) ??
      numericKeys.find((k) => k !== hxKey && k !== hyKey) ??
      'value'

    const xCats = [...new Set(rows.map((r) => sanitizeChartLabel(r[hxKey])))]
    const yCats = [...new Set(rows.map((r) => sanitizeChartLabel(r[hyKey])))]
    const values = rows.map((r) => toNumber(r[valKey]))
    const minVal = values.length > 0 ? Math.min(...values) : 0
    const maxVal = values.length > 0 ? Math.max(...values) : 100

    const cells = rows.map((r) => [
      xCats.indexOf(sanitizeChartLabel(r[hxKey])),
      yCats.indexOf(sanitizeChartLabel(r[hyKey])),
      toNumber(r[valKey]),
    ])

    return {
      tooltip: { ...baseTooltip, position: 'top' },
      grid: { top: 14, right: 18, bottom: 58, left: 12, containLabel: true },
      xAxis: {
        type: 'category',
        data: xCats,
        splitArea: { show: true },
        axisLabel: { color: theme.textSecondary, fontSize: 11, hideOverlap: true },
        axisLine: { lineStyle: { color: theme.border } },
      },
      yAxis: {
        type: 'category',
        data: yCats,
        splitArea: { show: true },
        axisLabel: { color: theme.textSecondary, fontSize: 11 },
        axisLine: { lineStyle: { color: theme.border } },
      },
      visualMap: {
        min: minVal,
        max: maxVal === minVal ? minVal + 1 : maxVal,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 2,
        itemWidth: 11,
        itemHeight: isCompact ? 72 : 90,
        textStyle: { color: theme.textSecondary, fontSize: 10 },
        inRange: {
          color: [theme.heatLow, theme.brand],
        },
      },
      series: [
        {
          type: 'heatmap',
          data: cells,
          label: {
            show: cells.length <= 48,
            color: theme.textPrimary,
            fontSize: 11,
          },
          itemStyle: {
            borderRadius: 3,
            borderColor: 'transparent',
            borderWidth: 2,
          },
        },
      ],
    }
  }

  /* ── 6 & 6b: Treemap & Sunburst ── */
  if (props.kind === 'treemap' || props.kind === 'sunburst') {
    const treeData = buildHierarchyTree(rows, props, xKey, primaryY)
    const borderCol = dark ? '#18181b' : '#ffffff'
    const innerSectorHalo = {
      color: '#ffffff',
      textBorderColor: 'rgba(15, 23, 42, 0.68)',
      textBorderWidth: 2.2,
    }

    if (props.kind === 'sunburst') {
      const useInnerOnly =
        isCompact || (containerWidth !== undefined && containerWidth > 0 && containerWidth < 460)
      const estHeight = Math.min(640, Math.max(140, props.height ?? 260))
      const outerRingRadiusPx = estHeight * 0.36
      const outerLabelWidth = Math.max(
        64,
        Math.floor((containerWidth ?? 580) / 2 - outerRingRadiusPx - 18),
      )

      return {
        color: theme.colors,
        tooltip: { ...baseTooltip, trigger: 'item' },
        series: [
          {
            type: 'sunburst',
            center: ['50%', '51%'],
            radius: useInnerOnly ? ['18%', '85%'] : ['18%', '70%'],
            nodeClick: 'rootToNode',
            sort: 'desc',
            minAngle: useInnerOnly ? 16 : 10,
            emphasis: { focus: 'ancestor' },
            labelLayout: { hideOverlap: true },
            itemStyle: {
              borderRadius: 5,
              borderColor: borderCol,
              borderWidth: 2,
            },
            levels: useInnerOnly
              ? [
                  {},
                  {
                    r0: '18%',
                    r: '44%',
                    label: {
                      ...innerSectorHalo,
                      rotate: 'tangential',
                      fontSize: 10,
                      fontWeight: 600,
                      overflow: 'truncate',
                      width: 58,
                    },
                  },
                  {
                    r0: '44%',
                    r: '66%',
                    label: {
                      ...innerSectorHalo,
                      rotate: 'tangential',
                      fontSize: 9.5,
                      fontWeight: 500,
                      overflow: 'truncate',
                      width: 64,
                    },
                  },
                  {
                    r0: '66%',
                    r: '85%',
                    label: {
                      ...innerSectorHalo,
                      rotate: 'tangential',
                      fontSize: 9.5,
                      fontWeight: 500,
                      minAngle: 22,
                      overflow: 'truncate',
                      width: 68,
                    },
                  },
                ]
              : [
                  {},
                  {
                    r0: '18%',
                    r: '43%',
                    label: {
                      ...innerSectorHalo,
                      rotate: 'tangential',
                      fontSize: 10.5,
                      fontWeight: 600,
                      overflow: 'truncate',
                      width: 68,
                    },
                  },
                  {
                    r0: '43%',
                    r: '68%',
                    label: {
                      ...innerSectorHalo,
                      rotate: 'tangential',
                      fontSize: 10,
                      fontWeight: 500,
                      overflow: 'truncate',
                      width: 72,
                    },
                  },
                  {
                    r0: '68%',
                    r: '75%',
                    label: {
                      position: 'outside',
                      rotate: 0,
                      padding: 5,
                      fontSize: 11,
                      color: theme.textPrimary,
                      width: outerLabelWidth,
                      overflow: 'truncate',
                    },
                  },
                ],
            data: treeData,
          },
        ],
      }
    }

    return {
      color: theme.colors,
      tooltip: { ...baseTooltip, trigger: 'item' },
      series: [
        {
          type: 'treemap',
          roam: false,
          breadcrumb: { show: false },
          itemStyle: {
            borderColor: borderCol,
            borderWidth: 2,
            gapWidth: 2,
            borderRadius: 6,
          },
          label: {
            show: true,
            ...innerSectorHalo,
            fontSize: isCompact ? 10 : 11.5,
            lineHeight: isCompact ? 13 : 15,
            fontWeight: 500,
            overflow: 'break',
            ellipsis: '…',
          },
          upperLabel: { show: false },
          data: treeData,
        },
      ],
    }
  }

  /* ── 7: Sankey ── */
  if (props.kind === 'sankey') {
    const srcField = props.xField ?? 'source'
    const tgtField = props.seriesField ?? 'target'
    const valField = (typeof props.yField === 'string' ? props.yField : undefined) ?? 'value'
    const sankeySourceRows =
      rows.length > 0
        ? rows
        : typeof props.data === 'object' &&
            props.data !== null &&
            !Array.isArray(props.data) &&
            Array.isArray((props.data as Record<string, unknown>).links)
          ? normalizeChartRows((props.data as Record<string, unknown>).links)
          : rows

    const rawLinks = sankeySourceRows.map((r) => ({
      source: sanitizeChartLabel(r[srcField] ?? r.source ?? r.from),
      target: sanitizeChartLabel(r[tgtField] ?? r.target ?? r.to),
      value: Math.max(0, toNumber(r[valField] ?? r.value ?? r[primaryY])),
    }))
    const links = filterAcyclicLinks(rawLinks.filter((l) => l.value > 0))
    const nodeNames = [...new Set(links.flatMap((l) => [l.source, l.target]))]
    const sourceSet = new Set(links.map((l) => l.source))
    const rightSideLabels = nodeNames.filter((n) => !sourceSet.has(n))
    const measureCandidates = rightSideLabels.length > 0 ? rightSideLabels : nodeNames
    const maxRightLabelPx = measureCandidates.reduce((acc, label) => {
      let width = 0
      for (const ch of label) {
        width += (ch.codePointAt(0) ?? 0) > 0xff ? 12.2 : 7.0
      }
      return Math.max(acc, width)
    }, 0)
    const maxPad =
      containerWidth !== undefined && containerWidth > 0
        ? Math.max(64, Math.floor(containerWidth * 0.3))
        : 190
    const rightPadding = Math.min(maxPad, Math.max(76, Math.ceil(maxRightLabelPx + 20)))

    // Compute topological stage depth so intermediate-column labels stay inside the inter-column gap
    const depthOf = new Map<string, number>()
    for (const n of nodeNames) depthOf.set(n, 0)
    for (let pass = 0; pass < nodeNames.length; pass++) {
      let changed = false
      for (const l of links) {
        const nextD = (depthOf.get(l.source) ?? 0) + 1
        if (nextD > (depthOf.get(l.target) ?? 0)) {
          depthOf.set(l.target, nextD)
          changed = true
        }
      }
      if (!changed) break
    }
    const maxStage = Math.max(1, ...depthOf.values())
    const estSankeyW = containerWidth !== undefined && containerWidth > 0 ? containerWidth : 560
    const nodeW = isCompact ? 11 : 16
    const stageGap = Math.max(
      36,
      Math.floor((estSankeyW - 12 - rightPadding - nodeW * (maxStage + 1)) / maxStage),
    )
    const labelMaxW = isCompact
      ? Math.max(38, Math.min(stageGap + 6, rightPadding - 10))
      : Math.max(48, rightPadding - 14)

    return {
      color: theme.colors,
      tooltip: { ...baseTooltip, trigger: 'item' },
      series: [
        {
          type: 'sankey',
          top: 12,
          bottom: 12,
          left: 10,
          right: rightPadding,
          emphasis: { focus: 'adjacency' },
          nodeGap: isCompact ? 8 : 10,
          nodeWidth: nodeW,
          labelLayout: { hideOverlap: true },
          lineStyle: { color: 'gradient', curveness: 0.5, opacity: dark ? 0.36 : 0.28 },
          label: {
            color: theme.textPrimary,
            fontSize: isCompact ? 9.5 : 11.5,
            overflow: 'truncate',
            width: labelMaxW,
            textBorderColor: dark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.88)',
            textBorderWidth: 2,
          },
          data: nodeNames.map((name) => ({
            name,
            label:
              !sourceSet.has(name) && isCompact
                ? { width: Math.max(48, rightPadding - 8) }
                : undefined,
          })),
          links,
        },
      ],
    }
  }

  /* ── 8: Graph (Topology / Dependency Network) ── */
  if (props.kind === 'graph') {
    let nodes: Record<string, unknown>[] = []
    let links: Record<string, unknown>[] = []

    const rawObj =
      typeof props.data === 'object' && props.data !== null && !Array.isArray(props.data)
        ? (props.data as Record<string, unknown>)
        : null

    if (rawObj && Array.isArray(rawObj.nodes)) {
      const sizeScale = isCompact ? 0.72 : 1
      nodes = (rawObj.nodes as Record<string, unknown>[])
        .filter((n) => n && typeof n === 'object')
        .map((n) => ({
          id: sanitizeChartLabel(n.id ?? n.name),
          name: sanitizeChartLabel(n.name ?? n.id),
          symbolSize: Math.round(
            (n.size ? Math.min(54, Math.max(18, toNumber(n.size))) : 30) * sizeScale,
          ),
          category:
            n.group !== undefined || n.category !== undefined
              ? sanitizeChartLabel(n.group ?? n.category)
              : undefined,
        }))
      links = Array.isArray(rawObj.links ?? rawObj.edges)
        ? ((rawObj.links ?? rawObj.edges) as Record<string, unknown>[])
            .filter((e) => e && typeof e === 'object')
            .map((e) => ({
              source: sanitizeChartLabel(e.source ?? e.from),
              target: sanitizeChartLabel(e.target ?? e.to),
              label: e.label
                ? {
                    show: true,
                    formatter: sanitizeChartLabel(e.label),
                    fontSize: isCompact ? 9 : 10,
                    color: theme.textSecondary,
                    backgroundColor: isCompact
                      ? dark
                        ? 'rgba(15, 23, 42, 0.78)'
                        : 'rgba(255, 255, 255, 0.85)'
                      : undefined,
                    padding: isCompact ? [1, 3] : undefined,
                    borderRadius: isCompact ? 3 : undefined,
                  }
                : undefined,
            }))
        : []
    } else {
      const srcField = props.xField ?? 'source'
      const tgtField = props.seriesField ?? 'target'
      const seen = new Set<string>()
      for (const r of rows) {
        const s = sanitizeChartLabel(r[srcField] ?? r.source ?? r.from ?? r.name)
        const t = sanitizeChartLabel(r[tgtField] ?? r.target ?? r.to)
        if (s && !seen.has(s)) {
          seen.add(s)
          nodes.push({ id: s, name: s, symbolSize: 30 })
        }
        if (t && !seen.has(t)) {
          seen.add(t)
          nodes.push({ id: t, name: t, symbolSize: 30 })
        }
        if (s && t) {
          links.push({
            source: s,
            target: t,
            label: r.label
              ? {
                  show: true,
                  formatter: sanitizeChartLabel(r.label),
                  fontSize: 10,
                  color: theme.textSecondary,
                }
              : undefined,
          })
        }
      }
    }

    const categories = [
      ...new Set(
        nodes.map((n) => n.category).filter((c): c is string => typeof c === 'string' && c !== ''),
      ),
    ].map((name) => ({ name }))

    const useCircularCompact = isCompact && nodes.length <= 10
    return {
      color: theme.colors,
      tooltip: { ...baseTooltip, trigger: 'item' },
      legend:
        categories.length > 1
          ? {
              bottom: 0,
              data: categories.map((c) => c.name),
              textStyle: { color: theme.textSecondary, fontSize: 11 },
            }
          : undefined,
      series: [
        {
          type: 'graph',
          layout: useCircularCompact ? 'circular' : 'force',
          circular: useCircularCompact ? { rotateLabel: false } : undefined,
          roam: true,
          draggable: !useCircularCompact,
          top: useCircularCompact ? 22 : isCompact ? 16 : 12,
          bottom: categories.length > 1 ? (useCircularCompact ? 50 : isCompact ? 42 : 34) : 24,
          left: useCircularCompact ? 48 : isCompact ? 32 : 18,
          right: useCircularCompact ? 48 : isCompact ? 32 : 18,
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: [4, 8],
          force: useCircularCompact
            ? undefined
            : {
                repulsion: isCompact ? 85 : 180,
                edgeLength: isCompact ? [40, 64] : [65, 120],
                gravity: isCompact ? 0.22 : 0.1,
                layoutAnimation: true,
              },
          labelLayout: { hideOverlap: true },
          label: {
            show: true,
            position: isCompact ? 'bottom' : 'right',
            distance: 4,
            color: theme.textPrimary,
            fontSize: isCompact ? 9.5 : 11.5,
            overflow: 'truncate',
            width: isCompact ? 76 : 112,
            textBorderColor: dark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
            textBorderWidth: 2,
          },
          lineStyle: {
            color: theme.border,
            width: 1.5,
            curveness: useCircularCompact ? 0.18 : 0.12,
            opacity: 0.85,
          },
          categories: categories.length > 0 ? categories : undefined,
          data: nodes.map((n) => ({
            ...n,
            category:
              typeof n.category === 'string'
                ? categories.findIndex((c) => c.name === n.category)
                : undefined,
          })),
          links,
        },
      ],
    }
  }

  /* ── 9: Boxplot ── */
  if (props.kind === 'boxplot') {
    const categories = rows.map((r) => sanitizeChartLabel(r[xKey] ?? r.name ?? r.label))
    const boxData = rows.map((r) => extractBoxplotFive(r))
    const zoomCfg = buildZoomConfig(props.zoom, false, theme.border)
    const boxHighs = boxData.map((b) => b[4] ?? 0)
    const boxMarkPos = pickMarkLinePosition(
      boxHighs.slice(0, Math.min(2, boxHighs.length)),
      boxHighs.slice(Math.max(0, boxHighs.length - 2)),
      props.referenceLine,
    )
    const refLine = buildReferenceMarkLine(
      props.referenceLine,
      props.referenceLabel,
      false,
      theme.danger,
      dark,
      boxMarkPos,
    )
    const bounds = computeRefAxisBounds(boxData.flat(), props.referenceLine)
    const compactWrapCat = isCompact && categories.length >= 2 && categories.length <= 5
    const estW = containerWidth !== undefined && containerWidth > 0 ? containerWidth : 520
    const catSlotPx = Math.max(38, Math.floor((estW - 44) / Math.max(1, categories.length)) - 4)
    const formatCompactCat = (raw: string): string => {
      if (!compactWrapCat) return raw
      const fontPx = 9.5
      let line1 = ''
      let line2 = ''
      let px = 0
      let onSecond = false
      for (const ch of raw) {
        const w = (ch.codePointAt(0) ?? 0) > 0xff ? fontPx : fontPx * 0.62
        if (!onSecond && line1 !== '' && px + w > catSlotPx) {
          onSecond = true
          px = w
          line2 = ch
        } else if (onSecond) {
          if (px + w > catSlotPx) {
            return `${line1}\n${line2}…`
          }
          line2 += ch
          px += w
        } else {
          line1 += ch
          px += w
        }
      }
      return line2 ? `${line1}\n${line2}` : line1
    }
    return {
      color: theme.colors,
      tooltip: { ...baseTooltip, trigger: 'item' },
      grid: { top: 18, right: 18, bottom: props.zoom ? 38 : 16, left: 12, containLabel: true },
      dataZoom: zoomCfg,
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: {
          color: theme.textSecondary,
          fontSize: compactWrapCat ? 9.5 : 11,
          lineHeight: 12,
          interval: compactWrapCat ? 0 : 'auto',
          hideOverlap: !compactWrapCat,
          formatter: compactWrapCat ? formatCompactCat : undefined,
        },
      },
      yAxis: {
        type: 'value',
        ...bounds,
        splitLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.textSecondary, fontSize: 11 },
      },
      series: [
        {
          name: sanitizeChartLabel(
            props.title ?? RUNTIME_MESSAGES[resolveClientLocale()].chartBoxplotDefault,
          ),
          type: 'boxplot',
          itemStyle: {
            color: dark ? 'rgba(96, 165, 250, 0.22)' : 'rgba(37, 99, 235, 0.14)',
            borderColor: theme.brand,
            borderWidth: 1.6,
          },
          markLine: refLine,
          data: boxData,
        },
      ],
    }
  }

  /* ── 10: Candlestick (ECharts order: [open, close, lowest, highest]) ── */
  if (props.kind === 'candlestick') {
    const dateField = props.xField ?? 'date'
    const categories = rows.map((r) =>
      sanitizeChartLabel(r[dateField] ?? r[xKey] ?? r.time ?? r.name),
    )
    const ohlc = rows.map((r) => {
      const open = toNumber(r.open ?? r.o ?? r.start)
      const close = toNumber(r.close ?? r.c ?? r.end ?? open)
      const low = toNumber(r.low ?? r.l ?? r.min ?? Math.min(open, close))
      const high = toNumber(r.high ?? r.h ?? r.max ?? Math.max(open, close))
      return [open, close, Math.min(low, open, close), Math.max(high, open, close)]
    })
    const zoomCfg = buildZoomConfig(props.zoom, false, theme.border)
    const candleHighs = ohlc.map((c) => c[3] ?? 0)
    const candlePos = pickMarkLinePosition(
      candleHighs.slice(0, 2),
      candleHighs.slice(-2),
      props.referenceLine,
    )
    const refLine = buildReferenceMarkLine(
      props.referenceLine,
      props.referenceLabel,
      false,
      theme.warn,
      dark,
      candlePos,
    )
    const bounds = computeRefAxisBounds(ohlc.flat(), props.referenceLine, true)
    return {
      tooltip: { ...baseTooltip, trigger: 'axis' },
      grid: { top: 18, right: 18, bottom: props.zoom ? 38 : 16, left: 12, containLabel: true },
      dataZoom: zoomCfg,
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.textSecondary, fontSize: 11, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        scale: true,
        ...bounds,
        splitLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.textSecondary, fontSize: 11 },
      },
      series: [
        {
          name: sanitizeChartLabel(
            props.title ?? RUNTIME_MESSAGES[resolveClientLocale()].chartCandlestickDefault,
          ),
          type: 'candlestick',
          itemStyle: {
            color: theme.success,
            color0: theme.danger,
            borderColor: theme.success,
            borderColor0: theme.danger,
          },
          markLine: refLine,
          data: ohlc,
        },
      ],
    }
  }

  /* ── 11: Scatter / Bubble (`sizeField`) ── */
  if (props.kind === 'scatter') {
    const numericX = typeof rows[0]?.[xKey] === 'number'
    const sizeKey = props.sizeField
    const rawSizes = sizeKey ? rows.map((r) => Math.max(0, toNumber(r[sizeKey]))) : []
    const maxSize = rawSizes.length > 0 ? Math.max(...rawSizes, 1) : 1
    const computeRadius = (idx: number): number => {
      if (!sizeKey) return isCompact ? 9 : 11
      const ratio = Math.sqrt((rawSizes[idx] ?? 0) / maxSize)
      return isCompact ? Math.round(6 + ratio * 20) : Math.round(8 + ratio * 32)
    }

    const zoomCfg = buildZoomConfig(props.zoom, false, theme.border)
    const scatterYVals = rows.flatMap((r) => yKeys.map((k) => toNumber(r[k])))
    const sortedByX = rows
      .map((r, i) => ({
        x: numericX ? toNumber(r[xKey]) : i,
        y: Math.max(...yKeys.map((k) => toNumber(r[k])), 0),
      }))
      .sort((a, b) => a.x - b.x)
    const midIdx = Math.max(1, Math.floor(sortedByX.length / 2))
    const scatterMarkPos = pickMarkLinePosition(
      sortedByX.slice(0, midIdx).map((p) => p.y),
      sortedByX.slice(midIdx).map((p) => p.y),
      props.referenceLine,
    )
    const refLine = buildReferenceMarkLine(
      props.referenceLine,
      props.referenceLabel,
      false,
      theme.danger,
      dark,
      scatterMarkPos,
    )
    const bounds = computeRefAxisBounds(scatterYVals, props.referenceLine)
    return {
      color: theme.colors,
      tooltip: { ...baseTooltip, trigger: 'item' },
      grid: { top: 18, right: 18, bottom: props.zoom ? 38 : 16, left: 12, containLabel: true },
      dataZoom: zoomCfg,
      xAxis: {
        type: numericX ? 'value' : 'category',
        data: numericX ? undefined : rows.map((r) => sanitizeChartLabel(r[xKey])),
        axisLabel: { color: theme.textSecondary, fontSize: 11, hideOverlap: true },
        splitLine: { lineStyle: { color: theme.border } },
      },
      yAxis: {
        type: 'value',
        ...bounds,
        axisLabel: { color: theme.textSecondary, fontSize: 11 },
        splitLine: { lineStyle: { color: theme.border } },
      },
      series: yKeys.map((k, idx) => ({
        name: sanitizeChartLabel(k),
        type: 'scatter',
        symbolSize: (_val: unknown, params?: { dataIndex?: number }) =>
          computeRadius(params?.dataIndex ?? 0),
        itemStyle: sizeKey ? { opacity: 0.78 } : undefined,
        markLine: idx === 0 ? refLine : undefined,
        data: numericX
          ? rows.map((r) =>
              sizeKey
                ? [toNumber(r[xKey]), toNumber(r[k]), toNumber(r[sizeKey])]
                : [toNumber(r[xKey]), toNumber(r[k])],
            )
          : rows.map((r) => toNumber(r[k])),
      })),
    }
  }

  /* ── 12: Waterfall (Bridge / Variance Decomposition) ── */
  if (props.kind === 'waterfall') {
    const localeMsg = RUNTIME_MESSAGES[resolveClientLocale()]
    const valField =
      (typeof props.yField === 'string' && props.yField !== '' ? props.yField : undefined) ??
      primaryY
    const categories = rows.map((r) => sanitizeChartLabel(r[xKey] ?? r.step ?? r.name ?? r.label))

    let running = 0
    const peaks: number[] = [0]
    const baseData: number[] = []
    const totalData: Array<number | '-'> = []
    const incData: Array<number | '-'> = []
    const decData: Array<number | '-'> = []

    for (const r of rows) {
      const val = toNumber(r[valField] ?? r.delta ?? r.value ?? r.amount)
      const isTotal =
        Boolean(r.total ?? r.isTotal ?? r.summary) || r.type === 'total' || r.kind === 'total'
      if (isTotal) {
        baseData.push(0)
        totalData.push(val)
        incData.push('-')
        decData.push('-')
        running = val
        peaks.push(running)
      } else if (val >= 0) {
        baseData.push(running)
        totalData.push('-')
        incData.push(val)
        decData.push('-')
        running += val
        peaks.push(running)
      } else {
        peaks.push(running)
        running += val
        peaks.push(running)
        baseData.push(running)
        totalData.push('-')
        incData.push('-')
        decData.push(Math.abs(val))
      }
    }

    const zoomCfg = buildZoomConfig(props.zoom, false, theme.border)
    const stepHighs = baseData.map((b, i) => {
      const tot = totalData[i]
      const inc = incData[i]
      const dec = decData[i]
      if (typeof tot === 'number') return tot
      if (typeof inc === 'number') return b + inc
      if (typeof dec === 'number') return b + dec
      return b
    })
    const leftEdge = stepHighs.slice(0, Math.min(2, stepHighs.length))
    const rightEdge = stepHighs.slice(Math.max(0, stepHighs.length - 2))
    const wfMarkPos = pickMarkLinePosition(leftEdge, rightEdge, props.referenceLine)
    const refLine = buildReferenceMarkLine(
      props.referenceLine,
      props.referenceLabel,
      false,
      theme.warn,
      dark,
      wfMarkPos,
    )
    const bounds = computeRefAxisBounds(peaks, props.referenceLine)
    const hasTotal = totalData.some((v) => v !== '-')
    const showBarLabels = rows.length <= 8
    const barLabelFontSize = isCompact ? 9.5 : 10.5

    // Per-bar collision avoidance when a referenceLine + pill is active:
    // - Total/Increase 'top' labels overlapping the dashed line or pill move 'inside' (if tall enough)
    // - Decrease 'bottom' labels overlapping the dashed line or pill flip to 'top'
    const refVal =
      props.referenceLine !== undefined && Number.isFinite(props.referenceLine)
        ? props.referenceLine
        : undefined
    const yMaxEst = bounds.max ?? niceUpperBound(Math.max(...peaks, refVal ?? 0, 1))
    const yMinEst = bounds.min ?? Math.min(0, ...peaks)
    const ySpan = Math.max(1, yMaxEst - yMinEst)
    const refText =
      props.referenceLabel !== undefined && props.referenceLabel.trim() !== ''
        ? sanitizeChartLabel(props.referenceLabel)
        : refVal !== undefined
          ? String(refVal)
          : ''
    const estW = containerWidth !== undefined && containerWidth > 0 ? containerWidth : 520
    const barSlotW = Math.max(22, (estW - 56) / Math.max(1, rows.length))
    const estPillW = Math.max(48, refText.length * 7.8 + 14)
    const pillSpanBars = Math.min(rows.length, Math.max(2, Math.ceil(estPillW / barSlotW)))

    const overlapsRefBand = (idx: number, low: number, high: number): boolean => {
      if (refVal === undefined) return false
      const lineLow = refVal - ySpan * 0.035
      const lineHigh = refVal + ySpan * 0.035
      if (high >= lineLow && low <= lineHigh) return true
      const inPillX =
        wfMarkPos === 'insideStartTop'
          ? idx < pillSpanBars
          : idx >= Math.max(0, rows.length - pillSpanBars)
      if (!inPillX) return false
      const pillLow = refVal - ySpan * 0.02
      const pillHigh = refVal + ySpan * 0.14
      return high >= pillLow && low <= pillHigh
    }

    const insideHaloLabel = {
      position: 'inside' as const,
      color: '#ffffff',
      textBorderColor: 'rgba(15, 23, 42, 0.65)',
      textBorderWidth: 1.8,
      fontWeight: 600,
    }

    const totalItems = totalData.map((val, i) => {
      if (typeof val !== 'number') return val
      if (showBarLabels && overlapsRefBand(i, val, val + ySpan * 0.085)) {
        if (Math.abs(val) >= ySpan * 0.1) {
          return { value: val, label: insideHaloLabel }
        }
      }
      return val
    })

    const incItems = incData.map((val, i) => {
      if (typeof val !== 'number') return val
      const top = (baseData[i] ?? 0) + val
      if (showBarLabels && overlapsRefBand(i, top, top + ySpan * 0.085)) {
        if (val >= ySpan * 0.1) {
          return { value: val, label: insideHaloLabel }
        }
        const bottom = baseData[i] ?? 0
        if (!overlapsRefBand(i, bottom - ySpan * 0.085, bottom)) {
          return { value: val, label: { position: 'bottom' as const } }
        }
      }
      return val
    })

    const decItems = decData.map((val, i) => {
      if (typeof val !== 'number') return val
      const bottom = baseData[i] ?? 0
      const top = bottom + val
      if (showBarLabels && overlapsRefBand(i, bottom - ySpan * 0.085, bottom)) {
        if (!overlapsRefBand(i, top, top + ySpan * 0.085)) {
          return { value: val, label: { position: 'top' as const } }
        }
        if (val >= ySpan * 0.1) {
          return { value: val, label: insideHaloLabel }
        }
      }
      return val
    })

    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          if (!Array.isArray(params)) return ''
          const active = (
            params as Array<{ name?: unknown; seriesName?: unknown; value?: unknown }>
          ).find((p) => p.value !== '-' && p.value !== undefined && p.seriesName !== '')
          if (!active) return ''
          const title = sanitizeChartLabel(active.name)
          const sName = sanitizeChartLabel(active.seriesName)
          const sign = sName === localeMsg.chartWaterfallDecrease ? '-' : ''
          return `${title}<br/>${sName}: ${sign}${sanitizeChartLabel(active.value)}`
        },
      },
      legend: {
        type: isCompact ? 'scroll' : 'plain',
        bottom: props.zoom ? 24 : 0,
        itemWidth: 10,
        itemHeight: 8,
        textStyle: { color: theme.textSecondary, fontSize: 11 },
        data: hasTotal
          ? [
              localeMsg.chartWaterfallTotal,
              localeMsg.chartWaterfallIncrease,
              localeMsg.chartWaterfallDecrease,
            ]
          : [localeMsg.chartWaterfallIncrease, localeMsg.chartWaterfallDecrease],
      },
      dataZoom: zoomCfg,
      grid: {
        top: 22,
        right: 18,
        bottom: 34 + (props.zoom ? 24 : 0),
        left: 12,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { show: false },
        axisLabel: { color: theme.textSecondary, fontSize: 11, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        ...bounds,
        splitLine: { lineStyle: { color: theme.border, type: 'dashed' } },
        axisLabel: { color: theme.textSecondary, fontSize: 11 },
      },
      series: [
        {
          name: '',
          type: 'bar',
          stack: 'waterfall',
          silent: true,
          tooltip: { show: false },
          emphasis: { disabled: true },
          itemStyle: { borderColor: 'transparent', color: 'transparent' },
          data: baseData,
        },
        {
          name: localeMsg.chartWaterfallTotal,
          type: 'bar',
          stack: 'waterfall',
          barMaxWidth: 34,
          itemStyle: { color: theme.brand, borderRadius: [4, 4, 0, 0] },
          labelLayout: { hideOverlap: true },
          label: {
            show: showBarLabels,
            position: 'top',
            color: theme.textPrimary,
            fontSize: barLabelFontSize,
          },
          markLine: hasTotal ? refLine : undefined,
          data: totalItems,
        },
        {
          name: localeMsg.chartWaterfallIncrease,
          type: 'bar',
          stack: 'waterfall',
          barMaxWidth: 34,
          itemStyle: { color: theme.success, borderRadius: [4, 4, 0, 0] },
          labelLayout: { hideOverlap: true },
          label: {
            show: showBarLabels,
            position: 'top',
            color: theme.success,
            fontSize: barLabelFontSize,
            formatter: '+{c}',
          },
          markLine: !hasTotal ? refLine : undefined,
          data: incItems,
        },
        {
          name: localeMsg.chartWaterfallDecrease,
          type: 'bar',
          stack: 'waterfall',
          barMaxWidth: 34,
          itemStyle: { color: theme.danger, borderRadius: [0, 0, 4, 4] },
          labelLayout: { hideOverlap: true },
          label: {
            show: showBarLabels,
            position: 'bottom',
            color: theme.danger,
            fontSize: barLabelFontSize,
            formatter: '-{c}',
          },
          data: decItems,
        },
      ],
    }
  }

  /* ── 13: Combo (Dual-Axis Left Bar + Right Line) ── */
  if (props.kind === 'combo') {
    const categories = [...new Set(rows.map((r) => sanitizeChartLabel(r[xKey])))]
    const explicitY2 =
      typeof props.y2Field === 'string' && props.y2Field !== ''
        ? [props.y2Field]
        : Array.isArray(props.y2Field) && props.y2Field.length > 0
          ? props.y2Field
          : null

    let barKeys: string[]
    let lineKeys: string[]
    if (explicitY2) {
      lineKeys = explicitY2
      const filteredBars = yKeys.filter((k) => !lineKeys.includes(k))
      barKeys = filteredBars.length > 0 ? filteredBars : yKeys.slice(0, 1)
    } else if (yKeys.length >= 2) {
      barKeys = [yKeys[0]!]
      lineKeys = yKeys.slice(1)
    } else {
      const sample = rows[0] ?? {}
      const extraNumeric = Object.keys(sample).filter(
        (k) => k !== xKey && !yKeys.includes(k) && typeof sample[k] === 'number',
      )
      barKeys = yKeys
      lineKeys = extraNumeric.slice(0, 1)
    }

    const barDataList = barKeys.map((k) => rows.map((r) => toNumber(r[k])))
    const lineDataList = lineKeys.map((k) => rows.map((r) => toNumber(r[k])))
    const refEdgeSeries =
      lineDataList.length > 0
        ? (lineDataList[0] ?? [])
        : props.stacked
          ? categories.map((_, i) => barDataList.reduce((acc, arr) => acc + (arr[i] ?? 0), 0))
          : (barDataList[0] ?? [])
    const comboMarkPos = pickMarkLinePosition(
      refEdgeSeries.slice(0, Math.min(2, refEdgeSeries.length)),
      refEdgeSeries.slice(Math.max(0, refEdgeSeries.length - 2)),
      props.referenceLine,
    )
    const refLine = buildReferenceMarkLine(
      props.referenceLine,
      props.referenceLabel,
      false,
      theme.danger,
      dark,
      comboMarkPos,
    )
    const stackKey = props.stacked ? 'comboBar' : undefined
    const barFill = dark ? 'rgba(96, 165, 250, 0.40)' : 'rgba(37, 99, 235, 0.26)'

    const barSeries = barKeys.map((k, idx) => ({
      name: sanitizeChartLabel(k),
      type: 'bar' as const,
      yAxisIndex: 0,
      stack: stackKey,
      barMaxWidth: isCompact ? 20 : 28,
      itemStyle:
        barKeys.length === 1
          ? {
              color: barFill,
              borderColor: theme.brand,
              borderWidth: 1,
              borderRadius: [4, 4, 0, 0],
            }
          : {
              color: theme.colors[idx % theme.colors.length],
              borderRadius: [4, 4, 0, 0],
            },
      markLine: lineKeys.length === 0 && idx === 0 ? refLine : undefined,
      data: barDataList[idx] ?? [],
    }))

    const linePalette = [theme.colors[3] ?? theme.warn, theme.warn, theme.success, theme.danger]
    const lineSeries = lineKeys.map((k, idx) => {
      const col = linePalette[idx % linePalette.length]!
      return {
        name: sanitizeChartLabel(k),
        type: 'line' as const,
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: isCompact ? 5 : 6,
        lineStyle: { color: col, width: isCompact ? 2 : 2.4 },
        itemStyle: { color: col },
        markLine: idx === 0 ? refLine : undefined,
        data: lineDataList[idx] ?? [],
      }
    })

    const barVals = barDataList.flat()
    const lineVals = lineDataList.flat()
    const leftBounds =
      lineKeys.length === 0 ? computeRefAxisBounds(barVals, props.referenceLine) : {}
    const rightBounds =
      lineKeys.length > 0 ? computeRefAxisBounds(lineVals, props.referenceLine) : {}
    const totalSeriesCount = barSeries.length + lineSeries.length

    const zoomCfg = buildZoomConfig(props.zoom, false, theme.border)
    const legendBottom = props.zoom ? (isCompact ? 26 : 24) : 0
    return {
      color: theme.colors,
      tooltip: { ...baseTooltip, trigger: 'axis' },
      legend: {
        type: isCompact || totalSeriesCount >= 4 ? 'scroll' : 'plain',
        bottom: legendBottom,
        itemWidth: isCompact ? 10 : 12,
        itemHeight: 8,
        textStyle: { color: theme.textSecondary, fontSize: isCompact ? 10.5 : 11.5 },
      },
      dataZoom: zoomCfg,
      grid: {
        top: 20,
        right: isCompact ? 8 : 16,
        bottom: (isCompact ? 36 : 34) + legendBottom,
        left: isCompact ? 6 : 12,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { show: false },
        axisLabel: { color: theme.textSecondary, fontSize: isCompact ? 10 : 11, hideOverlap: true },
      },
      yAxis: [
        {
          type: 'value',
          ...leftBounds,
          splitLine: { lineStyle: { color: theme.border, type: 'dashed' } },
          axisLabel: { color: theme.textSecondary, fontSize: isCompact ? 10 : 11 },
        },
        {
          type: 'value',
          ...rightBounds,
          splitLine: { show: false },
          axisLabel: { color: theme.textSecondary, fontSize: isCompact ? 10 : 11 },
        },
      ],
      series: [...barSeries, ...lineSeries],
    }
  }

  /* ── 14: Parallel Coordinates (Multi-Metric Physical Scale Benchmark) ── */
  if (props.kind === 'parallel') {
    const sample = rows[0] ?? {}
    const dimKeys =
      Array.isArray(props.yField) && props.yField.length > 0
        ? props.yField
        : Object.keys(sample).filter(
            (k) =>
              k !== xKey &&
              k !== props.seriesField &&
              (typeof sample[k] === 'number' ||
                (typeof sample[k] === 'string' &&
                  sample[k].trim() !== '' &&
                  !Number.isNaN(Number(sample[k])))),
          )
    const effectiveDims = dimKeys.length > 0 ? dimKeys : yKeys.length > 0 ? yKeys : ['value']
    const labelField = props.seriesField ?? xKey
    const padX = isCompact ? 26 : 44
    const estWidth = containerWidth !== undefined && containerWidth > 0 ? containerWidth : 600
    const axisGap = Math.max(
      36,
      Math.floor((estWidth - padX * 2) / Math.max(1, effectiveDims.length - 1)),
    )
    const staggerHeaders = axisGap < 96 && effectiveDims.length >= 4
    const maxTitleWidth = staggerHeaders ? Math.max(76, axisGap * 1.75) : Math.max(42, axisGap - 8)

    const parallelAxis = effectiveDims.map((dimKey, idx) => {
      const align =
        effectiveDims.length > 1
          ? idx === 0
            ? ('left' as const)
            : idx === effectiveDims.length - 1
              ? ('right' as const)
              : ('center' as const)
          : ('center' as const)
      return {
        dim: idx,
        name: sanitizeChartLabel(dimKey),
        type: 'value' as const,
        scale: true,
        nameLocation: 'end' as const,
        nameGap: staggerHeaders && idx % 2 === 1 ? 23 : 8,
        nameTruncate: {
          maxWidth: maxTitleWidth,
        },
        nameTextStyle: {
          align,
          width: maxTitleWidth,
          overflow: 'truncate' as const,
        },
      }
    })

    const showPerRowLegend = rows.length > 0 && rows.length <= 10
    const parallelSeries = showPerRowLegend
      ? rows.map((r, idx) => ({
          name: sanitizeChartLabel(r[labelField] ?? r.name ?? r.model ?? `#${idx + 1}`),
          type: 'parallel' as const,
          smooth: 0.18,
          lineStyle: { width: 2.4, opacity: 0.9 },
          emphasis: { lineStyle: { width: 3.6, opacity: 1 } },
          data: [effectiveDims.map((k) => toNumber(r[k]))],
        }))
      : [
          {
            name: sanitizeChartLabel(props.title ?? 'Series'),
            type: 'parallel' as const,
            smooth: 0.15,
            lineStyle: { width: 1.8, opacity: 0.65, color: theme.brand },
            emphasis: { lineStyle: { width: 3, opacity: 1 } },
            data: rows.map((r) => effectiveDims.map((k) => toNumber(r[k]))),
          },
        ]

    return {
      color: theme.colors,
      tooltip: { ...baseTooltip, trigger: 'item' },
      legend: showPerRowLegend
        ? {
            type: 'scroll',
            bottom: 0,
            left: 'center',
            itemWidth: 14,
            itemHeight: 3,
            textStyle: { color: theme.textSecondary, fontSize: 11 },
          }
        : undefined,
      parallelAxis,
      parallel: {
        top: staggerHeaders ? 44 : 30,
        bottom: showPerRowLegend ? 34 : 16,
        left: padX,
        right: padX,
        parallelAxisDefault: {
          nameGap: 10,
          nameTextStyle: {
            color: theme.textPrimary,
            fontSize: isCompact ? 10 : 10.5,
            fontWeight: 600,
            width: maxTitleWidth,
            overflow: 'truncate',
          },
          axisLine: { lineStyle: { color: theme.border } },
          axisTick: { lineStyle: { color: theme.border } },
          splitLine: { show: false },
          axisLabel: { color: theme.textSecondary, fontSize: 10 },
        },
      },
      series: parallelSeries,
    }
  }

  /* ── 15: Calendar Heatmap (GitHub-Style Daily Activity Strip) ── */
  if (props.kind === 'calendar') {
    const dateField = props.xField ?? 'date'
    const valField =
      (typeof props.yField === 'string' && props.yField !== '' ? props.yField : undefined) ??
      props.sizeField ??
      primaryY

    const parsedCells: Array<[string, number]> = []
    for (const r of rows) {
      const iso = normalizeIsoDate(r[dateField] ?? r.date ?? r.day ?? r[xKey])
      if (!iso) continue
      const val = toNumber(r[valField] ?? r.value ?? r.count ?? r[primaryY])
      parsedCells.push([iso, val])
    }
    parsedCells.sort((a, b) => a[0].localeCompare(b[0]))

    let rangeStart = '2026-01-01'
    let rangeEnd = '2026-06-30'
    if (parsedCells.length > 0) {
      const firstIso = parsedCells[0]![0]
      const lastIso = parsedCells[parsedCells.length - 1]![0]
      rangeStart = `${firstIso.slice(0, 7)}-01`
      const endYear = Number(lastIso.slice(0, 4))
      const endMonth = Number(lastIso.slice(5, 7))
      const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate()
      rangeEnd = `${lastIso.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`
    }

    const startMs = Date.parse(`${rangeStart}T00:00:00Z`)
    const endMs = Date.parse(`${rangeEnd}T00:00:00Z`)
    const weeksSpan = Math.max(4, Math.ceil((endMs - startMs) / (7 * 86_400_000)))
    const isZh = resolveClientLocale() === 'zh'
    const localeTag = isZh ? 'ZH' : 'EN'
    const calLeft = isCompact ? (isZh ? 24 : 30) : 36
    const calRight = isCompact ? 10 : 16
    const estWidth = containerWidth !== undefined && containerWidth > 0 ? containerWidth : 600
    const estHeight = Math.min(640, Math.max(140, props.height ?? 260))
    const estCellW = Math.max(3, (estWidth - calLeft - calRight) / weeksSpan)
    const maxSquareCellH = Math.max(8, Math.ceil(estCellW * 1.6))
    const rowCellH = Math.max(8, Math.min(20, Math.floor((estHeight - 66) / 7), maxSquareCellH))
    const calGridH = rowCellH * 7
    const calTop = Math.max(28, Math.floor((estHeight - 34 - calGridH) / 2))
    const sparseDayNameMap =
      rowCellH < 12
        ? isZh
          ? ['日', '一', '', '三', '', '五', '']
          : ['', 'M', '', 'W', '', 'F', '']
        : localeTag
    const cellBorderW = estCellW < 7 ? 0.8 : estCellW < 10 ? 1.2 : estCellW < 15 ? 1.8 : 2.5
    const monthSlotPx = estCellW * 4.33
    const monthNameMap =
      monthSlotPx < 24
        ? ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
        : monthSlotPx < 38
          ? isZh
            ? [
                '1月',
                '2月',
                '3月',
                '4月',
                '5月',
                '6月',
                '7月',
                '8月',
                '9月',
                '10月',
                '11月',
                '12月',
              ]
            : 'EN'
          : localeTag
    const monthFontSize = monthSlotPx < 24 ? 9 : isCompact ? 9.5 : 11

    const values = parsedCells.map((c) => c[1])
    const maxVal = values.length > 0 ? Math.max(1, ...values) : 10
    const emptyCellBg = dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(17, 24, 39, 0.05)'
    const greenRamp = dark
      ? [emptyCellBg, 'rgba(52, 211, 153, 0.22)', '#10b981', '#34d399', '#6ee7b7']
      : [emptyCellBg, '#d1fae5', '#6ee7b7', '#10b981', '#047857']

    return {
      tooltip: {
        ...baseTooltip,
        position: 'top',
        formatter: (p: unknown) => {
          const val = (p as { value?: unknown })?.value
          if (Array.isArray(val) && val.length >= 2) {
            return `${sanitizeChartLabel(val[0])}: <strong>${sanitizeChartLabel(val[1])}</strong>`
          }
          return ''
        },
      },
      visualMap: {
        min: 0,
        max: maxVal,
        calculable: false,
        orient: 'horizontal',
        right: calRight,
        bottom: 2,
        itemWidth: 10,
        itemHeight: isCompact ? 52 : 68,
        textStyle: { color: theme.textSecondary, fontSize: 10 },
        inRange: { color: greenRamp },
      },
      calendar: {
        top: calTop,
        left: calLeft,
        right: calRight,
        cellSize: ['auto', rowCellH],
        range: [rangeStart, rangeEnd],
        itemStyle: {
          color: emptyCellBg,
          borderWidth: cellBorderW,
          borderColor: dark ? '#18181b' : '#ffffff',
          borderRadius: estCellW < 9 ? 1.5 : 3,
        },
        splitLine: { show: false },
        yearLabel: { show: false },
        monthLabel: {
          color: theme.textSecondary,
          fontSize: monthFontSize,
          margin: 8,
          nameMap: monthNameMap,
        },
        dayLabel: {
          firstDay: 1,
          color: theme.textSecondary,
          fontSize: rowCellH < 12 ? 9 : isCompact ? 9.5 : 10,
          nameMap: sparseDayNameMap,
        },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: parsedCells,
        },
      ],
    }
  }

  /* ── 16, 17 & 18: Cartesian Bar / Line / Area (+ `horizontal`, `stacked`, `zoom`, `referenceLine`) ── */
  const categories = [...new Set(rows.map((r) => sanitizeChartLabel(r[xKey])))]
  const echartsType = props.kind === 'bar' ? 'bar' : 'line'
  const isArea = props.kind === 'area'
  const isHorizontal = props.kind === 'bar' && Boolean(props.horizontal)
  const stackKey = props.stacked ? 'total' : undefined
  const barRadius = isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]

  let series: Record<string, unknown>[]
  if (props.seriesField) {
    const groupField = props.seriesField
    const groups = [...new Set(rows.map((r) => sanitizeChartLabel(r[groupField])))]
    series = groups.map((group) => ({
      name: group,
      type: echartsType,
      smooth: echartsType === 'line',
      stack: stackKey,
      areaStyle: isArea ? { opacity: 0.2 } : undefined,
      barMaxWidth: 32,
      itemStyle: props.kind === 'bar' ? { borderRadius: barRadius } : undefined,
      data: categories.map((cat) => {
        const match = rows.find(
          (r) => sanitizeChartLabel(r[xKey]) === cat && sanitizeChartLabel(r[groupField]) === group,
        )
        return match ? toNumber(match[primaryY]) : 0
      }),
    }))
  } else {
    series = yKeys.map((k) => ({
      name: sanitizeChartLabel(k),
      type: echartsType,
      smooth: echartsType === 'line',
      stack: stackKey,
      areaStyle: isArea ? { opacity: 0.2 } : undefined,
      barMaxWidth: 32,
      itemStyle: props.kind === 'bar' ? { borderRadius: barRadius } : undefined,
      data: rows.map((r) => toNumber(r[k])),
    }))
  }

  const cartesianEdgeVals = props.stacked
    ? categories.map((_, cIdx) =>
        series.reduce((sum, s) => sum + toNumber((s.data as unknown[])[cIdx]), 0),
      )
    : categories.map((_, cIdx) =>
        Math.max(...series.map((s) => toNumber((s.data as unknown[])[cIdx])), 0),
      )
  const cartMarkPos = isHorizontal
    ? 'insideEndTop'
    : pickMarkLinePosition(
        cartesianEdgeVals.slice(0, Math.min(2, cartesianEdgeVals.length)),
        cartesianEdgeVals.slice(Math.max(0, cartesianEdgeVals.length - 2)),
        props.referenceLine,
      )
  const refLine = buildReferenceMarkLine(
    props.referenceLine,
    props.referenceLabel,
    isHorizontal,
    theme.danger,
    dark,
    cartMarkPos,
  )
  if (series[0] && refLine) {
    series[0].markLine = refLine
  }

  const cartesianVals = props.stacked
    ? cartesianEdgeVals
    : series.flatMap((s) => (s.data as unknown[]).map(toNumber))
  const cartesianBounds = computeRefAxisBounds(cartesianVals, props.referenceLine)

  const showLegend = series.length > 1
  const estCartW = containerWidth !== undefined && containerWidth > 0 ? containerWidth : 560
  const maxHBarLabelW = isCompact
    ? Math.min(92, Math.floor(estCartW * 0.35))
    : Math.min(168, Math.floor(estCartW * 0.34))
  const categoryAxis = {
    type: 'category' as const,
    data: categories,
    inverse: isHorizontal ? true : undefined,
    axisLine: { lineStyle: { color: theme.border } },
    axisLabel: isHorizontal
      ? {
          color: theme.textSecondary,
          fontSize: isCompact ? 10 : 11,
          width: maxHBarLabelW,
          overflow: 'truncate' as const,
          ellipsis: '…',
        }
      : { color: theme.textSecondary, fontSize: 11, hideOverlap: true },
  }
  const valueAxis = {
    type: 'value' as const,
    ...cartesianBounds,
    splitNumber: isHorizontal && isCompact ? 3 : undefined,
    splitLine: { lineStyle: { color: theme.border } },
    axisLabel: {
      color: theme.textSecondary,
      fontSize: isCompact ? 10 : 11,
      hideOverlap: true,
    },
  }
  const zoomCfg = buildZoomConfig(props.zoom, isHorizontal, theme.border)

  return {
    color: theme.colors,
    tooltip: { ...baseTooltip, trigger: 'axis' },
    legend: showLegend
      ? {
          type: isCompact || series.length >= 4 ? 'scroll' : 'plain',
          bottom: props.zoom && !isHorizontal ? 24 : 0,
          textStyle: { color: theme.textSecondary, fontSize: 11.5 },
        }
      : undefined,
    dataZoom: zoomCfg,
    grid: {
      top: isHorizontal && props.referenceLine !== undefined ? 26 : 16,
      right: isHorizontal && props.zoom ? 28 : 18,
      bottom: (showLegend ? 32 : 12) + (props.zoom && !isHorizontal ? 24 : 0),
      left: isHorizontal && isCompact ? 6 : 12,
      containLabel: true,
    },
    xAxis: isHorizontal ? valueAxis : categoryAxis,
    yAxis: isHorizontal ? categoryAxis : valueAxis,
    series,
  }
}
