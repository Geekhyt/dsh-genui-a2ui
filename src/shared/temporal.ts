const EXPLICIT_TZ_RE = /(?:Z|[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*[+-]\d{2}(?::?\d{2})?)$/i
const SHORT_TZ_SUFFIX_RE = /([+-]\d{2})$/
const NAIVE_DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const NAIVE_DATETIME_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/
const NAIVE_TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/

function normalizeExplicitTzString(trimmed: string): string {
  return SHORT_TZ_SUFFIX_RE.test(trimmed) ? `${trimmed}:00` : trimmed
}

function isValidLocalCalendarDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const probe = new Date(y, m - 1, d)
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d
}

export function formatLocalDateValue(d: Date, enableTime: boolean): string {
  const yyyy = String(d.getFullYear()).padStart(4, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  if (!enableTime) return `${yyyy}-${mm}-${dd}`
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

export function formatNativeTemporalValue(
  raw: unknown,
  mode: 'date' | 'time' | 'datetime-local',
  edge: 'start' | 'end' = 'start',
): string {
  if (typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (trimmed === '') return ''

  if (EXPLICIT_TZ_RE.test(trimmed)) {
    const parsed = new Date(normalizeExplicitTzString(trimmed))
    if (!Number.isNaN(parsed.getTime())) {
      if (mode === 'date') return formatLocalDateValue(parsed, false)
      if (mode === 'datetime-local') return formatLocalDateValue(parsed, true)
      const hh = String(parsed.getHours()).padStart(2, '0')
      const mi = String(parsed.getMinutes()).padStart(2, '0')
      return `${hh}:${mi}`
    }
    return ''
  }

  if (mode === 'date') {
    const dm = NAIVE_DATE_RE.exec(trimmed)
    if (dm) {
      const y = Number(dm[1])
      const m = Number(dm[2])
      const d = Number(dm[3])
      if (!isValidLocalCalendarDate(y, m, d)) return ''
      return `${dm[1]!}-${dm[2]!.padStart(2, '0')}-${dm[3]!.padStart(2, '0')}`
    }
    const dtm = NAIVE_DATETIME_RE.exec(trimmed)
    if (dtm) {
      const y = Number(dtm[1])
      const m = Number(dtm[2])
      const d = Number(dtm[3])
      if (!isValidLocalCalendarDate(y, m, d)) return ''
      return `${dtm[1]!}-${dtm[2]!.padStart(2, '0')}-${dtm[3]!.padStart(2, '0')}`
    }
    return ''
  }

  if (mode === 'datetime-local') {
    const dtm = NAIVE_DATETIME_RE.exec(trimmed)
    if (dtm) {
      const y = Number(dtm[1])
      const m = Number(dtm[2])
      const d = Number(dtm[3])
      if (!isValidLocalCalendarDate(y, m, d)) return ''
      return `${dtm[1]!}-${dtm[2]!.padStart(2, '0')}-${dtm[3]!.padStart(2, '0')}T${dtm[4]!.padStart(2, '0')}:${dtm[5]!}`
    }
    const dm = NAIVE_DATE_RE.exec(trimmed)
    if (dm) {
      const y = Number(dm[1])
      const m = Number(dm[2])
      const d = Number(dm[3])
      if (!isValidLocalCalendarDate(y, m, d)) return ''
      const suffix = edge === 'end' ? 'T23:59' : 'T00:00'
      return `${dm[1]!}-${dm[2]!.padStart(2, '0')}-${dm[3]!.padStart(2, '0')}${suffix}`
    }
    return ''
  }

  const tm = NAIVE_TIME_RE.exec(trimmed)
  if (tm) {
    const hh = Number(tm[1])
    const mi = Number(tm[2])
    if (hh < 0 || hh > 23 || mi < 0 || mi > 59) return ''
    return `${tm[1]!.padStart(2, '0')}:${tm[2]!}`
  }
  const dtm = NAIVE_DATETIME_RE.exec(trimmed)
  if (dtm) {
    const hh = Number(dtm[4])
    const mi = Number(dtm[5])
    if (hh < 0 || hh > 23 || mi < 0 || mi > 59) return ''
    return `${dtm[4]!.padStart(2, '0')}:${dtm[5]!}`
  }
  return ''
}

export function parseLocalDateAnchor(anchorStr?: string): Date {
  if (!anchorStr) return new Date()
  const trimmed = anchorStr.trim()
  if (trimmed === '') return new Date()
  if (EXPLICIT_TZ_RE.test(trimmed)) {
    const ts = Date.parse(normalizeExplicitTzString(trimmed))
    return Number.isNaN(ts) ? new Date() : new Date(ts)
  }
  const dateOnly = NAIVE_DATE_RE.exec(trimmed)
  if (dateOnly) {
    const y = Number(dateOnly[1])
    const m = Number(dateOnly[2])
    const d = Number(dateOnly[3])
    return isValidLocalCalendarDate(y, m, d) ? new Date(y, m - 1, d) : new Date()
  }
  const dateTimeLocal = NAIVE_DATETIME_RE.exec(trimmed)
  if (dateTimeLocal) {
    const y = Number(dateTimeLocal[1])
    const m = Number(dateTimeLocal[2])
    const d = Number(dateTimeLocal[3])
    if (!isValidLocalCalendarDate(y, m, d)) return new Date()
    return new Date(
      y,
      m - 1,
      d,
      Number(dateTimeLocal[4]),
      Number(dateTimeLocal[5]),
      Number(dateTimeLocal[6] ?? 0),
    )
  }
  const parsed = Date.parse(trimmed)
  return Number.isNaN(parsed) ? new Date() : new Date(parsed)
}
