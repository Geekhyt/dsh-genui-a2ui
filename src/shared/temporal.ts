const EXPLICIT_TZ_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i
const NAIVE_DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const NAIVE_DATETIME_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/
const NAIVE_TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/

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
): string {
  if (typeof raw !== 'string') return ''
  const trimmed = raw.trim()
  if (trimmed === '') return ''

  if (EXPLICIT_TZ_RE.test(trimmed)) {
    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      if (mode === 'date') return formatLocalDateValue(parsed, false)
      if (mode === 'datetime-local') return formatLocalDateValue(parsed, true)
      const hh = String(parsed.getHours()).padStart(2, '0')
      const mi = String(parsed.getMinutes()).padStart(2, '0')
      return `${hh}:${mi}`
    }
  }

  if (mode === 'date') {
    const dm = NAIVE_DATE_RE.exec(trimmed)
    if (dm) {
      return `${dm[1]!}-${dm[2]!.padStart(2, '0')}-${dm[3]!.padStart(2, '0')}`
    }
    const dtm = NAIVE_DATETIME_RE.exec(trimmed)
    if (dtm) {
      return `${dtm[1]!}-${dtm[2]!.padStart(2, '0')}-${dtm[3]!.padStart(2, '0')}`
    }
    return trimmed.slice(0, 10)
  }

  if (mode === 'datetime-local') {
    const dtm = NAIVE_DATETIME_RE.exec(trimmed)
    if (dtm) {
      return `${dtm[1]!}-${dtm[2]!.padStart(2, '0')}-${dtm[3]!.padStart(2, '0')}T${dtm[4]!.padStart(2, '0')}:${dtm[5]!}`
    }
    const dm = NAIVE_DATE_RE.exec(trimmed)
    if (dm) {
      return `${dm[1]!}-${dm[2]!.padStart(2, '0')}-${dm[3]!.padStart(2, '0')}T00:00`
    }
    return trimmed.replace(/Z$/i, '').slice(0, 16)
  }

  const tm = NAIVE_TIME_RE.exec(trimmed)
  if (tm) {
    return `${tm[1]!.padStart(2, '0')}:${tm[2]!}`
  }
  const dtm = NAIVE_DATETIME_RE.exec(trimmed)
  if (dtm) {
    return `${dtm[4]!.padStart(2, '0')}:${dtm[5]!}`
  }
  return trimmed.slice(0, 5)
}

export function parseLocalDateAnchor(anchorStr?: string): Date {
  if (!anchorStr) return new Date()
  const trimmed = anchorStr.trim()
  if (trimmed === '') return new Date()
  if (EXPLICIT_TZ_RE.test(trimmed)) {
    const ts = Date.parse(trimmed)
    return Number.isNaN(ts) ? new Date() : new Date(ts)
  }
  const dateOnly = NAIVE_DATE_RE.exec(trimmed)
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  }
  const dateTimeLocal = NAIVE_DATETIME_RE.exec(trimmed)
  if (dateTimeLocal) {
    return new Date(
      Number(dateTimeLocal[1]),
      Number(dateTimeLocal[2]) - 1,
      Number(dateTimeLocal[3]),
      Number(dateTimeLocal[4]),
      Number(dateTimeLocal[5]),
      Number(dateTimeLocal[6] ?? 0),
    )
  }
  const parsed = Date.parse(trimmed)
  return Number.isNaN(parsed) ? new Date() : new Date(parsed)
}
