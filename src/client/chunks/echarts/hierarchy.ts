import type * as echarts from 'echarts/core'
import {
  type ChartBuildContext,
  FILLED_SHAPE_LABEL,
  buildHierarchyTree,
  extractFlowData,
  filterAcyclicLinks,
  normalizeChartRows,
  sanitizeChartLabel,
  toNumber,
  visualWidthOf,
} from './shared.ts'

export function buildHierarchyChartOption(
  ctx: ChartBuildContext,
): echarts.EChartsCoreOption | null {
  const {
    props,
    dark,
    containerWidth,
    rows,
    theme,
    xKey,
    primaryY,
    isCompact,
    baseTooltip,
    itemTooltip,
    chartHeight,
    chartWidth,
    haloColor,
    legend,
  } = ctx

  if (props.kind === 'treemap' || props.kind === 'sunburst') {
    const hierarchyRows =
      rows.length > 0
        ? rows
        : typeof props.data === 'object' && props.data !== null && !Array.isArray(props.data)
          ? [props.data as Record<string, unknown>]
          : rows
    const treeData = buildHierarchyTree(hierarchyRows, props, xKey, primaryY)
    const borderCol = dark ? '#18181b' : '#ffffff'

    if (props.kind === 'sunburst') {
      const useInnerOnly =
        isCompact || (containerWidth !== undefined && containerWidth > 0 && containerWidth < 460)
      const estSunW = chartWidth(580)
      const estHeight = chartHeight
      const measureDepth = (nodes: readonly Record<string, unknown>[]): number => {
        let maxD = 0
        for (const n of nodes) {
          const kids = Array.isArray(n.children) ? (n.children as Record<string, unknown>[]) : []
          maxD = Math.max(maxD, kids.length > 0 ? 1 + measureDepth(kids) : 1)
        }
        return maxD
      }
      const treeDepth = Math.max(1, Math.min(6, measureDepth(treeData)))
      const sunburstLevels: Record<string, unknown>[] = [{}]
      const innerStart = 18
      const outerEnd = useInnerOnly ? 85 : treeDepth <= 2 ? 72 : 74
      const baseRadiusPx = Math.min(estSunW, estHeight) / 2
      const outerRingRadiusPx = baseRadiusPx * (outerEnd / 100)
      const outerLabelWidth = Math.max(46, Math.floor(estSunW / 2 - outerRingRadiusPx - 14))
      const hasOuterAccentRing = !useInnerOnly && treeDepth >= 3
      const innerBandEnd = hasOuterAccentRing ? outerEnd - 9 : outerEnd
      const innerDepthCount = hasOuterAccentRing ? treeDepth - 1 : treeDepth
      const bandSpan = (innerBandEnd - innerStart) / innerDepthCount
      for (let lv = 0; lv < treeDepth; lv++) {
        const isOuterWide = hasOuterAccentRing && lv === treeDepth - 1
        const r0 = isOuterWide ? innerBandEnd : Math.round(innerStart + lv * bandSpan)
        const r = isOuterWide
          ? outerEnd
          : lv === innerDepthCount - 1
            ? innerBandEnd
            : Math.round(innerStart + (lv + 1) * bandSpan)
        const rMidPx = baseRadiusPx * ((r0 + r) / 200)
        const wedgeLabelW = Math.max(
          30,
          Math.min(useInnerOnly ? 54 : 64, Math.round(rMidPx * 0.78)),
        )
        sunburstLevels.push(
          isOuterWide
            ? {
                r0: `${r0}%`,
                r: `${r}%`,
                label: {
                  position: 'outside',
                  rotate: 0,
                  padding: 5,
                  fontSize: 11,
                  color: theme.textPrimary,
                  width: outerLabelWidth,
                  overflow: 'truncate',
                },
              }
            : {
                r0: `${r0}%`,
                r: `${r}%`,
                label: {
                  ...FILLED_SHAPE_LABEL,
                  textBorderColor: 'rgba(15, 23, 42, 0.86)',
                  textBorderWidth: 1.8,
                  rotate: 'tangential',
                  fontSize: useInnerOnly ? (lv === 0 ? 9.5 : 9) : lv === 0 ? 10 : 9.5,
                  minAngle: lv === 0 ? 20 : lv === treeDepth - 1 && useInnerOnly ? 22 : 14,
                  overflow: 'truncate',
                  width: wedgeLabelW,
                },
              },
        )
      }

      return {
        tooltip: itemTooltip,
        series: [
          {
            type: 'sunburst',
            center: ['50%', '51%'],
            radius: [`${innerStart}%`, `${outerEnd}%`],
            nodeClick:
              props.interactiveSelect || props.selected !== undefined ? false : 'rootToNode',
            sort: 'desc',
            minAngle: useInnerOnly ? 16 : 10,
            emphasis: { focus: 'ancestor' },
            labelLayout: { hideOverlap: true },
            label: {
              ...FILLED_SHAPE_LABEL,
              rotate: 'tangential',
              fontSize: 9.5,
              overflow: 'truncate',
              width: 60,
            },
            itemStyle: {
              borderRadius: 5,
              borderColor: borderCol,
              borderWidth: 2,
            },
            levels: sunburstLevels,
            data: treeData,
          },
        ],
      }
    }

    return {
      tooltip: itemTooltip,
      series: [
        {
          type: 'treemap',
          top: 6,
          right: 6,
          bottom: 6,
          left: 6,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          itemStyle: {
            borderColor: borderCol,
            borderWidth: 2,
            gapWidth: 2,
            borderRadius: 6,
          },
          label: {
            show: true,
            ...FILLED_SHAPE_LABEL,
            fontSize: isCompact ? 9.5 : 11.5,
            lineHeight: isCompact ? 12.5 : 15,
            padding: isCompact ? [2, 3] : undefined,
            overflow: isCompact ? 'truncate' : 'break',
            ellipsis: '…',
            formatter: isCompact
              ? (params: { name?: unknown }) => {
                  const text = sanitizeChartLabel(params.name)
                  if (text.length <= 8 || !text.includes(' ')) return text
                  const words = text.trim().split(/\s+/)
                  if (words.length <= 3) return words.join('\n')
                  const mid = Math.floor(text.length / 2)
                  let best = -1
                  for (let i = 0; i < text.length; i++) {
                    if (text[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) {
                      best = i
                    }
                  }
                  return best > 0 ? `${text.slice(0, best)}\n${text.slice(best + 1)}` : text
                }
              : undefined,
          },
          upperLabel: { show: false },
          data: treeData,
        },
      ],
    }
  }

  if (props.kind === 'sankey') {
    const srcField = props.xField ?? 'source'
    const tgtField = props.seriesField ?? 'target'
    const valField = (typeof props.yField === 'string' ? props.yField : undefined) ?? 'value'
    const { links: rawFlowLinks } = extractFlowData(
      props.data,
      rows,
      srcField,
      tgtField,
      valField,
      primaryY,
      0,
      false,
    )
    const links = filterAcyclicLinks(rawFlowLinks)
    const nodeNames = [...new Set(links.flatMap((l) => [l.source, l.target]))]
    const sourceSet = new Set(links.map((l) => l.source))
    const rightSideLabels = nodeNames.filter((n) => !sourceSet.has(n))
    const measureCandidates = rightSideLabels.length > 0 ? rightSideLabels : nodeNames
    const maxRightLabelPx = measureCandidates.reduce(
      (acc, label) => Math.max(acc, visualWidthOf(label) * 6.5),
      0,
    )
    const maxPad =
      containerWidth !== undefined && containerWidth > 0
        ? Math.max(64, Math.floor(containerWidth * 0.3))
        : 190
    const rightPadding = Math.min(maxPad, Math.max(76, Math.ceil(maxRightLabelPx + 20)))

    const depthOf = new Map<string, number>()
    for (const n of nodeNames) depthOf.set(n, 0)
    for (let pass = 0; pass < nodeNames.length; pass++) {
      let changed = false
      for (const l of links) {
        const nextD = (depthOf.get(l.source) ?? 0) + 1
        if (nextD > (depthOf.get(l.target) ?? 0)) {
          depthOf.set(l.target, nextD)
          changed = true
        }
      }
      if (!changed) break
    }
    const maxStage = Math.max(1, ...depthOf.values())
    const estSankeyW = chartWidth(560)
    const nodeW = isCompact ? 11 : 16
    const rawStageGap = Math.floor(
      (estSankeyW - 12 - rightPadding - nodeW * (maxStage + 1)) / maxStage,
    )
    const stageGap = Math.max(24, rawStageGap)
    const leafLabelMaxW = Math.max(40, rightPadding - 18)
    const midLabelMaxW = Math.max(24, stageGap - 4)

    const sankeyLabelBase = {
      color: theme.textPrimary,
      fontSize: isCompact ? 9.5 : 11,
      overflow: 'truncate' as const,
      width: midLabelMaxW,
      textBorderColor: dark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.88)',
      textBorderWidth: 2,
    }

    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as {
            dataType?: string
            name?: unknown
            value?: unknown
            data?: { source?: unknown; target?: unknown; value?: unknown }
          }
          if (p?.dataType === 'edge' && p.data) {
            const src = sanitizeChartLabel(p.data.source)
            const tgt = sanitizeChartLabel(p.data.target)
            const val = sanitizeChartLabel(p.data.value ?? p.value)
            return isCompact ? `${src} →\n${tgt}: ${val}` : `${src} → ${tgt}: ${val}`
          }
          const name = sanitizeChartLabel(p?.name)
          const val = sanitizeChartLabel(p?.value)
          return val !== '' ? `${name}: ${val}` : name
        },
      },
      series: [
        {
          type: 'sankey',
          top: 12,
          bottom: 12,
          left: 10,
          right: rightPadding,
          emphasis: { focus: 'adjacency' },
          nodeGap: isCompact ? 8 : 10,
          nodeWidth: nodeW,
          labelLayout: { hideOverlap: true },
          lineStyle: { color: 'gradient', curveness: 0.5, opacity: dark ? 0.36 : 0.28 },
          label: sankeyLabelBase,
          data: nodeNames.map((name) => ({
            name,
            label: !sourceSet.has(name) ? { ...sankeyLabelBase, width: leafLabelMaxW } : undefined,
          })),
          links,
        },
      ],
    }
  }

  if (props.kind === 'graph') {
    let nodes: Record<string, unknown>[] = []
    let links: Record<string, unknown>[] = []

    const rawObj =
      typeof props.data === 'object' && props.data !== null && !Array.isArray(props.data)
        ? (props.data as Record<string, unknown>)
        : null

    const sizeScale = isCompact ? 0.72 : 1
    const buildEdgeLabel = (rawLbl: unknown) => {
      if (!rawLbl) return undefined
      const text = sanitizeChartLabel(rawLbl)
      return {
        show: true,
        formatter: () => text,
        fontSize: isCompact ? 9 : 10,
        color: theme.textSecondary,
        backgroundColor: isCompact
          ? dark
            ? 'rgba(15, 23, 42, 0.78)'
            : 'rgba(255, 255, 255, 0.85)'
          : undefined,
        padding: isCompact ? [1, 3] : undefined,
        borderRadius: isCompact ? 3 : undefined,
      }
    }
    if (rawObj && Array.isArray(rawObj.nodes) && rawObj.nodes.length > 0) {
      const rawCatList = Array.isArray(rawObj.categories)
        ? (rawObj.categories as unknown[]).map((c) =>
            typeof c === 'object' && c !== null && 'name' in c
              ? sanitizeChartLabel((c as { name?: unknown }).name)
              : sanitizeChartLabel(c),
          )
        : []
      const seenNodeIds = new Set<string>()
      nodes = []
      for (const n of rawObj.nodes as Record<string, unknown>[]) {
        if (!n || typeof n !== 'object') continue
        const id = sanitizeChartLabel(n.id ?? n.name)
        if (!id || seenNodeIds.has(id)) continue
        seenNodeIds.add(id)
        const rawCat = n.group ?? n.category
        const resolvedCat =
          typeof rawCat === 'number' &&
          Number.isInteger(rawCat) &&
          rawCat >= 0 &&
          rawCat < rawCatList.length
            ? rawCatList[rawCat]
            : rawCat !== undefined
              ? sanitizeChartLabel(rawCat)
              : undefined
        nodes.push({
          id,
          name: sanitizeChartLabel(n.name ?? n.id),
          ...(n.value !== undefined ? { value: n.value } : {}),
          symbolSize: Math.round(
            (n.size ? Math.min(54, Math.max(18, toNumber(n.size))) : 30) * sizeScale,
          ),
          category: resolvedCat,
        })
      }
      links = Array.isArray(rawObj.links ?? rawObj.edges)
        ? ((rawObj.links ?? rawObj.edges) as Record<string, unknown>[])
            .filter((e) => e && typeof e === 'object')
            .map((e) => {
              const source = sanitizeChartLabel(e.source ?? e.from)
              const target = sanitizeChartLabel(e.target ?? e.to)
              const edgeVal = e.value ?? e.weight
              return {
                source,
                target,
                ...(edgeVal !== undefined ? { value: edgeVal } : {}),
                label: buildEdgeLabel(e.label),
              }
            })
            .filter((l) => seenNodeIds.has(l.source) && seenNodeIds.has(l.target))
        : []
    } else {
      const srcField = props.xField ?? 'source'
      const tgtField = props.seriesField ?? 'target'
      const edgeRows =
        rows.length > 0
          ? rows
          : rawObj !== null && Array.isArray(rawObj.links ?? rawObj.edges)
            ? normalizeChartRows(rawObj.links ?? rawObj.edges)
            : rows
      const seen = new Set<string>()
      const defaultSymbolSize = Math.round(30 * sizeScale)
      for (const r of edgeRows) {
        const s = sanitizeChartLabel(r[srcField] ?? r.source ?? r.from ?? r.name)
        const t = sanitizeChartLabel(r[tgtField] ?? r.target ?? r.to)
        if (s && !seen.has(s)) {
          seen.add(s)
          nodes.push({ id: s, name: s, symbolSize: defaultSymbolSize })
        }
        if (t && !seen.has(t)) {
          seen.add(t)
          nodes.push({ id: t, name: t, symbolSize: defaultSymbolSize })
        }
        if (s && t) {
          links.push({
            source: s,
            target: t,
            label: buildEdgeLabel(r.label),
          })
        }
      }
    }

    const categories = [
      ...new Set(
        nodes.map((n) => n.category).filter((c): c is string => typeof c === 'string' && c !== ''),
      ),
    ].map((name) => ({ name }))

    const useCircular = nodes.length <= 10
    return {
      tooltip: itemTooltip,
      legend:
        categories.length > 1
          ? legend({
              scroll: isCompact || categories.length >= 4,
              data: categories.map((c) => c.name),
            })
          : undefined,
      series: [
        {
          type: 'graph',
          layout: useCircular ? 'circular' : 'force',
          circular: useCircular ? { rotateLabel: false } : undefined,
          roam: 'move',
          draggable: !useCircular,
          top: useCircular ? 28 : isCompact ? 16 : 12,
          bottom: categories.length > 1 ? (useCircular ? 52 : isCompact ? 42 : 34) : 28,
          left: useCircular ? 46 : isCompact ? 32 : 18,
          right: useCircular ? 46 : isCompact ? 32 : 18,
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: [4, 8],
          force: useCircular
            ? undefined
            : {
                initLayout: 'circular',
                repulsion: isCompact ? 85 : 180,
                edgeLength: isCompact ? [40, 64] : [65, 120],
                gravity: isCompact ? 0.22 : 0.1,
                layoutAnimation: true,
              },
          labelLayout: useCircular && nodes.length <= 5 ? undefined : { hideOverlap: true },
          label: {
            show: true,
            position: isCompact ? 'bottom' : 'right',
            distance: 4,
            color: theme.textPrimary,
            fontSize: isCompact ? 9.5 : 11.5,
            overflow: 'truncate',
            width: isCompact ? 76 : 112,
            textBorderColor: haloColor,
            textBorderWidth: 1.2,
          },
          lineStyle: {
            color: theme.textSecondary,
            width: 1.6,
            curveness: useCircular ? 0.18 : 0.12,
            opacity: dark ? 0.52 : 0.48,
          },
          categories: categories.length > 0 ? categories : undefined,
          data: nodes.map((n, idx) => {
            const catIdx =
              typeof n.category === 'string'
                ? categories.findIndex((c) => c.name === n.category)
                : -1
            let circularLabelPos: 'top' | 'bottom' | undefined
            if (useCircular && nodes.length > 0) {
              const angle = ((idx + 0.5) * Math.PI * 2) / nodes.length
              circularLabelPos = Math.sin(angle) < -0.15 ? 'top' : 'bottom'
            }
            return {
              ...n,
              category: catIdx >= 0 ? catIdx : undefined,
              ...(circularLabelPos ? { label: { position: circularLabelPos } } : {}),
            }
          }),
          links,
        },
      ],
    }
  }

  return null
}
