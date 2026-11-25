import { memo, useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { normalizePlacement } from '../../shared/constants.ts'
import {
  isAbsoluteWorkspacePath,
  parseFileTarget,
  type WorkspaceFileOpener,
} from '../file-opener.tsx'
import { useShellMessages } from '../i18n.ts'
import { LazySurfaceGroupView, useLazyStreamingExpress } from './LazySurfaceGroupView.tsx'
import css from '../SurfaceView.module.css'
import type { SurfaceActionCallback } from '../runtime/SurfaceView.tsx'
import {
  buildReplayMessagesForSurfaceCall,
  type ChatTargetSnapshot,
  findCallSeq,
  parseRenderMeta,
  resolveSupersededSurfaceIdsAfterCall,
} from './turn-surfaces.ts'
import { DshAppsIcon, DshDisclosureRow } from '../ui/primitives.tsx'

export interface PartialArgsReader {
  text(key: string): string | undefined
}

export interface ToolViewOwnerProps {
  readonly callId: string
  readonly toolName: string
  readonly phase: 'preparing' | 'start' | 'result'
  readonly sessionId?: string
  readonly inspect?: () => void
  readonly openFile?: (path: string, options?: { line?: number }) => void | Promise<void>
  readonly block: {
    readonly callId: string
    readonly args?: PartialArgsReader
    readonly call?: { readonly name: string; readonly argsRaw?: string } | null
    readonly isError?: boolean
    readonly error?: { readonly code?: string; readonly message?: string }
    readonly content?: readonly { readonly type: string; readonly text?: string }[]
    readonly meta?: unknown
  }
}

export interface ChatExternalStore {
  subscribe(listener: () => void): () => void
  getSnapshot(): ChatTargetSnapshot | undefined
}

export interface A2uiToolViewProps extends ToolViewOwnerProps {
  readonly chatStore?: ChatExternalStore | undefined
  readonly sendAction?: SurfaceActionCallback | undefined
  readonly openWorkspaceFile?: WorkspaceFileOpener | undefined
}

const NOOP_SUBSCRIBE = () => () => {}
const APPS_ICON_14 = <DshAppsIcon size={14} />

export const A2uiToolView = memo(function A2uiToolView({
  callId,
  phase,
  sessionId,
  block,
  inspect,
  openFile,
  chatStore,
  sendAction,
  openWorkspaceFile,
}: A2uiToolViewProps) {
  const effectiveOpenFile = useMemo<WorkspaceFileOpener | undefined>(() => {
    if (typeof openFile === 'function') {
      return (rawPath: string, explicitLine?: number) => {
        const target = parseFileTarget(rawPath, explicitLine)
        if (!target) return
        if (isAbsoluteWorkspacePath(target.path)) {
          openWorkspaceFile?.(target.path, target.line)
          return
        }
        try {
          void Promise.resolve(
            openFile(target.path, target.line !== undefined ? { line: target.line } : undefined),
          ).catch(() => {})
        } catch {}
      }
    }
    return openWorkspaceFile
  }, [openFile, openWorkspaceFile])
  const [expanded, setExpanded] = useState(false)
  const [inlineOpen, setInlineOpen] = useState(true)

  const argTitle = block.args?.text('title')?.trim() || undefined
  const argUi = block.args?.text('ui') ?? ''
  const argPlacement = normalizePlacement(block.args?.text('placement'))

  const settledMeta = useMemo(
    () => (phase === 'result' && !block.isError ? parseRenderMeta(block.meta) : null),
    [phase, block.isError, block.meta],
  )

  const placement = settledMeta?.placement ?? argPlacement

  const needsChatReplay = useMemo(() => {
    if (phase !== 'result') return true
    return settledMeta !== null && placement === 'inline'
  }, [phase, settledMeta, placement])

  const subscribe = useCallback(
    (listener: () => void) =>
      needsChatReplay && chatStore ? chatStore.subscribe(listener) : NOOP_SUBSCRIBE(),
    [chatStore, needsChatReplay],
  )
  const getSnapshot = useCallback(
    () => (needsChatReplay ? chatStore?.getSnapshot() : undefined),
    [chatStore, needsChatReplay],
  )
  const chatSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const streamingSnapshot = useLazyStreamingExpress(
    phase !== 'result',
    argUi,
    phase === 'start',
    callId,
  )

  const visibleIds = useMemo(() => {
    const streamIds = streamingSnapshot?.surfaceIds ?? []
    return streamIds.length > 0 ? new Set(streamIds) : undefined
  }, [streamingSnapshot])

  const settledVisibleIds = useMemo(() => {
    const ids = settledMeta?.surfaceIds ?? []
    return ids.length > 0 ? new Set(ids) : undefined
  }, [settledMeta])

  const callSeq = useMemo(() => findCallSeq(chatSnapshot, callId), [chatSnapshot, callId])

  const liveMessages = useMemo(() => {
    if (settledMeta !== null) {
      return buildReplayMessagesForSurfaceCall(
        chatSnapshot,
        settledMeta.messages,
        settledMeta.surfaceIds,
        callSeq,
      )
    }
    if (phase !== 'result') {
      return buildReplayMessagesForSurfaceCall(
        chatSnapshot,
        streamingSnapshot?.messages ?? [],
        streamingSnapshot?.surfaceIds ?? [],
        callSeq,
      )
    }
    return []
  }, [callSeq, chatSnapshot, phase, settledMeta, streamingSnapshot])

  const msg = useShellMessages()
  const title = settledMeta?.title ?? argTitle ?? 'A2UI'

  const inlineSupersededIds = useMemo(
    () =>
      placement === 'inline' && phase === 'result' && settledMeta !== null
        ? resolveSupersededSurfaceIdsAfterCall(chatSnapshot, settledMeta.surfaceIds, callSeq)
        : undefined,
    [callSeq, chatSnapshot, phase, placement, settledMeta],
  )

  if (phase === 'result' && block.isError) {
    const stopped = block.error?.code === 'interrupted'
    const reason = (block.content ?? [])
      .flatMap((c) => (c.type === 'text' && typeof c.text === 'string' ? [c.text] : []))
      .join('\n')
    const hasReason = reason.trim() !== ''
    return (
      <div data-tool="a2ui_render" data-state={stopped ? 'stopped' : 'error'}>
        <DshDisclosureRow
          icon={APPS_ICON_14}
          title="A2UI"
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

  if (placement === 'dock' && phase === 'result') {
    const hasSource = argUi.trim() !== ''
    return (
      <div data-tool="a2ui_render" data-placement="dock" data-state="docked">
        <DshDisclosureRow
          icon={APPS_ICON_14}
          title="A2UI"
          running={false}
          open={expanded && hasSource}
          expandable={hasSource}
          expandOnRowClick={true}
          keepContentWhenOpen={true}
          onToggle={() => setExpanded((v) => !v)}
          collapsedContent={
            <span className={css.rowSummary}>
              <span>{msg.pinnedToDock}</span>
              <span className={css.rowTitle}>{title}</span>
            </span>
          }
        >
          <pre className={css.reason}>{argUi}</pre>
          {inspect ? (
            <button type="button" className={css.inspectBtn} onClick={inspect}>
              {msg.inspectCall}
            </button>
          ) : null}
        </DshDisclosureRow>
      </div>
    )
  }

  if (placement === 'inline' && phase === 'result' && settledMeta !== null) {
    const allInlineSuperseded =
      inlineSupersededIds !== undefined &&
      settledMeta.surfaceIds.length > 0 &&
      settledMeta.surfaceIds.every((id) => inlineSupersededIds.has(id))
    return (
      <div
        data-tool="a2ui_render"
        data-placement="inline"
        data-state={allInlineSuperseded ? 'inline-superseded' : 'inline-settled'}
      >
        <DshDisclosureRow
          icon={APPS_ICON_14}
          title={msg.inlineCardTitle}
          running={false}
          open={inlineOpen}
          expandable={true}
          expandOnRowClick={false}
          keepContentWhenOpen={true}
          onToggle={() => setInlineOpen((v) => !v)}
          collapsedContent={
            <span className={css.rowSummary}>
              <span>{msg.inlineSurface}</span>
              <span className={css.rowTitle}>{title}</span>
            </span>
          }
        >
          <LazySurfaceGroupView
            messages={liveMessages}
            visibleSurfaceIds={settledVisibleIds}
            sessionId={sessionId}
            variant="bare"
            streaming={false}
            readOnly={allInlineSuperseded}
            readOnlySurfaceIds={
              inlineSupersededIds && inlineSupersededIds.size > 0 ? inlineSupersededIds : undefined
            }
            onAction={sendAction}
            openWorkspaceFile={effectiveOpenFile}
          />
        </DshDisclosureRow>
      </div>
    )
  }

  if (phase !== 'result' || chatStore === undefined) {
    return (
      <div
        data-tool="a2ui_render"
        data-placement={placement}
        data-state={phase === 'result' ? 'live-settled' : 'streaming'}
      >
        <LazySurfaceGroupView
          messages={liveMessages}
          visibleSurfaceIds={phase !== 'result' ? visibleIds : settledVisibleIds}
          title={title}
          sessionId={sessionId}
          streaming={phase !== 'result'}
          readOnly={phase !== 'result'}
          onAction={sendAction}
          openWorkspaceFile={effectiveOpenFile}
        />
      </div>
    )
  }

  const hasSource = argUi.trim() !== ''
  return (
    <div data-tool="a2ui_render" data-placement={placement} data-state="ok">
      <DshDisclosureRow
        icon={APPS_ICON_14}
        title="A2UI"
        running={false}
        open={expanded && hasSource}
        expandable={hasSource}
        expandOnRowClick={true}
        keepContentWhenOpen={true}
        onToggle={() => setExpanded((v) => !v)}
        collapsedContent={
          <span className={css.rowSummary}>
            <span>{msg.rendered}</span>
            <span className={css.rowTitle}>{title}</span>
          </span>
        }
      >
        <pre className={css.reason}>{argUi}</pre>
        {inspect ? (
          <button type="button" className={css.inspectBtn} onClick={inspect}>
            {msg.inspectCall}
          </button>
        ) : null}
      </DshDisclosureRow>
    </div>
  )
})
