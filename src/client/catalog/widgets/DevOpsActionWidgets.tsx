import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import { useContext, useMemo, useRef, useState } from 'react'
import {
  ApiEndpointApi,
  ApprovalCardApi,
  TerminalApi,
  TrackerApi,
} from '../../../shared/catalog-schema.ts'
import { useTransientFlag, useTransientKey } from '../../dom-hooks.ts'
import { useRuntimeMessages } from '../../i18n.ts'
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
} from '../../ui/primitives.tsx'
import css from '../Catalog.module.css'
import {
  buildEndpointCurl,
  normalizeApiParamsAndHeaders,
  normalizeCategorySegments,
  normalizeTerminalCommands,
  normalizeTrackerSlices,
  type TrackerSliceStatus,
  tokenizeEndpointPath,
} from '../v4-helpers.ts'
import {
  copyTextToClipboard,
  defineComponent,
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  useSurfaceActionRunner,
  weightStyle,
} from '../widget-helpers.tsx'

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
  const overallState = hasError ? 'error' : hasWarn ? 'warning' : 'done'

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
            gap: slices.length > 48 ? 1 : slices.length > 28 ? 2 : 3,
            gridTemplateColumns: `repeat(${slices.length}, minmax(0, 1fr))`,
          }}
          onMouseLeave={() => setActiveSliceId(null)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setActiveSliceId(null)
            }
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
                    onFocus={() => setActiveSliceId(s.id)}
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
  const [copiedId, markCopiedId] = useTransientKey<string>(1300)

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
    copyTextToClipboard(cmd)
    markCopiedId(id)
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

export const DshApprovalCardImpl = defineComponent<{
  title?: unknown
  summary?: unknown
  severity?: 'low' | 'medium' | 'high' | 'critical'
  scope?: unknown
  impacts?: unknown
  confirmLabel?: unknown
  approveLabel?: unknown
  rejectLabel?: unknown
  approveAction?: ((options?: ActionDispatchOptions) => unknown) | undefined
  rejectAction?: ((options?: ActionDispatchOptions) => unknown) | undefined
  weight?: number
}>(ApprovalCardApi, function DshApprovalCard({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const runApprove = useSurfaceActionRunner(context, props.approveAction, 'approveAction')
  const runReject = useSurfaceActionRunner(context, props.rejectAction, 'rejectAction')
  const { markSubmitAttempted } = useContext(SurfaceValidationContext)
  const rawSeverity =
    typeof props.severity === 'string' ? props.severity.trim().toLowerCase() : 'high'
  const severity: 'low' | 'medium' | 'high' | 'critical' =
    rawSeverity === 'critical' ||
    rawSeverity === 'high' ||
    rawSeverity === 'medium' ||
    rawSeverity === 'low'
      ? rawSeverity
      : 'high'
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const summary = props.summary !== undefined && props.summary !== null ? String(props.summary) : ''
  const scope = props.scope !== undefined && props.scope !== null ? String(props.scope) : ''
  const impacts = useMemo(() => {
    if (!Array.isArray(props.impacts)) return []
    return props.impacts.map(String).filter((s) => s.trim() !== '')
  }, [props.impacts])
  const targetKey = `${title}\u0000${scope}\u0000${summary}\u0000${severity}\u0000${impacts.join('|')}`
  const [prevTargetKey, setPrevTargetKey] = useState(targetKey)
  const [acknowledged, setAcknowledged] = useState(false)
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null)
  const decisionSeqRef = useRef(0)
  if (prevTargetKey !== targetKey) {
    decisionSeqRef.current += 1
    setPrevTargetKey(targetKey)
    if (acknowledged) setAcknowledged(false)
    if (decision !== null) setDecision(null)
  }
  const confirmText =
    props.confirmLabel !== undefined && props.confirmLabel !== null
      ? String(props.confirmLabel)
      : ''
  const needsAck = confirmText.trim() !== ''

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
                if (!runReject) return
                markSubmitAttempted()
                const seq = ++decisionSeqRef.current
                setDecision('rejected')
                void runReject({
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
                }).then((ok) => {
                  if (!ok && decisionSeqRef.current === seq) setDecision(null)
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
                if (!runApprove) return
                markSubmitAttempted()
                const seq = ++decisionSeqRef.current
                setDecision('approved')
                void runApprove({
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
                }).then((ok) => {
                  if (!ok && decisionSeqRef.current === seq) setDecision(null)
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
}>(ApiEndpointApi, function DshApiEndpoint({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const runAction = useSurfaceActionRunner(context, props.action)
  const method =
    typeof props.method === 'string' && props.method.trim() !== ''
      ? props.method.trim().toUpperCase()
      : 'GET'
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
  const activeTab: 'resp' | 'req' | 'params' =
    (tab === 'resp' && hasResp) || (tab === 'req' && hasReq) || (tab === 'params' && hasParams)
      ? tab
      : defaultTab
  const [copiedCurl, markCopiedCurl] = useTransientFlag(1300)

  const rawStatusText =
    props.status !== undefined && props.status !== null ? String(props.status).trim() : ''
  const statusNum =
    rawStatusText !== '' && Number.isFinite(Number(rawStatusText))
      ? Math.trunc(Number(rawStatusText))
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
    copyTextToClipboard(curl)
    markCopiedCurl()
  }

  const canAct = !readOnly && Boolean(runAction)

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
                void runAction?.({
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
              <DshPill
                role="tab"
                aria-selected={activeTab === 'resp'}
                active={activeTab === 'resp'}
                onClick={() => setTab('resp')}
              >
                {msg.apiTabResponse}
              </DshPill>
            ) : null}
            {hasReq ? (
              <DshPill
                role="tab"
                aria-selected={activeTab === 'req'}
                active={activeTab === 'req'}
                onClick={() => setTab('req')}
              >
                {msg.apiTabRequest}
              </DshPill>
            ) : null}
            {hasParams ? (
              <DshPill
                role="tab"
                aria-selected={activeTab === 'params'}
                active={activeTab === 'params'}
                onClick={() => setTab('params')}
              >
                {`${msg.apiTabParams} (${paramRows.length})`}
              </DshPill>
            ) : null}
          </div>

          <div className={css.apiBody}>
            {activeTab === 'resp' && hasResp ? (
              <DshJsonTree data={props.responseBody} label={msg.apiTabResponse} expandedDepth={2} />
            ) : activeTab === 'req' && hasReq ? (
              <DshJsonTree data={props.requestBody} label={msg.apiTabRequest} expandedDepth={2} />
            ) : activeTab === 'params' && hasParams ? (
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
