/**
 * Official DSH dynamic chunk loader (`require.async("./client.<name>.js")`).
 *
 * - `client.runtime.js`: A2UI 1.0 core, streaming parser, & light-DOM widgets
 * - `client.echarts.js`: 14-kind ECharts visualization engine
 * - `client.mermaid.js`: Mermaid architecture/sequence/state diagram engine
 *
 * In the bundled DSH client (`__DSH_BUNDLED_CLIENT__ === true`), invokes the
 * package-scoped `require.async` supplied by `window.__ModuleLoader__.load`.
 * In Node / Vitest (`__DSH_BUNDLED_CLIENT__` undefined), falls back to standard
 * dynamic `import()` against the local TypeScript modules.
 */
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

let runtimeModuleSync: RuntimeChunkModule | null = null
let runtimePromise: Promise<RuntimeChunkModule> | null = null

let echartsModuleSync: EchartsChunkModule | null = null
let echartsPromise: Promise<EchartsChunkModule> | null = null

let mermaidModuleSync: MermaidChunkModule | null = null
let mermaidPromise: Promise<MermaidChunkModule> | null = null

export function getLoadedRuntimeChunk(): RuntimeChunkModule | null {
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

export function getLoadedEchartsChunk(): EchartsChunkModule | null {
  return echartsModuleSync
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
        return mod
      },
      (err) => {
        echartsPromise = null
        throw err
      },
    )
  }
  return echartsPromise
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
