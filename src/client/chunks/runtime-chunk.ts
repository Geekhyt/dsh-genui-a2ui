import { injectStyles, removeStyles } from '@a2ui/react/styles'
import { injectBasicCatalogStyles } from '@a2ui/web_core/v1_0'

let stylesInstalled = false

function canInjectBasicCatalogStyles(doc: Document): boolean {
  return typeof CSSStyleSheet === 'function' && Array.isArray(doc.adoptedStyleSheets)
}

function canInjectHeadStyles(doc: Document): boolean {
  return (
    typeof doc.getElementById === 'function' &&
    typeof doc.createElement === 'function' &&
    Boolean(doc.head && typeof doc.head.appendChild === 'function')
  )
}

function canRemoveHeadStyles(doc: Document): boolean {
  return typeof doc.getElementById === 'function'
}

export function ensureA2uiRuntimeStyles(): void {
  if (typeof document === 'undefined') return
  const domHasStructuralStyles =
    canRemoveHeadStyles(document) && document.getElementById('a2ui-structural-styles') !== null
  if (stylesInstalled && domHasStructuralStyles) return
  stylesInstalled = true
  if (canInjectBasicCatalogStyles(document)) {
    injectBasicCatalogStyles(document)
  }
  if (canInjectHeadStyles(document)) {
    injectStyles()
  }
}

export function cleanupA2uiRuntimeStyles(): void {
  if (!stylesInstalled) return
  stylesInstalled = false
  if (typeof document !== 'undefined' && canRemoveHeadStyles(document)) {
    removeStyles()
  }
}

ensureA2uiRuntimeStyles()

export {
  type SurfaceActionCallback,
  SurfaceGroupView,
  type SurfaceGroupViewProps,
} from '../SurfaceView.tsx'
export { type StreamingCompileSnapshot, StreamingExpressSession } from '../streaming.ts'
