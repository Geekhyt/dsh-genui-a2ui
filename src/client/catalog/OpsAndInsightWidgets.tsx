/**
 * 7 v3 A2UI 1.0 Engineering, Decision & Observability Components:
 * - `Comparison`: Side-by-side option trade-off matrix with recommended column & selection action
 * - `LogViewer`: Diagnostic log & stack-trace console with level pills, deferred search, and sidebar file jump
 * - `Timeline`: Chronological incident/audit stream with status dots, collapsible details, and nested `ChildSchema`
 * - `Kanban`: Multi-lane task/remediation board with priority badges and card drill-down action
 * - `SourceList`: Numbered RAG/web citation & workspace code evidence list with relevance bars
 * - `MetricRing`: Zero-chunk SVG radial progress/SLO ring card (~0 kB bundle cost)
 * - `ServiceGraph`: Live health-colored service/module dependency DAG with interactive node inspector
 */
import { useContext, useDeferredValue, useId, useMemo, useState } from 'react'
import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import {
  ComparisonApi,
  KanbanApi,
  LogViewerApi,
  MetricRingApi,
  ServiceGraphApi,
  SourceListApi,
  TimelineApi,
} from '../../shared/catalog-schema.ts'
import { useRuntimeMessages } from '../i18n.ts'
import {
  DshButton,
  DshInput,
  DshLinkIcon,
  DshMarkdown,
  DshPill,
  DshSearchIcon,
  DshTag,
  type TagTone,
} from '../ui/primitives.tsx'
import css from './Catalog.module.css'
import { FileOpenChip } from './FileOpenChip.tsx'
import {
  buildServiceGraphLayout,
  computeMetricRingGeometry,
  normalizeComparisonData,
  normalizeKanbanColumns,
  normalizeLogEntries,
  normalizeSourceItems,
  type KanbanPriority,
  type LogLevel,
  type ServiceHealthStatus,
} from './v3-helpers.ts'
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

const SEARCH_ICON_14 = <DshSearchIcon size={14} />

const CHECK_BADGE_GLYPH = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" fill="currentColor" fillOpacity="0.14" />
    <path
      d="M5.1 8.2L7.0 10.1L10.9 6.1"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const WARN_BADGE_GLYPH = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" fill="currentColor" fillOpacity="0.14" />
    <path d="M8 5.2V8.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="8" cy="11.1" r="0.9" fill="currentColor" />
  </svg>
)

const CROSS_BADGE_GLYPH = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" fill="currentColor" fillOpacity="0.12" />
    <path
      d="M5.8 5.8L10.2 10.2M10.2 5.8L5.8 10.2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
)

const EXTERNAL_ARROW_GLYPH = (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M5.5 3.5H12.5V10.5M12.2 3.8L4.2 11.8"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/* ─────────────────────────── 1. Comparison ─────────────────────────── */

export const DshComparisonImpl = defineComponent<{
  options?: unknown
  rows?: unknown
  title?: unknown
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(ComparisonApi, function DshComparison({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { options, rows } = useMemo(
    () => normalizeComparisonData(props.options, props.rows),
    [props.options, props.rows],
  )
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const canAct = !readOnly && typeof props.action === 'function'
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''

  if (options.length === 0) return null

  const handleSelectOption = (opt: (typeof options)[number]) => {
    if (!canAct) return
    setSelectedKey(opt.key)
    void props.action?.({
      metadata: {
        extensions: {
          dshSelection: {
            source: 'comparison',
            label: opt.title,
            value: opt.badge ?? opt.subtitle,
            key: opt.key,
            option: opt.raw,
          },
        },
      },
    })
  }

  return (
    <div
      className={css.comparisonCard}
      style={weightStyle(props.weight, 260)}
      data-a2ui-comparison=""
    >
      {title ? (
        <div className={css.comparisonHeader}>
          <span className={css.comparisonTitle}>{title}</span>
        </div>
      ) : null}
      <div className={css.comparisonScroll}>
        <table className={css.comparisonTable}>
          <thead>
            <tr>
              <th className={css.comparisonCornerTh}>{msg.comparisonDimension}</th>
              {options.map((opt) => (
                <th
                  key={opt.key}
                  className={css.comparisonOptionTh}
                  data-recommended={opt.recommended ? 'true' : 'false'}
                >
                  <div className={css.comparisonOptionHead}>
                    <div className={css.comparisonOptionTitleRow}>
                      <span className={css.comparisonOptionTitle}>{opt.title}</span>
                      {opt.recommended ? (
                        <DshTag tone="info">{msg.comparisonRecommended}</DshTag>
                      ) : null}
                      {opt.badge ? <DshTag tone="neutral">{opt.badge}</DshTag> : null}
                    </div>
                    {opt.subtitle ? (
                      <span className={css.comparisonOptionSubtitle}>{opt.subtitle}</span>
                    ) : null}
                    {opt.summary ? (
                      <span className={css.comparisonOptionSummary}>{opt.summary}</span>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={`${row.label}-${rIdx}`} className={css.comparisonTr}>
                <td className={css.comparisonDimTd}>{row.label}</td>
                {options.map((opt) => {
                  const cell = row.cells[opt.key] ?? { kind: 'plain', text: '—' }
                  return (
                    <td
                      key={opt.key}
                      className={css.comparisonValTd}
                      data-recommended={opt.recommended ? 'true' : 'false'}
                      data-semantic={cell.kind}
                    >
                      <span className={css.comparisonCellInner}>
                        {cell.kind === 'ok' ? (
                          <span className={css.comparisonSemanticIcon} data-semantic="ok">
                            {CHECK_BADGE_GLYPH}
                          </span>
                        ) : cell.kind === 'warn' ? (
                          <span className={css.comparisonSemanticIcon} data-semantic="warn">
                            {WARN_BADGE_GLYPH}
                          </span>
                        ) : cell.kind === 'no' ? (
                          <span className={css.comparisonSemanticIcon} data-semantic="no">
                            {CROSS_BADGE_GLYPH}
                          </span>
                        ) : null}
                        {cell.text ? <span>{cell.text}</span> : null}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          {canAct ? (
            <tfoot>
              <tr>
                <td className={css.comparisonFooterDimTd} />
                {options.map((opt) => {
                  const chosen = selectedKey === opt.key
                  return (
                    <td
                      key={opt.key}
                      className={css.comparisonFooterTd}
                      data-recommended={opt.recommended ? 'true' : 'false'}
                    >
                      <DshButton
                        size="sm"
                        variant={opt.recommended || chosen ? 'primary' : 'outline'}
                        style={{ width: '100%' }}
                        onClick={() => handleSelectOption(opt)}
                      >
                        {chosen
                          ? msg.comparisonSelectedOption
                          : opt.recommended
                            ? msg.comparisonChooseRecommended
                            : msg.comparisonChoosePlan}
                      </DshButton>
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  )
})

/* ─────────────────────────── 2. LogViewer ─────────────────────────── */

const LOG_LEVEL_TONE: Record<LogLevel, TagTone> = {
  error: 'danger',
  warn: 'warning',
  info: 'info',
  debug: 'neutral',
}

export const DshLogViewerImpl = defineComponent<{
  entries?: unknown
  title?: unknown
  searchable?: boolean
  defaultLevel?: 'all' | 'error' | 'warn' | 'info' | 'debug'
  maxHeight?: number
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(LogViewerApi, function DshLogViewer({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const entries = useMemo(() => normalizeLogEntries(props.entries), [props.entries])
  const [levelFilter, setLevelFilter] = useState<'all' | LogLevel>(props.defaultLevel ?? 'all')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => {
    const firstErr = entries.find((e) => e.level === 'error' && e.detail !== '')
    return firstErr ? new Set([firstErr.id]) : new Set()
  })
  const [copiedAll, setCopiedAll] = useState(false)

  const counts = useMemo(() => {
    const c = { all: entries.length, error: 0, warn: 0, info: 0, debug: 0 }
    for (const e of entries) c[e.level] += 1
    return c
  }, [entries])

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return entries.filter((e) => {
      if (levelFilter !== 'all' && e.level !== levelFilter) return false
      if (!q) return true
      return (
        e.message.toLowerCase().includes(q) ||
        e.service.toLowerCase().includes(q) ||
        e.detail.toLowerCase().includes(q) ||
        (e.filePath ? e.filePath.toLowerCase().includes(q) : false)
      )
    })
  }, [entries, levelFilter, deferredQuery])

  const searchable = props.searchable !== false
  const canAct = !readOnly && typeof props.action === 'function'
  const title =
    props.title !== undefined && props.title !== null && String(props.title) !== ''
      ? String(props.title)
      : msg.logDefaultTitle
  const maxHeight =
    typeof props.maxHeight === 'number' && props.maxHeight >= 140 && props.maxHeight <= 720
      ? Math.round(props.maxHeight)
      : 320

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCopyVisible = () => {
    const text = filtered
      .map(
        (e) =>
          `${e.time ? `${e.time} ` : ''}[${e.level.toUpperCase()}]${e.service ? ` [${e.service}]` : ''} ${e.message}${e.detail ? `\n${e.detail}` : ''}`,
      )
      .join('\n')
    copyToClipboardSafe(text)
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 1300)
  }

  return (
    <div className={css.logCard} style={weightStyle(props.weight, 240)} data-a2ui-logviewer="">
      <div className={css.logHeader}>
        <div className={css.logTitleGroup}>
          <span
            className={css.logConsoleDot}
            data-has-error={counts.error > 0 ? 'true' : 'false'}
          />
          <span className={css.logTitle}>{title}</span>
          <span className={css.logCountMeta}>{msg.logEntryCount(filtered.length)}</span>
        </div>
        <button type="button" className={css.diffCopyBtn} onClick={handleCopyVisible}>
          {copiedAll ? msg.copiedCheck : msg.logCopyAll}
        </button>
      </div>

      {searchable ? (
        <div className={css.logFilterBar}>
          <div className={css.logLevelPills} role="group">
            {(['all', 'error', 'warn', 'info', 'debug'] as const).map((lv) => {
              const count = counts[lv]
              if (lv !== 'all' && count === 0) return null
              const labelText =
                lv === 'all' ? `${msg.logAllLevels} (${count})` : `${lv.toUpperCase()} (${count})`
              return (
                <DshPill key={lv} active={levelFilter === lv} onClick={() => setLevelFilter(lv)}>
                  {labelText}
                </DshPill>
              )
            })}
          </div>
          <div className={css.logSearchInputWrap}>
            <DshInput
              icon={SEARCH_ICON_14}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={msg.logSearchPlaceholder}
              aria-label={msg.logSearchPlaceholder}
            />
          </div>
        </div>
      ) : null}

      <div className={css.logViewport} style={{ maxHeight }}>
        {filtered.length === 0 ? (
          <div className={css.emptyCell}>{msg.logEmpty}</div>
        ) : (
          filtered.map((entry) => {
            const hasExtra = entry.detail !== '' || Boolean(entry.filePath) || canAct
            const expanded = expandedIds.has(entry.id)
            return (
              <div
                key={entry.id}
                className={css.logRow}
                data-level={entry.level}
                data-expanded={expanded ? 'true' : 'false'}
              >
                <div
                  className={css.logRowMain}
                  onClick={hasExtra ? () => toggleExpand(entry.id) : undefined}
                  style={{ cursor: hasExtra ? 'pointer' : 'default' }}
                >
                  {entry.time ? <span className={css.logTime}>{entry.time}</span> : null}
                  <span className={css.logBadgeWrap}>
                    <DshTag tone={LOG_LEVEL_TONE[entry.level]}>{entry.level.toUpperCase()}</DshTag>
                  </span>
                  {entry.service ? <span className={css.logService}>[{entry.service}]</span> : null}
                  <span className={css.logMessage}>{entry.message}</span>
                  {entry.detail ? (
                    <button
                      type="button"
                      className={css.logDetailToggle}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleExpand(entry.id)
                      }}
                    >
                      {expanded ? msg.logCollapseDetail : msg.logExpandDetail}
                    </button>
                  ) : null}
                </div>
                {expanded && hasExtra ? (
                  <div className={css.logDetailDrawer}>
                    {entry.detail ? <pre className={css.logStackPre}>{entry.detail}</pre> : null}
                    <div className={css.logDetailFooter}>
                      {entry.filePath ? (
                        <FileOpenChip filePath={entry.filePath} line={entry.line} />
                      ) : null}
                      {canAct ? (
                        <DshButton
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            void props.action?.({
                              metadata: {
                                extensions: {
                                  dshSelection: {
                                    source: 'logViewer',
                                    label: entry.message.slice(0, 80),
                                    series: entry.service || entry.level.toUpperCase(),
                                    level: entry.level,
                                    filePath: entry.filePath,
                                    line: entry.line,
                                    entry,
                                  },
                                },
                              },
                            })
                          }}
                        >
                          {msg.serviceGraphInspect}
                        </DshButton>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
})

/* ─────────────────────────── 3. Timeline ─────────────────────────── */

interface TimelineItemInput {
  readonly time?: unknown
  readonly title?: unknown
  readonly description?: unknown
  readonly actor?: unknown
  readonly status?: 'info' | 'success' | 'warning' | 'danger' | 'pending'
  readonly tag?: unknown
  readonly detail?: unknown
  readonly child?: ChildRef
}

export const DshTimelineImpl = defineComponent<{
  items?: readonly TimelineItemInput[]
  title?: unknown
  badge?: unknown
  weight?: number
}>(TimelineApi, function DshTimeline({ props, buildChild }) {
  const msg = useRuntimeMessages()
  const items = props.items ?? []
  const [openDetails, setOpenDetails] = useState<ReadonlySet<number>>(() => new Set())

  if (items.length === 0) return null

  const headerTitle = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const headerBadge = props.badge !== undefined && props.badge !== null ? String(props.badge) : ''

  const toggleDetail = (idx: number) => {
    setOpenDetails((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <div className={css.timelineCard} style={weightStyle(props.weight, 220)} data-a2ui-timeline="">
      {headerTitle || headerBadge ? (
        <div className={css.timelineHeader}>
          <span className={css.timelineTitle}>{headerTitle}</span>
          {headerBadge ? <DshTag tone="info">{headerBadge}</DshTag> : null}
        </div>
      ) : null}
      <ol className={css.timelineList}>
        {items.map((item, idx) => {
          const status = item.status ?? 'info'
          const time = item.time !== undefined && item.time !== null ? String(item.time) : ''
          const title = item.title !== undefined && item.title !== null ? String(item.title) : ''
          const desc =
            item.description !== undefined && item.description !== null
              ? String(item.description)
              : ''
          const actor = item.actor !== undefined && item.actor !== null ? String(item.actor) : ''
          const tag = item.tag !== undefined && item.tag !== null ? String(item.tag) : ''
          const detail =
            item.detail !== undefined && item.detail !== null ? String(item.detail) : ''
          const detailOpen = openDetails.has(idx)

          return (
            <li key={`${title}-${idx}`} className={css.timelineItem} data-status={status}>
              <div className={css.timelineRail}>
                <span className={css.timelineNodeDot} data-status={status} aria-hidden="true" />
                {idx < items.length - 1 ? <span className={css.timelineConnector} /> : null}
              </div>
              <div className={css.timelineBody}>
                <div className={css.timelineHeadlineRow}>
                  <div className={css.timelineTitleGroup}>
                    {time ? <span className={css.timelineTime}>{time}</span> : null}
                    <span className={css.timelineItemTitle}>{title}</span>
                    {tag ? (
                      <DshTag
                        tone={
                          status === 'danger'
                            ? 'danger'
                            : status === 'warning'
                              ? 'warning'
                              : status === 'success'
                                ? 'success'
                                : 'neutral'
                        }
                      >
                        {tag}
                      </DshTag>
                    ) : null}
                  </div>
                  {actor ? <span className={css.timelineActor}>@{actor}</span> : null}
                </div>
                {desc ? (
                  <div className={css.timelineDesc}>
                    <DshMarkdown text={desc} variant="compact" />
                  </div>
                ) : null}
                {detail ? (
                  <div className={css.timelineDetailWrap}>
                    <button
                      type="button"
                      className={css.logDetailToggle}
                      onClick={() => toggleDetail(idx)}
                    >
                      {detailOpen ? msg.timelineCollapseDetail : msg.timelineExpandDetail}
                    </button>
                    {detailOpen ? <pre className={css.timelineDetailPre}>{detail}</pre> : null}
                  </div>
                ) : null}
                {item.child ? (
                  <div className={css.timelineChildSlot}>
                    {renderChildRef(buildChild, item.child)}
                  </div>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
})

/* ─────────────────────────── 4. Kanban ─────────────────────────── */

const PRIORITY_TONE: Record<KanbanPriority, TagTone> = {
  high: 'danger',
  medium: 'warning',
  low: 'info',
}

export const DshKanbanImpl = defineComponent<{
  columns?: unknown
  title?: unknown
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(KanbanApi, function DshKanban({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const columns = useMemo(() => normalizeKanbanColumns(props.columns), [props.columns])
  const canAct = !readOnly && typeof props.action === 'function'
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''

  if (columns.length === 0) return null

  const priorityLabel = (p: KanbanPriority) =>
    p === 'high'
      ? msg.kanbanPriorityHigh
      : p === 'medium'
        ? msg.kanbanPriorityMedium
        : msg.kanbanPriorityLow

  return (
    <div className={css.kanbanBoardWrap} style={weightStyle(props.weight, 260)} data-a2ui-kanban="">
      {title ? <div className={css.kanbanBoardTitle}>{title}</div> : null}
      <div className={css.kanbanLanes}>
        {columns.map((col) => (
          <div key={col.id} className={css.kanbanLane} data-tone={col.tone}>
            <div className={css.kanbanLaneHeader}>
              <div className={css.kanbanLaneTitleGroup}>
                <span className={css.kanbanLaneDot} data-tone={col.tone} />
                <span className={css.kanbanLaneTitle}>{col.title}</span>
              </div>
              <span className={css.kanbanLaneCount}>{col.cards.length}</span>
            </div>
            <div className={css.kanbanCardList}>
              {col.cards.length === 0 ? (
                <div className={css.kanbanEmpty}>{msg.kanbanEmptyColumn}</div>
              ) : (
                col.cards.map((card) => (
                  <div
                    key={card.id}
                    role={canAct ? 'button' : undefined}
                    tabIndex={canAct ? 0 : undefined}
                    className={
                      canAct
                        ? `${css.kanbanTaskCard} ${css.kanbanTaskInteractive}`
                        : css.kanbanTaskCard
                    }
                    onClick={
                      canAct
                        ? () => {
                            void props.action?.({
                              metadata: {
                                extensions: {
                                  dshSelection: {
                                    source: 'kanban',
                                    label: card.title,
                                    series: col.title,
                                    columnId: col.id,
                                    columnTitle: col.title,
                                    card: card.raw,
                                  },
                                },
                              },
                            })
                          }
                        : undefined
                    }
                    onKeyDown={
                      canAct
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              void props.action?.({
                                metadata: {
                                  extensions: {
                                    dshSelection: {
                                      source: 'kanban',
                                      label: card.title,
                                      series: col.title,
                                      columnId: col.id,
                                      columnTitle: col.title,
                                      card: card.raw,
                                    },
                                  },
                                },
                              })
                            }
                          }
                        : undefined
                    }
                  >
                    {card.priority || card.tag ? (
                      <div className={css.kanbanTaskTags}>
                        {card.priority ? (
                          <DshTag tone={PRIORITY_TONE[card.priority]}>
                            {priorityLabel(card.priority)}
                          </DshTag>
                        ) : null}
                        {card.tag ? <DshTag tone="neutral">{card.tag}</DshTag> : null}
                      </div>
                    ) : null}
                    <div className={css.kanbanTaskTitle}>{card.title}</div>
                    {card.description ? (
                      <div className={css.kanbanTaskDesc}>{card.description}</div>
                    ) : null}
                    {card.assignee || card.meta ? (
                      <div className={css.kanbanTaskFooter}>
                        {card.assignee ? (
                          <span className={css.kanbanAssignee}>{card.assignee}</span>
                        ) : (
                          <span />
                        )}
                        {card.meta ? <span className={css.kanbanMeta}>{card.meta}</span> : null}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

/* ─────────────────────────── 5. SourceList ─────────────────────────── */

export const DshSourceListImpl = defineComponent<{
  items?: unknown
  title?: unknown
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(SourceListApi, function DshSourceList({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const items = useMemo(() => normalizeSourceItems(props.items), [props.items])
  const canAct = !readOnly && typeof props.action === 'function'
  const title =
    props.title !== undefined && props.title !== null && String(props.title) !== ''
      ? String(props.title)
      : msg.sourceListDefaultTitle

  if (items.length === 0) return null

  return (
    <div
      className={css.sourceListCard}
      style={weightStyle(props.weight, 220)}
      data-a2ui-sourcelist=""
    >
      <div className={css.sourceListHeader}>
        <span className={css.sourceListTitle}>{title}</span>
        <DshTag tone="neutral">{items.length}</DshTag>
      </div>
      <ol className={css.sourceItems}>
        {items.map((item) => (
          <li key={item.id} className={css.sourceRow}>
            <span className={css.sourceIndexBadge}>{item.index}</span>
            <div className={css.sourceContent}>
              <div className={css.sourceHeadlineRow}>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={css.sourceTitleLink}
                  >
                    <DshLinkIcon href={item.url} size={14} />
                    <span>{item.title}</span>
                    <span className={css.sourceExternalIcon}>{EXTERNAL_ARROW_GLYPH}</span>
                  </a>
                ) : canAct ? (
                  <button
                    type="button"
                    className={css.sourceTitleBtn}
                    onClick={() => {
                      void props.action?.({
                        metadata: {
                          extensions: {
                            dshSelection: {
                              source: 'sourceList',
                              label: item.title,
                              series: item.domain,
                              item: item.raw,
                            },
                          },
                        },
                      })
                    }}
                  >
                    {item.title}
                  </button>
                ) : (
                  <span className={css.sourceTitleStatic}>{item.title}</span>
                )}
                {item.badge ? <DshTag tone="info">{item.badge}</DshTag> : null}
                {item.scorePercent !== undefined ? (
                  <span
                    className={css.sourceScorePill}
                    title={`${msg.sourceRelevanceLabel} ${item.scorePercent}%`}
                  >
                    {item.scorePercent}%
                  </span>
                ) : null}
              </div>

              <div className={css.sourceMetaRow}>
                {item.domain ? <span className={css.sourceDomain}>{item.domain}</span> : null}
                {item.publishedAt ? (
                  <span className={css.sourcePublished}>{item.publishedAt}</span>
                ) : null}
                {item.filePath ? <FileOpenChip filePath={item.filePath} line={item.line} /> : null}
              </div>

              {item.snippet ? <p className={css.sourceSnippet}>{item.snippet}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
})

/* ─────────────────────────── 6. MetricRing ─────────────────────────── */

export const DshMetricRingImpl = defineComponent<{
  label?: unknown
  value?: unknown
  max?: number
  unit?: unknown
  sublabel?: unknown
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'auto'
  size?: number
  weight?: number
}>(MetricRingApi, function DshMetricRing({ props }) {
  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const sublabel =
    props.sublabel !== undefined && props.sublabel !== null ? String(props.sublabel) : ''
  const maxVal = typeof props.max === 'number' && props.max > 0 ? props.max : 100
  const unit =
    props.unit !== undefined && props.unit !== null ? String(props.unit) : maxVal === 100 ? '%' : ''
  const geom = useMemo(
    () =>
      computeMetricRingGeometry({
        value: props.value,
        max: props.max,
        size: props.size,
        tone: props.tone,
        unit,
      }),
    [props.value, props.max, props.size, props.tone, unit],
  )
  const center = geom.size / 2

  return (
    <div
      className={css.metricRingCard}
      style={weightStyle(props.weight, 140)}
      data-a2ui-metricring=""
      data-tone={geom.resolvedTone}
    >
      <div
        className={css.metricRingFigure}
        style={{ width: geom.size, height: geom.size }}
        role="meter"
        aria-label={label}
        aria-valuenow={Number(props.value) || 0}
        aria-valuemin={0}
        aria-valuemax={maxVal}
      >
        <svg
          width={geom.size}
          height={geom.size}
          viewBox={`0 0 ${geom.size} ${geom.size}`}
          aria-hidden="true"
        >
          <circle
            cx={center}
            cy={center}
            r={geom.radius}
            fill="none"
            className={css.metricRingTrack}
            strokeWidth={geom.strokeWidth}
          />
          <circle
            cx={center}
            cy={center}
            r={geom.radius}
            fill="none"
            className={css.metricRingArc}
            data-tone={geom.resolvedTone}
            strokeWidth={geom.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={geom.circumference}
            strokeDashoffset={geom.dashOffset}
            transform={`rotate(-90 ${center} ${center})`}
          />
        </svg>
        <div className={css.metricRingCenterText}>
          <span
            className={css.metricRingValueGroup}
            style={
              geom.stackUnit ? { flexDirection: 'column', alignItems: 'center', gap: 1 } : undefined
            }
          >
            <span className={css.metricRingNumber} style={{ fontSize: geom.numberFontSize }}>
              {geom.displayNumber}
            </span>
            {unit ? (
              <span className={css.metricRingUnit} style={{ fontSize: geom.unitFontSize }}>
                {unit}
              </span>
            ) : null}
          </span>
        </div>
      </div>
      <div className={css.metricRingMeta}>
        <span className={css.metricRingLabel}>{label}</span>
        {sublabel ? <span className={css.metricRingSublabel}>{sublabel}</span> : null}
      </div>
    </div>
  )
})

/* ─────────────────────────── 7. ServiceGraph ─────────────────────────── */

export const DshServiceGraphImpl = defineComponent<{
  nodes?: unknown
  edges?: unknown
  title?: unknown
  direction?: 'LR' | 'TB'
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(ServiceGraphApi, function DshServiceGraph({ props }) {
  const markerPrefix = useId().replace(/:/g, '')
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const direction = props.direction === 'TB' ? 'TB' : 'LR'
  const layout = useMemo(
    () => buildServiceGraphLayout(props.nodes, props.edges, direction),
    [props.nodes, props.edges, direction],
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const canAct = !readOnly && typeof props.action === 'function'
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''

  const activeNode = useMemo(() => {
    if (!selectedNodeId) {
      const degraded = layout.nodes.find((n) => n.status === 'error' || n.status === 'warning')
      return degraded ?? layout.nodes[0] ?? null
    }
    return layout.nodes.find((n) => n.id === selectedNodeId) ?? layout.nodes[0] ?? null
  }, [layout.nodes, selectedNodeId])

  const nodeLabelMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of layout.nodes) m.set(n.id, n.label)
    return m
  }, [layout.nodes])

  if (layout.nodes.length === 0) return null

  const statusText = (s: ServiceHealthStatus) =>
    s === 'error'
      ? msg.serviceGraphError
      : s === 'warning'
        ? msg.serviceGraphWarning
        : s === 'unknown'
          ? msg.serviceGraphUnknown
          : msg.serviceGraphHealthy

  const statusTone = (s: ServiceHealthStatus): TagTone =>
    s === 'error' ? 'danger' : s === 'warning' ? 'warning' : s === 'unknown' ? 'neutral' : 'success'

  const upstreamIds = activeNode ? (layout.upstreamByNode.get(activeNode.id) ?? []) : []
  const downstreamIds = activeNode ? (layout.downstreamByNode.get(activeNode.id) ?? []) : []

  return (
    <div
      className={css.serviceGraphCard}
      style={weightStyle(props.weight, 260)}
      data-a2ui-servicegraph=""
    >
      <div className={css.serviceGraphHeader}>
        <span className={css.serviceGraphTitle}>{title || 'Service Topology'}</span>
        <div className={css.serviceGraphLegend}>
          <span className={css.serviceLegendItem} data-status="healthy">
            <i /> {msg.serviceGraphHealthy}
          </span>
          <span className={css.serviceLegendItem} data-status="warning">
            <i /> {msg.serviceGraphWarning}
          </span>
          <span className={css.serviceLegendItem} data-status="error">
            <i /> {msg.serviceGraphError}
          </span>
        </div>
      </div>

      <div className={css.serviceGraphViewport}>
        <div
          className={css.serviceGraphCanvas}
          style={{ width: layout.width, height: layout.height }}
        >
          <svg
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className={css.serviceGraphSvg}
            aria-hidden="true"
          >
            <defs>
              {(['healthy', 'warning', 'error'] as const).map((st) => (
                <marker
                  key={st}
                  id={`${markerPrefix}-arrow-${st}`}
                  viewBox="0 0 10 10"
                  refX="8.5"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 0 1.5 L 9 5 L 0 8.5 z"
                    className={css.serviceEdgeArrow}
                    data-status={st}
                  />
                </marker>
              ))}
            </defs>
            {layout.edges.map((edge) => {
              const isHighlighted =
                activeNode !== null && (edge.from === activeNode.id || edge.to === activeNode.id)
              return (
                <path
                  key={edge.id}
                  d={edge.pathD}
                  fill="none"
                  className={css.serviceEdgePath}
                  data-status={edge.status}
                  data-highlight={isHighlighted ? 'true' : 'false'}
                  markerEnd={`url(#${markerPrefix}-arrow-${edge.status})`}
                />
              )
            })}
          </svg>

          {layout.nodes.map((node) => {
            const isSelected = activeNode?.id === node.id
            return (
              <button
                key={node.id}
                type="button"
                className={css.serviceNodeBox}
                data-status={node.status}
                data-selected={isSelected ? 'true' : 'false'}
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                }}
                onClick={() => setSelectedNodeId(node.id)}
              >
                <span className={css.serviceNodeTop}>
                  <span className={css.serviceNodeDot} data-status={node.status} />
                  <span className={css.serviceNodeName} title={node.label}>
                    {node.label}
                  </span>
                </span>
                {node.metric || node.sublabel ? (
                  <span className={css.serviceNodeBottom}>
                    {node.sublabel ? (
                      <span className={css.serviceNodeSub} title={node.sublabel}>
                        {node.sublabel}
                      </span>
                    ) : null}
                    {node.metric ? (
                      <span className={css.serviceNodeMetric}>{node.metric}</span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            )
          })}

          {layout.edges.some((e) => Boolean(e.label)) ? (
            <svg
              width={layout.width}
              height={layout.height}
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              className={css.serviceGraphLabelSvg}
              aria-hidden="true"
            >
              {layout.edges.map((edge) =>
                edge.label ? (
                  <g key={edge.id} transform={`translate(${edge.labelX}, ${edge.labelY})`}>
                    <rect
                      x={-edge.labelWidth / 2}
                      y={-9}
                      width={edge.labelWidth}
                      height={18}
                      rx={5}
                      className={css.serviceEdgeLabelBg}
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      className={css.serviceEdgeLabelText}
                    >
                      {edge.label}
                    </text>
                  </g>
                ) : null,
              )}
            </svg>
          ) : null}
        </div>
      </div>

      {activeNode ? (
        <div className={css.serviceInspectorBar}>
          <div className={css.serviceInspectorInfo}>
            <span className={css.serviceInspectorName}>{activeNode.label}</span>
            <DshTag tone={statusTone(activeNode.status)}>{statusText(activeNode.status)}</DshTag>
            {activeNode.metric ? (
              <span className={css.serviceInspectorMetric}>{activeNode.metric}</span>
            ) : null}
            <span className={css.serviceInspectorDeps}>
              {msg.serviceGraphUpstream}:{' '}
              {upstreamIds.length > 0
                ? upstreamIds.map((id) => nodeLabelMap.get(id) ?? id).join(', ')
                : msg.serviceGraphNone}
              {' · '}
              {msg.serviceGraphDownstream}:{' '}
              {downstreamIds.length > 0
                ? downstreamIds.map((id) => nodeLabelMap.get(id) ?? id).join(', ')
                : msg.serviceGraphNone}
            </span>
          </div>
          {canAct ? (
            <DshButton
              size="sm"
              variant="outline"
              onClick={() => {
                void props.action?.({
                  metadata: {
                    extensions: {
                      dshSelection: {
                        source: 'serviceGraph',
                        label: activeNode.label,
                        series: statusText(activeNode.status),
                        value: activeNode.metric,
                        nodeId: activeNode.id,
                        status: activeNode.status,
                        node: activeNode.raw,
                      },
                    },
                  },
                })
              }}
            >
              {msg.serviceGraphInspect}
            </DshButton>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})
