/**
 * P0 DSH-native DevOps, review, and workflow components:
 * - `DiffView`: LCS line-by-line diff viewer (Unified & Split modes + copy toolbar)
 * - `Steps`: Multi-stage workflow stepper / incident timeline (`vertical` & `horizontal`)
 * - `Callout`: Semantic alert banner (`info` | `success` | `warning` | `danger`) + optional nested `child`
 * - `KeyValue`: Structured attribute grid (accepts array or plain map + 1-click value copy)
 */
import { useMemo, useState, type CSSProperties, type FC, type ReactNode } from 'react'
import {
  createComponentImplementation,
  type ReactA2uiComponentProps,
  type ReactCatalogComponent,
} from '@a2ui/react'
import type { ComponentApi } from '@a2ui/web_core/v1_0'
import { CalloutApi, DiffViewApi, KeyValueApi, StepsApi } from '../../shared/catalog-schema.ts'
import { parseFileTarget } from '../file-opener.tsx'
import { useRuntimeMessages, useUiLocale } from '../i18n.ts'
import { DshChevronDownIcon, DshChevronUpIcon, DshMarkdown, DshTag } from '../ui/primitives.tsx'
import { FileOpenChip } from './FileOpenChip.tsx'
import {
  computeLineDiff,
  normalizeKeyValueItems,
  normalizeStepItems,
  pairSplitDiffRows,
} from './p0-helpers.ts'
import css from './Catalog.module.css'

type ChildRef =
  | string
  | { readonly id: string; readonly basePath?: string | undefined }
  | null
  | undefined

function defineComponent<Props>(
  api: ComponentApi,
  render: FC<ReactA2uiComponentProps<Props>>,
): ReactCatalogComponent {
  return createComponentImplementation(api as never, render as never)
}

function weightStyle(weight: number | undefined, minWidth = 0): CSSProperties | undefined {
  if (weight === undefined) return undefined
  return { flexGrow: weight, flexBasis: 0, minWidth }
}

function renderChildRef(
  buildChild: (id: string, basePath?: string) => ReactNode,
  ref: ChildRef,
): ReactNode {
  if (!ref) return null
  return typeof ref === 'string' ? buildChild(ref) : buildChild(ref.id, ref.basePath)
}

function copyToClipboardSafe(text: string): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => {})
  }
}

/* ─────────────────────────── 1. DiffView ─────────────────────────── */

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
  const [mode, setMode] = useState<'unified' | 'split'>(
    props.mode === 'split' ? 'split' : 'unified',
  )
  const [copied, setCopied] = useState(false)

  const diff = useMemo(() => computeLineDiff(beforeStr, afterStr), [beforeStr, afterStr])
  const splitRows = useMemo(
    () => (mode === 'split' ? pairSplitDiffRows(diff.ops) : []),
    [diff.ops, mode],
  )

  const hasFileLink = parseFileTarget(props.filePath, props.line) !== null
  const title = props.title ? String(props.title) : hasFileLink ? '' : msg.diffDefaultTitle

  const handleCopyAfter = () => {
    copyToClipboardSafe(afterStr)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
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
          <table className={css.diffTable}>
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

/* ─────────────────────────── 2. Steps ─────────────────────────── */

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

/* ─────────────────────────── 3. Callout ─────────────────────────── */

function CalloutGlyph({ tone }: { readonly tone: 'info' | 'success' | 'warning' | 'danger' }) {
  if (tone === 'success') {
    return (
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
  }
  if (tone === 'warning' || tone === 'danger') {
    return (
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
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.2V11.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="5" r="0.85" fill="currentColor" />
    </svg>
  )
}

export const DshCalloutImpl = defineComponent<{
  title?: unknown
  message?: unknown
  tone?: 'info' | 'success' | 'warning' | 'danger'
  collapsible?: boolean
  child?: ChildRef
  weight?: number
}>(CalloutApi, function DshCallout({ props, buildChild }) {
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
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <DshChevronUpIcon size={13} /> : <DshChevronDownIcon size={13} />}
            </button>
          ) : null}
        </div>
        {hasBody && (!props.collapsible || expanded) ? (
          <div className={css.calloutBody}>
            {message.trim() !== '' ? <DshMarkdown text={message} variant="compact" /> : null}
            {props.child ? renderChildRef(buildChild, props.child) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
})

/* ─────────────────────────── 4. KeyValue ─────────────────────────── */

export const DshKeyValueImpl = defineComponent<{
  items?: unknown
  title?: unknown
  columns?: number
  copyable?: boolean
  weight?: number
}>(KeyValueApi, function DshKeyValue({ props }) {
  const msg = useRuntimeMessages()
  const entries = useMemo(
    () => normalizeKeyValueItems(props.items, Boolean(props.copyable)),
    [props.items, props.copyable],
  )
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const cols =
    typeof props.columns === 'number' && props.columns >= 1 && props.columns <= 3
      ? Math.trunc(props.columns)
      : 2
  const headerTitle = props.title ? String(props.title) : ''

  const handleCopy = (idx: number, text: string) => {
    copyToClipboardSafe(text)
    setCopiedIdx(idx)
    setTimeout(() => {
      setCopiedIdx((prev) => (prev === idx ? null : prev))
    }, 1300)
  }

  return (
    <div className={css.kvCard} style={weightStyle(props.weight, 200)} data-a2ui-keyvalue="">
      {headerTitle ? <div className={css.kvTitle}>{headerTitle}</div> : null}
      <dl className={css.kvGrid} style={{ '--kv-cols': cols } as CSSProperties}>
        {entries.map((entry, idx) => {
          const remainder = entries.length % cols
          const spanCols = remainder !== 0 && idx === entries.length - 1 ? cols - remainder + 1 : 1
          return (
            <div
              key={`${entry.label}-${idx}`}
              className={css.kvCell}
              style={spanCols > 1 ? ({ '--kv-span': spanCols } as CSSProperties) : undefined}
            >
              <dt className={css.kvLabel}>{entry.label}</dt>
              <dd className={entry.mono ? `${css.kvValue} ${css.kvMono}` : css.kvValue}>
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
