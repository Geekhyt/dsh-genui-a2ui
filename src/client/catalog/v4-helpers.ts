/**
 * Pure, zero-DOM normalizers, cURL builders, schedule range calculators,
 * conditional-formatting matrix helpers, and ProTable CSV/Markdown exporters
 * for Phase v4 Enterprise & Vercel/Tremor A2UI 1.0 components.
 */

/* ─────────────────────────── 1. Tracker ─────────────────────────── */

export type TrackerSliceStatus = 'ok' | 'warning' | 'error' | 'unknown'
export type TrackerSegmentTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral'

export interface NormalizedTrackerSlice {
  readonly id: string
  readonly label: string
  readonly status: TrackerSliceStatus
  readonly note: string
}

export interface NormalizedCategorySegment {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly pct: number
  readonly tone: TrackerSegmentTone
}

const DEFAULT_SEGMENT_TONES: readonly TrackerSegmentTone[] = [
  'success',
  'brand',
  'warning',
  'danger',
  'neutral',
]

function normalizeSliceStatus(raw: unknown): TrackerSliceStatus {
  if (typeof raw !== 'string') return 'ok'
  const s = raw.trim().toLowerCase()
  if (s === 'error' || s === 'err' || s === 'down' || s === 'outage' || s === 'fail') {
    return 'error'
  }
  if (s === 'warning' || s === 'warn' || s === 'degraded' || s === 'slow') return 'warning'
  if (s === 'unknown' || s === 'empty' || s === 'none' || s === 'pending') return 'unknown'
  return 'ok'
}

export function normalizeTrackerSlices(raw: unknown): readonly NormalizedTrackerSlice[] {
  if (!Array.isArray(raw)) return []
  const out: NormalizedTrackerSlice[] = []
  raw.forEach((item, idx) => {
    if (typeof item === 'string') {
      out.push({
        id: `sl_${idx}`,
        label: `#${idx + 1}`,
        status: normalizeSliceStatus(item),
        note: '',
      })
      return
    }
    if (typeof item === 'object' && item !== null) {
      const rec = item as Record<string, unknown>
      out.push({
        id: String(rec.id ?? `sl_${idx}`),
        label: String(rec.label ?? rec.time ?? rec.date ?? `#${idx + 1}`),
        status: normalizeSliceStatus(rec.status ?? rec.state ?? rec.tone),
        note:
          rec.note !== undefined && rec.note !== null
            ? String(rec.note)
            : rec.tooltip !== undefined && rec.tooltip !== null
              ? String(rec.tooltip)
              : rec.summary !== undefined && rec.summary !== null
                ? String(rec.summary)
                : '',
      })
    }
  })
  return out
}

export function normalizeCategorySegments(raw: unknown): readonly NormalizedCategorySegment[] {
  if (!Array.isArray(raw)) return []
  const temp: Array<{ id: string; label: string; value: number; tone: TrackerSegmentTone }> = []
  raw.forEach((item, idx) => {
    if (typeof item !== 'object' || item === null) return
    const rec = item as Record<string, unknown>
    const val = Number(rec.value ?? rec.count ?? rec.share ?? 0)
    if (!Number.isFinite(val) || val <= 0) return
    const rawTone = rec.tone
    const tone: TrackerSegmentTone =
      rawTone === 'brand' ||
      rawTone === 'success' ||
      rawTone === 'warning' ||
      rawTone === 'danger' ||
      rawTone === 'neutral'
        ? rawTone
        : DEFAULT_SEGMENT_TONES[idx % DEFAULT_SEGMENT_TONES.length]!
    temp.push({
      id: String(rec.id ?? `seg_${idx}`),
      label: String(rec.label ?? rec.name ?? `Item ${idx + 1}`),
      value: val,
      tone,
    })
  })
  const total = temp.reduce((acc, s) => acc + s.value, 0)
  if (total <= 0) return []
  return temp.map((s) => ({
    ...s,
    pct: Number(((s.value / total) * 100).toFixed(1)),
  }))
}

/* ─────────────────────────── 2. Terminal ─────────────────────────── */

export interface NormalizedTerminalStep {
  readonly id: string
  readonly cmd: string
  readonly output: string
  readonly stderr: string
  readonly exitCode?: number | undefined
  readonly comment?: string | undefined
}

export function normalizeTerminalCommands(raw: unknown): readonly NormalizedTerminalStep[] {
  if (typeof raw === 'string') {
    const lines = raw.split(/\r?\n/)
    const steps: NormalizedTerminalStep[] = []
    let curCmd = ''
    let curOut: string[] = []
    const flush = () => {
      if (curCmd) {
        steps.push({
          id: `cmd_${steps.length}`,
          cmd: curCmd,
          output: curOut.join('\n').trim(),
          stderr: '',
        })
        curCmd = ''
        curOut = []
      }
    }
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (trimmed.startsWith('$ ') || trimmed.startsWith('> ')) {
        flush()
        curCmd = trimmed.slice(2).trim()
      } else if (!curCmd) {
        curCmd = trimmed
      } else {
        curOut.push(line)
      }
    }
    flush()
    return steps
  }
  if (!Array.isArray(raw)) return []
  const out: NormalizedTerminalStep[] = []
  raw.forEach((item, idx) => {
    if (typeof item === 'string') {
      const clean = item.trim().replace(/^\$\s+/, '')
      if (clean) out.push({ id: `cmd_${idx}`, cmd: clean, output: '', stderr: '' })
      return
    }
    if (typeof item === 'object' && item !== null) {
      const rec = item as Record<string, unknown>
      const cmd = String(rec.cmd ?? rec.command ?? '')
        .trim()
        .replace(/^\$\s+/, '')
      if (!cmd) return
      const exitCode =
        typeof rec.exitCode === 'number' && Number.isFinite(rec.exitCode)
          ? Math.trunc(rec.exitCode)
          : undefined
      out.push({
        id: String(rec.id ?? `cmd_${idx}`),
        cmd,
        output: rec.output !== undefined && rec.output !== null ? String(rec.output) : '',
        stderr: rec.stderr !== undefined && rec.stderr !== null ? String(rec.stderr) : '',
        exitCode,
        comment: rec.comment ? String(rec.comment) : undefined,
      })
    }
  })
  return out
}

/* ─────────────────────────── 3. ApiEndpoint ─────────────────────────── */

export interface RouteToken {
  readonly text: string
  readonly isParam: boolean
}

export interface NormalizedApiParam {
  readonly name: string
  readonly location: string
  readonly type: string
  readonly required: boolean
  readonly description: string
}

export function tokenizeEndpointPath(path: string): readonly RouteToken[] {
  const parts = path.split(/(\{[^}]+\}|:[a-zA-Z_][a-zA-Z0-9_]*)/g).filter(Boolean)
  return parts.map((text) => ({
    text,
    isParam: text.startsWith('{') || text.startsWith(':'),
  }))
}

export function normalizeApiParamsAndHeaders(
  rawParams: unknown,
  rawHeaders: unknown,
): readonly NormalizedApiParam[] {
  const out: NormalizedApiParam[] = []
  if (Array.isArray(rawParams)) {
    for (const p of rawParams) {
      if (typeof p !== 'object' || p === null) continue
      const rec = p as Record<string, unknown>
      const name = String(rec.name ?? rec.key ?? '')
      if (!name) continue
      out.push({
        name,
        location: String(rec.in ?? rec.location ?? 'query').toUpperCase(),
        type: String(rec.type ?? 'string'),
        required: Boolean(rec.required),
        description: rec.description ? String(rec.description) : '',
      })
    }
  }
  if (Array.isArray(rawHeaders)) {
    for (const h of rawHeaders) {
      if (typeof h !== 'object' || h === null) continue
      const rec = h as Record<string, unknown>
      const name = String(rec.name ?? rec.key ?? '')
      if (!name) continue
      out.push({
        name,
        location: 'HEADER',
        type: String(rec.value ?? 'string'),
        required: Boolean(rec.required),
        description: rec.description ? String(rec.description) : '',
      })
    }
  } else if (typeof rawHeaders === 'object' && rawHeaders !== null) {
    for (const [k, v] of Object.entries(rawHeaders as Record<string, unknown>)) {
      out.push({
        name: k,
        location: 'HEADER',
        type: String(v ?? ''),
        required: false,
        description: '',
      })
    }
  }
  return out
}

function shellEscapeSingle(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export function buildEndpointCurl(params: {
  readonly method: string
  readonly path: string
  readonly baseUrl?: string | undefined
  readonly headers?: unknown
  readonly requestBody?: unknown
}): string {
  const origin = (params.baseUrl?.trim() || 'https://api.example.com').replace(/\/+$/, '')
  const cleanPath = params.path.startsWith('/') ? params.path : `/${params.path}`
  const parts: string[] = [
    `curl -X ${params.method.toUpperCase()} ${shellEscapeSingle(`${origin}${cleanPath}`)}`,
  ]

  if (Array.isArray(params.headers)) {
    for (const item of params.headers) {
      if (typeof item !== 'object' || item === null) continue
      const rec = item as Record<string, unknown>
      const name = String(rec.name ?? rec.key ?? '').trim()
      if (!name) continue
      const val = String(rec.value ?? rec.example ?? '')
      parts.push(`-H ${shellEscapeSingle(`${name}: ${val}`)}`)
    }
  } else if (typeof params.headers === 'object' && params.headers !== null) {
    for (const [k, v] of Object.entries(params.headers as Record<string, unknown>)) {
      parts.push(`-H ${shellEscapeSingle(`${k}: ${String(v ?? '')}`)}`)
    }
  }
  if (params.requestBody !== undefined && params.requestBody !== null) {
    parts.push(`-H 'Content-Type: application/json'`)
    const bodyStr =
      typeof params.requestBody === 'string'
        ? params.requestBody
        : JSON.stringify(params.requestBody)
    parts.push(`-d ${shellEscapeSingle(bodyStr)}`)
  }
  return parts.join(' \\\n  ')
}

/* ─────────────────────────── 4. Schedule ─────────────────────────── */

export type ScheduleBarStatus = 'done' | 'active' | 'warning' | 'pending' | 'danger'

export interface NormalizedScheduleTrack {
  readonly id: string
  readonly title: string
  readonly startLabel: string
  readonly endLabel: string
  readonly leftPct: number
  readonly widthPct: number
  readonly progress?: number | undefined
  readonly status: ScheduleBarStatus
  readonly owner?: string | undefined
  readonly note?: string | undefined
  readonly raw: Record<string, unknown>
}

export interface NormalizedScheduleModel {
  readonly tracks: readonly NormalizedScheduleTrack[]
  readonly axisTicks: readonly string[]
  readonly nowPct?: number | undefined
  readonly nowLabel?: string | undefined
}

const HHMM_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/

function parseTemporalPosition(
  val: unknown,
): { numeric: number; kind: 'hhmm' | 'date' | 'num' } | null {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return { numeric: val, kind: 'num' }
  }
  if (typeof val !== 'string') return null
  const s = val.trim()
  const hm = HHMM_RE.exec(s)
  if (hm) {
    const h = Number.parseInt(hm[1]!, 10)
    const m = Number.parseInt(hm[2]!, 10)
    const sec = hm[3] ? Number.parseInt(hm[3], 10) : 0
    return { numeric: h * 60 + m + sec / 60, kind: 'hhmm' }
  }
  if (/^-?\d+(?:\.\d+)?$/.test(s)) {
    return { numeric: Number.parseFloat(s), kind: 'num' }
  }
  const ts = Date.parse(s)
  if (!Number.isNaN(ts)) {
    return { numeric: ts, kind: 'date' }
  }
  return null
}

function formatTickValue(val: number, kind: 'hhmm' | 'date' | 'num'): string {
  if (kind === 'hhmm') {
    const mins = Math.round(val)
    const hh = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm = String(mins % 60).padStart(2, '0')
    return `${hh}:${mm}`
  }
  if (kind === 'date') {
    const d = new Date(val)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${mm}-${dd}`
  }
  return Number.isInteger(val) ? String(val) : val.toFixed(1)
}

function normalizeScheduleStatus(raw: unknown, progress?: number): ScheduleBarStatus {
  if (
    raw === 'done' ||
    raw === 'active' ||
    raw === 'warning' ||
    raw === 'pending' ||
    raw === 'danger'
  ) {
    return raw
  }
  if (raw === 'success' || raw === 'completed') return 'done'
  if (raw === 'error') return 'danger'
  if (progress !== undefined) {
    if (progress >= 100) return 'done'
    if (progress > 0) return 'active'
  }
  return 'active'
}

export function normalizeScheduleItems(
  rawItems: unknown,
  rawRange?: unknown,
  rawNow?: unknown,
): NormalizedScheduleModel {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { tracks: [], axisTicks: [] }
  }
  const parsed: Array<{
    id: string
    title: string
    startLabel: string
    endLabel: string
    sNum: number
    eNum: number
    kind: 'hhmm' | 'date' | 'num'
    progress?: number | undefined
    status: ScheduleBarStatus
    owner?: string | undefined
    note?: string | undefined
    raw: Record<string, unknown>
  }> = []

  rawItems.forEach((entry, idx) => {
    if (typeof entry !== 'object' || entry === null) return
    const rec = entry as Record<string, unknown>
    const title = String(rec.title ?? rec.label ?? rec.name ?? `Task ${idx + 1}`)
    const pStart = parseTemporalPosition(rec.start)
    const pEnd = parseTemporalPosition(rec.end)
    if (!pStart || !pEnd) return
    const sNum = Math.min(pStart.numeric, pEnd.numeric)
    const eNum = Math.max(pStart.numeric, pEnd.numeric)
    const prog =
      typeof rec.progress === 'number' && Number.isFinite(rec.progress)
        ? Math.max(0, Math.min(100, Math.round(rec.progress)))
        : undefined
    parsed.push({
      id: String(rec.id ?? `sched_${idx}`),
      title,
      startLabel: String(rec.start),
      endLabel: String(rec.end),
      sNum,
      eNum,
      kind: pStart.kind,
      progress: prog,
      status: normalizeScheduleStatus(rec.status, prog),
      owner: rec.owner ? String(rec.owner) : rec.assignee ? String(rec.assignee) : undefined,
      note: rec.note ? String(rec.note) : undefined,
      raw: rec,
    })
  })

  if (parsed.length === 0) return { tracks: [], axisTicks: [] }

  const kind = parsed[0]!.kind
  let minB = Math.min(...parsed.map((p) => p.sNum))
  let maxB = Math.max(...parsed.map((p) => p.eNum))

  if (Array.isArray(rawRange) && rawRange.length >= 2) {
    const r0 = parseTemporalPosition(rawRange[0])
    const r1 = parseTemporalPosition(rawRange[1])
    if (r0 && r1 && r1.numeric > r0.numeric) {
      minB = Math.min(minB, r0.numeric)
      maxB = Math.max(maxB, r1.numeric)
    }
  }
  const span = maxB > minB ? maxB - minB : 1

  const tracks: NormalizedScheduleTrack[] = parsed.map((p) => {
    const leftPct = Math.max(0, Math.min(96, ((p.sNum - minB) / span) * 100))
    const rawW = ((p.eNum - p.sNum) / span) * 100
    const widthPct = Math.max(4, Math.min(100 - leftPct, rawW))
    return {
      id: p.id,
      title: p.title,
      startLabel: p.startLabel,
      endLabel: p.endLabel,
      leftPct: Number(leftPct.toFixed(2)),
      widthPct: Number(widthPct.toFixed(2)),
      progress: p.progress,
      status: p.status,
      owner: p.owner,
      note: p.note,
      raw: p.raw,
    }
  })

  const axisTicks = [0, 0.3333, 0.6667, 1].map((t) => formatTickValue(minB + span * t, kind))

  let nowPct: number | undefined
  let nowLabel: string | undefined
  if (rawNow !== undefined && rawNow !== null && String(rawNow).trim() !== '') {
    const pNow = parseTemporalPosition(rawNow)
    if (pNow && pNow.numeric >= minB && pNow.numeric <= maxB) {
      nowPct = Number((((pNow.numeric - minB) / span) * 100).toFixed(2))
      nowLabel = String(rawNow).trim()
    }
  }

  return { tracks, axisTicks, nowPct, nowLabel }
}

/* ─────────────────────────── 5. Matrix ─────────────────────────── */

export interface NormalizedMatrixCell {
  readonly kind: 'number' | 'ok' | 'warn' | 'no' | 'empty' | 'text'
  readonly display: string
  readonly intensityPct: number
}

export interface NormalizedMatrixModel {
  readonly rowLabels: readonly string[]
  readonly colLabels: readonly string[]
  readonly cells: readonly (readonly NormalizedMatrixCell[])[]
  readonly rowSummaries?: readonly string[] | undefined
}

export function normalizeMatrixData(params: {
  readonly rows: unknown
  readonly columns: unknown
  readonly values: unknown
  readonly unit?: string | undefined
  readonly showTotals?: boolean | undefined
}): NormalizedMatrixModel {
  const rowLabels = Array.isArray(params.rows) ? params.rows.map(String) : []
  const colLabels = Array.isArray(params.columns) ? params.columns.map(String) : []
  const rawGrid = Array.isArray(params.values) ? params.values : []
  const unit = params.unit ?? ''

  let minNum = Number.POSITIVE_INFINITY
  let maxNum = Number.NEGATIVE_INFINITY
  for (let r = 0; r < rowLabels.length; r++) {
    const rowArr = Array.isArray(rawGrid[r]) ? (rawGrid[r] as unknown[]) : []
    for (let c = 0; c < colLabels.length; c++) {
      const v = rowArr[c]
      if (typeof v === 'number' && Number.isFinite(v)) {
        if (v < minNum) minNum = v
        if (v > maxNum) maxNum = v
      }
    }
  }
  const hasRange = Number.isFinite(minNum) && Number.isFinite(maxNum)
  const numSpan = hasRange && maxNum > minNum ? maxNum - minNum : 1

  const cells: NormalizedMatrixCell[][] = []
  const rowSummaries: string[] = []

  for (let r = 0; r < rowLabels.length; r++) {
    const rowArr = Array.isArray(rawGrid[r]) ? (rawGrid[r] as unknown[]) : []
    const rowOut: NormalizedMatrixCell[] = []
    const rowNums: number[] = []

    for (let c = 0; c < colLabels.length; c++) {
      const v = rowArr[c]
      if (v === undefined || v === null || v === '' || v === '—' || v === '-') {
        rowOut.push({ kind: 'empty', display: '—', intensityPct: 0 })
        continue
      }
      if (typeof v === 'number' && Number.isFinite(v)) {
        rowNums.push(v)
        const ratio = maxNum === minNum ? 0.65 : (v - minNum) / numSpan
        const intensityPct = Math.round(8 + ratio * 34)
        const formatted = Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '')
        rowOut.push({
          kind: 'number',
          display: `${formatted}${unit}`,
          intensityPct,
        })
        continue
      }
      if (typeof v === 'boolean') {
        rowOut.push({
          kind: v ? 'ok' : 'no',
          display: v ? '✓' : '—',
          intensityPct: 0,
        })
        continue
      }
      const s = String(v).trim()
      if (/^(?:ok|yes|pass):/i.test(s) || s === '✓' || s === '✔') {
        rowOut.push({
          kind: 'ok',
          display: s.replace(/^(?:ok|yes|pass):\s*/i, '') || '✓',
          intensityPct: 0,
        })
      } else if (/^(?:warn|warning):/i.test(s)) {
        rowOut.push({
          kind: 'warn',
          display: s.replace(/^(?:warn|warning):\s*/i, ''),
          intensityPct: 0,
        })
      } else if (/^(?:no|err|fail):/i.test(s) || s === '✕' || s === '✗') {
        rowOut.push({
          kind: 'no',
          display: s.replace(/^(?:no|err|fail):\s*/i, '') || '✕',
          intensityPct: 0,
        })
      } else {
        rowOut.push({ kind: 'text', display: s, intensityPct: 0 })
      }
    }
    cells.push(rowOut)
    if (params.showTotals) {
      if (rowNums.length > 0) {
        const avg = rowNums.reduce((a, b) => a + b, 0) / rowNums.length
        const avgStr = Number.isInteger(avg) ? String(avg) : avg.toFixed(1)
        rowSummaries.push(`${avgStr}${unit}`)
      } else {
        rowSummaries.push('—')
      }
    }
  }

  return {
    rowLabels,
    colLabels,
    cells,
    rowSummaries: params.showTotals ? rowSummaries : undefined,
  }
}

/* ─────────────────────────── 6. ProTable Helpers ─────────────────────────── */

export interface ProTableColumnDescriptor {
  readonly key: string
  readonly label: string
}

const CSV_FORMULA_PREFIX_RE = /^(?:[=@\t\r]|[+-](?!\d))/

function escapeCsvCell(raw: unknown): string {
  const rawStr = raw === undefined || raw === null ? '' : String(raw)
  const s = CSV_FORMULA_PREFIX_RE.test(rawStr) ? `'${rawStr}` : rawStr
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/** Generate RFC-4180 CSV prefixed with UTF-8 BOM (`\uFEFF`) so Excel renders CJK cleanly. */
export function formatTableToCsv(
  columns: readonly ProTableColumnDescriptor[],
  rows: readonly Record<string, unknown>[],
): string {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(',')
  const body = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key])).join(','))
  return `\uFEFF${[header, ...body].join('\r\n')}`
}

/** Generate GitHub-Flavored Markdown table from visible columns and rows. */
export function formatTableToMarkdown(
  columns: readonly ProTableColumnDescriptor[],
  rows: readonly Record<string, unknown>[],
  numericKeys?: ReadonlySet<string>,
): string {
  const escMd = (v: unknown) =>
    (v === undefined || v === null ? '' : String(v)).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const head = `| ${columns.map((c) => escMd(c.label)).join(' | ')} |`
  const sep = `| ${columns.map((c) => (numericKeys?.has(c.key) ? '---:' : ':---')).join(' | ')} |`
  const body = rows.map((row) => `| ${columns.map((c) => escMd(row[c.key])).join(' | ')} |`)
  return [head, sep, ...body].join('\n')
}

const NUMERIC_LIKE_RE = /^[¥$€£+-]?\s*\d[\d,]*(?:\.\d+)?\s*%?$/

export function detectNumericColumnKeys(
  columns: readonly { key: string; align?: 'left' | 'center' | 'right' }[],
  rows: readonly Record<string, unknown>[],
): ReadonlySet<string> {
  const set = new Set<string>()
  if (rows.length === 0) return set
  const sample = rows.slice(0, 20)
  for (const col of columns) {
    if (col.align === 'left' || col.align === 'center') continue
    if (col.align === 'right') {
      set.add(col.key)
      continue
    }
    let nonEmpty = 0
    let numericHits = 0
    for (const r of sample) {
      const v = r[col.key]
      if (v === undefined || v === null || v === '') continue
      nonEmpty += 1
      if (typeof v === 'number' && Number.isFinite(v)) {
        numericHits += 1
      } else if (typeof v === 'string' && NUMERIC_LIKE_RE.test(v.trim())) {
        numericHits += 1
      }
    }
    if (nonEmpty > 0 && numericHits === nonEmpty) {
      set.add(col.key)
    }
  }
  return set
}

export function computeTableNumericSummary(
  columns: readonly { key: string }[],
  rows: readonly Record<string, unknown>[],
  numericKeys: ReadonlySet<string>,
): Readonly<Record<string, string>> {
  const summary: Record<string, string> = {}
  for (const col of columns) {
    if (!numericKeys.has(col.key)) continue
    let sum = 0
    let count = 0
    let allPercent = true
    let prefix = ''
    for (const r of rows) {
      const v = r[col.key]
      if (typeof v === 'number' && Number.isFinite(v)) {
        sum += v
        count += 1
        allPercent = false
      } else if (typeof v === 'string') {
        const t = v.trim()
        if (!t.endsWith('%')) allPercent = false
        if (!prefix && /^[¥$€£]/.test(t)) prefix = t[0]!
        const cleaned = t.replace(/^[¥$€£+]/, '').replace(/[,%\s]/g, '')
        const n = Number.parseFloat(cleaned)
        if (Number.isFinite(n)) {
          sum += n
          count += 1
        }
      }
    }
    if (count > 0) {
      if (allPercent) {
        summary[col.key] = `Avg ${(sum / count).toFixed(1)}%`
      } else {
        const formatted = Number.isInteger(sum)
          ? sum.toLocaleString('en-US')
          : sum.toLocaleString('en-US', { maximumFractionDigits: 2 })
        summary[col.key] = `${prefix}${formatted}`
      }
    }
  }
  return summary
}

/* ─────────────────────────── 7. P2 Cross-Filter & Chart Export ─────────────────────────── */

/** Toggle cross-filter selection: clicking the already-active label clears it back to `""`. */
export function computeNextCrossFilterSelection(
  currentSelected: string | undefined,
  clickedLabel: string | undefined,
): string {
  const next = (clickedLabel ?? '').trim()
  if (next === '') return ''
  const cur = (currentSelected ?? '').trim()
  return cur !== '' && cur.toLowerCase() === next.toLowerCase() ? '' : next
}

/**
 * Filter ProTable rows locally at 0ms by a cross-filter `filterValue` (typically bound
 * to the same `$/path` as `Chart(..., selected=$/region)`).
 *
 * Uses exact case-insensitive match first so `"US"` doesn't collide with `"US-West"`;
 * falls back to normalized substring match only when zero exact matches exist (e.g.
 * Sankey node labels carrying numeric suffixes like `"华东 9,860"`).
 */
export function filterTableRowsByField(
  rows: readonly Record<string, unknown>[],
  filterField: string | undefined,
  filterValue: string | undefined,
): readonly Record<string, unknown>[] {
  const q = (filterValue ?? '').trim().toLowerCase()
  if (q === '') return rows
  const field = filterField?.trim()

  const cellText = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    if (typeof v === 'object') return JSON.stringify(v).toLowerCase()
    return String(v).trim().toLowerCase()
  }

  const exact = rows.filter((row) => {
    if (field) return cellText(row[field]) === q
    return Object.values(row).some((val) => cellText(val) === q)
  })
  if (exact.length > 0) return exact

  return rows.filter((row) => {
    if (field) {
      const t = cellText(row[field])
      return t !== '' && (t.includes(q) || q.includes(t))
    }
    return Object.values(row).some((val) => {
      const t = cellText(val)
      return t !== '' && (t.includes(q) || q.includes(t))
    })
  })
}

/**
 * Serialize any ECharts dataset (tabular row array or `{ nodes, links }` graph/sankey object)
 * to UTF-8 BOM CSV for 1-click clipboard copy / export.
 */
export function formatChartDataToCsv(data: unknown): string | null {
  let rows: Record<string, unknown>[] = []
  if (Array.isArray(data)) {
    rows = data.filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item),
    )
  } else if (typeof data === 'object' && data !== null) {
    const rec = data as Record<string, unknown>
    const rawLinks = Array.isArray(rec.links) ? rec.links : null
    const rawNodes = Array.isArray(rec.nodes) ? rec.nodes : null
    const source = rawLinks && rawLinks.length > 0 ? rawLinks : rawNodes
    if (source) {
      rows = source.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      )
    }
  }
  if (rows.length === 0) return null

  const keys: string[] = []
  const seen = new Set<string>()
  for (const row of rows.slice(0, 50)) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k)
        keys.push(k)
      }
    }
  }
  if (keys.length === 0) return null

  const cols: ProTableColumnDescriptor[] = keys.map((k) => ({ key: k, label: k }))
  return formatTableToCsv(cols, rows)
}
