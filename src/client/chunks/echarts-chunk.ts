/**
 * Self-contained ECharts lazy chunk (`lib/client.echarts.js`).
 *
 * Loaded on demand via `require.async("./client.echarts.js")` only when a
 * surface mounts `<Chart>`. Supports all 14 chart kinds plus `horizontal`,
 * `zoom`, and `sizeField`, deriving all colors from DSH `--dsw-*` tokens.
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
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  TreemapChart,
} from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  RadarComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
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
  SankeyChart,
  BoxplotChart,
  GraphChart,
  CandlestickChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  RadarComponent,
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
  readonly seriesField?: string | undefined
  readonly sizeField?: string | undefined
  readonly stacked?: boolean | undefined
  readonly horizontal?: boolean | undefined
  readonly zoom?: boolean | undefined
  readonly height?: number | undefined
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

export function buildChartOption(
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
                center: ['50%', '41%'],
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
              top: 12,
              bottom: 34,
              left: isCompact ? '6%' : '12%',
              width: isCompact ? '88%' : '76%',
              label: isCompact
                ? { position: 'inside', color: '#ffffff', fontSize: 11, overflow: 'truncate' }
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
    return {
      color: theme.colors,
      tooltip: { ...baseTooltip, trigger: 'item' },
      legend:
        yKeys.length > 1
          ? { bottom: 0, textStyle: { color: theme.textSecondary, fontSize: 11.5 } }
          : undefined,
      radar: {
        center: yKeys.length > 1 ? ['50%', '45%'] : ['50%', '50%'],
        radius: isCompact ? '50%' : yKeys.length > 1 ? '58%' : '65%',
        indicator: indicator.length > 0 ? indicator : [{ name: '-', max: 100 }],
        axisName: {
          color: theme.textSecondary,
          fontSize: 11,
          overflow: 'truncate',
          width: isCompact ? 56 : 88,
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
      grid: { top: 14, right: 18, bottom: 42, left: 12, containLabel: true },
      xAxis: {
        type: 'category',
        data: xCats,
        splitArea: { show: true },
        axisLabel: { color: theme.textSecondary, fontSize: 11 },
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
        bottom: 0,
        itemWidth: 12,
        itemHeight: 90,
        textStyle: { color: theme.textSecondary, fontSize: 11 },
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

  /* ── 6: Treemap ── */
  if (props.kind === 'treemap') {
    const nameField = props.xField ?? 'name'
    const valField = (typeof props.yField === 'string' ? props.yField : undefined) ?? 'value'
    const groupField = props.seriesField

    let treeData: Record<string, unknown>[]
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
      treeData = rows.map(mapNode)
    } else if (groupField) {
      const groups = new Map<string, { name: string; value: number }[]>()
      const otherLabel = RUNTIME_MESSAGES[resolveClientLocale()].chartOtherGroup
      for (const r of rows) {
        const g = sanitizeChartLabel(r[groupField] ?? otherLabel)
        const list = groups.get(g) ?? []
        list.push({
          name: sanitizeChartLabel(r[nameField] ?? r.name ?? r.label),
          value: toNumber(r[valField] ?? r.value),
        })
        groups.set(g, list)
      }
      treeData = [...groups.entries()].map(([gName, children]) => ({ name: gName, children }))
    } else {
      treeData = rows.map((r) => ({
        name: sanitizeChartLabel(r[nameField] ?? r.name ?? r.label ?? r[xKey]),
        value: toNumber(r[valField] ?? r.value ?? r[primaryY]),
      }))
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
            borderColor: dark ? '#18181b' : '#ffffff',
            borderWidth: 2,
            gapWidth: 2,
            borderRadius: 6,
          },
          label: { show: true, color: '#ffffff', fontSize: 11.5, fontWeight: 500 },
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

    const rawLinks = rows.map((r) => ({
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
        ? Math.max(72, Math.floor(containerWidth * 0.36))
        : 190
    const rightPadding = Math.min(maxPad, Math.max(84, Math.ceil(maxRightLabelPx + 24)))

    return {
      color: theme.colors,
      tooltip: { ...baseTooltip, trigger: 'item' },
      series: [
        {
          type: 'sankey',
          top: 12,
          bottom: 12,
          left: 12,
          right: rightPadding,
          emphasis: { focus: 'adjacency' },
          nodeGap: 10,
          nodeWidth: 16,
          lineStyle: { color: 'gradient', curveness: 0.5, opacity: dark ? 0.38 : 0.3 },
          label: {
            color: theme.textPrimary,
            fontSize: 11.5,
            overflow: 'truncate',
            width: Math.max(48, rightPadding - 14),
          },
          data: nodeNames.map((name) => ({ name })),
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
      nodes = (rawObj.nodes as Record<string, unknown>[])
        .filter((n) => n && typeof n === 'object')
        .map((n) => ({
          id: sanitizeChartLabel(n.id ?? n.name),
          name: sanitizeChartLabel(n.name ?? n.id),
          symbolSize: n.size ? Math.min(54, Math.max(18, toNumber(n.size))) : 30,
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
                    fontSize: 10,
                    color: theme.textSecondary,
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
          layout: 'force',
          roam: true,
          draggable: true,
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: [4, 8],
          force: { repulsion: 180, edgeLength: [65, 120], layoutAnimation: true },
          label: { show: true, position: 'right', color: theme.textPrimary, fontSize: 11.5 },
          lineStyle: { color: theme.border, width: 1.5, curveness: 0.12, opacity: 0.85 },
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
    return {
      color: theme.colors,
      tooltip: { ...baseTooltip, trigger: 'item' },
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
      if (!sizeKey) return 11
      const ratio = Math.sqrt((rawSizes[idx] ?? 0) / maxSize)
      return Math.round(8 + ratio * 32)
    }

    const zoomCfg = buildZoomConfig(props.zoom, false, theme.border)
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
        axisLabel: { color: theme.textSecondary, fontSize: 11 },
        splitLine: { lineStyle: { color: theme.border } },
      },
      series: yKeys.map((k) => ({
        name: sanitizeChartLabel(k),
        type: 'scatter',
        symbolSize: (_val: unknown, params?: { dataIndex?: number }) =>
          computeRadius(params?.dataIndex ?? 0),
        itemStyle: sizeKey ? { opacity: 0.78 } : undefined,
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

  /* ── 12, 13 & 14: Cartesian Bar / Line / Area (+ `horizontal`, `stacked`, `zoom`) ── */
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

  const showLegend = series.length > 1
  const categoryAxis = {
    type: 'category' as const,
    data: categories,
    inverse: isHorizontal ? true : undefined,
    axisLine: { lineStyle: { color: theme.border } },
    axisLabel: { color: theme.textSecondary, fontSize: 11, hideOverlap: true },
  }
  const valueAxis = {
    type: 'value' as const,
    splitLine: { lineStyle: { color: theme.border } },
    axisLabel: { color: theme.textSecondary, fontSize: 11 },
  }
  const zoomCfg = buildZoomConfig(props.zoom, isHorizontal, theme.border)

  return {
    color: theme.colors,
    tooltip: { ...baseTooltip, trigger: 'axis' },
    legend: showLegend
      ? {
          bottom: props.zoom && !isHorizontal ? 24 : 0,
          textStyle: { color: theme.textSecondary, fontSize: 11.5 },
        }
      : undefined,
    dataZoom: zoomCfg,
    grid: {
      top: 16,
      right: isHorizontal && props.zoom ? 28 : 18,
      bottom: (showLegend ? 32 : 12) + (props.zoom && !isHorizontal ? 24 : 0),
      left: 12,
      containLabel: true,
    },
    xAxis: isHorizontal ? valueAxis : categoryAxis,
    yAxis: isHorizontal ? categoryAxis : valueAxis,
    series,
  }
}
