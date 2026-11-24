import type * as echarts from 'echarts/core'
import { type ChartPalette, extractCategoryAxisLabels, sanitizeChartLabel } from './shared.ts'

function asObj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {}
}

function normStr(v: unknown): string {
  return sanitizeChartLabel(v).trim().toLowerCase()
}

function matchesQuery(value: string, queries: readonly string[], exactOnly: boolean): boolean {
  return queries.some((q) =>
    exactOnly ? value === q : value === q || (value !== '' && value.includes(q)),
  )
}

function normalizeSelectedQueries(rawSelected: string | readonly string[] | undefined): string[] {
  if (Array.isArray(rawSelected)) {
    const out: string[] = []
    const seen = new Set<string>()
    for (const item of rawSelected) {
      const q = String(item ?? '')
        .trim()
        .toLowerCase()
      if (q !== '' && !seen.has(q)) {
        seen.add(q)
        out.push(q)
      }
    }
    return out
  }
  const q = typeof rawSelected === 'string' ? rawSelected.trim().toLowerCase() : ''
  return q === '' ? [] : [q]
}

function applyHierarchyCrossFilter(
  nodes: readonly unknown[],
  queries: readonly string[],
  exactOnly: boolean,
  highlightBorder: string,
  ancestorMatched = false,
): { readonly nodes: unknown[]; readonly matched: boolean } {
  let anyMatched = false
  const mapped = nodes.map((item) => {
    if (typeof item !== 'object' || item === null) return item
    const rec = item as Record<string, unknown>
    const selfMatch = matchesQuery(normStr(rec.name), queries, exactOnly)
    const childRes = Array.isArray(rec.children)
      ? applyHierarchyCrossFilter(
          rec.children,
          queries,
          exactOnly,
          highlightBorder,
          ancestorMatched || selfMatch,
        )
      : null
    const isMatch = ancestorMatched || selfMatch || Boolean(childRes?.matched)
    if (isMatch) anyMatched = true
    return {
      ...rec,
      ...(childRes ? { children: childRes.nodes } : {}),
      itemStyle: {
        ...asObj(rec.itemStyle),
        opacity: isMatch ? 1 : 0.3,
        ...(selfMatch ? { borderColor: highlightBorder, borderWidth: 1.5 } : {}),
      },
    }
  })
  return { nodes: mapped, matched: anyMatched }
}

function hasExactHierarchyMatch(nodes: readonly unknown[], queries: readonly string[]): boolean {
  for (const item of nodes) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    if (queries.includes(normStr(rec.name))) return true
    if (Array.isArray(rec.children) && hasExactHierarchyMatch(rec.children, queries)) return true
  }
  return false
}

export function applyCrossFilterSelection(
  option: echarts.EChartsCoreOption,
  rawSelected: string | readonly string[] | undefined,
  dark: boolean,
): echarts.EChartsCoreOption {
  const queries = normalizeSelectedQueries(rawSelected)
  if (queries.length === 0 || typeof option !== 'object' || option === null) return option

  const opt = option as Record<string, unknown>
  if (!Array.isArray(opt.series)) return option

  const categories = extractCategoryAxisLabels(opt)
  const highlightBorder = dark ? 'rgba(248, 250, 252, 0.92)' : 'rgba(15, 23, 42, 0.82)'
  const dimStyle = (
    prev: unknown,
    isMatch: boolean,
    dimOpacity: number,
    withBorder: boolean,
  ): Record<string, unknown> => ({
    ...asObj(prev),
    opacity: isMatch ? 1 : dimOpacity,
    ...(isMatch && withBorder ? { borderColor: highlightBorder, borderWidth: 1.5 } : {}),
  })

  const nextSeries = (opt.series as Record<string, unknown>[]).map((s) => {
    if (typeof s !== 'object' || s === null) return s
    if (s.silent === true && s.stack !== 'dumbbellLink') return s
    const type = String(s.type ?? '')
    const seriesNameNorm = normStr(s.name)
    const seriesMatched = seriesNameNorm !== '' && queries.includes(seriesNameNorm)

    if (
      (type === 'pie' || type === 'funnel' || type === 'treemap' || type === 'sunburst') &&
      Array.isArray(s.data)
    ) {
      const res = applyHierarchyCrossFilter(
        s.data,
        queries,
        hasExactHierarchyMatch(s.data, queries),
        highlightBorder,
      )
      return { ...s, data: res.nodes }
    }

    if (
      (type === 'bar' || type === 'line' || type === 'boxplot' || type === 'candlestick') &&
      Array.isArray(s.data) &&
      categories
    ) {
      if (asObj(s.itemStyle).color === 'transparent') return s
      const normArrow = (str: string) =>
        str
          .replace(/\s*→\s*/g, ' -> ')
          .replace(/\s*->\s*/g, ' -> ')
          .trim()
          .toLowerCase()
      const qNorms = queries.map(normArrow)
      const hasExactCat = categories.some((c) => qNorms.includes(normArrow(c)))
      let anyPointMatched = false
      const borderEligible = type === 'bar' || type === 'line'
      const nextData = (s.data as unknown[]).map((pt, idx) => {
        if (pt === '-') return pt
        const isMatch =
          seriesMatched || matchesQuery(normArrow(categories[idx] ?? ''), qNorms, hasExactCat)
        if (isMatch) anyPointMatched = true
        const base =
          typeof pt === 'object' && pt !== null && !Array.isArray(pt)
            ? (pt as Record<string, unknown>)
            : { value: pt }
        return {
          ...base,
          ...(type === 'line' ? { symbolSize: isMatch ? 8 : 4 } : {}),
          itemStyle: dimStyle(base.itemStyle, isMatch, 0.28, borderEligible),
        }
      })
      if (type === 'line') {
        const prevArea =
          typeof s.areaStyle === 'object' && s.areaStyle !== null
            ? (s.areaStyle as Record<string, unknown>)
            : undefined
        return {
          ...s,
          lineStyle: {
            ...asObj(s.lineStyle),
            opacity: seriesMatched ? 1 : anyPointMatched ? 0.55 : 0.22,
          },
          ...(prevArea ? { areaStyle: { ...prevArea, opacity: seriesMatched ? 0.24 : 0.08 } } : {}),
          data: nextData,
        }
      }
      return { ...s, data: nextData }
    }

    if (type === 'parallel') {
      const dataArr = Array.isArray(s.data) ? s.data : []
      const hasNamedItems =
        dataArr.length > 1 && dataArr.some((item) => typeof asObj(item).name === 'string')
      if (hasNamedItems) {
        return {
          ...s,
          data: dataArr.map((item) => {
            if (typeof item !== 'object' || item === null || Array.isArray(item)) return item
            const rec = item as Record<string, unknown>
            const itemMatch = matchesQuery(normStr(rec.name), queries, false)
            return {
              ...rec,
              lineStyle: {
                ...asObj(rec.lineStyle),
                opacity: itemMatch ? 1 : 0.14,
                width: itemMatch ? 3.2 : 1.3,
              },
            }
          }),
        }
      }
      const isMatch = seriesMatched || matchesQuery(seriesNameNorm, queries, false)
      return {
        ...s,
        lineStyle: {
          ...asObj(s.lineStyle),
          opacity: isMatch ? 1 : 0.16,
          width: isMatch ? 3.2 : 1.5,
        },
      }
    }

    if ((type === 'sankey' || type === 'graph' || type === 'chord') && Array.isArray(s.data)) {
      const hasExactNode = (s.data as unknown[]).some((node) => {
        if (typeof node !== 'object' || node === null) return false
        const rec = node as Record<string, unknown>
        const idNorm = normStr(rec.id)
        return queries.includes(normStr(rec.name)) || (idNorm !== '' && queries.includes(idNorm))
      })
      const matchedNodeKeys = new Set<string>()
      const nextNodes = (s.data as unknown[]).map((node) => {
        if (typeof node !== 'object' || node === null) return node
        const rec = node as Record<string, unknown>
        const nameNorm = normStr(rec.name)
        const idNorm = normStr(rec.id)
        const isMatch =
          matchesQuery(nameNorm, queries, hasExactNode) ||
          (idNorm !== '' && matchesQuery(idNorm, queries, hasExactNode))
        if (isMatch) {
          if (nameNorm) matchedNodeKeys.add(nameNorm)
          if (idNorm) matchedNodeKeys.add(idNorm)
        }
        return { ...rec, itemStyle: dimStyle(rec.itemStyle, isMatch, 0.3, false) }
      })
      const nextLinks = Array.isArray(s.links)
        ? (s.links as unknown[]).map((lk) => {
            if (typeof lk !== 'object' || lk === null) return lk
            const rec = lk as Record<string, unknown>
            const linkMatch =
              matchedNodeKeys.has(normStr(rec.source)) || matchedNodeKeys.has(normStr(rec.target))
            const hasLabel = typeof rec.label === 'object' && rec.label !== null
            return {
              ...rec,
              lineStyle: { ...asObj(rec.lineStyle), opacity: linkMatch ? 0.65 : 0.14 },
              ...(hasLabel
                ? { label: { ...asObj(rec.label), opacity: linkMatch ? 1 : 0.25 } }
                : {}),
            }
          })
        : s.links
      return { ...s, data: nextNodes, ...(nextLinks !== undefined ? { links: nextLinks } : {}) }
    }

    if (type === 'scatter' && Array.isArray(s.data)) {
      const hasExactScatter = (s.data as unknown[]).some((pt) => {
        if (typeof pt !== 'object' || pt === null || Array.isArray(pt)) return false
        const n = normStr((pt as Record<string, unknown>).name)
        return n !== '' && queries.includes(n)
      })
      const nextData = (s.data as unknown[]).map((pt) => {
        if (typeof pt === 'object' && pt !== null && !Array.isArray(pt)) {
          const rec = pt as Record<string, unknown>
          const isMatch = seriesMatched || matchesQuery(normStr(rec.name), queries, hasExactScatter)
          return { ...rec, itemStyle: dimStyle(rec.itemStyle, isMatch, 0.25, true) }
        }
        return { value: pt, itemStyle: { opacity: seriesMatched ? 1 : 0.25 } }
      })
      return { ...s, data: nextData }
    }

    if (type === 'heatmap' && Array.isArray(s.data)) {
      const yAxisObj = Array.isArray(opt.yAxis) ? asObj(opt.yAxis[0]) : asObj(opt.yAxis)
      const yCats = Array.isArray(yAxisObj.data) ? (yAxisObj.data as unknown[]).map(normStr) : []
      const extractHeatTokens = (pt: unknown): string[] => {
        const toks: string[] = []
        if (Array.isArray(pt) && typeof pt[0] === 'string') {
          toks.push(normStr(pt[0]))
        } else if (typeof pt === 'object' && pt !== null && !Array.isArray(pt)) {
          const rec = pt as Record<string, unknown>
          const n = normStr(rec.name)
          if (n) toks.push(n)
          if (Array.isArray(rec.value) && typeof rec.value[1] === 'number') {
            const yLbl = yCats[rec.value[1]]
            if (yLbl) toks.push(yLbl)
          }
        }
        return toks
      }
      const hasExactHeat = (s.data as unknown[]).some((pt) =>
        extractHeatTokens(pt).some((t) => queries.includes(t)),
      )
      const nextData = (s.data as unknown[]).map((pt) => {
        const toks = extractHeatTokens(pt)
        if (toks.length === 0) return pt
        const isMatch = toks.some((t) => matchesQuery(t, queries, hasExactHeat))
        const base = Array.isArray(pt) ? { value: pt } : (pt as Record<string, unknown>)
        return { ...base, itemStyle: dimStyle(base.itemStyle, isMatch, 0.28, true) }
      })
      return { ...s, data: nextData }
    }

    if (type === 'radar' && Array.isArray(s.data)) {
      const hasExactRadar = (s.data as unknown[]).some((pt) => {
        if (typeof pt !== 'object' || pt === null) return false
        const n = normStr((pt as Record<string, unknown>).name)
        return n !== '' && queries.includes(n)
      })
      const nextData = (s.data as unknown[]).map((pt) => {
        if (typeof pt !== 'object' || pt === null) return pt
        const rec = pt as Record<string, unknown>
        const isMatch = matchesQuery(normStr(rec.name), queries, hasExactRadar)
        return {
          ...rec,
          lineStyle: {
            ...asObj(rec.lineStyle),
            opacity: isMatch ? 1 : 0.22,
            width: isMatch ? 2.4 : 1.2,
          },
          areaStyle: { ...asObj(rec.areaStyle), opacity: isMatch ? (dark ? 0.24 : 0.2) : 0.04 },
        }
      })
      return { ...s, data: nextData }
    }

    return s
  })

  return { ...opt, series: nextSeries }
}

export function applyDarkSafeThemeDefaults(
  option: echarts.EChartsCoreOption,
  dark: boolean,
  theme: ChartPalette,
): echarts.EChartsCoreOption {
  if (typeof option !== 'object' || option === null) return option
  const opt = { ...(option as Record<string, unknown>) }
  if (opt.color === undefined) opt.color = theme.colors
  const handleFill = dark ? '#334155' : '#ffffff'

  if (opt.legend && typeof opt.legend === 'object' && !Array.isArray(opt.legend)) {
    opt.legend = {
      ...(opt.legend as Record<string, unknown>),
      inactiveColor: dark ? 'rgba(156, 163, 175, 0.35)' : 'rgba(100, 116, 139, 0.4)',
      pageIconColor: theme.brand,
      pageIconInactiveColor: dark ? 'rgba(156, 163, 175, 0.3)' : 'rgba(100, 116, 139, 0.35)',
      pageTextStyle: { color: theme.textSecondary, fontSize: 10 },
    }
  }

  if (Array.isArray(opt.dataZoom)) {
    const mute = dark ? '148, 163, 184' : '100, 116, 139'
    const blue = dark ? '96, 165, 250' : '37, 99, 235'
    opt.dataZoom = (opt.dataZoom as Record<string, unknown>[]).map((dz) =>
      dz?.type !== 'slider'
        ? dz
        : {
            ...dz,
            backgroundColor: dark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.04)',
            fillerColor: `rgba(${blue}, ${dark ? 0.22 : 0.16})`,
            handleStyle: { color: handleFill, borderColor: theme.brand, borderWidth: 1.2 },
            moveHandleStyle: { color: `rgba(${mute}, 0.45)` },
            dataBackground: {
              lineStyle: { color: `rgba(${mute}, 0.28)` },
              areaStyle: { color: `rgba(${mute}, ${dark ? 0.12 : 0.1})` },
            },
            selectedDataBackground: {
              lineStyle: { color: theme.brand },
              areaStyle: { color: `rgba(${blue}, ${dark ? 0.2 : 0.15})` },
            },
            textStyle: { color: theme.textSecondary, fontSize: 10 },
          },
    )
  }

  if (opt.visualMap && typeof opt.visualMap === 'object' && !Array.isArray(opt.visualMap)) {
    const vm = opt.visualMap as Record<string, unknown>
    const baseVm: Record<string, unknown> = { ...vm, borderColor: vm.borderColor ?? theme.border }
    opt.visualMap =
      vm.calculable === true
        ? {
            ...baseVm,
            handleStyle: {
              color: handleFill,
              borderColor: theme.brand,
              borderWidth: 1.2,
              ...asObj(vm.handleStyle),
            },
            indicatorStyle: { color: handleFill, borderColor: theme.brand },
          }
        : baseVm
  }

  const normalizeAxis = (ax: unknown): unknown => {
    if (Array.isArray(ax)) return ax.map(normalizeAxis)
    if (typeof ax !== 'object' || ax === null) return ax
    return { axisLine: { lineStyle: { color: theme.border } }, ...(ax as Record<string, unknown>) }
  }
  if (opt.xAxis !== undefined) opt.xAxis = normalizeAxis(opt.xAxis)
  if (opt.yAxis !== undefined) opt.yAxis = normalizeAxis(opt.yAxis)

  return opt
}
