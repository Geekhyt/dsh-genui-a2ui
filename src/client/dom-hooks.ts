/**
 * Low-level browser DOM / Canvas / Observer adapter hooks (`src/client/dom-hooks.ts`).
 *
 * Architectural boundary (`vercel-react-best-practices`):
 * Business and widget `.tsx` components are strictly forbidden from importing or calling
 * `useEffect` / `useLayoutEffect`. State derivation, state resets on prop/ID changes,
 * external store subscriptions (`useSyncExternalStore`), and user-action side effects
 * belong in render expressions, stores, or event handlers — never in effects.
 *
 * Only genuinely non-React imperative browser APIs live in this file:
 * 1. `useAutoDismissTimer` — portal fallback toast timeout cleanup on unmount
 * 2. `useEChartsMount` — imperative ECharts `<canvas>` instance + `ResizeObserver`
 * 3. `useMermaidViewportDom` — pre-paint zoom-to-cursor scrollport anchor (`useLayoutEffect`),
 *    `ResizeObserver`, non-passive `{ passive: false }` wheel listener, `Escape` keydown,
 *    and unmount window drag cleanup.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { EchartsChunkModule } from './chunk-loader.ts'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Imperative auto-dismiss timer for `FallbackToast` when Host `Toast` primitive is absent.
 * Stores latest `onDone` in a ref during render (`advanced-event-handler-refs`) so callback
 * identity changes never restart the countdown timer.
 */
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

export interface EChartsClickParams {
  readonly name?: unknown
  readonly seriesName?: unknown
  readonly value?: unknown
  readonly dataIndex?: unknown
}

export interface EChartsMountHandle {
  /** Export the live ECharts canvas as a high-DPI 2x PNG download. Returns false if unavailable. */
  readonly exportPng: (filename: string, backgroundColor: string) => boolean
}

/**
 * Imperative ECharts `<canvas>` lifecycle, `ResizeObserver`, option synchronization,
 * and 1-click high-DPI PNG export handle.
 */
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
            if (nextW > 0) {
              onContainerWidthRef.current(nextW)
            }
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
    if (!inst || typeof document === 'undefined') return false
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
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${slug || 'a2ui-chart'}.png`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return true
    } catch {
      return false
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

/**
 * Imperative DOM bindings for `<Mermaid>` lossless vector viewport:
 * - Pre-paint `scrollLeft`/`scrollTop` cursor anchor compensation (`useIsomorphicLayoutEffect`)
 * - `ResizeObserver` overflow & Fit-% measurement
 * - Non-passive `{ passive: false }` wheel listener (required to `preventDefault()` Ctrl+wheel browser zoom)
 * - Window `Escape` listener while fullscreen modal is open
 * - Unmount window drag listener teardown
 */
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
    return () => {
      dragCleanupRef.current?.()
    }
  }, [dragCleanupRef])

  useEffect(() => {
    if (!activeFullscreen || typeof window === 'undefined') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseFullscreenRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
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

/**
 * High-water-mark height stabilizer for actively streaming A2UI surfaces.
 *
 * While `streaming === true`, locks `min-height` to the maximum observed height so
 * incremental Express compilation frames never collapse/flicker or jump the chat
 * scrollport backwards. Releases `min-height` immediately once streaming settles.
 */
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
