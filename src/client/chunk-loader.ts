import type * as EchartsChunk from './chunks/echarts-chunk.ts'
import type * as MermaidChunk from './chunks/mermaid-chunk.ts'
import type * as RuntimeChunk from './chunks/runtime-chunk.ts'
import { isPluginStylesMounted } from './style-lifecycle.ts'

declare const __DSH_BUNDLED_CLIENT__: boolean | undefined
declare const require: ((id: string) => unknown) & {
  async: (chunk: string) => Promise<unknown>
}

export type RuntimeChunkModule = typeof RuntimeChunk
export type EchartsChunkModule = typeof EchartsChunk
export type MermaidChunkModule = typeof MermaidChunk

export const CHART_LOAD_ERROR_SENTINEL = '__CHART_LOAD_FAILED__'
export const MERMAID_RENDER_ERROR_SENTINEL = '__MERMAID_RENDER_FAILED__'

function notifySet(listeners: ReadonlySet<() => void>): void {
  for (const fn of listeners) {
    try {
      fn()
    } catch (err) {
      console.error('[dsh-genui-a2ui] Chunk store subscriber error:', err)
    }
  }
}

let runtimeModuleSync: RuntimeChunkModule | null = null
let runtimePromise: Promise<RuntimeChunkModule> | null = null
const runtimeListeners = /* @__PURE__ */ new Set<() => void>()

export function getLoadedRuntimeChunk(): RuntimeChunkModule | null {
  return runtimeModuleSync
}

export function getRuntimeChunkServerSnapshot(): RuntimeChunkModule | null {
  return runtimeModuleSync
}

export function loadRuntimeChunk(): Promise<RuntimeChunkModule> {
  if (runtimeModuleSync !== null) {
    if (isPluginStylesMounted()) runtimeModuleSync.ensureA2uiRuntimeStyles()
    return Promise.resolve(runtimeModuleSync)
  }
  if (runtimePromise === null) {
    const rawPromise =
      typeof __DSH_BUNDLED_CLIENT__ !== 'undefined' && __DSH_BUNDLED_CLIENT__
        ? (require.async('./client.runtime.js') as Promise<RuntimeChunkModule>)
        : import('./chunks/runtime-chunk.ts')
    runtimePromise = rawPromise.then(
      (mod) => {
        runtimeModuleSync = mod
        if (isPluginStylesMounted()) mod.ensureA2uiRuntimeStyles()
        notifySet(runtimeListeners)
        return mod
      },
      (err) => {
        runtimePromise = null
        throw err
      },
    )
  }
  return runtimePromise
}

export function subscribeRuntimeChunk(enabled: boolean, listener: () => void): () => void {
  if (!enabled) return () => {}
  runtimeListeners.add(listener)
  if (runtimeModuleSync === null) {
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
    const rawPromise =
      typeof __DSH_BUNDLED_CLIENT__ !== 'undefined' && __DSH_BUNDLED_CLIENT__
        ? (require.async('./client.echarts.js') as Promise<EchartsChunkModule>)
        : import('./chunks/echarts-chunk.ts')
    echartsPromise = rawPromise.then(
      (mod) => {
        echartsModuleSync = mod
        echartsSnapshot = Object.freeze({ chunk: mod, error: null })
        notifySet(echartsListeners)
        return mod
      },
      (err: unknown) => {
        echartsPromise = null
        const errMsg = err instanceof Error && err.message ? err.message : CHART_LOAD_ERROR_SENTINEL
        echartsSnapshot = Object.freeze({ chunk: null, error: errMsg })
        notifySet(echartsListeners)
        throw err
      },
    )
  }
  return echartsPromise
}

export function subscribeEchartsChunk(listener: () => void): () => void {
  echartsListeners.add(listener)
  if (echartsModuleSync === null && echartsPromise === null) {
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
      if (el !== null) return el
    } catch {}
  }
  return null
}

function mermaidCacheKey(code: string, dark: boolean): string {
  return `${dark ? '1' : '0'}::${code}`
}

function storeMermaidSnapshot(key: string, snapshot: MermaidDiagramSnapshot): void {
  mermaidDiagramCache.delete(key)
  mermaidDiagramCache.set(key, Object.freeze(snapshot))
  while (mermaidDiagramCache.size > MAX_MERMAID_CACHE_ENTRIES) {
    const oldest = mermaidDiagramCache.keys().next()
    if (oldest.done) break
    mermaidDiagramCache.delete(oldest.value)
  }
  const listeners = mermaidListenersByKey.get(key)
  if (listeners) notifySet(listeners)
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
    if (existing !== undefined && existing.error !== null) {
      mermaidDiagramCache.delete(key)
    }
    if (!mermaidInflightKeys.has(key) && !mermaidTimersByKey.has(key)) {
      const timer = setTimeout(() => {
        mermaidTimersByKey.delete(key)
        if ((mermaidListenersByKey.get(key)?.size ?? 0) === 0) return
        mermaidInflightKeys.add(key)
        loadMermaidChunk()
          .then((mod) => mod.renderMermaidDiagram(code, dark, resolveLiveMermaidTarget(key)))
          .then(
            (renderedSvg) => {
              mermaidInflightKeys.delete(key)
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
      }, MERMAID_DEBOUNCE_MS)
      ;(timer as unknown as { unref?: () => void }).unref?.()
      mermaidTimersByKey.set(key, timer)
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
