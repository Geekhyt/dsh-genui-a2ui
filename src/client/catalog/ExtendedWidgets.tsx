/**
 * 4 New A2UI 1.0 Declarative Components (`Accordion`, `JsonTree`, `FileTree`, `Mermaid`):
 * - `Accordion`: Multi-section collapsible container over `ChildSchema` flat IDs
 * - `JsonTree`: Structured JSON inspector bridging `HostPrimitives.JsonTree`
 * - `FileTree`: Workspace directory & change-impact tree with DSH right-sidebar file jump
 * - `Mermaid`: Lazy-loaded Mermaid diagram renderer (`securityLevel: "strict"` + `assertSafeSvg`)
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import {
  AccordionApi,
  FileTreeApi,
  JsonTreeApi,
  MermaidApi,
} from '../../shared/catalog-schema.ts'
import { loadMermaidChunk } from '../chunk-loader.ts'
import { useFileOpener } from '../file-opener.tsx'
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
  const items = props.items ?? []
  const multiple = Boolean(props.multiple)
  const baseId = useId()

  const [openSet, setOpenSet] = useState<ReadonlySet<number>>(() => {
    const initial = new Set<number>()
    items.forEach((item, idx) => {
      if (Boolean(item.open)) initial.add(idx)
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
        const title = item.title !== undefined && item.title !== null ? String(item.title) : `分组 ${idx + 1}`
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
          <span className={css.jsonTreeTitle}>{title || 'JSON 结构'}</span>
          {copyable ? (
            <button type="button" className={css.diffCopyBtn} onClick={handleCopyAll}>
              {copiedAll ? '已复制 ✓' : '复制 JSON'}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className={css.jsonTreeBody}>
        <DshJsonTree
          data={props.data ?? null}
          label={title || 'JSON 数据树'}
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
  const openFile = useFileOpener()
  const tree = useMemo(() => buildFileTree(props.items), [props.items])
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const expandedDepth =
    typeof props.expandedDepth === 'number' && props.expandedDepth >= 0 && props.expandedDepth <= 8
      ? Math.trunc(props.expandedDepth)
      : 2

  const interactive = Boolean(openFile || props.action)

  const handleSelectFile = (node: FileTreeNode) => {
    if (openFile && node.status !== 'deleted') {
      openFile(node.path, node.line)
    }
    if (props.action) {
      void props.action({
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
          <span className={css.fileTreeTitle}>{title || '工作区文件'}</span>
          <span className={css.fileTreeCount}>{totalFiles} 个文件</span>
        </div>
      ) : null}
      {tree.length === 0 ? (
        <div className={css.emptyCell}>（暂无文件条目）</div>
      ) : (
        <ul className={css.fileTreeRoot} role="tree" aria-label={title || '文件目录树'}>
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

export const DshMermaidImpl = defineComponent<{
  code?: unknown
  title?: unknown
  caption?: unknown
  weight?: number
}>(MermaidApi, function DshMermaid({ props }) {
  const dark = useDarkTheme()
  const code = props.code === undefined || props.code === null ? '' : String(props.code).trim()
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const caption = props.caption !== undefined && props.caption !== null ? String(props.caption) : ''

  const [viewMode, setViewMode] = useState<'diagram' | 'source'>('diagram')
  const [svg, setSvg] = useState<string | null>(null)
  const [rendering, setRendering] = useState<boolean>(code !== '')
  const [renderError, setRenderError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const hostRef = useRef<HTMLDivElement | null>(null)

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
              setRenderError(err instanceof Error ? err.message : '流程图解析未完成')
              setRendering(false)
            }
          },
        )
    }, 90)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [code, dark])

  const handleCopy = () => {
    copyToClipboardSafe(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1300)
  }

  const showSourceFallback = viewMode === 'source' || (svg === null && renderError !== null)

  return (
    <div
      ref={hostRef}
      className={css.mermaidCard}
      style={weightStyle(props.weight, 240)}
      data-a2ui-mermaid=""
    >
      <div className={css.mermaidToolbar}>
        <span className={css.mermaidTitle}>{title || '架构与流程图'}</span>
        <div className={css.diffActions}>
          <div className={css.diffModeSwitch} role="group" aria-label="流程图显示切换">
            <button
              type="button"
              className={css.diffModeBtn}
              data-active={viewMode === 'diagram' ? 'true' : 'false'}
              onClick={() => setViewMode('diagram')}
            >
              图形
            </button>
            <button
              type="button"
              className={css.diffModeBtn}
              data-active={viewMode === 'source' ? 'true' : 'false'}
              onClick={() => setViewMode('source')}
            >
              源码
            </button>
          </div>
          <button type="button" className={css.diffCopyBtn} onClick={handleCopy}>
            {copied ? '已复制 ✓' : '复制'}
          </button>
        </div>
      </div>

      <div className={css.mermaidBody}>
        {code === '' ? (
          <div className={css.emptyCell}>（空流程图）</div>
        ) : showSourceFallback ? (
          <DshCodeBlock code={code} lang="mermaid" />
        ) : svg !== null ? (
          <div
            className={css.mermaidSvgWrap}
            data-a2ui-mermaid-svg=""
            // Safe: `renderMermaidDiagram` enforces `securityLevel: 'strict'`, strips `%%{init}%%`
            // directives, and passes the rendered markup through `assertSafeSvg(svg)`.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div
            className={css.lazySkeleton}
            style={{ height: 180 }}
            aria-busy={rendering}
            aria-label="正在渲染流程图…"
          />
        )}
      </div>

      {caption ? <div className={css.mermaidCaption}>{caption}</div> : null}
    </div>
  )
})
