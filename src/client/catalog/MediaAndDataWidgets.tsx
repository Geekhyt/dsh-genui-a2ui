/**
 * Media (`Icon`, `Image`, `Video`, `AudioPlayer`) and DSH data visualization
 * components (`Stat`, `Progress`, `Badge`, `Code`, `Chart`, `Table`).
 */
import { useContext, useId, useMemo } from 'react'
import { ProgressBar as AriaProgressBar } from 'react-aria-components'
import {
  AudioPlayerApi,
  IconApi,
  ImageApi,
  VideoApi,
  type ActionDispatchOptions,
} from '@a2ui/web_core/v1_0'
import {
  BadgeApi,
  ChartApi,
  CodeApi,
  ProgressApi,
  StatApi,
  TableApi,
} from '../../shared/catalog-schema.ts'
import { parseFileTarget } from '../file-opener.tsx'
import { DshCodeBlock, DshTag, type TagTone } from '../ui/primitives.tsx'
import css from './Catalog.module.css'
import { EChartsWidget, type ChartKind } from './EChartsWidget.tsx'
import { FileOpenChip } from './FileOpenChip.tsx'
import { renderCatalogIcon } from './icons.tsx'
import {
  buildSparklineGeometry,
  normalizeSparklinePoints,
  splitStatValueUnit,
} from './stat-file-helpers.ts'
import { TableWidget, type TableColumnInput } from './TableWidget.tsx'
import {
  InsideButtonContext,
  defineComponent,
  isSafeMediaUrl,
  weightStyle,
} from './widget-helpers.tsx'

export const DshIconImpl = defineComponent<{
  name?: unknown
  weight?: number
}>(IconApi, function DshIconComponent({ props }) {
  const insideButton = useContext(InsideButtonContext)
  const style = insideButton
    ? { ...weightStyle(props.weight), color: 'inherit' }
    : weightStyle(props.weight)
  return renderCatalogIcon(props.name, insideButton ? 15 : 18, style)
})

const IMAGE_HEIGHTS: Record<string, number> = {
  icon: 24,
  avatar: 44,
  smallFeature: 96,
  mediumFeature: 168,
  largeFeature: 240,
  header: 180,
}

export const DshImageImpl = defineComponent<{
  url?: unknown
  description?: unknown
  fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scaleDown'
  variant?: 'icon' | 'avatar' | 'smallFeature' | 'mediumFeature' | 'largeFeature' | 'header'
  weight?: number
}>(ImageApi, function DshImage({ props }) {
  if (!isSafeMediaUrl(props.url)) return null
  const fit = props.fit === 'scaleDown' ? 'scale-down' : (props.fit ?? 'cover')
  const height = IMAGE_HEIGHTS[props.variant ?? 'mediumFeature'] ?? 168
  const isAvatar = props.variant === 'avatar' || props.variant === 'icon'
  return (
    <div
      className={css.imageWrap}
      style={{
        ...weightStyle(props.weight),
        width: isAvatar ? height : '100%',
        height,
        borderRadius: props.variant === 'avatar' ? '999px' : undefined,
      }}
    >
      <img
        src={props.url}
        alt={props.description ? String(props.description) : ''}
        className={css.image}
        style={{ objectFit: fit }}
        loading="lazy"
      />
    </div>
  )
})

export const DshVideoImpl = defineComponent<{
  url?: unknown
  weight?: number
}>(VideoApi, function DshVideo({ props }) {
  if (!isSafeMediaUrl(props.url)) return null
  return (
    <div className={css.imageWrap} style={weightStyle(props.weight)}>
      <video src={props.url} controls style={{ display: 'block', width: '100%', maxHeight: 320 }} />
    </div>
  )
})

export const DshAudioPlayerImpl = defineComponent<{
  url?: unknown
  description?: unknown
  weight?: number
}>(AudioPlayerApi, function DshAudioPlayer({ props }) {
  if (!isSafeMediaUrl(props.url)) return null
  return (
    <div className={css.field} style={weightStyle(props.weight)}>
      {props.description ? <span className={css.label}>{String(props.description)}</span> : null}
      <audio src={props.url} controls style={{ width: '100%' }} />
    </div>
  )
})

export const DshStatImpl = defineComponent<{
  label?: unknown
  value?: unknown
  delta?: unknown
  trend?: 'up' | 'down' | 'neutral'
  caption?: unknown
  spark?: unknown
  weight?: number
}>(StatApi, function DshStat({ props }) {
  const gradId = useId().replace(/:/g, '')
  const tone: TagTone =
    props.trend === 'up' ? 'success' : props.trend === 'down' ? 'danger' : 'neutral'
  const deltaText =
    props.delta !== undefined && props.delta !== null && String(props.delta) !== ''
      ? String(props.delta)
      : ''
  const { main, unit } = useMemo(() => splitStatValueUnit(props.value), [props.value])
  const sparkGeom = useMemo(
    () => buildSparklineGeometry(normalizeSparklinePoints(props.spark), 88, 26, 3),
    [props.spark],
  )
  const sparkColor =
    props.trend === 'up'
      ? 'var(--dsw-alias-status-success, #10b981)'
      : props.trend === 'down'
        ? 'var(--dsw-alias-status-danger, #ef4444)'
        : 'var(--dsw-alias-brand-primary, #4d6bfe)'

  return (
    <div className={css.statCard} style={weightStyle(props.weight, 130)} data-a2ui-stat="">
      <span className={css.statLabel}>{String(props.label ?? '')}</span>
      <div className={css.statValueRow}>
        <span className={css.statValue}>
          {main}
          {unit ? <span className={css.statUnit}>{unit}</span> : null}
        </span>
        {deltaText ? <DshTag tone={tone}>{deltaText}</DshTag> : null}
      </div>
      {sparkGeom ? (
        <div className={css.statSparkWrap} data-a2ui-stat-spark="" aria-hidden="true">
          <svg
            viewBox="0 0 88 26"
            width="100%"
            height="26"
            preserveAspectRatio="none"
            className={css.statSparkSvg}
          >
            <defs>
              <linearGradient id={`a2ui-spk-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={sparkColor} stopOpacity="0.24" />
                <stop offset="100%" stopColor={sparkColor} stopOpacity="0.01" />
              </linearGradient>
            </defs>
            <path d={sparkGeom.areaPath} fill={`url(#a2ui-spk-${gradId})`} />
            <path
              d={sparkGeom.linePath}
              fill="none"
              stroke={sparkColor}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      ) : null}
      {props.caption ? <span className={css.statCaption}>{String(props.caption)}</span> : null}
    </div>
  )
})

export const DshProgressImpl = defineComponent<{
  value?: unknown
  max?: number
  label?: unknown
  tone?: 'brand' | 'success' | 'warning' | 'danger'
  weight?: number
}>(ProgressApi, function DshProgress({ props }) {
  const max = typeof props.max === 'number' && props.max > 0 ? props.max : 100
  const raw = Number(props.value ?? 0)
  const val = Number.isFinite(raw) ? Math.min(max, Math.max(0, raw)) : 0
  const pct = Math.round((val / max) * 100)
  const label = props.label ? String(props.label) : ''

  return (
    <div style={weightStyle(props.weight, 140)} data-a2ui-progress="">
      <AriaProgressBar
        className={css.progress}
        minValue={0}
        maxValue={max}
        value={val}
        aria-label={label || '进度'}
      >
        <div className={css.progressHeader}>
          <span>{label}</span>
          <span className={css.progressValue}>{pct}%</span>
        </div>
        <div className={css.progressTrack}>
          <div
            className={css.progressFill}
            data-tone={props.tone ?? 'brand'}
            style={{ width: `${pct}%` }}
          />
        </div>
      </AriaProgressBar>
    </div>
  )
})

export const DshBadgeImpl = defineComponent<{
  label?: unknown
  tone?: TagTone
  weight?: number
}>(BadgeApi, function DshBadge({ props }) {
  return (
    <span style={weightStyle(props.weight)} data-a2ui-badge="">
      <DshTag tone={props.tone ?? 'neutral'}>{String(props.label ?? '')}</DshTag>
    </span>
  )
})

export const DshCodeImpl = defineComponent<{
  code?: unknown
  language?: string
  lineNumbers?: boolean
  title?: unknown
  filePath?: unknown
  line?: unknown
  weight?: number
}>(CodeApi, function DshCode({ props }) {
  const titleText =
    props.title !== undefined && props.title !== null && String(props.title).trim() !== ''
      ? String(props.title).trim()
      : ''
  const hasFileLink = parseFileTarget(props.filePath, props.line) !== null

  if (titleText || hasFileLink) {
    return (
      <div className={css.codeWrap} style={weightStyle(props.weight)} data-a2ui-code="">
        <div className={css.codeHeader}>
          {titleText ? <span className={css.codeHeaderTitle}>{titleText}</span> : null}
          <FileOpenChip filePath={props.filePath} line={props.line} />
        </div>
        <DshCodeBlock
          code={String(props.code ?? '')}
          lang={props.language}
          lineNumbers={props.lineNumbers}
        />
      </div>
    )
  }

  return (
    <div style={weightStyle(props.weight)} data-a2ui-code="">
      <DshCodeBlock
        code={String(props.code ?? '')}
        lang={props.language}
        lineNumbers={props.lineNumbers}
      />
    </div>
  )
})

export const DshChartImpl = defineComponent<{
  kind: ChartKind
  data: unknown
  title?: unknown
  xField?: string
  yField?: string | string[]
  seriesField?: string
  sizeField?: string
  stacked?: boolean
  horizontal?: boolean
  zoom?: boolean
  height?: number
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(ChartApi, function DshChart({ props }) {
  return (
    <EChartsWidget
      kind={props.kind}
      data={props.data}
      title={props.title ? String(props.title) : undefined}
      xField={props.xField}
      yField={props.yField}
      seriesField={props.seriesField}
      sizeField={props.sizeField}
      stacked={props.stacked}
      horizontal={props.horizontal}
      zoom={props.zoom}
      height={props.height}
      action={props.action}
      weight={props.weight}
    />
  )
})

export const DshTableImpl = defineComponent<{
  rows: unknown
  columns?: readonly TableColumnInput[]
  title?: unknown
  searchable?: boolean
  pageSize?: number
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(TableApi, function DshTable({ props }) {
  return (
    <TableWidget
      rows={props.rows}
      columns={props.columns}
      title={props.title ? String(props.title) : undefined}
      searchable={props.searchable}
      pageSize={props.pageSize}
      action={props.action}
      weight={props.weight}
    />
  )
})
