/**
 * Lazy-loaded ECharts `Chart` component for `dsh-genui-a2ui`.
 *
 * Keeps `echarts` completely out of `lib/client.js`: subscribes to
 * `lib/client.echarts.js` via `useSyncExternalStore`, displays a token-themed
 * shimmer skeleton while loading, memoizes options over primitive/data fields,
 * and delegates imperative `<canvas>` + `ResizeObserver` bindings to `dom-hooks.ts`.
 */
import { memo, useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import type { ChartKind } from '../../shared/catalog-schema.ts'
import {
  CHART_LOAD_ERROR_SENTINEL,
  getEchartsChunkServerSnapshot,
  getEchartsChunkSnapshot,
  subscribeEchartsChunk,
} from '../chunk-loader.ts'
import { useEChartsMount, type EChartsClickParams } from '../dom-hooks.ts'
import { useRuntimeMessages } from '../i18n.ts'
import { useDarkTheme } from '../theme.ts'
import css from './Catalog.module.css'
import { computeNextCrossFilterSelection, formatChartDataToCsv } from './v4-helpers.ts'

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
  readonly selected?: string | undefined
  readonly onSelectChange?: ((next: string) => void) | undefined
  readonly exportable?: boolean | undefined
  readonly action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  readonly weight?: number | undefined
}

function sanitizeInlineText(input: unknown): string {
  if (input === null || input === undefined) return ''
  return String(input).replace(/(?:image|http|https|javascript|data):\/\/\S+/gi, '')
}

function copyTextSafe(text: string): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => {})
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
  const msg = useRuntimeMessages()
  const { chunk, error: rawLoadError } = useSyncExternalStore(
    subscribeEchartsChunk,
    getEchartsChunkSnapshot,
    getEchartsChunkServerSnapshot,
  )
  const loadError = rawLoadError === CHART_LOAD_ERROR_SENTINEL ? msg.chartLoadFailed : rawLoadError

  const [containerWidth, setContainerWidth] = useState<number | undefined>(undefined)
  const [copiedCsv, setCopiedCsv] = useState(false)
  const [exportedPng, setExportedPng] = useState(false)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const actionRef = useRef(action)
  actionRef.current = action
  const onSelectChangeRef = useRef(onSelectChange)
  onSelectChangeRef.current = onSelectChange
  const activeSelected = sanitizeInlineText(selected).trim()
  const activeSelectedRef = useRef(activeSelected)
  activeSelectedRef.current = activeSelected

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

  // Depend on explicit fields (`rerender-dependencies`) so parent object re-allocations
  // never rebuild the ECharts option or reset canvas animations unnecessarily.
  const option = useMemo(() => {
    if (!chunk) return null
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
        selected: activeSelected || undefined,
      },
      dark,
      containerWidth,
    )
  }, [
    chunk,
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
    activeSelected,
    dark,
    containerWidth,
  ])

  const height = Math.min(640, Math.max(140, rawHeight ?? 260))

  const handleContainerWidth = useCallback((nextW: number) => {
    setContainerWidth((prev) => {
      if (prev === undefined) return nextW
      const crossedBreakpoint =
        prev < 300 !== nextW < 300 || prev < 400 !== nextW < 400 || prev < 460 !== nextW < 460
      if (crossedBreakpoint || Math.abs(nextW - prev) >= 16) return nextW
      return prev
    })
  }, [])

  const handlePointClick = useCallback((params: EChartsClickParams) => {
    const label = sanitizeInlineText(params?.name)
    const series = sanitizeInlineText(params?.seriesName)
    if (onSelectChangeRef.current) {
      const candidate = label || series
      if (candidate) {
        onSelectChangeRef.current(
          computeNextCrossFilterSelection(activeSelectedRef.current, candidate),
        )
      }
    }
    if (!actionRef.current) return
    const idx =
      typeof params?.dataIndex === 'number' && Number.isInteger(params.dataIndex)
        ? params.dataIndex
        : undefined
    const row = idx !== undefined ? rowsRef.current[idx] : undefined
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
    onPointClick: handlePointClick,
    onContainerWidth: handleContainerWidth,
  })

  const handleExportPng = () => {
    const ok = exportPng(title || `chart-${kind}`, dark ? '#16181d' : '#ffffff')
    if (ok) {
      setExportedPng(true)
      setTimeout(() => setExportedPng(false), 1300)
    }
  }

  const handleCopyCsv = () => {
    if (!csvPayload) return
    copyTextSafe(csvPayload)
    setCopiedCsv(true)
    setTimeout(() => setCopiedCsv(false), 1300)
  }

  const weightStyle =
    weight !== undefined ? { flexGrow: weight, flexBasis: 0, minWidth: 220 } : undefined
  const showActions = Boolean(exportable && chunk && !loadError)
  const showHeader = Boolean(title || activeSelected || showActions)
  const isInteractive = Boolean(onSelectChange || action)

  return (
    <div
      className={css.chartCard}
      style={weightStyle}
      data-a2ui-chart={kind}
      data-a2ui-chart-selected={activeSelected || undefined}
      data-crossfilter={onSelectChange ? 'true' : undefined}
    >
      {showHeader ? (
        <div className={css.chartHeader}>
          <div className={css.chartTitleGroup}>
            {title ? <div className={css.chartTitle}>{sanitizeInlineText(title)}</div> : null}
            {activeSelected ? (
              <span className={css.crossFilterChip} data-a2ui-chart-filter="">
                <span>{msg.chartFilterActive(activeSelected)}</span>
                {onSelectChange ? (
                  <button
                    type="button"
                    className={css.crossFilterClear}
                    aria-label={msg.chartClearFilter}
                    onClick={() => onSelectChange('')}
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
                {exportedPng ? msg.copiedCheck : msg.chartExportPng}
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
        <div className={css.emptyCell} role="status">
          {loadError}
        </div>
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
  )
})
