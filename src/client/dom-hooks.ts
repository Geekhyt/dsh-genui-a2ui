import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EchartsChunkModule } from './chunk-loader.ts'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export function useAutoDismissTimer(holdMs: number, onDone: () => void): void {
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const timer = setTimeout(() => {
      onDoneRef.current()
    }, holdMs + 1000)
    return () => {
      clearTimeout(timer)
    }
  }, [holdMs])
}

export function useTransientFlag(durationMs = 1500): readonly [boolean, () => void] {
  const [active, setActive] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const trigger = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
    }
    setActive(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setActive(false)
    }, durationMs)
  }, [durationMs])

  return [active, trigger] as const
}

export function useTransientKey<T>(durationMs = 1500): readonly [T | null, (key: T) => void] {
  const [activeKey, setActiveKey] = useState<T | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const trigger = useCallback(
    (key: T) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      setActiveKey(key)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        setActiveKey(null)
      }, durationMs)
    },
    [durationMs],
  )

  return [activeKey, trigger] as const
}

const escapeHandlerStack: Array<() => void> = []

function isInsideUnmanagedHostOverlay(): boolean {
  if (typeof document === 'undefined') return false
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  const overlay = active.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')
  if (!overlay) return false
  if (
    overlay.hasAttribute('data-a2ui-overlay') ||
    overlay.hasAttribute('data-a2ui-portal-popover')
  ) {
    return false
  }
  if (
    overlay.closest(
      '[data-dsh-a2ui-card], [data-a2ui-dock], [data-a2ui-ask-dock], [data-a2ui-overlay], [data-a2ui-portal-popover]',
    )
  ) {
    return false
  }
  return true
}

function dispatchTopEscape(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || escapeHandlerStack.length === 0) return
  if (isInsideUnmanagedHostOverlay()) return
  const top = escapeHandlerStack[escapeHandlerStack.length - 1]
  if (!top) return
  e.preventDefault()
  e.stopPropagation()
  e.stopImmediatePropagation()
  top()
}

function registerEscapeHandler(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  if (escapeHandlerStack.length === 0) {
    window.addEventListener('keydown', dispatchTopEscape, { capture: true })
  }
  escapeHandlerStack.push(handler)
  return () => {
    const idx = escapeHandlerStack.lastIndexOf(handler)
    if (idx >= 0) escapeHandlerStack.splice(idx, 1)
    if (escapeHandlerStack.length === 0) {
      window.removeEventListener('keydown', dispatchTopEscape, { capture: true })
    }
  }
}

function isTriggerClippedOut(el: HTMLElement): boolean {
  if (typeof window === 'undefined') return false
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return true
  if (
    rect.bottom <= 0 ||
    rect.top >= window.innerHeight ||
    rect.right <= 0 ||
    rect.left >= window.innerWidth
  ) {
    return true
  }
  let cur: HTMLElement | null = el.parentElement
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const style = window.getComputedStyle(cur)
    const ovY = style.overflowY
    const ovX = style.overflowX
    if (ovY === 'auto' || ovY === 'scroll' || ovY === 'hidden' || ovY === 'clip') {
      const cRect = cur.getBoundingClientRect()
      if (rect.bottom <= cRect.top + 1 || rect.top >= cRect.bottom - 1) return true
    }
    if (ovX === 'auto' || ovX === 'scroll' || ovX === 'hidden' || ovX === 'clip') {
      const cRect = cur.getBoundingClientRect()
      if (rect.right <= cRect.left + 1 || rect.left >= cRect.right - 1) return true
    }
    cur = cur.parentElement
  }
  return false
}

export function useEscapeKey(active: boolean, onEscape: () => void): void {
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    return registerEscapeHandler(() => onEscapeRef.current())
  }, [active])
}

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

function isVisibleFocusable(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const cs = window.getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return false
  }
  return true
}

function focusTriggerSafely(trigger: HTMLElement): void {
  if (isTriggerClippedOut(trigger)) return
  const candidate =
    trigger.tabIndex >= 0 || trigger.matches(FOCUSABLE_SELECTOR)
      ? trigger
      : trigger.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
  try {
    candidate?.focus({ preventScroll: true })
  } catch {
    candidate?.focus?.()
  }
}

export function usePortalPopover(params: {
  readonly open: boolean
  readonly triggerRef: RefObject<HTMLElement | null>
  readonly popoverRef: RefObject<HTMLElement | null>
  readonly onClose: () => void
  readonly onReposition?: (() => void) | undefined
}): void {
  const { open, triggerRef, popoverRef, onClose, onReposition } = params
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onRepositionRef = useRef(onReposition)
  onRepositionRef.current = onReposition
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      if (typeof document !== 'undefined') {
        const pop = popoverRef.current
        if (pop && !pop.contains(document.activeElement)) {
          const searchField = pop.querySelector<HTMLElement>(
            'input:not(:disabled), textarea:not(:disabled)',
          )
          const firstOption =
            searchField ??
            pop.querySelector<HTMLElement>(
              '[aria-selected="true"]:not(:disabled), [role="option"]:not(:disabled), [role="menuitem"]:not(:disabled), [role="treeitem"]:not(:disabled)',
            )
          try {
            firstOption?.focus({ preventScroll: true })
          } catch {
            firstOption?.focus?.()
          }
        }
      }
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false
      const trigger = triggerRef.current
      if (trigger && typeof document !== 'undefined') {
        const active = document.activeElement
        if (active === null || active === document.body || popoverRef.current?.contains(active)) {
          focusTriggerSafely(trigger)
        }
      }
    }
  }, [open, popoverRef, triggerRef])

  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    let rafId = 0
    const scheduleSync = () => {
      if (rafId !== 0) return
      rafId = window.requestAnimationFrame(() => {
        rafId = 0
        const trigger = triggerRef.current
        if (!trigger || isTriggerClippedOut(trigger)) {
          onCloseRef.current()
          return
        }
        if (onRepositionRef.current) onRepositionRef.current()
        else onCloseRef.current()
      })
    }
    const handleResize = () => scheduleSync()
    const handleScroll = (e: Event) => {
      const target = e.target
      if (popoverRef.current && target instanceof Node && popoverRef.current.contains(target)) {
        return
      }
      scheduleSync()
    }
    const removeEscape = registerEscapeHandler(() => onCloseRef.current())
    window.addEventListener('resize', handleResize, { passive: true })
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    const ro =
      typeof ResizeObserver !== 'undefined' && triggerRef.current
        ? new ResizeObserver(() => scheduleSync())
        : null
    if (ro && triggerRef.current) ro.observe(triggerRef.current)
    const io =
      typeof IntersectionObserver !== 'undefined' && triggerRef.current
        ? new IntersectionObserver((entries) => {
            if (entries.some((entry) => !entry.isIntersecting)) {
              scheduleSync()
            }
          })
        : null
    if (io && triggerRef.current) io.observe(triggerRef.current)
    return () => {
      removeEscape()
      ro?.disconnect()
      io?.disconnect()
      if (rafId !== 0) window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll, { capture: true })
    }
  }, [open, popoverRef, triggerRef])
}

interface DialogFocusEntry {
  readonly dialogRef: RefObject<HTMLElement | null>
  prevFocused: HTMLElement | null
}

const dialogFocusStack: DialogFocusEntry[] = []

export function useDialogFocus(open: boolean, dialogRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!open) {
      return
    }
    const active = document.activeElement
    const entry: DialogFocusEntry = {
      dialogRef,
      prevFocused: active instanceof HTMLElement ? active : null,
    }
    dialogFocusStack.push(entry)
    const dialog = dialogRef.current
    if (dialog) {
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(isVisibleFocusable)
      ;(focusables[0] ?? dialog).focus?.()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const top = dialogFocusStack[dialogFocusStack.length - 1]
      if (!top || top.dialogRef !== dialogRef) return
      const root = dialogRef.current
      if (!root) return
      const cur = document.activeElement
      if (
        cur instanceof HTMLElement &&
        cur.closest('[data-a2ui-portal-popover], [role="listbox"], [role="menu"]') !== null &&
        !root.contains(cur)
      ) {
        return
      }
      const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        isVisibleFocusable,
      )
      if (focusables.length === 0) {
        e.preventDefault()
        root.focus?.()
        return
      }
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      if (!cur || cur === root || !root.contains(cur)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && cur === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && cur === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      const idx = dialogFocusStack.lastIndexOf(entry)
      const wasTop = idx === dialogFocusStack.length - 1
      if (idx >= 0) {
        if (!wasTop && idx + 1 < dialogFocusStack.length) {
          dialogFocusStack[idx + 1]!.prevFocused = entry.prevFocused
        }
        dialogFocusStack.splice(idx, 1)
      }
      document.removeEventListener('keydown', onKeyDown)
      const prev = entry.prevFocused
      entry.prevFocused = null
      if (!wasTop) return
      if (prev?.isConnected) {
        try {
          prev.focus({ preventScroll: true })
        } catch {
          prev.focus?.()
        }
      } else {
        const topDialog = dialogFocusStack[dialogFocusStack.length - 1]?.dialogRef.current
        topDialog?.focus?.()
      }
    }
  }, [open, dialogRef])
}

export interface EChartsClickParams {
  readonly name?: unknown
  readonly seriesName?: unknown
  readonly value?: unknown
  readonly data?: unknown
  readonly dataIndex?: unknown
  readonly dataType?: unknown
}

export interface EChartsMountHandle {
  readonly exportPng: (filename: string, backgroundColor: string) => boolean
}

export function useEChartsMount(params: {
  readonly hostRef: RefObject<HTMLDivElement | null>
  readonly chunk: EchartsChunkModule | null
  readonly option: Record<string, unknown> | null
  readonly mounted?: boolean | undefined
  readonly chartKind?: string | undefined
  readonly dataIdentity?: unknown
  readonly onPointClick: (event: EChartsClickParams) => void
  readonly onContainerWidth: (width: number) => void
}): EChartsMountHandle {
  const {
    hostRef,
    chunk,
    option,
    mounted = true,
    chartKind,
    dataIdentity,
    onPointClick,
    onContainerWidth,
  } = params
  const chartRef = useRef<ReturnType<EchartsChunkModule['initChartInstance']> | null>(null)
  const optionRef = useRef<Record<string, unknown> | null>(option)
  optionRef.current = option
  const lastAppliedOptionRef = useRef<Record<string, unknown> | null>(null)
  const prevKindRef = useRef<string | undefined>(chartKind)
  const prevDataIdRef = useRef<unknown>(dataIdentity)
  const onPointClickRef = useRef(onPointClick)
  onPointClickRef.current = onPointClick
  const onContainerWidthRef = useRef(onContainerWidth)
  onContainerWidthRef.current = onContainerWidth

  useIsomorphicLayoutEffect(() => {
    if (!mounted) return
    const el = hostRef.current
    if (!el) return
    const initialW = Math.round(el.clientWidth)
    if (initialW > 0) onContainerWidthRef.current(initialW)
  }, [chunk, hostRef, mounted])

  useEffect(() => {
    if (!chunk || !mounted) return
    const el = hostRef.current
    if (!el) return
    let resizeRaf = 0

    const ensureInit = (): ReturnType<EchartsChunkModule['initChartInstance']> | null => {
      if (chartRef.current) return chartRef.current
      const w = Math.round(el.clientWidth)
      const h = Math.round(el.clientHeight)
      if (w === 0 || h === 0) return null
      onContainerWidthRef.current(w)
      const instance = chunk.initChartInstance(el)
      chartRef.current = instance
      instance.on('click', (clickParams: EChartsClickParams) => {
        onPointClickRef.current(clickParams)
      })
      if (optionRef.current) {
        instance.setOption(optionRef.current, { notMerge: true })
        lastAppliedOptionRef.current = optionRef.current
      }
      return instance
    }

    ensureInit()

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            const nextW = Math.round(el.clientWidth)
            const nextH = Math.round(el.clientHeight)
            if (nextW === 0 || nextH === 0) return
            onContainerWidthRef.current(nextW)
            const inst = ensureInit()
            if (!inst) return
            if (
              typeof window !== 'undefined' &&
              typeof window.requestAnimationFrame === 'function'
            ) {
              if (resizeRaf !== 0) window.cancelAnimationFrame(resizeRaf)
              resizeRaf = window.requestAnimationFrame(() => {
                resizeRaf = 0
                chartRef.current?.resize()
              })
            } else {
              inst.resize()
            }
          })
        : null
    ro?.observe(el)

    return () => {
      ro?.disconnect()
      if (resizeRaf !== 0 && typeof window !== 'undefined') {
        window.cancelAnimationFrame(resizeRaf)
      }
      chartRef.current?.dispose()
      chartRef.current = null
      lastAppliedOptionRef.current = null
    }
  }, [chunk, hostRef, mounted])

  useEffect(() => {
    const inst = chartRef.current
    if (!option || !inst) {
      prevKindRef.current = chartKind
      prevDataIdRef.current = dataIdentity
      return
    }
    if (lastAppliedOptionRef.current === option) {
      prevKindRef.current = chartKind
      prevDataIdRef.current = dataIdentity
      return
    }
    const preserveInteractive =
      prevKindRef.current === chartKind && prevDataIdRef.current === dataIdentity
    prevKindRef.current = chartKind
    prevDataIdRef.current = dataIdentity
    let prevZoom: Array<{ start?: number; end?: number }> | null = null
    let prevLegendSelected: Record<string, boolean> | null = null
    if (preserveInteractive && typeof inst.getOption === 'function') {
      try {
        const cur = inst.getOption() as {
          dataZoom?: Array<{ start?: number; end?: number }>
          legend?: Array<{ selected?: Record<string, boolean> }>
        }
        if (Array.isArray(cur?.dataZoom) && cur.dataZoom.length > 0) {
          prevZoom = cur.dataZoom.map((z) => ({ start: z.start, end: z.end }))
        }
        const firstLegend = Array.isArray(cur?.legend) ? cur.legend[0] : undefined
        if (firstLegend?.selected && Object.keys(firstLegend.selected).length > 0) {
          prevLegendSelected = { ...firstLegend.selected }
        }
      } catch {}
    }
    let nextOption = option
    if (prevZoom && Array.isArray(option.dataZoom)) {
      nextOption = {
        ...nextOption,
        dataZoom: (option.dataZoom as Array<Record<string, unknown>>).map((dz, idx) => {
          const saved = prevZoom?.[idx]
          if (!saved || (saved.start === undefined && saved.end === undefined)) return dz
          return {
            ...dz,
            ...(saved.start !== undefined ? { start: saved.start } : {}),
            ...(saved.end !== undefined ? { end: saved.end } : {}),
          }
        }),
      }
    }
    if (
      prevLegendSelected &&
      option.legend &&
      typeof option.legend === 'object' &&
      !Array.isArray(option.legend)
    ) {
      nextOption = {
        ...nextOption,
        legend: {
          ...(option.legend as Record<string, unknown>),
          selected: prevLegendSelected,
        },
      }
    }
    inst.setOption(nextOption, { notMerge: true })
    lastAppliedOptionRef.current = option
  }, [chunk, option, chartKind, dataIdentity])

  const exportPng = useCallback((filename: string, backgroundColor: string): boolean => {
    const inst = chartRef.current
    if (!inst || typeof document === 'undefined' || !document.body) return false
    let anchor: HTMLAnchorElement | null = null
    try {
      const dataUrl = inst.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor,
      })
      if (!dataUrl?.startsWith('data:image/png')) return false
      const rawSlug = filename.trim().replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
      let sStart = 0
      while (sStart < rawSlug.length && rawSlug[sStart] === '-') sStart += 1
      let sEnd = rawSlug.length
      while (sEnd > sStart && rawSlug[sEnd - 1] === '-') sEnd -= 1
      const slug = rawSlug.slice(sStart, sEnd)
      anchor = document.createElement('a')
      anchor.href = dataUrl
      anchor.download = `${slug || 'a2ui-chart'}.png`
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      return true
    } catch {
      return false
    } finally {
      if (anchor?.parentNode) {
        anchor.parentNode.removeChild(anchor)
      }
    }
  }, [])

  return { exportPng }
}

export interface PendingMermaidZoomAnchor {
  readonly inDialog: boolean
  readonly relX: number
  readonly relY: number
  readonly cursorInVpX: number
  readonly cursorInVpY: number
}

export function useMermaidViewportDom(params: {
  readonly inlineViewportRef: RefObject<HTMLDivElement | null>
  readonly inlineStageRef: RefObject<HTMLDivElement | null>
  readonly dialogViewportRef: RefObject<HTMLDivElement | null>
  readonly dialogStageRef: RefObject<HTMLDivElement | null>
  readonly pendingAnchorRef: RefObject<PendingMermaidZoomAnchor | null>
  readonly dragCleanupRef: RefObject<(() => void) | null>
  readonly activeFullscreen: boolean
  readonly canZoom: boolean
  readonly viewMode: 'diagram' | 'source'
  readonly preparedSvg: {
    readonly markup: string
    readonly width: number
    readonly height: number
  } | null
  readonly inlineZoomMode: 'fit' | 'manual'
  readonly inlineManualPct: number
  readonly dialogZoomMode: 'fit' | 'manual'
  readonly dialogManualPct: number
  readonly syncSurfaceMetrics: (inDialog: boolean) => void
  readonly onWheelZoom: (event: globalThis.WheelEvent, inDialog: boolean) => void
  readonly onCloseFullscreen: () => void
}): void {
  const {
    inlineViewportRef,
    inlineStageRef,
    dialogViewportRef,
    dialogStageRef,
    pendingAnchorRef,
    dragCleanupRef,
    activeFullscreen,
    canZoom,
    viewMode,
    preparedSvg,
    inlineZoomMode,
    inlineManualPct,
    dialogZoomMode,
    dialogManualPct,
    syncSurfaceMetrics,
    onWheelZoom,
    onCloseFullscreen,
  } = params

  const activeFullscreenRef = useRef(activeFullscreen)
  activeFullscreenRef.current = activeFullscreen
  const onWheelZoomRef = useRef(onWheelZoom)
  onWheelZoomRef.current = onWheelZoom
  const onCloseFullscreenRef = useRef(onCloseFullscreen)
  onCloseFullscreenRef.current = onCloseFullscreen

  useEffect(() => {
    const onBlur = () => {
      dragCleanupRef.current?.()
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', onBlur)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('blur', onBlur)
      }
      dragCleanupRef.current?.()
    }
  }, [dragCleanupRef])

  useEffect(() => {
    if (!activeFullscreen || !canZoom) {
      dragCleanupRef.current?.()
      const anchor = pendingAnchorRef.current
      if (anchor && (!canZoom || (anchor.inDialog && !activeFullscreen))) {
        ;(pendingAnchorRef as { current: PendingMermaidZoomAnchor | null }).current = null
      }
    }
  }, [activeFullscreen, canZoom, dragCleanupRef, pendingAnchorRef])

  useEffect(() => {
    if (!activeFullscreen || typeof window === 'undefined') return
    return registerEscapeHandler(() => onCloseFullscreenRef.current())
  }, [activeFullscreen])

  useIsomorphicLayoutEffect(() => {
    const anchor = pendingAnchorRef.current
    if (anchor && (!anchor.inDialog || activeFullscreen)) {
      const viewport = anchor.inDialog ? dialogViewportRef.current : inlineViewportRef.current
      const stage = anchor.inDialog ? dialogStageRef.current : inlineStageRef.current
      const targetEl = stage?.querySelector('svg') ?? stage
      if (viewport && targetEl) {
        const vpRect = viewport.getBoundingClientRect()
        const targetRect = targetEl.getBoundingClientRect()
        const currentInVpX = targetRect.left - vpRect.left + anchor.relX * targetRect.width
        const currentInVpY = targetRect.top - vpRect.top + anchor.relY * targetRect.height
        viewport.scrollLeft += currentInVpX - anchor.cursorInVpX
        viewport.scrollTop += currentInVpY - anchor.cursorInVpY
      }
      ;(pendingAnchorRef as { current: PendingMermaidZoomAnchor | null }).current = null
    }
    syncSurfaceMetrics(false)
    if (activeFullscreen) syncSurfaceMetrics(true)
  }, [
    activeFullscreen,
    dialogManualPct,
    dialogStageRef,
    dialogViewportRef,
    dialogZoomMode,
    inlineManualPct,
    inlineStageRef,
    inlineViewportRef,
    inlineZoomMode,
    pendingAnchorRef,
    preparedSvg,
    syncSurfaceMetrics,
    viewMode,
  ])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      syncSurfaceMetrics(false)
      if (activeFullscreenRef.current) syncSurfaceMetrics(true)
    })
    if (inlineViewportRef.current) ro.observe(inlineViewportRef.current)
    if (activeFullscreen && dialogViewportRef.current) ro.observe(dialogViewportRef.current)
    return () => ro.disconnect()
  }, [
    activeFullscreen,
    dialogViewportRef,
    inlineViewportRef,
    preparedSvg,
    syncSurfaceMetrics,
    viewMode,
  ])

  useEffect(() => {
    if (!canZoom) return
    const bindWheel = (viewport: HTMLDivElement | null, inDialog: boolean) => {
      if (!viewport) return () => {}
      const onWheel = (e: globalThis.WheelEvent) => {
        onWheelZoomRef.current(e, inDialog)
      }
      viewport.addEventListener('wheel', onWheel, { passive: false })
      return () => viewport.removeEventListener('wheel', onWheel)
    }

    const cleanInline = bindWheel(inlineViewportRef.current, false)
    const cleanDialog = activeFullscreen ? bindWheel(dialogViewportRef.current, true) : () => {}
    return () => {
      cleanInline()
      cleanDialog()
    }
  }, [activeFullscreen, canZoom, dialogViewportRef, inlineViewportRef])
}

export function useStreamingHeightStabilizer(
  hostRef: RefObject<HTMLElement | null>,
  streaming: boolean,
): void {
  const highWaterRef = useRef(0)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    if (!streaming) {
      highWaterRef.current = 0
      el.style.minHeight = ''
      return
    }

    let rafId: number | null = null
    const applyHighWater = () => {
      rafId = null
      const h = Math.ceil(el.getBoundingClientRect().height)
      if (h > highWaterRef.current) {
        highWaterRef.current = h
        el.style.minHeight = `${h}px`
      }
    }
    const scheduleHighWater = () => {
      if (rafId !== null) return
      if (typeof requestAnimationFrame === 'function') {
        rafId = requestAnimationFrame(applyHighWater)
      } else {
        applyHighWater()
      }
    }

    scheduleHighWater()
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => scheduleHighWater()) : null
    ro?.observe(el)

    return () => {
      ro?.disconnect()
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId)
      }
    }
  }, [hostRef, streaming])
}

export function useSurfaceStoreSync(sync: () => void, deps: readonly unknown[]): void {
  const syncRef = useRef(sync)
  syncRef.current = sync
  useIsomorphicLayoutEffect(() => {
    syncRef.current()
  }, deps)
}

export function useElementWidth(ref: RefObject<HTMLElement | null>, mounted = true): number {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    if (!mounted) return
    const el = ref.current
    if (!el) return
    const sync = () => {
      const next = Math.round(el.clientWidth)
      if (next > 0) setWidth((prev) => (prev === next ? prev : next))
    }
    sync()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      ro.disconnect()
    }
  }, [ref, mounted])

  return width
}

export function useEffectCallback(
  effect: () => undefined | (() => void),
  deps: readonly unknown[],
): void {
  const effectRef = useRef(effect)
  effectRef.current = effect
  useEffect(() => effectRef.current(), deps)
}

export function copyTextToClipboard(text: string, onSuccess?: () => void): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        onSuccess?.()
      })
      .catch(() => {})
  }
}
