import { type CSSProperties, useMemo, useState } from 'react'
import { CalloutApi, DiffViewApi, KeyValueApi, StepsApi } from '../../shared/catalog-schema.ts'
import { useTransientFlag, useTransientKey } from '../dom-hooks.ts'
import { parseFileTarget } from '../file-opener.tsx'
import { useRuntimeMessages, useUiLocale } from '../i18n.ts'
import { DshChevronDownIcon, DshChevronUpIcon, DshMarkdown, DshTag } from '../ui/primitives.tsx'
import css from './Catalog.module.css'
import { FileOpenChip } from './FileOpenChip.tsx'
import {
  computeLineDiff,
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
  weight?: number
}>(DiffViewApi, function DshDiffView({ props }) {
  const msg = useRuntimeMessages()
  const beforeStr = props.before === undefined || props.before === null ? '' : String(props.before)
  const afterStr = props.after === undefined || props.after === null ? '' : String(props.after)
  const propMode: 'unified' | 'split' = props.mode === 'split' ? 'split' : 'unified'
  const [prevPropMode, setPrevPropMode] = useState<'unified' | 'split'>(propMode)
  const [mode, setMode] = useState<'unified' | 'split'>(propMode)
  if (propMode !== prevPropMode) {
    setPrevPropMode(propMode)
    setMode(propMode)
  }
  const [copied, markCopied] = useTransientFlag(1400)

  const diff = useMemo(() => computeLineDiff(beforeStr, afterStr), [beforeStr, afterStr])
  const splitRows = useMemo(
    () => (mode === 'split' ? pairSplitDiffRows(diff.ops) : []),
    [diff.ops, mode],
  )

  const hasFileLink = parseFileTarget(props.filePath, props.line) !== null
  const title = props.title ? String(props.title) : hasFileLink ? '' : msg.diffDefaultTitle

  const handleCopyAfter = () => {
    copyToClipboardSafe(afterStr)
    markCopied()
  }

  return (
    <div className={css.diffCard} style={weightStyle(props.weight, 240)} data-a2ui-diff="">
      <div className={css.diffToolbar}>
        <div className={css.diffTitleGroup}>
          {title ? <span className={css.diffTitle}>{title}</span> : null}
          <FileOpenChip filePath={props.filePath} line={props.line} />
          {props.language ? <span className={css.diffLang}>{props.language}</span> : null}
          <span className={css.diffStatAdd}>+{diff.added}</span>
          <span className={css.diffStatDel}>-{diff.removed}</span>
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

      <div className={css.diffScroll}>
        {diff.ops.length === 0 ? (
          <div className={css.emptyCell}>{msg.diffEmpty}</div>
        ) : mode === 'unified' ? (
          <table className={css.diffTable}>
            <tbody>
              {diff.ops.map((op, i) => (
                <tr key={i} className={css.diffRow} data-kind={op.kind}>
                  <td className={css.diffGutter}>{op.oldLine ?? ''}</td>
                  <td className={css.diffGutter}>{op.newLine ?? ''}</td>
                  <td className={css.diffMarker}>
                    {op.kind === 'add' ? '+' : op.kind === 'remove' ? '-' : ' '}
                  </td>
                  <td className={css.diffCode}>{op.text || ' '}</td>
                </tr>
              ))}
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
              {splitRows.map((row, i) => (
                <tr key={i} className={css.diffSplitTr}>
                  <td className={css.diffGutter} data-kind={row.left?.kind ?? 'empty'}>
                    {row.left?.oldLine ?? ''}
                  </td>
                  <td className={css.diffSplitCell} data-kind={row.left?.kind ?? 'empty'}>
                    {row.left ? `${row.left.kind === 'remove' ? '- ' : '  '}${row.left.text}` : ''}
                  </td>
                  <td className={css.diffGutter} data-kind={row.right?.kind ?? 'empty'}>
                    {row.right?.newLine ?? ''}
                  </td>
                  <td className={css.diffSplitCell} data-kind={row.right?.kind ?? 'empty'}>
                    {row.right ? `${row.right.kind === 'add' ? '+ ' : '  '}${row.right.text}` : ''}
                  </td>
                </tr>
              ))}
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

  const entrySpans = useMemo(() => {
    const spans = new Array<number>(entries.length).fill(1)
    let cursor = 0
    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx]!
      const explicitSpan = entry.span
        ? Math.min(cols, Math.max(1, Math.trunc(entry.span)))
        : undefined
      if (explicitSpan !== undefined) {
        if (cursor > 0 && cursor + explicitSpan > cols && idx > 0) {
          spans[idx - 1] = (spans[idx - 1] ?? 1) + (cols - cursor)
          cursor = 0
        }
        spans[idx] = explicitSpan
        cursor = (cursor + explicitSpan) % cols
        continue
      }
      if (idx === entries.length - 1) {
        const remaining = cols - cursor
        spans[idx] = Math.max(remaining, 1)
        continue
      }
      spans[idx] = 1
      cursor = (cursor + 1) % cols
    }
    return spans
  }, [entries, cols])

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
          return (
            <div
              key={`${entry.label}-${idx}`}
              className={bordered ? css.kvCellBordered : css.kvCell}
              data-kv-span={spanCols > 1 ? String(spanCols) : undefined}
              style={spanCols > 1 ? ({ '--kv-span': spanCols } as CSSProperties) : undefined}
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
