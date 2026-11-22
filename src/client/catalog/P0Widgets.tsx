import { type CSSProperties, Fragment, useMemo, useState } from 'react'
import { CalloutApi, DiffViewApi, KeyValueApi, StepsApi } from '../../shared/catalog-schema.ts'
import { useTransientFlag, useTransientKey } from '../dom-hooks.ts'
import { parseFileTarget } from '../file-opener.tsx'
import { useRuntimeMessages, useUiLocale } from '../i18n.ts'
import { DshChevronDownIcon, DshChevronUpIcon, DshMarkdown, DshTag } from '../ui/primitives.tsx'
import css from './Catalog.module.css'
import { FileOpenChip } from './FileOpenChip.tsx'
import {
  computeLineDiff,
  type NormalizedDiffAnnotation,
  normalizeDiffAnnotations,
  normalizeDiffFiles,
  normalizeKeyValueItems,
  normalizeStepItems,
  pairSplitDiffRows,
} from './p0-helpers.ts'
import { type ChildRef, defineComponent, renderChildRef, weightStyle } from './widget-helpers.tsx'

function copyToClipboardSafe(text: string): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => {})
  }
}

export const DshDiffViewImpl = defineComponent<{
  before?: unknown
  after?: unknown
  title?: unknown
  language?: string
  mode?: 'unified' | 'split'
  filePath?: unknown
  line?: unknown
  files?: unknown
  annotations?: unknown
  weight?: number
}>(DiffViewApi, function DshDiffView({ props }) {
  const msg = useRuntimeMessages()
  const multiFiles = useMemo(() => normalizeDiffFiles(props.files), [props.files])
  const isMultiFile = multiFiles.length > 0
  const [activeFileIdx, setActiveFileIdx] = useState(0)
  const safeFileIdx = isMultiFile ? Math.min(activeFileIdx, multiFiles.length - 1) : 0
  const activeFile = isMultiFile ? multiFiles[safeFileIdx] : undefined

  const beforeStr = activeFile
    ? activeFile.before
    : props.before === undefined || props.before === null
      ? ''
      : String(props.before)
  const afterStr = activeFile
    ? activeFile.after
    : props.after === undefined || props.after === null
      ? ''
      : String(props.after)
  const activeFilePath = activeFile ? activeFile.path : props.filePath
  const activeLine = activeFile ? activeFile.line : props.line
  const activeLanguage = activeFile ? activeFile.language : props.language

  const propMode: 'unified' | 'split' = props.mode === 'split' ? 'split' : 'unified'
  const [prevPropMode, setPrevPropMode] = useState<'unified' | 'split'>(propMode)
  const [mode, setMode] = useState<'unified' | 'split'>(propMode)
  if (propMode !== prevPropMode) {
    setPrevPropMode(propMode)
    setMode(propMode)
  }
  const [copied, markCopied] = useTransientFlag(1400)

  const multiStats = useMemo(() => {
    if (!isMultiFile) return null
    return multiFiles.map((f) => computeLineDiff(f.before, f.after))
  }, [isMultiFile, multiFiles])

  const diff = useMemo(
    () => (multiStats ? multiStats[safeFileIdx]! : computeLineDiff(beforeStr, afterStr)),
    [multiStats, safeFileIdx, beforeStr, afterStr],
  )
  const totalAdded = multiStats ? multiStats.reduce((sum, s) => sum + s.added, 0) : diff.added
  const totalRemoved = multiStats ? multiStats.reduce((sum, s) => sum + s.removed, 0) : diff.removed

  const annotations = useMemo(() => {
    const topLevel = normalizeDiffAnnotations(props.annotations)
    if (!activeFile) return topLevel
    if (activeFile.annotations.length > 0) return activeFile.annotations
    return safeFileIdx === 0 && multiFiles.every((f) => f.annotations.length === 0) ? topLevel : []
  }, [activeFile, safeFileIdx, multiFiles, props.annotations])

  const annotationMap = useMemo(() => {
    const map = new Map<string, NormalizedDiffAnnotation[]>()
    for (const ann of annotations) {
      const k = `${ann.side}:${ann.line}`
      const list = map.get(k) ?? []
      list.push(ann)
      map.set(k, list)
    }
    return map
  }, [annotations])

  const splitRows = useMemo(
    () => (mode === 'split' ? pairSplitDiffRows(diff.ops) : []),
    [diff.ops, mode],
  )

  const hasFileLink = parseFileTarget(activeFilePath, activeLine) !== null
  const title = props.title
    ? String(props.title)
    : activeFile
      ? activeFile.title
      : hasFileLink
        ? ''
        : msg.diffDefaultTitle

  const handleCopyAfter = () => {
    copyToClipboardSafe(afterStr)
    markCopied()
  }

  return (
    <div className={css.diffCard} style={weightStyle(props.weight, 240)} data-a2ui-diff="">
      <div className={css.diffToolbar}>
        <div className={css.diffTitleGroup}>
          {title ? <span className={css.diffTitle}>{title}</span> : null}
          {isMultiFile ? (
            <span className={css.diffLang}>{msg.diffFilesSummary(multiFiles.length)}</span>
          ) : null}
          <FileOpenChip filePath={activeFilePath} line={activeLine} />
          {activeLanguage ? <span className={css.diffLang}>{activeLanguage}</span> : null}
          <span className={css.diffStatsGroup}>
            <span className={css.diffStatAdd}>+{totalAdded}</span>
            <span className={css.diffStatDel}>-{totalRemoved}</span>
          </span>
        </div>
        <div className={css.diffActions}>
          <div className={css.diffModeSwitch} role="group" aria-label={msg.diffModeGroup}>
            <button
              type="button"
              className={css.diffModeBtn}
              data-active={mode === 'unified' ? 'true' : 'false'}
              onClick={() => setMode('unified')}
            >
              {msg.diffUnified}
            </button>
            <button
              type="button"
              className={css.diffModeBtn}
              data-active={mode === 'split' ? 'true' : 'false'}
              onClick={() => setMode('split')}
            >
              {msg.diffSplit}
            </button>
          </div>
          <button type="button" className={css.diffCopyBtn} onClick={handleCopyAfter}>
            {copied ? msg.copiedCheck : msg.diffCopyAfter}
          </button>
        </div>
      </div>

      {isMultiFile ? (
        <div className={css.diffFileTabs} role="tablist">
          {multiFiles.map((file, idx) => {
            const st = multiStats?.[idx]
            return (
              <button
                key={`${file.path}-${idx}`}
                type="button"
                role="tab"
                aria-selected={idx === safeFileIdx}
                className={css.diffFileTab}
                data-active={idx === safeFileIdx ? 'true' : 'false'}
                onClick={() => setActiveFileIdx(idx)}
              >
                <span className={css.diffFileTabName}>{file.title}</span>
                {st ? (
                  <span className={css.diffFileTabStats}>
                    +{st.added}/-{st.removed}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}

      <div className={css.diffScroll}>
        {diff.ops.length === 0 ? (
          <div className={css.emptyCell}>{msg.diffEmpty}</div>
        ) : mode === 'unified' ? (
          <table className={css.diffTable}>
            <tbody>
              {diff.ops.map((op, i) => {
                const rowAnns = [
                  ...(op.oldLine !== undefined && op.kind !== 'add'
                    ? (annotationMap.get(`before:${op.oldLine}`) ?? [])
                    : []),
                  ...(op.newLine !== undefined
                    ? (annotationMap.get(`after:${op.newLine}`) ?? [])
                    : []),
                ]
                return (
                  <Fragment key={i}>
                    <tr className={css.diffRow} data-kind={op.kind}>
                      <td className={css.diffGutter}>{op.oldLine ?? ''}</td>
                      <td className={css.diffGutter}>{op.newLine ?? ''}</td>
                      <td className={css.diffMarker}>
                        {op.kind === 'add' ? '+' : op.kind === 'remove' ? '-' : ' '}
                      </td>
                      <td className={css.diffCode}>{op.text || ' '}</td>
                    </tr>
                    {rowAnns.map((ann, aIdx) => (
                      <tr key={`ann-${i}-${aIdx}`} className={css.diffAnnRow}>
                        <td colSpan={4} className={css.diffAnnCell}>
                          <div className={css.diffAnnBanner} data-tone={ann.tone}>
                            {ann.author ? (
                              <span className={css.diffAnnAuthor}>{ann.author}</span>
                            ) : null}
                            <span className={css.diffAnnMsg}>{ann.message}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        ) : (
          <table className={`${css.diffTable} ${css.diffSplitTable}`}>
            <colgroup>
              <col className={css.diffSplitGutterCol} />
              <col />
              <col className={css.diffSplitGutterCol} />
              <col />
            </colgroup>
            <tbody>
              {splitRows.map((row, i) => {
                const rowAnns = [
                  ...(row.left?.oldLine !== undefined
                    ? (annotationMap.get(`before:${row.left.oldLine}`) ?? [])
                    : []),
                  ...(row.right?.newLine !== undefined
                    ? (annotationMap.get(`after:${row.right.newLine}`) ?? [])
                    : []),
                ]
                return (
                  <Fragment key={i}>
                    <tr className={css.diffSplitTr}>
                      <td className={css.diffGutter} data-kind={row.left?.kind ?? 'empty'}>
                        {row.left?.oldLine ?? ''}
                      </td>
                      <td className={css.diffSplitCell} data-kind={row.left?.kind ?? 'empty'}>
                        {row.left
                          ? `${row.left.kind === 'remove' ? '- ' : '  '}${row.left.text}`
                          : ''}
                      </td>
                      <td className={css.diffGutter} data-kind={row.right?.kind ?? 'empty'}>
                        {row.right?.newLine ?? ''}
                      </td>
                      <td className={css.diffSplitCell} data-kind={row.right?.kind ?? 'empty'}>
                        {row.right
                          ? `${row.right.kind === 'add' ? '+ ' : '  '}${row.right.text}`
                          : ''}
                      </td>
                    </tr>
                    {rowAnns.map((ann, aIdx) => (
                      <tr key={`sann-${i}-${aIdx}`} className={css.diffAnnRow}>
                        <td colSpan={4} className={css.diffAnnCell}>
                          <div className={css.diffAnnBanner} data-tone={ann.tone}>
                            {ann.author ? (
                              <span className={css.diffAnnAuthor}>{ann.author}</span>
                            ) : null}
                            <span className={css.diffAnnMsg}>{ann.message}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
})

export const DshStepsImpl = defineComponent<{
  items?: unknown
  current?: unknown
  direction?: 'vertical' | 'horizontal'
  title?: unknown
  weight?: number
}>(StepsApi, function DshSteps({ props }) {
  const locale = useUiLocale()
  const steps = useMemo(
    () => normalizeStepItems(props.items, props.current, locale),
    [props.items, props.current, locale],
  )
  const dir = props.direction === 'horizontal' ? 'horizontal' : 'vertical'
  const headerTitle = props.title ? String(props.title) : ''

  return (
    <div
      className={css.stepsWrap}
      style={weightStyle(props.weight, 200)}
      data-a2ui-steps=""
      data-direction={dir}
    >
      {headerTitle ? <div className={css.stepsTitle}>{headerTitle}</div> : null}
      <ol className={dir === 'horizontal' ? css.stepsHorizontal : css.stepsVertical}>
        {steps.map((step, idx) => (
          <li key={`${step.title}-${idx}`} className={css.stepItem} data-status={step.status}>
            <div className={css.stepIndicatorTrack}>
              <span className={css.stepDot} data-status={step.status} aria-hidden="true">
                {step.status === 'done' ? '✓' : step.status === 'error' ? '!' : idx + 1}
              </span>
              {idx < steps.length - 1 ? <span className={css.stepConnector} /> : null}
            </div>
            <div className={css.stepContent}>
              <div className={css.stepHeaderRow}>
                <span className={css.stepItemTitle}>{step.title}</span>
                {step.meta ? <span className={css.stepMeta}>{step.meta}</span> : null}
              </div>
              {step.description ? <div className={css.stepDesc}>{step.description}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
})

const CHEVRON_UP_13 = <DshChevronUpIcon size={13} />
const CHEVRON_DOWN_13 = <DshChevronDownIcon size={13} />

const CALLOUT_SUCCESS_GLYPH = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M5.2 8.2L7.1 10.1L10.9 6.2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const CALLOUT_WARNING_GLYPH = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M8 2.2L14.3 13.4H1.7L8 2.2Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path d="M8 6.4V9.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="11.5" r="0.8" fill="currentColor" />
  </svg>
)

const CALLOUT_INFO_GLYPH = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 7.2V11.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="5" r="0.85" fill="currentColor" />
  </svg>
)

function CalloutGlyph({ tone }: { readonly tone: 'info' | 'success' | 'warning' | 'danger' }) {
  if (tone === 'success') return CALLOUT_SUCCESS_GLYPH
  if (tone === 'warning' || tone === 'danger') return CALLOUT_WARNING_GLYPH
  return CALLOUT_INFO_GLYPH
}

export const DshCalloutImpl = defineComponent<{
  title?: unknown
  message?: unknown
  tone?: 'info' | 'success' | 'warning' | 'danger'
  collapsible?: boolean
  child?: ChildRef
  weight?: number
}>(CalloutApi, function DshCallout({ props, buildChild }) {
  const msg = useRuntimeMessages()
  const tone = props.tone ?? 'info'
  const title = props.title ? String(props.title) : ''
  const message = props.message !== undefined && props.message !== null ? String(props.message) : ''
  const hasBody = message.trim() !== '' || Boolean(props.child)
  const [expanded, setExpanded] = useState(true)

  return (
    <div
      className={css.callout}
      data-tone={tone}
      style={weightStyle(props.weight, 200)}
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'note'}
      data-a2ui-callout=""
    >
      <div className={css.calloutIcon}>
        <CalloutGlyph tone={tone} />
      </div>
      <div className={css.calloutMain}>
        <div className={css.calloutTopRow}>
          <span className={css.calloutTitle}>{title}</span>
          {props.collapsible && hasBody ? (
            <button
              type="button"
              className={css.calloutToggle}
              aria-expanded={expanded}
              aria-label={expanded ? msg.timelineCollapseDetail : msg.timelineExpandDetail}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? CHEVRON_UP_13 : CHEVRON_DOWN_13}
            </button>
          ) : null}
        </div>
        {hasBody ? (
          <div
            className={css.calloutBody}
            hidden={Boolean(props.collapsible && !expanded)}
            style={props.collapsible && !expanded ? { display: 'none' } : undefined}
          >
            {message.trim() !== '' ? <DshMarkdown text={message} variant="compact" /> : null}
            {props.child ? renderChildRef(buildChild, props.child) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
})

export const DshKeyValueImpl = defineComponent<{
  items?: unknown
  title?: unknown
  columns?: number
  bordered?: boolean
  copyable?: boolean
  weight?: number
}>(KeyValueApi, function DshKeyValue({ props }) {
  const msg = useRuntimeMessages()
  const entries = useMemo(
    () => normalizeKeyValueItems(props.items, Boolean(props.copyable)),
    [props.items, props.copyable],
  )
  const [copiedIdx, markCopiedIdx] = useTransientKey<number>(1300)
  const cols =
    typeof props.columns === 'number' && props.columns >= 1 && props.columns <= 4
      ? Math.trunc(props.columns)
      : 2
  const bordered = Boolean(props.bordered)
  const headerTitle = props.title ? String(props.title) : ''

  const handleCopy = (idx: number, text: string) => {
    copyToClipboardSafe(text)
    markCopiedIdx(idx)
  }

  const computeSpansForCols = (targetCols: number): number[] => {
    const spans = new Array<number>(entries.length).fill(1)
    let cursor = 0
    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx]!
      const explicitSpan = entry.span
        ? Math.min(targetCols, Math.max(1, Math.trunc(entry.span)))
        : undefined
      if (explicitSpan !== undefined) {
        if (cursor > 0 && cursor + explicitSpan > targetCols && idx > 0) {
          spans[idx - 1] = (spans[idx - 1] ?? 1) + (targetCols - cursor)
          cursor = 0
        }
        spans[idx] = explicitSpan
        cursor = (cursor + explicitSpan) % targetCols
        continue
      }
      if (idx === entries.length - 1) {
        const remaining = targetCols - cursor
        spans[idx] = Math.max(remaining, 1)
        continue
      }
      spans[idx] = 1
      cursor = (cursor + 1) % targetCols
    }
    return spans
  }

  const entrySpans = useMemo(() => computeSpansForCols(cols), [entries, cols])
  const entrySpans2 = useMemo(() => computeSpansForCols(Math.min(cols, 2)), [entries, cols])

  return (
    <div
      className={bordered ? `${css.kvCard} ${css.kvCardBordered}` : css.kvCard}
      style={weightStyle(props.weight, 200)}
      data-a2ui-keyvalue=""
      data-bordered={bordered ? 'true' : 'false'}
    >
      {headerTitle ? (
        <div className={bordered ? css.kvTitleBordered : css.kvTitle}>{headerTitle}</div>
      ) : null}
      <dl
        className={bordered ? css.kvGridBordered : css.kvGrid}
        style={{ '--kv-cols': cols } as CSSProperties}
      >
        {entries.map((entry, idx) => {
          const spanCols = entrySpans[idx] ?? 1
          const spanCols2 = entrySpans2[idx] ?? 1
          const cellStyle =
            spanCols > 1 || spanCols2 > 1
              ? ({
                  ...(spanCols > 1 ? { '--kv-span': spanCols } : {}),
                  ...(spanCols2 !== spanCols ? { '--kv-span-2': spanCols2 } : {}),
                } as CSSProperties)
              : undefined
          return (
            <div
              key={`${entry.label}-${idx}`}
              className={bordered ? css.kvCellBordered : css.kvCell}
              data-kv-span={spanCols > 1 ? String(spanCols) : undefined}
              data-kv-span-2={spanCols2 !== spanCols ? String(spanCols2) : undefined}
              style={cellStyle}
            >
              <dt className={bordered ? css.kvLabelBordered : css.kvLabel}>{entry.label}</dt>
              <dd
                className={
                  bordered
                    ? entry.mono
                      ? `${css.kvValueBordered} ${css.kvMono}`
                      : css.kvValueBordered
                    : entry.mono
                      ? `${css.kvValue} ${css.kvMono}`
                      : css.kvValue
                }
              >
                {entry.tone ? (
                  <DshTag tone={entry.tone}>{entry.value}</DshTag>
                ) : (
                  <span>{entry.value}</span>
                )}
                {entry.copyable && entry.value !== '' ? (
                  <button
                    type="button"
                    className={css.kvCopyBtn}
                    onClick={() => handleCopy(idx, entry.value)}
                    title={msg.kvCopyItemTitle}
                  >
                    {copiedIdx === idx ? msg.copied : msg.copy}
                  </button>
                ) : null}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
})
