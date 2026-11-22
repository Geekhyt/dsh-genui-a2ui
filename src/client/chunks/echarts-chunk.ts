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
import * as echarts from 'echarts/core'
import { LabelLayout, LegacyGridContainLabel } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'
import type { ChartKind } from '../../shared/catalog-schema.ts'
import { CHART_MESSAGES, resolveClientLocale } from '../../shared/chart-i18n.ts'
import { sanitizeInlineUrlText } from '../../shared/constants.ts'

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
  readonly selected?: string | readonly string[] | undefined
  readonly interactiveSelect?: boolean | undefined
}

export function initChartInstance(el: HTMLElement): EChartsInstance {
  return echarts.init(el)
}

export function sanitizeChartLabel(input: unknown): string {
  return sanitizeInlineUrlText(input)
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

function resolveCssColorForCanvas(raw: string, fallback: string): string {
  if (raw === '') return fallback
  if (/^rgba?\([\d.,\s]+\)$/i.test(raw) || /^#[0-9a-f]{3,8}$/i.test(raw)) return raw
  if (typeof document === 'undefined' || !document.body) return fallback
  const probe = document.createElement('span')
  probe.style.setProperty('color', raw, 'important')
  if (probe.style.color === '') return fallback
  probe.style.setProperty('display', 'none', 'important')
  document.body.appendChild(probe)
  let computed = ''
  try {
    computed = getComputedStyle(probe).color
  } finally {
    probe.remove()
  }
  if (/^rgba?\([\d.,\s]+\)$/i.test(computed) || /^#[0-9a-f]{3,8}$/i.test(computed)) return computed
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return fallback
  ctx.fillStyle = '#010203'
  const sentinel = ctx.fillStyle
  ctx.fillStyle = computed
  if (ctx.fillStyle === sentinel) return fallback
  try {
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return `rgba(${r}, ${g}, ${b}, ${(a ?? 255) / 255})`
  } catch {
    return fallback
  }
}

function readToken(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const source = document.body ?? document.documentElement
  const val = getComputedStyle(source).getPropertyValue(name).trim()
  if (val === '') return fallback
  return resolveCssColorForCanvas(val, fallback)
}

function parseColorRgb(color: string): readonly [number, number, number] | null {
  const trimmed = color.trim()
  const rgb = trimmed.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
  if (rgb) {
    const r = Number(rgb[1])
    const g = Number(rgb[2])
    const b = Number(rgb[3])
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) return [r, g, b]
  }
  const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
  if (hex) {
    const raw = hex[1] ?? ''
    const rgbHex =
      raw.length === 3 || raw.length === 4
        ? raw
            .slice(0, 3)
            .split('')
            .map((ch) => ch + ch)
            .join('')
        : raw.slice(0, 6)
    const r = Number.parseInt(rgbHex.slice(0, 2), 16)
    const g = Number.parseInt(rgbHex.slice(2, 4), 16)
    const b = Number.parseInt(rgbHex.slice(4, 6), 16)
    return [r, g, b]
  }
  return null
}

function relativeLuminance(rgb: readonly [number, number, number]): number {
  const lin = (c: number) => {
    const s = Math.max(0, Math.min(1, c / 255))
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
}

function contrastRatio(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

function resolveTooltipTextAndBorder(
  tooltipBg: string,
  rawTooltipLabel: string,
  fallbackBorder: string,
  dark: boolean,
): { readonly tooltipText: string; readonly tooltipBorder: string } {
  const bgRgb = parseColorRgb(tooltipBg)
  if (!bgRgb) {
    return {
      tooltipText: rawTooltipLabel || (dark ? '#f9fafb' : '#0f1115'),
      tooltipBorder: fallbackBorder,
    }
  }
  const bgLum = relativeLuminance(bgRgb)
  const isDarkBg = bgLum < 0.42
  const tooltipBorder = isDarkBg ? 'rgba(255, 255, 255, 0.16)' : fallbackBorder
  const candidateRgb = rawTooltipLabel ? parseColorRgb(rawTooltipLabel) : null
  if (candidateRgb && contrastRatio(bgRgb, candidateRgb) >= 4.5) {
    return { tooltipText: rawTooltipLabel, tooltipBorder }
  }
  return {
    tooltipText: isDarkBg ? '#f9fafb' : '#0f1115',
    tooltipBorder,
  }
}

function isChromaticCanvasColor(color: string): boolean {
  const rgb = parseColorRgb(color)
  if (!rgb) return true
  return Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]) >= 24
}

function readChromaticToken(name: string, fallback: string): string {
  const resolved = readToken(name, fallback)
  return isChromaticCanvasColor(resolved) ? resolved : fallback
}

function resolvePalette(dark: boolean) {
  const brand = readChromaticToken(
    '--dsw-alias-state-business-primary',
    dark ? '#60a5fa' : '#2563eb',
  )
  const success = readChromaticToken(
    '--dsw-alias-state-success-primary',
    dark ? '#34d399' : '#10b981',
  )
  const warn = readChromaticToken('--dsw-alias-state-warn-primary', dark ? '#fbbf24' : '#f59e0b')
  const danger = readChromaticToken('--dsw-alias-state-error-primary', dark ? '#f87171' : '#ef4444')
  const colors = dark
    ? [brand, success, warn, '#a78bfa', '#38bdf8', '#f472b6', danger]
    : [brand, success, warn, '#7c3aed', '#0284c7', '#db2777', danger]
  const border = readToken(
    '--dsw-alias-border-l1',
    dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
  )
  const tooltipBg = readToken('--dsw-alias-tooltip-bg', dark ? '#1f2937' : '#ffffff')
  const rawTooltipLabel = readToken('--dsw-alias-tooltip-label', '')
  const { tooltipText, tooltipBorder } = resolveTooltipTextAndBorder(
    tooltipBg,
    rawTooltipLabel,
    border,
    dark,
  )
  return {
    brand,
    success,
    warn,
    danger,
    colors,
    textPrimary: readToken('--dsw-alias-label-primary', dark ? '#e5e7eb' : '#111827'),
    textSecondary: readToken('--dsw-alias-label-secondary', dark ? '#9ca3af' : '#4b5563'),
    border,
    tooltipBg,
    tooltipText,
    tooltipBorder,
    heatLow: dark ? 'rgba(96, 165, 250, 0.14)' : 'rgba(37, 99, 235, 0.08)',
  }
}

function inferFields(
  rows: readonly Record<string, unknown>[],
  explicitX: string | undefined,
  explicitY: string | string[] | undefined,
  excludeKeys?: readonly (string | undefined)[],
): { xKey: string; yKeys: string[] } {
  const excluded = new Set((excludeKeys ?? []).filter((k): k is string => Boolean(k)))
  const sampleSlice = rows.slice(0, 16)
  const keys: string[] = []
  const seenKeys = new Set<string>()
  for (const row of sampleSlice) {
    for (const k of Object.keys(row)) {
      if (!seenKeys.has(k)) {
        seenKeys.add(k)
        keys.push(k)
      }
    }
  }
  const hasStringVal = (k: string) => sampleSlice.some((r) => typeof r[k] === 'string')
  const hasNumericVal = (k: string) =>
    sampleSlice.some((r) => typeof r[k] === 'number' && Number.isFinite(r[k]))
  const xKey =
    explicitX ??
    keys.find((k) => !excluded.has(k) && hasStringVal(k)) ??
    keys.find((k) => hasStringVal(k)) ??
    keys[0] ??
    'label'

  if (typeof explicitY === 'string' && explicitY !== '') {
    return { xKey, yKeys: [explicitY] }
  }
  if (Array.isArray(explicitY) && explicitY.length > 0) {
    return { xKey, yKeys: explicitY }
  }
  const numericKeys = keys.filter((k) => k !== xKey && !excluded.has(k) && hasNumericVal(k))
  return {
    xKey,
    yKeys:
      numericKeys.length > 0
        ? numericKeys
        : keys.filter((k) => k !== xKey && !excluded.has(k)).slice(0, 1),
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

const FILLED_SHAPE_LABEL = {
  color: '#ffffff',
  fontWeight: 600,
  textBorderColor: 'rgba(15, 23, 42, 0.55)',
  textBorderWidth: 0.8,
  textShadowColor: 'rgba(15, 23, 42, 0.48)',
  textShadowBlur: 3,
  textShadowOffsetY: 1,
} as const

function extractBoxplotFive(
  row: Record<string, unknown>,
): [number, number, number, number, number] {
  if (Array.isArray(row.values) && row.values.length === 5) {
    const nums = row.values.map(toNumber).sort((a, b) => a - b)
    return [nums[0]!, nums[1]!, nums[2]!, nums[3]!, nums[4]!]
  }
  const sampleArr =
    Array.isArray(row.values) && row.values.length > 0
      ? row.values
      : Array.isArray(row.samples)
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
        { type: 'inside', yAxisIndex: 0, zoomOnMouseWheel: 'ctrl' },
        { type: 'slider', yAxisIndex: 0, width: 14, right: 6, borderColor: border },
      ]
    : [
        { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: 'ctrl' },
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
  const rawMax = finiteVals.length > 0 ? Math.max(...finiteVals) : 0
  const rawMin = finiteVals.length > 0 ? Math.min(...finiteVals) : 0
  const dataMax = scale ? rawMax : Math.max(0, rawMax)
  const dataMin = scale ? rawMin : Math.min(0, rawMin)

  let max: number | undefined
  let min: number | undefined

  const rawSpan = dataMax - dataMin
  const magRef = Math.max(Math.abs(dataMax), Math.abs(dataMin), Math.abs(refLine))
  const dataSpan = rawSpan > 0 ? rawSpan : magRef > 0 ? magRef * 0.2 : 1

  if (refLine > 0 && refLine >= dataMax * 0.94) {
    if (scale && dataSpan < dataMax * 0.35) {
      const target = Math.max(dataMax, refLine) + dataSpan * 0.28
      const step = 10 ** Math.floor(Math.log10(Math.max(1e-9, dataSpan)) - 1)
      max = Number((Math.ceil(target / step) * step).toPrecision(6))
    } else {
      max = niceUpperBound(Math.max(dataMax, refLine) * 1.1)
    }
  } else if (scale && refLine <= 0 && refLine > dataMax) {
    max = Number(
      (refLine + Math.max(dataSpan * 0.12, Math.abs(dataMin - refLine) * 0.12)).toPrecision(6),
    )
  }

  if (refLine < 0 && refLine <= dataMin * 0.94) {
    min = -niceUpperBound(Math.abs(Math.min(dataMin, refLine)) * 1.1)
  } else if (scale && refLine < dataMin) {
    if (refLine >= 0 && dataSpan < dataMax * 0.35) {
      const target = Math.max(0, refLine - dataSpan * 0.22)
      const step = 10 ** Math.floor(Math.log10(Math.max(1e-9, dataSpan)) - 1)
      min = Number((Math.floor(target / step) * step).toPrecision(6))
    } else {
      min =
        refLine >= 0
          ? Number((refLine * 0.92).toPrecision(6))
          : -niceUpperBound(Math.abs(refLine) * 1.1)
    }
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
  const allVals = [...leftValues, ...rightValues].filter(Number.isFinite)
  const span =
    allVals.length > 0
      ? Math.max(1e-9, Math.max(...allVals, 0) - Math.min(...allVals, 0))
      : Math.max(1e-9, Math.abs(refLine))
  const tolerance = Math.max(span * 0.05, Math.abs(refLine) * 0.05)
  const proxScale = Math.max(1e-9, span * 0.5)
  const isNegRef = refLine < 0
  const obstruction = (vals: readonly number[]) =>
    vals.reduce((score, v) => {
      const covers = isNegRef ? v <= refLine + tolerance : v >= refLine - tolerance
      return covers
        ? score + 1000 + Math.max(0, 200 * (1 - Math.abs(v - refLine) / proxScale))
        : score
    }, 0)
  const leftScore = obstruction(leftValues)
  const rightScore = obstruction(rightValues)
  if (leftScore !== rightScore) {
    return leftScore < rightScore ? 'insideStartTop' : 'insideEndTop'
  }
  if (isNegRef) {
    return Math.min(...leftValues) > Math.min(...rightValues) ? 'insideStartTop' : 'insideEndTop'
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
  compact = false,
): Record<string, unknown> | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  const rawText =
    label !== undefined && label.trim() !== '' ? sanitizeChartLabel(label) : String(value)
  const text = truncateByVisualWidth(rawText, compact ? 20 : 32)
  return {
    silent: true,
    symbol: ['none', 'none'],
    lineStyle: { color, type: 'dashed', width: 1.5 },
    label: {
      formatter: text,
      position: horizontal ? 'start' : position,
      rotate: horizontal ? 0 : undefined,
      distance: compact && !horizontal ? 6 : 4,
      color,
      backgroundColor: dark ? 'rgba(20, 24, 36, 0.90)' : 'rgba(255, 255, 255, 0.92)',
      borderColor: color,
      borderWidth: 1,
      borderRadius: 4,
      padding: compact ? [1, 4] : [2, 5],
      fontSize: compact ? 9.5 : 10,
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
    const otherLabel = CHART_MESSAGES[resolveClientLocale()].chartOtherGroup
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

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const check = new Date(Date.UTC(year, month - 1, day))
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() + 1 === month &&
    check.getUTCDate() === day
  )
}

function normalizeIsoDate(raw: unknown): string | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    const ms = Math.abs(raw) < 1e11 ? raw * 1000 : raw
    const d = new Date(ms)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (text === '') return null
  if (/^-?\d{9,13}$/.test(text)) {
    return normalizeIsoDate(Number(text))
  }
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/.exec(text)
  if (isoMatch) {
    const y = Number(isoMatch[1])
    const m = Number(isoMatch[2])
    const d = Number(isoMatch[3])
    if (!isValidCalendarDate(y, m, d)) return null
    return `${isoMatch[1]!}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  const hasExplicitTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
  if (hasExplicitTz) {
    return parsed.toISOString().slice(0, 10)
  }
  const y = String(parsed.getFullYear()).padStart(4, '0')
  const m = String(parsed.getMonth() + 1).padStart(2, '0')
  const d = String(parsed.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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

function visualWidthOf(raw: string): number {
  let units = 0
  for (const ch of raw) {
    units += (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1
  }
  return units
}

function truncateByVisualWidth(raw: string, maxUnits: number): string {
  let units = 0
  let out = ''
  for (const ch of raw) {
    const w = (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1
    if (units + w > maxUnits) {
      return `${out}…`
    }
    out += ch
    units += w
  }
  return raw
}

function truncateMiddleByVisualWidth(raw: string, maxUnits: number): string {
  if (visualWidthOf(raw) <= maxUnits) return raw
  const chars = [...raw]
  const budget = Math.max(4, maxUnits - 1)
  const tailBudget = Math.max(2, Math.floor(budget * 0.42))
  const headBudget = Math.max(2, budget - tailBudget)
  let head = ''
  let hUnits = 0
  let headIdx = 0
  for (; headIdx < chars.length; headIdx++) {
    const ch = chars[headIdx]!
    const w = (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1
    if (hUnits + w > headBudget) break
    head += ch
    hUnits += w
  }
  let tail = ''
  let tUnits = 0
  for (let i = chars.length - 1; i >= headIdx; i--) {
    const ch = chars[i]!
    const w = (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1
    if (tUnits + w > tailBudget) break
    tail = ch + tail
    tUnits += w
  }
  return `${head}…${tail}`
}

function buildLegendOption(opts: {
  readonly isCompact: boolean
  readonly scroll: boolean
  readonly bottom?: number | undefined
  readonly textColor: string
  readonly fontSize?: number | undefined
  readonly itemWidth?: number | undefined
  readonly itemHeight?: number | undefined
  readonly data?: readonly string[] | undefined
  readonly names?: readonly string[] | undefined
  readonly containerWidth?: number | undefined
}): Record<string, unknown> {
  const { isCompact, scroll, textColor } = opts
  const fontSize = opts.fontSize ?? 11
  const itemWidth = opts.itemWidth ?? 10
  const itemHeight = opts.itemHeight ?? 8
  const candidateNames = opts.names ?? opts.data
  const uniqueNames = candidateNames ? [...new Set(candidateNames)] : []
  const uniqueNameSet = new Set(uniqueNames)
  const estContainerW =
    opts.containerWidth !== undefined && opts.containerWidth > 0
      ? opts.containerWidth
      : isCompact
        ? 276
        : 520
  const availW = Math.max(120, estContainerW - 12)
  const estNaturalTotalPx =
    uniqueNames.length > 0
      ? uniqueNames.reduce(
          (sum, n) => sum + itemWidth + 6 + visualWidthOf(n) * (fontSize * 0.62) + 8,
          -8,
        )
      : 0
  const fitsNaturallyWithoutScroll =
    uniqueNames.length > 0 && uniqueNames.length <= 3 && estNaturalTotalPx <= availW - 6
  const wideTwoSeriesFit =
    uniqueNames.length > 0 &&
    uniqueNames.length <= 2 &&
    uniqueNames.every((n) => visualWidthOf(n) <= 14)

  let compactFormatter: ((name: string) => string) | undefined
  if (isCompact) {
    const baseMaxUnits = 8
    const collided = new Set<string>()
    if (uniqueNames.length > 1) {
      const seen = new Map<string, string>()
      for (const n of uniqueNames) {
        const truncated = truncateByVisualWidth(n, baseMaxUnits)
        const existing = seen.get(truncated)
        if (existing !== undefined && existing !== n) {
          collided.add(existing)
          collided.add(n)
        } else {
          seen.set(truncated, n)
        }
      }
    }
    compactFormatter = (name: string) => {
      if ((wideTwoSeriesFit || fitsNaturallyWithoutScroll) && uniqueNameSet.has(name)) {
        return name
      }
      if (collided.has(name)) {
        if (wideTwoSeriesFit) return name
        return truncateMiddleByVisualWidth(name, 9)
      }
      return truncateByVisualWidth(name, baseMaxUnits)
    }
  }

  const formattedNames = uniqueNames.map((n) => (compactFormatter ? compactFormatter(n) : n))
  const formattedMinWidths = formattedNames.map(
    (s) => itemWidth + 5 + Math.floor(visualWidthOf(s) * (fontSize * 0.5)),
  )
  const formattedMaxWidths = formattedNames.map(
    (s) => itemWidth + 5 + Math.ceil(visualWidthOf(s) * (fontSize * 0.6)),
  )
  const estFormattedTotalMax =
    formattedMaxWidths.length > 0 ? formattedMaxWidths.reduce((sum, w) => sum + w + 8, -8) : 0

  const willPaginateScroll =
    isCompact &&
    scroll &&
    uniqueNames.length >= 3 &&
    !fitsNaturallyWithoutScroll &&
    estFormattedTotalMax > availW - 6
  const pageCtrlW = 56
  const clipW = Math.max(100, availW - pageCtrlW)
  const perPage = estContainerW < 340 ? 2 : 3
  let scrollItemGap = 8
  if (willPaginateScroll) {
    const maxK = Math.min(uniqueNames.length - 1, perPage + 1)
    for (let k = maxK; k >= 1; k -= 1) {
      let sumMin = 0
      let sumMax = 0
      for (let i = 0; i < k; i += 1) {
        sumMin += formattedMinWidths[i] ?? 0
        sumMax += formattedMaxWidths[i] ?? 0
      }
      if (k === 1) {
        scrollItemGap = Math.max(8, Math.min(52, Math.ceil(clipW - sumMin + 12)))
        break
      }
      const gapMin = Math.ceil((clipW - sumMin + 12) / k)
      const gapMax = Math.floor((clipW - sumMax - 6) / (k - 1))
      if (gapMax >= 8 && gapMin <= gapMax) {
        scrollItemGap = Math.max(8, Math.min(52, gapMin))
        break
      }
    }
  }
  const slotTextW = willPaginateScroll
    ? Math.max(42, Math.floor((clipW - 8 * (perPage - 1)) / perPage) - itemWidth - 5)
    : undefined

  return {
    type: scroll ? 'scroll' : 'plain',
    bottom: opts.bottom ?? 0,
    left: isCompact ? 6 : 'center',
    ...(isCompact ? { right: 6 } : {}),
    ...(willPaginateScroll ? { padding: 0 } : {}),
    itemWidth,
    itemHeight,
    itemGap: scrollItemGap,
    ...(scroll ? { pageButtonGap: 8, pageButtonItemGap: 4, pageIconSize: 10 } : {}),
    ...(compactFormatter ? { formatter: compactFormatter } : {}),
    ...(opts.data ? { data: [...opts.data] } : {}),
    textStyle: {
      color: textColor,
      fontSize,
      ...(slotTextW !== undefined
        ? { width: slotTextW, overflow: 'truncate' as const, ellipsis: '…' }
        : {}),
    },
  }
}

function normalizeSelectedQueries(rawSelected: string | readonly string[] | undefined): string[] {
  if (Array.isArray(rawSelected)) {
    const out: string[] = []
    const seen = new Set<string>()
    for (const item of rawSelected) {
      const q = String(item ?? '')
        .trim()
        .toLowerCase()
      if (q !== '' && !seen.has(q)) {
        seen.add(q)
        out.push(q)
      }
    }
    return out
  }
  const q = typeof rawSelected === 'string' ? rawSelected.trim().toLowerCase() : ''
  return q === '' ? [] : [q]
}

function applyHierarchyCrossFilter(
  nodes: readonly unknown[],
  queries: readonly string[],
  exactOnly: boolean,
  highlightBorder: string,
  ancestorMatched = false,
): { readonly nodes: unknown[]; readonly matched: boolean } {
  let anyMatched = false
  const mapped = nodes.map((item) => {
    if (typeof item !== 'object' || item === null) return item
    const rec = item as Record<string, unknown>
    const nameNorm = sanitizeChartLabel(rec.name).trim().toLowerCase()
    const selfMatch = queries.some((q) =>
      exactOnly ? nameNorm === q : nameNorm === q || (nameNorm !== '' && nameNorm.includes(q)),
    )
    const childRes = Array.isArray(rec.children)
      ? applyHierarchyCrossFilter(
          rec.children,
          queries,
          exactOnly,
          highlightBorder,
          ancestorMatched || selfMatch,
        )
      : null
    const isMatch = ancestorMatched || selfMatch || Boolean(childRes?.matched)
    if (isMatch) anyMatched = true
    const prevStyle =
      typeof rec.itemStyle === 'object' && rec.itemStyle !== null
        ? (rec.itemStyle as Record<string, unknown>)
        : {}
    return {
      ...rec,
      ...(childRes ? { children: childRes.nodes } : {}),
      itemStyle: {
        ...prevStyle,
        opacity: isMatch ? 1 : 0.3,
        ...(selfMatch ? { borderColor: highlightBorder, borderWidth: 1.5 } : {}),
      },
    }
  })
  return { nodes: mapped, matched: anyMatched }
}

function hasExactHierarchyMatch(nodes: readonly unknown[], queries: readonly string[]): boolean {
  for (const item of nodes) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    const nameNorm = sanitizeChartLabel(rec.name).trim().toLowerCase()
    if (queries.includes(nameNorm)) return true
    if (Array.isArray(rec.children) && hasExactHierarchyMatch(rec.children, queries)) return true
  }
  return false
}

function applyCrossFilterSelection(
  option: echarts.EChartsCoreOption,
  rawSelected: string | readonly string[] | undefined,
  dark: boolean,
): echarts.EChartsCoreOption {
  const queries = normalizeSelectedQueries(rawSelected)
  if (queries.length === 0 || typeof option !== 'object' || option === null) return option

  const opt = option as Record<string, unknown>
  if (!Array.isArray(opt.series)) return option

  const categories = extractCategoryAxisLabels(opt)
  const highlightBorder = dark ? 'rgba(248, 250, 252, 0.92)' : 'rgba(15, 23, 42, 0.82)'

  const nextSeries = (opt.series as Record<string, unknown>[]).map((s) => {
    if (typeof s !== 'object' || s === null) return s
    const type = String(s.type ?? '')
    const seriesNameNorm = sanitizeChartLabel(s.name).trim().toLowerCase()
    const seriesMatched = seriesNameNorm !== '' && queries.includes(seriesNameNorm)

    if (
      (type === 'pie' || type === 'funnel' || type === 'treemap' || type === 'sunburst') &&
      Array.isArray(s.data)
    ) {
      const exactOnly = hasExactHierarchyMatch(s.data, queries)
      const res = applyHierarchyCrossFilter(s.data, queries, exactOnly, highlightBorder)
      return { ...s, data: res.nodes }
    }

    if (
      (type === 'bar' || type === 'line' || type === 'boxplot' || type === 'candlestick') &&
      Array.isArray(s.data) &&
      categories
    ) {
      if (
        typeof s.itemStyle === 'object' &&
        s.itemStyle !== null &&
        (s.itemStyle as Record<string, unknown>).color === 'transparent'
      ) {
        return s
      }
      const norm = (str: string) =>
        str
          .replace(/\s*→\s*/g, ' -> ')
          .replace(/\s*->\s*/g, ' -> ')
          .trim()
          .toLowerCase()
      const qNorms = queries.map(norm)
      const hasExactCat = categories.some((c) => qNorms.includes(norm(c)))
      let anyPointMatched = false
      const nextData = (s.data as unknown[]).map((pt, idx) => {
        if (pt === '-') return pt
        const cat = categories[idx] ?? ''
        const catNorm = norm(cat)
        const catMatch = qNorms.some((qNorm) =>
          hasExactCat
            ? catNorm === qNorm
            : catNorm === qNorm || (catNorm !== '' && catNorm.includes(qNorm)),
        )
        const isMatch = seriesMatched || catMatch
        if (isMatch) anyPointMatched = true
        if (typeof pt === 'object' && pt !== null && !Array.isArray(pt)) {
          const rec = pt as Record<string, unknown>
          const prevStyle =
            typeof rec.itemStyle === 'object' && rec.itemStyle !== null
              ? (rec.itemStyle as Record<string, unknown>)
              : {}
          return {
            ...rec,
            ...(type === 'line' ? { symbolSize: isMatch ? 8 : 4 } : {}),
            itemStyle: {
              ...prevStyle,
              opacity: isMatch ? 1 : 0.28,
              ...(isMatch && (type === 'bar' || type === 'line')
                ? { borderColor: highlightBorder, borderWidth: 1.5 }
                : {}),
            },
          }
        }
        return {
          value: pt,
          ...(type === 'line' ? { symbolSize: isMatch ? 8 : 4 } : {}),
          itemStyle: {
            opacity: isMatch ? 1 : 0.28,
            ...(isMatch && (type === 'bar' || type === 'line')
              ? { borderColor: highlightBorder, borderWidth: 1.5 }
              : {}),
          },
        }
      })
      if (type === 'line') {
        const prevLine =
          typeof s.lineStyle === 'object' && s.lineStyle !== null
            ? (s.lineStyle as Record<string, unknown>)
            : {}
        const prevArea =
          typeof s.areaStyle === 'object' && s.areaStyle !== null
            ? (s.areaStyle as Record<string, unknown>)
            : undefined
        const lineOpacity = seriesMatched ? 1 : anyPointMatched ? 0.55 : 0.22
        return {
          ...s,
          lineStyle: { ...prevLine, opacity: lineOpacity },
          ...(prevArea ? { areaStyle: { ...prevArea, opacity: seriesMatched ? 0.24 : 0.08 } } : {}),
          data: nextData,
        }
      }
      return { ...s, data: nextData }
    }

    if (type === 'parallel') {
      const prevLine =
        typeof s.lineStyle === 'object' && s.lineStyle !== null
          ? (s.lineStyle as Record<string, unknown>)
          : {}
      const isMatch =
        seriesMatched ||
        queries.some(
          (q) => seriesNameNorm === q || (seriesNameNorm !== '' && seriesNameNorm.includes(q)),
        )
      return {
        ...s,
        lineStyle: {
          ...prevLine,
          opacity: isMatch ? 1 : 0.16,
          width: isMatch ? 3.2 : 1.5,
        },
      }
    }

    if ((type === 'sankey' || type === 'graph') && Array.isArray(s.data)) {
      const hasExactNode = (s.data as unknown[]).some((node) => {
        if (typeof node !== 'object' || node === null) return false
        const rec = node as Record<string, unknown>
        const nameNorm = sanitizeChartLabel(rec.name).trim().toLowerCase()
        const idNorm = sanitizeChartLabel(rec.id).trim().toLowerCase()
        return queries.includes(nameNorm) || (idNorm !== '' && queries.includes(idNorm))
      })
      const matchedNodeKeys = new Set<string>()
      const nextNodes = (s.data as unknown[]).map((node) => {
        if (typeof node !== 'object' || node === null) return node
        const rec = node as Record<string, unknown>
        const nameNorm = sanitizeChartLabel(rec.name).trim().toLowerCase()
        const idNorm = sanitizeChartLabel(rec.id).trim().toLowerCase()
        const isMatch = queries.some((q) =>
          hasExactNode
            ? nameNorm === q || (idNorm !== '' && idNorm === q)
            : nameNorm === q ||
              (nameNorm !== '' && nameNorm.includes(q)) ||
              (idNorm !== '' && (idNorm === q || idNorm.includes(q))),
        )
        if (isMatch) {
          if (nameNorm) matchedNodeKeys.add(nameNorm)
          if (idNorm) matchedNodeKeys.add(idNorm)
        }
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
      const nextLinks = Array.isArray(s.links)
        ? (s.links as unknown[]).map((lk) => {
            if (typeof lk !== 'object' || lk === null) return lk
            const rec = lk as Record<string, unknown>
            const src = sanitizeChartLabel(rec.source).trim().toLowerCase()
            const tgt = sanitizeChartLabel(rec.target).trim().toLowerCase()
            const linkMatch = matchedNodeKeys.has(src) || matchedNodeKeys.has(tgt)
            const prevLine =
              typeof rec.lineStyle === 'object' && rec.lineStyle !== null
                ? (rec.lineStyle as Record<string, unknown>)
                : {}
            const prevLabel =
              typeof rec.label === 'object' && rec.label !== null
                ? (rec.label as Record<string, unknown>)
                : undefined
            return {
              ...rec,
              lineStyle: { ...prevLine, opacity: linkMatch ? 0.65 : 0.14 },
              ...(prevLabel ? { label: { ...prevLabel, opacity: linkMatch ? 1 : 0.25 } } : {}),
            }
          })
        : s.links
      return { ...s, data: nextNodes, ...(nextLinks !== undefined ? { links: nextLinks } : {}) }
    }

    if (type === 'scatter' && Array.isArray(s.data)) {
      const hasExactScatter = (s.data as unknown[]).some((pt) => {
        if (typeof pt !== 'object' || pt === null || Array.isArray(pt)) return false
        const nameNorm = sanitizeChartLabel((pt as Record<string, unknown>).name)
          .trim()
          .toLowerCase()
        return nameNorm !== '' && queries.includes(nameNorm)
      })
      const nextData = (s.data as unknown[]).map((pt) => {
        if (typeof pt === 'object' && pt !== null && !Array.isArray(pt)) {
          const rec = pt as Record<string, unknown>
          const nameNorm = sanitizeChartLabel(rec.name).trim().toLowerCase()
          const isMatch =
            seriesMatched ||
            queries.some((q) =>
              hasExactScatter
                ? nameNorm === q
                : nameNorm === q || (nameNorm !== '' && nameNorm.includes(q)),
            )
          const prevStyle =
            typeof rec.itemStyle === 'object' && rec.itemStyle !== null
              ? (rec.itemStyle as Record<string, unknown>)
              : {}
          return {
            ...rec,
            itemStyle: {
              ...prevStyle,
              opacity: isMatch ? 1 : 0.25,
              ...(isMatch ? { borderColor: highlightBorder, borderWidth: 1.5 } : {}),
            },
          }
        }
        return { value: pt, itemStyle: { opacity: seriesMatched ? 1 : 0.25 } }
      })
      return { ...s, data: nextData }
    }

    if (type === 'heatmap' && Array.isArray(s.data)) {
      const yAxisObj = Array.isArray(opt.yAxis)
        ? (opt.yAxis[0] as Record<string, unknown> | undefined)
        : (opt.yAxis as Record<string, unknown> | undefined)
      const yCats =
        yAxisObj && Array.isArray(yAxisObj.data)
          ? (yAxisObj.data as unknown[]).map((v) => sanitizeChartLabel(v).trim().toLowerCase())
          : []
      const extractHeatTokens = (pt: unknown): string[] => {
        const toks: string[] = []
        if (Array.isArray(pt) && typeof pt[0] === 'string') {
          toks.push(sanitizeChartLabel(pt[0]).trim().toLowerCase())
        } else if (typeof pt === 'object' && pt !== null && !Array.isArray(pt)) {
          const rec = pt as Record<string, unknown>
          const n = sanitizeChartLabel(rec.name).trim().toLowerCase()
          if (n) toks.push(n)
          if (Array.isArray(rec.value) && typeof rec.value[1] === 'number') {
            const yLbl = yCats[rec.value[1]]
            if (yLbl) toks.push(yLbl)
          }
        }
        return toks
      }
      const hasExactHeat = (s.data as unknown[]).some((pt) =>
        extractHeatTokens(pt).some((t) => queries.includes(t)),
      )
      const nextData = (s.data as unknown[]).map((pt) => {
        const toks = extractHeatTokens(pt)
        if (toks.length === 0) return pt
        const isMatch = toks.some((nameNorm) =>
          queries.some((q) =>
            hasExactHeat
              ? nameNorm === q
              : nameNorm === q || (nameNorm !== '' && nameNorm.includes(q)),
          ),
        )
        if (Array.isArray(pt)) {
          return {
            value: pt,
            itemStyle: {
              opacity: isMatch ? 1 : 0.28,
              ...(isMatch ? { borderColor: highlightBorder, borderWidth: 1.5 } : {}),
            },
          }
        }
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
            ...(isMatch ? { borderColor: highlightBorder, borderWidth: 1.5 } : {}),
          },
        }
      })
      return { ...s, data: nextData }
    }

    if (type === 'radar' && Array.isArray(s.data)) {
      const hasExactRadar = (s.data as unknown[]).some((pt) => {
        if (typeof pt !== 'object' || pt === null) return false
        const nameNorm = sanitizeChartLabel((pt as Record<string, unknown>).name)
          .trim()
          .toLowerCase()
        return nameNorm !== '' && queries.includes(nameNorm)
      })
      const nextData = (s.data as unknown[]).map((pt) => {
        if (typeof pt !== 'object' || pt === null) return pt
        const rec = pt as Record<string, unknown>
        const nameNorm = sanitizeChartLabel(rec.name).trim().toLowerCase()
        const isMatch = queries.some((q) =>
          hasExactRadar
            ? nameNorm === q
            : nameNorm === q || (nameNorm !== '' && nameNorm.includes(q)),
        )
        const prevLine =
          typeof rec.lineStyle === 'object' && rec.lineStyle !== null
            ? (rec.lineStyle as Record<string, unknown>)
            : {}
        const prevArea =
          typeof rec.areaStyle === 'object' && rec.areaStyle !== null
            ? (rec.areaStyle as Record<string, unknown>)
            : {}
        return {
          ...rec,
          lineStyle: { ...prevLine, opacity: isMatch ? 1 : 0.22, width: isMatch ? 2.4 : 1.2 },
          areaStyle: { ...prevArea, opacity: isMatch ? (dark ? 0.24 : 0.2) : 0.04 },
        }
      })
      return { ...s, data: nextData }
    }

    return s
  })

  return { ...opt, series: nextSeries }
}

function applyDarkSafeThemeDefaults(
  option: echarts.EChartsCoreOption,
  dark: boolean,
  theme: ReturnType<typeof resolvePalette>,
): echarts.EChartsCoreOption {
  if (typeof option !== 'object' || option === null) return option
  const opt = { ...(option as Record<string, unknown>) }

  if (opt.legend && typeof opt.legend === 'object' && !Array.isArray(opt.legend)) {
    const leg = opt.legend as Record<string, unknown>
    opt.legend = {
      ...leg,
      inactiveColor: dark ? 'rgba(156, 163, 175, 0.35)' : 'rgba(100, 116, 139, 0.4)',
      pageIconColor: theme.brand,
      pageIconInactiveColor: dark ? 'rgba(156, 163, 175, 0.3)' : 'rgba(100, 116, 139, 0.35)',
      pageTextStyle: { color: theme.textSecondary, fontSize: 10 },
    }
  }

  if (Array.isArray(opt.dataZoom)) {
    opt.dataZoom = (opt.dataZoom as Record<string, unknown>[]).map((dz) => {
      if (dz?.type !== 'slider') return dz
      return {
        ...dz,
        backgroundColor: dark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.04)',
        fillerColor: dark ? 'rgba(96, 165, 250, 0.22)' : 'rgba(37, 99, 235, 0.16)',
        handleStyle: {
          color: dark ? '#334155' : '#ffffff',
          borderColor: theme.brand,
          borderWidth: 1.2,
        },
        moveHandleStyle: {
          color: dark ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.45)',
        },
        dataBackground: {
          lineStyle: { color: dark ? 'rgba(148, 163, 184, 0.28)' : 'rgba(100, 116, 139, 0.28)' },
          areaStyle: { color: dark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.1)' },
        },
        selectedDataBackground: {
          lineStyle: { color: theme.brand },
          areaStyle: { color: dark ? 'rgba(96, 165, 250, 0.2)' : 'rgba(37, 99, 235, 0.15)' },
        },
        textStyle: { color: theme.textSecondary, fontSize: 10 },
      }
    })
  }

  return opt
}

export function buildChartOption(
  props: ChartOptionInput,
  dark: boolean,
  containerWidth?: number,
): echarts.EChartsCoreOption {
  const theme = resolvePalette(dark)
  const raw = buildChartOptionInternal(props, dark, containerWidth)
  const themed = applyDarkSafeThemeDefaults(raw, dark, theme)
  return applyCrossFilterSelection(themed, props.selected, dark)
}

function buildChartOptionInternal(
  props: ChartOptionInput,
  dark: boolean,
  containerWidth?: number,
): echarts.EChartsCoreOption {
  const rows = normalizeChartRows(props.data)
  const theme = resolvePalette(dark)
  const { xKey, yKeys } = inferFields(rows, props.xField, props.yField, [
    props.seriesField,
    props.sizeField,
  ])
  const primaryY = yKeys[0] ?? 'value'
  const isCompact = containerWidth !== undefined && containerWidth > 0 && containerWidth < 400

  const tooltipMaxW = isCompact ? Math.max(150, Math.min(220, (containerWidth ?? 276) - 36)) : 320
  const baseTooltip = {
    renderMode: 'richText' as const,
    confine: true,
    backgroundColor: theme.tooltipBg,
    borderColor: theme.tooltipBorder,
    padding: isCompact ? [5, 8] : [6, 10],
    textStyle: {
      color: theme.tooltipText,
      fontSize: isCompact ? 10.5 : 12,
      width: tooltipMaxW,
      overflow: 'break' as const,
    },
  }

  if (props.kind === 'pie' || props.kind === 'funnel') {
    const items = rows.map((r) => ({
      name: sanitizeChartLabel(r[xKey] ?? r.name ?? r.label),
      value: toNumber(r[primaryY] ?? r.value),
    }))
    const hideOuterPieLabels = isCompact || items.length > 5
    const estFunnelW = containerWidth !== undefined && containerWidth > 0 ? containerWidth : 520
    const funnelInsideLabelW = isCompact
      ? Math.max(68, Math.min(96, Math.floor(estFunnelW * 0.34)))
      : 140
    return {
      color: theme.colors,
      tooltip: {
        ...baseTooltip,
        trigger: 'item',
        formatter:
          props.kind === 'pie' ? (isCompact ? '{b}\n{c} ({d}%)' : '{b}: {c} ({d}%)') : undefined,
      },
      legend: buildLegendOption({
        isCompact,
        scroll: isCompact || items.length >= 4,
        names: items.map((item) => item.name),
        textColor: theme.textSecondary,
        containerWidth,
      }),
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
                    fontSize: isCompact ? 11.5 : 13,
                    fontWeight: 600,
                    lineHeight: isCompact ? 15 : 18,
                    color: theme.textPrimary,
                    width: isCompact ? 76 : 112,
                    overflow: 'truncate',
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
              left: isCompact ? '6%' : '15%',
              width: isCompact ? '88%' : '70%',
              minSize: isCompact ? '32%' : '18%',
              labelLayout: { hideOverlap: true },
              label:
                isCompact ||
                (containerWidth !== undefined && containerWidth > 0 && containerWidth < 460)
                  ? {
                      position: 'inside',
                      ...FILLED_SHAPE_LABEL,
                      fontSize: isCompact ? 10 : 11,
                      overflow: 'truncate',
                      width: funnelInsideLabelW,
                    }
                  : {
                      color: theme.textPrimary,
                      fontSize: 11.5,
                      overflow: 'truncate',
                      width: 96,
                    },
              data: items,
            },
      ],
    }
  }

  if (props.kind === 'gauge') {
    const first =
      rows[0] ??
      (typeof props.data === 'object' && props.data !== null && !Array.isArray(props.data)
        ? (props.data as Record<string, unknown>)
        : {})
    const firstKeys = Object.keys(first)
    const explicitGaugeY =
      typeof props.yField === 'string' && props.yField !== '' ? props.yField : undefined
    const gaugeValKey =
      explicitGaugeY ??
      (first.value !== undefined
        ? 'value'
        : first.score !== undefined
          ? 'score'
          : first.percent !== undefined
            ? 'percent'
            : (firstKeys.find(
                (k) => k !== 'max' && k !== 'target' && typeof first[k] === 'number',
              ) ?? primaryY))
    const val = toNumber(first[gaugeValKey] ?? first.value ?? 0)
    const rawMax = first.max ?? first.target
    const parsedMax = rawMax !== undefined ? toNumber(rawMax) : 100
    const baseMax = parsedMax > 0 ? parsedMax : 100
    const gaugeMax = val > baseMax ? niceUpperBound(val * 1.1) : baseMax
    const gaugeMin = val < 0 ? -niceUpperBound(Math.abs(val) * 1.1) : 0
    const gaugeLabelKey =
      props.xField ??
      (typeof first.name === 'string'
        ? 'name'
        : typeof first.label === 'string'
          ? 'label'
          : firstKeys.find(
              (k) =>
                k !== gaugeValKey && k !== 'max' && k !== 'target' && typeof first[k] === 'string',
            ))
    const name = gaugeLabelKey
      ? sanitizeChartLabel(first[gaugeLabelKey])
      : sanitizeChartLabel(props.title ?? '')
    const arcWidth = isCompact ? 9 : 12
    const estGaugeW = containerWidth !== undefined && containerWidth > 0 ? containerWidth : 480
    return {
      color: theme.colors,
      tooltip: { ...baseTooltip, trigger: 'item' },
      series: [
        {
          type: 'gauge',
          min: gaugeMin,
          max: gaugeMax,
          splitNumber: isCompact ? 5 : 10,
          radius: isCompact ? '86%' : '82%',
          progress: { show: true, width: arcWidth },
          pointer: {
            length: isCompact ? '48%' : '54%',
            width: isCompact ? 4 : 5,
          },
          axisLine: { lineStyle: { width: arcWidth, color: [[1, theme.border]] } },
          axisTick: { distance: 2, length: 4, lineStyle: { color: theme.border } },
          splitLine: {
            distance: 2,
            length: isCompact ? 7 : 9,
            lineStyle: { color: theme.textSecondary, width: 1.2 },
          },
          axisLabel: {
            color: theme.textSecondary,
            fontSize: isCompact ? 9 : 10,
            distance: isCompact ? 12 : 15,
          },
          detail: {
            valueAnimation: true,
            fontSize: isCompact ? 16 : 20,
            color: theme.textPrimary,
            offsetCenter: [0, isCompact ? '58%' : '62%'],
          },
          title: {
            color: theme.textSecondary,
            fontSize: isCompact ? 10.5 : 12,
            offsetCenter: [0, isCompact ? '86%' : '88%'],
            width: Math.max(96, Math.floor(estGaugeW * 0.7)),
            overflow: 'truncate',
          },
          data: [{ value: val, name }],
        },
      ],
    }
  }

  if (props.kind === 'radar') {
    const groupField = props.seriesField
    const radarAxes = groupField
      ? [...new Set(rows.map((r) => sanitizeChartLabel(r[xKey])))]
      : rows.map((r) => sanitizeChartLabel(r[xKey]))
    const radarSeriesItems: Array<{ name: string; value: number[] }> = groupField
      ? (() => {
          const groups = [...new Set(rows.map((r) => sanitizeChartLabel(r[groupField])))]
          const map = new Map<string, number>()
          for (const r of rows) {
            const g = sanitizeChartLabel(r[groupField])
            const ax = sanitizeChartLabel(r[xKey])
            map.set(`${g}\u0000${ax}`, toNumber(r[primaryY]))
          }
          return groups.map((g) => ({
            name: g,
            value: radarAxes.map((ax) => map.get(`${g}\u0000${ax}`) ?? 0),
          }))
        })()
      : yKeys.map((k) => ({
          name: sanitizeChartLabel(k),
          value: rows.map((r) => toNumber(r[k])),
        }))
    const rawRadarMax = Math.max(0, ...radarSeriesItems.flatMap((item) => item.value))
    const radarCeiling =
      rawRadarMax > 0
        ? rawRadarMax <= 10
          ? Math.ceil(rawRadarMax * 1.15 * 100) / 100
          : Math.ceil(rawRadarMax * 1.15)
        : 100
    const indicator = radarAxes.map((axName) => ({
      name: axName,
      max: radarCeiling,
    }))
    const isUltraNarrow = containerWidth !== undefined && containerWidth > 0 && containerWidth < 300
    const showRadarLegend = radarSeriesItems.length > 1
    const radiusPct = isUltraNarrow ? 0.38 : isCompact ? 0.48 : showRadarLegend ? 0.58 : 0.65
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
      legend: showRadarLegend
        ? buildLegendOption({
            isCompact,
            scroll: isCompact || radarSeriesItems.length >= 4,
            names: radarSeriesItems.map((item) => item.name),
            textColor: theme.textSecondary,
            containerWidth,
          })
        : undefined,
      radar: {
        center: showRadarLegend ? ['50%', '46%'] : ['50%', '50%'],
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
          data: radarSeriesItems,
        },
      ],
    }
  }

  if (props.kind === 'heatmap') {
    const sample = rows[0] ?? {}
    const sampleKeys = Object.keys(sample)
    const stringKeys = sampleKeys.filter((k) => typeof sample[k] === 'string')
    const numericKeys = sampleKeys.filter((k) => typeof sample[k] === 'number')

    const hxKey = props.xField ?? stringKeys[0] ?? sampleKeys[0] ?? 'x'
    const explicitYStr =
      typeof props.yField === 'string' && props.yField !== '' ? props.yField : undefined
    const hasOtherNumericBesidesExplicitY =
      explicitYStr !== undefined && numericKeys.some((k) => k !== hxKey && k !== explicitYStr)
    const hyKey =
      props.seriesField && props.seriesField !== hxKey
        ? props.seriesField
        : explicitYStr &&
            explicitYStr !== hxKey &&
            (props.sizeField !== undefined ||
              typeof sample[explicitYStr] === 'string' ||
              hasOtherNumericBesidesExplicitY)
          ? explicitYStr
          : (stringKeys.find((k) => k !== hxKey) ?? sampleKeys.find((k) => k !== hxKey) ?? 'y')
    const valKey =
      props.sizeField ??
      (explicitYStr && explicitYStr !== hyKey ? explicitYStr : undefined) ??
      numericKeys.find((k) => k !== hxKey && k !== hyKey) ??
      'value'

    const xCats = [...new Set(rows.map((r) => sanitizeChartLabel(r[hxKey])))]
    const yCats = [...new Set(rows.map((r) => sanitizeChartLabel(r[hyKey])))]
    const values = rows.map((r) => toNumber(r[valKey]))
    const minVal = values.length > 0 ? Math.min(...values) : 0
    const maxVal = values.length > 0 ? Math.max(...values) : 100
    const valSpan = Math.max(1e-9, maxVal - minVal)
    const showCellLabels = isCompact
      ? xCats.length <= 6 && yCats.length <= 6 && rows.length <= 36
      : rows.length <= 48

    const cells = rows.map((r) => {
      const val = toNumber(r[valKey])
      const norm = (val - minVal) / valSpan
      const xLabel = sanitizeChartLabel(r[hxKey])
      const yLabel = sanitizeChartLabel(r[hyKey])
      return {
        name: xLabel,
        value: [xCats.indexOf(xLabel), yCats.indexOf(yLabel), val],
        label:
          norm >= 0.48
            ? { ...FILLED_SHAPE_LABEL, fontSize: isCompact ? 9.5 : 11 }
            : { color: theme.textPrimary, fontSize: isCompact ? 9.5 : 11 },
      }
    })
    const estHeatW = containerWidth !== undefined && containerWidth > 0 ? containerWidth : 520
    const splitAreaColors = dark
      ? ['rgba(255, 255, 255, 0.02)', 'rgba(255, 255, 255, 0.05)']
      : ['rgba(15, 23, 42, 0.02)', 'rgba(15, 23, 42, 0.045)']

    return {
      tooltip: { ...baseTooltip },
      grid: {
        top: 14,
        right: isCompact ? 10 : 18,
        bottom: 58,
        left: isCompact ? 6 : 12,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: xCats,
        splitArea: { show: true, areaStyle: { color: splitAreaColors } },
        axisLabel: {
          color: theme.textSecondary,
          fontSize: isCompact ? 9.5 : 11,
          hideOverlap: true,
          ...(isCompact
            ? {
                width: Math.max(36, Math.floor((estHeatW - 60) / Math.max(1, xCats.length))),
                overflow: 'truncate' as const,
              }
            : {}),
        },
        axisLine: { lineStyle: { color: theme.border } },
      },
      yAxis: {
        type: 'category',
        data: yCats,
        splitArea: { show: true, areaStyle: { color: splitAreaColors } },
        axisLabel: {
          color: theme.textSecondary,
          fontSize: isCompact ? 9.5 : 11,
          ...(isCompact
            ? { width: Math.min(80, Math.floor(estHeatW * 0.32)), overflow: 'truncate' as const }
            : {}),
        },
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
            show: showCellLabels,
            fontSize: isCompact ? 9.5 : 11,
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

  if (props.kind === 'treemap' || props.kind === 'sunburst') {
    const hierarchyRows =
      rows.length > 0
        ? rows
        : typeof props.data === 'object' && props.data !== null && !Array.isArray(props.data)
          ? [props.data as Record<string, unknown>]
          : rows
    const treeData = buildHierarchyTree(hierarchyRows, props, xKey, primaryY)
    const borderCol = dark ? '#18181b' : '#ffffff'

    if (props.kind === 'sunburst') {
      const useInnerOnly =
        isCompact || (containerWidth !== undefined && containerWidth > 0 && containerWidth < 460)
      const estHeight = Math.min(640, Math.max(140, props.height ?? 260))
      const outerRingRadiusPx = estHeight * 0.36
      const outerLabelWidth = Math.max(
        64,
        Math.floor((containerWidth ?? 580) / 2 - outerRingRadiusPx - 18),
      )
      const measureDepth = (nodes: readonly Record<string, unknown>[]): number => {
        let maxD = 0
        for (const n of nodes) {
          const kids = Array.isArray(n.children) ? (n.children as Record<string, unknown>[]) : []
          maxD = Math.max(maxD, kids.length > 0 ? 1 + measureDepth(kids) : 1)
        }
        return maxD
      }
      const treeDepth = Math.max(1, Math.min(6, measureDepth(treeData)))
      const sunburstLevels: Record<string, unknown>[] = [{}]
      const innerStart = 18
      const innerEnd = useInnerOnly ? 85 : treeDepth <= 2 ? 72 : 75
      const bandSpan = (innerEnd - innerStart) / treeDepth
      for (let lv = 0; lv < treeDepth; lv++) {
        const r0 = Math.round(innerStart + lv * bandSpan)
        const r = Math.round(innerStart + (lv + 1) * bandSpan)
        const isOuterWide = !useInnerOnly && lv === treeDepth - 1 && treeDepth >= 3
        sunburstLevels.push(
          isOuterWide
            ? {
                r0: `${Math.max(r0, 66)}%`,
                r: `${r}%`,
                label: {
                  position: 'outside',
                  rotate: 0,
                  padding: 5,
                  fontSize: 11,
                  color: theme.textPrimary,
                  width: outerLabelWidth,
                  overflow: 'truncate',
                },
              }
            : {
                r0: `${r0}%`,
                r: `${r}%`,
                label: {
                  ...FILLED_SHAPE_LABEL,
                  rotate: 'tangential',
                  fontSize: useInnerOnly ? (lv === 0 ? 10 : 9.5) : lv === 0 ? 10.5 : 10,
                  minAngle: lv === treeDepth - 1 && useInnerOnly ? 22 : undefined,
                  overflow: 'truncate',
                  width: useInnerOnly ? 58 + lv * 4 : 68 + lv * 4,
                },
              },
        )
      }

      return {
        color: theme.colors,
        tooltip: { ...baseTooltip, trigger: 'item' },
        series: [
          {
            type: 'sunburst',
            center: ['50%', '51%'],
            radius: useInnerOnly ? ['18%', '85%'] : ['18%', '70%'],
            nodeClick:
              props.interactiveSelect || props.selected !== undefined ? false : 'rootToNode',
            sort: 'desc',
            minAngle: useInnerOnly ? 16 : 10,
            emphasis: { focus: 'ancestor' },
            labelLayout: { hideOverlap: true },
            label: {
              ...FILLED_SHAPE_LABEL,
              rotate: 'tangential',
              fontSize: 9.5,
              overflow: 'truncate',
              width: 60,
            },
            itemStyle: {
              borderRadius: 5,
              borderColor: borderCol,
              borderWidth: 2,
            },
            levels: sunburstLevels,
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
          nodeClick: false,
          breadcrumb: { show: false },
          itemStyle: {
            borderColor: borderCol,
            borderWidth: 2,
            gapWidth: 2,
            borderRadius: 6,
          },
          label: {
            show: true,
            ...FILLED_SHAPE_LABEL,
            fontSize: isCompact ? 9.5 : 11.5,
            lineHeight: isCompact ? 12.5 : 15,
            padding: isCompact ? [2, 3] : undefined,
            overflow: isCompact ? 'truncate' : 'break',
            ellipsis: '…',
            formatter: isCompact
              ? (params: { name?: unknown }) => {
                  const text = sanitizeChartLabel(params.name)
                  return text.length > 8 && text.includes(' ') ? text.replace(/\s+/g, '\n') : text
                }
              : undefined,
          },
          upperLabel: { show: false },
          data: treeData,
        },
      ],
    }
  }

  if (props.kind === 'sankey') {
    const srcField = props.xField ?? 'source'
    const tgtField = props.seriesField ?? 'target'
    const valField = (typeof props.yField === 'string' ? props.yField : undefined) ?? 'value'
    const sankeyObj =
      typeof props.data === 'object' && props.data !== null && !Array.isArray(props.data)
        ? (props.data as Record<string, unknown>)
        : null
    const sankeySourceRows =
      rows.length > 0
        ? rows
        : sankeyObj !== null && Array.isArray(sankeyObj.links ?? sankeyObj.edges)
          ? normalizeChartRows(sankeyObj.links ?? sankeyObj.edges)
          : rows

    const linkTotals = new Map<string, { source: string; target: string; value: number }>()
    for (const r of sankeySourceRows) {
      const source = sanitizeChartLabel(r[srcField] ?? r.source ?? r.from)
      const target = sanitizeChartLabel(r[tgtField] ?? r.target ?? r.to)
      const value = Math.max(0, toNumber(r[valField] ?? r.value ?? r[primaryY]))
      if (!source || !target || value <= 0) continue
      const key = `${source}\u0000${target}`
      const prev = linkTotals.get(key)
      if (prev) prev.value += value
      else linkTotals.set(key, { source, target, value })
    }
    const links = filterAcyclicLinks([...linkTotals.values()])
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

    const sankeyLabelBase = {
      color: theme.textPrimary,
      fontSize: isCompact ? 9.5 : 11.5,
      overflow: 'truncate' as const,
      width: labelMaxW,
      textBorderColor: dark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.88)',
      textBorderWidth: 2,
    }

    return {
      color: theme.colors,
      tooltip: {
        ...baseTooltip,
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as {
            dataType?: string
            name?: unknown
            value?: unknown
            data?: { source?: unknown; target?: unknown; value?: unknown }
          }
          if (p?.dataType === 'edge' && p.data) {
            const src = sanitizeChartLabel(p.data.source)
            const tgt = sanitizeChartLabel(p.data.target)
            const val = sanitizeChartLabel(p.data.value ?? p.value)
            return isCompact ? `${src} →\n${tgt}: ${val}` : `${src} → ${tgt}: ${val}`
          }
          const name = sanitizeChartLabel(p?.name)
          const val = sanitizeChartLabel(p?.value)
          return val !== '' ? `${name}: ${val}` : name
        },
      },
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
          label: sankeyLabelBase,
          data: nodeNames.map((name) => ({
            name,
            label:
              !sourceSet.has(name) && isCompact
                ? { ...sankeyLabelBase, width: Math.max(48, rightPadding - 8) }
                : undefined,
          })),
          links,
        },
      ],
    }
  }

  if (props.kind === 'graph') {
    let nodes: Record<string, unknown>[] = []
    let links: Record<string, unknown>[] = []

    const rawObj =
      typeof props.data === 'object' && props.data !== null && !Array.isArray(props.data)
        ? (props.data as Record<string, unknown>)
        : null

    const sizeScale = isCompact ? 0.72 : 1
    if (rawObj && Array.isArray(rawObj.nodes)) {
      const seenNodeIds = new Set<string>()
      nodes = []
      for (const n of rawObj.nodes as Record<string, unknown>[]) {
        if (!n || typeof n !== 'object') continue
        const id = sanitizeChartLabel(n.id ?? n.name)
        if (!id || seenNodeIds.has(id)) continue
        seenNodeIds.add(id)
        nodes.push({
          id,
          name: sanitizeChartLabel(n.name ?? n.id),
          symbolSize: Math.round(
            (n.size ? Math.min(54, Math.max(18, toNumber(n.size))) : 30) * sizeScale,
          ),
          category:
            n.group !== undefined || n.category !== undefined
              ? sanitizeChartLabel(n.group ?? n.category)
              : undefined,
        })
      }
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
      const edgeRows =
        rows.length > 0
          ? rows
          : rawObj !== null && Array.isArray(rawObj.links ?? rawObj.edges)
            ? normalizeChartRows(rawObj.links ?? rawObj.edges)
            : rows
      const seen = new Set<string>()
      const defaultSymbolSize = Math.round(30 * sizeScale)
      for (const r of edgeRows) {
        const s = sanitizeChartLabel(r[srcField] ?? r.source ?? r.from ?? r.name)
        const t = sanitizeChartLabel(r[tgtField] ?? r.target ?? r.to)
        if (s && !seen.has(s)) {
          seen.add(s)
          nodes.push({ id: s, name: s, symbolSize: defaultSymbolSize })
        }
        if (t && !seen.has(t)) {
          seen.add(t)
          nodes.push({ id: t, name: t, symbolSize: defaultSymbolSize })
        }
        if (s && t) {
          links.push({
            source: s,
            target: t,
            label: r.label
              ? {
                  show: true,
                  formatter: sanitizeChartLabel(r.label),
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
          ? buildLegendOption({
              isCompact,
              scroll: isCompact || categories.length >= 4,
              data: categories.map((c) => c.name),
              textColor: theme.textSecondary,
              containerWidth,
            })
          : undefined,
      series: [
        {
          type: 'graph',
          layout: useCircularCompact ? 'circular' : 'force',
          circular: useCircularCompact ? { rotateLabel: false } : undefined,
          roam: 'move',
          draggable: !useCircularCompact,
          top: useCircularCompact ? 22 : isCompact ? 16 : 12,
          bottom: categories.length > 1 ? (useCircularCompact ? 50 : isCompact ? 42 : 34) : 24,
          left: useCircularCompact ? 44 : isCompact ? 32 : 18,
          right: useCircularCompact ? 44 : isCompact ? 32 : 18,
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
          labelLayout: useCircularCompact && nodes.length <= 5 ? undefined : { hideOverlap: true },
          label: {
            show: true,
            position: isCompact ? 'bottom' : 'right',
            distance: 4,
            color: theme.textPrimary,
            fontSize: isCompact ? 9.5 : 11.5,
            overflow: 'truncate',
            width: isCompact ? 76 : 112,
            textBorderColor: dark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
            textBorderWidth: 1.2,
          },
          lineStyle: {
            color: theme.textSecondary,
            width: 1.6,
            curveness: useCircularCompact ? 0.18 : 0.12,
            opacity: dark ? 0.52 : 0.48,
          },
          categories: categories.length > 0 ? categories : undefined,
          data: nodes.map((n) => {
            const catIdx =
              typeof n.category === 'string'
                ? categories.findIndex((c) => c.name === n.category)
                : -1
            return {
              ...n,
              category: catIdx >= 0 ? catIdx : undefined,
            }
          }),
          links,
        },
      ],
    }
  }

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
      isCompact,
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
          fontSize: compactWrapCat ? 9.5 : isCompact ? 10 : 11,
          lineHeight: 12,
          interval: compactWrapCat ? 0 : 'auto',
          hideOverlap: !compactWrapCat,
          formatter: compactWrapCat ? formatCompactCat : undefined,
          ...(!compactWrapCat && isCompact
            ? { width: Math.max(44, catSlotPx), overflow: 'truncate' as const }
            : {}),
        },
      },
      yAxis: {
        type: 'value',
        ...bounds,
        splitNumber: isCompact ? 3 : undefined,
        splitLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.textSecondary, fontSize: isCompact ? 10 : 11, hideOverlap: true },
      },
      series: [
        {
          name: sanitizeChartLabel(
            props.title ?? CHART_MESSAGES[resolveClientLocale()].chartBoxplotDefault,
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
      isCompact,
    )
    const bounds = computeRefAxisBounds(ohlc.flat(), props.referenceLine, true)
    return {
      tooltip: { ...baseTooltip, trigger: 'axis' },
      grid: {
        top: 18,
        right: isCompact ? 10 : 18,
        bottom: props.zoom ? 38 : 16,
        left: isCompact ? 6 : 12,
        containLabel: true,
      },
      dataZoom: zoomCfg,
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: theme.border } },
        axisLabel: {
          color: theme.textSecondary,
          fontSize: isCompact ? 10 : 11,
          hideOverlap: true,
          ...(isCompact
            ? {
                width: Math.max(
                  40,
                  Math.floor(
                    ((containerWidth ?? 276) - 44) / Math.min(5, Math.max(2, categories.length)),
                  ),
                ),
                overflow: 'truncate' as const,
                ellipsis: '…',
              }
            : {}),
        },
      },
      yAxis: {
        type: 'value',
        scale: true,
        ...bounds,
        splitNumber: isCompact ? 3 : undefined,
        splitLine: { lineStyle: { color: theme.border } },
        axisLabel: { color: theme.textSecondary, fontSize: isCompact ? 10 : 11, hideOverlap: true },
      },
      series: [
        {
          name: sanitizeChartLabel(
            props.title ?? CHART_MESSAGES[resolveClientLocale()].chartCandlestickDefault,
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

  if (props.kind === 'scatter') {
    const firstNonNullX = rows.find((r) => r[xKey] !== undefined && r[xKey] !== null)?.[xKey]
    const numericX = typeof firstNonNullX === 'number' && Number.isFinite(firstNonNullX)
    const sizeKey = props.sizeField
    const rawSizes = sizeKey ? rows.map((r) => Math.max(0, toNumber(r[sizeKey]))) : []
    const maxSize = rawSizes.length > 0 ? Math.max(...rawSizes, 1) : 1
    const computeRadiusForVal = (rawVal: number): number => {
      if (!sizeKey) return isCompact ? 9 : 11
      const ratio = Math.sqrt(Math.max(0, rawVal) / maxSize)
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
      isCompact,
    )
    const bounds = computeRefAxisBounds(scatterYVals, props.referenceLine)

    const scatterLabelKey = Object.keys(rows[0] ?? {}).find(
      (rk) =>
        rk !== xKey &&
        !yKeys.includes(rk) &&
        rk !== sizeKey &&
        rk !== props.seriesField &&
        typeof rows[0]?.[rk] === 'string' &&
        String(rows[0]?.[rk]).trim() !== '',
    )
    const resolveScatterPointName = (r: Record<string, unknown>, fallback?: unknown): string =>
      sanitizeChartLabel(
        r.name ??
          r.label ??
          (scatterLabelKey !== undefined ? r[scatterLabelKey] : undefined) ??
          fallback ??
          r[xKey],
      )

    const scatterSeries: Record<string, unknown>[] = props.seriesField
      ? (() => {
          const groupField = props.seriesField
          const groups = [...new Set(rows.map((r) => sanitizeChartLabel(r[groupField])))]
          const xCategories = numericX
            ? []
            : [...new Set(rows.map((r) => sanitizeChartLabel(r[xKey])))]
          return groups.map((group, idx) => {
            const grpRows = rows.filter((r) => sanitizeChartLabel(r[groupField]) === group)
            return {
              name: group,
              type: 'scatter',
              symbolSize: (val: unknown) => {
                if (!sizeKey) return isCompact ? 9 : 11
                if (Array.isArray(val) && val.length >= 3)
                  return computeRadiusForVal(toNumber(val[2]))
                return isCompact ? 9 : 11
              },
              itemStyle: sizeKey ? { opacity: 0.78 } : undefined,
              markLine: idx === 0 ? refLine : undefined,
              data: numericX
                ? grpRows.map((r) => ({
                    name: resolveScatterPointName(r, r[groupField]),
                    value: sizeKey
                      ? [toNumber(r[xKey]), toNumber(r[primaryY]), toNumber(r[sizeKey])]
                      : [toNumber(r[xKey]), toNumber(r[primaryY])],
                  }))
                : grpRows.map((r) => {
                    const cxLabel = sanitizeChartLabel(r[xKey])
                    const cx = xCategories.indexOf(cxLabel)
                    return {
                      name: cxLabel,
                      value: sizeKey
                        ? [cx, toNumber(r[primaryY]), toNumber(r[sizeKey])]
                        : [cx, toNumber(r[primaryY])],
                    }
                  }),
            }
          })
        })()
      : yKeys.map((k, idx) => ({
          name: sanitizeChartLabel(k),
          type: 'scatter',
          symbolSize: (_val: unknown, params?: { dataIndex?: number }) =>
            computeRadiusForVal(rawSizes[params?.dataIndex ?? 0] ?? 0),
          itemStyle: sizeKey ? { opacity: 0.78 } : undefined,
          markLine: idx === 0 ? refLine : undefined,
          data: numericX
            ? rows.map((r) => ({
                name: resolveScatterPointName(r),
                value: sizeKey
                  ? [toNumber(r[xKey]), toNumber(r[k]), toNumber(r[sizeKey])]
                  : [toNumber(r[xKey]), toNumber(r[k])],
              }))
            : rows.map((r) => ({
                name: sanitizeChartLabel(r[xKey]),
                value: toNumber(r[k]),
              })),
        }))

    const showScatterLegend = scatterSeries.length > 1
    const scatterCategories = numericX
      ? undefined
      : props.seriesField
        ? [...new Set(rows.map((r) => sanitizeChartLabel(r[xKey])))]
        : rows.map((r) => sanitizeChartLabel(r[xKey]))

    return {
      color: theme.colors,
      tooltip: { ...baseTooltip, trigger: 'item' },
      legend: showScatterLegend
        ? buildLegendOption({
            isCompact,
            scroll: isCompact || scatterSeries.length >= 4,
            bottom: props.zoom ? 24 : 0,
            names: scatterSeries.map((s) => String(s.name ?? '')),
            textColor: theme.textSecondary,
            containerWidth,
          })
        : undefined,
      grid: {
        top: 18,
        right: isCompact ? 12 : 18,
        bottom: (showScatterLegend ? 32 : 16) + (props.zoom ? 24 : 0),
        left: isCompact ? 8 : 12,
        containLabel: true,
      },
      dataZoom: zoomCfg,
      xAxis: {
        type: numericX ? 'value' : 'category',
        data: scatterCategories,
        splitNumber: numericX && isCompact ? 3 : undefined,
        axisLabel: {
          color: theme.textSecondary,
          fontSize: isCompact ? 10 : 11,
          hideOverlap: true,
          ...(!numericX && isCompact && scatterCategories
            ? {
                width: Math.max(
                  38,
                  Math.floor(
                    ((containerWidth ?? 276) - 44) /
                      Math.min(5, Math.max(2, scatterCategories.length)),
                  ),
                ),
                overflow: 'truncate' as const,
                ellipsis: '…',
              }
            : {}),
        },
        splitLine: { lineStyle: { color: theme.border } },
      },
      yAxis: {
        type: 'value',
        ...bounds,
        splitNumber: isCompact ? 3 : undefined,
        axisLabel: { color: theme.textSecondary, fontSize: isCompact ? 10 : 11, hideOverlap: true },
        splitLine: { lineStyle: { color: theme.border } },
      },
      series: scatterSeries,
    }
  }

  if (props.kind === 'waterfall') {
    const localeMsg = CHART_MESSAGES[resolveClientLocale()]
    const valField =
      (typeof props.yField === 'string' && props.yField !== '' ? props.yField : undefined) ??
      primaryY
    const categories = rows.map((r) => sanitizeChartLabel(r[xKey] ?? r.step ?? r.name ?? r.label))

    let running = 0
    const peaks: number[] = [0]
    const stepDeltas: number[] = []
    const isTotalFlags: boolean[] = []
    const baseData: number[] = []
    const baseNegData: number[] = []
    const totalData: Array<number | '-'> = []
    const incData: Array<number | '-'> = []
    const incNegData: Array<number | '-'> = []
    const decData: Array<number | '-'> = []
    const decNegData: Array<number | '-'> = []
    let hasNegativeRegion = false

    for (const r of rows) {
      const rawVal = r[valField] ?? r.delta ?? r.value ?? r.amount
      const isTotal =
        Boolean(r.total ?? r.isTotal ?? r.summary) || r.type === 'total' || r.kind === 'total'
      const val =
        isTotal && (rawVal === undefined || rawVal === null || rawVal === '')
          ? running
          : toNumber(rawVal)
      stepDeltas.push(val)
      isTotalFlags.push(isTotal)
      if (isTotal) {
        baseData.push(0)
        baseNegData.push(0)
        totalData.push(val)
        incData.push('-')
        incNegData.push('-')
        decData.push('-')
        decNegData.push('-')
        running = val
        peaks.push(running)
        if (val < 0) hasNegativeRegion = true
      } else if (val >= 0) {
        const prev = running
        const next = running + val
        running = next
        peaks.push(prev, next)
        totalData.push('-')
        decData.push('-')
        decNegData.push('-')
        if (prev >= 0) {
          baseData.push(prev)
          baseNegData.push(0)
          incData.push(val)
          incNegData.push('-')
        } else if (next <= 0) {
          hasNegativeRegion = true
          baseData.push(0)
          baseNegData.push(next)
          incData.push('-')
          incNegData.push(-val)
        } else {
          hasNegativeRegion = true
          baseData.push(0)
          baseNegData.push(0)
          incData.push(next)
          incNegData.push(prev)
        }
      } else {
        const prev = running
        const next = running + val
        running = next
        peaks.push(prev, next)
        totalData.push('-')
        incData.push('-')
        incNegData.push('-')
        if (prev >= 0 && next >= 0) {
          baseData.push(next)
          baseNegData.push(0)
          decData.push(Math.abs(val))
          decNegData.push('-')
        } else if (prev <= 0 && next <= 0) {
          hasNegativeRegion = true
          baseData.push(0)
          baseNegData.push(prev)
          decData.push('-')
          decNegData.push(val)
        } else {
          hasNegativeRegion = true
          baseData.push(0)
          baseNegData.push(0)
          decData.push(prev)
          decNegData.push(next)
        }
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
      isCompact,
    )
    const refBounds = computeRefAxisBounds(peaks, props.referenceLine)
    const minPeak = Math.min(0, ...peaks)
    const negHeadroomMin = minPeak < 0 ? -niceUpperBound(Math.abs(minPeak) * 1.24) : undefined
    const bounds = {
      ...refBounds,
      ...(negHeadroomMin !== undefined
        ? {
            min:
              refBounds.min !== undefined
                ? Math.min(refBounds.min, negHeadroomMin)
                : negHeadroomMin,
          }
        : {}),
    }
    const hasTotal = totalData.some((v) => v !== '-')
    const showBarLabels = rows.length <= 8
    const barLabelFontSize = isCompact ? 9.5 : 10.5

    const refVal =
      props.referenceLine !== undefined && Number.isFinite(props.referenceLine)
        ? props.referenceLine
        : undefined
    const yMaxEst = bounds.max ?? niceUpperBound(Math.max(...peaks, refVal ?? 0, 1))
    const yMinEst = bounds.min ?? Math.min(0, ...peaks)
    const ySpan = Math.max(1e-9, yMaxEst - yMinEst)
    const refText =
      props.referenceLabel !== undefined && props.referenceLabel.trim() !== ''
        ? sanitizeChartLabel(props.referenceLabel)
        : refVal !== undefined
          ? String(refVal)
          : ''
    const estW = containerWidth !== undefined && containerWidth > 0 ? containerWidth : 520
    const barSlotW = Math.max(22, (estW - 56) / Math.max(1, rows.length))
    const estBarW = Math.min(34, barSlotW * 0.62)
    let refTextPx = 18
    for (const ch of refText) {
      refTextPx += (ch.codePointAt(0) ?? 0) > 0xff ? 11.2 : 6.8
    }
    const estPillW = Math.max(48, refTextPx)
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

    const fitsInsideBar = (labelText: string, barHeight: number): boolean => {
      const estLabelPx = labelText.length * barLabelFontSize * 0.62
      return barHeight >= ySpan * 0.1 && estBarW >= estLabelPx + 4
    }

    const insideHaloLabel = {
      position: 'inside' as const,
      ...FILLED_SHAPE_LABEL,
    }

    const hasPosTotal = totalData.some((v) => typeof v === 'number' && v >= 0)
    const hasNegTotal = totalData.some((v) => typeof v === 'number' && v < 0)
    const allTotalsNeg = hasNegTotal && !hasPosTotal

    const totalItems = totalData.map((val, i) => {
      if (typeof val !== 'number') return val
      if (val < 0) {
        if (showBarLabels && overlapsRefBand(i, val - ySpan * 0.085, val)) {
          if (fitsInsideBar(String(val), Math.abs(val))) {
            return {
              value: val,
              itemStyle: { color: theme.brand, borderRadius: [0, 0, 4, 4] },
              label: insideHaloLabel,
            }
          }
        }
        if (allTotalsNeg) return val
        return {
          value: val,
          itemStyle: { color: theme.brand, borderRadius: [0, 0, 4, 4] },
          label: { position: 'bottom' as const },
        }
      }
      if (showBarLabels && overlapsRefBand(i, val, val + ySpan * 0.085)) {
        if (fitsInsideBar(String(val), Math.abs(val))) {
          return { value: val, label: insideHaloLabel }
        }
      }
      return val
    })

    const incItems = incData.map((val, i) => {
      if (typeof val !== 'number') return val
      const crossesZero = typeof incNegData[i] === 'number'
      const bottom = baseData[i] ?? 0
      const top = bottom + val
      const text = `+${Math.abs(stepDeltas[i] ?? val)}`
      const styleOverride = crossesZero
        ? { itemStyle: { color: theme.success, borderRadius: [4, 4, 0, 0] } }
        : {}
      if (showBarLabels && overlapsRefBand(i, top, top + ySpan * 0.085)) {
        const mid = bottom + val / 2
        if (
          fitsInsideBar(text, val) &&
          !overlapsRefBand(i, mid - ySpan * 0.04, mid + ySpan * 0.04)
        ) {
          return { value: val, ...styleOverride, label: insideHaloLabel }
        }
        if (!crossesZero && !overlapsRefBand(i, bottom - ySpan * 0.085, bottom - ySpan * 0.015)) {
          return { value: val, ...styleOverride, label: { position: 'bottom' as const } }
        }
        if (val >= ySpan * 0.1) {
          return { value: val, ...styleOverride, label: insideHaloLabel }
        }
      }
      return crossesZero ? { value: val, ...styleOverride } : val
    })

    const decItems = decData.map((val, i) => {
      if (typeof val !== 'number') return val
      const crossesZero = typeof decNegData[i] === 'number'
      if (crossesZero) {
        return {
          value: val,
          itemStyle: { color: theme.danger, borderRadius: [4, 4, 0, 0] },
          label: { show: false },
        }
      }
      const bottom = baseData[i] ?? 0
      const top = bottom + val
      const text = `-${Math.abs(stepDeltas[i] ?? val)}`
      if (showBarLabels && overlapsRefBand(i, bottom - ySpan * 0.085, bottom)) {
        if (!overlapsRefBand(i, top, top + ySpan * 0.085)) {
          return { value: val, label: { position: 'top' as const } }
        }
        if (fitsInsideBar(text, val)) {
          return { value: val, label: insideHaloLabel }
        }
      }
      return val
    })

    const formatIncLabel = (p: { dataIndex?: number; value?: unknown }): string => {
      const idx = typeof p.dataIndex === 'number' ? p.dataIndex : -1
      const delta = idx >= 0 ? stepDeltas[idx] : undefined
      return delta !== undefined ? `+${Math.abs(delta)}` : `+${sanitizeChartLabel(p.value)}`
    }
    const formatDecLabel = (p: { dataIndex?: number; value?: unknown }): string => {
      const idx = typeof p.dataIndex === 'number' ? p.dataIndex : -1
      const delta = idx >= 0 ? stepDeltas[idx] : undefined
      return delta !== undefined ? `-${Math.abs(delta)}` : `-${sanitizeChartLabel(p.value)}`
    }

    const incNegItems = incNegData.map((val, i) => {
      if (typeof val !== 'number') return val
      const onlyNeg = incData[i] === '-'
      return {
        value: val,
        itemStyle: { color: theme.success, borderRadius: [0, 0, 4, 4] },
        label: {
          show: showBarLabels && onlyNeg,
          position: 'bottom' as const,
          color: theme.success,
          fontSize: barLabelFontSize,
          formatter: () => `+${Math.abs(stepDeltas[i] ?? val)}`,
        },
      }
    })
    const decNegItems = decNegData.map((val, i) => {
      if (typeof val !== 'number') return val
      return {
        value: val,
        itemStyle: { color: theme.danger, borderRadius: [0, 0, 4, 4] },
        label: {
          show: showBarLabels,
          position: 'bottom' as const,
          color: theme.danger,
          fontSize: barLabelFontSize,
          formatter: () => `-${Math.abs(stepDeltas[i] ?? val)}`,
        },
      }
    })

    const wfLegendData = hasTotal
      ? [
          localeMsg.chartWaterfallTotal,
          localeMsg.chartWaterfallIncrease,
          localeMsg.chartWaterfallDecrease,
        ]
      : [localeMsg.chartWaterfallIncrease, localeMsg.chartWaterfallDecrease]

    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          if (!Array.isArray(params)) return ''
          const active = (
            params as Array<{
              name?: unknown
              seriesName?: unknown
              value?: unknown
              dataIndex?: unknown
            }>
          ).find((p) => p.value !== '-' && p.value !== undefined && p.seriesName !== '')
          if (!active) return ''
          const title = sanitizeChartLabel(active.name)
          const sName = sanitizeChartLabel(active.seriesName)
          const idx = typeof active.dataIndex === 'number' ? active.dataIndex : -1
          if (idx >= 0 && idx < stepDeltas.length) {
            const delta = stepDeltas[idx]!
            const isTot = isTotalFlags[idx] === true
            const formatted = isTot ? String(delta) : delta > 0 ? `+${delta}` : String(delta)
            return `${title}\n${sName}: ${formatted}`
          }
          const sign = sName === localeMsg.chartWaterfallDecrease ? '-' : ''
          return `${title}\n${sName}: ${sign}${sanitizeChartLabel(active.value)}`
        },
      },
      legend: buildLegendOption({
        isCompact,
        scroll: isCompact,
        bottom: props.zoom ? 24 : 0,
        textColor: theme.textSecondary,
        data: wfLegendData,
        containerWidth,
      }),
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
        axisLabel: {
          color: theme.textSecondary,
          fontSize: isCompact ? 10 : 11,
          hideOverlap: true,
          ...(isCompact
            ? {
                width: Math.max(
                  36,
                  Math.floor(
                    ((containerWidth ?? 276) - 44) / Math.min(6, Math.max(2, categories.length)),
                  ),
                ),
                overflow: 'truncate' as const,
                ellipsis: '…',
              }
            : {}),
        },
      },
      yAxis: {
        type: 'value',
        ...bounds,
        splitNumber: isCompact ? 3 : undefined,
        splitLine: { lineStyle: { color: theme.border, type: 'dashed' } },
        axisLabel: { color: theme.textSecondary, fontSize: isCompact ? 10 : 11, hideOverlap: true },
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
          itemStyle: {
            color: theme.brand,
            borderRadius: allTotalsNeg ? [0, 0, 4, 4] : [4, 4, 0, 0],
          },
          labelLayout: { hideOverlap: true },
          label: {
            show: showBarLabels,
            position: allTotalsNeg ? 'bottom' : 'top',
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
            formatter: formatIncLabel,
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
            formatter: formatDecLabel,
          },
          data: decItems,
        },
        ...(hasNegativeRegion
          ? [
              {
                name: '',
                type: 'bar',
                stack: 'waterfall-neg',
                barGap: '-100%',
                silent: true,
                tooltip: { show: false },
                emphasis: { disabled: true },
                itemStyle: { borderColor: 'transparent', color: 'transparent' },
                data: baseNegData,
              },
              {
                name: localeMsg.chartWaterfallIncrease,
                type: 'bar',
                stack: 'waterfall-neg',
                barGap: '-100%',
                barMaxWidth: 34,
                itemStyle: { color: theme.success, borderRadius: [0, 0, 4, 4] },
                labelLayout: { hideOverlap: true },
                label: { show: false },
                data: incNegItems,
              },
              {
                name: localeMsg.chartWaterfallDecrease,
                type: 'bar',
                stack: 'waterfall-neg',
                barGap: '-100%',
                barMaxWidth: 34,
                itemStyle: { color: theme.danger, borderRadius: [0, 0, 4, 4] },
                labelLayout: { hideOverlap: true },
                label: { show: false },
                data: decNegItems,
              },
            ]
          : []),
      ],
    }
  }

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

    const alignSeriesByCategory = (fieldKey: string): number[] => {
      if (categories.length === rows.length) {
        return rows.map((r) => toNumber(r[fieldKey]))
      }
      const sums = new Map<string, number>()
      for (const r of rows) {
        const cat = sanitizeChartLabel(r[xKey])
        sums.set(cat, (sums.get(cat) ?? 0) + toNumber(r[fieldKey]))
      }
      return categories.map((cat) => sums.get(cat) ?? 0)
    }

    const barDataList = barKeys.map((k) => alignSeriesByCategory(k))
    const lineDataList = lineKeys.map((k) => alignSeriesByCategory(k))
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
      isCompact,
    )
    const stackKey = props.stacked ? 'comboBar' : undefined
    const barFill = dark ? 'rgba(96, 165, 250, 0.40)' : 'rgba(37, 99, 235, 0.26)'

    const barSeries = barKeys.map((k, idx) => {
      const rawArr = barDataList[idx] ?? []
      const hasNegBar = rawArr.some((v) => v < 0)
      return {
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
        data: hasNegBar
          ? rawArr.map((v) => (v < 0 ? { value: v, itemStyle: { borderRadius: [0, 0, 4, 4] } } : v))
          : rawArr,
      }
    })

    const barKeySet = new Set(barKeys)
    const lineColorStart = barKeys.length === 1 ? 3 : barKeys.length
    const lineSeries = lineKeys.map((k, idx) => {
      const col = theme.colors[(lineColorStart + idx) % theme.colors.length]!
      const label = sanitizeChartLabel(k)
      return {
        name: barKeySet.has(k) ? `${label} (2)` : label,
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

    const stackedComboVals = props.stacked
      ? [
          ...categories.map((_, i) =>
            barDataList.reduce((acc, arr) => acc + Math.max(arr[i] ?? 0, 0), 0),
          ),
          ...categories.map((_, i) =>
            barDataList.reduce((acc, arr) => acc + Math.min(arr[i] ?? 0, 0), 0),
          ),
        ]
      : barDataList.flat()
    const lineVals = lineDataList.flat()
    const leftBounds =
      lineKeys.length === 0 ? computeRefAxisBounds(stackedComboVals, props.referenceLine) : {}
    const rightBounds =
      lineKeys.length > 0 ? computeRefAxisBounds(lineVals, props.referenceLine) : {}
    const totalSeriesCount = barSeries.length + lineSeries.length

    const zoomCfg = buildZoomConfig(props.zoom, false, theme.border)
    const legendBottom = props.zoom ? (isCompact ? 26 : 24) : 0
    const leftYAxis = {
      type: 'value' as const,
      ...leftBounds,
      splitNumber: isCompact ? 3 : undefined,
      splitLine: { lineStyle: { color: theme.border, type: 'dashed' as const } },
      axisLabel: {
        color: theme.textSecondary,
        fontSize: isCompact ? 10 : 11,
        hideOverlap: true,
      },
    }
    const rightYAxis = {
      type: 'value' as const,
      ...rightBounds,
      splitNumber: isCompact ? 3 : undefined,
      splitLine: { show: false },
      axisLabel: {
        color: theme.textSecondary,
        fontSize: isCompact ? 10 : 11,
        hideOverlap: true,
      },
    }
    return {
      color: theme.colors,
      tooltip: { ...baseTooltip, trigger: 'axis' },
      legend: buildLegendOption({
        isCompact,
        scroll: isCompact || totalSeriesCount >= 4,
        bottom: legendBottom,
        itemWidth: isCompact ? 10 : 12,
        fontSize: isCompact ? 10.5 : 11.5,
        names: [...barSeries.map((s) => s.name), ...lineSeries.map((s) => s.name)],
        textColor: theme.textSecondary,
        containerWidth,
      }),
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
        axisLabel: {
          color: theme.textSecondary,
          fontSize: isCompact ? 10 : 11,
          hideOverlap: true,
          ...(isCompact
            ? {
                width: Math.max(
                  38,
                  Math.floor(
                    ((containerWidth ?? 276) - 44) / Math.min(6, Math.max(2, categories.length)),
                  ),
                ),
                overflow: 'truncate' as const,
                ellipsis: '…',
              }
            : {}),
        },
      },
      yAxis: lineKeys.length > 0 ? [leftYAxis, rightYAxis] : [leftYAxis],
      series: [...barSeries, ...lineSeries],
    }
  }

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
                  Number.isFinite(Number(sample[k])))),
          )
    const effectiveDims = dimKeys.length > 0 ? dimKeys : yKeys.length > 0 ? yKeys : ['value']
    const labelField = props.seriesField ?? xKey
    const padLeft = isCompact ? 14 : 36
    const padRight = isCompact ? 38 : 50
    const estWidth = containerWidth !== undefined && containerWidth > 0 ? containerWidth : 600
    const axisGap = Math.max(
      22,
      Math.floor((estWidth - padLeft - padRight) / Math.max(1, effectiveDims.length - 1)),
    )
    const staggerHeaders = axisGap < 96 && effectiveDims.length >= 3
    const baseMaxTitleW = staggerHeaders
      ? Math.max(40, Math.floor(axisGap * 1.45))
      : Math.max(38, Math.floor(axisGap * 0.82))

    const parallelAxis = effectiveDims.map((dimKey, idx) => {
      const isEdge = effectiveDims.length > 1 && (idx === 0 || idx === effectiveDims.length - 1)
      const align =
        effectiveDims.length > 1
          ? idx === 0
            ? ('left' as const)
            : idx === effectiveDims.length - 1
              ? ('right' as const)
              : ('center' as const)
          : ('center' as const)
      const axisTitleW =
        isEdge && !staggerHeaders ? Math.max(38, Math.floor(axisGap * 0.6)) : baseMaxTitleW
      return {
        dim: idx,
        name: sanitizeChartLabel(dimKey),
        type: 'value' as const,
        scale: true,
        splitNumber: isCompact ? 3 : 4,
        nameLocation: 'end' as const,
        nameGap: staggerHeaders && idx % 2 === 1 ? 23 : 8,
        nameTruncate: {
          maxWidth: axisTitleW,
        },
        nameTextStyle: {
          align,
          width: axisTitleW,
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
        ? buildLegendOption({
            isCompact,
            scroll: true,
            itemWidth: 14,
            itemHeight: 3,
            names: parallelSeries.map((s) => s.name),
            textColor: theme.textSecondary,
            containerWidth,
          })
        : undefined,
      parallelAxis,
      parallel: {
        top: staggerHeaders ? 44 : 30,
        bottom: showPerRowLegend ? 34 : 16,
        left: padLeft,
        right: padRight,
        parallelAxisDefault: {
          nameGap: 10,
          nameTextStyle: {
            color: theme.textPrimary,
            fontSize: isCompact ? 10 : 10.5,
            fontWeight: 600,
            width: baseMaxTitleW,
            overflow: 'truncate',
          },
          axisLine: { lineStyle: { color: theme.border } },
          axisTick: { lineStyle: { color: theme.border } },
          splitLine: { show: false },
          axisLabel: {
            color: theme.textSecondary,
            fontSize: isCompact ? 9.5 : 10,
            hideOverlap: true,
          },
        },
      },
      series: parallelSeries,
    }
  }

  if (props.kind === 'calendar') {
    const dateField = props.xField ?? 'date'
    const valField =
      (typeof props.yField === 'string' && props.yField !== '' ? props.yField : undefined) ??
      props.sizeField ??
      primaryY

    const dateSums = new Map<string, number>()
    for (const r of rows) {
      const iso = normalizeIsoDate(r[dateField] ?? r.date ?? r.day ?? r[xKey])
      if (!iso) continue
      const val = toNumber(r[valField] ?? r.value ?? r.count ?? r[primaryY])
      dateSums.set(iso, (dateSums.get(iso) ?? 0) + val)
    }
    const parsedCells: Array<[string, number]> = [...dateSums.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )

    const curYear = new Date().getUTCFullYear()
    let rangeStart = `${curYear}-01-01`
    let rangeEnd = `${curYear}-06-30`
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
    const minVal = values.length > 0 ? Math.min(0, ...values) : 0
    const rawMax = values.length > 0 ? Math.max(...values) : 10
    const maxVal = rawMax <= minVal ? minVal + 1 : rawMax
    const spansMultiYear = rangeStart.slice(0, 4) !== rangeEnd.slice(0, 4)
    const emptyCellBg = dark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(17, 24, 39, 0.05)'
    const greenRamp = dark
      ? [emptyCellBg, 'rgba(52, 211, 153, 0.22)', '#10b981', '#34d399', '#6ee7b7']
      : [emptyCellBg, '#d1fae5', '#6ee7b7', '#10b981', '#047857']

    return {
      tooltip: {
        ...baseTooltip,
        formatter: (p: unknown) => {
          const val = (p as { value?: unknown })?.value
          if (Array.isArray(val) && val.length >= 2) {
            return `${sanitizeChartLabel(val[0])}: ${sanitizeChartLabel(val[1])}`
          }
          return ''
        },
      },
      visualMap: {
        min: minVal,
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
        yearLabel: {
          show: spansMultiYear,
          color: theme.textSecondary,
          fontSize: isCompact ? 9 : 10,
          position: 'top',
          margin: 18,
        },
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

  const categories = [...new Set(rows.map((r) => sanitizeChartLabel(r[xKey])))]
  const echartsType = props.kind === 'bar' ? 'bar' : 'line'
  const isArea = props.kind === 'area'
  const isHorizontal = props.kind === 'bar' && Boolean(props.horizontal)
  const stackKey = props.stacked ? 'total' : undefined
  const barRadius = isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]
  const negBarRadius = isHorizontal ? [4, 0, 0, 4] : [0, 0, 4, 4]
  const formatBarData = (vals: readonly (number | null)[]) => {
    if (props.kind !== 'bar' || !vals.some((v) => typeof v === 'number' && v < 0)) {
      return [...vals]
    }
    return vals.map((v) =>
      typeof v === 'number' && v < 0 ? { value: v, itemStyle: { borderRadius: negBarRadius } } : v,
    )
  }

  let series: Record<string, unknown>[]
  if (props.seriesField) {
    const groupField = props.seriesField
    const groups = [...new Set(rows.map((r) => sanitizeChartLabel(r[groupField])))]
    const groupedSums = new Map<string, number>()
    for (const r of rows) {
      const cat = sanitizeChartLabel(r[xKey])
      const grp = sanitizeChartLabel(r[groupField])
      const rawVal = r[primaryY]
      if (rawVal === undefined || rawVal === null || rawVal === '') continue
      const key = `${grp}\u0000${cat}`
      groupedSums.set(key, (groupedSums.get(key) ?? 0) + toNumber(rawVal))
    }
    const missingVal = echartsType === 'line' ? null : 0
    series = groups.map((group) => {
      const rawData = categories.map((cat) => {
        const key = `${group}\u0000${cat}`
        return groupedSums.has(key) ? groupedSums.get(key)! : missingVal
      })
      return {
        name: group,
        type: echartsType,
        smooth: echartsType === 'line',
        stack: stackKey,
        areaStyle: isArea ? { opacity: 0.2 } : undefined,
        barMaxWidth: 32,
        itemStyle: props.kind === 'bar' ? { borderRadius: barRadius } : undefined,
        data: formatBarData(rawData),
      }
    })
  } else {
    series = yKeys.map((k) => {
      let dataValues: number[]
      if (categories.length === rows.length) {
        dataValues = rows.map((r) => toNumber(r[k]))
      } else {
        const sums = new Map<string, number>()
        for (const r of rows) {
          const cat = sanitizeChartLabel(r[xKey])
          sums.set(cat, (sums.get(cat) ?? 0) + toNumber(r[k]))
        }
        dataValues = categories.map((cat) => sums.get(cat) ?? 0)
      }
      return {
        name: sanitizeChartLabel(k),
        type: echartsType,
        smooth: echartsType === 'line',
        stack: stackKey,
        areaStyle: isArea ? { opacity: 0.2 } : undefined,
        barMaxWidth: 32,
        itemStyle: props.kind === 'bar' ? { borderRadius: barRadius } : undefined,
        data: formatBarData(dataValues),
      }
    })
  }

  const extractDatumNum = (raw: unknown): number => {
    if (typeof raw === 'object' && raw !== null && 'value' in raw) {
      return toNumber((raw as { value: unknown }).value)
    }
    return toNumber(raw)
  }

  const stackedPosSums = props.stacked
    ? categories.map((_, cIdx) =>
        series.reduce((sum, s) => {
          const v = extractDatumNum((s.data as unknown[])[cIdx])
          return v > 0 ? sum + v : sum
        }, 0),
      )
    : []
  const stackedNegSums = props.stacked
    ? categories.map((_, cIdx) =>
        series.reduce((sum, s) => {
          const v = extractDatumNum((s.data as unknown[])[cIdx])
          return v < 0 ? sum + v : sum
        }, 0),
      )
    : []
  const isNegRefLine =
    props.referenceLine !== undefined &&
    Number.isFinite(props.referenceLine) &&
    props.referenceLine < 0
  const cartesianEdgeVals = props.stacked
    ? isNegRefLine
      ? stackedNegSums
      : stackedPosSums
    : categories.map((_, cIdx) => {
        const colVals = series.map((s) => extractDatumNum((s.data as unknown[])[cIdx]))
        return isNegRefLine ? Math.min(...colVals) : Math.max(...colVals)
      })
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
    isCompact,
  )
  if (series[0] && refLine) {
    series[0].markLine = refLine
  }

  const cartesianVals = props.stacked
    ? [...stackedPosSums, ...stackedNegSums]
    : series.flatMap((s) => (s.data as unknown[]).map(extractDatumNum))
  const cartesianBounds = computeRefAxisBounds(cartesianVals, props.referenceLine)

  const showLegend = series.length > 1
  const estCartW = containerWidth !== undefined && containerWidth > 0 ? containerWidth : 560
  const maxHBarLabelW = isCompact
    ? Math.min(92, Math.floor(estCartW * 0.35))
    : Math.min(168, Math.floor(estCartW * 0.34))
  const maxVBarLabelW = isCompact
    ? Math.max(40, Math.floor((estCartW - 44) / Math.min(6, Math.max(2, categories.length))))
    : undefined
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
      : {
          color: theme.textSecondary,
          fontSize: isCompact ? 10 : 11,
          hideOverlap: true,
          ...(maxVBarLabelW !== undefined
            ? { width: maxVBarLabelW, overflow: 'truncate' as const, ellipsis: '…' }
            : {}),
        },
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
      ? buildLegendOption({
          isCompact,
          scroll: isCompact || series.length >= 4,
          bottom: props.zoom && !isHorizontal ? 24 : 0,
          fontSize: 11.5,
          names: series.map((s) => String(s.name ?? '')),
          textColor: theme.textSecondary,
          containerWidth,
        })
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
