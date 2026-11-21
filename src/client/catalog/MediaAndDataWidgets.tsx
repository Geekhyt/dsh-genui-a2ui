import {
  type ActionDispatchOptions,
  AudioPlayerApi,
  IconApi,
  ImageApi,
  VideoApi,
} from '@a2ui/web_core/v1_0'
import { useContext, useId, useMemo, useState } from 'react'
import { ProgressBar as AriaProgressBar } from 'react-aria-components'
import {
  BadgeApi,
  ChartApi,
  CodeApi,
  ProgressApi,
  StatApi,
  TableApi,
} from '../../shared/catalog-schema.ts'
import { parseFileTarget } from '../file-opener.tsx'
import { useRuntimeMessages } from '../i18n.ts'
import { DshCodeBlock, DshImageLightbox, DshTag, type TagTone } from '../ui/primitives.tsx'
import css from './Catalog.module.css'
import { type ChartKind, EChartsWidget } from './EChartsWidget.tsx'
import { FileOpenChip } from './FileOpenChip.tsx'
import { renderCatalogIcon } from './icons.tsx'
import {
  buildSparklineGeometry,
  normalizeSparklinePoints,
  splitStatValueUnit,
} from './stat-file-helpers.ts'
import { type TableColumnInput, TableWidget } from './TableWidget.tsx'
import {
  defineComponent,
  InsideButtonContext,
  isSafeMediaUrl,
  SurfaceReadOnlyContext,
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
  const msg = useRuntimeMessages()
  const [lightboxOpen, setLightboxOpen] = useState(false)
  if (!isSafeMediaUrl(props.url)) return null
  const src = String(props.url)
  const alt = props.description ? String(props.description) : ''
  const fit = props.fit === 'scaleDown' ? 'scale-down' : (props.fit ?? 'cover')
  const height = IMAGE_HEIGHTS[props.variant ?? 'mediumFeature'] ?? 168
  const isAvatar = props.variant === 'avatar' || props.variant === 'icon'
  const canZoom = props.variant !== 'icon'

  return (
    <>
      <div
        className={css.imageWrap}
        style={{
          ...weightStyle(props.weight, isAvatar ? height : 140),
          width: isAvatar ? height : props.weight !== undefined ? undefined : '100%',
          height,
          borderRadius: props.variant === 'avatar' ? '999px' : undefined,
          cursor: canZoom ? 'zoom-in' : undefined,
        }}
        title={canZoom ? msg.imageZoomHint : undefined}
        onClick={canZoom ? () => setLightboxOpen(true) : undefined}
      >
        <img src={src} alt={alt} className={css.image} style={{ objectFit: fit }} loading="lazy" />
      </div>
      {canZoom ? (
        <DshImageLightbox
          open={lightboxOpen}
          src={src}
          alt={alt || msg.imageLightboxDialog}
          dialogLabel={msg.imageLightboxDialog}
          closeLabel={msg.imageLightboxClose}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </>
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

export function DshStatView({
  props,
}: {
  props: {
    label?: unknown
    value?: unknown
    delta?: unknown
    trend?: 'up' | 'down' | 'neutral'
    caption?: unknown
    spark?: unknown
    weight?: number
  }
}) {
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
      ? 'var(--dsw-alias-state-success-primary, #10b981)'
      : props.trend === 'down'
        ? 'var(--dsw-alias-state-error-primary, #ef4444)'
        : 'var(--dsw-alias-brand-primary, #4d6bfe)'

  return (
    <div
      className={css.statCard}
      style={weightStyle(props.weight)}
      data-a2ui-stat=""
      data-a2ui-weight={props.weight !== undefined ? String(props.weight) : undefined}
    >
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
}

export const DshStatImpl = defineComponent<{
  label?: unknown
  value?: unknown
  delta?: unknown
  trend?: 'up' | 'down' | 'neutral'
  caption?: unknown
  spark?: unknown
  weight?: number
}>(StatApi, DshStatView)

export const DshProgressImpl = defineComponent<{
  value?: unknown
  max?: number
  label?: unknown
  tone?: 'brand' | 'success' | 'warning' | 'danger'
  weight?: number
}>(ProgressApi, function DshProgress({ props }) {
  const msg = useRuntimeMessages()
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
        aria-label={label || msg.progressAria}
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
    <span className={css.badgeWrap} style={weightStyle(props.weight)} data-a2ui-badge="">
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
  y2Field?: string | string[]
  seriesField?: string
  sizeField?: string
  referenceLine?: unknown
  referenceLabel?: unknown
  stacked?: boolean
  horizontal?: boolean
  zoom?: boolean
  height?: number
  selected?: unknown
  setSelected?: (next: string) => void
  exportable?: boolean
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(ChartApi, function DshChart({ props }) {
  const readOnly = useContext(SurfaceReadOnlyContext)
  const parsedRefLine =
    typeof props.referenceLine === 'number' && Number.isFinite(props.referenceLine)
      ? props.referenceLine
      : typeof props.referenceLine === 'string' &&
          props.referenceLine.trim() !== '' &&
          Number.isFinite(Number(props.referenceLine))
        ? Number(props.referenceLine)
        : undefined
  return (
    <EChartsWidget
      kind={props.kind}
      data={props.data}
      title={props.title ? String(props.title) : undefined}
      xField={props.xField}
      yField={props.yField}
      y2Field={props.y2Field}
      seriesField={props.seriesField}
      sizeField={props.sizeField}
      referenceLine={parsedRefLine}
      referenceLabel={
        props.referenceLabel !== undefined && props.referenceLabel !== null
          ? String(props.referenceLabel)
          : undefined
      }
      stacked={props.stacked}
      horizontal={props.horizontal}
      zoom={props.zoom}
      height={props.height}
      selected={
        props.selected !== undefined && props.selected !== null ? String(props.selected) : undefined
      }
      onSelectChange={readOnly ? undefined : props.setSelected}
      exportable={props.exportable}
      action={readOnly ? undefined : props.action}
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
  exportable?: boolean
  selectable?: boolean
  batchLabel?: unknown
  showSummary?: boolean
  expandKey?: string
  filterField?: string
  filterValue?: unknown
  setFilterValue?: (next: string) => void
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(TableApi, function DshTable({ props }) {
  const readOnly = useContext(SurfaceReadOnlyContext)
  return (
    <TableWidget
      rows={props.rows}
      columns={props.columns}
      title={props.title ? String(props.title) : undefined}
      searchable={props.searchable}
      pageSize={props.pageSize}
      exportable={props.exportable}
      selectable={readOnly ? false : props.selectable}
      batchLabel={props.batchLabel ? String(props.batchLabel) : undefined}
      showSummary={props.showSummary}
      expandKey={props.expandKey}
      filterField={props.filterField}
      filterValue={
        props.filterValue !== undefined && props.filterValue !== null
          ? String(props.filterValue)
          : undefined
      }
      onFilterValueChange={readOnly ? undefined : props.setFilterValue}
      action={readOnly ? undefined : props.action}
      weight={props.weight}
    />
  )
})
