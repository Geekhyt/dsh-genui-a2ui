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

export function useEscapeKey(active: boolean, onEscape: () => void): void {
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onEscapeRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [active])
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
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false
      const trigger = triggerRef.current
      if (trigger && typeof document !== 'undefined') {
        const active = document.activeElement
        if (active === null || active === document.body || popoverRef.current?.contains(active)) {
          trigger.focus?.()
        }
      }
    }
  }, [open, popoverRef, triggerRef])

  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    const handleResize = () => {
      if (onRepositionRef.current) onRepositionRef.current()
      else onCloseRef.current()
    }
    const handleScroll = (e: Event) => {
      const target = e.target
      if (popoverRef.current && target instanceof Node && popoverRef.current.contains(target)) {
        return
      }
      if (onRepositionRef.current) onRepositionRef.current()
      else onCloseRef.current()
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('resize', handleResize, { passive: true })
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll, { capture: true })
    }
  }, [open, popoverRef])
}

export interface EChartsClickParams {
  readonly name?: unknown
  readonly seriesName?: unknown
  readonly value?: unknown
  readonly dataIndex?: unknown
}

export interface EChartsMountHandle {
  readonly exportPng: (filename: string, backgroundColor: string) => boolean
}

export function useEChartsMount(params: {
  readonly hostRef: RefObject<HTMLDivElement | null>
  readonly chunk: EchartsChunkModule | null
  readonly option: Record<string, unknown> | null
  readonly onPointClick: (event: EChartsClickParams) => void
  readonly onContainerWidth: (width: number) => void
}): EChartsMountHandle {
  const { hostRef, chunk, option, onPointClick, onContainerWidth } = params
  const chartRef = useRef<ReturnType<EchartsChunkModule['initChartInstance']> | null>(null)
  const onPointClickRef = useRef(onPointClick)
  onPointClickRef.current = onPointClick
  const onContainerWidthRef = useRef(onContainerWidth)
  onContainerWidthRef.current = onContainerWidth

  useIsomorphicLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const initialW = Math.round(el.clientWidth)
    if (initialW > 0) onContainerWidthRef.current(initialW)
  }, [chunk, hostRef])

  useEffect(() => {
    if (!chunk) return
    const el = hostRef.current
    if (!el) return
    const initialW = Math.round(el.clientWidth)
    if (initialW > 0) onContainerWidthRef.current(initialW)
    const instance = chunk.initChartInstance(el)
    chartRef.current = instance

    instance.on('click', (clickParams: EChartsClickParams) => {
      onPointClickRef.current(clickParams)
    })

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            const nextW = Math.round(el.clientWidth)
            const nextH = Math.round(el.clientHeight)
            if (nextW === 0 || nextH === 0) return
            onContainerWidthRef.current(nextW)
            instance.resize()
          })
        : null
    ro?.observe(el)

    return () => {
      ro?.disconnect()
      instance.dispose()
      chartRef.current = null
    }
  }, [chunk, hostRef])

  useEffect(() => {
    if (option && chartRef.current) {
      chartRef.current.setOption(option, { notMerge: true })
    }
  }, [chunk, option])

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
      const slug = filename
        .trim()
        .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
        .replace(/^-+|-+$/g, '')
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
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseFullscreenRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
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
