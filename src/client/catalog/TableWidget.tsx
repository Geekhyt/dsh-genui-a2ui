import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  type SortingState,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { Fragment, memo, useDeferredValue, useMemo, useState } from 'react'
import { safeStringifyJson } from '../../shared/constants.ts'
import type { RuntimeUiMessages } from '../../shared/i18n.ts'
import { useTransientFlag } from '../dom-hooks.ts'
import { useRuntimeMessages } from '../i18n.ts'
import { DshButton, DshInput, DshSearchIcon, DshTag, type TagTone } from '../ui/primitives.tsx'
import css from './Catalog.module.css'
import { buildSparklineGeometry, normalizeSparklinePoints } from './stat-file-helpers.ts'
import {
  compareFormattedNumericCells,
  computeNextCrossFilterValue,
  computeTableNumericSummary,
  detectNumericColumnKeys,
  filterTableRowsByField,
  formatTableToCsv,
  formatTableToMarkdown,
  normalizeCrossFilterTokens,
} from './v4-helpers.ts'
import { weightStyle } from './widget-helpers.tsx'

type RowRecord = Record<string, unknown>

const TABLE_FEATURES = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    formattedNumeric: (rowA, rowB, columnId) =>
      compareFormattedNumericCells(rowA.getValue(columnId), rowB.getValue(columnId)),
  },
  columnMeta: {} as {
    align: 'left' | 'center' | 'right'
    isNumeric: boolean
    wrapProse: boolean
  },
})

const columnHelper = createColumnHelper<typeof TABLE_FEATURES, RowRecord>()
const SEARCH_ICON_14 = <DshSearchIcon size={14} />

export type TableColumnFormat = 'text' | 'badge' | 'bar' | 'delta' | 'sparkline' | 'code'

export interface TableColumnInput {
  readonly key: string
  readonly label: string
  readonly align?: 'left' | 'center' | 'right' | undefined
  readonly sortable?: boolean | undefined
  readonly format?: TableColumnFormat | undefined
  readonly max?: number | undefined
}

export interface TableWidgetProps {
  readonly rows: unknown
  readonly columns?: readonly TableColumnInput[] | undefined
  readonly title?: string | undefined
  readonly searchable?: boolean | undefined
  readonly pageSize?: number | undefined
  readonly exportable?: boolean | undefined
  readonly selectable?: boolean | undefined
  readonly batchLabel?: string | undefined
  readonly showSummary?: boolean | undefined
  readonly expandKey?: string | undefined
  readonly filterField?: string | undefined
  readonly filterValue?: string | readonly string[] | undefined
  readonly onFilterValueChange?: ((next: string | string[]) => void) | undefined
  readonly stickyFirstColumn?: boolean | undefined
  readonly action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  readonly weight?: number | undefined
}

function normalizeRows(rows: unknown): RowRecord[] {
  if (!Array.isArray(rows)) return []
  return rows.filter(
    (r): r is RowRecord => typeof r === 'object' && r !== null && !Array.isArray(r),
  )
}

function estimateVisualUnits(text: string): number {
  let units = 0
  for (const ch of text) {
    units += (ch.codePointAt(0) ?? 0) > 0xff ? 1 : 0.55
  }
  return units
}

function formatCellValue(value: unknown, msg: RuntimeUiMessages): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? msg.boolYes : msg.boolNo
  if (typeof value === 'object') return safeStringifyJson(value, 0)
  return String(value)
}

function formatExpandDetail(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') return safeStringifyJson(value, 2)
  return String(value)
}

function parseNumericScalarForBar(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const cleaned = value.replace(/[¥$€£,%\s]/g, '').trim()
    if (cleaned === '' || cleaned === '-' || cleaned === '—') return null
    const num = Number(cleaned)
    return Number.isFinite(num) ? num : null
  }
  return null
}

function resolveBadgeCellTone(rawText: string): { readonly label: string; readonly tone: TagTone } {
  const trimmed = rawText.trim()
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('ok:')) return { label: trimmed.slice(3).trim(), tone: 'success' }
  if (lower.startsWith('warn:')) return { label: trimmed.slice(5).trim(), tone: 'warning' }
  if (lower.startsWith('no:') || lower.startsWith('err:')) {
    const idx = trimmed.indexOf(':')
    return { label: trimmed.slice(idx + 1).trim(), tone: 'danger' }
  }
  if (lower.startsWith('info:')) return { label: trimmed.slice(5).trim(), tone: 'info' }
  if (
    /(?:正常|健康|成功|通过|已回款|达标|上线|healthy|ok|pass|passed|done|active|success|online)/i.test(
      trimmed,
    )
  ) {
    return { label: trimmed, tone: 'success' }
  }
  if (
    /(?:预警|降级|审批中|待|警告|缓慢|warn|warning|degraded|pending|review|slow)/i.test(trimmed)
  ) {
    return { label: trimmed, tone: 'warning' }
  }
  if (
    /(?:异常|失败|高危|故障|错误|超限|熔断|拒绝|error|fail|failed|critical|down|danger|rejected)/i.test(
      trimmed,
    )
  ) {
    return { label: trimmed, tone: 'danger' }
  }
  return { label: trimmed, tone: 'neutral' }
}

function parseSparklineCellPoints(value: unknown): readonly number[] {
  if (Array.isArray(value)) return normalizeSparklinePoints(value)
  if (typeof value === 'string' && value.includes(',')) {
    const parts = value
      .split(',')
      .map((s) => Number(s.trim()))
      .filter(Number.isFinite)
    return normalizeSparklinePoints(parts)
  }
  return []
}

function renderFormattedTableCell(
  value: unknown,
  format: TableColumnFormat | undefined,
  colMax: number,
  msg: RuntimeUiMessages,
) {
  if (!format || format === 'text') return formatCellValue(value, msg)
  if (format === 'badge') {
    const text = formatCellValue(value, msg)
    if (text === '—' || text === '') return '—'
    const { label, tone } = resolveBadgeCellTone(text)
    return <DshTag tone={tone}>{label}</DshTag>
  }
  if (format === 'code') {
    const text = formatCellValue(value, msg)
    return text === '—' ? '—' : <code className={css.tableCodeChip}>{text}</code>
  }
  if (format === 'delta') {
    const text = formatCellValue(value, msg)
    const num = parseNumericScalarForBar(value)
    const dir =
      text.startsWith('+') || (num !== null && num > 0 && !text.startsWith('-'))
        ? 'up'
        : text.startsWith('-') || (num !== null && num < 0)
          ? 'down'
          : 'neutral'
    return (
      <span className={css.tableDeltaCell} data-dir={dir}>
        {text}
      </span>
    )
  }
  if (format === 'bar') {
    const text = formatCellValue(value, msg)
    const num = parseNumericScalarForBar(value)
    if (num === null) return text
    const pct = Math.max(0, Math.min(100, colMax > 0 ? (Math.max(0, num) / colMax) * 100 : 0))
    return (
      <span className={css.tableBarCell}>
        <span className={css.tableBarTrack} aria-hidden="true">
          <span className={css.tableBarFill} style={{ width: `${pct.toFixed(1)}%` }} />
        </span>
        <span className={css.tableBarVal}>{text}</span>
      </span>
    )
  }
  if (format === 'sparkline') {
    const pts = parseSparklineCellPoints(value)
    const geom = buildSparklineGeometry(pts, 56, 18, 2)
    if (!geom) return formatCellValue(value, msg)
    const first = pts[0] ?? 0
    const last = pts[pts.length - 1] ?? 0
    const strokeColor =
      last > first
        ? 'var(--dsw-alias-state-success-primary, #10b981)'
        : last < first
          ? 'var(--dsw-alias-state-error-primary, #ef4444)'
          : 'var(--dsw-alias-state-business-primary, #4d6bfe)'
    return (
      <svg
        viewBox="0 0 56 18"
        width="56"
        height="18"
        className={css.tableSparkSvg}
        aria-label={pts.join(', ')}
      >
        <path
          d={geom.linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return formatCellValue(value, msg)
}

function copyToClipboardSafe(text: string): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => {})
  }
}

function triggerCsvDownload(csvText: string, baseTitle: string): void {
  if (
    typeof document === 'undefined' ||
    !document.body ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined'
  ) {
    copyToClipboardSafe(csvText)
    return
  }
  let anchor: HTMLAnchorElement | null = null
  try {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const slug = baseTitle
      .trim()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
      .replace(/^-+|-+$/g, '')
    anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${slug || 'a2ui-table'}.csv`
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    copyToClipboardSafe(csvText)
  } finally {
    if (anchor?.parentNode) {
      anchor.parentNode.removeChild(anchor)
    }
  }
}

export const TableWidget = memo(function TableWidget({
  rows: rawRows,
  columns: explicitCols,
  title,
  searchable = false,
  pageSize = 10,
  exportable = false,
  selectable = false,
  batchLabel,
  showSummary = false,
  expandKey,
  filterField,
  filterValue,
  onFilterValueChange,
  stickyFirstColumn = false,
  action,
  weight,
}: TableWidgetProps) {
  const msg = useRuntimeMessages()
  const normalizedData = useMemo(() => normalizeRows(rawRows), [rawRows])
  const activeCrossFilterTokens = useMemo(
    () => normalizeCrossFilterTokens(filterValue),
    [filterValue],
  )
  const activeCrossFilterKey = activeCrossFilterTokens.join('\0')
  const activeCrossFilterDisplay = activeCrossFilterTokens.join(' · ')
  const data = useMemo(
    () =>
      filterTableRowsByField(normalizedData, filterField, activeCrossFilterTokens) as RowRecord[],
    [normalizedData, filterField, activeCrossFilterTokens],
  )
  const [sorting, setSorting] = useState<SortingState>([])
  const [searchInput, setSearchInput] = useState('')
  const globalFilter = useDeferredValue(searchInput)
  const safePageSize =
    typeof pageSize === 'number' && Number.isFinite(pageSize) ? Math.trunc(pageSize) : 10
  const clampedPageSize = Math.max(3, Math.min(100, safePageSize))
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: clampedPageSize })
  const [selectedIndices, setSelectedIndices] = useState<ReadonlySet<number>>(() => new Set())
  const [expandedIndices, setExpandedIndices] = useState<ReadonlySet<number>>(() => new Set())
  const [compact, setCompact] = useState(false)
  const [copiedMd, markCopiedMd] = useTransientFlag(1300)
  const [prevCrossFilterKey, setPrevCrossFilterKey] = useState(activeCrossFilterKey)
  const [prevFilterField, setPrevFilterField] = useState(filterField)
  const [prevNormalizedData, setPrevNormalizedData] = useState(normalizedData)
  const [prevPageSize, setPrevPageSize] = useState(clampedPageSize)

  if (prevPageSize !== clampedPageSize) {
    setPrevPageSize(clampedPageSize)
    setPagination((prev) => ({ pageIndex: 0, pageSize: clampedPageSize || prev.pageSize }))
  }

  if (
    prevCrossFilterKey !== activeCrossFilterKey ||
    prevFilterField !== filterField ||
    prevNormalizedData !== normalizedData
  ) {
    setPrevCrossFilterKey(activeCrossFilterKey)
    setPrevFilterField(filterField)
    setPrevNormalizedData(normalizedData)
    if (pagination.pageIndex !== 0) {
      setPagination((prev) => ({ ...prev, pageIndex: 0 }))
    }
    if (selectedIndices.size > 0) setSelectedIndices(new Set())
    if (expandedIndices.size > 0) setExpandedIndices(new Set())
  }

  const inferredCols = useMemo<readonly TableColumnInput[]>(() => {
    if (Array.isArray(explicitCols) && explicitCols.length > 0) {
      const valid = explicitCols.filter((c): c is TableColumnInput =>
        Boolean(c && typeof c === 'object' && typeof c.key === 'string' && c.key.trim() !== ''),
      )
      if (valid.length > 0) return valid
    }
    const keys = new Set<string>()
    for (const row of normalizedData.slice(0, 25)) {
      for (const k of Object.keys(row)) {
        if (expandKey && k === expandKey) continue
        keys.add(k)
      }
    }
    return [...keys].map((key) => ({ key, label: key, sortable: true }))
  }, [explicitCols, normalizedData, expandKey])

  const hasExpandColumn = useMemo(
    () =>
      Boolean(
        expandKey &&
          normalizedData.some((r) => {
            const v = r[expandKey]
            return v !== undefined && v !== null && v !== ''
          }),
      ),
    [expandKey, normalizedData],
  )

  const numericKeySet = useMemo(
    () => detectNumericColumnKeys(inferredCols, normalizedData),
    [inferredCols, normalizedData],
  )

  const barMaxByCol = useMemo(() => {
    const map = new Map<string, number>()
    for (const col of inferredCols) {
      if (col.format !== 'bar') continue
      if (typeof col.max === 'number' && Number.isFinite(col.max) && col.max > 0) {
        map.set(col.key, col.max)
        continue
      }
      let maxFound = 0
      for (const r of normalizedData) {
        const n = parseNumericScalarForBar(r[col.key])
        if (n !== null && n > maxFound) maxFound = n
      }
      map.set(col.key, maxFound > 0 ? maxFound : 100)
    }
    return map
  }, [inferredCols, normalizedData])

  const columns = useMemo(
    () =>
      columnHelper.columns(
        inferredCols.map((col) => {
          const isNumeric =
            col.format !== 'sparkline' &&
            col.format !== 'badge' &&
            col.format !== 'code' &&
            numericKeySet.has(col.key)
          const rawNumber =
            normalizedData.length > 0 &&
            normalizedData.some((r) => typeof r[col.key] === 'number') &&
            normalizedData.every(
              (r) =>
                r[col.key] === null || r[col.key] === undefined || typeof r[col.key] === 'number',
            )
          const wrapProse =
            !isNumeric &&
            !col.format &&
            normalizedData.slice(0, 40).some((r) => {
              const formatted = formatCellValue(r[col.key], msg)
              return formatted.includes('\n') || estimateVisualUnits(formatted) > 14
            })
          const align = col.align ?? (isNumeric ? 'right' : 'left')
          const colMax = barMaxByCol.get(col.key) ?? 100
          return columnHelper.accessor((row) => row[col.key], {
            id: col.key,
            header: col.label,
            enableSorting: col.format === 'sparkline' ? false : col.sortable !== false,
            sortUndefined: 'last',
            sortFn: rawNumber ? 'basic' : isNumeric ? 'formattedNumeric' : 'alphanumeric',
            meta: { align, isNumeric, wrapProse },
            cell: (info) => renderFormattedTableCell(info.getValue(), col.format, colMax, msg),
          })
        }),
      ),
    [inferredCols, numericKeySet, normalizedData, msg, barMaxByCol],
  )

  const table = useTable({
    features: TABLE_FEATURES,
    data,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearchInput,
    onPaginationChange: setPagination,
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue ?? '')
        .trim()
        .toLowerCase()
      if (q === '') return true
      return Object.values(row.original).some((val) =>
        formatCellValue(val, msg).toLowerCase().includes(q),
      )
    },
  })

  const filteredRows = table.getFilteredRowModel().rows
  const sortedRows = table.getSortedRowModel().rows
  const pageRows = table.getRowModel().rows
  const totalFiltered = filteredRows.length
  const pageCount = table.getPageCount()
  const pageIndex = table.state.pagination.pageIndex
  if (pageCount > 0 && pageIndex >= pageCount) {
    setPagination((prev) => ({ ...prev, pageIndex: Math.max(0, pageCount - 1) }))
  }

  const summaryMap = useMemo(
    () =>
      showSummary
        ? computeTableNumericSummary(
            inferredCols,
            filteredRows.map((r) => r.original),
            numericKeySet,
            msg.tableAvgLabel,
          )
        : null,
    [showSummary, inferredCols, filteredRows, numericKeySet, msg.tableAvgLabel],
  )

  const allPageSelected =
    selectable && pageRows.length > 0 && pageRows.every((r) => selectedIndices.has(r.index))
  const selectedRowsList = useMemo(
    () => data.filter((_, idx) => selectedIndices.has(idx)),
    [data, selectedIndices],
  )

  const toggleRowIndex = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const toggleExpandRow = (idx: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const toggleSelectPage = () => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        for (const r of pageRows) next.delete(r.index)
      } else {
        for (const r of pageRows) next.add(r.index)
      }
      return next
    })
  }

  const handleCopyMarkdown = () => {
    const md = formatTableToMarkdown(
      inferredCols,
      sortedRows.map((r) => r.original),
      numericKeySet,
    )
    copyToClipboardSafe(md)
    markCopiedMd()
  }

  const handleExportCsv = () => {
    const csv = formatTableToCsv(
      inferredCols,
      sortedRows.map((r) => r.original),
    )
    triggerCsvDownload(csv, title || 'table-export')
  }

  const handleBatchDispatch = () => {
    if (!action || selectedRowsList.length === 0) return
    void action({
      metadata: {
        extensions: {
          dshSelection: {
            source: 'tableBatch',
            label: batchLabel || msg.tableBatchDefault,
            value: `${selectedRowsList.length}`,
            count: selectedRowsList.length,
            selectedRows: selectedRowsList,
          },
        },
      },
    })
  }

  const showProControls = exportable || selectable
  const showToolbar = Boolean(title || searchable || showProControls || activeCrossFilterDisplay)
  const colSpanTotal = Math.max(
    1,
    columns.length + (selectable ? 1 : 0) + (hasExpandColumn ? 1 : 0),
  )

  return (
    <div
      className={css.tableCard}
      style={weightStyle(weight, 240)}
      data-a2ui-table=""
      data-a2ui-table-filter={activeCrossFilterDisplay || undefined}
      data-density={compact ? 'compact' : 'standard'}
    >
      {showToolbar ? (
        <div className={css.tableToolbar}>
          <div className={css.proTableLeftGroup}>
            {title ? <span className={css.tableTitle}>{title}</span> : null}
            {activeCrossFilterDisplay ? (
              <span className={css.crossFilterChip} data-a2ui-table-filter-chip="">
                <span>{msg.tableFilterActive(activeCrossFilterDisplay)}</span>
                {onFilterValueChange ? (
                  <button
                    type="button"
                    className={css.crossFilterClear}
                    aria-label={msg.tableClearFilter}
                    onClick={() => onFilterValueChange(Array.isArray(filterValue) ? [] : '')}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ) : null}
            {selectable && selectedRowsList.length > 0 ? (
              <span className={css.crossFilterChip}>
                <span>{msg.tableSelectedCount(selectedRowsList.length)}</span>
                <button
                  type="button"
                  className={css.crossFilterClear}
                  aria-label={msg.multiSelectClearAll}
                  onClick={() => setSelectedIndices(new Set())}
                >
                  ×
                </button>
              </span>
            ) : null}
          </div>

          <div className={css.proTableRightGroup}>
            {selectable && selectedRowsList.length > 0 && typeof action === 'function' ? (
              <DshButton size="sm" variant="primary" onClick={handleBatchDispatch}>
                {batchLabel || msg.tableBatchDefault}
              </DshButton>
            ) : null}

            {searchable ? (
              <div className={css.tableSearch}>
                <DshInput
                  icon={SEARCH_ICON_14}
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value)
                    table.setPageIndex(0)
                  }}
                  placeholder={msg.tableSearchPlaceholder}
                  aria-label={msg.tableSearchAria}
                />
              </div>
            ) : null}

            {showProControls ? (
              <div className={css.proTableToolBtns}>
                <button
                  type="button"
                  className={css.diffCopyBtn}
                  onClick={() => setCompact((v) => !v)}
                >
                  {compact ? msg.tableDensityCompact : msg.tableDensityStandard}
                </button>
                {exportable ? (
                  <>
                    <button type="button" className={css.diffCopyBtn} onClick={handleCopyMarkdown}>
                      {copiedMd ? msg.copiedCheck : msg.tableCopyMarkdown}
                    </button>
                    <button type="button" className={css.diffCopyBtn} onClick={handleExportCsv}>
                      {msg.tableExportCsv}
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={css.tableScroll}>
        <table className={compact ? `${css.table} ${css.tableCompact}` : css.table}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hasExpandColumn ? <th className={`${css.th} ${css.proExpandCell}`} /> : null}
                {selectable ? (
                  <th className={`${css.th} ${css.proCheckCell}`}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectPage}
                      aria-label={msg.tableSelectAllAria}
                      className={css.proCheckbox}
                    />
                  </th>
                ) : null}
                {hg.headers.map((header, hIdx) => {
                  const meta = header.column.columnDef.meta
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  const isSticky = stickyFirstColumn && hIdx === 0
                  return (
                    <th
                      key={header.id}
                      className={`${css.th} ${canSort ? css.thSortable : ''} ${isSticky ? css.tableStickyCol : ''}`}
                      style={{ textAlign: meta?.align ?? 'left' }}
                      tabIndex={canSort ? 0 : undefined}
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : canSort
                              ? 'none'
                              : undefined
                      }
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      onKeyDown={
                        canSort
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                header.column.toggleSorting()
                              }
                            }
                          : undefined
                      }
                    >
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                      {sorted === 'asc' ? ' ↑' : sorted === 'desc' ? ' ↓' : ''}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td className={css.emptyCell} colSpan={colSpanTotal}>
                  {msg.tableEmpty}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const canCrossFilterRow = Boolean(
                  filterField && onFilterValueChange && !action && !selectable,
                )
                const clickable = (typeof action === 'function' && !selectable) || canCrossFilterRow
                const rowChecked = selectable && selectedIndices.has(row.index)
                const detailText =
                  hasExpandColumn && expandKey ? formatExpandDetail(row.original[expandKey]) : ''
                const isExpanded = detailText !== '' && expandedIndices.has(row.index)
                const triggerRow = () => {
                  if (canCrossFilterRow && filterField && onFilterValueChange) {
                    const rawCell = row.original[filterField]
                    const scalarVal =
                      rawCell === null || rawCell === undefined
                        ? ''
                        : typeof rawCell === 'string' ||
                            typeof rawCell === 'number' ||
                            typeof rawCell === 'boolean'
                          ? String(rawCell).trim()
                          : formatCellValue(rawCell, msg)
                    if (scalarVal && scalarVal !== '—') {
                      onFilterValueChange(computeNextCrossFilterValue(filterValue, scalarVal))
                    }
                    return
                  }
                  if (!action) return
                  const firstKey = inferredCols[0]?.key
                  const label =
                    firstKey !== undefined
                      ? formatCellValue(row.original[firstKey], msg)
                      : msg.tableRowFallback(row.index + 1)
                  void action({
                    metadata: {
                      extensions: {
                        dshSelection: {
                          source: 'table',
                          index: row.index,
                          label,
                          row: row.original,
                        },
                      },
                    },
                  })
                }
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={
                        rowChecked ? css.trSelected : clickable ? css.trInteractive : undefined
                      }
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? triggerRow : undefined}
                      onKeyDown={
                        clickable
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                triggerRow()
                              }
                            }
                          : undefined
                      }
                    >
                      {hasExpandColumn ? (
                        <td
                          className={`${css.td} ${css.proExpandCell}`}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {detailText !== '' ? (
                            <button
                              type="button"
                              className={css.proExpandBtn}
                              aria-expanded={isExpanded}
                              aria-label={msg.tableExpandRowAria}
                              onClick={() => toggleExpandRow(row.index)}
                            >
                              {isExpanded ? '▾' : '▸'}
                            </button>
                          ) : null}
                        </td>
                      ) : null}
                      {selectable ? (
                        <td
                          className={`${css.td} ${css.proCheckCell}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={rowChecked}
                            onChange={() => toggleRowIndex(row.index)}
                            aria-label={msg.tableSelectRowAria(row.index + 1)}
                            className={css.proCheckbox}
                          />
                        </td>
                      ) : null}
                      {row.getAllCells().map((cell, cIdx) => {
                        const meta = cell.column.columnDef.meta
                        const isSticky = stickyFirstColumn && cIdx === 0
                        const cellCls = meta?.isNumeric
                          ? `${css.td} ${css.tdNum}${isSticky ? ` ${css.tableStickyCol}` : ''}`
                          : meta?.wrapProse
                            ? `${css.td} ${css.tdProse}${isSticky ? ` ${css.tableStickyCol}` : ''}`
                            : `${css.td} ${css.tdNowrap}${isSticky ? ` ${css.tableStickyCol}` : ''}`
                        return (
                          <td
                            key={cell.id}
                            className={cellCls}
                            style={{ textAlign: meta?.align ?? 'left' }}
                          >
                            <table.FlexRender cell={cell} />
                          </td>
                        )
                      })}
                    </tr>
                    {isExpanded ? (
                      <tr className={css.proExpandTr}>
                        <td colSpan={colSpanTotal} className={css.proExpandTd}>
                          <pre className={css.proExpandPre}>{detailText}</pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
          {summaryMap && filteredRows.length > 0 ? (
            <tfoot>
              <tr className={css.proSummaryRow}>
                {hasExpandColumn ? <td className={css.td} /> : null}
                {selectable ? <td className={css.td} /> : null}
                {inferredCols.map((col, idx) => {
                  const isSticky = stickyFirstColumn && idx === 0
                  const footCls = numericKeySet.has(col.key)
                    ? `${css.td} ${css.tdNum}${isSticky ? ` ${css.tableStickyCol}` : ''}`
                    : `${css.td}${isSticky ? ` ${css.tableStickyCol}` : ''}`
                  return (
                    <td
                      key={col.key}
                      className={footCls}
                      style={{
                        textAlign: col.align ?? (numericKeySet.has(col.key) ? 'right' : 'left'),
                      }}
                    >
                      {idx === 0 && !summaryMap[col.key]
                        ? msg.tableSummaryLabel(filteredRows.length)
                        : (summaryMap[col.key] ?? '')}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {pageCount > 1 ? (
        <div className={css.pagination}>
          <span>{msg.tablePaginationSummary(totalFiltered, pageIndex + 1, pageCount)}</span>
          <div className={css.pageButtons}>
            <DshButton
              variant="outline"
              size="sm"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              {msg.tablePrevPage}
            </DshButton>
            <DshButton
              variant="outline"
              size="sm"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              {msg.tableNextPage}
            </DshButton>
          </div>
        </div>
      ) : null}
    </div>
  )
})
