import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import { useContext, useId, useMemo, useRef, useState } from 'react'
import { MetricRingApi, ServiceGraphApi, SourceListApi } from '../../../shared/catalog-schema.ts'
import { useElementWidth, useHorizontalScrollEdges } from '../../dom-hooks.ts'
import { useRuntimeMessages } from '../../i18n.ts'
import { DshButton, DshLinkIcon, DshTag, type TagTone } from '../../ui/primitives.tsx'
import css from '../Catalog.module.css'
import { FileOpenChip } from '../FileOpenChip.tsx'
import {
  buildServiceGraphLayout,
  computeMetricRingGeometry,
  computeServiceGraphFitScale,
  normalizeSourceItems,
  type ServiceHealthStatus,
} from '../v3-helpers.ts'
import {
  defineComponent,
  SurfaceReadOnlyContext,
  useSurfaceActionRunner,
  weightStyle,
} from '../widget-helpers.tsx'

const EXTERNAL_ARROW_GLYPH = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M5.5 3.5H12.5V10.5M12.2 3.8L4.2 11.8"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export const DshSourceListImpl = defineComponent<{
  items?: unknown
  title?: unknown
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(SourceListApi, function DshSourceList({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const runAction = useSurfaceActionRunner(context, props.action)
  const items = useMemo(() => normalizeSourceItems(props.items), [props.items])
  const canAct = !readOnly && Boolean(runAction)
  const title =
    props.title !== undefined && props.title !== null && String(props.title) !== ''
      ? String(props.title)
      : msg.sourceListDefaultTitle

  if (items.length === 0) return null

  return (
    <div
      className={css.sourceListCard}
      style={weightStyle(props.weight, 220)}
      data-a2ui-sourcelist=""
    >
      <div className={css.sourceListHeader}>
        <span className={css.sourceListTitle}>{title}</span>
        <DshTag tone="neutral">{items.length}</DshTag>
      </div>
      <ol className={css.sourceItems}>
        {items.map((item) => (
          <li key={item.id} className={css.sourceRow}>
            <span className={css.sourceIndexBadge}>{item.index}</span>
            <div className={css.sourceContent}>
              <div className={css.sourceHeadlineRow}>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={css.sourceTitleLink}
                  >
                    <DshLinkIcon href={item.url} size={14} />
                    <span>{item.title}</span>
                    <span className={css.sourceExternalIcon}>{EXTERNAL_ARROW_GLYPH}</span>
                  </a>
                ) : canAct ? (
                  <button
                    type="button"
                    className={css.sourceTitleBtn}
                    onClick={() => {
                      void runAction?.({
                        metadata: {
                          extensions: {
                            dshSelection: {
                              source: 'sourceList',
                              label: item.title,
                              series: item.domain,
                              item: item.raw,
                            },
                          },
                        },
                      })
                    }}
                  >
                    {item.title}
                  </button>
                ) : (
                  <span className={css.sourceTitleStatic}>{item.title}</span>
                )}
                {item.url && canAct ? (
                  <button
                    type="button"
                    className={css.diffCopyBtn}
                    onClick={() => {
                      void runAction?.({
                        metadata: {
                          extensions: {
                            dshSelection: {
                              source: 'sourceList',
                              label: item.title,
                              series: item.domain,
                              url: item.url,
                              item: item.raw,
                            },
                          },
                        },
                      })
                    }}
                  >
                    {msg.defaultActionCta}
                  </button>
                ) : null}
                {item.badge ? <DshTag tone="info">{item.badge}</DshTag> : null}
                {item.scorePercent !== undefined ? (
                  <span
                    className={css.sourceScorePill}
                    title={`${msg.sourceRelevanceLabel} ${item.scorePercent}%`}
                  >
                    {item.scorePercent}%
                  </span>
                ) : null}
              </div>

              <div className={css.sourceMetaRow}>
                {item.domain ? <span className={css.sourceDomain}>{item.domain}</span> : null}
                {item.publishedAt ? (
                  <span className={css.sourcePublished}>{item.publishedAt}</span>
                ) : null}
                {item.filePath ? <FileOpenChip filePath={item.filePath} line={item.line} /> : null}
              </div>

              {item.snippet ? <p className={css.sourceSnippet}>{item.snippet}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
})

export const DshMetricRingImpl = defineComponent<{
  label?: unknown
  value?: unknown
  max?: number
  unit?: unknown
  sublabel?: unknown
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'auto'
  higherIsBetter?: boolean
  size?: number
  weight?: number
}>(MetricRingApi, function DshMetricRing({ props }) {
  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const sublabel =
    props.sublabel !== undefined && props.sublabel !== null ? String(props.sublabel) : ''
  const maxVal =
    typeof props.max === 'number' && Number.isFinite(props.max) && props.max > 0 ? props.max : 100
  const unit =
    props.unit !== undefined && props.unit !== null ? String(props.unit) : maxVal === 100 ? '%' : ''
  const geom = useMemo(
    () =>
      computeMetricRingGeometry({
        value: props.value,
        max: props.max,
        size: props.size,
        tone: props.tone,
        higherIsBetter: props.higherIsBetter,
        unit,
      }),
    [props.value, props.max, props.size, props.tone, props.higherIsBetter, unit],
  )
  const safeAriaNow = Math.max(0, Math.min(maxVal, geom.numericValue))
  const center = geom.size / 2

  return (
    <div
      className={css.metricRingCard}
      style={weightStyle(props.weight, 140)}
      data-a2ui-metricring=""
      data-tone={geom.resolvedTone}
    >
      <div className={css.metricRingInner}>
        <div
          className={css.metricRingFigure}
          style={{ width: geom.size, height: geom.size }}
          role="meter"
          aria-label={label}
          aria-valuenow={safeAriaNow}
          aria-valuetext={`${geom.displayNumber}${unit}`}
          aria-valuemin={0}
          aria-valuemax={maxVal}
        >
          <svg
            width={geom.size}
            height={geom.size}
            viewBox={`0 0 ${geom.size} ${geom.size}`}
            aria-hidden="true"
          >
            <circle
              cx={center}
              cy={center}
              r={geom.radius}
              fill="none"
              className={css.metricRingTrack}
              strokeWidth={geom.strokeWidth}
            />
            {geom.clampedRatio > 0 ? (
              <circle
                cx={center}
                cy={center}
                r={geom.radius}
                fill="none"
                className={css.metricRingArc}
                data-tone={geom.resolvedTone}
                strokeWidth={geom.strokeWidth}
                strokeLinecap="round"
                strokeDasharray={geom.circumference}
                strokeDashoffset={geom.dashOffset}
                transform={`rotate(-90 ${center} ${center})`}
              />
            ) : null}
          </svg>
          <div className={css.metricRingCenterText}>
            <span
              className={css.metricRingValueGroup}
              style={
                geom.stackUnit
                  ? { flexDirection: 'column', alignItems: 'center', gap: 1 }
                  : undefined
              }
            >
              <span className={css.metricRingNumber} style={{ fontSize: geom.numberFontSize }}>
                {geom.displayNumber}
              </span>
              {unit ? (
                <span className={css.metricRingUnit} style={{ fontSize: geom.unitFontSize }}>
                  {unit}
                </span>
              ) : null}
            </span>
          </div>
        </div>
        <div className={css.metricRingMeta}>
          <span className={css.metricRingLabel}>{label}</span>
          {sublabel ? <span className={css.metricRingSublabel}>{sublabel}</span> : null}
        </div>
      </div>
    </div>
  )
})

export const DshServiceGraphImpl = defineComponent<{
  nodes?: unknown
  edges?: unknown
  title?: unknown
  direction?: 'LR' | 'TB'
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(ServiceGraphApi, function DshServiceGraph({ props, context }) {
  const markerPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const runAction = useSurfaceActionRunner(context, props.action)
  const direction = props.direction === 'TB' ? 'TB' : 'LR'
  const layout = useMemo(
    () => buildServiceGraphLayout(props.nodes, props.edges, direction),
    [props.nodes, props.edges, direction],
  )
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const viewportW = useElementWidth(viewportRef, layout.nodes.length > 0)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [zoomMode, setZoomMode] = useState<'auto' | 'actual'>('auto')
  const canAct = !readOnly && Boolean(runAction)
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''

  const activeNode = useMemo(() => {
    if (!selectedNodeId) {
      const degraded = layout.nodes.find((n) => n.status === 'error' || n.status === 'warning')
      return degraded ?? layout.nodes[0] ?? null
    }
    return layout.nodes.find((n) => n.id === selectedNodeId) ?? layout.nodes[0] ?? null
  }, [layout.nodes, selectedNodeId])

  const nodeLabelMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of layout.nodes) m.set(n.id, n.label)
    return m
  }, [layout.nodes])

  const availW = viewportW > 8 ? viewportW - 4 : 0
  const fitScale = computeServiceGraphFitScale(layout.width, availW, zoomMode)
  const scaledW = Math.ceil(layout.width * fitScale)
  const scaledH = Math.ceil(layout.height * fitScale)
  const canToggleZoom = availW > 0 && layout.width > availW
  const scrollEdges = useHorizontalScrollEdges(
    viewportRef,
    `${scaledW}:${viewportW}:${zoomMode}:${layout.nodes.length}`,
  )

  if (layout.nodes.length === 0) return null

  const statusText = (s: ServiceHealthStatus) =>
    s === 'error'
      ? msg.serviceGraphError
      : s === 'warning'
        ? msg.serviceGraphWarning
        : s === 'unknown'
          ? msg.serviceGraphUnknown
          : msg.serviceGraphHealthy

  const statusTone = (s: ServiceHealthStatus): TagTone =>
    s === 'error' ? 'danger' : s === 'warning' ? 'warning' : s === 'unknown' ? 'neutral' : 'success'

  const upstreamIds = activeNode ? (layout.upstreamByNode.get(activeNode.id) ?? []) : []
  const downstreamIds = activeNode ? (layout.downstreamByNode.get(activeNode.id) ?? []) : []

  return (
    <div
      className={css.serviceGraphCard}
      style={weightStyle(props.weight, 260)}
      data-a2ui-servicegraph=""
    >
      <div className={css.serviceGraphHeader}>
        <span className={css.serviceGraphTitle}>{title || msg.serviceGraphDefaultTitle}</span>
        <div className={css.serviceGraphLegend}>
          <span className={css.serviceLegendItem} data-status="healthy">
            <i /> {msg.serviceGraphHealthy}
          </span>
          <span className={css.serviceLegendItem} data-status="warning">
            <i /> {msg.serviceGraphWarning}
          </span>
          <span className={css.serviceLegendItem} data-status="error">
            <i /> {msg.serviceGraphError}
          </span>
          {canToggleZoom ? (
            <button
              type="button"
              className={css.serviceGraphScaleBtn}
              aria-pressed={zoomMode === 'actual'}
              onClick={() => setZoomMode((m) => (m === 'auto' ? 'actual' : 'auto'))}
            >
              {zoomMode === 'auto' ? msg.serviceGraphZoomActual : msg.serviceGraphZoomFit}
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={viewportRef}
        className={css.serviceGraphViewport}
        data-scroll-left={scrollEdges.canScrollLeft ? 'true' : undefined}
        data-scroll-right={scrollEdges.canScrollRight ? 'true' : undefined}
      >
        <div
          style={{
            width: scaledW,
            height: scaledH,
            margin: '0 auto',
            overflow: 'hidden',
          }}
        >
          <div
            className={css.serviceGraphCanvas}
            style={{
              width: layout.width,
              height: layout.height,
              margin: 0,
              ...(fitScale < 1
                ? { transform: `scale(${fitScale})`, transformOrigin: 'top left' }
                : {}),
            }}
          >
            <svg
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              className={css.serviceGraphSvg}
              aria-hidden="true"
            >
              <defs>
                {(['healthy', 'warning', 'error'] as const).map((st) => (
                  <marker
                    key={st}
                    id={`${markerPrefix}-arrow-${st}`}
                    viewBox="0 0 10 10"
                    refX="8.5"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path
                      d="M 0 1.5 L 9 5 L 0 8.5 z"
                      className={css.serviceEdgeArrow}
                      data-status={st}
                    />
                  </marker>
                ))}
              </defs>
              {layout.edges.map((edge) => {
                const isHighlighted =
                  activeNode !== null && (edge.from === activeNode.id || edge.to === activeNode.id)
                return (
                  <path
                    key={edge.id}
                    d={edge.pathD}
                    fill="none"
                    className={css.serviceEdgePath}
                    data-status={edge.status}
                    data-highlight={isHighlighted ? 'true' : 'false'}
                    markerEnd={`url(#${markerPrefix}-arrow-${edge.status})`}
                  />
                )
              })}
            </svg>

            {layout.nodes.map((node) => {
              const isSelected = activeNode?.id === node.id
              return (
                <button
                  key={node.id}
                  type="button"
                  className={css.serviceNodeBox}
                  aria-pressed={isSelected}
                  data-status={node.status}
                  data-selected={isSelected ? 'true' : 'false'}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    height: node.height,
                  }}
                  onClick={() => setSelectedNodeId(node.id)}
                >
                  <span className={css.serviceNodeTop}>
                    <span className={css.serviceNodeDot} data-status={node.status} />
                    <span className={css.serviceNodeName} title={node.label}>
                      {node.label}
                    </span>
                  </span>
                  {node.metric || node.sublabel || node.group ? (
                    <span className={css.serviceNodeBottom}>
                      {node.sublabel || node.group ? (
                        <span className={css.serviceNodeSub} title={node.sublabel || node.group}>
                          {node.sublabel || node.group}
                        </span>
                      ) : null}
                      {node.metric ? (
                        <span className={css.serviceNodeMetric} title={node.metric}>
                          {node.metric}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              )
            })}

            {layout.edges.some((e) => Boolean(e.label)) ? (
              <svg
                width={layout.width}
                height={layout.height}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                className={css.serviceGraphLabelSvg}
                aria-hidden="true"
              >
                {layout.edges.map((edge) =>
                  edge.label ? (
                    <g key={edge.id} transform={`translate(${edge.labelX}, ${edge.labelY})`}>
                      <rect
                        x={-edge.labelWidth / 2}
                        y={-9}
                        width={edge.labelWidth}
                        height={18}
                        rx={5}
                        className={css.serviceEdgeLabelBg}
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        className={css.serviceEdgeLabelText}
                      >
                        {edge.label}
                      </text>
                    </g>
                  ) : null,
                )}
              </svg>
            ) : null}
          </div>
        </div>
      </div>

      {activeNode ? (
        <div className={css.serviceInspectorBar}>
          <div className={css.serviceInspectorInfo}>
            <span className={css.serviceInspectorName}>{activeNode.label}</span>
            <DshTag tone={statusTone(activeNode.status)}>{statusText(activeNode.status)}</DshTag>
            {activeNode.group ? <DshTag tone="neutral">{activeNode.group}</DshTag> : null}
            {activeNode.metric ? (
              <span className={css.serviceInspectorMetric}>{activeNode.metric}</span>
            ) : null}
            <span className={css.serviceInspectorDeps}>
              {msg.serviceGraphUpstream}:{' '}
              {upstreamIds.length > 0
                ? upstreamIds.map((id) => nodeLabelMap.get(id) ?? id).join(', ')
                : msg.serviceGraphNone}
              {' · '}
              {msg.serviceGraphDownstream}:{' '}
              {downstreamIds.length > 0
                ? downstreamIds.map((id) => nodeLabelMap.get(id) ?? id).join(', ')
                : msg.serviceGraphNone}
            </span>
          </div>
          {canAct ? (
            <DshButton
              size="sm"
              variant="outline"
              onClick={() => {
                void runAction?.({
                  metadata: {
                    extensions: {
                      dshSelection: {
                        source: 'serviceGraph',
                        label: activeNode.label,
                        series: statusText(activeNode.status),
                        value: activeNode.metric,
                        nodeId: activeNode.id,
                        status: activeNode.status,
                        node: activeNode.raw,
                      },
                    },
                  },
                })
              }}
            >
              {msg.serviceGraphInspect}
            </DshButton>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})
