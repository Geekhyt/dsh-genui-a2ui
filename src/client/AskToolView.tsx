/**
 * `a2ui_ask` client views:
 *
 * 1. `A2uiAskDockView` (`conversation.input.dock`, `order: 5`):
 *    Automatically pops open above the chat composer whenever an `a2ui_ask` call
 *    is streaming (`preparing`) or suspended awaiting user input (`start`) —
 *    mirroring DSH's own native `ask_user_question` UX so the user sees and
 *    interacts with the form immediately even when `stepGrouping: "collapsed"`
 *    folds the turn's process group.
 *
 * 2. `A2uiAskToolView` (`tool.call.toolview`, `key: 'a2ui_ask'`):
 *    Shows a compact status row inside the process group while active, and settles
 *    to `"已提交 · <action>"` / `"已跳过"` / `"等待超时"` (expandable to inspect the
 *    read-only snapshot and submitted JSON payload) once `phase === 'result'`.
 */
import { memo, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ActionPayload } from '@a2ui/web_core/v1_0'
import type { AskAnswerInput } from '../shared/wire-types.ts'
import dockCss from './DockView.module.css'
import type { WorkspaceFileOpener } from './file-opener.tsx'
import { LazySurfaceGroupView, useLazyStreamingExpress } from './LazySurfaceGroupView.tsx'
import css from './SurfaceView.module.css'
import type { ChatExternalStore, ToolViewOwnerProps } from './ToolView.tsx'
import { parseAskMeta, resolveActiveAskCall, resolveSessionMessages } from './turn-surfaces.ts'
import { DshAppsIcon, DshButton, DshDisclosureRow } from './ui/primitives.tsx'

export interface A2uiAskDockViewProps {
  readonly sessionId?: string | undefined
  readonly chatStore?: ChatExternalStore | undefined
  readonly openWorkspaceFile?: WorkspaceFileOpener | undefined
  readonly submitAskAnswer?: ((payload: AskAnswerInput) => Promise<boolean>) | undefined
}

export interface A2uiAskToolViewProps extends ToolViewOwnerProps {
  readonly chatStore?: ChatExternalStore | undefined
  readonly openWorkspaceFile?: WorkspaceFileOpener | undefined
  readonly submitAskAnswer?: ((payload: AskAnswerInput) => Promise<boolean>) | undefined
}

const NOOP_SUBSCRIBE = () => () => {}

/** Active interactive `a2ui_ask` card pinned right above the composer while awaiting input. */
export const A2uiAskDockView = memo(function A2uiAskDockView({
  sessionId,
  chatStore,
  openWorkspaceFile,
  submitAskAnswer,
}: A2uiAskDockViewProps) {
  const [submittingCallId, setSubmittingCallId] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const subscribe = useCallback(
    (listener: () => void) => (chatStore ? chatStore.subscribe(listener) : NOOP_SUBSCRIBE()),
    [chatStore],
  )
  const getSnapshot = useCallback(() => chatStore?.getSnapshot(), [chatStore])
  const chatSnapshot = useSyncExternalStore(subscribe, getSnapshot, () => undefined)

  const activeAsk = useMemo(() => resolveActiveAskCall(chatSnapshot), [chatSnapshot])

  useEffect(() => {
    setSubmitError(null)
  }, [activeAsk?.callId])

  const streamingSnapshot = useLazyStreamingExpress(
    activeAsk !== null,
    activeAsk?.ui ?? '',
    activeAsk?.phase === 'start',
    activeAsk?.callId ?? 'ask',
  )

  const priorMessages = useMemo(() => resolveSessionMessages(chatSnapshot), [chatSnapshot])

  const liveMessages = useMemo(() => {
    const current = streamingSnapshot?.messages ?? []
    if (priorMessages.length === 0) return current
    return [...priorMessages, ...current]
  }, [priorMessages, streamingSnapshot])

  const liveVisibleIds = useMemo(() => {
    const ids = streamingSnapshot?.surfaceIds ?? []
    return ids.length > 0 ? new Set(ids) : undefined
  }, [streamingSnapshot])

  const activeCallId = activeAsk?.callId ?? ''
  const submitting = activeCallId !== '' && submittingCallId === activeCallId

  const handleSurfaceAction = useCallback(
    (_formatted: string, raw: ActionPayload, dataModels: Record<string, unknown>) => {
      if (!activeCallId || submitting || submitAskAnswer === undefined) return
      setSubmittingCallId(activeCallId)
      setSubmitError(null)
      void submitAskAnswer({
        callId: activeCallId,
        action: raw.name,
        surfaceId: raw.surfaceId,
        sourceComponentId: raw.sourceComponentId,
        userMessage: raw.userMessage,
        context: raw.context,
        dataModels,
      }).then(
        (ok) => {
          if (!ok) {
            setSubmittingCallId(null)
            setSubmitError('提交未成功，请重试')
          }
        },
        (err: unknown) => {
          setSubmittingCallId(null)
          setSubmitError(err instanceof Error ? err.message : '提交失败')
        },
      )
    },
    [activeCallId, submitAskAnswer, submitting],
  )

  const handleSkip = useCallback(() => {
    if (!activeCallId || submitting || submitAskAnswer === undefined) return
    setSubmittingCallId(activeCallId)
    setSubmitError(null)
    void submitAskAnswer({ callId: activeCallId, skipped: true }).then(
      (ok) => {
        if (!ok) {
          setSubmittingCallId(null)
          setSubmitError('跳过失败，请重试')
        }
      },
      (err: unknown) => {
        setSubmittingCallId(null)
        setSubmitError(err instanceof Error ? err.message : '跳过失败')
      },
    )
  }, [activeCallId, submitAskAnswer, submitting])

  if (activeAsk === null) return null

  const waiting = activeAsk.phase === 'start'
  const title = activeAsk.title ?? 'A2UI 交互提问'

  return (
    <section
      className={dockCss.root}
      aria-label={title}
      data-tool="a2ui_ask"
      data-state={waiting ? 'waiting' : 'streaming'}
      data-a2ui-ask-dock=""
    >
      <div className={dockCss.header}>
        <div className={dockCss.toggleBtn} style={{ cursor: 'default' }}>
          <span className={dockCss.leadIcon} aria-hidden="true">
            <DshAppsIcon size={14} />
          </span>
          <span className={dockCss.title}>{title}</span>
          <span className={css.badgeAccent} data-a2ui-ask-waiting="">
            {!waiting ? '正在生成提问…' : submitting ? '正在提交…' : '等待您的输入'}
          </span>
        </div>
        {waiting ? (
          <div className={dockCss.actions}>
            <DshButton
              variant="ghost"
              size="sm"
              disabled={submitting || submitAskAnswer === undefined}
              onClick={handleSkip}
              data-a2ui-ask-skip=""
            >
              跳过
            </DshButton>
          </div>
        ) : null}
      </div>
      <div className={dockCss.body} style={{ maxHeight: 380 }}>
        <LazySurfaceGroupView
          messages={liveMessages}
          visibleSurfaceIds={liveVisibleIds}
          sessionId={sessionId}
          variant="bare"
          streaming={!waiting}
          readOnly={!waiting || submitting}
          readOnlyLabel={submitting ? '正在提交…' : '正在生成提问…'}
          onAction={handleSurfaceAction}
          openWorkspaceFile={openWorkspaceFile}
        />
        {submitError ? (
          <div className={css.reason} role="alert">
            {submitError}
          </div>
        ) : null}
      </div>
    </section>
  )
})

/** Transcript row inside `tool.call.toolview` (`key: 'a2ui_ask'`). */
export const A2uiAskToolView = memo(function A2uiAskToolView({
  phase,
  block,
  inspect,
}: A2uiAskToolViewProps) {
  const [expanded, setExpanded] = useState(false)

  const argTitle = block.args?.text('title')?.trim() || undefined
  const argUi = block.args?.text('ui') ?? ''

  const settledMeta = useMemo(
    () => (phase === 'result' && !block.isError ? parseAskMeta(block.meta) : null),
    [phase, block.isError, block.meta],
  )

  const title = settledMeta?.title ?? argTitle ?? 'A2UI 交互提问'

  // 1. Error / interrupted state
  if (phase === 'result' && block.isError) {
    const stopped = block.error?.code === 'interrupted'
    const reason = (block.content ?? [])
      .flatMap((c) => (c.type === 'text' && typeof c.text === 'string' ? [c.text] : []))
      .join('\n')
    const hasReason = reason.trim() !== ''
    return (
      <div data-tool="a2ui_ask" data-state={stopped ? 'stopped' : 'error'}>
        <DshDisclosureRow
          icon={<DshAppsIcon size={14} />}
          title="A2UI 提问"
          running={false}
          open={expanded && hasReason}
          expandable={hasReason}
          expandOnRowClick={true}
          keepContentWhenOpen={true}
          onToggle={() => setExpanded((v) => !v)}
          collapsedContent={
            <span className={css.rowSummary}>
              <span>{stopped ? '已中断' : '校验未通过（重试中）'}</span>
              {argTitle ? <span className={css.rowTitle}>{argTitle}</span> : null}
            </span>
          }
        >
          <pre className={css.reason}>{reason}</pre>
          {inspect ? (
            <button type="button" className={css.inspectBtn} onClick={inspect}>
              查看调用详情
            </button>
          ) : null}
        </DshDisclosureRow>
      </div>
    )
  }

  // 2. Active (`preparing` / `start`) — interactive surface is pinned above composer in `A2uiAskDockView`
  if (phase !== 'result') {
    const waiting = phase === 'start'
    return (
      <div data-tool="a2ui_ask" data-state="active-in-dock">
        <DshDisclosureRow
          icon={<DshAppsIcon size={14} />}
          title="A2UI 提问"
          running={true}
          open={false}
          expandable={false}
          onToggle={() => {}}
          collapsedContent={
            <span className={css.rowSummary}>
              <span>{waiting ? '等待底部交互栏提交' : '正在生成提问表单'}</span>
              <span className={css.rowTitle}>{title}</span>
            </span>
          }
        />
      </div>
    )
  }

  // 3. Settled (`phase === 'result'`): compact summary row, expandable to inspect read-only snapshot
  const statusLabel =
    settledMeta?.status === 'skipped'
      ? '已跳过'
      : settledMeta?.status === 'timed_out'
        ? '等待超时'
        : `已提交 · ${settledMeta?.userMessage ?? settledMeta?.action ?? '确认'}`

  const settledMessages = settledMeta?.messages ?? []
  const settledVisibleIds = settledMeta ? new Set(settledMeta.surfaceIds) : undefined
  const canExpand = settledMessages.length > 0 || argUi.trim() !== ''

  return (
    <div data-tool="a2ui_ask" data-state={settledMeta?.status ?? 'answered'}>
      <DshDisclosureRow
        icon={<DshAppsIcon size={14} />}
        title="A2UI 提问"
        running={false}
        open={expanded && canExpand}
        expandable={canExpand}
        expandOnRowClick={true}
        keepContentWhenOpen={true}
        onToggle={() => setExpanded((v) => !v)}
        collapsedContent={
          <span className={css.rowSummary}>
            <span>{statusLabel}</span>
            <span className={css.rowTitle}>{title}</span>
          </span>
        }
      >
        {settledMessages.length > 0 ? (
          <LazySurfaceGroupView
            messages={settledMessages}
            visibleSurfaceIds={settledVisibleIds}
            variant="bare"
            readOnly={true}
            readOnlyLabel={statusLabel}
          />
        ) : null}
        {settledMeta?.context && Object.keys(settledMeta.context).length > 0 ? (
          <pre className={css.reason}>{JSON.stringify(settledMeta.context, null, 2)}</pre>
        ) : null}
        {inspect ? (
          <button type="button" className={css.inspectBtn} onClick={inspect}>
            查看调用详情
          </button>
        ) : null}
      </DshDisclosureRow>
    </div>
  )
})
