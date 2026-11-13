/**
 * Lightweight lazy bridge for `SurfaceGroupView` and `StreamingExpressSession`
 * so the main `lib/client.js` startup bundle stays ultra-small (`< 50 kB`) and
 * only loads `lib/client.runtime.js` when an A2UI surface is mounted or streamed.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  getLoadedRuntimeChunk,
  loadRuntimeChunk,
  type RuntimeChunkModule,
} from './chunk-loader.ts'
import type { StreamingExpressSession, StreamingCompileSnapshot } from './streaming.ts'
import type { SurfaceGroupViewProps } from './SurfaceView.tsx'
import css from './SurfaceView.module.css'

export function useRuntimeChunk(enabled = true): RuntimeChunkModule | null {
  const [mod, setMod] = useState<RuntimeChunkModule | null>(() => getLoadedRuntimeChunk())

  useEffect(() => {
    if (!enabled || mod !== null) return
    let cancelled = false
    loadRuntimeChunk().then(
      (loaded) => {
        if (!cancelled) setMod(loaded)
      },
      (err: unknown) => {
        console.warn('[dsh-genui-a2ui] failed to load client.runtime.js:', err)
      },
    )
    return () => {
      cancelled = true
    }
  }, [enabled, mod])

  return mod
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

export const LazySurfaceGroupView = memo(function LazySurfaceGroupView(props: SurfaceGroupViewProps) {
  const runtime = useRuntimeChunk(true)
  if (runtime === null) {
    return (
      <div className={css.skeletonWrap} aria-busy="true" aria-label="正在加载界面引擎…">
        <div className={css.skeletonBlock} />
      </div>
    )
  }
  const Impl = runtime.SurfaceGroupView
  return <Impl {...props} />
})
