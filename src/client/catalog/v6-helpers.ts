import { isSecretKey, safeStringifyJson } from '../../shared/constants.ts'
import { makeUniqueIdFactory } from './v3-helpers.ts'

export interface ClampedRangeState {
  readonly min: number
  readonly max: number
  readonly step: number
  readonly start: number
  readonly end: number
  readonly startPct: number
  readonly endPct: number
}

function parseOptionalFiniteNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function clampRangeSliderBounds(params: {
  readonly min: unknown
  readonly max: unknown
  readonly start: unknown
  readonly end: unknown
  readonly step?: unknown
}): ClampedRangeState {
  const min = typeof params.min === 'number' && Number.isFinite(params.min) ? params.min : 0
  const rawMax = typeof params.max === 'number' && Number.isFinite(params.max) ? params.max : 100
  const max = rawMax > min ? rawMax : min + 1
  const step =
    typeof params.step === 'number' && Number.isFinite(params.step) && params.step > 0
      ? params.step
      : 1
  const rawStart = parseOptionalFiniteNumber(params.start)
  const rawEnd = parseOptionalFiniteNumber(params.end)
  const clampedStart = rawStart !== null ? Math.min(max, Math.max(min, rawStart)) : min
  const clampedEnd = rawEnd !== null ? Math.min(max, Math.max(min, rawEnd)) : max
  const start = Math.min(clampedStart, clampedEnd)
  const end = Math.max(clampedStart, clampedEnd)
  const span = max - min
  return {
    min,
    max,
    step,
    start,
    end,
    startPct: ((start - min) / span) * 100,
    endPct: ((end - min) / span) * 100,
  }
}

export type SemanticWidgetTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const VALID_SEMANTIC_TONES = new Set<string>(['neutral', 'info', 'success', 'warning', 'danger'])

function normalizeSemanticTone(
  raw: unknown,
  fallback: SemanticWidgetTone = 'neutral',
): SemanticWidgetTone {
  if (typeof raw !== 'string') return fallback
  const lower = raw.trim().toLowerCase()
  return VALID_SEMANTIC_TONES.has(lower) ? (lower as SemanticWidgetTone) : fallback
}

export interface NormalizedChecklistItem {
  readonly id: string
  readonly label: string
  readonly description?: string | undefined
  readonly required: boolean
  readonly tag?: string | undefined
  readonly tone: SemanticWidgetTone
  readonly defaultChecked: boolean
}

export function normalizeChecklistItems(raw: unknown): readonly NormalizedChecklistItem[] {
  if (!Array.isArray(raw)) return []
  const out: NormalizedChecklistItem[] = []
  const nextId = makeUniqueIdFactory()
  raw.forEach((entry, idx) => {
    if (typeof entry === 'string') {
      const label = entry.trim()
      if (!label) return
      const id = nextId(`chk_${idx}`)
      out.push({
        id,
        label,
        required: false,
        tone: 'neutral',
        defaultChecked: false,
      })
      return
    }
    if (typeof entry !== 'object' || entry === null) return
    const rec = entry as Record<string, unknown>
    const label = String(rec.label ?? rec.title ?? rec.text ?? '').trim()
    if (!label) return
    const rawId = String(rec.id ?? rec.key ?? `chk_${idx}`).trim() || `chk_${idx}`
    const id = nextId(rawId)
    const desc =
      rec.description !== undefined &&
      rec.description !== null &&
      String(rec.description).trim() !== ''
        ? String(rec.description).trim()
        : undefined
    const tag =
      rec.tag !== undefined && rec.tag !== null && String(rec.tag).trim() !== ''
        ? String(rec.tag).trim()
        : undefined
    out.push({
      id,
      label,
      description: desc,
      required: Boolean(rec.required),
      tag,
      tone: normalizeSemanticTone(rec.tone, 'neutral'),
      defaultChecked: Boolean(rec.checked),
    })
  })
  return out
}

export interface ChecklistSummary {
  readonly total: number
  readonly done: number
  readonly requiredTotal: number
  readonly requiredMissing: number
  readonly pct: number
}

export function computeChecklistSummary(
  items: readonly NormalizedChecklistItem[],
  checkedIds: ReadonlySet<string>,
): ChecklistSummary {
  let done = 0
  let requiredTotal = 0
  let requiredMissing = 0
  for (const it of items) {
    const isChecked = checkedIds.has(it.id)
    if (isChecked) done += 1
    if (it.required) {
      requiredTotal += 1
      if (!isChecked) requiredMissing += 1
    }
  }
  const total = items.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return { total, done, requiredTotal, requiredMissing, pct }
}

export interface NormalizedSortableItem {
  readonly id: string
  readonly title: string
  readonly subtitle?: string | undefined
  readonly badge?: string | undefined
  readonly tone: SemanticWidgetTone
  readonly raw: unknown
}

export function normalizeSortableItems(raw: unknown): readonly NormalizedSortableItem[] {
  if (!Array.isArray(raw)) return []
  const out: NormalizedSortableItem[] = []
  const occurrences = new Map<string, number>()
  const nextStableId = (base: string): string => {
    const count = (occurrences.get(base) ?? 0) + 1
    occurrences.set(base, count)
    return count === 1 ? base : `${base}__${count}`
  }
  raw.forEach((entry, idx) => {
    if (typeof entry === 'string' || typeof entry === 'number') {
      const title = String(entry).trim()
      if (!title) return
      const id = nextStableId(`sort_${title}`)
      out.push({ id, title, tone: 'neutral', raw: entry })
      return
    }
    if (typeof entry !== 'object' || entry === null) return
    const rec = entry as Record<string, unknown>
    const title = String(rec.title ?? rec.label ?? rec.name ?? `#${idx + 1}`).trim()
    const explicitId =
      rec.id !== undefined && rec.id !== null && String(rec.id).trim() !== ''
        ? String(rec.id).trim()
        : rec.key !== undefined && rec.key !== null && String(rec.key).trim() !== ''
          ? String(rec.key).trim()
          : `sort_${title}`
    const id = nextStableId(explicitId)
    const subtitle =
      rec.subtitle !== undefined && rec.subtitle !== null && String(rec.subtitle).trim() !== ''
        ? String(rec.subtitle).trim()
        : rec.description !== undefined &&
            rec.description !== null &&
            String(rec.description).trim() !== ''
          ? String(rec.description).trim()
          : undefined
    const badge =
      rec.badge !== undefined && rec.badge !== null && String(rec.badge).trim() !== ''
        ? String(rec.badge).trim()
        : undefined
    out.push({
      id,
      title,
      subtitle,
      badge,
      tone: normalizeSemanticTone(rec.tone, 'neutral'),
      raw: entry,
    })
  })
  return out
}

export function reorderListItems<T>(list: readonly T[], fromIdx: number, toIdx: number): T[] {
  if (
    fromIdx < 0 ||
    toIdx < 0 ||
    fromIdx >= list.length ||
    toIdx >= list.length ||
    fromIdx === toIdx
  ) {
    return [...list]
  }
  const next = [...list]
  const [moved] = next.splice(fromIdx, 1)
  if (moved !== undefined) {
    next.splice(toIdx, 0, moved)
  }
  return next
}

export interface NormalizedKvEditorRow {
  readonly key: string
  readonly value: string
  readonly sensitive: boolean
}

export function normalizeKvEditorRows(raw: unknown): readonly NormalizedKvEditorRow[] {
  if (Array.isArray(raw)) {
    const out: NormalizedKvEditorRow[] = []
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
      const rec = entry as Record<string, unknown>
      const key = String(rec.key ?? rec.name ?? '')
      const rawVal = rec.value ?? ''
      const value =
        typeof rawVal === 'object' && rawVal !== null
          ? safeStringifyJson(rawVal, 0)
          : String(rawVal)
      out.push({ key, value, sensitive: isSecretKey(key) })
    }
    return out
  }
  if (typeof raw === 'object' && raw !== null) {
    return Object.entries(raw as Record<string, unknown>).map(([k, v]) => ({
      key: k,
      value: typeof v === 'object' && v !== null ? safeStringifyJson(v, 0) : String(v ?? ''),
      sensitive: isSecretKey(k),
    }))
  }
  return []
}

export function isKvKeySensitive(key: string): boolean {
  return isSecretKey(key)
}

export function clampRatingScore(rawValue: unknown, rawMax: unknown, allowHalf: boolean): number {
  const max =
    typeof rawMax === 'number' && Number.isFinite(rawMax)
      ? Math.max(3, Math.min(10, Math.trunc(rawMax)))
      : 5
  const n = parseOptionalFiniteNumber(rawValue)
  if (n === null || n <= 0) return 0
  const clamped = Math.min(max, Math.max(0, n))
  return allowHalf ? Math.round(clamped * 2) / 2 : Math.round(clamped)
}

export function normalizeRatingLabels(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => (item === null || item === undefined ? '' : String(item).trim()))
}

export function clampImageComparePosition(raw: unknown): number {
  const n = parseOptionalFiniteNumber(raw)
  if (n === null) return 50
  return Math.max(0, Math.min(100, Math.round(n)))
}

export interface NormalizedTextAnnotation {
  readonly start: number
  readonly end: number
  readonly text: string
  readonly label: string
  readonly note?: string | undefined
  readonly tone: SemanticWidgetTone
  readonly sourceId?: string | undefined
}

export type AnnotatedTextSegment =
  | { readonly kind: 'plain'; readonly text: string }
  | { readonly kind: 'mark'; readonly annotation: NormalizedTextAnnotation }

export interface AnnotationLegendEntry {
  readonly label: string
  readonly tone: SemanticWidgetTone
  readonly count: number
}

export function buildAnnotatedTextSegments(
  sourceText: string,
  rawAnnotations: unknown,
): {
  readonly segments: readonly AnnotatedTextSegment[]
  readonly legend: readonly AnnotationLegendEntry[]
} {
  if (sourceText === '') {
    return { segments: [], legend: [] }
  }
  if (!Array.isArray(rawAnnotations) || rawAnnotations.length === 0) {
    return { segments: [{ kind: 'plain', text: sourceText }], legend: [] }
  }

  const candidates: NormalizedTextAnnotation[] = []
  let searchCursor = 0
  for (const item of rawAnnotations) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    let start = -1
    let end = -1
    const rawStart = parseOptionalFiniteNumber(rec.start)
    const rawEnd = parseOptionalFiniteNumber(rec.end)
    if (
      rawStart !== null &&
      rawEnd !== null &&
      rawStart >= 0 &&
      rawEnd > rawStart &&
      rawStart < sourceText.length
    ) {
      start = Math.trunc(rawStart)
      end = Math.min(sourceText.length, Math.trunc(rawEnd))
    } else if (typeof rec.match === 'string' && rec.match !== '') {
      let foundIdx = sourceText.indexOf(rec.match, searchCursor)
      if (foundIdx < 0) foundIdx = sourceText.indexOf(rec.match)
      if (foundIdx >= 0) {
        start = foundIdx
        end = foundIdx + rec.match.length
        searchCursor = end
      }
    }
    if (start < 0 || end <= start) continue
    const label = String(rec.label ?? rec.tag ?? rec.category ?? '').trim()
    const note =
      rec.note !== undefined && rec.note !== null && String(rec.note).trim() !== ''
        ? String(rec.note).trim()
        : rec.reason !== undefined && rec.reason !== null && String(rec.reason).trim() !== ''
          ? String(rec.reason).trim()
          : undefined
    const sourceId =
      rec.sourceId !== undefined && rec.sourceId !== null && String(rec.sourceId).trim() !== ''
        ? String(rec.sourceId).trim()
        : undefined
    candidates.push({
      start,
      end,
      text: sourceText.slice(start, end),
      label,
      note,
      tone: normalizeSemanticTone(rec.tone, 'info'),
      sourceId,
    })
  }

  candidates.sort((a, b) => a.start - b.start || b.end - a.end)

  const segments: AnnotatedTextSegment[] = []
  const legendMap = new Map<string, { label: string; tone: SemanticWidgetTone; count: number }>()
  let cursor = 0
  for (const ann of candidates) {
    if (ann.start < cursor) continue
    if (ann.start > cursor) {
      segments.push({ kind: 'plain', text: sourceText.slice(cursor, ann.start) })
    }
    segments.push({ kind: 'mark', annotation: ann })
    if (ann.label) {
      const key = `${ann.tone}\0${ann.label}`
      const prev = legendMap.get(key)
      if (prev) {
        prev.count += 1
      } else {
        legendMap.set(key, { label: ann.label, tone: ann.tone, count: 1 })
      }
    }
    cursor = ann.end
  }
  if (cursor < sourceText.length) {
    segments.push({ kind: 'plain', text: sourceText.slice(cursor) })
  }

  return { segments, legend: [...legendMap.values()] }
}
