import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import { useContext, useDeferredValue, useMemo, useRef, useState } from 'react'
import {
  ComparisonApi,
  KanbanApi,
  LogViewerApi,
  TimelineApi,
} from '../../../shared/catalog-schema.ts'
import { useTransientFlag } from '../../dom-hooks.ts'
import { parseFileTarget } from '../../file-opener.tsx'
import { useRuntimeMessages } from '../../i18n.ts'
import {
  DshButton,
  DshInput,
  DshMarkdown,
  DshPill,
  DshSearchIcon,
  DshTag,
  type TagTone,
} from '../../ui/primitives.tsx'
import css from '../Catalog.module.css'
import { FileOpenChip } from '../FileOpenChip.tsx'
import {
  type KanbanPriority,
  type LogLevel,
  normalizeComparisonData,
  normalizeKanbanColumns,
  normalizeLogEntries,
} from '../v3-helpers.ts'
import {
  type ChildRef,
  copyTextToClipboard,
  defineComponent,
  renderChildRef,
  SurfaceReadOnlyContext,
  useSurfaceActionRunner,
  weightStyle,
} from '../widget-helpers.tsx'

const VALID_LOG_LEVELS = new Set<string>(['all', 'error', 'warn', 'info', 'debug'])

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

export const DshComparisonImpl = defineComponent<{
  options?: unknown
  rows?: unknown
  title?: unknown
  action?: ((options?: ActionDispatchOptions) => unknown) | undefined
  weight?: number
}>(ComparisonApi, function DshComparison({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const runAction = useSurfaceActionRunner(context, props.action)
  const { options, rows } = useMemo(
    () => normalizeComparisonData(props.options, props.rows),
    [props.options, props.rows],
  )
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selectSeqRef = useRef(0)
  const activeSelectedKey =
    selectedKey !== null && options.some((o) => o.key === selectedKey) ? selectedKey : null
  const canAct = !readOnly && Boolean(runAction)
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''

  if (options.length === 0) return null

  const handleSelectOption = (opt: (typeof options)[number]) => {
    if (!canAct || !runAction) return
    const prevKey = activeSelectedKey
    const seq = ++selectSeqRef.current
    setSelectedKey(opt.key)
    void runAction({
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
    }).then((ok) => {
      if (!ok && selectSeqRef.current === seq) setSelectedKey(prevKey)
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
                  const chosen = activeSelectedKey === opt.key
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
}>(LogViewerApi, function DshLogViewer({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const runAction = useSurfaceActionRunner(context, props.action)
  const entries = useMemo(() => normalizeLogEntries(props.entries), [props.entries])
  const rawDefaultLevel =
    typeof props.defaultLevel === 'string' ? props.defaultLevel.trim().toLowerCase() : 'all'
  const propDefaultLevel: 'all' | LogLevel = VALID_LOG_LEVELS.has(rawDefaultLevel)
    ? (rawDefaultLevel as 'all' | LogLevel)
    : 'all'
  const [prevDefaultLevel, setPrevDefaultLevel] = useState<'all' | LogLevel>(propDefaultLevel)
  const [levelFilter, setLevelFilter] = useState<'all' | LogLevel>(propDefaultLevel)
  if (prevDefaultLevel !== propDefaultLevel) {
    setPrevDefaultLevel(propDefaultLevel)
    setLevelFilter(propDefaultLevel)
  }
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const firstErrId = useMemo(
    () => entries.find((e) => e.level === 'error' && e.detail !== '')?.id ?? null,
    [entries],
  )
  const [autoExpandedErr, setAutoExpandedErr] = useState<boolean>(() => firstErrId !== null)
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() =>
    firstErrId !== null ? new Set([firstErrId]) : new Set(),
  )
  if (!autoExpandedErr && firstErrId !== null) {
    setAutoExpandedErr(true)
    if (expandedIds.size === 0) {
      setExpandedIds(new Set([firstErrId]))
    }
  }
  const [copiedAll, markCopiedAll] = useTransientFlag(1300)

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
  const canAct = !readOnly && Boolean(runAction)
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
    copyTextToClipboard(text)
    markCopiedAll()
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
              if (lv !== 'all' && lv !== levelFilter && count === 0) return null
              const labelText =
                lv === 'all' ? `${msg.logAllLevels} (${count})` : `${lv.toUpperCase()} (${count})`
              return (
                <DshPill
                  key={lv}
                  active={levelFilter === lv}
                  aria-pressed={levelFilter === lv}
                  onClick={() => setLevelFilter(lv)}
                >
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
            const hasValidFile = Boolean(
              entry.filePath && parseFileTarget(entry.filePath, entry.line) !== null,
            )
            const hasExtra = entry.detail !== '' || hasValidFile || canAct
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
                  {hasExtra ? (
                    <button
                      type="button"
                      className={css.logDetailToggle}
                      aria-expanded={expanded}
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
                            void runAction?.({
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
  const items = Array.isArray(props.items)
    ? props.items.filter((item): item is TimelineItemInput =>
        Boolean(item && typeof item === 'object'),
      )
    : []
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
                      aria-expanded={detailOpen}
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
}>(KanbanApi, function DshKanban({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const runAction = useSurfaceActionRunner(context, props.action)
  const columns = useMemo(() => normalizeKanbanColumns(props.columns), [props.columns])
  const canAct = !readOnly && Boolean(runAction)
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
                            void runAction?.({
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
                              void runAction?.({
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
