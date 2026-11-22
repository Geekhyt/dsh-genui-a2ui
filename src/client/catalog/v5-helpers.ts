import { formatLocalDateValue, parseLocalDateAnchor } from '../../shared/temporal.ts'
import { type NormalizedSelectOption, normalizeSelectOptions } from './v3-helpers.ts'

export function decimalPlacesOf(step: number): number {
  if (!Number.isFinite(step)) return 0
  const s = String(step).toLowerCase()
  const expIdx = s.indexOf('e')
  if (expIdx >= 0) {
    const mantissa = s.slice(0, expIdx)
    const exp = Number.parseInt(s.slice(expIdx + 1), 10)
    const dot = mantissa.indexOf('.')
    const fracLen = dot >= 0 ? mantissa.length - dot - 1 : 0
    return Math.min(8, Math.max(0, fracLen - exp))
  }
  const dot = s.indexOf('.')
  return dot < 0 ? 0 : Math.min(8, s.length - dot - 1)
}

export function clampAndStepNumber(params: {
  readonly current: unknown
  readonly delta: number
  readonly min?: number | undefined
  readonly max?: number | undefined
  readonly step?: number | undefined
}): number {
  const step =
    typeof params.step === 'number' && Number.isFinite(params.step) && params.step > 0
      ? params.step
      : 1
  const isEmptyCur =
    params.current === undefined ||
    params.current === null ||
    (typeof params.current === 'string' && params.current.trim() === '')
  const curNum = isEmptyCur ? Number.NaN : Number(params.current)
  const base = Number.isFinite(curNum)
    ? curNum
    : typeof params.min === 'number' && Number.isFinite(params.min)
      ? params.min
      : 0
  const precision = Math.max(decimalPlacesOf(step), decimalPlacesOf(base))
  let next = Number((base + params.delta * step).toFixed(precision))
  if (typeof params.min === 'number' && Number.isFinite(params.min)) {
    next = Math.max(params.min, next)
  }
  if (typeof params.max === 'number' && Number.isFinite(params.max)) {
    next = Math.min(params.max, next)
  }
  return next
}

export function normalizeMultiSelectMergedOptions(
  rawOptions: unknown,
  selectedValues: readonly string[],
): readonly NormalizedSelectOption[] {
  const base = [...normalizeSelectOptions(rawOptions)]
  const seen = new Set(base.map((o) => o.value))
  for (const val of selectedValues) {
    if (val && !seen.has(val)) {
      seen.add(val)
      base.push({ value: val, label: val })
    }
  }
  return base
}

export function computeDateRangeSpanDays(startStr: string, endStr: string): number | null {
  if (!startStr || !endStr) return null
  const s = Date.parse(startStr.slice(0, 10))
  const e = Date.parse(endStr.slice(0, 10))
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null
  const diffDays = Math.round((e - s) / 86_400_000) + 1
  return Math.max(1, diffDays)
}

export function buildDatePresetRange(
  days: number,
  enableTime: boolean,
  anchorEndStr?: string,
): { readonly start: string; readonly end: string } {
  const endObj = parseLocalDateAnchor(anchorEndStr)
  if (days <= 1 && enableTime) {
    const startOfDay = new Date(endObj.getFullYear(), endObj.getMonth(), endObj.getDate(), 0, 0, 0)
    const endOfDay = new Date(endObj.getFullYear(), endObj.getMonth(), endObj.getDate(), 23, 59, 0)
    return {
      start: formatLocalDateValue(startOfDay, true),
      end: formatLocalDateValue(endOfDay, true),
    }
  }
  const startObj = new Date(
    endObj.getFullYear(),
    endObj.getMonth(),
    endObj.getDate() - Math.max(0, days - 1),
    endObj.getHours(),
    endObj.getMinutes(),
    endObj.getSeconds(),
  )
  return {
    start: formatLocalDateValue(startObj, enableTime),
    end: formatLocalDateValue(endObj, enableTime),
  }
}

export type HierarchyNodeStatus = 'healthy' | 'warning' | 'error' | 'neutral'

export interface NormalizedHierarchyNode {
  readonly id: string
  readonly value: string
  readonly hasExplicitValue?: boolean | undefined
  readonly label: string
  readonly sublabel?: string | undefined
  readonly badge?: string | undefined
  readonly metric?: string | undefined
  readonly sharePct?: number | undefined
  readonly offsetPct?: number | undefined
  readonly status: HierarchyNodeStatus
  readonly breadcrumb: string
  readonly children: readonly NormalizedHierarchyNode[]
  readonly raw: Record<string, unknown>
}

function normalizeNodeStatus(raw: unknown): HierarchyNodeStatus {
  if (typeof raw !== 'string') return 'neutral'
  const s = raw.trim().toLowerCase()
  if (s === 'error' || s === 'err' || s === 'danger' || s === 'critical') return 'error'
  if (s === 'warning' || s === 'warn' || s === 'slow') return 'warning'
  if (s === 'healthy' || s === 'ok' || s === 'success' || s === 'done') return 'healthy'
  return 'neutral'
}

export function normalizeHierarchyTree(
  rawNodes: unknown,
  parentPath = '',
  prefixId = 'n',
): readonly NormalizedHierarchyNode[] {
  if (!Array.isArray(rawNodes)) return []
  const out: NormalizedHierarchyNode[] = []
  rawNodes.forEach((item, idx) => {
    if (typeof item === 'string') {
      const bc = parentPath ? `${parentPath} / ${item}` : item
      out.push({
        id: `${prefixId}_${idx}`,
        value: item,
        label: item,
        status: 'neutral',
        breadcrumb: bc,
        children: [],
        raw: { label: item, value: item },
      })
      return
    }
    if (typeof item === 'object' && item !== null) {
      const rec = item as Record<string, unknown>
      const label = String(rec.label ?? rec.title ?? rec.name ?? rec.value ?? `Node ${idx + 1}`)
      const hasExplicitValue =
        rec.value !== undefined && rec.value !== null && String(rec.value).trim() !== ''
      const value = hasExplicitValue
        ? String(rec.value)
        : String(rec.id ?? rec.key ?? (parentPath ? `${parentPath}/${label}` : label))
      const id = String(rec.id ?? `${prefixId}_${idx}`)
      const breadcrumb = parentPath ? `${parentPath} / ${label}` : label
      const sharePct =
        typeof rec.sharePct === 'number' && Number.isFinite(rec.sharePct)
          ? Math.max(0, Math.min(100, rec.sharePct))
          : typeof rec.pct === 'number' && Number.isFinite(rec.pct)
            ? Math.max(0, Math.min(100, rec.pct))
            : undefined
      const rawOffset = rec.offsetPct ?? rec.startPct
      const offsetPct =
        typeof rawOffset === 'number' && Number.isFinite(rawOffset)
          ? Math.max(0, Math.min(97, rawOffset))
          : undefined
      const children = normalizeHierarchyTree(rec.children, breadcrumb, `${id}_c`)
      const badgeStr =
        rec.badge !== undefined && rec.badge !== null && String(rec.badge) !== ''
          ? String(rec.badge)
          : undefined
      const metricStr =
        rec.metric !== undefined && rec.metric !== null && String(rec.metric) !== ''
          ? String(rec.metric)
          : undefined
      out.push({
        id,
        value,
        hasExplicitValue,
        label,
        sublabel: rec.sublabel ? String(rec.sublabel) : undefined,
        badge: badgeStr,
        metric: metricStr,
        sharePct,
        offsetPct,
        status: normalizeNodeStatus(rec.status ?? rec.tone),
        breadcrumb,
        children,
        raw: rec,
      })
    }
  })
  return out
}

export function filterHierarchyTree(
  nodes: readonly NormalizedHierarchyNode[],
  query: string,
): readonly NormalizedHierarchyNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes
  const out: NormalizedHierarchyNode[] = []
  for (const node of nodes) {
    const filteredChildren = filterHierarchyTree(node.children, q)
    const selfMatch =
      node.label.toLowerCase().includes(q) ||
      node.value.toLowerCase().includes(q) ||
      (node.sublabel ? node.sublabel.toLowerCase().includes(q) : false) ||
      (node.badge ? node.badge.toLowerCase().includes(q) : false)
    if (selfMatch || filteredChildren.length > 0) {
      out.push({
        ...node,
        children: selfMatch && filteredChildren.length === 0 ? node.children : filteredChildren,
      })
    }
  }
  return out
}

export function findBreadcrumbByValue(
  nodes: readonly NormalizedHierarchyNode[],
  targetVal: string,
): string | null {
  if (!targetVal) return null
  for (const n of nodes) {
    if (n.value === targetVal) return n.breadcrumb
    const childHit = findBreadcrumbByValue(n.children, targetVal)
    if (childHit !== null) return childHit
  }
  return null
}

export interface HierarchyBranchRef {
  readonly id: string
  readonly depth: number
}

export function collectBranchDepths(
  nodes: readonly NormalizedHierarchyNode[],
): readonly HierarchyBranchRef[] {
  const out: HierarchyBranchRef[] = []
  const walk = (list: readonly NormalizedHierarchyNode[], depth: number) => {
    for (const n of list) {
      if (n.children.length > 0) {
        out.push({ id: n.id, depth })
        walk(n.children, depth + 1)
      }
    }
  }
  walk(nodes, 0)
  return out
}

export function collectAllBranchIds(nodes: readonly NormalizedHierarchyNode[]): string[] {
  return collectBranchDepths(nodes).map((b) => b.id)
}

export interface NormalizedCheckCardOption {
  readonly value: string
  readonly title: string
  readonly badge?: string | undefined
  readonly description?: string | undefined
  readonly recommended: boolean
  readonly raw: Record<string, unknown>
}

export function normalizeCheckCardOptions(raw: unknown): readonly NormalizedCheckCardOption[] {
  if (!Array.isArray(raw)) return []
  const out: NormalizedCheckCardOption[] = []
  const seen = new Set<string>()
  raw.forEach((item, idx) => {
    if (typeof item === 'string') {
      if (item === '' || seen.has(item)) return
      seen.add(item)
      out.push({
        value: item,
        title: item,
        recommended: false,
        raw: { value: item, title: item },
      })
      return
    }
    if (typeof item === 'object' && item !== null) {
      const rec = item as Record<string, unknown>
      const title = String(rec.title ?? rec.label ?? rec.name ?? `Option ${idx + 1}`)
      const value = String(rec.value ?? rec.id ?? rec.key ?? title)
      if (value === '' || seen.has(value)) return
      seen.add(value)
      const badgeVal =
        rec.badge !== undefined && rec.badge !== null && String(rec.badge) !== ''
          ? String(rec.badge)
          : rec.price !== undefined && rec.price !== null && String(rec.price) !== ''
            ? String(rec.price)
            : undefined
      out.push({
        value,
        title,
        badge: badgeVal,
        description: rec.description
          ? String(rec.description)
          : rec.subtitle
            ? String(rec.subtitle)
            : undefined,
        recommended: Boolean(rec.recommended),
        raw: rec,
      })
    }
  })
  return out
}
