export function visualWidthOf(raw: string): number {
  let units = 0
  for (const ch of raw) {
    units += (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1
  }
  return units
}

export function truncateByVisualWidth(raw: string, maxUnits: number): string {
  let units = 0
  let out = ''
  for (const ch of raw) {
    const w = (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1
    if (units + w > maxUnits) {
      return `${out}…`
    }
    out += ch
    units += w
  }
  return raw
}

export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]!
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sorted[base + 1] ?? sorted[base]!
  return Number((sorted[base]! + rest * (next - sorted[base]!)).toPrecision(10))
}

export function computeEvenAxisInterval(maxVal: number, isCompact: boolean): number | undefined {
  if (!Number.isFinite(maxVal) || maxVal <= 0) return undefined
  const mag = 10 ** Math.floor(Math.log10(maxVal))
  const scaled = Math.round((maxVal / mag) * 1000)
  const divs = isCompact ? [4, 3, 2, 5] : [5, 4, 3, 2]
  for (const d of divs) {
    if (scaled % d === 0) return Number((maxVal / d).toPrecision(6))
  }
  return Number((maxVal / (isCompact ? 3 : 4)).toPrecision(6))
}

export function buildCompactCategoryFormatter(
  categories: readonly string[],
  maxWidthPx: number,
  isCompact: boolean,
): ((val: string) => string) | undefined {
  if (!isCompact || categories.length < 2) return undefined
  const maxUnits = Math.max(4, Math.floor(maxWidthPx / 6.2))
  const unique = [...new Set(categories)]
  if (unique.length < 2) return undefined
  const seen = new Set<string>()
  let collides = false
  for (const c of unique) {
    const t = truncateByVisualWidth(c, maxUnits)
    if (seen.has(t)) {
      collides = true
      break
    }
    seen.add(t)
  }
  if (!collides) return undefined
  if (unique.every((c) => /^\d{4}-\d{2}$/.test(c))) {
    const sameYear = unique.every((c) => c.slice(0, 5) === unique[0]!.slice(0, 5))
    return (v: string) => (sameYear && maxUnits < 5 ? v.slice(5) : v.slice(2))
  }
  if (unique.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c))) {
    const sameYear = unique.every((c) => c.slice(0, 5) === unique[0]!.slice(0, 5))
    if (sameYear) return (v: string) => v.slice(5)
    const distinctMmDd = new Set(unique.map((c) => c.slice(5)))
    if (distinctMmDd.size === unique.length) return (v: string) => v.slice(5).replace('-', '/')
    return (v: string) => v.slice(2).replace(/-/g, '/')
  }
  let lcp = unique[0]!
  for (let i = 1; i < unique.length && lcp.length > 0; i++) {
    const cur = unique[i]!
    let j = 0
    while (j < lcp.length && j < cur.length && lcp[j] === cur[j]) j++
    lcp = lcp.slice(0, j)
  }
  let delimIdx = -1
  for (const sep of '-/_: ') delimIdx = Math.max(delimIdx, lcp.lastIndexOf(sep))
  const cut = delimIdx >= 2 ? delimIdx + 1 : lcp.length >= 4 ? lcp.length : 0
  if (cut > 0) {
    return (v: string) => {
      const tail = v.startsWith(lcp.slice(0, cut)) ? v.slice(cut) : v
      return truncateByVisualWidth(tail || v, maxUnits)
    }
  }
  return undefined
}

const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const

export function niceUpperBound(v: number): number {
  if (v <= 0) return 0
  const mag = 10 ** Math.floor(Math.log10(v))
  const norm = v / mag
  const step = NICE_STEPS.find((s) => norm <= s) ?? 10
  return Number((step * mag).toPrecision(6))
}

export function computeRefAxisBounds(
  values: readonly number[],
  refLine: number | undefined,
  scale = false,
  useLog = false,
): { min?: number | undefined; max?: number | undefined } {
  if (refLine === undefined || !Number.isFinite(refLine)) return {}
  const finiteVals = values.filter(Number.isFinite)
  const rawMax = finiteVals.length > 0 ? Math.max(...finiteVals) : 0
  const rawMin = finiteVals.length > 0 ? Math.min(...finiteVals) : 0
  const dataMax = scale ? rawMax : Math.max(0, rawMax)
  const dataMin = scale ? rawMin : Math.min(0, rawMin)
  if (useLog) {
    if (refLine <= 0) return {}
    const posVals = finiteVals.filter((v) => v > 0)
    const logMax = posVals.length > 0 ? Math.max(...posVals) : refLine
    return refLine >= logMax * 0.94 ? { max: niceUpperBound(Math.max(logMax, refLine) * 1.4) } : {}
  }

  let max: number | undefined
  let min: number | undefined

  const rawSpan = Math.max(dataMax, refLine) - Math.min(dataMin, refLine)
  const magRef = Math.max(Math.abs(dataMax), Math.abs(dataMin), Math.abs(refLine))
  const dataSpan = rawSpan > 0 ? rawSpan : magRef > 0 ? magRef * 0.2 : 1

  if (refLine > 0 && refLine >= dataMax * 0.94) {
    if (scale && dataSpan < dataMax * 0.35) {
      const target = Math.max(dataMax, refLine) + dataSpan * 0.28
      const step = 10 ** Math.floor(Math.log10(Math.max(1e-9, dataSpan)) - 1)
      max = Number((Math.ceil(target / step) * step).toPrecision(6))
    } else {
      max = niceUpperBound(Math.max(dataMax, refLine) * 1.1)
    }
  }

  if (refLine < 0 && refLine <= dataMin * 0.94) {
    min = -niceUpperBound(Math.abs(Math.min(dataMin, refLine)) * 1.1)
  } else if (scale && refLine < dataMin) {
    if (refLine >= 0 && dataSpan < dataMax * 0.35) {
      const target = Math.max(0, refLine - dataSpan * 0.22)
      const step = 10 ** Math.floor(Math.log10(Math.max(1e-9, dataSpan)) - 1)
      min = Number((Math.floor(target / step) * step).toPrecision(6))
    } else {
      min =
        refLine >= 0
          ? Number((refLine * 0.92).toPrecision(6))
          : -niceUpperBound(Math.abs(refLine) * 1.1)
    }
  }

  return {
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
  }
}

export function formatCompactTickNum(v: number, span?: number): string {
  if (!Number.isFinite(v)) return '0'
  const abs = Math.abs(v)
  if (span !== undefined && span > 0) {
    if (span < 2 && abs < 1e4) {
      const digits = span < 0.005 ? 5 : span < 0.05 ? 4 : span < 0.5 ? 3 : 2
      return String(Number(v.toFixed(digits)))
    }
    if (abs >= 1e4 && span < abs * 0.05) {
      return Number.isInteger(v) ? v.toLocaleString('en-US') : String(Number(v.toPrecision(7)))
    }
  }
  if (abs >= 1e12) return `${Number((v / 1e12).toFixed(2))}T`
  if (abs >= 1e9) return `${Number((v / 1e9).toFixed(2))}B`
  if (abs >= 1e6) return `${Number((v / 1e6).toFixed(2))}M`
  if (abs >= 1e4) return `${Number((v / 1e3).toFixed(1))}K`
  if (abs >= 1000) return String(Math.round(v))
  if (abs >= 10) return String(Number(v.toFixed(1)))
  if (abs > 0 && abs < 0.01) return String(Number(v.toPrecision(2)))
  return String(Number(v.toFixed(2)))
}

export interface HistogramBin {
  readonly label: string
  readonly start: number
  readonly end: number
  readonly count: number
  readonly pct: number
}

export function computeHistogramBins(
  rawValues: readonly number[],
  requestedBins: number | undefined,
  isCompact: boolean,
): readonly HistogramBin[] {
  const finite = rawValues.filter(Number.isFinite).sort((a, b) => a - b)
  if (finite.length === 0) return []
  const minVal = finite[0]!
  const maxVal = finite[finite.length - 1]!
  const span = maxVal - minVal
  if (span <= 0) {
    return [
      {
        label: formatCompactTickNum(minVal),
        start: minVal,
        end: maxVal,
        count: finite.length,
        pct: 100,
      },
    ]
  }
  const q1 = quantile(finite, 0.25)
  const q3 = quantile(finite, 0.75)
  const iqr = q3 - q1
  let autoBins = Math.ceil(Math.log2(finite.length) + 1)
  if (iqr > 0) {
    const fdWidth = (2 * iqr) / Math.cbrt(finite.length)
    if (fdWidth > 0) {
      autoBins = Math.ceil(span / fdWidth)
    }
  }
  const maxAuto = isCompact ? 8 : 14
  const hasExplicitBins = typeof requestedBins === 'number' && Number.isFinite(requestedBins)
  let binCount = hasExplicitBins
    ? Math.max(2, Math.min(isCompact ? 12 : 40, Math.trunc(requestedBins)))
    : Math.max(4, Math.min(maxAuto, autoBins))
  let binStart = minVal
  let binEnd = maxVal
  let step = span / binCount
  if (!hasExplicitBins) {
    const rawStep = span / binCount
    const mag = 10 ** Math.floor(Math.log10(rawStep))
    for (const mult of [1, 2, 2.5, 5, 10]) {
      const cand = mult * mag
      const lo = Math.floor(minVal / cand + 1e-9) * cand
      const hi = Math.ceil(maxVal / cand - 1e-9) * cand
      const cnt = Math.round((hi - lo) / cand)
      if (cnt >= 4 && cnt <= maxAuto) {
        step = cand
        binStart = lo
        binEnd = hi
        binCount = cnt
        break
      }
    }
  }
  const counts = new Array<number>(binCount).fill(0)
  for (const v of finite) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((v - binStart) / step + 1e-9)))
    counts[idx] = (counts[idx] ?? 0) + 1
  }
  const cleanNum = (n: number): number =>
    Math.abs(n) < step * 1e-9 ? 0 : Number(n.toPrecision(10))
  return counts.map((count, i) => {
    const start = cleanNum(binStart + i * step)
    const end = i === binCount - 1 ? cleanNum(binEnd) : cleanNum(binStart + (i + 1) * step)
    return {
      label: `${formatCompactTickNum(start, step)}–${formatCompactTickNum(end, step)}`,
      start,
      end,
      count,
      pct: Number(((count / finite.length) * 100).toFixed(1)),
    }
  })
}

export function canUseLogScale(
  yScale: 'linear' | 'log' | undefined,
  values: readonly number[],
): boolean {
  if (yScale !== 'log') return false
  return values.some((v) => Number.isFinite(v) && v > 0)
}
