/**
 * 4 New A2UI 1.0 Declarative Components (`Accordion`, `JsonTree`, `FileTree`, `Mermaid`):
 * - `Accordion`: Multi-section collapsible container over `ChildSchema` flat IDs
 * - `JsonTree`: Structured JSON inspector bridging `HostPrimitives.JsonTree`
 * - `FileTree`: Workspace directory & change-impact tree with DSH right-sidebar file jump
 * - `Mermaid`: Lazy-loaded Mermaid diagram renderer (`securityLevel: "strict"` + `assertSafeSvg`)
 */
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import {
  AccordionApi,
  FileTreeApi,
  JsonTreeApi,
  MermaidApi,
} from '../../shared/catalog-schema.ts'
import { loadMermaidChunk } from '../chunk-loader.ts'
import { useFileOpener } from '../file-opener.tsx'
import { useRuntimeMessages } from '../i18n.ts'
import { prepareMermaidSvg } from '../mermaid-safe.ts'
import { useDarkTheme } from '../theme.ts'
import {
  DshChevronDownIcon,
  DshChevronUpIcon,
  DshCodeBlock,
  DshJsonTree,
  DshTag,
  type TagTone,
} from '../ui/primitives.tsx'
import css from './Catalog.module.css'
import {
  buildFileTree,
  type FileChangeStatus,
  type FileTreeNode,
} from './stat-file-helpers.ts'
import {
  SurfaceReadOnlyContext,
  defineComponent,
  renderChildRef,
  weightStyle,
  type ChildRef,
} from './widget-helpers.tsx'

function copyToClipboardSafe(text: string): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => {})
  }
}

/* ─────────────────────────── 1. Accordion ─────────────────────────── */

interface AccordionItemInput {
  readonly title?: unknown
  readonly subtitle?: unknown
  readonly badge?: unknown
  readonly open?: unknown
  readonly child?: ChildRef
}

export const DshAccordionImpl = defineComponent<{
  items?: readonly AccordionItemInput[]
  multiple?: boolean
  weight?: number
}>(AccordionApi, function DshAccordion({ props, buildChild }) {
  const msg = useRuntimeMessages()
  const items = props.items ?? []
  const multiple = Boolean(props.multiple)
  const baseId = useId()

  const [openSet, setOpenSet] = useState<ReadonlySet<number>>(() => {
    const initial = new Set<number>()
    items.forEach((item, idx) => {
      if (item.open) initial.add(idx)
    })
    if (!multiple && initial.size > 1) {
      const first = [...initial][0]!
      return new Set([first])
    }
    return initial
  })

  if (items.length === 0) return null

  const toggleIndex = (idx: number) => {
    setOpenSet((prev) => {
      const next = new Set(multiple ? prev : [])
      if (prev.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      return next
    })
  }

  return (
    <div className={css.accordion} style={weightStyle(props.weight, 220)} data-a2ui-accordion="">
      {items.map((item, idx) => {
        const isOpen = openSet.has(idx)
        const headerId = `${baseId}-acc-hdr-${idx}`
        const panelId = `${baseId}-acc-pnl-${idx}`
        const title =
          item.title !== undefined && item.title !== null
            ? String(item.title)
            : msg.accordionFallbackTitle(idx + 1)
        const subtitle =
          item.subtitle !== undefined && item.subtitle !== null && String(item.subtitle) !== ''
            ? String(item.subtitle)
            : ''
        const badge =
          item.badge !== undefined && item.badge !== null && String(item.badge) !== ''
            ? String(item.badge)
            : ''

        return (
          <div key={headerId} className={css.accordionItem} data-open={isOpen ? 'true' : 'false'}>
            <button
              id={headerId}
              type="button"
              className={css.accordionTrigger}
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggleIndex(idx)}
            >
              <span className={css.accordionTitleWrap}>
                <span className={css.accordionTitle}>{title}</span>
                {subtitle ? <span className={css.accordionSubtitle}>{subtitle}</span> : null}
              </span>
              <span className={css.accordionRight}>
                {badge ? <DshTag tone="neutral">{badge}</DshTag> : null}
                <span className={css.accordionChevron} aria-hidden="true">
                  {isOpen ? <DshChevronUpIcon size={14} /> : <DshChevronDownIcon size={14} />}
                </span>
              </span>
            </button>
            {isOpen ? (
              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                className={css.accordionPanel}
              >
                {renderChildRef(buildChild, item.child)}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
})

/* ─────────────────────────── 2. JsonTree ─────────────────────────── */

export const DshJsonTreeImpl = defineComponent<{
  data?: unknown
  title?: unknown
  expandedDepth?: number
  copyable?: boolean
  weight?: number
}>(JsonTreeApi, function DshJsonTreeWidget({ props }) {
  const msg = useRuntimeMessages()
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const expandedDepth =
    typeof props.expandedDepth === 'number' && props.expandedDepth >= 0 && props.expandedDepth <= 8
      ? Math.trunc(props.expandedDepth)
      : 2
  const copyable = props.copyable ?? true
  const [copiedAll, setCopiedAll] = useState(false)

  const handleCopyAll = () => {
    try {
      copyToClipboardSafe(JSON.stringify(props.data ?? null, null, 2))
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 1300)
    } catch {
      // Ignore circular structure
    }
  }

  return (
    <div className={css.jsonTreeCard} style={weightStyle(props.weight, 220)} data-a2ui-jsontree="">
      {title || copyable ? (
        <div className={css.jsonTreeHeader}>
          <span className={css.jsonTreeTitle}>{title || msg.jsonTreeDefaultTitle}</span>
          {copyable ? (
            <button type="button" className={css.diffCopyBtn} onClick={handleCopyAll}>
              {copiedAll ? msg.copiedCheck : msg.copyJson}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className={css.jsonTreeBody}>
        <DshJsonTree
          data={props.data ?? null}
          label={title || msg.jsonTreeAriaLabel}
          expandedDepth={expandedDepth}
          copyable={copyable}
        />
      </div>
    </div>
  )
})

/* ─────────────────────────── 3. FileTree ─────────────────────────── */

const STATUS_META: Record<FileChangeStatus, { code: string; tone: TagTone }> = {
  added: { code: 'A', tone: 'success' },
  modified: { code: 'M', tone: 'warning' },
  deleted: { code: 'D', tone: 'danger' },
  renamed: { code: 'R', tone: 'info' },
}

function FolderGlyph({ open }: { readonly open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={
          open
            ? 'M2 4.2C2 3.54 2.54 3 3.2 3H6.3L7.6 4.5H12.8C13.46 4.5 14 5.04 14 5.7V12.3C14 12.96 13.46 13.5 12.8 13.5H3.2C2.54 13.5 2 12.96 2 12.3V4.2Z'
            : 'M2 4.2C2 3.54 2.54 3 3.2 3H6.3L7.6 4.5H12.8C13.46 4.5 14 5.04 14 5.7V12C14 12.66 13.46 13.2 12.8 13.2H3.2C2.54 13.2 2 12.66 2 12V4.2Z'
        }
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FileGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 2.5H9.5L12.5 5.5V13.5H3.5V2.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M9 2.5V6H12.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function FileTreeBranch(props: {
  readonly node: FileTreeNode
  readonly depth: number
  readonly expandedDepth: number
  readonly onSelectFile: (node: FileTreeNode) => void
  readonly interactive: boolean
}) {
  const { node, depth, expandedDepth, onSelectFile, interactive } = props
  const [open, setOpen] = useState(depth < expandedDepth)
  const indent = 10 + depth * 16

  if (node.kind === 'dir') {
    return (
      <li className={css.fileTreeLi} role="treeitem" aria-expanded={open}>
        <button
          type="button"
          className={css.fileTreeRow}
          style={{ paddingLeft: indent }}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={css.fileTreeCaret} aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          <span className={css.fileTreeFolderIcon}>
            <FolderGlyph open={open} />
          </span>
          <span className={css.fileTreeName}>{node.name}</span>
          <span className={css.fileTreeCount}>{node.fileCount}</span>
        </button>
        {open && node.children.length > 0 ? (
          <ul className={css.fileTreeUl} role="group">
            {node.children.map((child) => (
              <FileTreeBranch
                key={child.path}
                node={child}
                depth={depth + 1}
                expandedDepth={expandedDepth}
                onSelectFile={onSelectFile}
                interactive={interactive}
              />
            ))}
          </ul>
        ) : null}
      </li>
    )
  }

  const statusMeta = node.status ? STATUS_META[node.status] : undefined
  const displayName = node.line !== undefined ? `${node.name}:${node.line}` : node.name

  return (
    <li className={css.fileTreeLi} role="treeitem">
      <button
        type="button"
        className={interactive ? `${css.fileTreeRow} ${css.fileTreeFileBtn}` : css.fileTreeRow}
        style={{ paddingLeft: indent + 14 }}
        onClick={() => onSelectFile(node)}
        data-file-path={node.path}
      >
        <span className={css.fileTreeFileIcon}>
          <FileGlyph />
        </span>
        <span className={css.fileTreeName} data-deleted={node.status === 'deleted' ? 'true' : undefined}>
          {displayName}
        </span>
        {node.summary ? <span className={css.fileTreeSummary}>{node.summary}</span> : null}
        {statusMeta ? <DshTag tone={statusMeta.tone}>{statusMeta.code}</DshTag> : null}
      </button>
    </li>
  )
}

export const DshFileTreeImpl = defineComponent<{
  items?: unknown
  title?: unknown
  expandedDepth?: number
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(FileTreeApi, function DshFileTree({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const openFile = useFileOpener()
  const tree = useMemo(() => buildFileTree(props.items), [props.items])
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const expandedDepth =
    typeof props.expandedDepth === 'number' && props.expandedDepth >= 0 && props.expandedDepth <= 8
      ? Math.trunc(props.expandedDepth)
      : 2

  const activeAction = readOnly ? undefined : props.action
  const interactive = Boolean(openFile || activeAction)

  const handleSelectFile = (node: FileTreeNode) => {
    if (readOnly) return
    if (openFile && node.status !== 'deleted') {
      openFile(node.path, node.line)
    }
    if (activeAction) {
      void activeAction({
        metadata: {
          extensions: {
            dshSelection: {
              source: 'fileTree',
              path: node.path,
              ...(node.line !== undefined ? { line: node.line } : {}),
              ...(node.status !== undefined ? { status: node.status } : {}),
              ...(node.raw !== undefined ? { item: node.raw } : {}),
            },
          },
        },
      })
    }
  }

  const totalFiles = useMemo(
    () => tree.reduce((acc, n) => acc + (n.kind === 'file' ? 1 : n.fileCount), 0),
    [tree],
  )

  return (
    <div className={css.fileTreeCard} style={weightStyle(props.weight, 220)} data-a2ui-filetree="">
      {title || totalFiles > 0 ? (
        <div className={css.fileTreeHeader}>
          <span className={css.fileTreeTitle}>{title || msg.fileTreeDefaultTitle}</span>
          <span className={css.fileTreeCount}>{msg.fileTreeCount(totalFiles)}</span>
        </div>
      ) : null}
      {tree.length === 0 ? (
        <div className={css.emptyCell}>{msg.fileTreeEmpty}</div>
      ) : (
        <ul className={css.fileTreeRoot} role="tree" aria-label={title || msg.fileTreeAriaLabel}>
          {tree.map((node) => (
            <FileTreeBranch
              key={node.path}
              node={node}
              depth={0}
              expandedDepth={expandedDepth}
              onSelectFile={handleSelectFile}
              interactive={interactive}
            />
          ))}
        </ul>
      )}
    </div>
  )
})

/* ─────────────────────────── 4. Mermaid ─────────────────────────── */

export const MERMAID_ZOOM_MIN = 10
export const MERMAID_ZOOM_MAX = 2000
export const MERMAID_ZOOM_STEP = 25
export const MERMAID_ZOOM_FACTOR = 1.25

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

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

interface PendingZoomAnchor {
  readonly inDialog: boolean
  readonly relX: number
  readonly relY: number
  readonly cursorInVpX: number
  readonly cursorInVpY: number
}

export interface MermaidWidgetProps {
  code?: unknown
  title?: unknown
  caption?: unknown
  weight?: number
}

export function DshMermaidView({ props }: { props: MermaidWidgetProps }) {
  const dark = useDarkTheme()
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const code = props.code === undefined || props.code === null ? '' : String(props.code).trim()
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const caption = props.caption !== undefined && props.caption !== null ? String(props.caption) : ''
  const displayTitle = title || msg.mermaidDefaultTitle

  const [viewMode, setViewMode] = useState<'diagram' | 'source'>('diagram')
  const [svg, setSvg] = useState<string | null>(null)
  const [rendering, setRendering] = useState<boolean>(code !== '')
  const [renderError, setRenderError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
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

  const hostRef = useRef<HTMLDivElement | null>(null)
  const inlineViewportRef = useRef<HTMLDivElement | null>(null)
  const inlineStageRef = useRef<HTMLDivElement | null>(null)
  const dialogViewportRef = useRef<HTMLDivElement | null>(null)
  const dialogStageRef = useRef<HTMLDivElement | null>(null)
  const pendingAnchorRef = useRef<PendingZoomAnchor | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)

  const preparedSvg = useMemo(() => (svg !== null ? prepareMermaidSvg(svg) : null), [svg])
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
    fullscreen,
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
    fullscreen,
  }

  useEffect(() => {
    if (code === '') {
      setSvg(null)
      setRenderError(null)
      setRendering(false)
      return
    }
    let cancelled = false
    setRendering(true)
    const timer = setTimeout(() => {
      loadMermaidChunk()
        .then((mod) => mod.renderMermaidDiagram(code, dark, hostRef.current))
        .then(
          (renderedSvg) => {
            if (!cancelled) {
              setSvg(renderedSvg)
              setRenderError(null)
              setRendering(false)
            }
          },
          (err: unknown) => {
            if (!cancelled) {
              setRenderError(err instanceof Error ? err.message : msg.mermaidParseIncomplete)
              setRendering(false)
            }
          },
        )
    }, 90)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [code, dark, msg.mermaidParseIncomplete])

  useEffect(() => {
    if (readOnly) {
      setFullscreen(false)
    }
  }, [readOnly])

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.()
    }
  }, [])

  useEffect(() => {
    if (!fullscreen || typeof window === 'undefined') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setFullscreen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullscreen])

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
        const renderedWidth = svgEl ? svgEl.getBoundingClientRect().width : 0
        if (renderedWidth > 0 && preparedSvg.width > 0) {
          setFit(clampMermaidZoom((renderedWidth / preparedSvg.width) * 100))
        }
      }
      const overflows =
        viewport.scrollWidth > viewport.clientWidth + 2 ||
        viewport.scrollHeight > viewport.clientHeight + 2
      setPannable(overflows)
    },
    [preparedSvg],
  )

  useIsomorphicLayoutEffect(() => {
    const anchor = pendingAnchorRef.current
    if (anchor && (!anchor.inDialog || fullscreen)) {
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
      pendingAnchorRef.current = null
    }
    syncSurfaceMetrics(false)
    if (fullscreen) syncSurfaceMetrics(true)
  }, [
    dialogManualPct,
    dialogZoomMode,
    fullscreen,
    inlineManualPct,
    inlineZoomMode,
    preparedSvg,
    syncSurfaceMetrics,
    viewMode,
  ])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      syncSurfaceMetrics(false)
      if (zoomStateRef.current.fullscreen) syncSurfaceMetrics(true)
    })
    if (inlineViewportRef.current) ro.observe(inlineViewportRef.current)
    if (fullscreen && dialogViewportRef.current) ro.observe(dialogViewportRef.current)
    return () => ro.disconnect()
  }, [fullscreen, preparedSvg, syncSurfaceMetrics, viewMode])

  const applyZoomAtPoint = useCallback(
    (nextPct: number, inDialog: boolean, clientX?: number, clientY?: number) => {
      const clamped = clampMermaidZoom(nextPct)
      const viewport = inDialog ? dialogViewportRef.current : inlineViewportRef.current
      const stage = inDialog ? dialogStageRef.current : inlineStageRef.current
      const targetEl = stage?.querySelector('svg') ?? stage
      if (viewport && targetEl) {
        const vpRect = viewport.getBoundingClientRect()
        const targetRect = targetEl.getBoundingClientRect()
        const px = clientX ?? vpRect.left + viewport.clientWidth / 2
        const py = clientY ?? vpRect.top + viewport.clientHeight / 2
        const relX =
          targetRect.width > 0
            ? Math.max(0, Math.min(1, (px - targetRect.left) / targetRect.width))
            : 0.5
        const relY =
          targetRect.height > 0
            ? Math.max(0, Math.min(1, (py - targetRect.top) / targetRect.height))
            : 0.5
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
    [],
  )

  const showSourceFallback = viewMode === 'source' || (preparedSvg === null && renderError !== null)
  const canZoom = !showSourceFallback && preparedSvg !== null

  useEffect(() => {
    if (!canZoom) return
    const bindWheel = (viewport: HTMLDivElement | null, inDialog: boolean) => {
      if (!viewport) return () => {}
      const onWheel = (e: globalThis.WheelEvent) => {
        // Inline card: require Ctrl/Cmd (or trackpad pinch) so chat timeline scroll is never hijacked.
        // Fullscreen viewer: wheel zooms directly at pointer (drag pans the canvas).
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
      }
      viewport.addEventListener('wheel', onWheel, { passive: false })
      return () => viewport.removeEventListener('wheel', onWheel)
    }

    const cleanInline = bindWheel(inlineViewportRef.current, false)
    const cleanDialog = fullscreen ? bindWheel(dialogViewportRef.current, true) : () => {}
    return () => {
      cleanInline()
      cleanDialog()
    }
  }, [applyZoomAtPoint, canZoom, fullscreen])

  const handleCopy = () => {
    copyToClipboardSafe(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1300)
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
      const fit = inDialog
        ? zoomStateRef.current.dialogFitPct
        : zoomStateRef.current.inlineFitPct
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

  const handlePanMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>, inDialog: boolean) => {
      if (!canZoom || e.button !== 0 || typeof window === 'undefined') return
      const viewport = inDialog ? dialogViewportRef.current : inlineViewportRef.current
      if (!viewport) return
      const overflows =
        viewport.scrollWidth > viewport.clientWidth + 2 ||
        viewport.scrollHeight > viewport.clientHeight + 2
      if (!overflows) return

      const startX = e.clientX
      const startY = e.clientY
      const startLeft = viewport.scrollLeft
      const startTop = viewport.scrollTop
      let moved = false

      const onMove = (ev: globalThis.MouseEvent) => {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        if (!moved && Math.hypot(dx, dy) > 3) {
          moved = true
          setIsDragging(true)
        }
        if (moved) {
          ev.preventDefault()
          viewport.scrollLeft = startLeft - dx
          viewport.scrollTop = startTop - dy
        }
      }

      const cleanup = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', cleanup)
        dragCleanupRef.current = null
        setIsDragging(false)
      }

      dragCleanupRef.current?.()
      dragCleanupRef.current = cleanup
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', cleanup)
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
              data-active={viewMode === 'diagram' ? 'true' : 'false'}
              onClick={() => setViewMode('diagram')}
            >
              {msg.mermaidDiagramTab}
            </button>
            <button
              type="button"
              className={css.diffModeBtn}
              data-active={viewMode === 'source' ? 'true' : 'false'}
              onClick={() => setViewMode('source')}
            >
              {msg.mermaidSourceTab}
            </button>
          </div>
          <button type="button" className={css.diffCopyBtn} onClick={handleCopy}>
            {copied ? msg.copiedCheck : msg.copy}
          </button>
          {preparedSvg !== null || inDialog ? (
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
        onMouseDown={(e) => handlePanMouseDown(e, inDialog)}
        onDoubleClick={(e) => handleDoubleClick(e, inDialog)}
      >
        {code === '' ? (
          <div className={css.emptyCell}>{msg.mermaidEmpty}</div>
        ) : showSourceFallback ? (
          <DshCodeBlock code={code} lang="mermaid" />
        ) : preparedSvg !== null ? (
          <div
            ref={inDialog ? dialogStageRef : inlineStageRef}
            className={css.mermaidSvgStage}
            data-a2ui-mermaid-svg=""
            data-zoomed={isManualZoom ? 'true' : 'false'}
            style={stageZoomStyle}
            // Safe: `renderMermaidDiagram` enforces `securityLevel: 'strict'`, strips `%%{init}%%`
            // directives, and passes the rendered markup through `DOMPurify` + `assertSafeSvg(svg)`.
            dangerouslySetInnerHTML={{ __html: preparedSvg.markup }}
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
      {fullscreen && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={displayTitle}
              className={css.mermaidFullscreenMask}
              data-a2ui-mermaid-dialog=""
              onClick={() => setFullscreen(false)}
            >
              <div className={css.mermaidFullscreenCard} onClick={(e) => e.stopPropagation()}>
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
