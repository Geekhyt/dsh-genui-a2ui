import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { MermaidApi } from '../../../shared/catalog-schema.ts'
import {
  getMermaidDiagramServerSnapshot,
  getMermaidDiagramSnapshot,
  MERMAID_RENDER_ERROR_SENTINEL,
  retryMermaidDiagram,
  subscribeMermaidDiagram,
} from '../../chunk-loader.ts'
import {
  type PendingMermaidZoomAnchor,
  useDialogFocus,
  useMermaidViewportDom,
  useTransientFlag,
} from '../../dom-hooks.ts'
import { useRuntimeMessages } from '../../i18n.ts'
import { namespaceSvgIds, prepareMermaidSvg } from '../../mermaid-safe.ts'
import { useDarkTheme } from '../../theme.ts'
import { DshCodeBlock } from '../../ui/primitives.tsx'
import css from '../Catalog.module.css'
import {
  copyTextToClipboard,
  defineComponent,
  SurfaceReadOnlyContext,
  weightStyle,
} from '../widget-helpers.tsx'

export const MERMAID_ZOOM_MIN = 10
export const MERMAID_ZOOM_MAX = 2000
export const MERMAID_ZOOM_STEP = 25
export const MERMAID_ZOOM_FACTOR = 1.25

export function clampMermaidZoom(next: number): number {
  if (!Number.isFinite(next)) return 100
  return Math.max(MERMAID_ZOOM_MIN, Math.min(MERMAID_ZOOM_MAX, Math.round(next)))
}

export function stepMermaidZoom(current: number, direction: 1 | -1): number {
  const base = clampMermaidZoom(current)
  if (direction > 0) {
    const raw = base * MERMAID_ZOOM_FACTOR
    const stepped = Math.max(base + 5, Math.round(raw / 5) * 5)
    if (base < 100 && stepped > 100) return 100
    return clampMermaidZoom(stepped)
  }
  const raw = base / MERMAID_ZOOM_FACTOR
  const stepped = Math.min(base - 5, Math.round(raw / 5) * 5)
  if (base > 100 && stepped < 100) return 100
  return clampMermaidZoom(stepped)
}

export function scaleMermaidZoomByWheel(current: number, deltaY: number, deltaMode = 0): number {
  const base = clampMermaidZoom(current)
  if (!Number.isFinite(deltaY) || deltaY === 0) return base
  const unitScale = deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1
  const clampedDelta = Math.max(-160, Math.min(160, deltaY * unitScale))
  const raw = base * Math.exp(-clampedDelta * 0.0028)
  const next =
    clampedDelta < 0 ? Math.max(base + 1, Math.round(raw)) : Math.min(base - 1, Math.round(raw))
  return clampMermaidZoom(next)
}

export interface MermaidWidgetProps {
  code?: unknown
  title?: unknown
  caption?: unknown
  weight?: number
}

export { namespaceSvgIds }

export function DshMermaidView({ props }: { props: MermaidWidgetProps }) {
  const dark = useDarkTheme()
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const svgInstancePrefix = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const code = props.code === undefined || props.code === null ? '' : String(props.code).trim()
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const caption = props.caption !== undefined && props.caption !== null ? String(props.caption) : ''
  const displayTitle = title || msg.mermaidDefaultTitle

  const [viewMode, setViewMode] = useState<'diagram' | 'source'>('diagram')
  const [copied, markCopied] = useTransientFlag(1300)
  const [inlineZoomMode, setInlineZoomMode] = useState<'fit' | 'manual'>('fit')
  const [inlineManualPct, setInlineManualPct] = useState(100)
  const [inlineFitPct, setInlineFitPct] = useState(100)
  const [inlinePannable, setInlinePannable] = useState(false)
  const [dialogZoomMode, setDialogZoomMode] = useState<'fit' | 'manual'>('fit')
  const [dialogManualPct, setDialogManualPct] = useState(100)
  const [dialogFitPct, setDialogFitPct] = useState(100)
  const [dialogPannable, setDialogPannable] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [prevCode, setPrevCode] = useState(code)
  if (prevCode !== code) {
    setPrevCode(code)
    if (inlineZoomMode !== 'fit') setInlineZoomMode('fit')
    if (dialogZoomMode !== 'fit') setDialogZoomMode('fit')
  }

  if (readOnly && fullscreen) {
    setFullscreen(false)
  }
  const activeFullscreen = fullscreen && !readOnly

  const hostRef = useRef<HTMLDivElement | null>(null)
  const dialogCardRef = useRef<HTMLDivElement | null>(null)
  const inlineViewportRef = useRef<HTMLDivElement | null>(null)
  const inlineStageRef = useRef<HTMLDivElement | null>(null)
  const dialogViewportRef = useRef<HTMLDivElement | null>(null)
  const dialogStageRef = useRef<HTMLDivElement | null>(null)
  const pendingAnchorRef = useRef<PendingMermaidZoomAnchor | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  useDialogFocus(activeFullscreen, dialogCardRef)

  const subscribeDiagram = useCallback(
    (listener: () => void) => subscribeMermaidDiagram(code, dark, () => hostRef.current, listener),
    [code, dark],
  )
  const getDiagramSnapshot = useCallback(() => getMermaidDiagramSnapshot(code, dark), [code, dark])
  const getDiagramServerSnapshot = useCallback(() => getMermaidDiagramServerSnapshot(code), [code])
  const {
    svg,
    error: rawRenderError,
    rendering,
  } = useSyncExternalStore(subscribeDiagram, getDiagramSnapshot, getDiagramServerSnapshot)
  const renderError =
    rawRenderError === MERMAID_RENDER_ERROR_SENTINEL ? msg.mermaidParseIncomplete : rawRenderError

  const preparedSvg = useMemo(() => (svg !== null ? prepareMermaidSvg(svg) : null), [svg])
  const inlineSvgMarkup = useMemo(
    () =>
      preparedSvg !== null
        ? namespaceSvgIds(preparedSvg.markup, `m_${svgInstancePrefix}_i_`)
        : null,
    [preparedSvg, svgInstancePrefix],
  )
  const dialogSvgMarkup = useMemo(
    () =>
      activeFullscreen && preparedSvg !== null
        ? namespaceSvgIds(preparedSvg.markup, `m_${svgInstancePrefix}_d_`)
        : null,
    [activeFullscreen, preparedSvg, svgInstancePrefix],
  )
  const inlineEffectivePct = inlineZoomMode === 'manual' ? inlineManualPct : inlineFitPct
  const dialogEffectivePct = dialogZoomMode === 'manual' ? dialogManualPct : dialogFitPct

  const zoomStateRef = useRef({
    inlineZoomMode,
    inlineManualPct,
    inlineFitPct,
    inlineEffectivePct,
    dialogZoomMode,
    dialogManualPct,
    dialogFitPct,
    dialogEffectivePct,
    activeFullscreen,
  })
  zoomStateRef.current = {
    inlineZoomMode,
    inlineManualPct,
    inlineFitPct,
    inlineEffectivePct,
    dialogZoomMode,
    dialogManualPct,
    dialogFitPct,
    dialogEffectivePct,
    activeFullscreen,
  }

  const syncSurfaceMetrics = useCallback(
    (inDialog: boolean) => {
      const viewport = inDialog ? dialogViewportRef.current : inlineViewportRef.current
      const stage = inDialog ? dialogStageRef.current : inlineStageRef.current
      const setPannable = inDialog ? setDialogPannable : setInlinePannable
      const setFit = inDialog ? setDialogFitPct : setInlineFitPct
      const curMode = inDialog
        ? zoomStateRef.current.dialogZoomMode
        : zoomStateRef.current.inlineZoomMode
      if (!viewport || !stage || !preparedSvg) {
        setPannable(false)
        return
      }
      if (curMode === 'fit') {
        const svgEl = stage.querySelector('svg')
        const rect = svgEl ? svgEl.getBoundingClientRect() : null
        if (
          rect &&
          rect.width > 0 &&
          rect.height > 0 &&
          preparedSvg.width > 0 &&
          preparedSvg.height > 0
        ) {
          const fitScale = Math.min(
            rect.width / preparedSvg.width,
            rect.height / preparedSvg.height,
          )
          if (Number.isFinite(fitScale) && fitScale > 0) {
            setFit(clampMermaidZoom(fitScale * 100))
          }
        }
      }
      const overflows =
        viewport.scrollWidth > viewport.clientWidth + 2 ||
        viewport.scrollHeight > viewport.clientHeight + 2
      setPannable(overflows)
    },
    [preparedSvg],
  )

  const applyZoomAtPoint = useCallback(
    (nextPct: number, inDialog: boolean, clientX?: number, clientY?: number) => {
      const clamped = clampMermaidZoom(nextPct)
      const curMode = inDialog
        ? zoomStateRef.current.dialogZoomMode
        : zoomStateRef.current.inlineZoomMode
      const curManual = inDialog
        ? zoomStateRef.current.dialogManualPct
        : zoomStateRef.current.inlineManualPct
      if (curMode === 'manual' && curManual === clamped) return
      const viewport = inDialog ? dialogViewportRef.current : inlineViewportRef.current
      const stage = inDialog ? dialogStageRef.current : inlineStageRef.current
      const targetEl = stage?.querySelector('svg') ?? stage
      if (viewport && targetEl) {
        const vpRect = viewport.getBoundingClientRect()
        const targetRect = targetEl.getBoundingClientRect()
        let contentLeft = targetRect.left
        let contentTop = targetRect.top
        let contentW = targetRect.width
        let contentH = targetRect.height
        if (
          preparedSvg &&
          preparedSvg.width > 0 &&
          preparedSvg.height > 0 &&
          targetRect.width > 0 &&
          targetRect.height > 0
        ) {
          const scale = Math.min(
            targetRect.width / preparedSvg.width,
            targetRect.height / preparedSvg.height,
          )
          const paintedW = preparedSvg.width * scale
          const paintedH = preparedSvg.height * scale
          contentLeft = targetRect.left + (targetRect.width - paintedW) / 2
          contentTop = targetRect.top + (targetRect.height - paintedH) / 2
          contentW = paintedW
          contentH = paintedH
        }
        const px = clientX ?? vpRect.left + viewport.clientWidth / 2
        const py = clientY ?? vpRect.top + viewport.clientHeight / 2
        const relX = contentW > 0 ? Math.max(0, Math.min(1, (px - contentLeft) / contentW)) : 0.5
        const relY = contentH > 0 ? Math.max(0, Math.min(1, (py - contentTop) / contentH)) : 0.5
        pendingAnchorRef.current = {
          inDialog,
          relX,
          relY,
          cursorInVpX: px - vpRect.left,
          cursorInVpY: py - vpRect.top,
        }
      }
      if (inDialog) {
        setDialogZoomMode('manual')
        setDialogManualPct(clamped)
      } else {
        setInlineZoomMode('manual')
        setInlineManualPct(clamped)
      }
    },
    [preparedSvg],
  )

  const showSourceFallback = viewMode === 'source' || (preparedSvg === null && renderError !== null)
  const canZoom = !showSourceFallback && preparedSvg !== null

  const handleWheelZoom = useCallback(
    (e: globalThis.WheelEvent, inDialog: boolean) => {
      if (!inDialog && !e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      e.stopPropagation()
      const cur = inDialog
        ? zoomStateRef.current.dialogEffectivePct
        : zoomStateRef.current.inlineEffectivePct
      const mode = inDialog
        ? zoomStateRef.current.dialogZoomMode
        : zoomStateRef.current.inlineZoomMode
      const next = scaleMermaidZoomByWheel(cur, e.deltaY, e.deltaMode)
      if (next === cur && mode === 'manual') return
      applyZoomAtPoint(next, inDialog, e.clientX, e.clientY)
    },
    [applyZoomAtPoint],
  )

  const handleCloseFullscreen = useCallback(() => {
    setFullscreen(false)
  }, [])

  useMermaidViewportDom({
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
    onWheelZoom: handleWheelZoom,
    onCloseFullscreen: handleCloseFullscreen,
  })

  const handleCopy = () => {
    copyTextToClipboard(code, markCopied)
  }

  const handleZoomOut = useCallback(
    (inDialog: boolean) => {
      const cur = inDialog
        ? zoomStateRef.current.dialogEffectivePct
        : zoomStateRef.current.inlineEffectivePct
      applyZoomAtPoint(stepMermaidZoom(cur, -1), inDialog)
    },
    [applyZoomAtPoint],
  )

  const handleZoomIn = useCallback(
    (inDialog: boolean) => {
      const cur = inDialog
        ? zoomStateRef.current.dialogEffectivePct
        : zoomStateRef.current.inlineEffectivePct
      applyZoomAtPoint(stepMermaidZoom(cur, 1), inDialog)
    },
    [applyZoomAtPoint],
  )

  const handleZoomReset = useCallback(
    (inDialog: boolean) => {
      applyZoomAtPoint(100, inDialog)
    },
    [applyZoomAtPoint],
  )

  const handleZoomFit = useCallback((inDialog: boolean) => {
    pendingAnchorRef.current = null
    if (inDialog) {
      setDialogZoomMode('fit')
    } else {
      setInlineZoomMode('fit')
    }
  }, [])

  const handleToggleFullscreen = useCallback((nextOpen: boolean) => {
    pendingAnchorRef.current = null
    if (nextOpen) {
      setDialogZoomMode('fit')
    }
    setFullscreen(nextOpen)
  }, [])

  const handleDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>, inDialog: boolean) => {
      if (!canZoom) return
      const mode = inDialog
        ? zoomStateRef.current.dialogZoomMode
        : zoomStateRef.current.inlineZoomMode
      const cur = inDialog
        ? zoomStateRef.current.dialogEffectivePct
        : zoomStateRef.current.inlineEffectivePct
      const fit = inDialog ? zoomStateRef.current.dialogFitPct : zoomStateRef.current.inlineFitPct
      if (mode === 'fit' || cur <= Math.max(125, fit + 10)) {
        const targetZoom = clampMermaidZoom(Math.max(200, Math.round(cur * 2.2)))
        applyZoomAtPoint(targetZoom, inDialog, e.clientX, e.clientY)
      } else {
        pendingAnchorRef.current = null
        if (inDialog) setDialogZoomMode('fit')
        else setInlineZoomMode('fit')
      }
    },
    [applyZoomAtPoint, canZoom],
  )

  const handlePanPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, inDialog: boolean) => {
      if (!canZoom || e.button !== 0 || typeof window === 'undefined') return
      const viewport = inDialog ? dialogViewportRef.current : inlineViewportRef.current
      if (!viewport) return
      const rect = viewport.getBoundingClientRect()
      if (
        e.clientX >= rect.left + viewport.clientWidth ||
        e.clientY >= rect.top + viewport.clientHeight
      ) {
        return
      }
      const overflows =
        viewport.scrollWidth > viewport.clientWidth + 2 ||
        viewport.scrollHeight > viewport.clientHeight + 2
      if (!overflows) return

      const pointerId = e.pointerId
      const startX = e.clientX
      const startY = e.clientY
      const startLeft = viewport.scrollLeft
      const startTop = viewport.scrollTop
      let moved = false
      let captured = false

      const onMove = (ev: globalThis.PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        if (!moved && Math.hypot(dx, dy) > 3) {
          moved = true
          setIsDragging(true)
          if (!captured) {
            try {
              viewport.setPointerCapture(pointerId)
              captured = true
            } catch {}
          }
        }
        if (moved) {
          ev.preventDefault()
          viewport.scrollLeft = startLeft - dx
          viewport.scrollTop = startTop - dy
        }
      }

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        if (captured) {
          try {
            if (viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId)
          } catch {}
        }
        dragCleanupRef.current = null
        setIsDragging(false)
      }

      const onUp = (ev: globalThis.PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        cleanup()
      }

      dragCleanupRef.current?.()
      dragCleanupRef.current = cleanup
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [canZoom],
  )

  const renderToolbar = (inDialog: boolean) => {
    const activePct = inDialog ? dialogEffectivePct : inlineEffectivePct
    const activeMode = inDialog ? dialogZoomMode : inlineZoomMode
    return (
      <div className={css.mermaidToolbar}>
        <span className={css.mermaidTitle}>{displayTitle}</span>
        <div className={css.diffActions}>
          {canZoom ? (
            <div className={css.diffModeSwitch} role="group" aria-label={msg.mermaidZoomGroup}>
              <button
                type="button"
                className={css.mermaidZoomBtn}
                disabled={activePct <= MERMAID_ZOOM_MIN}
                aria-label={msg.mermaidZoomOutAria}
                title={msg.mermaidZoomOutTitle}
                onClick={() => handleZoomOut(inDialog)}
              >
                −
              </button>
              <button
                type="button"
                className={css.mermaidZoomReadout}
                aria-label={msg.mermaidZoomResetAria}
                title={msg.mermaidZoomResetTitle}
                onClick={() => handleZoomReset(inDialog)}
              >
                {activePct}%
              </button>
              <button
                type="button"
                className={css.mermaidZoomBtn}
                disabled={activePct >= MERMAID_ZOOM_MAX}
                aria-label={msg.mermaidZoomInAria}
                title={msg.mermaidZoomInTitle}
                onClick={() => handleZoomIn(inDialog)}
              >
                +
              </button>
              <button
                type="button"
                className={css.mermaidZoomFitBtn}
                aria-pressed={activeMode === 'fit'}
                data-active={activeMode === 'fit' ? 'true' : 'false'}
                aria-label={msg.mermaidZoomFitAria}
                title={msg.mermaidZoomFitTitle}
                onClick={() => handleZoomFit(inDialog)}
              >
                {msg.mermaidZoomFit}
              </button>
            </div>
          ) : null}
          <div className={css.diffModeSwitch} role="group" aria-label={msg.mermaidViewGroup}>
            <button
              type="button"
              className={css.diffModeBtn}
              aria-pressed={viewMode === 'diagram'}
              data-active={viewMode === 'diagram' ? 'true' : 'false'}
              onClick={() => setViewMode('diagram')}
            >
              {msg.mermaidDiagramTab}
            </button>
            <button
              type="button"
              className={css.diffModeBtn}
              aria-pressed={viewMode === 'source'}
              data-active={viewMode === 'source' ? 'true' : 'false'}
              onClick={() => setViewMode('source')}
            >
              {msg.mermaidSourceTab}
            </button>
          </div>
          <button type="button" className={css.diffCopyBtn} onClick={handleCopy}>
            {copied ? msg.copiedCheck : msg.copy}
          </button>
          {(preparedSvg !== null || inDialog) && !readOnly ? (
            <button
              type="button"
              className={css.diffCopyBtn}
              data-a2ui-mermaid-fullscreen-btn=""
              aria-label={inDialog ? msg.mermaidFullscreenExitAria : msg.mermaidFullscreenEnterAria}
              onClick={() => handleToggleFullscreen(!inDialog)}
            >
              {inDialog ? msg.mermaidFullscreenExit : msg.mermaidFullscreenEnter}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  const renderDiagramBody = (inDialog: boolean) => {
    const activeMode = inDialog ? dialogZoomMode : inlineZoomMode
    const activeManualPct = inDialog ? dialogManualPct : inlineManualPct
    const activePannable = inDialog ? dialogPannable : inlinePannable
    const isManualZoom = activeMode === 'manual'
    const stageZoomStyle: CSSProperties | undefined =
      isManualZoom && preparedSvg !== null
        ? ({
            '--mermaid-zoom-w': `${Math.round((preparedSvg.width * activeManualPct) / 100)}px`,
            '--mermaid-zoom-h': `${Math.round((preparedSvg.height * activeManualPct) / 100)}px`,
          } as CSSProperties)
        : undefined

    return (
      <div
        ref={inDialog ? dialogViewportRef : inlineViewportRef}
        className={inDialog ? css.mermaidFullscreenBody : css.mermaidBody}
        data-zoomed={isManualZoom && canZoom ? 'true' : 'false'}
        data-pannable={activePannable && canZoom ? 'true' : 'false'}
        data-dragging={isDragging ? 'true' : 'false'}
        onPointerDown={(e) => handlePanPointerDown(e, inDialog)}
        onDoubleClick={(e) => handleDoubleClick(e, inDialog)}
      >
        {code === '' ? (
          <div className={css.emptyCell}>{msg.mermaidEmpty}</div>
        ) : showSourceFallback ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {renderError !== null && viewMode === 'diagram' ? (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  flexWrap: 'wrap',
                  padding: '6px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--dsw-alias-state-warn-label, #f59e0b)',
                  background: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.08))',
                }}
              >
                <span>{`${msg.mermaidRenderFailed}: ${renderError}`}</span>
                <button
                  type="button"
                  className={css.diffCopyBtn}
                  onClick={() => retryMermaidDiagram(code, dark)}
                >
                  {msg.retryLoad}
                </button>
              </div>
            ) : null}
            <DshCodeBlock code={code} lang="mermaid" />
          </div>
        ) : preparedSvg !== null ? (
          <div
            ref={inDialog ? dialogStageRef : inlineStageRef}
            className={css.mermaidSvgStage}
            data-a2ui-mermaid-svg=""
            data-zoomed={isManualZoom ? 'true' : 'false'}
            style={stageZoomStyle}
            dangerouslySetInnerHTML={{
              __html: (inDialog ? dialogSvgMarkup : inlineSvgMarkup) ?? preparedSvg.markup,
            }}
          />
        ) : (
          <div
            className={css.lazySkeleton}
            style={{ height: 180 }}
            role="status"
            aria-busy={rendering}
            aria-label={msg.mermaidRendering}
          />
        )}
      </div>
    )
  }

  return (
    <>
      <div
        ref={hostRef}
        className={css.mermaidCard}
        style={weightStyle(props.weight, 240)}
        data-a2ui-mermaid=""
      >
        {renderToolbar(false)}
        {renderDiagramBody(false)}
        {caption ? <div className={css.mermaidCaption}>{caption}</div> : null}
      </div>
      {activeFullscreen && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={displayTitle}
              className={`${css.mermaidFullscreenMask} ${dark ? 'a2ui-dark' : 'a2ui-light'}`}
              data-a2ui-mermaid-dialog=""
              data-a2ui-overlay=""
              data-a2ui-managed-overlay=""
              onClick={(e) => {
                e.stopPropagation()
                handleCloseFullscreen()
              }}
            >
              <div
                ref={dialogCardRef}
                tabIndex={-1}
                className={css.mermaidFullscreenCard}
                onClick={(e) => e.stopPropagation()}
              >
                {renderToolbar(true)}
                {renderDiagramBody(true)}
                {caption ? <div className={css.mermaidCaption}>{caption}</div> : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

export const DshMermaidImpl = defineComponent<MermaidWidgetProps>(MermaidApi, DshMermaidView)
