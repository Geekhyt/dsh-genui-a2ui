import { safeStringifyJson } from '../../shared/constants.ts'
import { parseLocalDateAnchor } from '../../shared/temporal.ts'
import { makeUniqueIdFactory } from './v3-helpers.ts'

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
  const nextId = makeUniqueIdFactory()
  raw.forEach((item, idx) => {
    if (typeof item === 'string') {
      out.push({
        id: nextId(`sl_${idx}`),
        label: `#${idx + 1}`,
        status: normalizeSliceStatus(item),
        note: '',
      })
      return
    }
    if (typeof item === 'object' && item !== null) {
      const rec = item as Record<string, unknown>
      out.push({
        id: nextId(String(rec.id ?? `sl_${idx}`)),
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
  const nextId = makeUniqueIdFactory()
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
      id: nextId(String(rec.id ?? `seg_${idx}`)),
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
    const hasPromptPrefix = lines.some((l) => {
      const t = l.trim()
      return t.startsWith('$ ') || t.startsWith('> ')
    })
    const steps: NormalizedTerminalStep[] = []
    let curCmd = ''
    let curComment = ''
    let curOut: string[] = []
    const flush = () => {
      if (curCmd) {
        steps.push({
          id: `cmd_${steps.length}`,
          cmd: curCmd,
          output: curOut.join('\n').trim(),
          stderr: '',
          ...(curComment ? { comment: curComment } : {}),
        })
        curCmd = ''
        curComment = ''
        curOut = []
      }
    }
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (hasPromptPrefix) {
        if (trimmed.startsWith('$ ') || trimmed.startsWith('> ')) {
          flush()
          curCmd = trimmed.slice(2).trim()
        } else if (!curCmd && trimmed.startsWith('#')) {
          const text = trimmed.replace(/^#+\s*/, '')
          curComment = curComment ? `${curComment} ${text}` : text
        } else if (!curCmd) {
          curCmd = trimmed
        } else {
          curOut.push(line)
        }
      } else if (trimmed.startsWith('#')) {
        flush()
        const text = trimmed.replace(/^#+\s*/, '')
        curComment = curComment ? `${curComment} ${text}` : text
      } else {
        flush()
        curCmd = trimmed
      }
    }
    flush()
    return steps
  }
  if (!Array.isArray(raw)) return []
  const out: NormalizedTerminalStep[] = []
  const nextId = makeUniqueIdFactory()
  raw.forEach((item, idx) => {
    if (typeof item === 'string') {
      const clean = item.trim().replace(/^\$\s+/, '')
      if (clean) out.push({ id: nextId(`cmd_${idx}`), cmd: clean, output: '', stderr: '' })
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
        id: nextId(String(rec.id ?? `cmd_${idx}`)),
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
    isParam: /^\{[^}]+\}$/.test(text) || /^:[a-zA-Z_][a-zA-Z0-9_]*$/.test(text),
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
        type: String(rec.value ?? rec.example ?? 'string'),
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

function stripCrlf(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

function normalizeSafeBaseUrl(raw: string | undefined): string {
  const candidate = stripCrlf(raw ?? '')
  if (candidate === '') return 'https://api.example.com'
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      let end = candidate.length
      while (end > 0 && candidate[end - 1] === '/') end -= 1
      return candidate.slice(0, end)
    }
  } catch {}
  return 'https://api.example.com'
}

export function buildEndpointCurl(params: {
  readonly method: string
  readonly path: string
  readonly baseUrl?: string | undefined
  readonly headers?: unknown
  readonly requestBody?: unknown
}): string {
  const origin = normalizeSafeBaseUrl(params.baseUrl)
  const cleanedRawPath = stripCrlf(params.path)
  let targetUrl: string
  if (/^https?:\/\//i.test(cleanedRawPath)) {
    try {
      const parsed = new URL(cleanedRawPath)
      targetUrl =
        parsed.protocol === 'http:' || parsed.protocol === 'https:' ? cleanedRawPath : `${origin}/`
    } catch {
      targetUrl = `${origin}/`
    }
  } else {
    const cleanPath = cleanedRawPath.startsWith('/') ? cleanedRawPath : `/${cleanedRawPath}`
    targetUrl = `${origin}${cleanPath}`
  }
  const rawMethod = typeof params.method === 'string' ? params.method.trim().toUpperCase() : 'GET'
  const safeMethod = /^[A-Z]+$/.test(rawMethod) ? rawMethod : 'GET'
  const parts: string[] = [`curl -X ${safeMethod} ${shellEscapeSingle(targetUrl)}`]

  let hasContentType = false
  if (Array.isArray(params.headers)) {
    for (const item of params.headers) {
      if (typeof item !== 'object' || item === null) continue
      const rec = item as Record<string, unknown>
      const name = stripCrlf(String(rec.name ?? rec.key ?? ''))
      if (!name) continue
      if (name.toLowerCase() === 'content-type') hasContentType = true
      const val = stripCrlf(String(rec.value ?? rec.example ?? ''))
      parts.push(`-H ${shellEscapeSingle(`${name}: ${val}`)}`)
    }
  } else if (typeof params.headers === 'object' && params.headers !== null) {
    for (const [k, v] of Object.entries(params.headers as Record<string, unknown>)) {
      const safeK = stripCrlf(k)
      if (!safeK) continue
      if (safeK.toLowerCase() === 'content-type') hasContentType = true
      parts.push(`-H ${shellEscapeSingle(`${safeK}: ${stripCrlf(String(v ?? ''))}`)}`)
    }
  }
  if (params.requestBody !== undefined && params.requestBody !== null) {
    if (!hasContentType) {
      parts.push(`-H 'Content-Type: application/json'`)
    }
    const bodyStr =
      typeof params.requestBody === 'string'
        ? params.requestBody
        : safeStringifyJson(params.requestBody, 0)
    parts.push(`-d ${shellEscapeSingle(bodyStr)}`)
  }
  return parts.join(' \\\n  ')
}

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
const SCHEDULE_DATE_ONLY_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/

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
    if (h > 23 || m > 59 || sec > 59) return null
    return { numeric: h * 60 + m + sec / 60, kind: 'hhmm' }
  }
  if (/^-?\d+(?:\.\d+)?$/.test(s)) {
    return { numeric: Number.parseFloat(s), kind: 'num' }
  }
  if (SCHEDULE_DATE_ONLY_RE.test(s)) {
    const localDate = parseLocalDateAnchor(s)
    if (!Number.isNaN(localDate.getTime())) {
      return { numeric: localDate.getTime(), kind: 'date' }
    }
  }
  const ts = Date.parse(s)
  if (!Number.isNaN(ts)) {
    return { numeric: ts, kind: 'date' }
  }
  return null
}

function formatTickValue(val: number, kind: 'hhmm' | 'date' | 'num', span = 0): string {
  if (kind === 'hhmm') {
    const mins = ((Math.round(val) % 1440) + 1440) % 1440
    const hh = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm = String(mins % 60).padStart(2, '0')
    return `${hh}:${mm}`
  }
  if (kind === 'date') {
    const d = new Date(val)
    if (span > 0 && span <= 86_400_000) {
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      return `${hh}:${mm}`
    }
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

  const nextId = makeUniqueIdFactory()
  rawItems.forEach((entry, idx) => {
    if (typeof entry !== 'object' || entry === null) return
    const rec = entry as Record<string, unknown>
    const title = String(rec.title ?? rec.label ?? rec.name ?? `Task ${idx + 1}`)
    const pStart = parseTemporalPosition(rec.start)
    const pEnd = parseTemporalPosition(rec.end)
    if (!pStart || !pEnd || pStart.kind !== pEnd.kind) return
    const isOvernightHhmm =
      pStart.kind === 'hhmm' && pEnd.kind === 'hhmm' && pEnd.numeric < pStart.numeric
    const sNum = isOvernightHhmm ? pStart.numeric : Math.min(pStart.numeric, pEnd.numeric)
    const eNum = isOvernightHhmm ? pEnd.numeric + 1440 : Math.max(pStart.numeric, pEnd.numeric)
    const prog =
      typeof rec.progress === 'number' && Number.isFinite(rec.progress)
        ? Math.max(0, Math.min(100, Math.round(rec.progress)))
        : undefined
    parsed.push({
      id: nextId(String(rec.id ?? `sched_${idx}`)),
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
  const sameKindParsed = parsed.filter((p) => p.kind === kind)
  const rangeStart =
    Array.isArray(rawRange) && rawRange.length >= 2 ? parseTemporalPosition(rawRange[0]) : null
  const rangeEnd =
    Array.isArray(rawRange) && rawRange.length >= 2 ? parseTemporalPosition(rawRange[1]) : null
  const validRange =
    rangeStart !== null && rangeEnd !== null && rangeStart.kind === kind && rangeEnd.kind === kind
  const rangeIsOvernightHhmm =
    validRange &&
    rangeStart.kind === 'hhmm' &&
    rangeEnd.kind === 'hhmm' &&
    rangeEnd.numeric < rangeStart.numeric
  const anyItemOvernightHhmm =
    kind === 'hhmm' && sameKindParsed.some((p) => p.kind === 'hhmm' && p.eNum >= 1440)
  let overnightAnchor: number | null = null
  if (kind === 'hhmm') {
    if (rangeIsOvernightHhmm && rangeStart) {
      overnightAnchor = rangeStart.numeric
    } else if (anyItemOvernightHhmm) {
      const eveningStarts = sameKindParsed.filter((p) => p.sNum >= 720).map((p) => p.sNum)
      overnightAnchor =
        eveningStarts.length > 0 ? Math.min(...eveningStarts) : sameKindParsed[0]!.sNum
    }
  }

  const wrapCutoff =
    overnightAnchor !== null
      ? rangeIsOvernightHhmm && rangeEnd
        ? Math.min(overnightAnchor, Math.max(720, rangeEnd.numeric + 1))
        : Math.min(overnightAnchor, 720)
      : null

  if (wrapCutoff !== null) {
    for (const p of sameKindParsed) {
      if (p.kind !== 'hhmm') continue
      if (p.sNum < wrapCutoff) {
        p.sNum += 1440
        if (p.eNum < 1440) p.eNum += 1440
      }
      if (p.eNum < p.sNum) p.eNum += 1440
    }
  }

  let minB = Math.min(...sameKindParsed.map((p) => p.sNum))
  let maxB = Math.max(...sameKindParsed.map((p) => p.eNum))

  if (validRange && rangeStart && rangeEnd) {
    const r0Num = rangeStart.numeric
    const r1Num = rangeIsOvernightHhmm ? rangeEnd.numeric + 1440 : rangeEnd.numeric
    if (r1Num > r0Num) {
      minB = Math.min(minB, r0Num)
      maxB = Math.max(maxB, r1Num)
    }
  }
  const span = maxB > minB ? maxB - minB : 1

  const tracks: NormalizedScheduleTrack[] = sameKindParsed.map((p) => {
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

  const axisTicks = [0, 0.3333, 0.6667, 1].map((t) => formatTickValue(minB + span * t, kind, span))

  let nowPct: number | undefined
  let nowLabel: string | undefined
  if (rawNow !== undefined && rawNow !== null && String(rawNow).trim() !== '') {
    const pNow = parseTemporalPosition(rawNow)
    if (pNow && pNow.kind === kind) {
      let nowNum = pNow.numeric
      if (wrapCutoff !== null && pNow.kind === 'hhmm' && nowNum < wrapCutoff) {
        nowNum += 1440
      }
      if (nowNum >= minB && nowNum <= maxB) {
        nowPct = Number((((nowNum - minB) / span) * 100).toFixed(2))
        nowLabel = String(rawNow).trim()
      }
    }
  }

  return { tracks, axisTicks, nowPct, nowLabel }
}

export interface NormalizedMatrixCell {
  readonly kind: 'number' | 'ok' | 'warn' | 'no' | 'empty' | 'text'
  readonly display: string
  readonly intensityPct: number
  readonly ratio: number
}

export interface NormalizedMatrixModel {
  readonly rowLabels: readonly string[]
  readonly colLabels: readonly string[]
  readonly cells: readonly (readonly NormalizedMatrixCell[])[]
  readonly rowSummaries?: readonly string[] | undefined
}

function formatMatrixCellNumber(v: number): string {
  if (Number.isInteger(v)) return String(v)
  const abs = Math.abs(v)
  if ((abs > 99 && abs < 100) || (abs > 0 && abs < 0.1)) {
    return String(Number(v.toFixed(3)))
  }
  return String(Number(v.toFixed(2)))
}

function parseMatrixNumericCell(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const t = v.trim()
    if (/^[+-]?\d+(?:\.\d+)?$/.test(t)) {
      const n = Number(t)
      return Number.isFinite(n) ? n : null
    }
  }
  return null
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
      const n = parseMatrixNumericCell(rowArr[c])
      if (n !== null) {
        if (n < minNum) minNum = n
        if (n > maxNum) maxNum = n
      }
    }
  }
  const hasRange = Number.isFinite(minNum) && Number.isFinite(maxNum)
  const rawSpan = hasRange && maxNum > minNum ? maxNum - minNum : 1
  const scaledSpan = !Number.isFinite(rawSpan) ? maxNum / 2 - minNum / 2 : 0
  const numSpan = Number.isFinite(rawSpan) && rawSpan > 0 ? rawSpan : 1

  const cells: NormalizedMatrixCell[][] = []
  const rowSummaries: string[] = []

  for (let r = 0; r < rowLabels.length; r++) {
    const rowArr = Array.isArray(rawGrid[r]) ? (rawGrid[r] as unknown[]) : []
    const rowOut: NormalizedMatrixCell[] = []
    const rowNums: number[] = []

    for (let c = 0; c < colLabels.length; c++) {
      const v = rowArr[c]
      if (
        v === undefined ||
        v === null ||
        v === '' ||
        v === '—' ||
        v === '-' ||
        (typeof v === 'number' && !Number.isFinite(v))
      ) {
        rowOut.push({ kind: 'empty', display: '—', intensityPct: 0, ratio: 0 })
        continue
      }
      const parsedNum = parseMatrixNumericCell(v)
      if (parsedNum !== null) {
        rowNums.push(parsedNum)
        const rawRatio =
          maxNum === minNum
            ? 0.65
            : scaledSpan > 0
              ? (parsedNum / 2 - minNum / 2) / scaledSpan
              : (parsedNum - minNum) / numSpan
        const ratio = Number.isFinite(rawRatio) ? Math.max(0, Math.min(1, rawRatio)) : 0.65
        const intensityPct = Math.round(8 + ratio * 34)
        const formatted = formatMatrixCellNumber(parsedNum)
        rowOut.push({
          kind: 'number',
          display: `${formatted}${unit}`,
          intensityPct,
          ratio,
        })
        continue
      }
      if (typeof v === 'boolean') {
        rowOut.push({
          kind: v ? 'ok' : 'no',
          display: v ? '✓' : '—',
          intensityPct: 0,
          ratio: 0,
        })
        continue
      }
      const s = String(v).trim()
      if (/^(?:ok|yes|pass):/i.test(s) || s === '✓' || s === '✔') {
        rowOut.push({
          kind: 'ok',
          display: s.replace(/^(?:ok|yes|pass):\s*/i, '') || '✓',
          intensityPct: 0,
          ratio: 0,
        })
      } else if (/^(?:warn|warning):/i.test(s)) {
        rowOut.push({
          kind: 'warn',
          display: s.replace(/^(?:warn|warning):\s*/i, '') || '!',
          intensityPct: 0,
          ratio: 0,
        })
      } else if (/^(?:no|err|fail):/i.test(s) || s === '✕' || s === '✗') {
        rowOut.push({
          kind: 'no',
          display: s.replace(/^(?:no|err|fail):\s*/i, '') || '✕',
          intensityPct: 0,
          ratio: 0,
        })
      } else {
        rowOut.push({ kind: 'text', display: s, intensityPct: 0, ratio: 0 })
      }
    }
    cells.push(rowOut)
    if (params.showTotals) {
      if (rowNums.length > 0) {
        const avg = rowNums.reduce((a, b) => a + b, 0) / rowNums.length
        const avgStr = formatMatrixCellNumber(avg)
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

export interface ProTableColumnDescriptor {
  readonly key: string
  readonly label: string
}

const PURE_SIGNED_NUMBER_RE = /^[+-]?\d+(?:\.\d+)?$/
const CSV_FORMULA_PREFIX_RE = /^[\s\r\n]*[=+\-@\t\r]/

function formatScalarOrJsonCell(raw: unknown): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'object') return safeStringifyJson(raw, 0)
  return String(raw)
}

function escapeCsvCell(raw: unknown): string {
  const rawStr = formatScalarOrJsonCell(raw)
  const s =
    CSV_FORMULA_PREFIX_RE.test(rawStr) && !PURE_SIGNED_NUMBER_RE.test(rawStr)
      ? `'${rawStr}`
      : rawStr
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function formatTableToCsv(
  columns: readonly ProTableColumnDescriptor[],
  rows: readonly Record<string, unknown>[],
): string {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(',')
  const body = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key])).join(','))
  return `\uFEFF${[header, ...body].join('\r\n')}`
}

export function formatTableToMarkdown(
  columns: readonly ProTableColumnDescriptor[],
  rows: readonly Record<string, unknown>[],
  numericKeys?: ReadonlySet<string>,
): string {
  const escMd = (v: unknown) =>
    formatScalarOrJsonCell(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const head = `| ${columns.map((c) => escMd(c.label)).join(' | ')} |`
  const sep = `| ${columns.map((c) => (numericKeys?.has(c.key) ? '---:' : ':---')).join(' | ')} |`
  const body = rows.map((row) => `| ${columns.map((c) => escMd(row[c.key])).join(' | ')} |`)
  return [head, sep, ...body].join('\n')
}

const NUMERIC_LIKE_RE = /^[+-]?\s*[¥$€£]?\s*[+-]?\s*\d[\d,]*(?:\.\d+)?\s*%?$/

export function parseFormattedNumericCell(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (t === '' || !NUMERIC_LIKE_RE.test(t)) return null
  const cleaned = t.replace(/[¥$€£,\s%]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function compareFormattedNumericCells(a: unknown, b: unknown): number {
  const numA = parseFormattedNumericCell(a)
  const numB = parseFormattedNumericCell(b)
  if (numA !== null && numB !== null) {
    return numA === numB ? 0 : numA > numB ? 1 : -1
  }
  if (numA !== null) return -1
  if (numB !== null) return 1
  const sa = a === null || a === undefined ? '' : String(a)
  const sb = b === null || b === undefined ? '' : String(b)
  return sa.localeCompare(sb)
}

export function detectNumericColumnKeys(
  columns: readonly { key: string; align?: 'left' | 'center' | 'right'; format?: string }[],
  rows: readonly Record<string, unknown>[],
): ReadonlySet<string> {
  const set = new Set<string>()
  if (rows.length === 0) return set
  for (const col of columns) {
    if (col.format === 'code' || col.format === 'badge' || col.format === 'sparkline') continue
    let nonEmpty = 0
    let numericHits = 0
    for (const r of rows) {
      const v = r[col.key]
      if (v === undefined || v === null) continue
      if (typeof v === 'string') {
        const t = v.trim()
        if (t === '' || t === '—' || t === '-') continue
      }
      nonEmpty += 1
      if (parseFormattedNumericCell(v) !== null) {
        numericHits += 1
      }
      if (nonEmpty >= 30) break
    }
    if (nonEmpty > 0 && numericHits === nonEmpty) {
      set.add(col.key)
    } else if (nonEmpty === 0 && col.align === 'right') {
      set.add(col.key)
    }
  }
  return set
}

export function computeTableNumericSummary(
  columns: readonly { key: string; format?: string; max?: number }[],
  rows: readonly Record<string, unknown>[],
  numericKeys: ReadonlySet<string>,
  formatAvg: (pctStr: string) => string = (pctStr) => `Avg ${pctStr}`,
): Readonly<Record<string, string>> {
  const summary: Record<string, string> = {}
  for (const col of columns) {
    if (!numericKeys.has(col.key)) continue
    let sum = 0
    let count = 0
    let nonNumericCount = 0
    let allPercent = true
    let prefix = ''
    for (const r of rows) {
      const v = r[col.key]
      if (v === undefined || v === null) continue
      if (typeof v === 'string') {
        const t = v.trim()
        if (t === '' || t === '—' || t === '-') continue
        const n = parseFormattedNumericCell(t)
        if (n === null) {
          nonNumericCount += 1
          continue
        }
        if (!t.endsWith('%')) allPercent = false
        if (!prefix) {
          const curMatch = /[¥$€£]/.exec(t)
          if (curMatch) prefix = curMatch[0]!
        }
        sum += n
        count += 1
      } else if (typeof v === 'number' && Number.isFinite(v)) {
        sum += v
        count += 1
        allPercent = false
      } else {
        nonNumericCount += 1
      }
    }
    if (count > 0 && nonNumericCount === 0) {
      if (allPercent) {
        const avg = sum / count
        const absAvg = Math.abs(avg)
        const pctDigits = absAvg > 0 && absAvg < 0.1 ? 2 : 1
        summary[col.key] = formatAvg(`${avg.toFixed(pctDigits)}%`)
      } else if (col.format === 'bar' && col.max === 100) {
        const avg = sum / count
        const formatted = Number.isInteger(avg) ? String(avg) : avg.toFixed(1)
        summary[col.key] = formatAvg(formatted)
      } else {
        const sign = sum < 0 ? '-' : ''
        const absVal = Math.abs(sum)
        const formatted = Number.isInteger(absVal)
          ? absVal.toLocaleString('en-US')
          : absVal.toLocaleString('en-US', { maximumFractionDigits: 2 })
        summary[col.key] = `${sign}${prefix}${formatted}`
      }
    }
  }
  return summary
}

export function normalizeCrossFilterTokens(raw: unknown): readonly string[] {
  if (Array.isArray(raw)) {
    const out: string[] = []
    const seen = new Set<string>()
    for (const item of raw) {
      if (item === null || item === undefined) continue
      const s = String(item).trim()
      if (s === '') continue
      const key = s.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        out.push(s)
      }
    }
    return out
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    return s === '' ? [] : [s]
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return [String(raw)]
  }
  if (typeof raw === 'boolean') {
    return [String(raw)]
  }
  return []
}

export function computeNextCrossFilterSelection(
  currentSelected: string | undefined,
  clickedLabel: string | undefined,
): string {
  const next = (clickedLabel ?? '').trim()
  if (next === '') return ''
  const cur = (currentSelected ?? '').trim()
  return cur !== '' && cur.toLowerCase() === next.toLowerCase() ? '' : next
}

export function computeNextCrossFilterValue(
  currentSelected: string | readonly string[] | undefined,
  clickedLabel: string | undefined,
): string | string[] {
  const next = (clickedLabel ?? '').trim()
  if (Array.isArray(currentSelected)) {
    const tokens = [...normalizeCrossFilterTokens(currentSelected)]
    if (next === '') return []
    const targetLower = next.toLowerCase()
    const idx = tokens.findIndex((t) => t.toLowerCase() === targetLower)
    if (idx >= 0) {
      tokens.splice(idx, 1)
      return tokens
    }
    return [...tokens, next]
  }
  return computeNextCrossFilterSelection(
    typeof currentSelected === 'string' ? currentSelected : undefined,
    clickedLabel,
  )
}

function matchesPrefixBoundary(haystack: string, needle: string): boolean {
  if (needle.length < 2) return false
  if (!haystack.startsWith(needle)) return false
  if (haystack.length === needle.length) return true
  const nextCh = haystack[needle.length]!
  return /[\s([（·•:：/|,，]/.test(nextCh)
}

function normalizeFilterToken(input: string): string {
  return input
    .replace(/\s*→\s*/g, ' -> ')
    .replace(/\s*->\s*/g, ' -> ')
    .trim()
    .toLowerCase()
}

function matchesTokenBoundary(haystack: string, needle: string): boolean {
  let idx = haystack.indexOf(needle)
  const wordChar = /[a-z0-9_]/
  while (idx >= 0) {
    const before = idx > 0 ? haystack[idx - 1]! : ''
    const after = idx + needle.length < haystack.length ? haystack[idx + needle.length]! : ''
    const leftOk = before === '' || !wordChar.test(before) || !wordChar.test(needle[0]!)
    const rightOk =
      after === '' || !wordChar.test(after) || !wordChar.test(needle[needle.length - 1]!)
    if (leftOk && rightOk) return true
    idx = haystack.indexOf(needle, idx + 1)
  }
  return false
}

export function filterTableRowsByField(
  rows: readonly Record<string, unknown>[],
  filterField: string | undefined,
  filterValue: string | readonly string[] | undefined,
  exactOnly = false,
): readonly Record<string, unknown>[] {
  const rawTokens = normalizeCrossFilterTokens(filterValue)
  if (rawTokens.length === 0) return rows
  const queries = rawTokens.map(normalizeFilterToken).filter((q) => q !== '')
  if (queries.length === 0) return rows
  const field = filterField?.trim()

  const cellText = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    if (typeof v === 'object') return normalizeFilterToken(safeStringifyJson(v, 0))
    return normalizeFilterToken(String(v))
  }

  const matchedIndices = new Set<number>()
  for (const q of queries) {
    let exactHits = 0
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      const hit = field
        ? cellText(row[field]) === q
        : Object.values(row).some((val) => cellText(val) === q)
      if (hit) {
        matchedIndices.add(i)
        exactHits += 1
      }
    }
    if (exactHits > 0 || exactOnly) continue

    const fuzzyMatch = (t: string): boolean => {
      if (t === '') return false
      if (matchesPrefixBoundary(t, q) || matchesPrefixBoundary(q, t)) return true
      if (
        ((field && q.length >= 2) || (q.length >= 3 && /[\u4e00-\u9fa5]/.test(q))) &&
        matchesTokenBoundary(t, q)
      ) {
        return true
      }
      return false
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      const hit = field
        ? fuzzyMatch(cellText(row[field]))
        : Object.values(row).some((val) => fuzzyMatch(cellText(val)))
      if (hit) matchedIndices.add(i)
    }
  }

  return rows.filter((_, idx) => matchedIndices.has(idx))
}

function flattenTreeForCsv(
  node: Record<string, unknown>,
  prefix: string,
  out: Record<string, unknown>[],
  depth = 0,
): void {
  if (depth > 16 || out.length >= 1000) return
  const name = String(node.name ?? node.label ?? '').trim()
  const path = prefix && name ? `${prefix} / ${name}` : name || prefix
  const children = Array.isArray(node.children) ? node.children : []
  if (children.length === 0) {
    out.push({
      path,
      name: name || path,
      value: node.value ?? '',
    })
    return
  }
  for (const child of children) {
    if (typeof child === 'object' && child !== null && !Array.isArray(child)) {
      flattenTreeForCsv(child as Record<string, unknown>, path, out, depth + 1)
    }
  }
}

export function formatChartDataToCsv(data: unknown): string | null {
  let rows: Record<string, unknown>[] = []
  if (Array.isArray(data)) {
    const objects = data.filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item),
    )
    if (objects.some((item) => Array.isArray(item.children) && item.children.length > 0)) {
      for (const node of objects) {
        flattenTreeForCsv(node, '', rows)
      }
    } else {
      rows = objects
    }
    if (rows.length === 0) {
      const nums = data.filter(
        (item): item is number => typeof item === 'number' && Number.isFinite(item),
      )
      if (nums.length > 0) {
        rows = nums.map((value, idx) => ({ index: idx + 1, value }))
      }
    }
  } else if (typeof data === 'object' && data !== null) {
    const rec = data as Record<string, unknown>
    const rawLinks = Array.isArray(rec.links)
      ? rec.links
      : Array.isArray(rec.edges)
        ? rec.edges
        : null
    const rawNodes = Array.isArray(rec.nodes) ? rec.nodes : null
    const source = rawLinks && rawLinks.length > 0 ? rawLinks : rawNodes
    if (source) {
      rows = source.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      )
    } else if (Array.isArray(rec.children) && rec.children.length > 0) {
      flattenTreeForCsv(rec, '', rows)
    } else if (Object.keys(rec).length > 0) {
      rows = [rec]
    }
  }
  if (rows.length === 0) return null

  const keys: string[] = []
  const seen = new Set<string>()
  for (const row of rows.slice(0, 500)) {
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
