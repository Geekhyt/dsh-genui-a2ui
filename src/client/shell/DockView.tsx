import { memo, useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useEffectCallback } from '../dom-hooks.ts'
import css from './DockView.module.css'
import type { WorkspaceFileOpener } from '../file-opener.tsx'
import { useShellMessages } from '../i18n.ts'
import { LazySurfaceGroupView } from './LazySurfaceGroupView.tsx'
import {
  dismissDockAtSeq,
  getDockUiState,
  removeSurfaceDraftsBySurface,
  setDockCollapsed,
  subscribeDockUi,
} from '../persistence.ts'
import type { SurfaceActionCallback } from '../runtime/SurfaceView.tsx'
import type { ChatExternalStore } from './ToolView.tsx'
import { collectDeletedSurfaceIds, resolveDockBatch } from './turn-surfaces.ts'
import { useDarkTheme } from '../theme.ts'
import { DshAppsIcon, DshChevronDownIcon, DshChevronUpIcon } from '../ui/primitives.tsx'

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
  const dark = useDarkTheme()
  const [localCollapsed, setLocalCollapsed] = useState(false)
  const [localDismissedSeq, setLocalDismissedSeq] = useState(-1)
  const subscribeChat = useCallback(
    (listener: () => void) => (chatStore ? chatStore.subscribe(listener) : NOOP_SUBSCRIBE()),
    [chatStore],
  )
  const getChatSnapshot = useCallback(() => chatStore?.getSnapshot(), [chatStore])
  const snapshot = useSyncExternalStore(subscribeChat, getChatSnapshot, getChatSnapshot)

  const getUiState = useCallback(() => getDockUiState(sessionId), [sessionId])
  const uiState = useSyncExternalStore(subscribeDockUi, getUiState, () => getDockUiState(undefined))

  const batch = useMemo(() => resolveDockBatch(snapshot), [snapshot])
  const deletedSurfaceIds = useMemo(() => collectDeletedSurfaceIds(snapshot), [snapshot])
  const prevDeletedIdsRef = useRef<ReadonlySet<string> | null>(null)

  useEffectCallback(() => {
    if (sessionId && deletedSurfaceIds.size > 0) {
      const prevDeleted = prevDeletedIdsRef.current
      for (const delId of deletedSurfaceIds) {
        if (
          !batch?.visibleSurfaceIds.has(delId) &&
          (prevDeleted === null || !prevDeleted.has(delId))
        ) {
          removeSurfaceDraftsBySurface(sessionId, delId)
        }
      }
    }
    prevDeletedIdsRef.current = deletedSurfaceIds
    return undefined
  }, [batch, deletedSurfaceIds, sessionId])

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
      className={`${css.root} ${dark ? 'a2ui-dark' : 'a2ui-light'}`}
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
          key={sessionId ?? 'local'}
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
