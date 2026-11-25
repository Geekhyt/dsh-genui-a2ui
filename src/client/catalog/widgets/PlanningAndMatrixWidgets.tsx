import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import { useContext, useMemo } from 'react'
import {
  EntityHeaderApi,
  MatrixApi,
  ResultApi,
  ScheduleApi,
} from '../../../shared/catalog-schema.ts'
import { useRuntimeMessages } from '../../i18n.ts'
import { DshButton, DshStateDot, DshTag } from '../../ui/primitives.tsx'
import css from '../Catalog.module.css'
import { normalizeKeyValueItems } from '../p0-helpers.ts'
import { normalizeMatrixData, normalizeScheduleItems } from '../v4-helpers.ts'
import {
  type ChildRef,
  defineComponent,
  renderChildRef,
  SurfaceReadOnlyContext,
  useSurfaceActionRunner,
  weightStyle,
} from '../widget-helpers.tsx'

export const DshScheduleImpl = defineComponent<{
  items?: unknown
  title?: unknown
  range?: unknown
  now?: unknown
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(ScheduleApi, function DshSchedule({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const runAction = useSurfaceActionRunner(context, props.action)
  const model = useMemo(
    () => normalizeScheduleItems(props.items, props.range, props.now),
    [props.items, props.range, props.now],
  )
  const canAct = !readOnly && Boolean(runAction)
  const title =
    props.title !== undefined && props.title !== null && String(props.title) !== ''
      ? String(props.title)
      : msg.scheduleDefaultTitle

  if (model.tracks.length === 0) return null

  return (
    <div className={css.scheduleCard} style={weightStyle(props.weight, 240)} data-a2ui-schedule="">
      <div className={css.scheduleHeader}>
        <span className={css.scheduleTitle}>{title}</span>
        {model.nowLabel ? (
          <DshTag tone="info">{`${msg.scheduleNowPrefix} ${model.nowLabel}`}</DshTag>
        ) : null}
      </div>

      <div className={css.scheduleBody}>
        <div className={css.scheduleAxisRow}>
          <span className={css.scheduleLabelCol} />
          <div className={css.scheduleAxisTicks}>
            {model.axisTicks.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
        </div>

        <div className={css.scheduleTrackList}>
          {model.tracks.map((tr) => {
            const barLabel = tr.note
              ? tr.note
              : tr.progress !== undefined
                ? `${tr.progress}%`
                : `${tr.startLabel}–${tr.endLabel}`
            let estLabelPx = 16
            for (const ch of barLabel) {
              estLabelPx += (ch.codePointAt(0) ?? 0) > 0xff ? 11.2 : 6.4
            }
            const minPctForInside = Math.min(82, Math.ceil(estLabelPx / 2.4))
            const spaceRightPct = Math.max(0, 100 - (tr.leftPct + tr.widthPct))
            const maxOutsidePct = Math.max(spaceRightPct, tr.leftPct)
            const placeOutside = tr.widthPct < minPctForInside && maxOutsidePct > tr.widthPct
            const placeOutsideRight = spaceRightPct >= tr.leftPct
            const barTitle = `${tr.title}: ${tr.startLabel} – ${tr.endLabel}${tr.progress !== undefined ? ` (${tr.progress}%)` : ''}${tr.note ? ` · ${tr.note}` : ''}`
            const barContent = (
              <>
                {tr.progress !== undefined && tr.progress > 0 && tr.progress < 100 ? (
                  <span className={css.scheduleBarProgress} style={{ width: `${tr.progress}%` }} />
                ) : null}
                {!placeOutside ? <span className={css.scheduleBarText}>{barLabel}</span> : null}
              </>
            )

            return (
              <div key={tr.id} className={css.scheduleRow}>
                <div className={css.scheduleLabelCol} title={tr.title}>
                  <span className={css.scheduleRowTitle}>{tr.title}</span>
                  {tr.owner ? <span className={css.scheduleOwner}>{tr.owner}</span> : null}
                </div>
                <div className={css.scheduleLane}>
                  {model.nowPct !== undefined ? (
                    <span
                      className={css.scheduleNowLine}
                      style={{ left: `${model.nowPct}%` }}
                      aria-hidden="true"
                    />
                  ) : null}
                  {canAct ? (
                    <button
                      type="button"
                      className={css.scheduleBar}
                      data-status={tr.status}
                      data-clickable="true"
                      data-narrow={placeOutside ? 'true' : 'false'}
                      style={{ left: `${tr.leftPct}%`, width: `${tr.widthPct}%` }}
                      title={barTitle}
                      aria-label={barTitle}
                      onClick={() => {
                        void runAction?.({
                          metadata: {
                            extensions: {
                              dshSelection: {
                                source: 'schedule',
                                label: tr.title,
                                value: `${tr.startLabel} – ${tr.endLabel}`,
                                track: tr.raw,
                              },
                            },
                          },
                        })
                      }}
                    >
                      {barContent}
                    </button>
                  ) : (
                    <div
                      className={css.scheduleBar}
                      data-status={tr.status}
                      data-clickable="false"
                      data-narrow={placeOutside ? 'true' : 'false'}
                      style={{ left: `${tr.leftPct}%`, width: `${tr.widthPct}%` }}
                      title={barTitle}
                    >
                      {barContent}
                    </div>
                  )}
                  {placeOutside ? (
                    <span
                      className={css.scheduleBarOutsideLabel}
                      style={
                        placeOutsideRight
                          ? {
                              left: `calc(${tr.leftPct + tr.widthPct}% + 6px)`,
                              maxWidth: `calc(${spaceRightPct}% - 10px)`,
                            }
                          : {
                              right: `calc(${100 - tr.leftPct}% + 6px)`,
                              maxWidth: `calc(${tr.leftPct}% - 10px)`,
                            }
                      }
                    >
                      {barLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})

export const DshResultImpl = defineComponent<{
  status: 'success' | 'info' | 'warning' | 'error' | 'empty'
  title?: unknown
  subtitle?: unknown
  meta?: unknown
  actionLabel?: unknown
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  child?: ChildRef
  weight?: number
}>(ResultApi, function DshResult({ props, buildChild, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const runAction = useSurfaceActionRunner(context, props.action)
  const status = props.status ?? 'info'
  const title =
    props.title !== undefined && props.title !== null ? String(props.title) : msg.resultEmptyDefault
  const subtitle =
    props.subtitle !== undefined && props.subtitle !== null ? String(props.subtitle) : ''
  const metaItems = useMemo(
    () => (props.meta ? normalizeKeyValueItems(props.meta, false) : []),
    [props.meta],
  )
  const canAct = !readOnly && Boolean(runAction)
  const rawCtaLabel =
    props.actionLabel !== undefined && props.actionLabel !== null
      ? String(props.actionLabel).trim()
      : ''
  const ctaLabel = rawCtaLabel || (canAct ? msg.defaultActionCta : '')

  const symbol =
    status === 'success'
      ? '✓'
      : status === 'error'
        ? '✕'
        : status === 'warning'
          ? '!'
          : status === 'empty'
            ? '∅'
            : 'i'

  return (
    <div
      className={css.resultCard}
      style={weightStyle(props.weight, 220)}
      data-a2ui-result=""
      data-status={status}
    >
      <div className={css.resultEmblem} data-status={status} aria-hidden="true">
        {symbol}
      </div>
      <div className={css.resultTitle}>{title}</div>
      {subtitle ? <div className={css.resultSubtitle}>{subtitle}</div> : null}

      {metaItems.length > 0 ? (
        <div className={css.resultMetaStrip}>
          {metaItems.map((m, idx) => (
            <span key={`${m.label}-${idx}`} className={css.resultMetaChip}>
              <span className={css.resultMetaKey}>{m.label}:</span>
              <span className={css.resultMetaVal}>{m.value}</span>
            </span>
          ))}
        </div>
      ) : null}

      {props.child ? (
        <div className={css.resultChildWrap}>{renderChildRef(buildChild, props.child)}</div>
      ) : null}

      {canAct && ctaLabel ? (
        <div className={css.resultActionWrap}>
          <DshButton
            size="sm"
            variant={status === 'empty' ? 'outline' : 'primary'}
            onClick={() => {
              void runAction?.({
                metadata: {
                  extensions: {
                    dshSelection: {
                      source: 'result',
                      label: ctaLabel,
                      series: title,
                      status,
                    },
                  },
                },
              })
            }}
          >
            {ctaLabel}
          </DshButton>
        </div>
      ) : null}
    </div>
  )
})

export const DshEntityHeaderImpl = defineComponent<{
  title?: unknown
  subtitle?: unknown
  avatarText?: unknown
  status?: 'healthy' | 'ongoing' | 'warning' | 'error' | 'offline'
  statusLabel?: unknown
  badge?: unknown
  tags?: unknown
  metrics?: unknown
  actionLabel?: unknown
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(EntityHeaderApi, function DshEntityHeader({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const runAction = useSurfaceActionRunner(context, props.action)
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const subtitle =
    props.subtitle !== undefined && props.subtitle !== null ? String(props.subtitle) : ''
  const badge = props.badge !== undefined && props.badge !== null ? String(props.badge) : ''
  const statusLabel =
    props.statusLabel !== undefined && props.statusLabel !== null ? String(props.statusLabel) : ''
  const monogram =
    props.avatarText !== undefined && props.avatarText !== null && String(props.avatarText) !== ''
      ? [...String(props.avatarText)].slice(0, 3).join('')
      : [...title.trim()].slice(0, 2).join('').toUpperCase()

  const tags = useMemo(
    () => (Array.isArray(props.tags) ? props.tags.map(String).filter(Boolean) : []),
    [props.tags],
  )
  const metrics = useMemo(
    () => (props.metrics ? normalizeKeyValueItems(props.metrics, false) : []),
    [props.metrics],
  )

  const rawStatus = typeof props.status === 'string' ? props.status.trim().toLowerCase() : ''
  const normalizedStatus: 'healthy' | 'ongoing' | 'warning' | 'error' | 'offline' | undefined =
    rawStatus === 'healthy' ||
    rawStatus === 'ok' ||
    rawStatus === 'active' ||
    rawStatus === 'done' ||
    rawStatus === 'success'
      ? 'healthy'
      : rawStatus === 'warning' || rawStatus === 'warn' || rawStatus === 'degraded'
        ? 'warning'
        : rawStatus === 'ongoing' || rawStatus === 'running' || rawStatus === 'in_progress'
          ? 'ongoing'
          : rawStatus === 'error' ||
              rawStatus === 'err' ||
              rawStatus === 'danger' ||
              rawStatus === 'critical' ||
              rawStatus === 'failed'
            ? 'error'
            : rawStatus === 'offline' ||
                rawStatus === 'pending' ||
                rawStatus === 'inactive' ||
                rawStatus === 'paused'
              ? 'offline'
              : undefined

  const dotState: 'done' | 'ongoing' | 'warning' | 'error' | 'pending' | null =
    normalizedStatus === 'healthy'
      ? 'done'
      : normalizedStatus === 'warning'
        ? 'warning'
        : normalizedStatus === 'ongoing'
          ? 'ongoing'
          : normalizedStatus === 'error'
            ? 'error'
            : normalizedStatus === 'offline'
              ? 'pending'
              : null

  const canAct = !readOnly && Boolean(runAction)
  const rawCtaLabel =
    props.actionLabel !== undefined && props.actionLabel !== null
      ? String(props.actionLabel).trim()
      : ''
  const ctaLabel = rawCtaLabel || (canAct ? msg.defaultActionCta : '')

  return (
    <div
      className={css.entityHeaderCard}
      style={weightStyle(props.weight, 240)}
      data-a2ui-entityheader=""
    >
      <div className={css.entityTopRow}>
        <div className={css.entityIdentity}>
          <div className={css.entityAvatar} aria-hidden="true">
            {monogram}
          </div>
          <div className={css.entityTextCol}>
            <div className={css.entityTitleLine}>
              <span className={css.entityTitle}>{title}</span>
              {dotState || statusLabel ? (
                <span className={css.entityStatusPill} data-status={normalizedStatus}>
                  {dotState ? <DshStateDot state={dotState} size={8} /> : null}
                  {statusLabel ? <span>{statusLabel}</span> : null}
                </span>
              ) : null}
              {badge ? <DshTag tone="info">{badge}</DshTag> : null}
              {tags.map((t, i) => (
                <DshTag key={i} tone="neutral">
                  {t}
                </DshTag>
              ))}
            </div>
            {subtitle ? <div className={css.entitySubtitle}>{subtitle}</div> : null}
          </div>
        </div>

        {canAct && ctaLabel ? (
          <DshButton
            size="sm"
            variant="outline"
            onClick={() => {
              void runAction?.({
                metadata: {
                  extensions: {
                    dshSelection: {
                      source: 'entityHeader',
                      label: title,
                      series: ctaLabel,
                    },
                  },
                },
              })
            }}
          >
            {ctaLabel}
          </DshButton>
        ) : null}
      </div>

      {metrics.length > 0 ? (
        <div className={css.entityMetricsGrid}>
          {metrics.map((m, idx) => (
            <div key={`${m.label}-${idx}`} className={css.entityMetricCell}>
              <span className={css.entityMetricLabel}>{m.label}</span>
              <span className={css.entityMetricValue} data-tone={m.tone}>
                {m.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
})

export const DshMatrixImpl = defineComponent<{
  rows?: unknown
  columns?: unknown
  values?: unknown
  title?: unknown
  cornerLabel?: unknown
  unit?: unknown
  colorScale?: 'brand' | 'success' | 'warning' | 'auto'
  showTotals?: boolean
  weight?: number
}>(MatrixApi, function DshMatrix({ props }) {
  const msg = useRuntimeMessages()
  const unit = props.unit !== undefined && props.unit !== null ? String(props.unit) : ''
  const model = useMemo(
    () =>
      normalizeMatrixData({
        rows: props.rows,
        columns: props.columns,
        values: props.values,
        unit,
        showTotals: props.showTotals,
      }),
    [props.rows, props.columns, props.values, unit, props.showTotals],
  )

  if (model.rowLabels.length === 0 || model.colLabels.length === 0) return null

  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const corner =
    props.cornerLabel !== undefined &&
    props.cornerLabel !== null &&
    String(props.cornerLabel) !== ''
      ? String(props.cornerLabel)
      : msg.matrixDefaultCorner
  const scale = props.colorScale ?? 'brand'
  const resolveCellColorVar = (ratio: number): string => {
    if (scale === 'auto') {
      if (ratio >= 0.67) return 'var(--dsw-alias-state-error-primary, #ef4444)'
      if (ratio >= 0.34) return 'var(--dsw-alias-state-warn-primary, #f59e0b)'
      return 'var(--dsw-alias-state-success-primary, #10b981)'
    }
    if (scale === 'success') return 'var(--dsw-alias-state-success-primary, #10b981)'
    if (scale === 'warning') return 'var(--dsw-alias-state-warn-primary, #f59e0b)'
    return 'var(--dsw-alias-state-business-primary, #3b82f6)'
  }

  return (
    <div className={css.matrixCard} style={weightStyle(props.weight, 240)} data-a2ui-matrix="">
      {title ? (
        <div className={css.comparisonHeader}>
          <span className={css.comparisonTitle}>{title}</span>
        </div>
      ) : null}

      <div className={css.comparisonScroll}>
        <table className={css.matrixTable}>
          <thead>
            <tr>
              <th className={css.matrixCornerTh} title={corner}>
                {corner}
              </th>
              {model.colLabels.map((col, idx) => (
                <th key={`${col}-${idx}`} className={css.matrixColTh}>
                  {col}
                </th>
              ))}
              {model.rowSummaries ? (
                <th className={css.matrixColTh}>{msg.matrixTotalLabel}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {model.rowLabels.map((rowLabel, rIdx) => (
              <tr key={`${rowLabel}-${rIdx}`}>
                <th scope="row" className={css.matrixRowTd} title={rowLabel}>
                  <span className={css.matrixRowText}>{rowLabel}</span>
                </th>
                {(model.cells[rIdx] ?? []).map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className={css.matrixValTd}
                    data-kind={cell.kind}
                    style={
                      cell.kind === 'number' && cell.intensityPct > 0
                        ? {
                            background: `color-mix(in srgb, ${resolveCellColorVar(cell.ratio)} ${cell.intensityPct}%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    {cell.display}
                  </td>
                ))}
                {model.rowSummaries ? (
                  <td className={css.matrixTotalTd}>{model.rowSummaries[rIdx] ?? '—'}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
})
