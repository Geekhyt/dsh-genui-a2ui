import { memo, useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import { normalizePlacement } from '../shared/constants.ts'
import { parseFileTarget, type WorkspaceFileOpener } from './file-opener.tsx'
import { useShellMessages } from './i18n.ts'
import { LazySurfaceGroupView, useLazyStreamingExpress } from './LazySurfaceGroupView.tsx'
import css from './SurfaceView.module.css'
import type { SurfaceActionCallback } from './SurfaceView.tsx'
import {
  type ChatTargetSnapshot,
  filterMessagesBySurfaceIds,
  isTurnClosedForCall,
  parseRenderMeta,
  resolveSessionMessages,
} from './turn-surfaces.ts'
import { DshAppsIcon, DshDisclosureRow } from './ui/primitives.tsx'

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
        void openFile(target.path, target.line !== undefined ? { line: target.line } : undefined)
      }
    }
    return openWorkspaceFile
  }, [openFile, openWorkspaceFile])
  const [expanded, setExpanded] = useState(false)
  const [inlineOpen, setInlineOpen] = useState(true)

  const subscribe = useCallback(
    (listener: () => void) => (chatStore ? chatStore.subscribe(listener) : NOOP_SUBSCRIBE()),
    [chatStore],
  )
  const getSnapshot = useCallback(() => chatStore?.getSnapshot(), [chatStore])
  const chatSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const turnClosed = useMemo(
    () => isTurnClosedForCall(chatSnapshot, callId),
    [chatSnapshot, callId],
  )

  const argTitle = block.args?.text('title')?.trim() || undefined
  const argUi = block.args?.text('ui') ?? ''
  const argPlacement = normalizePlacement(block.args?.text('placement'))

  const settledMeta = useMemo(
    () => (phase === 'result' && !block.isError ? parseRenderMeta(block.meta) : null),
    [phase, block.isError, block.meta],
  )

  const placement = settledMeta?.placement ?? argPlacement

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

  const liveMessages = useMemo(() => {
    const priorForStream =
      phase !== 'result' && visibleIds !== undefined
        ? filterMessagesBySurfaceIds(resolveSessionMessages(chatSnapshot), visibleIds)
        : []
    const currentMsgs =
      settledMeta !== null ? settledMeta.messages : (streamingSnapshot?.messages ?? [])
    return priorForStream.length > 0 ? [...priorForStream, ...currentMsgs] : currentMsgs
  }, [chatSnapshot, phase, settledMeta, streamingSnapshot, visibleIds])

  const msg = useShellMessages()
  const title = settledMeta?.title ?? argTitle ?? 'A2UI'

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
    return (
      <div data-tool="a2ui_render" data-placement="inline" data-state="inline-settled">
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
            messages={settledMeta.messages}
            sessionId={sessionId}
            variant="bare"
            streaming={false}
            onAction={sendAction}
            openWorkspaceFile={effectiveOpenFile}
          />
        </DshDisclosureRow>
      </div>
    )
  }

  if (phase !== 'result' || (chatStore === undefined && !turnClosed)) {
    return (
      <div
        data-tool="a2ui_render"
        data-placement={placement}
        data-state={phase === 'result' ? 'live-settled' : 'streaming'}
      >
        <LazySurfaceGroupView
          messages={liveMessages}
          visibleSurfaceIds={phase !== 'result' ? visibleIds : undefined}
          title={title}
          sessionId={sessionId}
          streaming={phase !== 'result'}
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
