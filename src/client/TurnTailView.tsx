/**
 * Permanent post-answer A2UI surface card mounted in `conversation.chat.turnTail`.
 *
 * Once a turn finishes (`turn/end`), DSH collapses the turn's process rows (`Took Ns ⌄`).
 * Rendering settled `placement="answer"` A2UI surfaces in `turnTail` places them directly
 * beneath the assistant's prose reply, keeping them visible across future turns and
 * history replay. When a later turn updates the surface via `update=true`, the older
 * turn's snapshot automatically transitions to `readOnly` (`superseded = true`).
 */
import { memo, useCallback, useMemo, useSyncExternalStore } from 'react'
import type { WorkspaceFileOpener } from './file-opener.tsx'
import { useShellMessages } from './i18n.ts'
import { LazySurfaceGroupView } from './LazySurfaceGroupView.tsx'
import type { SurfaceActionCallback } from './SurfaceView.tsx'
import type { ChatExternalStore } from './ToolView.tsx'
import { resolveTurnTailBatch } from './turn-surfaces.ts'

export interface TurnTailViewProps {
  readonly turn: {
    readonly turn: number
    readonly status?: string
  }
  readonly seq: number
  readonly sessionId?: string | undefined
  readonly chatStore?: ChatExternalStore | undefined
  readonly sendAction?: SurfaceActionCallback | undefined
  readonly openWorkspaceFile?: WorkspaceFileOpener | undefined
}

const NOOP_SUBSCRIBE = () => () => {}

export const A2uiTurnTailView = memo(function A2uiTurnTailView({
  turn,
  sessionId,
  chatStore,
  sendAction,
  openWorkspaceFile,
}: TurnTailViewProps) {
  const msg = useShellMessages()
  const subscribe = useCallback(
    (listener: () => void) => (chatStore ? chatStore.subscribe(listener) : NOOP_SUBSCRIBE()),
    [chatStore],
  )
  const getSnapshot = useCallback(() => chatStore?.getSnapshot(), [chatStore])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => undefined)

  const batch = useMemo(
    () => resolveTurnTailBatch(snapshot, turn.turn),
    [snapshot, turn.turn],
  )

  if (batch === null || batch.messages.length === 0) return null

  return (
    <div data-a2ui-turn-tail={turn.turn} data-superseded={batch.superseded || undefined}>
      <LazySurfaceGroupView
        messages={batch.messages}
        visibleSurfaceIds={batch.visibleSurfaceIds}
        title={batch.title}
        sessionId={sessionId}
        streaming={false}
        readOnly={batch.superseded}
        readOnlyLabel={msg.readOnlySnapshot}
        onAction={sendAction}
        openWorkspaceFile={openWorkspaceFile}
      />
    </div>
  )
})
