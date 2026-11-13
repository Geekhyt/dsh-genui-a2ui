/**
 * Pure, zero-DOM normalization & LCS line-diff helpers for P0 components
 * (`DiffView`, `Steps`, `KeyValue`).
 */
import type { TagTone } from '../ui/primitives.tsx'

export interface DiffLineOp {
  readonly kind: 'same' | 'remove' | 'add'
  readonly text: string
  readonly oldLine?: number
  readonly newLine?: number
}

export interface DiffSummary {
  readonly ops: readonly DiffLineOp[]
  readonly added: number
  readonly removed: number
}

export interface SplitDiffRow {
  readonly left?: DiffLineOp
  readonly right?: DiffLineOp
}

function splitLines(raw: string): string[] {
  if (raw === '') return []
  return raw.split(/\r?\n/)
}

/** Deterministic LCS line diff with O(N) prefix/suffix trimming and matrix size guard. */
export function computeLineDiff(beforeText: string, afterText: string): DiffSummary {
  const a = splitLines(beforeText)
  const b = splitLines(afterText)

  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++
  }

  let endA = a.length - 1
  let endB = b.length - 1
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--
    endB--
  }

  const ops: DiffLineOp[] = []
  let added = 0
  let removed = 0

  for (let i = 0; i < start; i++) {
    ops.push({ kind: 'same', text: a[i]!, oldLine: i + 1, newLine: i + 1 })
  }

  const midA = a.slice(start, endA + 1)
  const midB = b.slice(start, endB + 1)
  const n = midA.length
  const m = midB.length

  if (n === 0 && m === 0) {
    // Only common lines
  } else if (n * m > 160_000) {
    for (let i = 0; i < n; i++) {
      removed++
      ops.push({ kind: 'remove', text: midA[i]!, oldLine: start + i + 1 })
    }
    for (let j = 0; j < m; j++) {
      added++
      ops.push({ kind: 'add', text: midB[j]!, newLine: start + j + 1 })
    }
  } else {
    const cols = m + 1
    const dp = new Uint16Array((n + 1) * cols)
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * cols + j] =
          midA[i] === midB[j]
            ? (dp[(i + 1) * cols + (j + 1)] ?? 0) + 1
            : Math.max(dp[(i + 1) * cols + j] ?? 0, dp[i * cols + (j + 1)] ?? 0)
      }
    }

    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        ops.push({
          kind: 'same',
          text: midA[i]!,
          oldLine: start + i + 1,
          newLine: start + j + 1,
        })
        i++
        j++
      } else if ((dp[(i + 1) * cols + j] ?? 0) >= (dp[i * cols + (j + 1)] ?? 0)) {
        removed++
        ops.push({ kind: 'remove', text: midA[i]!, oldLine: start + i + 1 })
        i++
      } else {
        added++
        ops.push({ kind: 'add', text: midB[j]!, newLine: start + j + 1 })
        j++
      }
    }
    while (i < n) {
      removed++
      ops.push({ kind: 'remove', text: midA[i]!, oldLine: start + i + 1 })
      i++
    }
    while (j < m) {
      added++
      ops.push({ kind: 'add', text: midB[j]!, newLine: start + j + 1 })
      j++
    }
  }

  const suffixCount = a.length - 1 - endA
  for (let k = 0; k < suffixCount; k++) {
    const oldIdx = endA + 1 + k
    const newIdx = endB + 1 + k
    ops.push({ kind: 'same', text: a[oldIdx]!, oldLine: oldIdx + 1, newLine: newIdx + 1 })
  }

  return { ops, added, removed }
}

/** Pair consecutive remove/add hunks for side-by-side (`split`) rendering. */
export function pairSplitDiffRows(ops: readonly DiffLineOp[]): SplitDiffRow[] {
  const rows: SplitDiffRow[] = []
  let idx = 0
  while (idx < ops.length) {
    const cur = ops[idx]!
    if (cur.kind === 'same') {
      rows.push({ left: cur, right: cur })
      idx++
      continue
    }
    const removes: DiffLineOp[] = []
    const adds: DiffLineOp[] = []
    while (idx < ops.length && ops[idx]!.kind !== 'same') {
      const item = ops[idx]!
      if (item.kind === 'remove') removes.push(item)
      else adds.push(item)
      idx++
    }
    const maxLen = Math.max(removes.length, adds.length)
    for (let k = 0; k < maxLen; k++) {
      rows.push({ left: removes[k], right: adds[k] })
    }
  }
  return rows
}

export type StepStatus = 'done' | 'active' | 'pending' | 'error'

export interface NormalizedStep {
  readonly title: string
  readonly description?: string
  readonly meta?: string
  readonly status: StepStatus
}

export function normalizeStepItems(rawItems: unknown, currentRaw: unknown): NormalizedStep[] {
  if (!Array.isArray(rawItems)) return []
  const currentIdx =
    typeof currentRaw === 'number' && Number.isFinite(currentRaw) ? Math.trunc(currentRaw) : undefined

  return rawItems.map((entry, idx) => {
    if (typeof entry === 'string' || typeof entry === 'number') {
      const derived: StepStatus =
        currentIdx === undefined
          ? idx === 0
            ? 'active'
            : 'pending'
          : idx < currentIdx
            ? 'done'
            : idx === currentIdx
              ? 'active'
              : 'pending'
      return { title: String(entry), status: derived }
    }
    const obj = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>
    const title = String(obj.title ?? obj.label ?? obj.name ?? `步骤 ${idx + 1}`)
    const description =
      obj.description !== undefined && obj.description !== null && String(obj.description).trim() !== ''
        ? String(obj.description)
        : obj.desc !== undefined && obj.desc !== null && String(obj.desc).trim() !== ''
          ? String(obj.desc)
          : undefined
    const meta =
      obj.meta !== undefined && obj.meta !== null && String(obj.meta).trim() !== ''
        ? String(obj.meta)
        : obj.duration !== undefined && obj.duration !== null && String(obj.duration).trim() !== ''
          ? String(obj.duration)
          : undefined

    const rawStatus = typeof obj.status === 'string' ? obj.status.trim().toLowerCase() : ''
    let status: StepStatus
    if (rawStatus === 'done' || rawStatus === 'completed' || rawStatus === 'success') {
      status = 'done'
    } else if (rawStatus === 'active' || rawStatus === 'running' || rawStatus === 'in_progress') {
      status = 'active'
    } else if (rawStatus === 'error' || rawStatus === 'failed') {
      status = 'error'
    } else if (rawStatus === 'pending' || rawStatus === 'waiting') {
      status = 'pending'
    } else if (currentIdx !== undefined) {
      status = idx < currentIdx ? 'done' : idx === currentIdx ? 'active' : 'pending'
    } else {
      status = 'pending'
    }

    return {
      title,
      ...(description !== undefined ? { description } : {}),
      ...(meta !== undefined ? { meta } : {}),
      status,
    }
  })
}

export interface NormalizedKvItem {
  readonly label: string
  readonly value: string
  readonly tone?: TagTone
  readonly copyable: boolean
  readonly mono: boolean
}

const VALID_TAG_TONES = new Set<string>([
  'neutral',
  'info',
  'success',
  'warning',
  'danger',
  'outline',
  'solid',
])

export function normalizeKeyValueItems(raw: unknown, defaultCopyable = false): NormalizedKvItem[] {
  if (Array.isArray(raw)) {
    return raw.map((item, idx) => {
      if (typeof item !== 'object' || item === null) {
        return {
          label: `#${idx + 1}`,
          value: String(item ?? ''),
          copyable: defaultCopyable,
          mono: false,
        }
      }
      const rec = item as Record<string, unknown>
      const label = String(rec.label ?? rec.key ?? rec.name ?? `#${idx + 1}`)
      const rawVal = rec.value ?? rec.val ?? ''
      const value =
        typeof rawVal === 'object' && rawVal !== null ? JSON.stringify(rawVal) : String(rawVal)
      const toneStr = typeof rec.tone === 'string' && VALID_TAG_TONES.has(rec.tone) ? (rec.tone as TagTone) : undefined
      return {
        label,
        value,
        ...(toneStr !== undefined ? { tone: toneStr } : {}),
        copyable: typeof rec.copyable === 'boolean' ? rec.copyable : defaultCopyable,
        mono: Boolean(rec.mono),
      }
    })
  }
  if (typeof raw === 'object' && raw !== null) {
    return Object.entries(raw as Record<string, unknown>).map(([k, v]) => ({
      label: k,
      value: typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? ''),
      copyable: defaultCopyable,
      mono: false,
    }))
  }
  return []
}
