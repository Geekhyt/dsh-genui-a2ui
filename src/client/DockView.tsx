import { memo, useCallback, useMemo, useState, useSyncExternalStore } from 'react'
import css from './DockView.module.css'
import type { WorkspaceFileOpener } from './file-opener.tsx'
import { useShellMessages } from './i18n.ts'
import { LazySurfaceGroupView } from './LazySurfaceGroupView.tsx'
import {
  dismissDockAtSeq,
  getDockUiState,
  setDockCollapsed,
  subscribeDockUi,
} from './persistence.ts'
import type { SurfaceActionCallback } from './SurfaceView.tsx'
import type { ChatExternalStore } from './ToolView.tsx'
import { resolveDockBatch } from './turn-surfaces.ts'
import { DshAppsIcon, DshChevronDownIcon, DshChevronUpIcon } from './ui/primitives.tsx'

export interface A2uiDockViewProps {
  readonly sessionId?: string | undefined
  readonly chatStore?: ChatExternalStore | undefined
  readonly sendAction?: SurfaceActionCallback | undefined
  readonly openWorkspaceFile?: WorkspaceFileOpener | undefined
}

const NOOP_SUBSCRIBE = () => () => {}
const APPS_ICON_14 = <DshAppsIcon size={14} />
const CHEVRON_UP_14 = <DshChevronUpIcon size={14} />
const CHEVRON_DOWN_14 = <DshChevronDownIcon size={14} />

export const A2uiDockView = memo(function A2uiDockView({
  sessionId,
  chatStore,
  sendAction,
  openWorkspaceFile,
}: A2uiDockViewProps) {
  const msg = useShellMessages()
  const [localCollapsed, setLocalCollapsed] = useState(false)
  const [localDismissedSeq, setLocalDismissedSeq] = useState(0)
  const subscribeChat = useCallback(
    (listener: () => void) => (chatStore ? chatStore.subscribe(listener) : NOOP_SUBSCRIBE()),
    [chatStore],
  )
  const getChatSnapshot = useCallback(() => chatStore?.getSnapshot(), [chatStore])
  const snapshot = useSyncExternalStore(subscribeChat, getChatSnapshot, getChatSnapshot)

  const getUiState = useCallback(() => getDockUiState(sessionId), [sessionId])
  const uiState = useSyncExternalStore(subscribeDockUi, getUiState, () => getDockUiState(undefined))

  const batch = useMemo(() => resolveDockBatch(snapshot), [snapshot])

  const effectiveDismissedSeq = sessionId ? uiState.dismissedSeq : localDismissedSeq
  if (batch === null || batch.messages.length === 0) return null
  if (effectiveDismissedSeq >= batch.latestSeq) return null

  const collapsed = sessionId ? uiState.collapsed : localCollapsed
  const title = batch.title ?? msg.dockDefaultTitle

  const toggleCollapsed = () => {
    if (sessionId) {
      setDockCollapsed(sessionId, !collapsed)
    } else {
      setLocalCollapsed((v) => !v)
    }
  }

  const handleDismiss = () => {
    if (sessionId) {
      dismissDockAtSeq(sessionId, batch.latestSeq)
    } else {
      setLocalDismissedSeq(batch.latestSeq)
    }
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
            {APPS_ICON_14}
          </span>
          <span className={css.title}>{title}</span>
          <span className={css.tag}>{msg.dockTag}</span>
        </button>
        <div className={css.actions}>
          <button
            type="button"
            className={css.iconBtn}
            tabIndex={-1}
            aria-hidden="true"
            title={collapsed ? msg.dockExpand : msg.dockCollapse}
            onClick={toggleCollapsed}
          >
            {collapsed ? CHEVRON_UP_14 : CHEVRON_DOWN_14}
          </button>
          <button
            type="button"
            className={css.iconBtn}
            aria-label={msg.dockClose}
            title={msg.dockCloseHint}
            onClick={handleDismiss}
            data-a2ui-dock-dismiss=""
          >
            ✕
          </button>
        </div>
      </div>
      <div
        className={css.body}
        data-a2ui-dock-body=""
        hidden={collapsed}
        style={collapsed ? { display: 'none' } : undefined}
      >
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
    </section>
  )
})
