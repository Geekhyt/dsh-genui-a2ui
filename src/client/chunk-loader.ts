import type * as EchartsChunk from './chunks/echarts-chunk.ts'
import type * as MermaidChunk from './chunks/mermaid-chunk.ts'
import type * as RuntimeChunk from './chunks/runtime-chunk.ts'
import type * as StreamingChunk from './chunks/streaming-chunk.ts'
import { notifySubscribers } from './notify.ts'
import { isPluginStylesMounted } from './style-lifecycle.ts'

declare const __DSH_BUNDLED_CLIENT__: boolean | undefined
declare const require: ((id: string) => unknown) & {
  async: (chunk: string) => Promise<unknown>
}

export type RuntimeChunkModule = typeof RuntimeChunk
export type StreamingChunkModule = typeof StreamingChunk
export type EchartsChunkModule = typeof EchartsChunk
export type MermaidChunkModule = typeof MermaidChunk

export const RUNTIME_LOAD_ERROR_SENTINEL = '__RUNTIME_LOAD_FAILED__'
export const STREAMING_LOAD_ERROR_SENTINEL = '__STREAMING_LOAD_FAILED__'
export const CHART_LOAD_ERROR_SENTINEL = '__CHART_LOAD_FAILED__'
export const MERMAID_RENDER_ERROR_SENTINEL = '__MERMAID_RENDER_FAILED__'

export interface LazyChunkSnapshot<T> {
  readonly chunk: T | null
  readonly error: string | null
}

export type RuntimeChunkSnapshot = LazyChunkSnapshot<RuntimeChunkModule>
export type StreamingChunkSnapshot = LazyChunkSnapshot<StreamingChunkModule>
export type EchartsChunkSnapshot = LazyChunkSnapshot<EchartsChunkModule>

interface LazyChunkStore<T> {
  getLoaded(): T | null
  getSnapshot(): LazyChunkSnapshot<T>
  getServerSnapshot(): LazyChunkSnapshot<T>
  load(): Promise<T>
  retry(): void
  subscribe(enabled: boolean, listener: () => void): () => void
}

function createLazyChunkStore<T>(options: {
  readonly loadBundled: () => Promise<T>
  readonly importDev: () => Promise<T>
  readonly errorSentinel: string
  readonly warnLabel?: string
  readonly onLoaded?: (mod: T) => void
  readonly serverSnapshotReturnsLoaded?: boolean
}): LazyChunkStore<T> {
  const pendingSnapshot: LazyChunkSnapshot<T> = Object.freeze({ chunk: null, error: null })
  let moduleSync: T | null = null
  let inflightPromise: Promise<T> | null = null
  let snapshot: LazyChunkSnapshot<T> = pendingSnapshot
  const listeners = new Set<() => void>()

  const load = (): Promise<T> => {
    if (moduleSync !== null) {
      options.onLoaded?.(moduleSync)
      return Promise.resolve(moduleSync)
    }
    if (inflightPromise === null) {
      if (snapshot.error !== null) {
        snapshot = pendingSnapshot
        notifySubscribers(listeners, 'Chunk store')
      }
      const rawPromise = Promise.resolve().then(() =>
        typeof __DSH_BUNDLED_CLIENT__ !== 'undefined' && __DSH_BUNDLED_CLIENT__
          ? options.loadBundled()
          : options.importDev(),
      )
      inflightPromise = rawPromise.then(
        (mod) => {
          moduleSync = mod
          snapshot = Object.freeze({ chunk: mod, error: null })
          options.onLoaded?.(mod)
          notifySubscribers(listeners, 'Chunk store')
          return mod
        },
        (err: unknown) => {
          inflightPromise = null
          if (listeners.size > 0) {
            const errMsg = err instanceof Error && err.message ? err.message : options.errorSentinel
            snapshot = Object.freeze({ chunk: null, error: errMsg })
            notifySubscribers(listeners, 'Chunk store')
          } else {
            snapshot = pendingSnapshot
          }
          throw err
        },
      )
    }
    return inflightPromise
  }

  const logFailure = (verb: string, err: unknown) => {
    if (options.warnLabel) {
      console.warn(`[dsh-genui-a2ui] failed to ${verb} ${options.warnLabel}:`, err)
    }
  }

  return {
    getLoaded: () => moduleSync,
    getSnapshot: () => snapshot,
    getServerSnapshot: () =>
      options.serverSnapshotReturnsLoaded && moduleSync !== null ? snapshot : pendingSnapshot,
    load,
    retry: () => {
      if (moduleSync !== null || inflightPromise !== null) return
      load().catch((err: unknown) => logFailure('retry', err))
    },
    subscribe: (enabled: boolean, listener: () => void) => {
      if (!enabled) return () => {}
      listeners.add(listener)
      if (moduleSync === null && inflightPromise === null && snapshot.error === null) {
        load().catch((err: unknown) => logFailure('load', err))
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && snapshot.error !== null && inflightPromise === null) {
          snapshot = pendingSnapshot
        }
      }
    },
  }
}

const runtimeStore = /* @__PURE__ */ createLazyChunkStore<RuntimeChunkModule>({
  loadBundled: () => require.async('./client.runtime.js') as Promise<RuntimeChunkModule>,
  importDev: () => import('./chunks/runtime-chunk.ts'),
  errorSentinel: RUNTIME_LOAD_ERROR_SENTINEL,
  warnLabel: 'client.runtime.js',
  onLoaded: (mod) => {
    if (isPluginStylesMounted()) mod.ensureA2uiRuntimeStyles()
  },
  serverSnapshotReturnsLoaded: true,
})

export function getLoadedRuntimeChunk(): RuntimeChunkModule | null {
  return runtimeStore.getLoaded()
}

export function getRuntimeChunkServerSnapshot(): RuntimeChunkModule | null {
  return runtimeStore.getLoaded()
}

export function getRuntimeChunkSnapshot(): RuntimeChunkSnapshot {
  return runtimeStore.getSnapshot()
}

export function getRuntimeChunkStateServerSnapshot(): RuntimeChunkSnapshot {
  return runtimeStore.getServerSnapshot()
}

export function loadRuntimeChunk(): Promise<RuntimeChunkModule> {
  return runtimeStore.load()
}

export function retryRuntimeChunk(): void {
  runtimeStore.retry()
}

export function subscribeRuntimeChunk(enabled: boolean, listener: () => void): () => void {
  return runtimeStore.subscribe(enabled, listener)
}

const streamingStore = /* @__PURE__ */ createLazyChunkStore<StreamingChunkModule>({
  loadBundled: () => require.async('./client.streaming.js') as Promise<StreamingChunkModule>,
  importDev: () => import('./chunks/streaming-chunk.ts'),
  errorSentinel: STREAMING_LOAD_ERROR_SENTINEL,
  warnLabel: 'client.streaming.js',
  serverSnapshotReturnsLoaded: true,
})

export function getLoadedStreamingChunk(): StreamingChunkModule | null {
  return streamingStore.getLoaded()
}

export function getStreamingChunkSnapshot(): StreamingChunkSnapshot {
  return streamingStore.getSnapshot()
}

export function getStreamingChunkServerSnapshot(): StreamingChunkSnapshot {
  return streamingStore.getServerSnapshot()
}

export function loadStreamingChunk(): Promise<StreamingChunkModule> {
  return streamingStore.load()
}

export function retryStreamingChunk(): void {
  streamingStore.retry()
}

export function subscribeStreamingChunk(enabled: boolean, listener: () => void): () => void {
  return streamingStore.subscribe(enabled, listener)
}

const echartsStore = /* @__PURE__ */ createLazyChunkStore<EchartsChunkModule>({
  loadBundled: () => require.async('./client.echarts.js') as Promise<EchartsChunkModule>,
  importDev: () => import('./chunks/echarts-chunk.ts'),
  errorSentinel: CHART_LOAD_ERROR_SENTINEL,
})

export function getLoadedEchartsChunk(): EchartsChunkModule | null {
  return echartsStore.getLoaded()
}

export function getEchartsChunkSnapshot(): EchartsChunkSnapshot {
  return echartsStore.getSnapshot()
}

export function getEchartsChunkServerSnapshot(): EchartsChunkSnapshot {
  return echartsStore.getServerSnapshot()
}

export function loadEchartsChunk(): Promise<EchartsChunkModule> {
  return echartsStore.load()
}

export function retryEchartsChunk(): void {
  echartsStore.retry()
}

export function subscribeEchartsChunk(listener: () => void): () => void {
  return echartsStore.subscribe(true, listener)
}

export interface MermaidDiagramSnapshot {
  readonly svg: string | null
  readonly error: string | null
  readonly rendering: boolean
}

export const MAX_MERMAID_CACHE_ENTRIES = 64
const MERMAID_DEBOUNCE_MS = 90

const EMPTY_MERMAID_SNAPSHOT: MermaidDiagramSnapshot = /* @__PURE__ */ Object.freeze({
  svg: null,
  error: null,
  rendering: false,
})

const PENDING_MERMAID_SNAPSHOT: MermaidDiagramSnapshot = /* @__PURE__ */ Object.freeze({
  svg: null,
  error: null,
  rendering: true,
})

let mermaidModuleSync: MermaidChunkModule | null = null
let mermaidPromise: Promise<MermaidChunkModule> | null = null
const mermaidDiagramCache = /* @__PURE__ */ new Map<string, MermaidDiagramSnapshot>()
const mermaidListenersByKey = /* @__PURE__ */ new Map<string, Set<() => void>>()
const mermaidTargetsByKey = /* @__PURE__ */ new Map<string, Set<() => HTMLElement | null>>()
const mermaidTimersByKey = /* @__PURE__ */ new Map<string, ReturnType<typeof setTimeout>>()
const mermaidInflightKeys = /* @__PURE__ */ new Set<string>()

function resolveLiveMermaidTarget(key: string): HTMLElement | null {
  const targets = mermaidTargetsByKey.get(key)
  if (!targets) return null
  for (const getter of targets) {
    try {
      const el = getter()
      if (el !== null && el.isConnected !== false) return el
    } catch {}
  }
  return null
}

function mermaidCacheKey(code: string, dark: boolean): string {
  return `${dark ? '1' : '0'}::${code}`
}

function trimIdleMermaidCache(protectedKey?: string): void {
  while (mermaidDiagramCache.size > MAX_MERMAID_CACHE_ENTRIES) {
    let victim: string | undefined
    for (const candidate of mermaidDiagramCache.keys()) {
      if (candidate === protectedKey) continue
      if ((mermaidListenersByKey.get(candidate)?.size ?? 0) === 0) {
        victim = candidate
        break
      }
    }
    if (victim === undefined) break
    mermaidDiagramCache.delete(victim)
  }
}

function storeMermaidSnapshot(key: string, snapshot: MermaidDiagramSnapshot): void {
  mermaidDiagramCache.delete(key)
  mermaidDiagramCache.set(key, Object.freeze(snapshot))
  trimIdleMermaidCache(key)
  const listeners = mermaidListenersByKey.get(key)
  if (listeners) notifySubscribers(listeners, 'Chunk store')
}

function startMermaidRender(key: string, code: string, dark: boolean): void {
  if ((mermaidListenersByKey.get(key)?.size ?? 0) === 0) return
  if (mermaidInflightKeys.has(key)) return
  const existing = mermaidDiagramCache.get(key)
  if (existing !== undefined && existing.error === null) return
  mermaidInflightKeys.add(key)
  const shouldProceed = () => (mermaidListenersByKey.get(key)?.size ?? 0) > 0
  loadMermaidChunk()
    .then((mod) => {
      if (!shouldProceed()) return null
      return mod.renderMermaidDiagram(code, dark, resolveLiveMermaidTarget(key), shouldProceed)
    })
    .then(
      (renderedSvg) => {
        mermaidInflightKeys.delete(key)
        if (renderedSvg === null) {
          if (shouldProceed()) {
            startMermaidRender(key, code, dark)
          }
          return
        }
        if (!shouldProceed()) return
        storeMermaidSnapshot(key, {
          svg: renderedSvg,
          error: null,
          rendering: false,
        })
      },
      (err: unknown) => {
        mermaidInflightKeys.delete(key)
        if (!shouldProceed()) return
        const errMsg =
          err instanceof Error && err.message ? err.message : MERMAID_RENDER_ERROR_SENTINEL
        storeMermaidSnapshot(key, {
          svg: null,
          error: errMsg,
          rendering: false,
        })
      },
    )
}

export function retryMermaidDiagram(code: string, dark: boolean): void {
  if (code === '') return
  const key = mermaidCacheKey(code, dark)
  if (mermaidInflightKeys.has(key)) return
  const listeners = mermaidListenersByKey.get(key)
  if (!listeners || listeners.size === 0) return
  const pendingTimer = mermaidTimersByKey.get(key)
  if (pendingTimer !== undefined) {
    clearTimeout(pendingTimer)
    mermaidTimersByKey.delete(key)
  }
  mermaidDiagramCache.delete(key)
  startMermaidRender(key, code, dark)
  notifySubscribers(listeners, 'Chunk store')
}

export function loadMermaidChunk(): Promise<MermaidChunkModule> {
  if (mermaidModuleSync !== null) return Promise.resolve(mermaidModuleSync)
  if (mermaidPromise === null) {
    const rawPromise = Promise.resolve().then(() =>
      typeof __DSH_BUNDLED_CLIENT__ !== 'undefined' && __DSH_BUNDLED_CLIENT__
        ? (require.async('./client.mermaid.js') as Promise<MermaidChunkModule>)
        : import('./chunks/mermaid-chunk.ts'),
    )
    mermaidPromise = rawPromise.then(
      (mod) => {
        mermaidModuleSync = mod
        return mod
      },
      (err) => {
        mermaidPromise = null
        throw err
      },
    )
  }
  return mermaidPromise
}

export function getMermaidDiagramSnapshot(code: string, dark: boolean): MermaidDiagramSnapshot {
  if (code === '') return EMPTY_MERMAID_SNAPSHOT
  const key = mermaidCacheKey(code, dark)
  const hit = mermaidDiagramCache.get(key)
  if (hit !== undefined) return hit
  return PENDING_MERMAID_SNAPSHOT
}

export function getMermaidDiagramServerSnapshot(code: string): MermaidDiagramSnapshot {
  return code === '' ? EMPTY_MERMAID_SNAPSHOT : PENDING_MERMAID_SNAPSHOT
}

export function subscribeMermaidDiagram(
  code: string,
  dark: boolean,
  getTarget: () => HTMLElement | null,
  listener: () => void,
): () => void {
  if (code === '') return () => {}
  const key = mermaidCacheKey(code, dark)

  let set = mermaidListenersByKey.get(key)
  if (!set) {
    set = new Set()
    mermaidListenersByKey.set(key, set)
  }
  set.add(listener)

  let targets = mermaidTargetsByKey.get(key)
  if (!targets) {
    targets = new Set()
    mermaidTargetsByKey.set(key, targets)
  }
  targets.add(getTarget)

  const existing = mermaidDiagramCache.get(key)
  if (existing !== undefined && existing.error === null) {
    mermaidDiagramCache.delete(key)
    mermaidDiagramCache.set(key, existing)
  } else {
    let evictedError = false
    if (existing !== undefined && existing.error !== null) {
      mermaidDiagramCache.delete(key)
      evictedError = true
    }
    if (!mermaidInflightKeys.has(key) && !mermaidTimersByKey.has(key)) {
      const timer = setTimeout(() => {
        mermaidTimersByKey.delete(key)
        startMermaidRender(key, code, dark)
      }, MERMAID_DEBOUNCE_MS)
      ;(timer as unknown as { unref?: () => void }).unref?.()
      mermaidTimersByKey.set(key, timer)
    }
    if (evictedError && set.size > 1) {
      const siblings = new Set<() => void>()
      for (const fn of set) {
        if (fn !== listener) siblings.add(fn)
      }
      if (siblings.size > 0) notifySubscribers(siblings, 'Chunk store')
    }
  }

  return () => {
    const currentTargets = mermaidTargetsByKey.get(key)
    if (currentTargets) {
      currentTargets.delete(getTarget)
      if (currentTargets.size === 0) mermaidTargetsByKey.delete(key)
    }
    const currentSet = mermaidListenersByKey.get(key)
    if (!currentSet) return
    currentSet.delete(listener)
    if (currentSet.size === 0) {
      mermaidListenersByKey.delete(key)
      const pendingTimer = mermaidTimersByKey.get(key)
      if (pendingTimer !== undefined) {
        clearTimeout(pendingTimer)
        mermaidTimersByKey.delete(key)
      }
      const cached = mermaidDiagramCache.get(key)
      if (cached !== undefined && cached.error !== null) {
        mermaidDiagramCache.delete(key)
      }
      if (mermaidDiagramCache.size > MAX_MERMAID_CACHE_ENTRIES) {
        trimIdleMermaidCache()
      }
    }
  }
}

export function seedMermaidDiagramCacheForTests(code: string, dark: boolean, svg: string): void {
  storeMermaidSnapshot(mermaidCacheKey(code, dark), {
    svg,
    error: null,
    rendering: false,
  })
}

export function countMermaidDiagramCacheEntries(): number {
  return mermaidDiagramCache.size
}

export function resetMermaidDiagramCacheForTests(): void {
  for (const timer of mermaidTimersByKey.values()) {
    clearTimeout(timer)
  }
  mermaidTimersByKey.clear()
  mermaidInflightKeys.clear()
  mermaidListenersByKey.clear()
  mermaidTargetsByKey.clear()
  mermaidDiagramCache.clear()
}
