import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import { useContext, useId, useMemo, useState } from 'react'
import { AccordionApi, FileTreeApi, JsonTreeApi } from '../../../shared/catalog-schema.ts'
import { safeStringifyJson } from '../../../shared/constants.ts'
import { useTransientFlag } from '../../dom-hooks.ts'
import { parseFileTarget, useFileOpener } from '../../file-opener.tsx'
import { useRuntimeMessages } from '../../i18n.ts'
import {
  DshChevronDownIcon,
  DshChevronUpIcon,
  DshFileTypeIcon,
  DshJsonTree,
  DshTag,
  type TagTone,
} from '../../ui/primitives.tsx'
import css from '../Catalog.module.css'
import { buildFileTree, type FileChangeStatus, type FileTreeNode } from '../stat-file-helpers.ts'
import {
  type ChildRef,
  copyTextToClipboard,
  defineComponent,
  renderChildRef,
  SurfaceReadOnlyContext,
  useSurfaceActionRunner,
  weightStyle,
} from '../widget-helpers.tsx'

const CHEVRON_UP_14 = <DshChevronUpIcon size={14} />
const CHEVRON_DOWN_14 = <DshChevronDownIcon size={14} />

const FOLDER_OPEN_GLYPH = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2 4.2C2 3.54 2.54 3 3.2 3H6.3L7.6 4.5H12.8C13.46 4.5 14 5.04 14 5.7V12.3C14 12.96 13.46 13.5 12.8 13.5H3.2C2.54 13.5 2 12.96 2 12.3V4.2Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
)

const FOLDER_CLOSED_GLYPH = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M2 4.2C2 3.54 2.54 3 3.2 3H6.3L7.6 4.5H12.8C13.46 4.5 14 5.04 14 5.7V12C14 12.66 13.46 13.2 12.8 13.2H3.2C2.54 13.2 2 12.66 2 12V4.2Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
)

interface AccordionItemInput {
  readonly title?: unknown
  readonly subtitle?: unknown
  readonly badge?: unknown
  readonly open?: unknown
  readonly defaultOpen?: unknown
  readonly child?: ChildRef
}

function resolveItemDefaultOpen(item: AccordionItemInput): boolean {
  return Boolean(item.open ?? item.defaultOpen)
}

export const DshAccordionImpl = defineComponent<{
  items?: readonly AccordionItemInput[]
  multiple?: boolean
  weight?: number
}>(AccordionApi, function DshAccordion({ props, buildChild }) {
  const msg = useRuntimeMessages()
  const items = Array.isArray(props.items)
    ? props.items.filter((item): item is AccordionItemInput =>
        Boolean(item && typeof item === 'object'),
      )
    : []
  const multiple = Boolean(props.multiple)
  const baseId = useId()

  const defaultOpenSig = items.map((item) => (resolveItemDefaultOpen(item) ? '1' : '0')).join('')
  const [prevDefaultSig, setPrevDefaultSig] = useState(defaultOpenSig)
  const [openSet, setOpenSet] = useState<ReadonlySet<number>>(() => {
    const initial = new Set<number>()
    items.forEach((item, idx) => {
      if (resolveItemDefaultOpen(item)) initial.add(idx)
    })
    if (!multiple && initial.size > 1) {
      const first = [...initial][0]!
      return new Set([first])
    }
    return initial
  })
  const [visitedSet, setVisitedSet] = useState<ReadonlySet<number>>(() => new Set(openSet))

  if (prevDefaultSig !== defaultOpenSig) {
    setPrevDefaultSig(defaultOpenSig)
    const nextOpen = new Set<number>()
    for (const idx of openSet) {
      if (idx >= 0 && idx < items.length) nextOpen.add(idx)
    }
    items.forEach((item, idx) => {
      const wasOpen = prevDefaultSig[idx] === '1'
      const nowOpen = resolveItemDefaultOpen(item)
      if (!wasOpen && nowOpen) {
        if (!multiple) nextOpen.clear()
        nextOpen.add(idx)
      } else if (wasOpen && !nowOpen) {
        nextOpen.delete(idx)
      }
    })
    setOpenSet(nextOpen)
    const prunedVisited = new Set<number>()
    for (const idx of visitedSet) {
      if (idx >= 0 && idx < items.length) prunedVisited.add(idx)
    }
    for (const idx of nextOpen) prunedVisited.add(idx)
    let visitedChanged = prunedVisited.size !== visitedSet.size
    if (!visitedChanged) {
      for (const idx of prunedVisited) {
        if (!visitedSet.has(idx)) {
          visitedChanged = true
          break
        }
      }
    }
    if (visitedChanged) {
      setVisitedSet(prunedVisited)
    }
  }

  let hasUnvisitedOpen = false
  for (const idx of openSet) {
    if (!visitedSet.has(idx)) {
      hasUnvisitedOpen = true
      break
    }
  }
  if (hasUnvisitedOpen) {
    const merged = new Set(visitedSet)
    for (const idx of openSet) merged.add(idx)
    setVisitedSet(merged)
  }

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
        const isVisited = isOpen || visitedSet.has(idx)
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
                  {isOpen ? CHEVRON_UP_14 : CHEVRON_DOWN_14}
                </span>
              </span>
            </button>
            {isVisited ? (
              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                className={css.accordionPanel}
                hidden={!isOpen}
                style={isOpen ? undefined : { display: 'none' }}
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

export { safeStringifyJson }

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
  const [copiedAll, markCopiedAll] = useTransientFlag(1300)

  const handleCopyAll = () => {
    copyTextToClipboard(safeStringifyJson(props.data ?? null, 2))
    markCopiedAll()
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

const STATUS_META: Record<FileChangeStatus, { code: string; tone: TagTone }> = {
  added: { code: 'A', tone: 'success' },
  modified: { code: 'M', tone: 'warning' },
  deleted: { code: 'D', tone: 'danger' },
  renamed: { code: 'R', tone: 'info' },
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
            {open ? FOLDER_OPEN_GLYPH : FOLDER_CLOSED_GLYPH}
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
  const rowContent = (
    <>
      <span className={css.fileTreeFileIcon}>
        <DshFileTypeIcon path={node.path} size={14} />
      </span>
      <span
        className={css.fileTreeName}
        data-deleted={node.status === 'deleted' ? 'true' : undefined}
      >
        {displayName}
      </span>
      {node.summary ? <span className={css.fileTreeSummary}>{node.summary}</span> : null}
      {statusMeta ? <DshTag tone={statusMeta.tone}>{statusMeta.code}</DshTag> : null}
    </>
  )

  return (
    <li className={css.fileTreeLi} role="treeitem">
      {interactive ? (
        <button
          type="button"
          className={`${css.fileTreeRow} ${css.fileTreeFileBtn}`}
          style={{ paddingLeft: indent + 14 }}
          onClick={() => onSelectFile(node)}
          data-file-path={node.path}
        >
          {rowContent}
        </button>
      ) : (
        <div
          className={css.fileTreeRow}
          style={{ paddingLeft: indent + 14 }}
          data-file-path={node.path}
        >
          {rowContent}
        </div>
      )}
    </li>
  )
}

export const DshFileTreeImpl = defineComponent<{
  items?: unknown
  title?: unknown
  expandedDepth?: number
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(FileTreeApi, function DshFileTree({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const runAction = useSurfaceActionRunner(context, props.action)
  const openFile = useFileOpener()
  const tree = useMemo(() => buildFileTree(props.items), [props.items])
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const expandedDepth =
    typeof props.expandedDepth === 'number' && props.expandedDepth >= 0 && props.expandedDepth <= 8
      ? Math.trunc(props.expandedDepth)
      : 2

  const activeAction = readOnly ? undefined : runAction
  const interactive = Boolean(openFile || activeAction)

  const handleSelectFile = (node: FileTreeNode) => {
    if (readOnly) return
    const safeTarget = parseFileTarget(node.path, node.line)
    if (safeTarget === null) return
    if (openFile && node.status !== 'deleted') {
      openFile(safeTarget.path, safeTarget.line)
    }
    if (activeAction) {
      void activeAction({
        metadata: {
          extensions: {
            dshSelection: {
              source: 'fileTree',
              path: safeTarget.path,
              ...(safeTarget.line !== undefined ? { line: safeTarget.line } : {}),
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
