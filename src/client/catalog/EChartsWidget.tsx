/**
 * Lazy-loaded ECharts `Chart` component for `dsh-genui-a2ui`.
 *
 * Keeps `echarts` completely out of `lib/client.js`: on first mount, fetches
 * `lib/client.echarts.js` via DSH's `require.async("./client.echarts.js")`,
 * displays a token-themed shimmer skeleton while loading, and binds click
 * drill-down events (`dshSelection`) + `ResizeObserver`.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import type { ChartKind } from '../../shared/catalog-schema.ts'
import { loadEchartsChunk, type EchartsChunkModule } from '../chunk-loader.ts'
import { useDarkTheme } from '../theme.ts'
import css from './Catalog.module.css'

export type { ChartKind }

export interface ChartWidgetProps {
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
  readonly action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  readonly weight?: number | undefined
}

function sanitizeInlineText(input: unknown): string {
  if (input === null || input === undefined) return ''
  return String(input).replace(/(?:image|http|https|javascript|data):\/\/\S+/gi, '')
}

export const EChartsWidget = memo(function EChartsWidget(props: ChartWidgetProps) {
  const dark = useDarkTheme()
  const [chunk, setChunk] = useState<EchartsChunkModule | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<ReturnType<EchartsChunkModule['initChartInstance']> | null>(null)
  const actionRef = useRef(props.action)
  actionRef.current = props.action

  const rows = useMemo(() => {
    if (!Array.isArray(props.data)) return []
    return props.data.filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item),
    )
  }, [props.data])
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  useEffect(() => {
    let cancelled = false
    loadEchartsChunk().then(
      (mod) => {
        if (!cancelled) {
          setChunk(mod)
          setLoadError(null)
        }
      },
      (err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : '图表引擎加载失败')
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const option = useMemo(() => {
    if (!chunk) return null
    return chunk.buildChartOption(props, dark)
  }, [chunk, props, dark])

  const height = Math.min(640, Math.max(140, props.height ?? 260))

  useEffect(() => {
    if (!chunk) return
    const el = hostRef.current
    if (!el) return
    const instance = chunk.initChartInstance(el)
    chartRef.current = instance

    instance.on(
      'click',
      (params: {
        readonly name?: unknown
        readonly seriesName?: unknown
        readonly value?: unknown
        readonly dataIndex?: unknown
      }) => {
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
      },
    )

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            instance.resize()
          })
        : null
    ro?.observe(el)

    return () => {
      ro?.disconnect()
      instance.dispose()
      chartRef.current = null
    }
  }, [chunk])

  useEffect(() => {
    if (option && chartRef.current) {
      chartRef.current.setOption(option, { notMerge: true })
    }
  }, [option])

  const weightStyle =
    props.weight !== undefined ? { flexGrow: props.weight, flexBasis: 0, minWidth: 220 } : undefined

  return (
    <div className={css.chartCard} style={weightStyle} data-a2ui-chart={props.kind}>
      {props.title ? <div className={css.chartTitle}>{sanitizeInlineText(props.title)}</div> : null}
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
              aria-busy="true"
              aria-label="正在加载图表引擎…"
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
