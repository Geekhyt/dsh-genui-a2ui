import type * as echarts from 'echarts/core'
import type { ChartKind } from '../../../shared/catalog-schema.ts'
import {
  CHART_MESSAGES,
  type ChartUiMessages,
  resolveClientLocale,
} from '../../../shared/chart-i18n.ts'
import { sanitizeInlineUrlText } from '../../../shared/constants.ts'

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
  readonly step?: boolean | undefined
  readonly yScale?: 'linear' | 'log' | undefined
  readonly stackMode?: 'value' | 'percent' | undefined
  readonly markArea?: unknown
  readonly referenceX?: number | undefined
  readonly referenceXLabel?: string | undefined
  readonly bins?: number | undefined
}

export interface ChartPalette {
  readonly brand: string
  readonly success: string
  readonly warn: string
  readonly danger: string
  readonly colors: string[]
  readonly textPrimary: string
  readonly textSecondary: string
  readonly border: string
  readonly tooltipBg: string
  readonly tooltipText: string
  readonly tooltipBorder: string
  readonly heatLow: string
}

export interface ChartTooltipBase {
  readonly renderMode: 'richText'
  readonly confine: true
  readonly backgroundColor: string
  readonly borderColor: string
  readonly padding: number[]
  readonly textStyle: {
    readonly color: string
    readonly fontSize: number
    readonly width: number
    readonly overflow: 'break'
  }
}

export interface LegendSpec {
  readonly scroll: boolean
  readonly bottom?: number | undefined
  readonly fontSize?: number | undefined
  readonly itemWidth?: number | undefined
  readonly itemHeight?: number | undefined
  readonly data?:
    | readonly (string | { readonly name: string; readonly icon?: string })[]
    | undefined
  readonly names?: readonly string[] | undefined
}

export interface ChartBuildContext {
  readonly props: ChartOptionInput
  readonly dark: boolean
  readonly containerWidth: number | undefined
  readonly rows: readonly Record<string, unknown>[]
  readonly theme: ChartPalette
  readonly xKey: string
  readonly yKeys: string[]
  readonly primaryY: string
  readonly isCompact: boolean
  readonly baseTooltip: ChartTooltipBase
  readonly itemTooltip: ChartTooltipBase & { readonly trigger: 'item' }
  readonly axisTooltip: ChartTooltipBase & { readonly trigger: 'axis' }
  readonly borderLine: { readonly lineStyle: { readonly color: string } }
  readonly dashedLine: { readonly lineStyle: { readonly color: string; readonly type: 'dashed' } }
  readonly axisLabelBase: {
    readonly color: string
    readonly fontSize: number
    readonly hideOverlap: true
  }
  readonly haloColor: string
  readonly msg: ChartUiMessages
  readonly chartHeight: number
  readonly chartWidth: (fallback: number) => number
  readonly compactCatLabel: (
    count: number,
    minW?: number,
    maxCols?: number,
  ) => Record<string, unknown>
  readonly valAxis: (extra?: Record<string, unknown>, dashed?: boolean) => Record<string, unknown>
  readonly legend: (spec: LegendSpec) => Record<string, unknown>
  readonly refLine: (
    color: string,
    pos?: 'insideEndTop' | 'insideStartTop' | 'start' | 'end',
    val?: number | undefined,
    label?: string | undefined,
    vertical?: boolean,
    hAlign?: 'left' | 'center' | 'right',
  ) => Record<string, unknown> | undefined
  readonly markArea: (
    yAxisIndex?: number,
    yRange?: readonly [number, number],
    categories?: readonly string[],
    horizontal?: boolean,
    useLog?: boolean,
  ) => Record<string, unknown> | undefined
  readonly zoom: (horizontal?: boolean) => Record<string, unknown>[] | undefined
}

export function sanitizeChartLabel(input: unknown): string {
  if (typeof input === 'number' && !Number.isFinite(input)) return ''
  return sanitizeInlineUrlText(input)
}

export function visualWidthOf(raw: string): number {
  let units = 0
  for (const ch of raw) {
    units += (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1
  }
  return units
}

export function truncateByVisualWidth(raw: string, maxUnits: number): string {
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

export function toFiniteNum(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  if (typeof input === 'string') {
    const t = input.replace(/,/g, '').trim()
    if (t === '') return null
    const parsed = Number(t)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function toNumber(input: unknown): number {
  return toFiniteNum(input) ?? 0
}

export function normalizeChartRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return []
  return data.filter(
    (item): item is Record<string, unknown> =>
      typeof item === 'object' && item !== null && !Array.isArray(item),
  )
}

export const ZOOM_LEGEND_BOTTOM = 30

export function scanSampleKeys(
  rows: readonly Record<string, unknown>[],
  limit = 16,
): {
  readonly keys: string[]
  readonly stringKeys: string[]
  readonly numericKeys: string[]
} {
  const slice = rows.slice(0, limit)
  const keys: string[] = []
  const seen = new Set<string>()
  for (const r of slice) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k)
        keys.push(k)
      }
    }
  }
  const stringKeys = keys.filter((k) => slice.some((r) => typeof r[k] === 'string'))
  const numericKeys = keys.filter((k) =>
    slice.some((r) => typeof r[k] === 'number' && Number.isFinite(r[k])),
  )
  return { keys, stringKeys, numericKeys }
}

export function inferFields(
  rows: readonly Record<string, unknown>[],
  explicitX: string | undefined,
  explicitY: string | string[] | undefined,
  excludeKeys?: readonly (string | undefined)[],
): { xKey: string; yKeys: string[] } {
  const excluded = new Set((excludeKeys ?? []).filter((k): k is string => Boolean(k)))
  const { keys, stringKeys, numericKeys: allNumeric } = scanSampleKeys(rows)
  const xKey =
    explicitX ?? stringKeys.find((k) => !excluded.has(k)) ?? stringKeys[0] ?? keys[0] ?? 'label'

  if (typeof explicitY === 'string' && explicitY !== '') {
    return { xKey, yKeys: [explicitY] }
  }
  if (Array.isArray(explicitY) && explicitY.length > 0) {
    return { xKey, yKeys: explicitY }
  }
  const numericKeys = allNumeric.filter((k) => k !== xKey && !excluded.has(k))
  return {
    xKey,
    yKeys:
      numericKeys.length > 0
        ? numericKeys
        : keys.filter((k) => k !== xKey && !excluded.has(k)).slice(0, 1),
  }
}

export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]!
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sorted[base + 1] ?? sorted[base]!
  return Number((sorted[base]! + rest * (next - sorted[base]!)).toPrecision(10))
}

export const FILLED_SHAPE_LABEL = {
  color: '#ffffff',
  fontWeight: 600,
  textBorderColor: 'rgba(15, 23, 42, 0.78)',
  textBorderWidth: 0.8,
  textShadowColor: 'rgba(15, 23, 42, 0.85)',
  textShadowBlur: 3,
  textShadowOffsetY: 1,
} as const

export function extractBoxplotFive(
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

export function filterAcyclicLinks<T extends { source: string; target: string }>(
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

export function buildZoomConfig(
  enabled: boolean | undefined,
  horizontal: boolean | undefined,
  border: string,
) {
  if (!enabled) return undefined
  return horizontal
    ? [
        { type: 'inside', yAxisIndex: 0, zoomOnMouseWheel: 'ctrl' },
        {
          type: 'slider',
          yAxisIndex: 0,
          width: 14,
          right: 6,
          moveHandleSize: 5,
          borderColor: border,
        },
      ]
    : [
        { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: 'ctrl' },
        {
          type: 'slider',
          xAxisIndex: 0,
          height: 14,
          bottom: 8,
          moveHandleSize: 5,
          borderColor: border,
        },
      ]
}

export function computeEvenAxisInterval(maxVal: number, isCompact: boolean): number | undefined {
  if (!Number.isFinite(maxVal) || maxVal <= 0) return undefined
  const mag = 10 ** Math.floor(Math.log10(maxVal))
  const scaled = Math.round((maxVal / mag) * 1000)
  const divs = isCompact ? [4, 3, 2, 5] : [5, 4, 3, 2]
  for (const d of divs) {
    if (scaled % d === 0) return Number((maxVal / d).toPrecision(6))
  }
  return Number((maxVal / (isCompact ? 3 : 4)).toPrecision(6))
}

export function buildCompactCategoryFormatter(
  categories: readonly string[],
  maxWidthPx: number,
  isCompact: boolean,
): ((val: string) => string) | undefined {
  if (!isCompact || categories.length < 2) return undefined
  const maxUnits = Math.max(4, Math.floor(maxWidthPx / 6.2))
  const unique = [...new Set(categories)]
  if (unique.length < 2) return undefined
  const seen = new Set<string>()
  let collides = false
  for (const c of unique) {
    const t = truncateByVisualWidth(c, maxUnits)
    if (seen.has(t)) {
      collides = true
      break
    }
    seen.add(t)
  }
  if (!collides) return undefined
  if (unique.every((c) => /^\d{4}-\d{2}$/.test(c))) {
    const sameYear = unique.every((c) => c.slice(0, 5) === unique[0]!.slice(0, 5))
    return (v: string) => (sameYear && maxUnits < 5 ? v.slice(5) : v.slice(2))
  }
  if (unique.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c))) {
    const sameYear = unique.every((c) => c.slice(0, 5) === unique[0]!.slice(0, 5))
    if (sameYear) return (v: string) => v.slice(5)
  }
  let lcp = unique[0]!
  for (let i = 1; i < unique.length && lcp.length > 0; i++) {
    const cur = unique[i]!
    let j = 0
    while (j < lcp.length && j < cur.length && lcp[j] === cur[j]) j++
    lcp = lcp.slice(0, j)
  }
  let delimIdx = -1
  for (const sep of '-/_: ') delimIdx = Math.max(delimIdx, lcp.lastIndexOf(sep))
  const cut = delimIdx >= 2 ? delimIdx + 1 : lcp.length >= 4 ? lcp.length : 0
  if (cut > 0) {
    return (v: string) => {
      const tail = v.startsWith(lcp.slice(0, cut)) ? v.slice(cut) : v
      return truncateByVisualWidth(tail || v, maxUnits)
    }
  }
  return undefined
}

const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const

export function niceUpperBound(v: number): number {
  if (v <= 0) return 0
  const mag = 10 ** Math.floor(Math.log10(v))
  const norm = v / mag
  const step = NICE_STEPS.find((s) => norm <= s) ?? 10
  return Number((step * mag).toPrecision(6))
}

export function computeRefAxisBounds(
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

export function pickMarkLinePosition(
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

export function pickVerticalMarkLineAlign(
  val: number,
  minVal: number,
  maxVal: number,
): 'left' | 'center' | 'right' {
  const span = maxVal - minVal
  if (!(span > 0)) return 'center'
  const frac = (val - minVal) / span
  return frac > 0.72 ? 'right' : frac < 0.28 ? 'left' : 'center'
}

export function buildReferenceMarkLine(
  value: number | undefined,
  label: string | undefined,
  horizontal: boolean | undefined,
  color: string,
  dark: boolean,
  position: 'insideStartTop' | 'insideEndTop' | 'start' | 'end' = 'insideEndTop',
  compact = false,
  align?: 'left' | 'center' | 'right',
): Record<string, unknown> | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  const rawText =
    label !== undefined && label.trim() !== '' ? sanitizeChartLabel(label) : String(value)
  const text = truncateByVisualWidth(rawText, compact ? 20 : 32)
  return {
    silent: true,
    animation: false,
    symbol: ['none', 'none'],
    lineStyle: { color, type: 'dashed', width: 1.5 },
    label: {
      formatter: () => text,
      position: horizontal ? (position === 'end' ? 'end' : 'start') : position,
      rotate: horizontal ? 0 : undefined,
      ...(horizontal && align ? { align } : {}),
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

export function extractFlowData(
  data: unknown,
  rows: readonly Record<string, unknown>[],
  srcField: string,
  tgtField: string,
  valField: string,
  fallbackValKey: string,
  defaultVal: number,
  skipSelfLoop: boolean,
): {
  readonly nodeNames: Set<string>
  readonly links: { source: string; target: string; value: number }[]
} {
  const rawObj =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null
  const rawLinks = Array.isArray(rawObj?.links)
    ? (rawObj.links as Record<string, unknown>[])
    : Array.isArray(rawObj?.edges)
      ? (rawObj.edges as Record<string, unknown>[])
      : rows
  const idToName = new Map<string, string>()
  const nodeNames = new Set<string>()
  if (Array.isArray(rawObj?.nodes)) {
    for (const n of rawObj.nodes as Record<string, unknown>[]) {
      const nid = sanitizeChartLabel(n?.id)
      const name = sanitizeChartLabel(n?.name ?? n?.label ?? n?.id)
      if (nid && name) idToName.set(nid, name)
      if (name) nodeNames.add(name)
    }
  }
  const linkTotals = new Map<string, { source: string; target: string; value: number }>()
  for (const r of rawLinks) {
    if (typeof r !== 'object' || r === null) continue
    const rawSrc = sanitizeChartLabel(r[srcField] ?? r.source ?? r.from)
    const rawTgt = sanitizeChartLabel(r[tgtField] ?? r.target ?? r.to)
    const source = idToName.get(rawSrc) ?? rawSrc
    const target = idToName.get(rawTgt) ?? rawTgt
    const value = Math.max(0, toNumber(r[valField] ?? r.value ?? r[fallbackValKey] ?? defaultVal))
    if (!source || !target || value <= 0 || (skipSelfLoop && source === target)) continue
    nodeNames.add(source)
    nodeNames.add(target)
    const key = `${source}\u0000${target}`
    const prev = linkTotals.get(key)
    if (prev) prev.value += value
    else linkTotals.set(key, { source, target, value })
  }
  return { nodeNames, links: [...linkTotals.values()] }
}

export function buildHierarchyTree(
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
          ? Math.max(0, toNumber(node[valField] ?? node.value))
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
        value: Math.max(0, toNumber(r[valField] ?? r.value ?? r[primaryY])),
      })
      groups.set(g, list)
    }
    return [...groups.entries()].map(([gName, children]) => ({ name: gName, children }))
  }

  return rows.map((r) => ({
    name: sanitizeChartLabel(r[nameField] ?? r.name ?? r.label ?? r[xKey]),
    value: Math.max(0, toNumber(r[valField] ?? r.value ?? r[primaryY])),
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

export function normalizeIsoDate(raw: unknown): string | null {
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

export function extractCategoryAxisLabels(
  option: Record<string, unknown>,
): readonly string[] | null {
  for (const axisKey of ['xAxis', 'yAxis', 'radiusAxis'] as const) {
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

export function resolveYRange(
  vals: readonly number[],
  bounds: { readonly min?: number; readonly max?: number },
): readonly [number, number] | undefined {
  let lo = bounds.min ?? 0
  let hi = bounds.max ?? 0
  let hasVal = bounds.min !== undefined || bounds.max !== undefined
  for (const v of vals) {
    if (!Number.isFinite(v)) continue
    if (!hasVal) {
      lo = Math.min(0, v)
      hi = v
      hasVal = true
    } else {
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  return hasVal && hi > lo ? [lo, hi] : undefined
}

export function buildMarkAreaOption(
  rawMarkArea: unknown,
  theme: ChartPalette,
  dark: boolean,
  isCompact: boolean,
  yOffset = 0,
  yRange?: readonly [number, number],
  categories?: readonly string[],
  horizontal = false,
  useLog = false,
): Record<string, unknown> | undefined {
  if (!Array.isArray(rawMarkArea) || rawMarkArea.length === 0) return undefined
  const catSet = categories ? new Set(categories) : null
  const toneMap: Record<string, readonly [string, string, string]> = {
    danger: ['rgba(248, 113, 113, 0.16)', 'rgba(239, 68, 68, 0.11)', theme.danger],
    warning: ['rgba(251, 191, 36, 0.16)', 'rgba(245, 158, 11, 0.12)', theme.warn],
    success: ['rgba(52, 211, 153, 0.15)', 'rgba(16, 185, 129, 0.11)', theme.success],
    info: ['rgba(96, 165, 250, 0.14)', 'rgba(37, 99, 235, 0.09)', theme.brand],
  }
  const toneFill = (tone: string) => {
    const entry = toneMap[tone] ?? toneMap.info!
    return { fill: dark ? entry[0] : entry[1], labelColor: entry[2] }
  }
  const shiftY = (v: unknown): unknown =>
    yOffset !== 0 && typeof v === 'number' && Number.isFinite(v)
      ? Number((v + yOffset).toFixed(4))
      : v
  const isValidCatBound = (v: unknown): boolean => {
    if (!catSet) return true
    if (catSet.size === 0) return false
    if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v < catSet.size
    return catSet.has(sanitizeChartLabel(v))
  }
  const areas: unknown[] = []
  for (const raw of rawMarkArea) {
    if (typeof raw !== 'object' || raw === null) continue
    const rec = raw as Record<string, unknown>
    const startVal = rec.start ?? rec.from ?? rec.x0
    const endVal = rec.end ?? rec.to ?? rec.x1
    if (startVal === undefined || endVal === undefined) continue
    const tone = typeof rec.tone === 'string' ? rec.tone.trim().toLowerCase() : 'info'
    const { fill, labelColor } = toneFill(tone)
    const lbl = rec.label !== undefined && rec.label !== null ? sanitizeChartLabel(rec.label) : ''
    const isY = rec.axis === 'y'
    if (!isY && (!isValidCatBound(startVal) || !isValidCatBound(endVal))) continue
    const sVal = isY ? shiftY(startVal) : startVal
    const eVal = isY ? shiftY(endVal) : endVal
    if (
      isY &&
      useLog &&
      ((typeof sVal === 'number' && sVal <= 0) || (typeof eVal === 'number' && eVal <= 0))
    ) {
      continue
    }
    const useYAxisKey = horizontal ? !isY : isY
    const useTopAboveYBand =
      isY &&
      !horizontal &&
      yRange !== undefined &&
      typeof sVal === 'number' &&
      typeof eVal === 'number' &&
      yRange[1] > yRange[0] &&
      Math.max(sVal, eVal) <= yRange[0] + (yRange[1] - yRange[0]) * 0.35
    const startPoint: Record<string, unknown> = {
      ...(useYAxisKey ? { yAxis: sVal } : { xAxis: sVal }),
      itemStyle: { color: fill },
      ...(lbl !== ''
        ? {
            name: truncateByVisualWidth(lbl, isCompact ? 10 : 18),
            label: {
              show: true,
              position: useTopAboveYBand ? 'top' : 'insideTop',
              color: labelColor,
              fontSize: isCompact ? 9 : 10,
              fontWeight: 600,
              distance: useTopAboveYBand ? 3 : 4,
            },
          }
        : {}),
    }
    const endPoint: Record<string, unknown> = useYAxisKey ? { yAxis: eVal } : { xAxis: eVal }
    areas.push([startPoint, endPoint])
  }
  if (areas.length === 0) return undefined
  return { silent: true, animation: false, data: areas }
}

export function formatCompactTickNum(v: number, span?: number): string {
  if (!Number.isFinite(v)) return '0'
  if (span !== undefined && span > 0 && span < 2) {
    const digits = span < 0.05 ? 4 : span < 0.5 ? 3 : 2
    return String(Number(v.toFixed(digits)))
  }
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${Number((v / 1e9).toFixed(1))}B`
  if (abs >= 1e6) return `${Number((v / 1e6).toFixed(1))}M`
  if (abs >= 1e4) return `${Number((v / 1e3).toFixed(1))}K`
  if (abs >= 1000) return String(Math.round(v))
  if (abs >= 10) return String(Number(v.toFixed(1)))
  if (abs > 0 && abs < 0.01) return String(Number(v.toPrecision(2)))
  return String(Number(v.toFixed(2)))
}

export interface HistogramBin {
  readonly label: string
  readonly start: number
  readonly end: number
  readonly count: number
  readonly pct: number
}

export function computeHistogramBins(
  rawValues: readonly number[],
  requestedBins: number | undefined,
  isCompact: boolean,
): readonly HistogramBin[] {
  const finite = rawValues.filter(Number.isFinite).sort((a, b) => a - b)
  if (finite.length === 0) return []
  const minVal = finite[0]!
  const maxVal = finite[finite.length - 1]!
  const span = maxVal - minVal
  if (span <= 0) {
    return [
      {
        label: formatCompactTickNum(minVal),
        start: minVal,
        end: maxVal,
        count: finite.length,
        pct: 100,
      },
    ]
  }
  const q1 = quantile(finite, 0.25)
  const q3 = quantile(finite, 0.75)
  const iqr = q3 - q1
  let autoBins = Math.ceil(Math.log2(finite.length) + 1)
  if (iqr > 0) {
    const fdWidth = (2 * iqr) / Math.cbrt(finite.length)
    if (fdWidth > 0) {
      autoBins = Math.ceil(span / fdWidth)
    }
  }
  const maxAuto = isCompact ? 8 : 14
  const hasExplicitBins = typeof requestedBins === 'number' && Number.isFinite(requestedBins)
  let binCount = hasExplicitBins
    ? Math.max(2, Math.min(isCompact ? 12 : 40, Math.trunc(requestedBins)))
    : Math.max(4, Math.min(maxAuto, autoBins))
  let binStart = minVal
  let binEnd = maxVal
  let step = span / binCount
  if (!hasExplicitBins) {
    const rawStep = span / binCount
    const mag = 10 ** Math.floor(Math.log10(rawStep))
    for (const mult of [1, 2, 2.5, 5, 10]) {
      const cand = mult * mag
      const lo = Math.floor(minVal / cand + 1e-9) * cand
      const hi = Math.ceil(maxVal / cand - 1e-9) * cand
      const cnt = Math.round((hi - lo) / cand)
      if (cnt >= 4 && cnt <= maxAuto) {
        step = cand
        binStart = lo
        binEnd = hi
        binCount = cnt
        break
      }
    }
  }
  const counts = new Array<number>(binCount).fill(0)
  for (const v of finite) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((v - binStart) / step + 1e-9)))
    counts[idx] = (counts[idx] ?? 0) + 1
  }
  const cleanNum = (n: number): number =>
    Math.abs(n) < step * 1e-9 ? 0 : Number(n.toPrecision(10))
  return counts.map((count, i) => {
    const start = cleanNum(binStart + i * step)
    const end = i === binCount - 1 ? cleanNum(binEnd) : cleanNum(binStart + (i + 1) * step)
    return {
      label: `${formatCompactTickNum(start)}–${formatCompactTickNum(end)}`,
      start,
      end,
      count,
      pct: Number(((count / finite.length) * 100).toFixed(1)),
    }
  })
}

export function canUseLogScale(
  yScale: 'linear' | 'log' | undefined,
  values: readonly number[],
): boolean {
  if (yScale !== 'log') return false
  return values.some((v) => Number.isFinite(v) && v > 0)
}
