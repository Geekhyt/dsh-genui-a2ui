/**
 * Lightweight DSH dark-mode detector (`body[data-ds-dark-theme]`), kept free of
 * `@a2ui/*` runtime imports so `client.js`, `client.echarts.js`, and `client.mermaid.js`
 * can share it with zero bundle overhead.
 */
import { useSyncExternalStore } from 'react'

export const DARK_ATTR = 'data-ds-dark-theme'

export function isDarkTheme(): boolean {
  return typeof document !== 'undefined' && document.body?.hasAttribute(DARK_ATTR) === true
}

function subscribeDarkTheme(listener: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined' || !document.body) {
    return () => {}
  }
  const observer = new MutationObserver(listener)
  observer.observe(document.body, { attributes: true, attributeFilter: [DARK_ATTR] })
  return () => observer.disconnect()
}

/** Reactively track DSH dark/light skin mode (`body[data-ds-dark-theme]`). */
export function useDarkTheme(): boolean {
  return useSyncExternalStore(subscribeDarkTheme, isDarkTheme, () => false)
}
