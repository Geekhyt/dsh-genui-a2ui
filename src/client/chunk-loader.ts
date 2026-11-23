import type * as EchartsChunk from './chunks/echarts-chunk.ts'
import type * as MermaidChunk from './chunks/mermaid-chunk.ts'
import type * as RuntimeChunk from './chunks/runtime-chunk.ts'
import { notifySubscribers } from './notify.ts'
import { isPluginStylesMounted } from './style-lifecycle.ts'

declare const __DSH_BUNDLED_CLIENT__: boolean | undefined
declare const require: ((id: string) => unknown) & {
  async: (chunk: string) => Promise<unknown>
}

export type RuntimeChunkModule = typeof RuntimeChunk
export type EchartsChunkModule = typeof EchartsChunk
export type MermaidChunkModule = typeof MermaidChunk

export const RUNTIME_LOAD_ERROR_SENTINEL = '__RUNTIME_LOAD_FAILED__'
export const CHART_LOAD_ERROR_SENTINEL = '__CHART_LOAD_FAILED__'
export const MERMAID_RENDER_ERROR_SENTINEL = '__MERMAID_RENDER_FAILED__'

export interface RuntimeChunkSnapshot {
  readonly chunk: RuntimeChunkModule | null
  readonly error: string | null
}

const PENDING_RUNTIME_SNAPSHOT: RuntimeChunkSnapshot = /* @__PURE__ */ Object.freeze({
  chunk: null,
  error: null,
})

let runtimeModuleSync: RuntimeChunkModule | null = null
let runtimePromise: Promise<RuntimeChunkModule> | null = null
let runtimeSnapshot: RuntimeChunkSnapshot = PENDING_RUNTIME_SNAPSHOT
const runtimeListeners = /* @__PURE__ */ new Set<() => void>()

export function getLoadedRuntimeChunk(): RuntimeChunkModule | null {
  return runtimeModuleSync
}

export function getRuntimeChunkServerSnapshot(): RuntimeChunkModule | null {
  return runtimeModuleSync
}

export function getRuntimeChunkSnapshot(): RuntimeChunkSnapshot {
  return runtimeSnapshot
}

export function getRuntimeChunkStateServerSnapshot(): RuntimeChunkSnapshot {
  return runtimeModuleSync !== null ? runtimeSnapshot : PENDING_RUNTIME_SNAPSHOT
}

export function loadRuntimeChunk(): Promise<RuntimeChunkModule> {
  if (runtimeModuleSync !== null) {
    if (isPluginStylesMounted()) runtimeModuleSync.ensureA2uiRuntimeStyles()
    return Promise.resolve(runtimeModuleSync)
  }
  if (runtimePromise === null) {
    if (runtimeSnapshot.error !== null) {
      runtimeSnapshot = PENDING_RUNTIME_SNAPSHOT
      notifySubscribers(runtimeListeners, 'Chunk store')
    }
    const rawPromise =
      typeof __DSH_BUNDLED_CLIENT__ !== 'undefined' && __DSH_BUNDLED_CLIENT__
        ? (require.async('./client.runtime.js') as Promise<RuntimeChunkModule>)
        : import('./chunks/runtime-chunk.ts')
    runtimePromise = rawPromise.then(
      (mod) => {
        runtimeModuleSync = mod
        runtimeSnapshot = Object.freeze({ chunk: mod, error: null })
        if (isPluginStylesMounted()) mod.ensureA2uiRuntimeStyles()
        notifySubscribers(runtimeListeners, 'Chunk store')
        return mod
      },
      (err: unknown) => {
        runtimePromise = null
        const errMsg =
          err instanceof Error && err.message ? err.message : RUNTIME_LOAD_ERROR_SENTINEL
        runtimeSnapshot = Object.freeze({ chunk: null, error: errMsg })
        notifySubscribers(runtimeListeners, 'Chunk store')
        throw err
      },
    )
  }
  return runtimePromise
}

export function retryRuntimeChunk(): void {
  if (runtimeModuleSync !== null || runtimePromise !== null) return
  loadRuntimeChunk().catch((err: unknown) => {
    console.warn('[dsh-genui-a2ui] failed to retry client.runtime.js:', err)
  })
}

export function subscribeRuntimeChunk(enabled: boolean, listener: () => void): () => void {
  if (!enabled) return () => {}
  runtimeListeners.add(listener)
  if (runtimeModuleSync === null && runtimePromise === null && runtimeSnapshot.error === null) {
    loadRuntimeChunk().catch((err: unknown) => {
      console.warn('[dsh-genui-a2ui] failed to load client.runtime.js:', err)
    })
  }
  return () => {
    runtimeListeners.delete(listener)
  }
}

export interface EchartsChunkSnapshot {
  readonly chunk: EchartsChunkModule | null
  readonly error: string | null
}

const PENDING_ECHARTS_SNAPSHOT: EchartsChunkSnapshot = /* @__PURE__ */ Object.freeze({
  chunk: null,
  error: null,
})

let echartsModuleSync: EchartsChunkModule | null = null
let echartsPromise: Promise<EchartsChunkModule> | null = null
let echartsSnapshot: EchartsChunkSnapshot = PENDING_ECHARTS_SNAPSHOT
const echartsListeners = /* @__PURE__ */ new Set<() => void>()

export function getLoadedEchartsChunk(): EchartsChunkModule | null {
  return echartsModuleSync
}

export function getEchartsChunkSnapshot(): EchartsChunkSnapshot {
  return echartsSnapshot
}

export function getEchartsChunkServerSnapshot(): EchartsChunkSnapshot {
  return PENDING_ECHARTS_SNAPSHOT
}

export function loadEchartsChunk(): Promise<EchartsChunkModule> {
  if (echartsModuleSync !== null) return Promise.resolve(echartsModuleSync)
  if (echartsPromise === null) {
    if (echartsSnapshot.error !== null) {
      echartsSnapshot = PENDING_ECHARTS_SNAPSHOT
      notifySubscribers(echartsListeners, 'Chunk store')
    }
    const rawPromise =
      typeof __DSH_BUNDLED_CLIENT__ !== 'undefined' && __DSH_BUNDLED_CLIENT__
        ? (require.async('./client.echarts.js') as Promise<EchartsChunkModule>)
        : import('./chunks/echarts-chunk.ts')
    echartsPromise = rawPromise.then(
      (mod) => {
        echartsModuleSync = mod
        echartsSnapshot = Object.freeze({ chunk: mod, error: null })
        notifySubscribers(echartsListeners, 'Chunk store')
        return mod
      },
      (err: unknown) => {
        echartsPromise = null
        const errMsg = err instanceof Error && err.message ? err.message : CHART_LOAD_ERROR_SENTINEL
        echartsSnapshot = Object.freeze({ chunk: null, error: errMsg })
        notifySubscribers(echartsListeners, 'Chunk store')
        throw err
      },
    )
  }
  return echartsPromise
}

export function retryEchartsChunk(): void {
  if (echartsModuleSync !== null || echartsPromise !== null) return
  loadEchartsChunk().catch(() => {})
}

export function subscribeEchartsChunk(listener: () => void): () => void {
  echartsListeners.add(listener)
  if (echartsModuleSync === null && echartsPromise === null && echartsSnapshot.error === null) {
    loadEchartsChunk().catch(() => {})
  }
  return () => {
    echartsListeners.delete(listener)
  }
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
  mermaidInflightKeys.add(key)
  loadMermaidChunk()
    .then((mod) => {
      if ((mermaidListenersByKey.get(key)?.size ?? 0) === 0) return null
      return mod.renderMermaidDiagram(code, dark, resolveLiveMermaidTarget(key))
    })
    .then(
      (renderedSvg) => {
        mermaidInflightKeys.delete(key)
        if (renderedSvg === null) {
          if ((mermaidListenersByKey.get(key)?.size ?? 0) > 0) {
            startMermaidRender(key, code, dark)
          }
          return
        }
        if ((mermaidListenersByKey.get(key)?.size ?? 0) === 0) return
        storeMermaidSnapshot(key, {
          svg: renderedSvg,
          error: null,
          rendering: false,
        })
      },
      (err: unknown) => {
        mermaidInflightKeys.delete(key)
        if ((mermaidListenersByKey.get(key)?.size ?? 0) === 0) return
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
  const pendingTimer = mermaidTimersByKey.get(key)
  if (pendingTimer !== undefined) {
    clearTimeout(pendingTimer)
    mermaidTimersByKey.delete(key)
  }
  mermaidDiagramCache.delete(key)
  const listeners = mermaidListenersByKey.get(key)
  if (listeners) notifySubscribers(listeners, 'Chunk store')
  startMermaidRender(key, code, dark)
}

export function loadMermaidChunk(): Promise<MermaidChunkModule> {
  if (mermaidModuleSync !== null) return Promise.resolve(mermaidModuleSync)
  if (mermaidPromise === null) {
    const rawPromise =
      typeof __DSH_BUNDLED_CLIENT__ !== 'undefined' && __DSH_BUNDLED_CLIENT__
        ? (require.async('./client.mermaid.js') as Promise<MermaidChunkModule>)
        : import('./chunks/mermaid-chunk.ts')
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
