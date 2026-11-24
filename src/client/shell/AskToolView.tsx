import type { ActionPayload } from '@a2ui/web_core/v1_0'
import { memo, useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { AskAnswerInput } from '../../shared/wire-types.ts'
import dockCss from './DockView.module.css'
import { useEffectCallback } from '../dom-hooks.ts'
import type { WorkspaceFileOpener } from '../file-opener.tsx'
import { useShellMessages } from '../i18n.ts'
import { LazySurfaceGroupView, useLazyStreamingExpress } from './LazySurfaceGroupView.tsx'
import { removeSurfaceDraftsBySurface } from '../persistence.ts'
import css from '../SurfaceView.module.css'
import type { ChatExternalStore, ToolViewOwnerProps } from './ToolView.tsx'
import {
  buildReplayMessagesForSurfaceCall,
  findCallSeq,
  parseAskMeta,
  resolveActiveAskCall,
} from './turn-surfaces.ts'
import { DshAppsIcon, DshButton, DshDisclosureRow } from '../ui/primitives.tsx'

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
const APPS_ICON_14 = <DshAppsIcon size={14} />

export const A2uiAskDockView = memo(function A2uiAskDockView({
  sessionId,
  chatStore,
  openWorkspaceFile,
  submitAskAnswer,
}: A2uiAskDockViewProps) {
  const msg = useShellMessages()
  const [submittingKeys, setSubmittingKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [errorState, setErrorState] = useState<{
    readonly callId: string
    readonly message: string
  } | null>(null)

  const subscribe = useCallback(
    (listener: () => void) => (chatStore ? chatStore.subscribe(listener) : NOOP_SUBSCRIBE()),
    [chatStore],
  )
  const getSnapshot = useCallback(() => chatStore?.getSnapshot(), [chatStore])
  const chatSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const activeAsk = useMemo(() => resolveActiveAskCall(chatSnapshot), [chatSnapshot])
  const activeCallId = activeAsk?.callId ?? ''
  const compositeCallKey = activeCallId !== '' ? `${sessionId ?? ''}::${activeCallId}` : ''

  const streamingSnapshot = useLazyStreamingExpress(
    activeAsk !== null,
    activeAsk?.ui ?? '',
    activeAsk?.phase === 'start',
    compositeCallKey || 'ask',
  )

  const liveVisibleIds = useMemo(() => {
    const ids = streamingSnapshot?.surfaceIds ?? []
    return ids.length > 0 ? new Set(ids) : undefined
  }, [streamingSnapshot])

  const activeAskSeq = useMemo(
    () => (activeAsk ? findCallSeq(chatSnapshot, activeAsk.callId) : undefined),
    [activeAsk, chatSnapshot],
  )

  const liveMessages = useMemo(
    () =>
      buildReplayMessagesForSurfaceCall(
        chatSnapshot,
        streamingSnapshot?.messages ?? [],
        streamingSnapshot?.surfaceIds ?? [],
        activeAskSeq,
      ),
    [activeAskSeq, chatSnapshot, streamingSnapshot],
  )

  const draftSessionId =
    sessionId && activeCallId ? `${sessionId}::ask::${activeCallId}` : undefined
  const inFlightKeysRef = useRef<Set<string>>(new Set())
  const prevAskDraftRef = useRef<{
    readonly sessionId: string | undefined
    readonly draftSessionId: string
    readonly surfaceIds: readonly string[]
  } | null>(null)
  const submitting = compositeCallKey !== '' && submittingKeys.has(compositeCallKey)
  const submitError =
    compositeCallKey !== '' && errorState?.callId === compositeCallKey ? errorState.message : null

  const clearAskDrafts = useCallback(
    (
      targetSessionId: string | undefined = draftSessionId,
      targetIds: readonly string[] = liveVisibleIds ? [...liveVisibleIds] : [],
    ) => {
      if (!targetSessionId || targetIds.length === 0) return
      for (const id of targetIds) {
        removeSurfaceDraftsBySurface(targetSessionId, id)
      }
    },
    [draftSessionId, liveVisibleIds],
  )

  useEffectCallback(() => {
    const prev = prevAskDraftRef.current
    if (draftSessionId && liveVisibleIds && liveVisibleIds.size > 0) {
      if (prev && prev.sessionId === sessionId && prev.draftSessionId !== draftSessionId) {
        clearAskDrafts(prev.draftSessionId, prev.surfaceIds)
      }
      prevAskDraftRef.current = {
        sessionId,
        draftSessionId,
        surfaceIds: [...liveVisibleIds],
      }
    } else if (prev !== null) {
      if (prev.sessionId === sessionId) {
        clearAskDrafts(prev.draftSessionId, prev.surfaceIds)
      }
      prevAskDraftRef.current = null
    }
    return undefined
  }, [clearAskDrafts, draftSessionId, liveVisibleIds, sessionId])

  const removeSubmittingKey = useCallback((targetKey: string) => {
    setSubmittingKeys((prev) => {
      if (!prev.has(targetKey)) return prev
      const next = new Set(prev)
      next.delete(targetKey)
      return next
    })
  }, [])

  const handleSurfaceAction = useCallback(
    (
      _formatted: string,
      raw: ActionPayload,
      dataModels: Record<string, unknown>,
    ): Promise<boolean> => {
      if (
        !activeCallId ||
        submitting ||
        inFlightKeysRef.current.has(compositeCallKey) ||
        submitAskAnswer === undefined
      ) {
        return Promise.resolve(false)
      }
      const targetCallId = activeCallId
      const targetKey = compositeCallKey
      const targetDraftSessionId = draftSessionId
      const targetSurfaceIds = liveVisibleIds ? [...liveVisibleIds] : []
      inFlightKeysRef.current.add(targetKey)
      setSubmittingKeys((prev) => {
        const next = new Set(prev)
        next.add(targetKey)
        return next
      })
      setErrorState(null)
      return submitAskAnswer({
        callId: targetCallId,
        action: raw.name,
        surfaceId: raw.surfaceId,
        sourceComponentId: raw.sourceComponentId,
        userMessage: raw.userMessage,
        context: raw.context,
        dataModels,
      }).then(
        (ok) => {
          inFlightKeysRef.current.delete(targetKey)
          if (ok) {
            clearAskDrafts(targetDraftSessionId, targetSurfaceIds)
            removeSubmittingKey(targetKey)
            return true
          }
          removeSubmittingKey(targetKey)
          setErrorState({ callId: targetKey, message: msg.askSubmitRetry })
          return false
        },
        (err: unknown) => {
          inFlightKeysRef.current.delete(targetKey)
          removeSubmittingKey(targetKey)
          setErrorState({
            callId: targetKey,
            message: err instanceof Error ? err.message : msg.askSubmitFailed,
          })
          return false
        },
      )
    },
    [
      activeCallId,
      clearAskDrafts,
      compositeCallKey,
      draftSessionId,
      liveVisibleIds,
      msg,
      removeSubmittingKey,
      submitAskAnswer,
      submitting,
    ],
  )

  const handleSkip = useCallback(() => {
    if (
      !activeCallId ||
      submitting ||
      inFlightKeysRef.current.has(compositeCallKey) ||
      submitAskAnswer === undefined
    ) {
      return
    }
    const targetCallId = activeCallId
    const targetKey = compositeCallKey
    const targetDraftSessionId = draftSessionId
    const targetSurfaceIds = liveVisibleIds ? [...liveVisibleIds] : []
    inFlightKeysRef.current.add(targetKey)
    setSubmittingKeys((prev) => {
      const next = new Set(prev)
      next.add(targetKey)
      return next
    })
    setErrorState(null)
    void submitAskAnswer({ callId: targetCallId, skipped: true }).then(
      (ok) => {
        inFlightKeysRef.current.delete(targetKey)
        if (ok) {
          clearAskDrafts(targetDraftSessionId, targetSurfaceIds)
          removeSubmittingKey(targetKey)
          return
        }
        removeSubmittingKey(targetKey)
        setErrorState({ callId: targetKey, message: msg.askSkipRetry })
      },
      (err: unknown) => {
        inFlightKeysRef.current.delete(targetKey)
        removeSubmittingKey(targetKey)
        setErrorState({
          callId: targetKey,
          message: err instanceof Error ? err.message : msg.askSkipFailed,
        })
      },
    )
  }, [
    activeCallId,
    clearAskDrafts,
    compositeCallKey,
    draftSessionId,
    liveVisibleIds,
    msg,
    removeSubmittingKey,
    submitAskAnswer,
    submitting,
  ])

  if (activeAsk === null) return null

  const waiting = activeAsk.phase === 'start'
  const title = activeAsk.title ?? msg.askDefaultTitle
  const compileError =
    waiting && liveMessages.length === 0 && streamingSnapshot?.error
      ? streamingSnapshot.error
      : null

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
            {APPS_ICON_14}
          </span>
          <span className={dockCss.title}>{title}</span>
          <span className={css.badgeAccent} data-a2ui-ask-waiting="">
            {!waiting ? msg.askGenerating : submitting ? msg.askSubmitting : msg.askWaitingInput}
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
              {msg.askSkip}
            </DshButton>
          </div>
        ) : null}
      </div>
      <div className={dockCss.body} style={{ maxHeight: 'min(480px, 56vh)' }}>
        <LazySurfaceGroupView
          key={compositeCallKey}
          messages={liveMessages}
          visibleSurfaceIds={liveVisibleIds}
          sessionId={draftSessionId}
          variant="bare"
          streaming={!waiting}
          readOnly={!waiting || submitting}
          readOnlyLabel={submitting ? msg.askSubmitting : msg.askGenerating}
          onAction={handleSurfaceAction}
          openWorkspaceFile={openWorkspaceFile}
        />
        {compileError ? (
          <div className={css.reason} role="alert" data-a2ui-ask-compile-error="">
            {compileError}
          </div>
        ) : null}
        {submitError ? (
          <div className={css.reason} role="alert">
            {submitError}
          </div>
        ) : null}
      </div>
    </section>
  )
})

export const A2uiAskToolView = memo(function A2uiAskToolView({
  callId,
  phase,
  block,
  inspect,
  chatStore,
}: A2uiAskToolViewProps) {
  const msg = useShellMessages()
  const [expanded, setExpanded] = useState(false)

  const subscribe = useCallback(
    (listener: () => void) => (chatStore ? chatStore.subscribe(listener) : NOOP_SUBSCRIBE()),
    [chatStore],
  )
  const getSnapshot = useCallback(() => chatStore?.getSnapshot(), [chatStore])
  const chatSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const argTitle = block.args?.text('title')?.trim() || undefined
  const argUi = block.args?.text('ui') ?? ''

  const settledMeta = useMemo(
    () => (phase === 'result' && !block.isError ? parseAskMeta(block.meta) : null),
    [phase, block.isError, block.meta],
  )

  const settledVisibleIds = useMemo(
    () => (settledMeta ? new Set(settledMeta.surfaceIds) : undefined),
    [settledMeta],
  )

  const callSeq = useMemo(() => findCallSeq(chatSnapshot, callId), [chatSnapshot, callId])

  const replayedSettledMessages = useMemo(
    () =>
      settledMeta !== null
        ? buildReplayMessagesForSurfaceCall(
            chatSnapshot,
            settledMeta.messages,
            settledMeta.surfaceIds,
            callSeq,
          )
        : [],
    [callSeq, chatSnapshot, settledMeta],
  )

  const title = settledMeta?.title ?? argTitle ?? msg.askDefaultTitle

  if (phase === 'result' && block.isError) {
    const stopped = block.error?.code === 'interrupted'
    const reason = (block.content ?? [])
      .flatMap((c) => (c.type === 'text' && typeof c.text === 'string' ? [c.text] : []))
      .join('\n')
    const hasReason = reason.trim() !== ''
    return (
      <div data-tool="a2ui_ask" data-state={stopped ? 'stopped' : 'error'}>
        <DshDisclosureRow
          icon={APPS_ICON_14}
          title={msg.askRowTitle}
          running={false}
          open={expanded && hasReason}
          expandable={hasReason}
          expandOnRowClick={true}
          keepContentWhenOpen={true}
          onToggle={() => setExpanded((v) => !v)}
          collapsedContent={
            <span className={css.rowSummary}>
              <span>{stopped ? msg.interrupted : msg.validationRetry}</span>
              {argTitle ? <span className={css.rowTitle}>{argTitle}</span> : null}
            </span>
          }
        >
          <pre className={css.reason}>{reason}</pre>
          {inspect ? (
            <button type="button" className={css.inspectBtn} onClick={inspect}>
              {msg.inspectCall}
            </button>
          ) : null}
        </DshDisclosureRow>
      </div>
    )
  }

  if (phase !== 'result') {
    const waiting = phase === 'start'
    return (
      <div data-tool="a2ui_ask" data-state="active-in-dock">
        <DshDisclosureRow
          icon={APPS_ICON_14}
          title={msg.askRowTitle}
          running={true}
          open={false}
          expandable={false}
          onToggle={() => {}}
          collapsedContent={
            <span className={css.rowSummary}>
              <span>{waiting ? msg.askWaitingDock : msg.askGeneratingForm}</span>
              <span className={css.rowTitle}>{title}</span>
            </span>
          }
        />
      </div>
    )
  }

  const statusLabel =
    settledMeta?.status === 'skipped'
      ? msg.askSkipped
      : settledMeta?.status === 'timed_out'
        ? msg.askTimedOut
        : msg.askSubmittedWith(
            settledMeta?.userMessage ?? settledMeta?.action ?? msg.askDefaultAction,
          )

  const settledMessages = replayedSettledMessages
  const canExpand = settledMessages.length > 0 || argUi.trim() !== ''

  return (
    <div data-tool="a2ui_ask" data-state={settledMeta?.status ?? 'answered'}>
      <DshDisclosureRow
        icon={APPS_ICON_14}
        title={msg.askRowTitle}
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
        ) : argUi.trim() !== '' ? (
          <pre className={css.reason}>{argUi}</pre>
        ) : null}
        {settledMeta?.context && Object.keys(settledMeta.context).length > 0 ? (
          <pre className={css.reason}>{JSON.stringify(settledMeta.context, null, 2)}</pre>
        ) : null}
        {inspect ? (
          <button type="button" className={css.inspectBtn} onClick={inspect}>
            {msg.inspectCall}
          </button>
        ) : null}
      </DshDisclosureRow>
    </div>
  )
})
