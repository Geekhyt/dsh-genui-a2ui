import { memo, useCallback, useDeferredValue, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  getRuntimeChunkSnapshot,
  getRuntimeChunkStateServerSnapshot,
  getStreamingChunkServerSnapshot,
  getStreamingChunkSnapshot,
  RUNTIME_LOAD_ERROR_SENTINEL,
  type RuntimeChunkModule,
  type RuntimeChunkSnapshot,
  retryRuntimeChunk,
  type StreamingChunkModule,
  subscribeRuntimeChunk,
  subscribeStreamingChunk,
} from '../chunk-loader.ts'
import { useShellMessages } from '../i18n.ts'
import type { SurfaceGroupViewProps } from '../runtime/SurfaceView.tsx'
import type { StreamingCompileSnapshot, StreamingExpressSession } from '../runtime/streaming.ts'
import css from '../SurfaceView.module.css'

const SKELETON_BLOCK = <div className={css.skeletonBlock} />

export function useRuntimeChunkState(enabled = true): RuntimeChunkSnapshot {
  const subscribe = useCallback(
    (listener: () => void) => subscribeRuntimeChunk(enabled, listener),
    [enabled],
  )
  return useSyncExternalStore(
    subscribe,
    getRuntimeChunkSnapshot,
    getRuntimeChunkStateServerSnapshot,
  )
}

export function useRuntimeChunk(enabled = true): RuntimeChunkModule | null {
  return useRuntimeChunkState(enabled).chunk
}

export function useStreamingChunk(enabled = true): StreamingChunkModule | null {
  const subscribe = useCallback(
    (listener: () => void) => subscribeStreamingChunk(enabled, listener),
    [enabled],
  )
  return useSyncExternalStore(subscribe, getStreamingChunkSnapshot, getStreamingChunkServerSnapshot)
    .chunk
}

export function useLazyStreamingExpress(
  active: boolean,
  ui: string,
  complete: boolean,
  sessionKey = 'default',
): StreamingCompileSnapshot | null {
  const streamingMod = useStreamingChunk(active)
  const deferredUi = useDeferredValue(ui)
  const effectiveUi = complete ? ui : deferredUi
  const ref = useRef<{ key: string; session: StreamingExpressSession } | null>(null)

  return useMemo(() => {
    if (!active || streamingMod === null) {
      ref.current = null
      return null
    }
    if (ref.current === null || ref.current.key !== sessionKey) {
      ref.current = {
        key: sessionKey,
        session: new streamingMod.StreamingExpressSession(),
      }
    }
    return ref.current.session.advance(effectiveUi, complete)
  }, [active, streamingMod, effectiveUi, complete, sessionKey])
}

export const LazySurfaceGroupView = memo(function LazySurfaceGroupView(
  props: SurfaceGroupViewProps,
) {
  const msg = useShellMessages()
  const runtimeState = useRuntimeChunkState(true)
  if (runtimeState.error !== null) {
    const detail =
      runtimeState.error === RUNTIME_LOAD_ERROR_SENTINEL
        ? msg.loadingRuntimeFailed
        : `${msg.loadingRuntimeFailed}: ${runtimeState.error}`
    return (
      <div className={css.reason} role="alert" data-a2ui-runtime-error="">
        <span>{detail}</span>{' '}
        <button type="button" className={css.inspectBtn} onClick={retryRuntimeChunk}>
          {msg.retryLoad}
        </button>
      </div>
    )
  }
  if (runtimeState.chunk === null) {
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
  const Impl = runtimeState.chunk.SurfaceGroupView
  return <Impl {...props} />
})
