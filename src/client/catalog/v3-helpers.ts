/**
 * Pure, zero-DOM data normalizers and deterministic SVG layout helpers for the
 * 10 v3 A2UI 1.0 components (`Select`, `Segmented`, `Switch`, `Comparison`,
 * `LogViewer`, `Timeline`, `Kanban`, `SourceList`, `MetricRing`, `ServiceGraph`).
 */

export interface NormalizedSelectOption {
  readonly value: string
  readonly label: string
  readonly description?: string | undefined
}

export function normalizeSelectOptions(raw: unknown): readonly NormalizedSelectOption[] {
  if (!Array.isArray(raw)) return []
  const out: NormalizedSelectOption[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item === 'string' || typeof item === 'number') {
      const val = String(item)
      if (val !== '' && !seen.has(val)) {
        seen.add(val)
        out.push({ value: val, label: val })
      }
      continue
    }
    if (typeof item === 'object' && item !== null) {
      const rec = item as Record<string, unknown>
      const rawVal = rec.value ?? rec.id ?? rec.key ?? rec.label
      if (rawVal === undefined || rawVal === null) continue
      const val = String(rawVal)
      if (val === '' || seen.has(val)) continue
      seen.add(val)
      const label =
        rec.label !== undefined && rec.label !== null && String(rec.label) !== ''
          ? String(rec.label)
          : rec.title !== undefined && rec.title !== null && String(rec.title) !== ''
            ? String(rec.title)
            : val
      const description =
        rec.description !== undefined && rec.description !== null && String(rec.description) !== ''
          ? String(rec.description)
          : undefined
      out.push({ value: val, label, description })
    }
  }
  return out
}

/* ─────────────────────────── Comparison ─────────────────────────── */

export interface NormalizedComparisonOption {
  readonly key: string
  readonly title: string
  readonly subtitle?: string | undefined
  readonly badge?: string | undefined
  readonly recommended: boolean
  readonly summary?: string | undefined
  readonly raw: Record<string, unknown>
}

export type ComparisonCellSemantic = 'ok' | 'warn' | 'no' | 'plain'

export interface ParsedComparisonCell {
  readonly kind: ComparisonCellSemantic
  readonly text: string
}

export interface NormalizedComparisonRow {
  readonly label: string
  readonly cells: Readonly<Record<string, ParsedComparisonCell>>
}

const OK_PREFIX_RE = /^(?:ok|yes|pass|true)\s*:\s*/i
const WARN_PREFIX_RE = /^(?:warn|warning|partial)\s*:\s*/i
const NO_PREFIX_RE = /^(?:no|err|error|fail|false)\s*:\s*/i

export function parseComparisonCell(raw: unknown): ParsedComparisonCell {
  if (typeof raw === 'boolean') {
    return raw ? { kind: 'ok', text: '' } : { kind: 'no', text: '' }
  }
  if (raw === undefined || raw === null) {
    return { kind: 'plain', text: '—' }
  }
  const str = String(raw).trim()
  if (str === '') return { kind: 'plain', text: '—' }
  if (OK_PREFIX_RE.test(str)) {
    return { kind: 'ok', text: str.replace(OK_PREFIX_RE, '').trim() }
  }
  if (WARN_PREFIX_RE.test(str)) {
    return { kind: 'warn', text: str.replace(WARN_PREFIX_RE, '').trim() }
  }
  if (NO_PREFIX_RE.test(str)) {
    return { kind: 'no', text: str.replace(NO_PREFIX_RE, '').trim() }
  }
  if (str === '✓' || str === '✔') return { kind: 'ok', text: '' }
  if (str === '✕' || str === '✗' || str === '×') return { kind: 'no', text: '' }
  return { kind: 'plain', text: str }
}

export function normalizeComparisonData(
  rawOptions: unknown,
  rawRows: unknown,
): {
  readonly options: readonly NormalizedComparisonOption[]
  readonly rows: readonly NormalizedComparisonRow[]
} {
  const options: NormalizedComparisonOption[] = []
  if (Array.isArray(rawOptions)) {
    rawOptions.forEach((item, idx) => {
      if (typeof item === 'string') {
        options.push({
          key: item,
          title: item,
          recommended: false,
          raw: { key: item, title: item },
        })
        return
      }
      if (typeof item === 'object' && item !== null) {
        const rec = item as Record<string, unknown>
        const key = String(rec.key ?? rec.id ?? rec.value ?? `opt_${idx}`)
        const title = String(rec.title ?? rec.label ?? rec.name ?? key)
        options.push({
          key,
          title,
          subtitle: rec.subtitle ? String(rec.subtitle) : undefined,
          badge: rec.badge ? String(rec.badge) : undefined,
          recommended: Boolean(rec.recommended),
          summary: rec.summary ? String(rec.summary) : undefined,
          raw: rec,
        })
      }
    })
  }

  const rows: NormalizedComparisonRow[] = []
  if (Array.isArray(rawRows)) {
    for (const r of rawRows) {
      if (typeof r !== 'object' || r === null) continue
      const rec = r as Record<string, unknown>
      const label = String(rec.label ?? rec.dimension ?? rec.metric ?? rec.name ?? '')
      if (!label) continue
      const valSource =
        typeof rec.values === 'object' && rec.values !== null && !Array.isArray(rec.values)
          ? (rec.values as Record<string, unknown>)
          : rec
      const cells: Record<string, ParsedComparisonCell> = {}
      for (const opt of options) {
        cells[opt.key] = parseComparisonCell(valSource[opt.key])
      }
      rows.push({ label, cells })
    }
  }

  return { options, rows }
}

/* ─────────────────────────── LogViewer ─────────────────────────── */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface NormalizedLogEntry {
  readonly id: string
  readonly time: string
  readonly level: LogLevel
  readonly service: string
  readonly message: string
  readonly detail: string
  readonly filePath?: string | undefined
  readonly line?: number | undefined
}

const RAW_LOG_RE =
  /^(?:(\d{2,4}[-/:]\d{2}[-/:]\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?|\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+)?(?:\[?(ERROR|ERR|FATAL|WARN|WARNING|INFO|DEBUG|TRACE)\]?\s+)?(?:\[([^\]]+)\]\s+)?([\s\S]*)$/i

function normalizeLogLevel(raw: unknown): LogLevel {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (s === 'error' || s === 'err' || s === 'fatal' || s === 'critical') return 'error'
  if (s === 'warn' || s === 'warning') return 'warn'
  if (s === 'debug' || s === 'trace' || s === 'verbose') return 'debug'
  return 'info'
}

export function normalizeLogEntries(raw: unknown): readonly NormalizedLogEntry[] {
  const list =
    typeof raw === 'string'
      ? raw
          .split(/\r?\n/)
          .map((l) => l.trimEnd())
          .filter(Boolean)
      : Array.isArray(raw)
        ? raw
        : []

  const out: NormalizedLogEntry[] = []
  list.forEach((item, idx) => {
    if (typeof item === 'string') {
      const m = RAW_LOG_RE.exec(item)
      out.push({
        id: `log_${idx}`,
        time: m?.[1] ?? '',
        level: normalizeLogLevel(m?.[2]),
        service: m?.[3] ?? '',
        message: (m?.[4] ?? item).trim(),
        detail: '',
      })
      return
    }
    if (typeof item === 'object' && item !== null) {
      const rec = item as Record<string, unknown>
      const message = String(rec.message ?? rec.msg ?? rec.text ?? '')
      if (!message && !rec.detail && !rec.stack) return
      const lineNum =
        typeof rec.line === 'number' && Number.isFinite(rec.line)
          ? Math.trunc(rec.line)
          : typeof rec.line === 'string' && /^\d+$/.test(rec.line.trim())
            ? Number.parseInt(rec.line.trim(), 10)
            : undefined
      out.push({
        id: String(rec.id ?? `log_${idx}`),
        time: rec.time !== undefined && rec.time !== null ? String(rec.time) : '',
        level: normalizeLogLevel(rec.level ?? rec.severity),
        service:
          rec.service !== undefined && rec.service !== null
            ? String(rec.service)
            : rec.source !== undefined && rec.source !== null
              ? String(rec.source)
              : '',
        message: message || String(rec.detail ?? rec.stack ?? ''),
        detail:
          rec.detail !== undefined && rec.detail !== null
            ? String(rec.detail)
            : rec.stack !== undefined && rec.stack !== null
              ? String(rec.stack)
              : '',
        filePath:
          typeof rec.filePath === 'string' && rec.filePath.trim() !== ''
            ? rec.filePath.trim()
            : typeof rec.file === 'string' && rec.file.trim() !== ''
              ? rec.file.trim()
              : undefined,
        line: lineNum,
      })
    }
  })
  return out
}

/* ─────────────────────────── Kanban ─────────────────────────── */

export type KanbanLaneTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'
export type KanbanPriority = 'high' | 'medium' | 'low'

export interface NormalizedKanbanCard {
  readonly id: string
  readonly title: string
  readonly description?: string | undefined
  readonly priority?: KanbanPriority | undefined
  readonly tag?: string | undefined
  readonly assignee?: string | undefined
  readonly meta?: string | undefined
  readonly raw: Record<string, unknown>
}

export interface NormalizedKanbanColumn {
  readonly id: string
  readonly title: string
  readonly tone: KanbanLaneTone
  readonly cards: readonly NormalizedKanbanCard[]
}

function normalizeKanbanTone(raw: unknown): KanbanLaneTone {
  if (
    raw === 'info' ||
    raw === 'warning' ||
    raw === 'success' ||
    raw === 'danger' ||
    raw === 'neutral'
  ) {
    return raw
  }
  return 'neutral'
}

function normalizeKanbanPriority(raw: unknown): KanbanPriority | undefined {
  if (typeof raw !== 'string') return undefined
  const s = raw.trim().toLowerCase()
  if (s === 'high' || s === 'p0' || s === 'p1' || s === 'critical' || s === 'urgent') return 'high'
  if (s === 'medium' || s === 'med' || s === 'p2' || s === 'normal') return 'medium'
  if (s === 'low' || s === 'p3') return 'low'
  return undefined
}

export function normalizeKanbanColumns(raw: unknown): readonly NormalizedKanbanColumn[] {
  if (!Array.isArray(raw)) return []
  const cols: NormalizedKanbanColumn[] = []
  raw.forEach((colItem, colIdx) => {
    if (typeof colItem !== 'object' || colItem === null) return
    const rec = colItem as Record<string, unknown>
    const colId = String(rec.id ?? rec.key ?? `col_${colIdx}`)
    const title = String(rec.title ?? rec.label ?? rec.name ?? colId)
    const rawCards = Array.isArray(rec.cards)
      ? rec.cards
      : Array.isArray(rec.items)
        ? rec.items
        : []
    const cards: NormalizedKanbanCard[] = []
    rawCards.forEach((cItem, cIdx) => {
      if (typeof cItem === 'string') {
        cards.push({
          id: `${colId}_card_${cIdx}`,
          title: cItem,
          raw: { title: cItem },
        })
        return
      }
      if (typeof cItem === 'object' && cItem !== null) {
        const crec = cItem as Record<string, unknown>
        const cardTitle = String(crec.title ?? crec.label ?? crec.name ?? '')
        if (!cardTitle) return
        cards.push({
          id: String(crec.id ?? `${colId}_card_${cIdx}`),
          title: cardTitle,
          description: crec.description ? String(crec.description) : undefined,
          priority: normalizeKanbanPriority(crec.priority),
          tag: crec.tag ? String(crec.tag) : undefined,
          assignee: crec.assignee
            ? String(crec.assignee)
            : crec.owner
              ? String(crec.owner)
              : undefined,
          meta: crec.meta ? String(crec.meta) : undefined,
          raw: crec,
        })
      }
    })
    cols.push({
      id: colId,
      title,
      tone: normalizeKanbanTone(rec.tone),
      cards,
    })
  })
  return cols
}

/* ─────────────────────────── SourceList ─────────────────────────── */

export interface NormalizedSourceItem {
  readonly id: string
  readonly index: number
  readonly title: string
  readonly url?: string | undefined
  readonly domain: string
  readonly filePath?: string | undefined
  readonly line?: number | undefined
  readonly snippet: string
  readonly scorePercent?: number | undefined
  readonly publishedAt?: string | undefined
  readonly badge?: string | undefined
  readonly raw: Record<string, unknown>
}

function extractSafeHostname(urlStr: string): string {
  try {
    const u = new URL(urlStr)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    return u.hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function normalizeSourceItems(raw: unknown): readonly NormalizedSourceItem[] {
  if (!Array.isArray(raw)) return []
  const items: NormalizedSourceItem[] = []
  raw.forEach((entry, idx) => {
    if (typeof entry !== 'object' || entry === null) return
    const rec = entry as Record<string, unknown>
    const title = String(rec.title ?? rec.name ?? rec.label ?? rec.filePath ?? rec.url ?? '')
    if (!title) return
    const rawUrl = typeof rec.url === 'string' && rec.url.trim() !== '' ? rec.url.trim() : undefined
    const safeHost = rawUrl ? extractSafeHostname(rawUrl) : ''
    const url = safeHost ? rawUrl : undefined
    const filePath =
      typeof rec.filePath === 'string' && rec.filePath.trim() !== ''
        ? rec.filePath.trim()
        : typeof rec.path === 'string' && rec.path.trim() !== ''
          ? rec.path.trim()
          : undefined
    const line =
      typeof rec.line === 'number' && Number.isFinite(rec.line) ? Math.trunc(rec.line) : undefined
    const domain =
      typeof rec.domain === 'string' && rec.domain.trim() !== ''
        ? rec.domain.trim()
        : safeHost || (filePath ? 'workspace' : '')
    const snippet =
      rec.snippet !== undefined && rec.snippet !== null
        ? String(rec.snippet)
        : rec.summary !== undefined && rec.summary !== null
          ? String(rec.summary)
          : ''

    let scorePercent: number | undefined
    if (typeof rec.score === 'number' && Number.isFinite(rec.score) && rec.score >= 0) {
      scorePercent =
        rec.score <= 1 ? Math.round(rec.score * 100) : Math.min(100, Math.round(rec.score))
    }

    items.push({
      id: String(rec.id ?? `src_${idx}`),
      index: idx + 1,
      title,
      url,
      domain,
      filePath,
      line,
      snippet,
      scorePercent,
      publishedAt: rec.publishedAt
        ? String(rec.publishedAt)
        : rec.date
          ? String(rec.date)
          : undefined,
      badge: rec.badge ? String(rec.badge) : undefined,
      raw: rec,
    })
  })
  return items
}

/* ─────────────────────────── MetricRing ─────────────────────────── */

export type MetricRingTone = 'brand' | 'success' | 'warning' | 'danger'

export interface MetricRingGeometry {
  readonly clampedRatio: number
  readonly displayNumber: string
  readonly size: number
  readonly strokeWidth: number
  readonly radius: number
  readonly circumference: number
  readonly dashOffset: number
  readonly resolvedTone: MetricRingTone
}

export function computeMetricRingGeometry(params: {
  readonly value: unknown
  readonly max?: number | undefined
  readonly size?: number | undefined
  readonly tone?: 'brand' | 'success' | 'warning' | 'danger' | 'auto' | undefined
}): MetricRingGeometry {
  const num = Number(params.value)
  const safeVal = Number.isFinite(num) ? num : 0
  const max =
    typeof params.max === 'number' && Number.isFinite(params.max) && params.max > 0
      ? params.max
      : 100
  const clampedRatio = Math.max(0, Math.min(1, safeVal / max))
  const size =
    typeof params.size === 'number' && Number.isFinite(params.size)
      ? Math.max(64, Math.min(180, Math.round(params.size)))
      : 88
  const strokeWidth = size >= 112 ? 8 : size >= 84 ? 7 : 6
  const radius = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - clampedRatio)

  const displayNumber = Number.isInteger(safeVal)
    ? String(safeVal)
    : safeVal.toFixed(Math.abs(safeVal) < 10 ? 2 : 1).replace(/\.?0+$/, '')

  let resolvedTone: MetricRingTone
  if (!params.tone || params.tone === 'brand') {
    resolvedTone = 'brand'
  } else if (params.tone === 'auto') {
    resolvedTone = clampedRatio >= 0.88 ? 'danger' : clampedRatio >= 0.7 ? 'warning' : 'success'
  } else {
    resolvedTone = params.tone
  }

  return {
    clampedRatio,
    displayNumber,
    size,
    strokeWidth,
    radius,
    circumference,
    dashOffset,
    resolvedTone,
  }
}

/* ─────────────────────────── ServiceGraph ─────────────────────────── */

export type ServiceHealthStatus = 'healthy' | 'warning' | 'error' | 'unknown'

export interface PositionedServiceNode {
  readonly id: string
  readonly label: string
  readonly status: ServiceHealthStatus
  readonly metric?: string | undefined
  readonly sublabel?: string | undefined
  readonly group?: string | undefined
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly raw: Record<string, unknown>
}

export interface PositionedServiceEdge {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly label?: string | undefined
  readonly status: 'healthy' | 'warning' | 'error'
  readonly pathD: string
  readonly labelX: number
  readonly labelY: number
  readonly isBackEdge: boolean
}

export interface ServiceGraphLayout {
  readonly width: number
  readonly height: number
  readonly nodes: readonly PositionedServiceNode[]
  readonly edges: readonly PositionedServiceEdge[]
  readonly upstreamByNode: ReadonlyMap<string, readonly string[]>
  readonly downstreamByNode: ReadonlyMap<string, readonly string[]>
}

function normalizeHealthStatus(raw: unknown): ServiceHealthStatus {
  if (typeof raw !== 'string') return 'healthy'
  const s = raw.trim().toLowerCase()
  if (s === 'error' || s === 'err' || s === 'down' || s === 'critical' || s === 'danger') {
    return 'error'
  }
  if (s === 'warning' || s === 'warn' || s === 'degraded') return 'warning'
  if (s === 'unknown' || s === 'pending' || s === 'idle') return 'unknown'
  return 'healthy'
}

function normalizeEdgeStatus(raw: unknown): 'healthy' | 'warning' | 'error' {
  const h = normalizeHealthStatus(raw)
  return h === 'unknown' ? 'healthy' : h
}

export function buildServiceGraphLayout(
  rawNodes: unknown,
  rawEdges: unknown,
  direction: 'LR' | 'TB' = 'LR',
): ServiceGraphLayout {
  const parsedNodes: Array<{
    id: string
    label: string
    status: ServiceHealthStatus
    metric?: string | undefined
    sublabel?: string | undefined
    group?: string | undefined
    raw: Record<string, unknown>
  }> = []
  const nodeMap = new Map<string, (typeof parsedNodes)[number]>()

  if (Array.isArray(rawNodes)) {
    rawNodes.forEach((item, idx) => {
      if (typeof item === 'string') {
        if (!nodeMap.has(item)) {
          const n = {
            id: item,
            label: item,
            status: 'healthy' as const,
            raw: { id: item, label: item },
          }
          parsedNodes.push(n)
          nodeMap.set(item, n)
        }
        return
      }
      if (typeof item === 'object' && item !== null) {
        const rec = item as Record<string, unknown>
        const id = String(rec.id ?? rec.key ?? rec.name ?? `svc_${idx}`)
        if (!id || nodeMap.has(id)) return
        const label = String(rec.label ?? rec.title ?? rec.name ?? id)
        const n = {
          id,
          label,
          status: normalizeHealthStatus(rec.status ?? rec.health),
          metric: rec.metric !== undefined && rec.metric !== null ? String(rec.metric) : undefined,
          sublabel:
            rec.sublabel !== undefined && rec.sublabel !== null
              ? String(rec.sublabel)
              : rec.role !== undefined && rec.role !== null
                ? String(rec.role)
                : undefined,
          group: rec.group !== undefined && rec.group !== null ? String(rec.group) : undefined,
          raw: rec,
        }
        parsedNodes.push(n)
        nodeMap.set(id, n)
      }
    })
  }

  if (parsedNodes.length === 0) {
    return {
      width: 320,
      height: 120,
      nodes: [],
      edges: [],
      upstreamByNode: new Map(),
      downstreamByNode: new Map(),
    }
  }

  const parsedEdges: Array<{
    from: string
    to: string
    label?: string | undefined
    status: 'healthy' | 'warning' | 'error'
  }> = []
  const upstreamMap = new Map<string, string[]>()
  const downstreamMap = new Map<string, string[]>()
  for (const n of parsedNodes) {
    upstreamMap.set(n.id, [])
    downstreamMap.set(n.id, [])
  }

  if (Array.isArray(rawEdges)) {
    for (const item of rawEdges) {
      if (typeof item !== 'object' || item === null) continue
      const rec = item as Record<string, unknown>
      const from = String(rec.from ?? rec.source ?? '')
      const to = String(rec.to ?? rec.target ?? '')
      if (!from || !to || from === to || !nodeMap.has(from) || !nodeMap.has(to)) continue
      const up = upstreamMap.get(to)!
      if (!up.includes(from)) up.push(from)
      const down = downstreamMap.get(from)!
      if (!down.includes(to)) down.push(to)
      parsedEdges.push({
        from,
        to,
        label: rec.label !== undefined && rec.label !== null ? String(rec.label) : undefined,
        status: normalizeEdgeStatus(rec.status),
      })
    }
  }

  // Cycle-safe DFS back-edge detection + longest-path topological rank assignment
  const visitState = new Map<string, 0 | 1 | 2>()
  const backEdgeKeys = new Set<string>()
  const dfs = (u: string) => {
    visitState.set(u, 1)
    for (const v of downstreamMap.get(u) ?? []) {
      const st = visitState.get(v) ?? 0
      if (st === 1) {
        backEdgeKeys.add(`${u}->${v}`)
      } else if (st === 0) {
        dfs(v)
      }
    }
    visitState.set(u, 2)
  }
  for (const n of parsedNodes) {
    if ((visitState.get(n.id) ?? 0) === 0) dfs(n.id)
  }

  const rankOf = new Map<string, number>()
  for (const n of parsedNodes) rankOf.set(n.id, 0)
  const maxPasses = parsedNodes.length
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false
    for (const e of parsedEdges) {
      if (backEdgeKeys.has(`${e.from}->${e.to}`)) continue
      const nextRank = Math.min(maxPasses - 1, (rankOf.get(e.from) ?? 0) + 1)
      if (nextRank > (rankOf.get(e.to) ?? 0)) {
        rankOf.set(e.to, nextRank)
        changed = true
      }
    }
    if (!changed) break
  }

  const layers = new Map<number, typeof parsedNodes>()
  let maxRank = 0
  for (const n of parsedNodes) {
    const r = rankOf.get(n.id) ?? 0
    if (r > maxRank) maxRank = r
    const bucket = layers.get(r)
    if (bucket) bucket.push(n)
    else layers.set(r, [n])
  }

  // Single-pass barycenter ordering per rank to reduce edge crossings
  const orderInLayer = new Map<string, number>()
  const rank0 = layers.get(0) ?? []
  rank0.forEach((n, idx) => {
    orderInLayer.set(n.id, idx)
  })
  for (let r = 1; r <= maxRank; r++) {
    const bucket = layers.get(r)
    if (!bucket) continue
    bucket.sort((a, b) => {
      const predsA = (upstreamMap.get(a.id) ?? []).filter((p) => (rankOf.get(p) ?? 0) < r)
      const predsB = (upstreamMap.get(b.id) ?? []).filter((p) => (rankOf.get(p) ?? 0) < r)
      const avgA =
        predsA.length > 0
          ? predsA.reduce((acc, p) => acc + (orderInLayer.get(p) ?? 0), 0) / predsA.length
          : 999
      const avgB =
        predsB.length > 0
          ? predsB.reduce((acc, p) => acc + (orderInLayer.get(p) ?? 0), 0) / predsB.length
          : 999
      return avgA - avgB
    })
    bucket.forEach((n, idx) => {
      orderInLayer.set(n.id, idx)
    })
  }

  const NODE_W = 158
  const NODE_H = 58
  const PAD_X = 16
  const PAD_Y = 16
  const RANK_GAP = direction === 'LR' ? 62 : 56
  const SIBLING_GAP = direction === 'LR' ? 18 : 20

  let maxLayerCount = 1
  for (const bucket of layers.values()) {
    if (bucket.length > maxLayerCount) maxLayerCount = bucket.length
  }

  const numRanks = maxRank + 1
  const width =
    direction === 'LR'
      ? PAD_X * 2 + numRanks * NODE_W + Math.max(0, numRanks - 1) * RANK_GAP
      : PAD_X * 2 + maxLayerCount * NODE_W + Math.max(0, maxLayerCount - 1) * SIBLING_GAP
  const height =
    direction === 'LR'
      ? PAD_Y * 2 + maxLayerCount * NODE_H + Math.max(0, maxLayerCount - 1) * SIBLING_GAP
      : PAD_Y * 2 + numRanks * NODE_H + Math.max(0, numRanks - 1) * RANK_GAP

  const posNodes: PositionedServiceNode[] = []
  const posById = new Map<string, PositionedServiceNode>()

  for (let r = 0; r <= maxRank; r++) {
    const bucket = layers.get(r) ?? []
    const count = bucket.length
    if (direction === 'LR') {
      const colSpan = count * NODE_H + Math.max(0, count - 1) * SIBLING_GAP
      const startY = Math.round((height - colSpan) / 2)
      const x = PAD_X + r * (NODE_W + RANK_GAP)
      bucket.forEach((n, idx) => {
        const p: PositionedServiceNode = {
          ...n,
          x,
          y: startY + idx * (NODE_H + SIBLING_GAP),
          width: NODE_W,
          height: NODE_H,
        }
        posNodes.push(p)
        posById.set(p.id, p)
      })
    } else {
      const rowSpan = count * NODE_W + Math.max(0, count - 1) * SIBLING_GAP
      const startX = Math.round((width - rowSpan) / 2)
      const y = PAD_Y + r * (NODE_H + RANK_GAP)
      bucket.forEach((n, idx) => {
        const p: PositionedServiceNode = {
          ...n,
          x: startX + idx * (NODE_W + SIBLING_GAP),
          y,
          width: NODE_W,
          height: NODE_H,
        }
        posNodes.push(p)
        posById.set(p.id, p)
      })
    }
  }

  const posEdges: PositionedServiceEdge[] = []
  parsedEdges.forEach((e, idx) => {
    const src = posById.get(e.from)
    const dst = posById.get(e.to)
    if (!src || !dst) return
    const isBack = backEdgeKeys.has(`${e.from}->${e.to}`)
    let sx: number
    let sy: number
    let tx: number
    let ty: number
    let pathD: string
    let labelX: number
    let labelY: number

    if (direction === 'LR') {
      sx = isBack ? src.x : src.x + src.width
      sy = src.y + src.height / 2
      tx = isBack ? dst.x + dst.width : dst.x
      ty = dst.y + dst.height / 2
      if (isBack) {
        const arcY = Math.min(src.y, dst.y) - 24
        pathD = `M ${sx} ${sy} C ${sx - 30} ${arcY}, ${tx + 30} ${arcY}, ${tx} ${ty}`
        labelX = (sx + tx) / 2
        labelY = arcY + 6
      } else {
        const dx = Math.max(28, Math.abs(tx - sx) * 0.48)
        pathD = `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`
        labelX = (sx + tx) / 2
        labelY = (sy + ty) / 2
      }
    } else {
      sx = src.x + src.width / 2
      sy = isBack ? src.y : src.y + src.height
      tx = dst.x + dst.width / 2
      ty = isBack ? dst.y + dst.height : dst.y
      const dy = Math.max(24, Math.abs(ty - sy) * 0.48)
      pathD = isBack
        ? `M ${sx} ${sy} C ${sx + 36} ${sy - dy}, ${tx + 36} ${ty + dy}, ${tx} ${ty}`
        : `M ${sx} ${sy} C ${sx} ${sy + dy}, ${tx} ${ty - dy}, ${tx} ${ty}`
      labelX = (sx + tx) / 2
      labelY = (sy + ty) / 2
    }

    posEdges.push({
      id: `edge_${idx}_${e.from}_${e.to}`,
      from: e.from,
      to: e.to,
      label: e.label,
      status: e.status,
      pathD,
      labelX: Math.round(labelX),
      labelY: Math.round(labelY),
      isBackEdge: isBack,
    })
  })

  return {
    width,
    height,
    nodes: posNodes,
    edges: posEdges,
    upstreamByNode: upstreamMap,
    downstreamByNode: downstreamMap,
  }
}
