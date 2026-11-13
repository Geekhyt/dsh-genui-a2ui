/**
 * Self-contained DSH lazy chunk (`lib/client.runtime.js`) encapsulating the
 * A2UI 1.0 core runtime (`@a2ui/web_core`, `@a2ui/react`, `@a2ui/agent` streaming
 * parser, React Aria controls, TanStack Table, and all 32 light-DOM component
 * wrappers — while keeping `echarts` and `mermaid` in their own chunks).
 */
import { injectBasicCatalogStyles } from '@a2ui/web_core/v1_0'
import { injectStyles, removeStyles } from '@a2ui/react/styles'

let stylesInstalled = false

export function ensureA2uiRuntimeStyles(): void {
  if (typeof document === 'undefined') return
  const domHasStructuralStyles = document.getElementById('a2ui-structural-styles') !== null
  if (stylesInstalled && domHasStructuralStyles) return
  stylesInstalled = true
  try {
    injectBasicCatalogStyles(document)
  } catch {
    // Non-browser test environments without CSSStyleSheet / adoptedStyleSheets fall back gracefully.
  }
  try {
    injectStyles()
  } catch {
    // Ignore head injection errors in non-DOM contexts.
  }
}

export function cleanupA2uiRuntimeStyles(): void {
  if (!stylesInstalled) return
  stylesInstalled = false
  try {
    removeStyles()
  } catch {
    // Ignore teardown errors if document is already gone.
  }
}

ensureA2uiRuntimeStyles()

export { SurfaceGroupView, type SurfaceActionCallback, type SurfaceGroupViewProps } from '../SurfaceView.tsx'
export { StreamingExpressSession, type StreamingCompileSnapshot } from '../streaming.ts'
