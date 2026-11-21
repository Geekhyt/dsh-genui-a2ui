import { injectStyles, removeStyles } from '@a2ui/react/styles'
import { injectBasicCatalogStyles } from '@a2ui/web_core/v1_0'

let stylesInstalled = false
const addedAdoptedSheets = /* @__PURE__ */ new Set<CSSStyleSheet>()

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
  const domHasBasicSheets =
    !canInjectBasicCatalogStyles(document) ||
    (addedAdoptedSheets.size > 0 &&
      [...addedAdoptedSheets].every((sheet) => document.adoptedStyleSheets.includes(sheet)))
  if (stylesInstalled && domHasStructuralStyles && domHasBasicSheets) return
  stylesInstalled = true
  if (canInjectBasicCatalogStyles(document)) {
    const before = new Set(document.adoptedStyleSheets)
    injectBasicCatalogStyles(document)
    for (const sheet of document.adoptedStyleSheets) {
      if (!before.has(sheet)) addedAdoptedSheets.add(sheet)
    }
  }
  if (canInjectHeadStyles(document)) {
    injectStyles()
  }
}

export function cleanupA2uiRuntimeStyles(): void {
  if (!stylesInstalled) return
  stylesInstalled = false
  if (typeof document !== 'undefined') {
    if (canInjectBasicCatalogStyles(document) && addedAdoptedSheets.size > 0) {
      try {
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
          (sheet) => !addedAdoptedSheets.has(sheet),
        )
      } catch {}
      addedAdoptedSheets.clear()
    }
    if (canRemoveHeadStyles(document)) {
      removeStyles()
    }
  }
}

export {
  type SurfaceActionCallback,
  SurfaceGroupView,
  type SurfaceGroupViewProps,
} from '../SurfaceView.tsx'
export { type StreamingCompileSnapshot, StreamingExpressSession } from '../streaming.ts'
