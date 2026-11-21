import {
  createComponentImplementation,
  type ReactA2uiComponentProps,
  type ReactCatalogComponent,
} from '@a2ui/react'
import type { ComponentApi } from '@a2ui/web_core/v1_0'
import { type CSSProperties, createContext, type FC, Fragment, type ReactNode } from 'react'
import { isSafeStaticSvgImage } from '../mermaid-safe.ts'

export type ChildRef =
  | string
  | { readonly id: string; readonly basePath?: string | undefined }
  | null
  | undefined

export const InsideButtonContext = createContext(false)

export const SurfaceReadOnlyContext = createContext(false)

export const ModalCloseContext = createContext<(() => void) | null>(null)

export interface SurfaceValidationContextValue {
  readonly submitAttempted: boolean
  readonly markSubmitAttempted: () => void
}

export const SurfaceValidationContext = createContext<SurfaceValidationContextValue>({
  submitAttempted: false,
  markSubmitAttempted: () => {},
})

export function defineComponent<Props>(
  api: ComponentApi,
  render: FC<ReactA2uiComponentProps<Props>>,
): ReactCatalogComponent {
  return Object.assign(createComponentImplementation(api as never, render as never), {
    rawRender: render,
  })
}

export function weightStyle(weight: number | undefined, minWidth = 0): CSSProperties | undefined {
  if (weight === undefined) return undefined
  return { flexGrow: weight, flexBasis: 'var(--a2ui-flex-basis, 0px)', minWidth }
}

export interface ClampedPopoverBox {
  readonly top?: number | undefined
  readonly bottom?: number | undefined
  readonly left: number
  readonly width: number
  readonly maxHeight: number
  readonly placeAbove: boolean
}

export function computeClampedPopoverBox(
  rect: {
    readonly top: number
    readonly bottom: number
    readonly left: number
    readonly width: number
  },
  opts: { readonly minWidth: number; readonly estHeight: number },
): ClampedPopoverBox {
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800
  const availW = Math.max(120, viewportW - 16)
  const width = Math.min(availW, Math.max(opts.minWidth, Math.round(rect.width)))
  const left = Math.max(8, Math.min(Math.round(rect.left), viewportW - width - 8))
  const spaceBelow = Math.max(0, viewportH - rect.bottom - 12)
  const spaceAbove = Math.max(0, rect.top - 12)
  const placeAbove = spaceBelow < opts.estHeight && spaceAbove > spaceBelow
  const availSpace = Math.floor(placeAbove ? spaceAbove : spaceBelow)
  const maxHeight = Math.max(80, Math.min(280, availSpace))
  if (placeAbove) {
    const bottom = Math.max(
      8,
      Math.min(viewportH - maxHeight - 8, Math.round(viewportH - rect.top + 4)),
    )
    return { bottom, left, width, maxHeight, placeAbove: true }
  }
  const top = Math.max(8, Math.min(viewportH - maxHeight - 8, Math.round(rect.bottom + 4)))
  return { top, left, width, maxHeight, placeAbove: false }
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

function decodeSvgDataUri(uri: string): string | null {
  const match =
    /^data:image\/svg\+xml\s*(?:;\s*(?:charset=[^;,]+|utf-?8))?(\s*;\s*base64)?\s*,([\s\S]*)$/i.exec(
      uri,
    )
  if (!match) return null
  const isBase64 = Boolean(match[1])
  const payload = match[2] ?? ''
  if (payload.length > 256_000) return null
  try {
    if (isBase64) {
      if (typeof atob === 'function') {
        return atob(payload.replace(/\s+/g, ''))
      }
      return Buffer.from(payload, 'base64').toString('utf8')
    }
    return decodeURIComponent(payload)
  } catch {
    return null
  }
}

export function isSafeAvMediaUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  const trimmed = raw.trim()
  if (trimmed === '') return false
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

export function isSafeImageUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  const trimmed = raw.trim()
  if (trimmed === '') return false
  if (/^data:image\/(?:png|jpeg|jpg|gif|webp)[;,]/i.test(trimmed)) return true
  if (/^data:image\/svg\+xml[;,]/i.test(trimmed)) {
    const decoded = decodeSvgDataUri(trimmed)
    return decoded !== null && isSafeStaticSvgImage(decoded)
  }
  return isSafeAvMediaUrl(trimmed)
}

export function isSafeMediaUrl(raw: unknown): raw is string {
  return isSafeImageUrl(raw)
}

export { NativeDateField } from './NativeDateField.tsx'
