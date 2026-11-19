/**
 * Lightweight lazy bridge for `SurfaceGroupView` and `StreamingExpressSession`
 * so the main `lib/client.js` startup bundle stays ultra-small (`< 50 kB`) and
 * only loads `lib/client.runtime.js` when an A2UI surface is mounted or streamed.
 */
import { memo, useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  getLoadedRuntimeChunk,
  getRuntimeChunkServerSnapshot,
  subscribeRuntimeChunk,
  type RuntimeChunkModule,
} from './chunk-loader.ts'
import { useShellMessages } from './i18n.ts'
import type { StreamingCompileSnapshot, StreamingExpressSession } from './streaming.ts'
import type { SurfaceGroupViewProps } from './SurfaceView.tsx'
import css from './SurfaceView.module.css'

const SKELETON_BLOCK = <div className={css.skeletonBlock} />

export function useRuntimeChunk(enabled = true): RuntimeChunkModule | null {
  const subscribe = useCallback(
    (listener: () => void) => subscribeRuntimeChunk(enabled, listener),
    [enabled],
  )
  return useSyncExternalStore(subscribe, getLoadedRuntimeChunk, getRuntimeChunkServerSnapshot)
}

export function useLazyStreamingExpress(
  active: boolean,
  ui: string,
  complete: boolean,
  sessionKey = 'default',
): StreamingCompileSnapshot | null {
  const runtime = useRuntimeChunk(active)
  const ref = useRef<{ key: string; session: StreamingExpressSession } | null>(null)

  return useMemo(() => {
    if (!active || runtime === null) return null
    if (ref.current === null || ref.current.key !== sessionKey) {
      ref.current = {
        key: sessionKey,
        session: new runtime.StreamingExpressSession(),
      }
    }
    return ref.current.session.advance(ui, complete)
  }, [active, runtime, ui, complete, sessionKey])
}

export const LazySurfaceGroupView = memo(function LazySurfaceGroupView(
  props: SurfaceGroupViewProps,
) {
  const msg = useShellMessages()
  const runtime = useRuntimeChunk(true)
  if (runtime === null) {
    return (
      <div
        className={css.skeletonWrap}
        role="status"
        aria-busy="true"
        aria-label={msg.loadingRuntime}
      >
        {SKELETON_BLOCK}
      </div>
    )
  }
  const Impl = runtime.SurfaceGroupView
  return <Impl {...props} />
})
