import { truncateByVisualWidth, visualWidthOf } from './shared.ts'

export function truncateMiddleByVisualWidth(raw: string, maxUnits: number): string {
  if (visualWidthOf(raw) <= maxUnits) return raw
  const chars = [...raw]
  const budget = Math.max(4, maxUnits - 1)
  const tailBudget = Math.max(2, Math.floor(budget * 0.42))
  const headBudget = Math.max(2, budget - tailBudget)
  let head = ''
  let hUnits = 0
  let headIdx = 0
  for (; headIdx < chars.length; headIdx++) {
    const ch = chars[headIdx]!
    const w = (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1
    if (hUnits + w > headBudget) break
    head += ch
    hUnits += w
  }
  let tail = ''
  let tUnits = 0
  for (let i = chars.length - 1; i >= headIdx; i--) {
    const ch = chars[i]!
    const w = (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1
    if (tUnits + w > tailBudget) break
    tail = ch + tail
    tUnits += w
  }
  return `${head}…${tail}`
}

export function buildLegendOption(opts: {
  readonly isCompact: boolean
  readonly scroll: boolean
  readonly bottom?: number | undefined
  readonly textColor: string
  readonly fontSize?: number | undefined
  readonly itemWidth?: number | undefined
  readonly itemHeight?: number | undefined
  readonly data?:
    | readonly (string | { readonly name: string; readonly icon?: string })[]
    | undefined
  readonly names?: readonly string[] | undefined
  readonly containerWidth?: number | undefined
}): Record<string, unknown> {
  const { isCompact, scroll, textColor } = opts
  const fontSize = opts.fontSize ?? 11
  const itemWidth = opts.itemWidth ?? 10
  const itemHeight = opts.itemHeight ?? 8
  const candidateNames =
    opts.names ?? opts.data?.map((item) => (typeof item === 'string' ? item : item.name))
  const uniqueNames = candidateNames ? [...new Set(candidateNames)] : []
  const uniqueNameSet = new Set(uniqueNames)
  const estContainerW =
    opts.containerWidth !== undefined && opts.containerWidth > 0
      ? opts.containerWidth
      : isCompact
        ? 276
        : 520
  const availW = Math.max(120, estContainerW - 12)
  const estNaturalTotalPx =
    uniqueNames.length > 0
      ? uniqueNames.reduce(
          (sum, n) => sum + itemWidth + 6 + visualWidthOf(n) * (fontSize * 0.62) + 8,
          -8,
        )
      : 0
  const fitsNaturallyWithoutScroll =
    uniqueNames.length > 0 && uniqueNames.length <= 3 && estNaturalTotalPx <= availW - 6
  const wideTwoSeriesFit =
    uniqueNames.length > 0 &&
    uniqueNames.length <= 2 &&
    uniqueNames.every((n) => visualWidthOf(n) <= 14)

  const perPage = estContainerW < 340 ? 2 : 3
  const dynSlotUnits = Math.max(
    9,
    Math.min(16, Math.floor((availW - 60) / (perPage * fontSize * 0.62))),
  )
  let compactFormatter: ((name: string) => string) | undefined
  if (isCompact) {
    const baseMaxUnits = estContainerW < 340 ? 8 : dynSlotUnits
    const collided = new Set<string>()
    if (uniqueNames.length > 1) {
      const seen = new Map<string, string>()
      for (const n of uniqueNames) {
        const truncated = truncateByVisualWidth(n, baseMaxUnits)
        const existing = seen.get(truncated)
        if (existing !== undefined && existing !== n) {
          collided.add(existing)
          collided.add(n)
        } else {
          seen.set(truncated, n)
        }
      }
    }
    compactFormatter = (name: string) => {
      if ((wideTwoSeriesFit || fitsNaturallyWithoutScroll) && uniqueNameSet.has(name)) {
        return name
      }
      if (collided.has(name)) {
        if (wideTwoSeriesFit) return name
        return truncateMiddleByVisualWidth(name, Math.min(16, Math.max(12, dynSlotUnits)))
      }
      return truncateByVisualWidth(name, baseMaxUnits)
    }
  }

  const formattedNames = uniqueNames.map((n) => (compactFormatter ? compactFormatter(n) : n))
  const formattedMinWidths = formattedNames.map(
    (s) => itemWidth + 5 + Math.floor(visualWidthOf(s) * (fontSize * 0.5)),
  )
  const formattedMaxWidths = formattedNames.map(
    (s) => itemWidth + 5 + Math.ceil(visualWidthOf(s) * (fontSize * 0.6)),
  )
  const estFormattedTotalMax =
    formattedMaxWidths.length > 0 ? formattedMaxWidths.reduce((sum, w) => sum + w + 8, -8) : 0

  const effectiveScroll = scroll || (uniqueNames.length > 1 && estNaturalTotalPx > availW - 6)
  const willPaginateScroll =
    isCompact &&
    effectiveScroll &&
    uniqueNames.length >= 3 &&
    !fitsNaturallyWithoutScroll &&
    estFormattedTotalMax > availW - 6
  const clipWMax = Math.max(96, availW - 44)
  const clipWMin = Math.max(96, availW - 68)
  let scrollItemGap = 8
  if (willPaginateScroll) {
    const maxK = Math.min(uniqueNames.length - 1, perPage + 1)
    for (let k = maxK; k >= 1; k -= 1) {
      let sumMin = 0
      let sumMax = 0
      for (let i = 0; i < k; i += 1) {
        sumMin += formattedMinWidths[i] ?? 0
        sumMax += formattedMaxWidths[i] ?? 0
      }
      if (k === 1) {
        scrollItemGap = Math.max(8, Math.min(64, Math.ceil(clipWMax - sumMin + 12)))
        break
      }
      const gapMin = Math.ceil((clipWMax - sumMin + 12) / k)
      const gapMax = Math.floor((clipWMin - sumMax - 4) / (k - 1))
      if (gapMax >= 8 && gapMin <= gapMax) {
        scrollItemGap = Math.max(8, Math.min(64, gapMin))
        break
      }
    }
  }
  const slotTextW = willPaginateScroll
    ? Math.max(42, Math.floor((clipWMin - 8 * (perPage - 1)) / perPage) - itemWidth - 5)
    : undefined

  return {
    type: effectiveScroll ? 'scroll' : 'plain',
    bottom: opts.bottom ?? 0,
    left: isCompact ? 6 : 'center',
    ...(isCompact ? { right: 6 } : {}),
    ...(willPaginateScroll ? { padding: 0 } : {}),
    itemWidth,
    itemHeight,
    itemGap: scrollItemGap,
    ...(effectiveScroll ? { pageButtonGap: 8, pageButtonItemGap: 4, pageIconSize: 10 } : {}),
    ...(compactFormatter ? { formatter: compactFormatter } : {}),
    ...(opts.data ? { data: [...opts.data] } : {}),
    textStyle: {
      color: textColor,
      fontSize,
      ...(slotTextW !== undefined
        ? { width: slotTextW, overflow: 'truncate' as const, ellipsis: '…' }
        : {}),
    },
  }
}
