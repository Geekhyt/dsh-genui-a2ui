import { injectStyles, removeStyles } from '@a2ui/react/styles'
import { injectBasicCatalogStyles } from '@a2ui/web_core/v1_0'

let stylesInstalled = false

export function ensureA2uiRuntimeStyles(): void {
  if (typeof document === 'undefined') return
  const domHasStructuralStyles = document.getElementById('a2ui-structural-styles') !== null
  if (stylesInstalled && domHasStructuralStyles) return
  stylesInstalled = true
  try {
    injectBasicCatalogStyles(document)
  } catch {}
  try {
    injectStyles()
  } catch {}
}

export function cleanupA2uiRuntimeStyles(): void {
  if (!stylesInstalled) return
  stylesInstalled = false
  try {
    removeStyles()
  } catch {}
}

ensureA2uiRuntimeStyles()

export {
  type SurfaceActionCallback,
  SurfaceGroupView,
  type SurfaceGroupViewProps,
} from '../SurfaceView.tsx'
export { type StreamingCompileSnapshot, StreamingExpressSession } from '../streaming.ts'
