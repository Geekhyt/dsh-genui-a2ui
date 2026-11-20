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
  readonly action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  readonly weight?: number | undefined
}

function sanitizeInlineText(input: unknown): string {
  if (input === null || input === undefined) return ''
  return String(input).replace(/(?:image|http|https|javascript|data):\/\/\S+/gi, '')
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
  const hostRef = useRef<HTMLDivElement | null>(null)
  const actionRef = useRef(action)
  actionRef.current = action

  const rows = useMemo(() => {
    if (!Array.isArray(data)) return []
    return data.filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item),
    )
  }, [data])
  const rowsRef = useRef(rows)
  rowsRef.current = rows

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
    if (!actionRef.current) return
    const label = sanitizeInlineText(params?.name)
    const series = sanitizeInlineText(params?.seriesName)
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

  useEChartsMount({
    hostRef,
    chunk,
    option,
    onPointClick: handlePointClick,
    onContainerWidth: handleContainerWidth,
  })

  const weightStyle =
    weight !== undefined ? { flexGrow: weight, flexBasis: 0, minWidth: 220 } : undefined

  return (
    <div className={css.chartCard} style={weightStyle} data-a2ui-chart={kind}>
      {title ? <div className={css.chartTitle}>{sanitizeInlineText(title)}</div> : null}
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
            style={{ height, visibility: chunk ? 'visible' : 'hidden' }}
          />
        </div>
      )}
    </div>
  )
})
