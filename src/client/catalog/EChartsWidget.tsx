import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import {
  type CSSProperties,
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ChartKind } from '../../shared/catalog-schema.ts'
import { sanitizeInlineUrlText } from '../../shared/constants.ts'
import {
  CHART_LOAD_ERROR_SENTINEL,
  getEchartsChunkServerSnapshot,
  getEchartsChunkSnapshot,
  retryEchartsChunk,
  subscribeEchartsChunk,
} from '../chunk-loader.ts'
import { type EChartsClickParams, useEChartsMount, useTransientFlag } from '../dom-hooks.ts'
import { useRuntimeMessages, useUiLocale } from '../i18n.ts'
import { useDarkTheme } from '../theme.ts'
import css from './Catalog.module.css'
import {
  computeNextCrossFilterValue,
  formatChartDataToCsv,
  normalizeCrossFilterTokens,
} from './v4-helpers.ts'

function chartWeightStyle(weight: number | undefined, minWidth: number): CSSProperties | undefined {
  if (weight === undefined || !Number.isFinite(weight) || weight <= 0) return undefined
  return {
    flexGrow: weight,
    flexBasis: 'var(--a2ui-flex-basis, auto)',
    minWidth: `min(100%, ${minWidth}px)`,
  }
}

export type { ChartKind }

export interface ChartWidgetProps {
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
  readonly onSelectChange?: ((next: string | string[]) => void) | undefined
  readonly exportable?: boolean | undefined
  readonly action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  readonly weight?: number | undefined
}

function hasChartData(kind: ChartKind, data: unknown): boolean {
  if (Array.isArray(data)) {
    return data.some(
      (item) =>
        (typeof item === 'object' && item !== null && !Array.isArray(item)) ||
        (Array.isArray(item) && item.length >= 2),
    )
  }
  if (typeof data === 'object' && data !== null) {
    const rec = data as Record<string, unknown>
    if (kind === 'graph') {
      const nodes = Array.isArray(rec.nodes) ? rec.nodes : []
      const links = Array.isArray(rec.links) ? rec.links : Array.isArray(rec.edges) ? rec.edges : []
      return nodes.length > 0 || links.length > 0
    }
    if (kind === 'sankey') {
      const links = Array.isArray(rec.links) ? rec.links : Array.isArray(rec.edges) ? rec.edges : []
      return links.length > 0
    }
    if (kind === 'sunburst' || kind === 'treemap') {
      return (
        (Array.isArray(rec.children) && rec.children.length > 0) ||
        typeof rec.name === 'string' ||
        typeof rec.label === 'string'
      )
    }
    if (kind === 'gauge') {
      return Object.keys(rec).length > 0
    }
  }
  return false
}

function sanitizeInlineText(input: unknown): string {
  return sanitizeInlineUrlText(input).replace(/(\s)->(\s)/g, '$1→$2')
}

function sanitizeChartValue(input: unknown): string {
  const s = sanitizeInlineUrlText(input).trim()
  if (s === '' || s.startsWith('series\0') || s.startsWith('\0')) return ''
  return s
}

function copyTextSafe(text: string, onSuccess: () => void): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        onSuccess()
      })
      .catch(() => {})
  }
}

export const EChartsWidget = memo(function EChartsWidget(props: ChartWidgetProps) {
  const {
    kind,
    data,
    title,
    xField,
    yField,
    y2Field,
    seriesField,
    sizeField,
    referenceLine,
    referenceLabel,
    stacked,
    horizontal,
    zoom,
    height: rawHeight,
    selected,
    onSelectChange,
    exportable = true,
    action,
    weight,
  } = props

  const dark = useDarkTheme()
  const locale = useUiLocale()
  const msg = useRuntimeMessages()
  const { chunk, error: rawLoadError } = useSyncExternalStore(
    subscribeEchartsChunk,
    getEchartsChunkSnapshot,
    getEchartsChunkServerSnapshot,
  )
  const loadError = rawLoadError === CHART_LOAD_ERROR_SENTINEL ? msg.chartLoadFailed : rawLoadError

  const [containerWidth, setContainerWidth] = useState<number | undefined>(undefined)
  const [copiedCsv, markCopiedCsv] = useTransientFlag(1300)
  const [exportedPng, markExportedPng] = useTransientFlag(1300)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const actionRef = useRef(action)
  actionRef.current = action
  const onSelectChangeRef = useRef(onSelectChange)
  onSelectChangeRef.current = onSelectChange
  const xFieldRef = useRef(xField)
  xFieldRef.current = xField
  const seriesFieldRef = useRef(seriesField)
  seriesFieldRef.current = seriesField
  const rawSelectedRef = useRef(selected)
  rawSelectedRef.current = selected
  const activeTokens = useMemo(
    () =>
      normalizeCrossFilterTokens(selected)
        .map((t) => sanitizeChartValue(t))
        .filter((t) => t !== ''),
    [selected],
  )
  const activeSelectedDisplay = activeTokens.join(' · ')
  const chartHasData = useMemo(() => hasChartData(kind, data), [kind, data])

  const rows = useMemo(() => {
    if (!Array.isArray(data)) return []
    return data.filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item),
    )
  }, [data])
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  const csvPayload = useMemo(
    () => (exportable ? formatChartDataToCsv(data) : null),
    [data, exportable],
  )

  const option = useMemo(() => {
    if (!chunk || !chartHasData) return null
    return chunk.buildChartOption(
      {
        kind,
        data,
        title,
        xField,
        yField,
        y2Field,
        seriesField,
        sizeField,
        referenceLine,
        referenceLabel,
        stacked,
        horizontal,
        zoom,
        height: rawHeight,
        selected:
          activeTokens.length === 0
            ? undefined
            : activeTokens.length === 1
              ? activeTokens[0]
              : activeTokens,
      },
      dark,
      containerWidth,
    )
  }, [
    chunk,
    chartHasData,
    kind,
    data,
    title,
    xField,
    yField,
    y2Field,
    seriesField,
    sizeField,
    referenceLine,
    referenceLabel,
    stacked,
    horizontal,
    zoom,
    rawHeight,
    activeTokens,
    dark,
    locale,
    containerWidth,
  ])

  const safeRawHeight =
    typeof rawHeight === 'number' && Number.isFinite(rawHeight) ? rawHeight : 260
  const height = Math.min(640, Math.max(140, safeRawHeight))

  const handleContainerWidth = useCallback((nextW: number) => {
    setContainerWidth((prev) => {
      if (prev === undefined) return nextW
      const crossedBreakpoint =
        prev < 300 !== nextW < 300 ||
        prev < 360 !== nextW < 360 ||
        prev < 400 !== nextW < 400 ||
        prev < 460 !== nextW < 460
      if (crossedBreakpoint || Math.abs(nextW - prev) >= 16) return nextW
      return prev
    })
  }, [])

  const handlePointClick = useCallback((params: EChartsClickParams) => {
    if (params?.dataType === 'edge') return
    const tupleLabel =
      Array.isArray(params?.value) && typeof params.value[0] === 'string'
        ? sanitizeChartValue(params.value[0])
        : ''
    const label = sanitizeChartValue(params?.name) || tupleLabel
    const series = sanitizeChartValue(params?.seriesName)
    if (onSelectChangeRef.current) {
      const candidate = label || series
      if (candidate) {
        onSelectChangeRef.current(computeNextCrossFilterValue(rawSelectedRef.current, candidate))
      }
    }
    if (!actionRef.current) return
    const idx =
      typeof params?.dataIndex === 'number' && Number.isInteger(params.dataIndex)
        ? params.dataIndex
        : undefined
    const curRows = rowsRef.current
    const sample = curRows[0] ?? {}
    const sampleKeys = Object.keys(sample)
    const resolvedXField =
      xFieldRef.current ?? sampleKeys.find((k) => typeof sample[k] === 'string') ?? sampleKeys[0]
    const curSeriesField = seriesFieldRef.current
    const matchedRow = (() => {
      if (resolvedXField && label) {
        const hit = curRows.find((r) => {
          const xMatch = sanitizeChartValue(r[resolvedXField]) === label
          if (!xMatch) return false
          if (curSeriesField && series) return sanitizeChartValue(r[curSeriesField]) === series
          return true
        })
        if (hit !== undefined) return hit
      }
      return idx !== undefined ? curRows[idx] : undefined
    })()
    const row = matchedRow
    void actionRef.current({
      metadata: {
        extensions: {
          dshSelection: {
            source: 'chart',
            ...(label ? { label } : {}),
            ...(series ? { series } : {}),
            ...(params?.value !== undefined ? { value: params.value } : {}),
            ...(idx !== undefined ? { index: idx } : {}),
            ...(row !== undefined ? { row } : {}),
          },
        },
      },
    })
  }, [])

  const { exportPng } = useEChartsMount({
    hostRef,
    chunk,
    option,
    chartKind: kind,
    dataIdentity: data,
    onPointClick: handlePointClick,
    onContainerWidth: handleContainerWidth,
  })

  const handleExportPng = () => {
    if (!chartHasData) return
    let bg = dark ? '#16181d' : '#ffffff'
    if (typeof window !== 'undefined' && hostRef.current) {
      const cardEl = hostRef.current.closest<HTMLElement>('[data-a2ui-chart]')
      const computedBg = cardEl ? window.getComputedStyle(cardEl).backgroundColor : ''
      if (computedBg && computedBg !== 'transparent' && computedBg !== 'rgba(0, 0, 0, 0)') {
        bg = computedBg
      }
    }
    const ok = exportPng(title || `chart-${kind}`, bg)
    if (ok) {
      markExportedPng()
    }
  }

  const handleCopyCsv = () => {
    if (!csvPayload) return
    copyTextSafe(csvPayload, markCopiedCsv)
  }

  const showActions = Boolean(exportable && chunk && !loadError && chartHasData)
  const showHeader = Boolean(title || activeSelectedDisplay || showActions)
  const isInteractive = Boolean(onSelectChange || action)

  return (
    <div
      className={css.chartCard}
      style={chartWeightStyle(weight, 220)}
      data-a2ui-chart={kind}
      data-a2ui-chart-selected={activeSelectedDisplay || undefined}
      data-crossfilter={onSelectChange ? 'true' : undefined}
    >
      <div className={css.chartInner}>
        {showHeader ? (
          <div className={css.chartHeader}>
            <div className={css.chartTitleGroup}>
              {title ? <div className={css.chartTitle}>{sanitizeInlineText(title)}</div> : null}
              {activeSelectedDisplay ? (
                <span className={css.crossFilterChip} data-a2ui-chart-filter="">
                  <span>{msg.chartFilterActive(activeSelectedDisplay)}</span>
                  {onSelectChange ? (
                    <button
                      type="button"
                      className={css.crossFilterClear}
                      aria-label={msg.chartClearFilter}
                      onClick={() => onSelectChange(Array.isArray(selected) ? [] : '')}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ) : null}
            </div>
            {showActions ? (
              <div className={css.chartActions}>
                <button
                  type="button"
                  className={css.chartActionBtn}
                  onClick={handleExportPng}
                  data-a2ui-chart-export="png"
                >
                  {exportedPng ? msg.chartExportedCheck : msg.chartExportPng}
                </button>
                {csvPayload ? (
                  <button
                    type="button"
                    className={css.chartActionBtn}
                    onClick={handleCopyCsv}
                    data-a2ui-chart-export="csv"
                  >
                    {copiedCsv ? msg.copiedCheck : msg.chartCopyCsv}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {loadError ? (
          <div className={css.emptyCell} role="alert">
            <span>{loadError}</span>{' '}
            <button type="button" className={css.chartActionBtn} onClick={retryEchartsChunk}>
              {msg.retryLoad}
            </button>
          </div>
        ) : !chartHasData ? (
          <div className={css.emptyCell}>{msg.tableEmpty}</div>
        ) : (
          <div style={{ position: 'relative', width: '100%', height }}>
            {!chunk ? (
              <div
                className={css.lazySkeleton}
                style={{ height }}
                role="status"
                aria-busy="true"
                aria-label={msg.chartLoading}
              />
            ) : null}
            <div
              ref={hostRef}
              className={css.chartCanvas}
              style={{
                height,
                visibility: chunk ? 'visible' : 'hidden',
                cursor: isInteractive ? 'pointer' : undefined,
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
})
