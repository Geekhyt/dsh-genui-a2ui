/**
 * 8 v4 Vercel / Tremor & Enterprise B2B A2UI 1.0 Components:
 * - `Tracker`: Tremor-style SLA uptime slice strip (`DshHoverCard` + `DshStateDot`) & multi-segment category bar
 * - `Terminal`: Vercel Geist / DSH DevOps command & execution receipt card (pure executable command copy)
 * - `ApprovalCard`: Enterprise high-risk change gate with blast-radius checklist & `DshSwitch` confirmation gate
 * - `ApiEndpoint`: Scalar/Stripe-style HTTP API contract & JSON request/response workbench (`DshJsonTree`)
 * - `Schedule`: Linear-style horizontal Gantt / maintenance-window timeline bar chart
 * - `Result`: AntD/Stripe-style operation receipt & guided empty-state card (with `ChildSchema` slot)
 * - `EntityHeader`: Enterprise object summary header (`DshStateDot` + monogram + tags + KPI strip)
 * - `Matrix`: Conditional-formatting heat cross-tabulation & RBAC permission matrix
 */

import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import { useContext, useMemo, useState } from 'react'
import {
  ApiEndpointApi,
  ApprovalCardApi,
  EntityHeaderApi,
  MatrixApi,
  ResultApi,
  ScheduleApi,
  TerminalApi,
  TrackerApi,
} from '../../shared/catalog-schema.ts'
import { useRuntimeMessages } from '../i18n.ts'
import {
  DshButton,
  DshHoverCard,
  DshHoverCardGroup,
  DshJsonTree,
  DshPill,
  DshStateDot,
  DshSwitch,
  DshTag,
  type TagTone,
} from '../ui/primitives.tsx'
import css from './Catalog.module.css'
import { normalizeKeyValueItems } from './p0-helpers.ts'
import {
  buildEndpointCurl,
  normalizeApiParamsAndHeaders,
  normalizeCategorySegments,
  normalizeMatrixData,
  normalizeScheduleItems,
  normalizeTerminalCommands,
  normalizeTrackerSlices,
  type TrackerSliceStatus,
  tokenizeEndpointPath,
} from './v4-helpers.ts'
import {
  type ChildRef,
  defineComponent,
  renderChildRef,
  SurfaceReadOnlyContext,
  weightStyle,
} from './widget-helpers.tsx'

function copyToClipboardSafe(text: string): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => {})
  }
}

/* ─────────────────────────── 1. Tracker ─────────────────────────── */

export const DshTrackerImpl = defineComponent<{
  data?: unknown
  title?: unknown
  summary?: unknown
  mode?: 'uptime' | 'category'
  weight?: number
}>(TrackerApi, function DshTracker({ props }) {
  const msg = useRuntimeMessages()
  const mode = props.mode === 'category' ? 'category' : 'uptime'
  const slices = useMemo(
    () => (mode === 'uptime' ? normalizeTrackerSlices(props.data) : []),
    [mode, props.data],
  )
  const segments = useMemo(
    () => (mode === 'category' ? normalizeCategorySegments(props.data) : []),
    [mode, props.data],
  )
  const [activeSliceId, setActiveSliceId] = useState<string | null>(null)

  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const summary = props.summary !== undefined && props.summary !== null ? String(props.summary) : ''

  if (mode === 'category') {
    if (segments.length === 0) return null
    return (
      <div
        className={css.trackerCard}
        style={weightStyle(props.weight, 220)}
        data-a2ui-tracker=""
        data-mode="category"
      >
        {title || summary ? (
          <div className={css.trackerHeader}>
            <span className={css.trackerTitle}>{title}</span>
            {summary ? <span className={css.trackerSummary}>{summary}</span> : null}
          </div>
        ) : null}
        <div className={css.categoryTrack}>
          {segments.map((seg) => (
            <div
              key={seg.id}
              className={css.categorySegment}
              data-tone={seg.tone}
              style={{ width: `${Math.max(2, seg.pct)}%` }}
              title={`${seg.label}: ${seg.pct}%`}
            />
          ))}
        </div>
        <div className={css.categoryLegend}>
          {segments.map((seg) => (
            <span key={seg.id} className={css.categoryLegendItem}>
              <i className={css.categoryDot} data-tone={seg.tone} />
              <span>{seg.label}</span>
              <span className={css.categoryPct}>{seg.pct}%</span>
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (slices.length === 0) return null

  const hasError = slices.some((s) => s.status === 'error')
  const hasWarn = !hasError && slices.some((s) => s.status === 'warning')
  const overallState = hasError ? 'error' : hasWarn ? 'ongoing' : 'done'

  const statusText = (s: TrackerSliceStatus) =>
    s === 'error'
      ? msg.trackerDown
      : s === 'warning'
        ? msg.trackerDegraded
        : s === 'unknown'
          ? msg.trackerUnknown
          : msg.trackerHealthy

  const activeSlice = slices.find((s) => s.id === activeSliceId) ?? null

  return (
    <div
      className={css.trackerCard}
      style={weightStyle(props.weight, 220)}
      data-a2ui-tracker=""
      data-mode="uptime"
    >
      {title || summary ? (
        <div className={css.trackerHeader}>
          <span className={css.trackerTitleRow}>
            <DshStateDot state={overallState} size={8} />
            <span className={css.trackerTitle}>{title}</span>
          </span>
          {summary ? (
            <span className={css.trackerSummary} data-status={hasError ? 'error' : 'ok'}>
              {summary}
            </span>
          ) : null}
        </div>
      ) : null}

      <DshHoverCardGroup>
        <div
          className={css.trackerStrip}
          style={{
            gap: slices.length > 60 ? 1 : slices.length > 36 ? 2 : 3,
            gridTemplateColumns: `repeat(${slices.length}, minmax(1.5px, 1fr))`,
          }}
        >
          {slices.map((s) => {
            const detail = s.note || statusText(s.status)
            return (
              <DshHoverCard
                key={s.id}
                grouped={true}
                openDelayMs={40}
                fallbackTitle={`${s.label}: ${detail}`}
                content={
                  <div className={css.trackerTooltipBody}>
                    <strong>{s.label}</strong>
                    <span>{detail}</span>
                  </div>
                }
                anchor={
                  <button
                    type="button"
                    className={css.trackerSliceBtn}
                    data-status={s.status}
                    aria-label={`${s.label}: ${detail}`}
                    onMouseEnter={() => setActiveSliceId(s.id)}
                    onClick={() => setActiveSliceId(s.id)}
                  />
                }
              />
            )
          })}
        </div>
      </DshHoverCardGroup>

      <div className={css.trackerFooter}>
        {activeSlice ? (
          <>
            <span className={css.trackerFooterStrong}>{activeSlice.label}</span>
            <span className={css.trackerFooterNote}>
              {activeSlice.note || statusText(activeSlice.status)}
            </span>
          </>
        ) : (
          <>
            <span className={css.trackerFooterEdge}>{slices[0]?.label}</span>
            <span className={css.trackerFooterHint}>{msg.trackerHoverHint}</span>
            <span className={css.trackerFooterEdge}>{slices[slices.length - 1]?.label}</span>
          </>
        )}
      </div>
    </div>
  )
})

/* ─────────────────────────── 2. Terminal ─────────────────────────── */

export const DshTerminalImpl = defineComponent<{
  commands?: unknown
  title?: unknown
  cwd?: unknown
  shell?: string
  maxHeight?: number
  weight?: number
}>(TerminalApi, function DshTerminal({ props }) {
  const msg = useRuntimeMessages()
  const steps = useMemo(() => normalizeTerminalCommands(props.commands), [props.commands])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  if (steps.length === 0) return null

  const title =
    props.title !== undefined && props.title !== null && String(props.title) !== ''
      ? String(props.title)
      : msg.terminalDefaultTitle
  const cwd = props.cwd !== undefined && props.cwd !== null ? String(props.cwd) : ''
  const shell = props.shell || 'zsh'
  const maxHeight =
    typeof props.maxHeight === 'number' && props.maxHeight >= 120 && props.maxHeight <= 680
      ? Math.round(props.maxHeight)
      : 340

  const handleCopyCmd = (id: string, cmd: string) => {
    copyToClipboardSafe(cmd)
    setCopiedId(id)
    setTimeout(() => {
      setCopiedId((cur) => (cur === id ? null : cur))
    }, 1300)
  }

  return (
    <div className={css.terminalCard} style={weightStyle(props.weight, 240)} data-a2ui-terminal="">
      <div className={css.terminalHeader}>
        <div className={css.terminalTitleGroup}>
          <span className={css.terminalPromptGlyph} aria-hidden="true">
            $_
          </span>
          <span className={css.terminalTitle}>{title}</span>
          {cwd || shell ? (
            <span className={css.terminalMetaChip}>{cwd ? `${cwd} · ${shell}` : shell}</span>
          ) : null}
        </div>
        <span className={css.logCountMeta}>{msg.terminalStepsCount(steps.length)}</span>
      </div>

      <div className={css.terminalBody} style={{ maxHeight }}>
        {steps.map((step) => {
          const isFailed = step.exitCode !== undefined && step.exitCode !== 0
          return (
            <div key={step.id} className={css.terminalStep}>
              {step.comment ? <div className={css.terminalComment}># {step.comment}</div> : null}
              <div className={css.terminalCmdRow}>
                <div className={css.terminalCmdLine}>
                  <span className={css.terminalDollar} aria-hidden="true">
                    ${' '}
                  </span>
                  <code className={css.terminalCmdCode}>{step.cmd}</code>
                </div>
                <div className={css.terminalCmdActions}>
                  {step.exitCode !== undefined ? (
                    <span
                      className={css.terminalExitBadge}
                      data-failed={isFailed ? 'true' : 'false'}
                    >
                      exit {step.exitCode}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={css.diffCopyBtn}
                    onClick={() => handleCopyCmd(step.id, step.cmd)}
                  >
                    {copiedId === step.id ? msg.copiedCheck : msg.terminalCopyCmd}
                  </button>
                </div>
              </div>
              {step.output ? <pre className={css.terminalStdout}>{step.output}</pre> : null}
              {step.stderr ? <pre className={css.terminalStderr}>{step.stderr}</pre> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
})

/* ─────────────────────────── 3. ApprovalCard ─────────────────────────── */

export const DshApprovalCardImpl = defineComponent<{
  title?: unknown
  summary?: unknown
  severity?: 'low' | 'medium' | 'high' | 'critical'
  scope?: unknown
  impacts?: unknown
  confirmLabel?: unknown
  approveLabel?: unknown
  rejectLabel?: unknown
  approveAction?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  rejectAction?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(ApprovalCardApi, function DshApprovalCard({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const severity = props.severity ?? 'high'
  const [acknowledged, setAcknowledged] = useState(false)
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null)

  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const summary = props.summary !== undefined && props.summary !== null ? String(props.summary) : ''
  const scope = props.scope !== undefined && props.scope !== null ? String(props.scope) : ''
  const confirmText =
    props.confirmLabel !== undefined && props.confirmLabel !== null
      ? String(props.confirmLabel)
      : ''
  const needsAck = confirmText.trim() !== ''

  const impacts = useMemo(() => {
    if (!Array.isArray(props.impacts)) return []
    return props.impacts.map(String).filter((s) => s.trim() !== '')
  }, [props.impacts])

  const severityMeta: { label: string; tone: TagTone } =
    severity === 'critical'
      ? { label: msg.approvalSeverityCritical, tone: 'danger' }
      : severity === 'high'
        ? { label: msg.approvalSeverityHigh, tone: 'warning' }
        : severity === 'medium'
          ? { label: msg.approvalSeverityMedium, tone: 'info' }
          : { label: msg.approvalSeverityLow, tone: 'neutral' }

  const canApprove =
    !readOnly &&
    decision === null &&
    typeof props.approveAction === 'function' &&
    (!needsAck || acknowledged)
  const canReject = !readOnly && decision === null && typeof props.rejectAction === 'function'

  const approveText =
    decision === 'approved'
      ? msg.approvalApprovedDone
      : props.approveLabel
        ? String(props.approveLabel)
        : msg.approvalDefaultApprove

  const rejectText =
    decision === 'rejected'
      ? msg.approvalRejectedDone
      : props.rejectLabel
        ? String(props.rejectLabel)
        : msg.approvalDefaultReject

  return (
    <div
      className={css.approvalCard}
      style={weightStyle(props.weight, 240)}
      data-a2ui-approval=""
      data-severity={severity}
    >
      <div className={css.approvalHeader}>
        <div className={css.approvalBadges}>
          <DshTag tone={severityMeta.tone}>{severityMeta.label}</DshTag>
          {scope ? <span className={css.approvalScope}>{scope}</span> : null}
        </div>
        <div className={css.approvalTitle}>{title}</div>
        {summary ? <div className={css.approvalSummary}>{summary}</div> : null}
      </div>

      {impacts.length > 0 ? (
        <div className={css.approvalImpactsBox}>
          <div className={css.approvalImpactsLabel}>{msg.approvalImpactHeader}</div>
          <ul className={css.approvalImpactsList}>
            {impacts.map((imp, i) => (
              <li key={i}>{imp}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {needsAck ? (
        <div className={css.approvalAckRow}>
          <span
            className={css.approvalAckText}
            onClick={() => {
              if (!readOnly && decision === null) setAcknowledged((v) => !v)
            }}
          >
            {confirmText}
          </span>
          <DshSwitch
            checked={acknowledged}
            disabled={readOnly || decision !== null}
            label={confirmText}
            onChange={(next) => {
              if (!readOnly && decision === null) setAcknowledged(next)
            }}
          />
        </div>
      ) : null}

      {typeof props.approveAction === 'function' || typeof props.rejectAction === 'function' ? (
        <div className={css.approvalActionsRow}>
          {typeof props.rejectAction === 'function' ? (
            <DshButton
              size="sm"
              variant="outline"
              disabled={!canReject}
              onClick={() => {
                setDecision('rejected')
                void props.rejectAction?.({
                  metadata: {
                    extensions: {
                      dshSelection: {
                        source: 'approvalCard',
                        label: title,
                        series: 'rejected',
                        scope,
                        severity,
                        decision: 'rejected',
                      },
                    },
                  },
                })
              }}
            >
              {rejectText}
            </DshButton>
          ) : null}
          {typeof props.approveAction === 'function' ? (
            <DshButton
              size="sm"
              variant="primary"
              disabled={!canApprove}
              onClick={() => {
                setDecision('approved')
                void props.approveAction?.({
                  metadata: {
                    extensions: {
                      dshSelection: {
                        source: 'approvalCard',
                        label: title,
                        series: 'approved',
                        scope,
                        severity,
                        acknowledged,
                        decision: 'approved',
                      },
                    },
                  },
                })
              }}
            >
              {approveText}
            </DshButton>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})

/* ─────────────────────────── 4. ApiEndpoint ─────────────────────────── */

export const DshApiEndpointImpl = defineComponent<{
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
  path?: unknown
  summary?: unknown
  status?: unknown
  latency?: unknown
  baseUrl?: unknown
  params?: unknown
  headers?: unknown
  requestBody?: unknown
  responseBody?: unknown
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(ApiEndpointApi, function DshApiEndpoint({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const method = props.method ?? 'GET'
  const pathStr = props.path !== undefined && props.path !== null ? String(props.path) : '/'
  const routeTokens = useMemo(() => tokenizeEndpointPath(pathStr), [pathStr])
  const paramRows = useMemo(
    () => normalizeApiParamsAndHeaders(props.params, props.headers),
    [props.params, props.headers],
  )

  const hasResp = props.responseBody !== undefined && props.responseBody !== null
  const hasReq = props.requestBody !== undefined && props.requestBody !== null
  const hasParams = paramRows.length > 0

  const defaultTab = hasResp ? 'resp' : hasReq ? 'req' : 'params'
  const [tab, setTab] = useState<'resp' | 'req' | 'params'>(defaultTab)
  const [copiedCurl, setCopiedCurl] = useState(false)

  const statusNum =
    props.status !== undefined && props.status !== null && Number.isFinite(Number(props.status))
      ? Math.trunc(Number(props.status))
      : undefined
  const latency = props.latency !== undefined && props.latency !== null ? String(props.latency) : ''
  const summary = props.summary !== undefined && props.summary !== null ? String(props.summary) : ''

  const handleCopyCurl = () => {
    const curl = buildEndpointCurl({
      method,
      path: pathStr,
      baseUrl: props.baseUrl ? String(props.baseUrl) : undefined,
      headers: props.headers,
      requestBody: props.requestBody,
    })
    copyToClipboardSafe(curl)
    setCopiedCurl(true)
    setTimeout(() => setCopiedCurl(false), 1300)
  }

  const canAct = !readOnly && typeof props.action === 'function'

  return (
    <div className={css.apiCard} style={weightStyle(props.weight, 240)} data-a2ui-apiendpoint="">
      <div className={css.apiHeader}>
        <div className={css.apiRouteGroup}>
          <span className={css.apiMethodBadge} data-method={method}>
            {method}
          </span>
          <code className={css.apiPathCode}>
            {routeTokens.map((tok, i) =>
              tok.isParam ? (
                <span key={i} className={css.apiPathParam}>
                  {tok.text}
                </span>
              ) : (
                <span key={i}>{tok.text}</span>
              ),
            )}
          </code>
        </div>
        <div className={css.apiMetaGroup}>
          {statusNum !== undefined ? (
            <span
              className={css.apiStatusPill}
              data-ok={
                statusNum >= 200 && statusNum < 300 ? 'true' : statusNum >= 400 ? 'err' : 'warn'
              }
            >
              {statusNum}
              {latency ? ` · ${latency}` : ''}
            </span>
          ) : latency ? (
            <span className={css.apiStatusPill} data-ok="true">
              {latency}
            </span>
          ) : null}
          <button type="button" className={css.diffCopyBtn} onClick={handleCopyCurl}>
            {copiedCurl ? msg.copiedCheck : msg.apiCopyCurl}
          </button>
          {canAct ? (
            <DshButton
              size="sm"
              variant="outline"
              onClick={() => {
                void props.action?.({
                  metadata: {
                    extensions: {
                      dshSelection: {
                        source: 'apiEndpoint',
                        label: `${method} ${pathStr}`,
                        method,
                        path: pathStr,
                      },
                    },
                  },
                })
              }}
            >
              {msg.apiExecuteBtn}
            </DshButton>
          ) : null}
        </div>
      </div>

      {summary ? <div className={css.apiSummary}>{summary}</div> : null}

      {hasResp || hasReq || hasParams ? (
        <>
          <div className={css.apiTabBar} role="tablist">
            {hasResp ? (
              <DshPill active={tab === 'resp'} onClick={() => setTab('resp')}>
                {msg.apiTabResponse}
              </DshPill>
            ) : null}
            {hasReq ? (
              <DshPill active={tab === 'req'} onClick={() => setTab('req')}>
                {msg.apiTabRequest}
              </DshPill>
            ) : null}
            {hasParams ? (
              <DshPill active={tab === 'params'} onClick={() => setTab('params')}>
                {`${msg.apiTabParams} (${paramRows.length})`}
              </DshPill>
            ) : null}
          </div>

          <div className={css.apiBody}>
            {tab === 'resp' && hasResp ? (
              <DshJsonTree data={props.responseBody} label={msg.apiTabResponse} expandedDepth={2} />
            ) : tab === 'req' && hasReq ? (
              <DshJsonTree data={props.requestBody} label={msg.apiTabRequest} expandedDepth={2} />
            ) : tab === 'params' && hasParams ? (
              <table className={css.apiParamTable}>
                <tbody>
                  {paramRows.map((p, i) => (
                    <tr key={`${p.location}-${p.name}-${i}`}>
                      <td className={css.apiParamLoc}>{p.location}</td>
                      <td className={css.apiParamName}>
                        <code>{p.name}</code>
                        {p.required ? <span className={css.apiParamReq}>*</span> : null}
                      </td>
                      <td className={css.apiParamType}>{p.type}</td>
                      <td className={css.apiParamDesc}>{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={css.emptyCell}>{msg.apiEmptyBody}</div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
})

/* ─────────────────────────── 5. Schedule ─────────────────────────── */

export const DshScheduleImpl = defineComponent<{
  items?: unknown
  title?: unknown
  range?: unknown
  now?: unknown
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(ScheduleApi, function DshSchedule({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const model = useMemo(
    () => normalizeScheduleItems(props.items, props.range, props.now),
    [props.items, props.range, props.now],
  )
  const canAct = !readOnly && typeof props.action === 'function'
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
            const minPctForInside = Math.min(48, Math.ceil(estLabelPx / 3.4))
            const placeOutside = tr.widthPct < minPctForInside
            const spaceRightPct = 100 - (tr.leftPct + tr.widthPct)
            const placeOutsideRight = spaceRightPct >= tr.leftPct

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
                  <button
                    type="button"
                    disabled={!canAct}
                    className={css.scheduleBar}
                    data-status={tr.status}
                    data-clickable={canAct ? 'true' : 'false'}
                    data-narrow={placeOutside ? 'true' : 'false'}
                    style={{ left: `${tr.leftPct}%`, width: `${tr.widthPct}%` }}
                    title={`${tr.title}: ${tr.startLabel} – ${tr.endLabel}${tr.progress !== undefined ? ` (${tr.progress}%)` : ''}${tr.note ? ` · ${tr.note}` : ''}`}
                    onClick={
                      canAct
                        ? () => {
                            void props.action?.({
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
                          }
                        : undefined
                    }
                  >
                    {tr.progress !== undefined && tr.progress > 0 && tr.progress < 100 ? (
                      <span
                        className={css.scheduleBarProgress}
                        style={{ width: `${tr.progress}%` }}
                      />
                    ) : null}
                    {!placeOutside ? <span className={css.scheduleBarText}>{barLabel}</span> : null}
                  </button>
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

/* ─────────────────────────── 6. Result ─────────────────────────── */

export const DshResultImpl = defineComponent<{
  status: 'success' | 'info' | 'warning' | 'error' | 'empty'
  title?: unknown
  subtitle?: unknown
  meta?: unknown
  actionLabel?: unknown
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  child?: ChildRef
  weight?: number
}>(ResultApi, function DshResult({ props, buildChild }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const status = props.status ?? 'info'
  const title =
    props.title !== undefined && props.title !== null ? String(props.title) : msg.resultEmptyDefault
  const subtitle =
    props.subtitle !== undefined && props.subtitle !== null ? String(props.subtitle) : ''
  const metaItems = useMemo(
    () => (props.meta ? normalizeKeyValueItems(props.meta, false) : []),
    [props.meta],
  )
  const canAct = !readOnly && typeof props.action === 'function'
  const ctaLabel =
    props.actionLabel !== undefined && props.actionLabel !== null ? String(props.actionLabel) : ''

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
              void props.action?.({
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

/* ─────────────────────────── 7. EntityHeader ─────────────────────────── */

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
}>(EntityHeaderApi, function DshEntityHeader({ props }) {
  const readOnly = useContext(SurfaceReadOnlyContext)
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const subtitle =
    props.subtitle !== undefined && props.subtitle !== null ? String(props.subtitle) : ''
  const badge = props.badge !== undefined && props.badge !== null ? String(props.badge) : ''
  const statusLabel =
    props.statusLabel !== undefined && props.statusLabel !== null ? String(props.statusLabel) : ''
  const monogram =
    props.avatarText !== undefined && props.avatarText !== null && String(props.avatarText) !== ''
      ? String(props.avatarText).slice(0, 3)
      : title.trim().slice(0, 2).toUpperCase()

  const tags = useMemo(
    () => (Array.isArray(props.tags) ? props.tags.map(String).filter(Boolean) : []),
    [props.tags],
  )
  const metrics = useMemo(
    () => (props.metrics ? normalizeKeyValueItems(props.metrics, false) : []),
    [props.metrics],
  )

  const dotState: 'done' | 'ongoing' | 'error' | 'pending' | null =
    props.status === 'healthy'
      ? 'done'
      : props.status === 'ongoing' || props.status === 'warning'
        ? 'ongoing'
        : props.status === 'error'
          ? 'error'
          : props.status === 'offline'
            ? 'pending'
            : null

  const canAct = !readOnly && typeof props.action === 'function'
  const ctaLabel =
    props.actionLabel !== undefined && props.actionLabel !== null ? String(props.actionLabel) : ''

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
              {dotState ? (
                <span className={css.entityStatusPill} data-status={props.status}>
                  <DshStateDot state={dotState} size={8} />
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
              void props.action?.({
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

/* ─────────────────────────── 8. Matrix ─────────────────────────── */

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
  const resolveCellColorVar = (intensityPct: number): string => {
    if (scale === 'auto') {
      if (intensityPct >= 66) return 'var(--dsw-alias-state-error-primary, #ef4444)'
      if (intensityPct >= 34) return 'var(--dsw-alias-state-warn-primary, #f59e0b)'
      return 'var(--dsw-alias-state-success-primary, #10b981)'
    }
    if (scale === 'success') return 'var(--dsw-alias-state-success-primary, #10b981)'
    if (scale === 'warning') return 'var(--dsw-alias-state-warn-primary, #f59e0b)'
    return 'var(--dsw-alias-state-info-primary, #3b82f6)'
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
              <th className={css.matrixCornerTh}>{corner}</th>
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
                <td className={css.matrixRowTd}>{rowLabel}</td>
                {(model.cells[rIdx] ?? []).map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className={css.matrixValTd}
                    data-kind={cell.kind}
                    style={
                      cell.kind === 'number' && cell.intensityPct > 0
                        ? {
                            background: `color-mix(in srgb, ${resolveCellColorVar(cell.intensityPct)} ${cell.intensityPct}%, transparent)`,
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
