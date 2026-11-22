import { memo, useCallback, useMemo, useSyncExternalStore } from 'react'
import type { WorkspaceFileOpener } from '../file-opener.tsx'
import { useShellMessages } from '../i18n.ts'
import { LazySurfaceGroupView } from './LazySurfaceGroupView.tsx'
import type { SurfaceActionCallback } from '../runtime/SurfaceView.tsx'
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
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const batch = useMemo(() => resolveTurnTailBatch(snapshot, turn.turn), [snapshot, turn.turn])

  if (batch === null || batch.messages.length === 0) return null

  return (
    <div data-a2ui-turn-tail={turn.turn} data-superseded={batch.superseded || undefined}>
      <LazySurfaceGroupView
        messages={batch.messages}
        visibleSurfaceIds={batch.visibleSurfaceIds}
        readOnlySurfaceIds={batch.supersededSurfaceIds}
        title={batch.title}
        sessionId={sessionId}
        streaming={false}
        readOnly={batch.allSuperseded}
        readOnlyLabel={msg.readOnlySnapshot}
        onAction={sendAction}
        openWorkspaceFile={openWorkspaceFile}
      />
    </div>
  )
})
