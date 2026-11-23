import { isDangerousObjectKey } from '../../shared/constants.ts'

export function makeUniqueIdFactory(): (rawId: string) => string {
  const seen = new Map<string, number>()
  return (rawId: string): string => {
    const base = rawId.trim() || 'item'
    const count = seen.get(base)
    if (count === undefined) {
      seen.set(base, 1)
      return base
    }
    let next = count + 1
    let candidate = `${base}_${next}`
    while (seen.has(candidate)) {
      next += 1
      candidate = `${base}_${next}`
    }
    seen.set(base, next)
    seen.set(candidate, 1)
    return candidate
  }
}

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
  const seenKeys = new Set<string>()
  if (Array.isArray(rawOptions)) {
    rawOptions.forEach((item, idx) => {
      if (typeof item === 'string') {
        if (seenKeys.has(item)) return
        seenKeys.add(item)
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
        if (seenKeys.has(key)) return
        seenKeys.add(key)
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
      const cells = Object.create(null) as Record<string, ParsedComparisonCell>
      for (const opt of options) {
        if (isDangerousObjectKey(opt.key)) continue
        cells[opt.key] = parseComparisonCell(
          Object.hasOwn(valSource, opt.key) ? valSource[opt.key] : undefined,
        )
      }
      rows.push({ label, cells })
    }
  }

  return { options, rows }
}

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
  const nextId = makeUniqueIdFactory()
  list.forEach((item, idx) => {
    if (typeof item === 'string') {
      const m = RAW_LOG_RE.exec(item)
      out.push({
        id: nextId(`log_${idx}`),
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
        id: nextId(String(rec.id ?? `log_${idx}`)),
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
  const nextColId = makeUniqueIdFactory()
  const nextCardId = makeUniqueIdFactory()
  raw.forEach((colItem, colIdx) => {
    if (typeof colItem !== 'object' || colItem === null) return
    const rec = colItem as Record<string, unknown>
    const colId = nextColId(String(rec.id ?? rec.key ?? `col_${colIdx}`))
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
          id: nextCardId(`${colId}_card_${cIdx}`),
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
          id: nextCardId(String(crec.id ?? `${colId}_card_${cIdx}`)),
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
  const nextId = makeUniqueIdFactory()
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
      id: nextId(String(rec.id ?? `src_${idx}`)),
      index: items.length + 1,
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
  readonly numberFontSize: number
  readonly unitFontSize: number
  readonly stackUnit: boolean
}

function formatHighPrecisionBelowHundred(val: number): string {
  const d3 = Number(val.toFixed(3))
  if (d3 < 100) return d3.toString()
  const d4 = Number(val.toFixed(4))
  if (d4 < 100) return d4.toString()
  return (Math.floor(val * 10_000) / 10_000).toString()
}

export function computeMetricRingGeometry(params: {
  readonly value: unknown
  readonly max?: number | undefined
  readonly size?: number | undefined
  readonly tone?: 'brand' | 'success' | 'warning' | 'danger' | 'auto' | undefined
  readonly unit?: string | undefined
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
    : safeVal > 99.9 && safeVal < 100
      ? formatHighPrecisionBelowHundred(safeVal)
      : Number(safeVal.toFixed(2)).toString()

  const resolvedUnit = params.unit !== undefined ? params.unit : max === 100 ? '%' : ''
  const innerClearDiameter = Math.max(26, radius * 2 - strokeWidth - 10)
  let numEmUnits = 0
  for (const ch of displayNumber) {
    numEmUnits += (ch.codePointAt(0) ?? 0) > 0xff ? 1.05 : ch === '.' ? 0.34 : 0.68
  }
  let unitEmUnits = 0
  for (const ch of resolvedUnit) {
    unitEmUnits += (ch.codePointAt(0) ?? 0) > 0xff ? 0.78 : ch === '%' ? 0.78 : 0.5
  }
  const inlineEmUnits = numEmUnits + (resolvedUnit ? 0.1 + unitEmUnits : 0)
  const stackUnit =
    resolvedUnit.length >= 2 &&
    (displayNumber.length + resolvedUnit.length >= 7 || inlineEmUnits * 10 > innerClearDiameter)

  const maxFitFont = stackUnit
    ? innerClearDiameter / Math.max(1.6, numEmUnits)
    : innerClearDiameter / Math.max(1.6, inlineEmUnits)
  const minFont = displayNumber.length >= 6 ? 6.6 : stackUnit ? 8 : 10
  const numberFontSize = Number(Math.max(minFont, Math.min(size * 0.2, maxFitFont)).toFixed(1))
  const maxUnitFit = resolvedUnit
    ? (innerClearDiameter * 0.88) / Math.max(1, unitEmUnits)
    : numberFontSize * 0.66
  const minUnitFont = displayNumber.length >= 6 ? 6.2 : 7.5
  const unitFontSize = Number(
    Math.max(
      minUnitFont,
      Math.min(numberFontSize * 0.68, stackUnit ? maxUnitFit : numberFontSize * 0.66),
    ).toFixed(1),
  )

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
    numberFontSize,
    unitFontSize,
    stackUnit,
  }
}

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
  readonly labelWidth: number
  readonly status: 'healthy' | 'warning' | 'error'
  readonly pathD: string
  readonly labelX: number
  readonly labelY: number
  readonly isBackEdge: boolean
}

export function estimateEdgeLabelWidth(label: string | undefined): number {
  if (!label) return 0
  let units = 0
  for (const ch of label) {
    units += (ch.codePointAt(0) ?? 0) > 0xff ? 10.4 : 6.0
  }
  return Math.max(40, Math.ceil(units + 12))
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

function estimateInlineTextPx(text: string | undefined, asciiPx: number, cjkPx: number): number {
  if (!text) return 0
  let total = 0
  for (const ch of text) {
    if (ch === ' ' || ch === '·' || ch === '.' || ch === ':' || ch === '-') {
      total += asciiPx * 0.52
    } else {
      total += (ch.codePointAt(0) ?? 0) > 0xff ? cjkPx : asciiPx
    }
  }
  return Math.ceil(total)
}

function cubicAt(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

function rectsOverlap(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number,
): boolean {
  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1
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

  const maxNodeWCap = maxRank <= 2 ? 182 : 156
  const estimateNodeIdealW = (n: (typeof parsedNodes)[number]): number => {
    const topW = 34 + estimateInlineTextPx(n.label, 7.6, 12.6)
    const subText = n.sublabel ?? n.group
    const bottomW =
      24 +
      estimateInlineTextPx(subText, 6.3, 11.2) +
      (subText && n.metric ? 8 : 0) +
      estimateInlineTextPx(n.metric, 6.5, 11.2)
    return Math.max(118, Math.min(maxNodeWCap, Math.ceil(Math.max(topW, bottomW))))
  }

  let maxIdealNodeW = 114
  for (const n of parsedNodes) {
    maxIdealNodeW = Math.max(maxIdealNodeW, estimateNodeIdealW(n))
  }
  const NODE_W = maxIdealNodeW
  const lrRankWidths: number[] = []
  for (let r = 0; r <= maxRank; r++) {
    const bucket = layers.get(r) ?? []
    let rw = 114
    for (const n of bucket) rw = Math.max(rw, estimateNodeIdealW(n))
    lrRankWidths.push(rw)
  }

  const NODE_H = 58
  const PAD_X = 12
  const PAD_Y = 16
  const hasTbForwardLabel =
    direction === 'TB' &&
    parsedEdges.some((e) => Boolean(e.label) && !backEdgeKeys.has(`${e.from}->${e.to}`))
  const TB_RANK_GAP = hasTbForwardLabel ? 64 : 56
  const SIBLING_GAP = direction === 'LR' ? 18 : 20

  const lrRankGaps = new Array<number>(Math.max(0, maxRank)).fill(52)
  if (direction === 'LR' && maxRank > 0) {
    for (const e of parsedEdges) {
      if (!e.label || backEdgeKeys.has(`${e.from}->${e.to}`)) continue
      const rFrom = rankOf.get(e.from) ?? 0
      const rTo = rankOf.get(e.to) ?? 0
      if (rTo <= rFrom) continue
      const span = rTo - rFrom
      const neededTotal = estimateEdgeLabelWidth(e.label) + 24
      if (span === 1) {
        lrRankGaps[rFrom] = Math.max(lrRankGaps[rFrom] ?? 52, neededTotal)
      } else {
        const intermediateNodesW = lrRankWidths.slice(rFrom + 1, rTo).reduce((sum, w) => sum + w, 0)
        const currentSpanWidth =
          intermediateNodesW + lrRankGaps.slice(rFrom, rTo).reduce((sum, g) => sum + g, 0)
        if (currentSpanWidth < neededTotal) {
          const extraEach = Math.ceil((neededTotal - currentSpanWidth) / span)
          for (let r = rFrom; r < rTo; r++) {
            lrRankGaps[r] = (lrRankGaps[r] ?? 52) + extraEach
          }
        }
      }
    }
  }

  const lrRankX: number[] = [PAD_X]
  for (let r = 0; r < maxRank; r++) {
    lrRankX.push(lrRankX[r]! + (lrRankWidths[r] ?? NODE_W) + (lrRankGaps[r] ?? 64))
  }

  let maxLayerCount = 1
  for (const bucket of layers.values()) {
    if (bucket.length > maxLayerCount) maxLayerCount = bucket.length
  }

  let maxTbForwardLabelW = 0
  if (direction === 'TB') {
    for (const e of parsedEdges) {
      if (e.label && !backEdgeKeys.has(`${e.from}->${e.to}`)) {
        maxTbForwardLabelW = Math.max(maxTbForwardLabelW, estimateEdgeLabelWidth(e.label))
      }
    }
  }

  const numRanks = maxRank + 1
  const baseWidth =
    direction === 'LR'
      ? (lrRankX[maxRank] ?? PAD_X) + (lrRankWidths[maxRank] ?? NODE_W) + PAD_X
      : Math.max(
          PAD_X * 2 + maxLayerCount * NODE_W + Math.max(0, maxLayerCount - 1) * SIBLING_GAP,
          maxTbForwardLabelW + PAD_X * 2,
        )
  const baseHeight =
    direction === 'LR'
      ? PAD_Y * 2 + maxLayerCount * NODE_H + Math.max(0, maxLayerCount - 1) * SIBLING_GAP
      : PAD_Y * 2 + numRanks * NODE_H + Math.max(0, numRanks - 1) * TB_RANK_GAP

  const draftNodes: Array<{
    id: string
    label: string
    status: ServiceHealthStatus
    metric?: string | undefined
    sublabel?: string | undefined
    group?: string | undefined
    x: number
    y: number
    width: number
    height: number
    raw: Record<string, unknown>
  }> = []
  const posById = new Map<string, (typeof draftNodes)[number]>()

  for (let r = 0; r <= maxRank; r++) {
    const bucket = layers.get(r) ?? []
    const count = bucket.length
    if (direction === 'LR') {
      const colSpan = count * NODE_H + Math.max(0, count - 1) * SIBLING_GAP
      const startY = Math.round((baseHeight - colSpan) / 2)
      const x = lrRankX[r] ?? PAD_X
      const colW = lrRankWidths[r] ?? NODE_W
      bucket.forEach((n, idx) => {
        const p = {
          ...n,
          x,
          y: startY + idx * (NODE_H + SIBLING_GAP),
          width: colW,
          height: NODE_H,
        }
        draftNodes.push(p)
        posById.set(p.id, p)
      })
    } else {
      const rowSpan = count * NODE_W + Math.max(0, count - 1) * SIBLING_GAP
      const startX = Math.round((baseWidth - rowSpan) / 2)
      const y = PAD_Y + r * (NODE_H + TB_RANK_GAP)
      bucket.forEach((n, idx) => {
        const p = {
          ...n,
          x: startX + idx * (NODE_W + SIBLING_GAP),
          y,
          width: NODE_W,
          height: NODE_H,
        }
        draftNodes.push(p)
        posById.set(p.id, p)
      })
    }
  }

  const globalMinNodeY = Math.min(...draftNodes.map((n) => n.y))
  const globalMaxNodeRight = Math.max(...draftNodes.map((n) => n.x + n.width))
  let backEdgeIdx = 0
  let skipEdgeIdx = 0
  let tbRightCorridorIdx = 0
  const pairTotals = new Map<string, number>()
  for (const pe of parsedEdges) {
    const pk = `${pe.from}->${pe.to}`
    pairTotals.set(pk, (pairTotals.get(pk) ?? 0) + 1)
  }
  const pairSeen = new Map<string, number>()

  interface DraftEdge {
    id: string
    from: string
    to: string
    label?: string | undefined
    labelWidth: number
    status: 'healthy' | 'warning' | 'error'
    sx: number
    sy: number
    cx1: number
    cy1: number
    cx2: number
    cy2: number
    tx: number
    ty: number
    labelX: number
    labelY: number
    isBackEdge: boolean
  }

  const placedLabelRects: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  const draftEdges: DraftEdge[] = []

  parsedEdges.forEach((e, idx) => {
    const src = posById.get(e.from)
    const dst = posById.get(e.to)
    if (!src || !dst) return
    const isBack = backEdgeKeys.has(`${e.from}->${e.to}`)
    const rFrom = rankOf.get(e.from) ?? 0
    const rTo = rankOf.get(e.to) ?? 0
    const labelW = estimateEdgeLabelWidth(e.label)
    const pairKey = `${e.from}->${e.to}`
    const totalParallel = pairTotals.get(pairKey) ?? 1
    const parallelIdx = pairSeen.get(pairKey) ?? 0
    pairSeen.set(pairKey, parallelIdx + 1)
    const parallelOffset = totalParallel > 1 ? (parallelIdx - (totalParallel - 1) / 2) * 14 : 0

    let sx: number
    let sy: number
    let cx1: number
    let cy1: number
    let cx2: number
    let cy2: number
    let tx: number
    let ty: number

    if (direction === 'LR') {
      if (isBack) {
        if (rFrom === rTo) {
          sx = src.x + src.width
          sy = src.y + src.height / 2 + parallelOffset
          tx = dst.x + dst.width
          ty = dst.y + dst.height / 2 + parallelOffset
          const apexX =
            Math.max(src.x + src.width, dst.x + dst.width) +
            Math.max(36, labelW / 2 + 16) +
            backEdgeIdx * 26
          cx1 = (apexX - 0.125 * (sx + tx)) / 0.75
          cx2 = cx1
          cy1 = sy
          cy2 = ty
        } else {
          sx = src.x + src.width / 2 + parallelOffset
          sy = src.y
          tx = dst.x + dst.width / 2 + parallelOffset
          ty = dst.y
          const apexY = globalMinNodeY - (26 + backEdgeIdx * 24)
          cx1 = sx
          cx2 = tx
          cy1 = (apexY - 0.125 * (sy + ty)) / 0.75
          cy2 = cy1
        }
        backEdgeIdx += 1
      } else {
        sx = src.x + src.width
        sy = src.y + src.height / 2 + parallelOffset
        tx = dst.x
        ty = dst.y + dst.height / 2 + parallelOffset
        const dx = Math.max(28, Math.abs(tx - sx) * 0.48)
        cx1 = sx + dx
        cy1 = sy + parallelOffset
        cx2 = tx - dx
        cy2 = ty + parallelOffset

        if (rTo - rFrom > 1) {
          const midNodes = draftNodes.filter((m) => {
            const rm = rankOf.get(m.id) ?? -1
            return rm > rFrom && rm < rTo
          })
          const hitsMidNode = midNodes.some((m) =>
            [0.2, 0.35, 0.5, 0.65, 0.8].some((t) => {
              const bx = cubicAt(t, sx, cx1, cx2, tx)
              const by = cubicAt(t, sy, cy1, cy2, ty)
              return (
                bx >= m.x - 10 &&
                bx <= m.x + m.width + 10 &&
                by >= m.y - 14 &&
                by <= m.y + m.height + 14
              )
            }),
          )
          if (hitsMidNode && midNodes.length > 0) {
            const maxBottom = Math.max(
              src.y + src.height,
              dst.y + dst.height,
              ...midNodes.map((m) => m.y + m.height),
            )
            const apexY = maxBottom + 24 + skipEdgeIdx * 24
            cy1 = (apexY - 0.125 * (sy + ty)) / 0.75
            cy2 = cy1
            skipEdgeIdx += 1
          }
        }
      }
    } else if (isBack) {
      sx = src.x + src.width
      sy = src.y + src.height / 2 + parallelOffset
      tx = dst.x + dst.width
      ty = dst.y + dst.height / 2 + parallelOffset
      const apexX = globalMaxNodeRight + Math.max(36, labelW / 2 + 16) + tbRightCorridorIdx * 28
      cx1 = (apexX - 0.125 * (sx + tx)) / 0.75
      cx2 = cx1
      cy1 = sy
      cy2 = ty
      backEdgeIdx += 1
      tbRightCorridorIdx += 1
    } else {
      sx = src.x + src.width / 2 + parallelOffset
      sy = src.y + src.height
      tx = dst.x + dst.width / 2 + parallelOffset
      ty = dst.y
      const dy = Math.max(24, Math.abs(ty - sy) * 0.48)
      cx1 = sx + parallelOffset
      cy1 = sy + dy
      cx2 = tx + parallelOffset
      cy2 = ty - dy

      if (rTo - rFrom > 1) {
        const midNodes = draftNodes.filter((m) => {
          const rm = rankOf.get(m.id) ?? -1
          return rm > rFrom && rm < rTo
        })
        const hitsMidNode = midNodes.some((m) =>
          [0.2, 0.35, 0.5, 0.65, 0.8].some((t) => {
            const bx = cubicAt(t, sx, cx1, cx2, tx)
            const by = cubicAt(t, sy, cy1, cy2, ty)
            return (
              bx >= m.x - 12 &&
              bx <= m.x + m.width + 12 &&
              by >= m.y - 10 &&
              by <= m.y + m.height + 10
            )
          }),
        )
        if (hitsMidNode && midNodes.length > 0) {
          sx = src.x + src.width
          sy = src.y + src.height / 2 + parallelOffset
          tx = dst.x + dst.width
          ty = dst.y + dst.height / 2 + parallelOffset
          const maxRight = Math.max(
            globalMaxNodeRight,
            src.x + src.width,
            dst.x + dst.width,
            ...midNodes.map((m) => m.x + m.width),
          )
          const apexX = maxRight + Math.max(34, labelW / 2 + 14) + tbRightCorridorIdx * 28
          cx1 = (apexX - 0.125 * (sx + tx)) / 0.75
          cx2 = cx1
          cy1 = sy
          cy2 = ty
          skipEdgeIdx += 1
          tbRightCorridorIdx += 1
        }
      }
    }

    let labelX = cubicAt(0.5, sx, cx1, cx2, tx)
    let labelY = cubicAt(0.5, sy, cy1, cy2, ty)

    if (e.label && labelW > 0) {
      const collidesAt = (lx: number, ly: number): boolean => {
        const x1 = lx - labelW / 2 - 3
        const y1 = ly - 10
        const x2 = lx + labelW / 2 + 3
        const y2 = ly + 10
        for (const n of draftNodes) {
          if (rectsOverlap(x1, y1, x2, y2, n.x - 2, n.y - 2, n.x + n.width + 2, n.y + n.height + 2))
            return true
        }
        for (const prev of placedLabelRects) {
          if (rectsOverlap(x1, y1, x2, y2, prev.x1, prev.y1, prev.x2, prev.y2)) return true
        }
        return false
      }

      let placed = false
      for (const tCand of [0.5, 0.34, 0.66, 0.27, 0.73]) {
        const candX = cubicAt(tCand, sx, cx1, cx2, tx)
        const candY = cubicAt(tCand, sy, cy1, cy2, ty)
        if (!collidesAt(candX, candY)) {
          labelX = candX
          labelY = candY
          placed = true
          break
        }
      }
      if (!placed) {
        for (const dyOffset of [-20, 20, -38, 38]) {
          if (!collidesAt(labelX, labelY + dyOffset)) {
            labelY += dyOffset
            break
          }
        }
      }
      placedLabelRects.push({
        x1: labelX - labelW / 2 - 2,
        y1: labelY - 9,
        x2: labelX + labelW / 2 + 2,
        y2: labelY + 9,
      })
    }

    draftEdges.push({
      id: `edge_${idx}_${e.from}_${e.to}`,
      from: e.from,
      to: e.to,
      label: e.label,
      labelWidth: labelW,
      status: e.status,
      sx,
      sy,
      cx1,
      cy1,
      cx2,
      cy2,
      tx,
      ty,
      labelX,
      labelY,
      isBackEdge: isBack,
    })
  })

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const n of draftNodes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }
  for (const de of draftEdges) {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const bx = cubicAt(t, de.sx, de.cx1, de.cx2, de.tx)
      const by = cubicAt(t, de.sy, de.cy1, de.cy2, de.ty)
      minX = Math.min(minX, bx - 4)
      minY = Math.min(minY, by - 4)
      maxX = Math.max(maxX, bx + 4)
      maxY = Math.max(maxY, by + 4)
    }
    if (de.label && de.labelWidth > 0) {
      minX = Math.min(minX, de.labelX - de.labelWidth / 2)
      minY = Math.min(minY, de.labelY - 10)
      maxX = Math.max(maxX, de.labelX + de.labelWidth / 2)
      maxY = Math.max(maxY, de.labelY + 10)
    }
  }

  const shiftX = minX < PAD_X ? Math.ceil(PAD_X - minX) : 0
  const shiftY = minY < PAD_Y ? Math.ceil(PAD_Y - minY) : 0
  const width = Math.max(baseWidth, Math.ceil(maxX + shiftX + PAD_X))
  const height = Math.max(baseHeight, Math.ceil(maxY + shiftY + PAD_Y))

  const posNodes: PositionedServiceNode[] = draftNodes.map((n) => ({
    ...n,
    x: n.x + shiftX,
    y: n.y + shiftY,
  }))

  const posEdges: PositionedServiceEdge[] = draftEdges.map((de) => {
    const sx = Math.round((de.sx + shiftX) * 10) / 10
    const sy = Math.round((de.sy + shiftY) * 10) / 10
    const cx1 = Math.round((de.cx1 + shiftX) * 10) / 10
    const cy1 = Math.round((de.cy1 + shiftY) * 10) / 10
    const cx2 = Math.round((de.cx2 + shiftX) * 10) / 10
    const cy2 = Math.round((de.cy2 + shiftY) * 10) / 10
    const tx = Math.round((de.tx + shiftX) * 10) / 10
    const ty = Math.round((de.ty + shiftY) * 10) / 10
    return {
      id: de.id,
      from: de.from,
      to: de.to,
      label: de.label,
      labelWidth: de.labelWidth,
      status: de.status,
      pathD: `M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${tx} ${ty}`,
      labelX: Math.round(de.labelX + shiftX),
      labelY: Math.round(de.labelY + shiftY),
      isBackEdge: de.isBackEdge,
    }
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
