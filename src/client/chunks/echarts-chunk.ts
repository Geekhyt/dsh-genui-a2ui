import {
  BarChart,
  BoxplotChart,
  CandlestickChart,
  ChordChart,
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
  MarkAreaComponent,
  MarkLineComponent,
  ParallelComponent,
  PolarComponent,
  RadarComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { LabelLayout, LegacyGridContainLabel } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'
import { CHART_MESSAGES, resolveClientLocale } from '../../shared/chart-i18n.ts'
import { buildComparisonChartOption } from './echarts/cartesian-comparison.ts'
import { buildCartesianCoreChartOption } from './echarts/cartesian-core.ts'
import { buildStatisticalChartOption } from './echarts/cartesian-statistical.ts'
import { buildHierarchyChartOption } from './echarts/hierarchy.ts'
import { buildLegendOption } from './echarts/legend.ts'
import { buildMultivariateChartOption } from './echarts/multivariate.ts'
import { applyCrossFilterSelection, applyDarkSafeThemeDefaults } from './echarts/postprocess.ts'
import { buildRadialChartOption } from './echarts/radial.ts'
import {
  type ChartBuildContext,
  type ChartOptionInput,
  type ChartPalette,
  type EChartsInstance,
  type HistogramBin,
  buildCompactCategoryFormatter,
  buildMarkAreaOption,
  buildReferenceMarkLine,
  buildZoomConfig,
  computeHistogramBins,
  formatCompactTickNum,
  inferFields,
  normalizeChartRows,
  sanitizeChartLabel,
} from './echarts/shared.ts'

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
  ChordChart,
  GridComponent,
  PolarComponent,
  LabelLayout,
  LegacyGridContainLabel,
  TooltipComponent,
  LegendComponent,
  RadarComponent,
  ParallelComponent,
  CalendarComponent,
  MarkLineComponent,
  MarkAreaComponent,
  VisualMapComponent,
  DataZoomComponent,
  CanvasRenderer,
])

export type { ChartOptionInput, EChartsInstance, HistogramBin }
export { computeHistogramBins, normalizeChartRows, sanitizeChartLabel }

const THEME_DARK_NAME = 'a2ui-dark'
const THEME_LIGHT_NAME = 'a2ui-light'

function buildRegisteredEchartsTheme(dark: boolean): Record<string, unknown> {
  const b = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'
  const fg = dark ? '#e5e7eb' : '#111827'
  const sec = dark ? '#9ca3af' : '#4b5563'
  const brand = dark ? '#60a5fa' : '#2563eb'
  const handle = { color: dark ? '#334155' : '#ffffff', borderColor: brand }
  const line = { lineStyle: { color: b } }
  const ax = {
    axisLine: line,
    axisTick: { show: false, ...line },
    axisLabel: { color: sec },
    splitLine: line,
    splitArea: { show: false },
    nameTextStyle: { color: sec },
  }
  const lbl = { color: sec }
  return {
    backgroundColor: 'transparent',
    textStyle: { color: fg },
    categoryAxis: ax,
    valueAxis: ax,
    logAxis: ax,
    timeAxis: ax,
    parallelAxis: ax,
    radar: { axisLine: line, splitLine: line, splitArea: { show: false }, axisName: lbl },
    calendar: {
      itemStyle: { borderColor: b },
      splitLine: line,
      dayLabel: lbl,
      monthLabel: lbl,
      yearLabel: lbl,
    },
    funnel: { itemStyle: { borderColor: dark ? '#18191e' : '#ffffff', borderWidth: 1 } },
    line: { symbol: 'circle', symbolSize: 5 },
    visualMap: { borderColor: b, textStyle: lbl, handleStyle: handle, indicatorStyle: handle },
    dataZoom: { borderColor: b, handleStyle: handle, textStyle: lbl },
    legend: { textStyle: lbl, pageIconColor: brand, pageTextStyle: lbl },
  }
}

let themesRegistered = false

export function registerA2uiEchartsThemes(): void {
  if (themesRegistered) return
  themesRegistered = true
  echarts.registerTheme(THEME_DARK_NAME, buildRegisteredEchartsTheme(true))
  echarts.registerTheme(THEME_LIGHT_NAME, buildRegisteredEchartsTheme(false))
}

registerA2uiEchartsThemes()

export function getA2uiEchartsThemeName(dark: boolean): 'a2ui-dark' | 'a2ui-light' {
  return dark ? THEME_DARK_NAME : THEME_LIGHT_NAME
}

export function initChartInstance(el: HTMLElement, dark?: boolean): EChartsInstance {
  registerA2uiEchartsThemes()
  return dark === undefined ? echarts.init(el) : echarts.init(el, getA2uiEchartsThemeName(dark))
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
    textBrand: dark ? brand : '#1d4ed8',
    textSuccess: dark ? success : '#047857',
    textWarn: dark ? warn : '#b45309',
    textDanger: dark ? danger : '#dc2626',
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

export function buildChartOption(
  props: ChartOptionInput,
  dark: boolean,
  containerWidth?: number,
): echarts.EChartsCoreOption {
  const rows = normalizeChartRows(props.data)
  const theme: ChartPalette = resolvePalette(dark)
  const { xKey, yKeys } = inferFields(rows, props.xField, props.yField, [
    props.seriesField,
    props.sizeField,
  ])
  const primaryY = yKeys[0] ?? 'value'
  const isCompact = containerWidth !== undefined && containerWidth > 0 && containerWidth < 400
  const tooltipMaxW = isCompact ? Math.max(150, Math.min(220, (containerWidth ?? 276) - 36)) : 320
  const baseTooltip = {
    renderMode: 'richText' as const,
    confine: true as const,
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
  const borderLine = { lineStyle: { color: theme.border } }
  const dashedLine = { lineStyle: { color: theme.border, type: 'dashed' as const } }
  const axisLabelBase = {
    color: theme.textSecondary,
    fontSize: isCompact ? 10 : 11,
    hideOverlap: true as const,
  }
  const ctx: ChartBuildContext = {
    props,
    dark,
    containerWidth,
    rows,
    theme,
    xKey,
    yKeys,
    primaryY,
    isCompact,
    baseTooltip,
    itemTooltip: { ...baseTooltip, trigger: 'item' as const },
    axisTooltip: { ...baseTooltip, trigger: 'axis' as const },
    borderLine,
    dashedLine,
    axisLabelBase,
    haloColor: dark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
    msg: CHART_MESSAGES[resolveClientLocale()],
    chartHeight: Math.min(640, Math.max(140, props.height ?? 260)),
    chartWidth: (fallback: number) =>
      containerWidth !== undefined && containerWidth > 0 ? containerWidth : fallback,
    compactCatLabel: (count: number, minW = 36, maxCols = 6, categories?: readonly string[]) => {
      const slotW = Math.max(
        minW,
        Math.floor(((containerWidth ?? 276) - 44) / Math.min(maxCols, Math.max(2, count))),
      )
      const fmt =
        categories && isCompact
          ? buildCompactCategoryFormatter(categories, slotW, isCompact)
          : undefined
      return {
        ...axisLabelBase,
        ...(isCompact
          ? {
              width: slotW,
              overflow: 'truncate' as const,
              ellipsis: '…',
              ...(fmt ? { formatter: fmt } : {}),
            }
          : {}),
      }
    },
    valAxis: (extra?: Record<string, unknown>, dashed = false) => {
      const extraLabel =
        extra && typeof extra.axisLabel === 'object' && extra.axisLabel !== null
          ? (extra.axisLabel as Record<string, unknown>)
          : undefined
      const defaultAxisLabel =
        extraLabel?.formatter !== undefined
          ? { ...axisLabelBase, ...extraLabel }
          : {
              ...axisLabelBase,
              formatter: (v: number) => formatCompactTickNum(v),
              ...extraLabel,
            }
      return {
        type: 'value' as const,
        splitNumber: isCompact ? 3 : undefined,
        splitLine: dashed ? dashedLine : borderLine,
        ...extra,
        axisLabel: defaultAxisLabel,
      }
    },
    legend: (spec) =>
      buildLegendOption({
        isCompact,
        textColor: theme.textSecondary,
        containerWidth,
        ...spec,
      }),
    refLine: (
      color,
      pos = 'insideEndTop',
      val = props.referenceLine,
      label = props.referenceLabel,
      vertical = false,
      hAlign,
    ) => buildReferenceMarkLine(val, label, vertical, color, dark, pos, isCompact, hAlign),
    markArea: (yAxisIndex = 0, yRange, categories, horizontal = false, useLog = false) =>
      buildMarkAreaOption(
        props.markArea,
        theme,
        dark,
        isCompact,
        yAxisIndex,
        yRange,
        categories,
        horizontal,
        useLog,
      ),
    zoom: (horizontal = false) => buildZoomConfig(props.zoom, horizontal, theme.border),
  }
  const raw =
    buildRadialChartOption(ctx) ??
    buildHierarchyChartOption(ctx) ??
    buildMultivariateChartOption(ctx) ??
    buildStatisticalChartOption(ctx) ??
    buildComparisonChartOption(ctx) ??
    buildCartesianCoreChartOption(ctx)
  const themed = applyDarkSafeThemeDefaults(raw, dark, theme)
  return applyCrossFilterSelection(themed, props.selected, dark)
}
