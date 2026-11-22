export interface SplitStatValue {
  readonly main: string
  readonly unit: string
}

export function splitStatValueUnit(raw: unknown): SplitStatValue {
  if (raw === null || raw === undefined) return { main: '', unit: '' }
  if (typeof raw === 'number') {
    return { main: Number.isFinite(raw) ? String(raw) : '0', unit: '' }
  }
  const text = String(raw).trim()
  if (text === '') return { main: '', unit: '' }
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text) || /^\d{1,2}:\d{2}/.test(text)) {
    return { main: text, unit: '' }
  }
  const match =
    /^([+-]?(?:[$¥€£]\s*)?\d[\d,]*(?:\.\d+)?)\s*([%‰℃°A-Za-z\u4e00-\u9fff/²³µμ]{1,8})$/.exec(text)
  if (!match?.[1] || !match[2]) return { main: text, unit: '' }
  return { main: match[1].trim(), unit: match[2].trim() }
}

export function normalizeSparklinePoints(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  const nums: number[] = []
  for (const item of raw) {
    if (typeof item === 'number' && Number.isFinite(item)) {
      nums.push(item)
    } else if (typeof item === 'string' && item.trim() !== '') {
      const n = Number(item.trim())
      if (Number.isFinite(n)) nums.push(n)
    } else if (typeof item === 'object' && item !== null) {
      const v = (item as Record<string, unknown>).value ?? (item as Record<string, unknown>).y
      if (typeof v === 'number' && Number.isFinite(v)) nums.push(v)
    }
  }
  return nums
}

export interface SparklineGeometry {
  readonly linePath: string
  readonly areaPath: string
  readonly lastX: number
  readonly lastY: number
}

export function buildSparklineGeometry(
  values: readonly number[],
  width = 88,
  height = 26,
  pad = 3,
): SparklineGeometry | null {
  const finite = values.filter(Number.isFinite)
  if (finite.length < 2) return null
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const span = max - min
  const hasFiniteSpan = Number.isFinite(span) && span > 0
  const innerW = Math.max(1, width - pad * 2)
  const innerH = Math.max(1, height - pad * 2)

  const coords = finite.map((v, idx) => {
    const x = pad + (idx / (finite.length - 1)) * innerW
    const y = !hasFiniteSpan ? height / 2 : pad + innerH - ((v - min) / span) * innerH
    return [Number(x.toFixed(2)), Number(y.toFixed(2))] as const
  })

  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const first = coords[0]!
  const last = coords[coords.length - 1]!
  const baseline = Number((height - 1).toFixed(2))
  const areaPath = `${linePath} L${last[0]},${baseline} L${first[0]},${baseline} Z`

  return { linePath, areaPath, lastX: last[0], lastY: last[1] }
}

export type FileChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed'

export interface NormalizedFileEntry {
  readonly path: string
  readonly kind: 'file' | 'dir'
  readonly status?: FileChangeStatus | undefined
  readonly summary?: string | undefined
  readonly line?: number | undefined
  readonly raw: Record<string, unknown>
}

export interface FileTreeNode {
  readonly name: string
  readonly path: string
  readonly kind: 'file' | 'dir'
  readonly status?: FileChangeStatus | undefined
  readonly summary?: string | undefined
  readonly line?: number | undefined
  readonly raw?: Record<string, unknown> | undefined
  readonly children: FileTreeNode[]
  readonly fileCount: number
}

function normalizeStatus(raw: unknown): FileChangeStatus | undefined {
  if (typeof raw !== 'string') return undefined
  const lower = raw.trim().toLowerCase()
  if (lower === 'added' || lower === 'add' || lower === 'a' || lower === 'new') return 'added'
  if (lower === 'modified' || lower === 'mod' || lower === 'm' || lower === 'changed')
    return 'modified'
  if (lower === 'deleted' || lower === 'del' || lower === 'd' || lower === 'removed')
    return 'deleted'
  if (lower === 'renamed' || lower === 'ren' || lower === 'r' || lower === 'moved') return 'renamed'
  return undefined
}

export function normalizeFileEntries(rawItems: unknown): NormalizedFileEntry[] {
  if (!Array.isArray(rawItems)) return []
  const out: NormalizedFileEntry[] = []
  for (const item of rawItems) {
    if (typeof item === 'string') {
      const normalizedSlashes = item
        .replace(/\\/g, '/')
        .replace(/^(?:\.\/)+/, '')
        .trim()
      const isAbs = normalizedSlashes.startsWith('/')
      const body = normalizedSlashes.replace(/^\/+|\/+$/g, '').trim()
      if (body !== '') {
        const clean = isAbs ? `/${body}` : body
        const isDir = normalizedSlashes.endsWith('/')
        out.push({ path: clean, kind: isDir ? 'dir' : 'file', raw: { path: clean } })
      }
      continue
    }
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      const rec = item as Record<string, unknown>
      const rawPath =
        typeof rec.path === 'string' ? rec.path : typeof rec.file === 'string' ? rec.file : ''
      const normalizedSlashes = rawPath
        .replace(/\\/g, '/')
        .replace(/^(?:\.\/)+/, '')
        .trim()
      const isAbs = normalizedSlashes.startsWith('/')
      const body = normalizedSlashes.replace(/^\/+|\/+$/g, '').trim()
      if (body === '') continue
      const clean = isAbs ? `/${body}` : body
      const explicitKind =
        rec.kind === 'dir' || rec.type === 'dir' || normalizedSlashes.endsWith('/') ? 'dir' : 'file'
      const status = normalizeStatus(rec.status)
      const summary =
        typeof rec.summary === 'string' && rec.summary.trim() !== ''
          ? rec.summary.trim()
          : undefined
      const line =
        typeof rec.line === 'number' && Number.isFinite(rec.line) && rec.line >= 1
          ? Math.trunc(rec.line)
          : undefined
      out.push({ path: clean, kind: explicitKind, status, summary, line, raw: rec })
    }
  }
  return out
}

interface MutableTreeNode {
  name: string
  path: string
  kind: 'file' | 'dir'
  status?: FileChangeStatus | undefined
  summary?: string | undefined
  line?: number | undefined
  raw?: Record<string, unknown> | undefined
  childrenMap: Map<string, MutableTreeNode>
}

function finalizeTree(map: Map<string, MutableTreeNode>): FileTreeNode[] {
  const nodes = [...map.values()].map((m): FileTreeNode => {
    const children = finalizeTree(m.childrenMap)
    const fileCount =
      m.kind === 'file'
        ? 1
        : children.reduce((acc, c) => acc + (c.kind === 'file' ? 1 : c.fileCount), 0)
    return {
      name: m.name,
      path: m.path,
      kind: m.kind,
      status: m.status,
      summary: m.summary,
      line: m.line,
      raw: m.raw,
      children,
      fileCount,
    }
  })

  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return nodes
}

export function buildFileTree(rawItems: unknown): FileTreeNode[] {
  const entries = normalizeFileEntries(rawItems)
  const rootMap = new Map<string, MutableTreeNode>()

  for (const entry of entries) {
    const isAbs = entry.path.startsWith('/')
    const segments = entry.path.replace(/^\/+/, '').split('/').filter(Boolean)
    if (segments.length === 0) continue

    let cursorMap = rootMap
    let builtPath = isAbs ? '' : ''

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!
      builtPath = builtPath === '' ? (isAbs ? `/${seg}` : seg) : `${builtPath}/${seg}`
      const isLeaf = i === segments.length - 1
      const kind: 'file' | 'dir' = isLeaf ? entry.kind : 'dir'

      let existing = cursorMap.get(seg)
      if (!existing) {
        existing = {
          name: seg,
          path: builtPath,
          kind,
          childrenMap: new Map(),
        }
        cursorMap.set(seg, existing)
      } else if (!isLeaf) {
        existing.kind = 'dir'
      }

      if (isLeaf) {
        existing.status = entry.status ?? existing.status
        existing.summary = entry.summary ?? existing.summary
        existing.line = entry.line ?? existing.line
        existing.raw = entry.raw
      }
      cursorMap = existing.childrenMap
    }
  }

  return finalizeTree(rootMap)
}
