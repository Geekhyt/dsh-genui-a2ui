/**
 * Shared light-DOM React component helpers for the DSH A2UI 1.0 catalog.
 */
import {
  Fragment,
  createContext,
  type CSSProperties,
  type FC,
  type ReactNode,
} from 'react'
import {
  createComponentImplementation,
  type ReactA2uiComponentProps,
  type ReactCatalogComponent,
} from '@a2ui/react'
import type { ComponentApi } from '@a2ui/web_core/v1_0'

export type ChildRef =
  | string
  | { readonly id: string; readonly basePath?: string | undefined }
  | null
  | undefined

export const InsideButtonContext = createContext(false)

export function defineComponent<Props>(
  api: ComponentApi,
  render: FC<ReactA2uiComponentProps<Props>>,
): ReactCatalogComponent {
  return createComponentImplementation(api as never, render as never)
}

export function weightStyle(weight: number | undefined, minWidth = 0): CSSProperties | undefined {
  if (weight === undefined) return undefined
  return { flexGrow: weight, flexBasis: 0, minWidth }
}

export function renderChildRef(
  buildChild: (id: string, basePath?: string) => ReactNode,
  ref: ChildRef,
  key?: string | number,
): ReactNode {
  if (!ref) return null
  const node = typeof ref === 'string' ? buildChild(ref) : buildChild(ref.id, ref.basePath)
  return key !== undefined ? <Fragment key={key}>{node}</Fragment> : node
}

export function renderChildList(
  buildChild: (id: string, basePath?: string) => ReactNode,
  children: unknown,
): ReactNode {
  if (!Array.isArray(children)) return null
  return children.map((child, idx) => {
    const key =
      typeof child === 'string'
        ? `${child}-${idx}`
        : typeof child === 'object' && child !== null && 'id' in child
          ? `${String((child as { id: unknown }).id)}-${String((child as { basePath?: unknown }).basePath ?? idx)}`
          : idx
    return renderChildRef(buildChild, child as ChildRef, key)
  })
}

export const JUSTIFY_MAP: Record<string, CSSProperties['justifyContent']> = {
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
  spaceBetween: 'space-between',
  spaceAround: 'space-around',
  spaceEvenly: 'space-evenly',
  stretch: 'stretch',
}

export const ALIGN_MAP: Record<string, CSSProperties['alignItems']> = {
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
  stretch: 'stretch',
}

export function isSafeMediaUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  const trimmed = raw.trim()
  if (trimmed === '') return false
  if (/^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);/i.test(trimmed)) return true
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol === 'https:') return true
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
    ) {
      return true
    }
    return false
  } catch {
    return false
  }
}
