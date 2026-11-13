/**
 * Persistent cross-turn workspace dock mounted in `conversation.input.dock`.
 *
 * Surfaces rendered with `a2ui_render({ placement: "dock", ... })` stay pinned
 * right above the chat composer across turns and update live in place whenever
 * a later turn calls `surface("id", update=true)`. Users can collapse or dismiss
 * the dock; if dismissed, a newer docked update (`latestSeq > dismissedSeq`)
 * automatically surfaces the updated panel again.
 */
import { memo, useCallback, useMemo, useSyncExternalStore } from 'react'
import {
  dismissDockAtSeq,
  getDockUiState,
  setDockCollapsed,
  subscribeDockUi,
} from './persistence.ts'
import { LazySurfaceGroupView } from './LazySurfaceGroupView.tsx'
import type { SurfaceActionCallback } from './SurfaceView.tsx'
import type { WorkspaceFileOpener } from './file-opener.tsx'
import type { ChatExternalStore } from './ToolView.tsx'
import { resolveDockBatch } from './turn-surfaces.ts'
import { DshAppsIcon, DshChevronDownIcon, DshChevronUpIcon } from './ui/primitives.tsx'
import css from './DockView.module.css'

export interface A2uiDockViewProps {
  readonly sessionId?: string | undefined
  readonly chatStore?: ChatExternalStore | undefined
  readonly sendAction?: SurfaceActionCallback | undefined
  readonly openWorkspaceFile?: WorkspaceFileOpener | undefined
}

const NOOP_SUBSCRIBE = () => () => {}

export const A2uiDockView = memo(function A2uiDockView({
  sessionId,
  chatStore,
  sendAction,
  openWorkspaceFile,
}: A2uiDockViewProps) {
  const subscribeChat = useCallback(
    (listener: () => void) => (chatStore ? chatStore.subscribe(listener) : NOOP_SUBSCRIBE()),
    [chatStore],
  )
  const getChatSnapshot = useCallback(() => chatStore?.getSnapshot(), [chatStore])
  const snapshot = useSyncExternalStore(subscribeChat, getChatSnapshot, () => undefined)

  const getUiState = useCallback(() => getDockUiState(sessionId), [sessionId])
  const uiState = useSyncExternalStore(subscribeDockUi, getUiState, () => getDockUiState(undefined))

  const batch = useMemo(() => resolveDockBatch(snapshot), [snapshot])

  if (batch === null || batch.messages.length === 0) return null
  if (uiState.dismissedSeq >= batch.latestSeq) return null

  const collapsed = uiState.collapsed
  const title = batch.title ?? 'A2UI 常驻工作台'

  const toggleCollapsed = () => {
    if (sessionId) setDockCollapsed(sessionId, !collapsed)
  }

  const handleDismiss = () => {
    if (sessionId) dismissDockAtSeq(sessionId, batch.latestSeq)
  }

  return (
    <section
      className={css.root}
      data-a2ui-dock=""
      data-collapsed={collapsed || undefined}
      aria-label={title}
    >
      <div className={css.header}>
        <button
          type="button"
          className={css.toggleBtn}
          aria-expanded={!collapsed}
          onClick={toggleCollapsed}
          data-a2ui-dock-toggle=""
        >
          <span className={css.leadIcon} aria-hidden="true">
            <DshAppsIcon size={14} />
          </span>
          <span className={css.title}>{title}</span>
          <span className={css.tag}>常驻工作台</span>
        </button>
        <div className={css.actions}>
          <button
            type="button"
            className={css.iconBtn}
            aria-label={collapsed ? '展开工作台' : '收起工作台'}
            title={collapsed ? '展开工作台' : '收起工作台'}
            onClick={toggleCollapsed}
          >
            {collapsed ? <DshChevronUpIcon size={14} /> : <DshChevronDownIcon size={14} />}
          </button>
          <button
            type="button"
            className={css.iconBtn}
            aria-label="关闭常驻工作台"
            title="关闭常驻工作台（后续更新时将重新显示）"
            onClick={handleDismiss}
            data-a2ui-dock-dismiss=""
          >
            ✕
          </button>
        </div>
      </div>
      {!collapsed ? (
        <div className={css.body} data-a2ui-dock-body="">
          <LazySurfaceGroupView
            messages={batch.messages}
            visibleSurfaceIds={batch.visibleSurfaceIds}
            sessionId={sessionId}
            variant="bare"
            streaming={false}
            onAction={sendAction}
            openWorkspaceFile={openWorkspaceFile}
          />
        </div>
      ) : null}
    </section>
  )
})
