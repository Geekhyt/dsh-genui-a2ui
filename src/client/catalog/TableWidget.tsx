/**
 * TanStack Table v9-backed `Table` component for `dsh-genui-a2ui`.
 *
 * Uses tree-shaken v9 `tableFeatures` (`globalFilteringFeature`, `rowSortingFeature`,
 * `rowPaginationFeature`) with DSH `Input` for instant keyword search and DSH `Button`
 * for pagination.
 */
import { memo, useMemo, useState } from 'react'
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
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
  type SortingState,
} from '@tanstack/react-table'
import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import { DshButton, DshInput, DshSearchIcon } from '../ui/primitives.tsx'
import css from './Catalog.module.css'

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
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
  columnMeta: {} as { align: 'left' | 'center' | 'right'; isNumeric: boolean },
})

const columnHelper = createColumnHelper<typeof TABLE_FEATURES, RowRecord>()

export interface TableColumnInput {
  readonly key: string
  readonly label: string
  readonly align?: 'left' | 'center' | 'right' | undefined
  readonly sortable?: boolean | undefined
}

export interface TableWidgetProps {
  readonly rows: unknown
  readonly columns?: readonly TableColumnInput[] | undefined
  readonly title?: string | undefined
  readonly searchable?: boolean | undefined
  readonly pageSize?: number | undefined
  readonly action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  readonly weight?: number | undefined
}

function normalizeRows(rows: unknown): RowRecord[] {
  if (!Array.isArray(rows)) return []
  return rows.filter(
    (r): r is RowRecord => typeof r === 'object' && r !== null && !Array.isArray(r),
  )
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export const TableWidget = memo(function TableWidget({
  rows: rawRows,
  columns: explicitCols,
  title,
  searchable = false,
  pageSize = 10,
  action,
  weight,
}: TableWidgetProps) {
  const data = useMemo(() => normalizeRows(rawRows), [rawRows])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const inferredCols = useMemo<readonly TableColumnInput[]>(() => {
    if (explicitCols && explicitCols.length > 0) return explicitCols
    const keys = new Set<string>()
    for (const row of data.slice(0, 25)) {
      for (const k of Object.keys(row)) keys.add(k)
    }
    return [...keys].map((key) => ({ key, label: key, sortable: true }))
  }, [explicitCols, data])

  const columns = useMemo(
    () =>
      columnHelper.columns(
        inferredCols.map((col) => {
          const isNumeric = data.some((r) => typeof r[col.key] === 'number')
          const align = col.align ?? (isNumeric ? 'right' : 'left')
          return columnHelper.accessor((row) => row[col.key], {
            id: col.key,
            header: col.label,
            enableSorting: col.sortable !== false,
            sortFn: isNumeric ? 'basic' : 'alphanumeric',
            meta: { align, isNumeric },
            cell: (info) => formatCellValue(info.getValue()),
          })
        }),
      ),
    [inferredCols, data],
  )

  const table = useTable({
    features: TABLE_FEATURES,
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue ?? '').trim().toLowerCase()
      if (q === '') return true
      return Object.values(row.original).some((val) =>
        formatCellValue(val).toLowerCase().includes(q),
      )
    },
    initialState: {
      pagination: { pageIndex: 0, pageSize: Math.max(3, Math.min(100, pageSize)) },
    },
  })

  const totalFiltered = table.getFilteredRowModel().rows.length
  const pageCount = table.getPageCount()
  const pageIndex = table.state.pagination.pageIndex
  const weightStyle = weight !== undefined ? { flexGrow: weight, flexBasis: 0, minWidth: 240 } : undefined

  return (
    <div className={css.tableCard} style={weightStyle} data-a2ui-table="">
      {title || searchable ? (
        <div className={css.tableToolbar}>
          {title ? <span className={css.tableTitle}>{title}</span> : <span />}
          {searchable ? (
            <div className={css.tableSearch}>
              <DshInput
                icon={<DshSearchIcon size={14} />}
                value={globalFilter}
                onChange={(e) => {
                  setGlobalFilter(e.target.value)
                  table.setPageIndex(0)
                }}
                placeholder="搜索表格内容…"
                aria-label="搜索表格内容"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={css.tableScroll}>
        <table className={css.table}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const meta = header.column.columnDef.meta
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      className={`${css.th} ${canSort ? css.thSortable : ''}`}
                      style={{ textAlign: meta?.align ?? 'left' }}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
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
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td className={css.emptyCell} colSpan={Math.max(1, columns.length)}>
                  暂无匹配数据
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const clickable = typeof action === 'function'
                const triggerRow = () => {
                  if (!action) return
                  const firstKey = inferredCols[0]?.key
                  const label =
                    firstKey !== undefined
                      ? formatCellValue(row.original[firstKey])
                      : `第 ${row.index + 1} 行`
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
                  <tr
                    key={row.id}
                    className={clickable ? css.trInteractive : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    role={clickable ? 'button' : undefined}
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
                    {row.getAllCells().map((cell) => {
                      const meta = cell.column.columnDef.meta
                      return (
                        <td
                          key={cell.id}
                          className={`${css.td} ${meta?.isNumeric ? css.tdNum : ''}`}
                          style={{ textAlign: meta?.align ?? 'left' }}
                        >
                          <table.FlexRender cell={cell} />
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
        <div className={css.pagination}>
          <span>
            共 {totalFiltered} 条 · 第 {pageIndex + 1} / {pageCount} 页
          </span>
          <div className={css.pageButtons}>
            <DshButton
              variant="outline"
              size="sm"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              上一页
            </DshButton>
            <DshButton
              variant="outline"
              size="sm"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              下一页
            </DshButton>
          </div>
        </div>
      ) : null}
    </div>
  )
})
