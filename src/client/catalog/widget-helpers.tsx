import {
  createComponentImplementation,
  type ReactA2uiComponentProps,
  type ReactCatalogComponent,
} from '@a2ui/react'
import type { ActionDispatchOptions, ComponentApi } from '@a2ui/web_core/v1_0'
import {
  type CSSProperties,
  createContext,
  type FC,
  Fragment,
  type MutableRefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { usePortalPopover } from '../dom-hooks.ts'
import { isSafeStaticSvgImage } from '../mermaid-safe.ts'
import css from './Catalog.module.css'

export type ChildRef =
  | string
  | { readonly id: string; readonly basePath?: string | undefined }
  | null
  | undefined

export const InsideButtonContext = createContext(false)

export const SurfaceReadOnlyContext = createContext(false)

export const ModalCloseContext = createContext<(() => void) | null>(null)

export const ModalOpenContext = createContext<(() => void) | null>(null)

export const ModalTriggerContext = createContext(false)

export interface SurfaceActionStatus {
  readonly seq: number
  readonly ok: boolean
}

export const SurfaceActionStatusContext = createContext<(() => SurfaceActionStatus) | null>(null)

export async function runSurfaceAction(
  fn: () => Promise<unknown> | unknown,
  getStatus: (() => SurfaceActionStatus) | null,
): Promise<boolean> {
  const before = getStatus?.()
  try {
    const res = await fn()
    if (res === false) return false
    const after = getStatus?.()
    if (before !== undefined && after !== undefined && after.seq !== before.seq && !after.ok) {
      return false
    }
    return true
  } catch {
    return false
  }
}

const LOCAL_UTILITY_FUNCTIONS = new Set(['copyText', 'openUrl'])

export function isLocalFunctionAction(context: unknown, propName = 'action'): boolean {
  if (typeof context !== 'object' || context === null) return false
  const model = (context as { componentModel?: unknown }).componentModel
  if (typeof model !== 'object' || model === null) return false
  const rawProps = (model as { properties?: unknown }).properties
  if (typeof rawProps !== 'object' || rawProps === null) return false
  const rawAction = (rawProps as Record<string, unknown>)[propName]
  if (typeof rawAction !== 'object' || rawAction === null || Array.isArray(rawAction)) return false
  const rec = rawAction as Record<string, unknown>
  const fnCall =
    (typeof rec.functionCall === 'object' && rec.functionCall !== null
      ? (rec.functionCall as Record<string, unknown>)
      : undefined) ?? rec
  const callName = fnCall['@call'] ?? fnCall.call
  return typeof callName === 'string' && LOCAL_UTILITY_FUNCTIONS.has(callName)
}

export interface SurfaceValidationContextValue {
  readonly submitAttempted: boolean
  readonly markSubmitAttempted: () => void
}

export const SurfaceValidationContext = createContext<SurfaceValidationContextValue>({
  submitAttempted: false,
  markSubmitAttempted: () => {},
})

export { copyTextToClipboard } from '../dom-hooks.ts'

export function isWritableProp(context: unknown, propName: string, setter: unknown): boolean {
  if (typeof setter !== 'function') return false
  if (typeof context !== 'object' || context === null) return true
  const model = (context as { componentModel?: unknown }).componentModel
  if (typeof model !== 'object' || model === null) return true
  const rawProps = (model as { properties?: unknown }).properties
  if (typeof rawProps !== 'object' || rawProps === null) return true
  const rawVal = (rawProps as Record<string, unknown>)[propName]
  if (typeof rawVal !== 'object' || rawVal === null || Array.isArray(rawVal)) return false
  const rec = rawVal as Record<string, unknown>
  if ('componentId' in rec) return false
  const dataContext = (context as { dataContext?: { atLeastV10?: unknown; path?: unknown } })
    .dataContext
  const atLeastV10 = dataContext?.atLeastV10
  const basePath = typeof dataContext?.path === 'string' ? dataContext.path : ''
  const isScoped = basePath !== '' && basePath !== '/'
  const isValidPath = (rawPath: unknown): boolean =>
    typeof rawPath === 'string' && (rawPath.trim() !== '' || (rawPath === '' && isScoped))
  if (atLeastV10 === true) {
    return isValidPath(rec['@path'])
  }
  if (atLeastV10 === false) {
    return isValidPath(rec.path)
  }
  return isValidPath(rec['@path']) || isValidPath(rec.path)
}

export function normalizeStringArrayValue(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (item !== null && item !== undefined) out.push(String(item))
  }
  return out
}

export function parseBooleanValue(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase()
    if (t === '' || t === 'false' || t === '0' || t === 'no' || t === 'off') return false
    return true
  }
  return Boolean(raw)
}

export function areExternalValuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) return false
    }
    return true
  }
  return false
}

export function useWritablePropState<T>(
  context: unknown,
  propName: string,
  externalValue: unknown,
  setter: ((next: T) => void) | undefined,
): readonly [unknown, (next: T) => void, boolean] {
  const writable = isWritableProp(context, propName, setter)
  const [localVal, setLocalVal] = useState<unknown>(externalValue)
  const [prevExternal, setPrevExternal] = useState<unknown>(externalValue)
  if (!areExternalValuesEqual(prevExternal, externalValue)) {
    setPrevExternal(externalValue)
    setLocalVal(externalValue)
  }
  const commit = useCallback(
    (next: T) => {
      if (writable && typeof setter === 'function') {
        setter(next)
      } else {
        setLocalVal(next)
      }
    },
    [writable, setter],
  )
  return [writable ? externalValue : localVal, commit, writable] as const
}

export function useSurfaceActionRunner<Opts = ActionDispatchOptions>(
  context: unknown,
  action: ((options?: Opts) => Promise<unknown> | unknown) | undefined,
  propName = 'action',
): ((options?: Opts) => Promise<boolean>) | undefined {
  const closeModal = useContext(ModalCloseContext)
  const getActionStatus = useContext(SurfaceActionStatusContext)
  const isLocalFn = isLocalFunctionAction(context, propName)
  const runner = useCallback(
    async (options?: Opts) => {
      if (typeof action !== 'function') return false
      const ok = await runSurfaceAction(() => action(options), getActionStatus)
      if (ok && closeModal && !isLocalFn) {
        closeModal()
      }
      return ok
    },
    [action, closeModal, getActionStatus, isLocalFn],
  )
  return typeof action === 'function' ? runner : undefined
}

const DSH_HOST_ELEMENTS_KEY = '__dshA2uiHostElements__'

export function toDshCustomElementTag(name: string): string {
  const parts = name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  return `dsh-a2ui-${parts.length > 0 ? parts.join('-') : 'widget'}`
}

function getGlobalHostElementStore(): Map<string, CustomElementConstructor> {
  const g = globalThis as Record<string, unknown>
  const existing = g[DSH_HOST_ELEMENTS_KEY]
  if (existing instanceof Map) {
    return existing as Map<string, CustomElementConstructor>
  }
  const next = new Map<string, CustomElementConstructor>()
  g[DSH_HOST_ELEMENTS_KEY] = next
  return next
}

export function resolveDshHostElement(tagName: string): CustomElementConstructor {
  if (typeof customElements !== 'undefined' && typeof customElements.get === 'function') {
    const registered = customElements.get(tagName)
    if (typeof registered === 'function') {
      getGlobalHostElementStore().set(tagName, registered)
      return registered
    }
  }
  const store = getGlobalHostElementStore()
  const cached = store.get(tagName)
  const hasRealHtmlElement = typeof HTMLElement === 'function'
  if (
    typeof cached === 'function' &&
    (!hasRealHtmlElement || cached.prototype instanceof HTMLElement)
  ) {
    return cached
  }
  const Base = (hasRealHtmlElement ? HTMLElement : class {}) as unknown as CustomElementConstructor
  const HostElement = class extends Base {
    connectedCallback(): void {
      if (this.style) this.style.display = 'contents'
    }
  }
  store.set(tagName, HostElement)
  return HostElement
}

export function defineComponent<Props>(
  api: ComponentApi,
  render: FC<ReactA2uiComponentProps<Props>>,
): ReactCatalogComponent {
  const tagName = toDshCustomElementTag(api.name)
  const impl = Object.assign(createComponentImplementation(api as never, render as never), {
    rawRender: render,
    tagName,
  })
  Object.defineProperty(impl, 'element', {
    enumerable: true,
    configurable: true,
    get() {
      return resolveDshHostElement(tagName)
    },
  })
  return impl
}

export function weightStyle(weight: number | undefined, minWidth = 0): CSSProperties | undefined {
  if (weight === undefined || !Number.isFinite(weight) || weight <= 0) return undefined
  return {
    flexGrow: weight,
    flexBasis: 'var(--a2ui-flex-basis, auto)',
    minWidth: minWidth > 0 ? `min(100%, ${minWidth}px)` : 0,
  }
}

export function computeDropdownSide(
  rect: { readonly top: number; readonly bottom: number },
  estHeight: number,
): 'top' | 'bottom' {
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800
  const spaceBelow = Math.max(0, viewportH - rect.bottom - 12)
  const spaceAbove = Math.max(0, rect.top - 12)
  return spaceBelow < estHeight && spaceAbove > spaceBelow ? 'top' : 'bottom'
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

export const JUSTIFY_MAP: Record<string, CSSProperties['justifyContent']> = Object.assign(
  Object.create(null),
  {
    start: 'flex-start',
    end: 'flex-end',
    center: 'center',
    spaceBetween: 'space-between',
    spaceAround: 'space-around',
    spaceEvenly: 'space-evenly',
    stretch: 'stretch',
  },
)

export const ALIGN_MAP: Record<string, CSSProperties['alignItems']> = Object.assign(
  Object.create(null),
  {
    start: 'flex-start',
    end: 'flex-end',
    center: 'center',
    stretch: 'stretch',
  },
)

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
      const compact = payload.replace(/\s+/g, '')
      if (typeof atob === 'function') {
        const binary = atob(compact)
        if (typeof TextDecoder === 'function') {
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          return new TextDecoder('utf-8').decode(bytes)
        }
        return binary
      }
      return Buffer.from(compact, 'base64').toString('utf8')
    }
    try {
      return decodeURIComponent(payload)
    } catch {
      return payload.includes('<') ? payload : null
    }
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

function moveRovingFocus(
  e: ReactKeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
  selector: string,
  allowHorizontal: boolean,
  onSelectIndex?: (index: number) => void,
): void {
  if (!container) return
  const k = e.key
  if (
    !allowHorizontal &&
    (k === 'Home' || k === 'End') &&
    typeof HTMLInputElement !== 'undefined' &&
    e.target instanceof HTMLInputElement
  ) {
    return
  }
  const isNext = k === 'ArrowDown' || (allowHorizontal && k === 'ArrowRight')
  const isPrev = k === 'ArrowUp' || (allowHorizontal && k === 'ArrowLeft')
  if (!isNext && !isPrev && k !== 'Home' && k !== 'End') return
  const allItems = Array.from(container.querySelectorAll<HTMLButtonElement>(selector))
  const enabled = allItems
    .map((el, origIdx) => ({ el, origIdx }))
    .filter(({ el }) => !el.disabled && el.getAttribute('aria-disabled') !== 'true')
  if (enabled.length === 0) return
  const activeEl = (
    typeof document !== 'undefined' ? document.activeElement : null
  ) as HTMLButtonElement | null
  const idx = enabled.findIndex(({ el }) => el === activeEl)
  e.preventDefault()
  const nextPos =
    k === 'Home'
      ? 0
      : k === 'End'
        ? enabled.length - 1
        : isNext
          ? idx >= 0
            ? (idx + 1) % enabled.length
            : 0
          : idx > 0
            ? idx - 1
            : enabled.length - 1
  const target = enabled[nextPos]
  if (!target) return
  target.el.focus()
  onSelectIndex?.(target.origIdx)
}

export function handleOptionListArrowKey(
  e: ReactKeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
  roleSelector = '[role="option"]',
): void {
  moveRovingFocus(e, container, roleSelector, false)
}

export function handleHorizontalArrowKey(
  e: ReactKeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
  itemSelector: string,
  onSelectIndex?: (index: number) => void,
): void {
  moveRovingFocus(e, container, itemSelector, true, onSelectIndex)
}

export function usePickerPopover<T extends HTMLElement>(opts: {
  readonly readOnly: boolean
  readonly minWidth: number
  readonly estHeight: number
  readonly portalEnabled?: boolean
  readonly onBeforeClose?: () => void
  readonly onHostOpen?: (trigger: T) => void
}) {
  const [open, setOpen] = useState(false)
  const [popoverBox, setPopoverBox] = useState<ClampedPopoverBox | null>(null)
  const triggerRef = useRef<T | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  if (opts.readOnly && open) setOpen(false)
  const effectiveOpen = open && !opts.readOnly
  const portalActive = opts.portalEnabled !== false

  const closePopover = useCallback(() => {
    setOpen(false)
    opts.onBeforeClose?.()
  }, [opts.onBeforeClose])

  const syncPopoverBox = useCallback(() => {
    if (!triggerRef.current) return
    setPopoverBox(
      computeClampedPopoverBox(triggerRef.current.getBoundingClientRect(), {
        minWidth: opts.minWidth,
        estHeight: opts.estHeight,
      }),
    )
  }, [opts.minWidth, opts.estHeight])

  usePortalPopover({
    open: effectiveOpen && portalActive,
    triggerRef,
    popoverRef,
    onClose: closePopover,
    onReposition: syncPopoverBox,
  })

  const toggleOpen = () => {
    if (opts.readOnly) return
    if (effectiveOpen) {
      closePopover()
      return
    }
    if (portalActive) syncPopoverBox()
    else if (triggerRef.current) opts.onHostOpen?.(triggerRef.current)
    setOpen(true)
  }

  const resolvedBox =
    popoverBox ??
    (effectiveOpen && portalActive && triggerRef.current
      ? computeClampedPopoverBox(triggerRef.current.getBoundingClientRect(), {
          minWidth: opts.minWidth,
          estHeight: opts.estHeight,
        })
      : null)

  return {
    open,
    setOpen,
    effectiveOpen,
    popoverBox: resolvedBox,
    triggerRef,
    popoverRef,
    closePopover,
    toggleOpen,
  }
}

export function PortalPopoverShell(props: {
  readonly open: boolean
  readonly box: ClampedPopoverBox | null
  readonly dark: boolean
  readonly popoverRef: MutableRefObject<HTMLDivElement | null>
  readonly onClose: () => void
  readonly roleSelector?: string | undefined
  readonly children: ReactNode
}): ReactNode {
  if (!props.open || !props.box || typeof document === 'undefined') return null
  const { box } = props
  return createPortal(
    <div
      role="presentation"
      data-a2ui-portal-popover=""
      className={`${css.selectBackdrop} ${props.dark ? 'a2ui-dark' : 'a2ui-light'}`}
      onClick={(e) => {
        e.stopPropagation()
        props.onClose()
      }}
    >
      <div
        ref={props.popoverRef}
        data-a2ui-select-popover=""
        className={css.selectPopover}
        style={{
          ...(box.placeAbove ? { bottom: box.bottom } : { top: box.top }),
          left: box.left,
          width: box.width,
          maxHeight: box.maxHeight,
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => handleOptionListArrowKey(e, props.popoverRef.current, props.roleSelector)}
      >
        {props.children}
      </div>
    </div>,
    document.body,
  )
}

export { NativeDateField } from './NativeDateField.tsx'
