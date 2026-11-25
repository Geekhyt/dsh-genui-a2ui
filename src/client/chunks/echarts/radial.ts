import type * as echarts from 'echarts/core'
import {
  type ChartBuildContext,
  FILLED_SHAPE_LABEL,
  extractFlowData,
  formatCompactTickNum,
  niceUpperBound,
  sanitizeChartLabel,
  toFiniteNum,
  toNumber,
  truncateByVisualWidth,
} from './shared.ts'

function formatPieTooltip(isCompact: boolean) {
  return (p: unknown) => {
    const rec = p as { name?: unknown; value?: unknown; percent?: unknown }
    const n = sanitizeChartLabel(rec?.name)
    const v = sanitizeChartLabel(rec?.value)
    const pct =
      typeof rec?.percent === 'number' && Number.isFinite(rec.percent) ? ` (${rec.percent}%)` : ''
    return isCompact ? `${n}\n${v}${pct}` : `${n}: ${v}${pct}`
  }
}

function formatPieOuterLabel(maxWidthPx: number) {
  return (p: unknown) => {
    const rec = p as { name?: unknown; percent?: unknown }
    const pct =
      typeof rec?.percent === 'number' && Number.isFinite(rec.percent) ? ` ${rec.percent}%` : ''
    const maxUnits = Math.max(4, Math.floor((maxWidthPx - pct.length * 6.5) / 6.5))
    return `${truncateByVisualWidth(sanitizeChartLabel(rec?.name), maxUnits)}${pct}`
  }
}

export function buildRadialChartOption(ctx: ChartBuildContext): echarts.EChartsCoreOption | null {
  const {
    props,
    dark,
    containerWidth,
    rows,
    theme,
    xKey,
    yKeys,
    primaryY,
    isCompact,
    baseTooltip,
    itemTooltip,
    borderLine,
    chartHeight,
    chartWidth,
    legend,
  } = ctx

  if (props.kind === 'pie' || props.kind === 'funnel') {
    const items = rows.map((r) => ({
      name: sanitizeChartLabel(r[xKey] ?? r.name ?? r.label),
      value: Math.max(0, toNumber(r[primaryY] ?? r.value)),
    }))
    const hideOuterPieLabels = isCompact || items.length > 5
    const estFunnelW = chartWidth(520)
    const estPieH = chartHeight
    const pieOuterLabelW = Math.max(
      58,
      Math.min(96, Math.floor((estFunnelW - Math.min(estFunnelW, estPieH) * 0.62) / 2 - 22)),
    )
    const pieCenterLabelW = isCompact
      ? Math.max(44, Math.min(76, Math.floor(Math.min(estFunnelW, estPieH) * 0.34)))
      : 112
    const funnelUseInside =
      isCompact || (containerWidth !== undefined && containerWidth > 0 && containerWidth < 460)
    const funnelOuterLabelW = Math.max(52, Math.min(96, Math.floor(estFunnelW * 0.15 - 22)))
    const funnelInsideLabelW = Math.max(54, Math.min(120, Math.floor(estFunnelW * 0.88 * 0.36) - 6))
    const funnelBorder = dark ? '#18181b' : '#ffffff'
    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'item',
        formatter: props.kind === 'pie' ? formatPieTooltip(isCompact) : undefined,
      },
      legend: legend({
        scroll: isCompact || items.length >= 4,
        names: items.map((item) => item.name),
      }),
      series: [
        props.kind === 'pie'
          ? hideOuterPieLabels
            ? {
                type: 'pie',
                radius: ['38%', '64%'],
                center: ['50%', '43%'],
                itemStyle: { borderRadius: 6 },
                label: { show: false, position: 'center' },
                labelLine: { show: false },
                emphasis: {
                  scale: true,
                  scaleSize: 4,
                  label: {
                    show: true,
                    fontSize: isCompact ? 11.5 : 13,
                    fontWeight: 600,
                    lineHeight: isCompact ? 15 : 18,
                    color: theme.textPrimary,
                    width: pieCenterLabelW,
                    overflow: 'truncate',
                    formatter: '{b}\n{d}%',
                  },
                },
                data: items,
              }
            : {
                type: 'pie',
                radius: ['38%', '62%'],
                center: ['50%', '43%'],
                avoidLabelOverlap: true,
                itemStyle: { borderRadius: 6 },
                label: {
                  color: theme.textSecondary,
                  fontSize: 11.5,
                  formatter: formatPieOuterLabel(pieOuterLabelW),
                  overflow: 'truncate',
                  width: pieOuterLabelW,
                },
                data: items,
              }
          : {
              type: 'funnel',
              top: 10,
              bottom: isCompact ? 36 : 38,
              left: funnelUseInside ? '6%' : '15%',
              width: funnelUseInside ? '88%' : '70%',
              minSize: funnelUseInside ? '32%' : '18%',
              itemStyle: { borderColor: funnelBorder, borderWidth: 1.5 },
              labelLayout: { hideOverlap: true },
              labelLine: funnelUseInside ? { show: false } : { length: 10 },
              label: funnelUseInside
                ? {
                    position: 'inside',
                    ...FILLED_SHAPE_LABEL,
                    fontSize: isCompact ? 10 : 11,
                    overflow: 'truncate',
                    width: funnelInsideLabelW,
                  }
                : {
                    color: theme.textPrimary,
                    fontSize: 11.5,
                    overflow: 'truncate',
                    width: funnelOuterLabelW,
                  },
              data: items,
            },
      ],
    }
  }

  if (props.kind === 'gauge') {
    const first =
      rows[0] ??
      (typeof props.data === 'object' && props.data !== null && !Array.isArray(props.data)
        ? (props.data as Record<string, unknown>)
        : {})
    const firstKeys = Object.keys(first)
    const explicitGaugeY =
      typeof props.yField === 'string' && props.yField !== '' ? props.yField : undefined
    const gaugeValKey =
      explicitGaugeY ??
      (first.value !== undefined
        ? 'value'
        : first.score !== undefined
          ? 'score'
          : first.percent !== undefined
            ? 'percent'
            : (firstKeys.find(
                (k) => k !== 'max' && k !== 'target' && typeof first[k] === 'number',
              ) ?? primaryY))
    const val = toNumber(first[gaugeValKey] ?? first.value ?? 0)
    const rawMax = first.max ?? first.target
    const parsedMax = rawMax !== undefined ? toNumber(rawMax) : 100
    const baseMax = parsedMax > 0 ? parsedMax : 100
    const gaugeMax = val > baseMax ? niceUpperBound(val * 1.1) : baseMax
    const gaugeMin = val < 0 ? -niceUpperBound(Math.abs(val) * 1.1) : 0
    const gaugeLabelKey =
      props.xField ??
      (typeof first.name === 'string'
        ? 'name'
        : typeof first.label === 'string'
          ? 'label'
          : firstKeys.find(
              (k) =>
                k !== gaugeValKey && k !== 'max' && k !== 'target' && typeof first[k] === 'string',
            ))
    const name = gaugeLabelKey
      ? sanitizeChartLabel(first[gaugeLabelKey])
      : sanitizeChartLabel(props.title ?? '')
    const arcWidth = isCompact ? 9 : 12
    const estGaugeW = chartWidth(480)
    const gaugeSpan = gaugeMax - gaugeMin
    return {
      tooltip: itemTooltip,
      series: [
        {
          type: 'gauge',
          min: gaugeMin,
          max: gaugeMax,
          splitNumber: isCompact ? 5 : 10,
          radius: isCompact ? '86%' : '82%',
          progress: { show: true, width: arcWidth },
          pointer: {
            length: isCompact ? '48%' : '54%',
            width: isCompact ? 4 : 5,
          },
          axisLine: { lineStyle: { width: arcWidth, color: [[1, theme.border]] } },
          axisTick: { distance: 2, length: 4, lineStyle: { color: theme.border } },
          splitLine: {
            distance: 2,
            length: isCompact ? 7 : 9,
            lineStyle: { color: theme.textSecondary, width: 1.2 },
          },
          axisLabel: {
            color: theme.textSecondary,
            fontSize: isCompact ? 9 : 10,
            distance: isCompact ? 12 : 15,
            formatter: (v: number) => formatCompactTickNum(v, gaugeSpan),
          },
          detail: {
            valueAnimation: true,
            fontSize: isCompact ? 14 : 18,
            color: theme.textPrimary,
            offsetCenter: [0, isCompact ? '54%' : '58%'],
            width: Math.max(76, Math.floor(estGaugeW * 0.56)),
            overflow: 'truncate',
            formatter: (v: number) => formatCompactTickNum(v, gaugeSpan),
          },
          title: {
            color: theme.textSecondary,
            fontSize: isCompact ? 10.5 : 12,
            offsetCenter: [0, isCompact ? '86%' : '88%'],
            width: Math.max(96, Math.floor(estGaugeW * 0.7)),
            overflow: 'truncate',
          },
          data: [{ value: val, name }],
        },
      ],
    }
  }

  if (props.kind === 'radar') {
    const groupField = props.seriesField
    const radarAxes = groupField
      ? [...new Set(rows.map((r) => sanitizeChartLabel(r[xKey])))]
      : rows.map((r) => sanitizeChartLabel(r[xKey]))
    const radarSeriesItems: Array<{ name: string; value: number[] }> = groupField
      ? (() => {
          const groups = [...new Set(rows.map((r) => sanitizeChartLabel(r[groupField])))]
          const map = new Map<string, number>()
          for (const r of rows) {
            const g = sanitizeChartLabel(r[groupField])
            const ax = sanitizeChartLabel(r[xKey])
            map.set(`${g}\u0000${ax}`, toNumber(r[primaryY]))
          }
          return groups.map((g) => ({
            name: g,
            value: radarAxes.map((ax) => map.get(`${g}\u0000${ax}`) ?? 0),
          }))
        })()
      : yKeys.map((k) => ({
          name: sanitizeChartLabel(k),
          value: rows.map((r) => toNumber(r[k])),
        }))
    const allRadarVals = radarSeriesItems.flatMap((item) => item.value)
    const rawRadarMax = allRadarVals.length > 0 ? Math.max(...allRadarVals) : 0
    const rawRadarMin = allRadarVals.length > 0 ? Math.min(...allRadarVals) : 0
    const radarCeiling =
      rawRadarMax > 0
        ? rawRadarMax <= 10
          ? Math.ceil(rawRadarMax * 1.15 * 100) / 100
          : Math.ceil(rawRadarMax * 1.15)
        : rawRadarMin < 0
          ? 0
          : 100
    const radarFloor = rawRadarMin < 0 ? Math.floor(rawRadarMin * 1.15) : undefined
    const explicitAxisMax = new Map<string, number>()
    for (const r of rows) {
      const m = toFiniteNum(r.max)
      if (m !== null && m > 0) {
        const ax = sanitizeChartLabel(r[xKey])
        const prev = explicitAxisMax.get(ax) ?? 0
        if (m > prev) explicitAxisMax.set(ax, m)
      }
    }
    const indicator = radarAxes.map((axName, axIdx) => {
      const axisPeak = Math.max(
        ...radarSeriesItems.map((it) => it.value[axIdx] ?? 0),
        radarFloor ?? 0,
      )
      const rowMax = explicitAxisMax.get(axName)
      return {
        name: axName,
        max: rowMax !== undefined && rowMax >= axisPeak ? rowMax : radarCeiling,
        ...(radarFloor !== undefined ? { min: radarFloor } : {}),
      }
    })
    const isUltraNarrow = containerWidth !== undefined && containerWidth > 0 && containerWidth < 300
    const showRadarLegend = radarSeriesItems.length > 1
    const baseRadiusPct = isUltraNarrow ? 0.38 : isCompact ? 0.48 : showRadarLegend ? 0.58 : 0.65
    const radiusPct =
      chartHeight < 210 ? Math.min(baseRadiusPct, isUltraNarrow ? 0.36 : 0.44) : baseRadiusPct
    const estW = chartWidth(520)
    const estH = chartHeight
    const rPx = (Math.min(estW, estH) / 2) * radiusPct
    const sideLabelWidth = Math.max(
      42,
      Math.min(116, Math.floor(estW / 2 - rPx - (isUltraNarrow ? 8 : 12))),
    )
    const fontPx = isUltraNarrow ? 10 : 11

    const formatRadarAxisName = (raw: string): string => {
      const clean = sanitizeChartLabel(raw)
      if (!isCompact && estW >= 540) return clean
      const measurePx = (s: string) => {
        let px = 0
        for (const ch of s) px += (ch.codePointAt(0) ?? 0) > 0xff ? fontPx : fontPx * 0.62
        return px
      }
      if (measurePx(clean) <= sideLabelWidth) return clean
      if (clean.includes(' ')) {
        const words = clean.split(/\s+/).filter(Boolean)
        if (words.length >= 2) {
          let l1 = ''
          let i = 0
          while (i < words.length) {
            const cand = l1 ? `${l1} ${words[i]!}` : words[i]!
            if (l1 && measurePx(cand) > sideLabelWidth) break
            l1 = cand
            i += 1
          }
          const rest = words.slice(i).join(' ')
          if (rest && measurePx(l1) <= sideLabelWidth) {
            const clippedRest =
              measurePx(rest) <= sideLabelWidth
                ? rest
                : truncateByVisualWidth(
                    rest,
                    Math.max(3, Math.floor(sideLabelWidth / (fontPx * 0.62))),
                  )
            return `${l1}\n${clippedRest}`
          }
        }
      }
      const lines: string[] = []
      let cur = ''
      let curPx = 0
      for (const ch of clean) {
        const w = (ch.codePointAt(0) ?? 0) > 0xff ? fontPx : fontPx * 0.62
        if (cur !== '' && curPx + w > sideLabelWidth) {
          if (lines.length >= 1) {
            lines.push(`${cur}…`)
            return lines.join('\n')
          }
          lines.push(cur)
          cur = ch
          curPx = w
        } else {
          cur += ch
          curPx += w
        }
      }
      if (cur !== '') lines.push(cur)
      return lines.join('\n')
    }

    return {
      tooltip: itemTooltip,
      legend: showRadarLegend
        ? legend({
            scroll: isCompact || radarSeriesItems.length >= 4,
            names: radarSeriesItems.map((item) => item.name),
          })
        : undefined,
      radar: {
        center: showRadarLegend ? ['50%', '46%'] : ['50%', '50%'],
        radius: `${Math.round(radiusPct * 100)}%`,
        axisNameGap: isUltraNarrow ? 6 : 12,
        indicator: indicator.length > 0 ? indicator : [{ name: '-', max: 100 }],
        axisName: {
          color: theme.textSecondary,
          fontSize: fontPx,
          lineHeight: 13,
          formatter: formatRadarAxisName,
        },
        axisLine: borderLine,
        splitLine: borderLine,
        splitArea: { show: false },
      },
      series: [
        {
          type: 'radar',
          areaStyle: { opacity: dark ? 0.18 : 0.14 },
          data: radarSeriesItems,
        },
      ],
    }
  }

  if (props.kind === 'rose') {
    const items = rows.map((r) => ({
      name: sanitizeChartLabel(r[xKey] ?? r.name ?? r.label),
      value: Math.max(0, toNumber(r[primaryY] ?? r.value)),
    }))
    const hideLabels = isCompact || items.length > 6
    const estRoseW = chartWidth(520)
    const estRoseH = chartHeight
    const roseOuterLabelW = Math.max(
      58,
      Math.min(90, Math.floor((estRoseW - Math.min(estRoseW, estRoseH) * 0.68) / 2 - 22)),
    )
    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'item',
        formatter: formatPieTooltip(isCompact),
      },
      legend: legend({
        scroll: isCompact || items.length >= 4,
        names: items.map((item) => item.name),
      }),
      series: [
        {
          type: 'pie',
          roseType: 'area',
          radius: isCompact ? ['16%', '64%'] : ['18%', '68%'],
          center: ['50%', '43%'],
          itemStyle: { borderRadius: 5 },
          label: hideLabels
            ? { show: false }
            : {
                color: theme.textSecondary,
                fontSize: 11,
                formatter: formatPieOuterLabel(roseOuterLabelW),
                overflow: 'truncate',
                width: roseOuterLabelW,
              },
          labelLine: hideLabels ? { show: false } : { length: 8, length2: 8 },
          data: items,
        },
      ],
    }
  }

  if (props.kind === 'radialBar') {
    const items = rows.map((r, idx) => ({
      name: sanitizeChartLabel(r[xKey] ?? r.name ?? r.label ?? `#${idx + 1}`),
      value: Math.max(0, toNumber(r[primaryY] ?? r.value)),
      max: r.max !== undefined && r.max !== null ? toNumber(r.max) : 0,
    }))
    const hasExplicitMax = items.some((it) => it.max > 0)
    const rawDataMax = Math.max(...items.map((it) => Math.max(it.value, it.max)), 0)
    const maxVal = hasExplicitMax
      ? rawDataMax
      : rawDataMax > 10 && rawDataMax <= 100
        ? 100
        : niceUpperBound(Math.max(rawDataMax, 1))
    const radialCategories = items.map((it) => it.name)
    const trackBg = dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.07)'
    const denseRadial = items.length >= 6
    const useLegendMode = denseRadial
    const radialFitW = Math.floor(
      (Math.min(chartWidth(520), chartHeight) * 0.28) / Math.max(1, items.length),
    )
    const radialBarW = Math.max(
      3.5,
      Math.min(
        isCompact ? 10 : 12,
        radialFitW,
        Math.floor((isCompact ? (denseRadial ? 42 : 46) : 64) / Math.max(1, items.length)),
      ),
    )
    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'item',
        formatter: (p: unknown) => {
          const rec = p as { name?: string; seriesName?: string; value?: number }
          const labelName = sanitizeChartLabel(rec.name || rec.seriesName)
          const pct = maxVal > 0 ? Math.round(((rec.value ?? 0) / maxVal) * 100) : 0
          return `${labelName}: ${rec.value ?? 0} (${pct}%)`
        },
      },
      legend: useLegendMode
        ? legend({
            scroll: true,
            bottom: 0,
            fontSize: isCompact ? 10 : 11,
            names: radialCategories,
            data: radialCategories,
          })
        : undefined,
      polar: {
        radius: useLegendMode
          ? isCompact
            ? ['14%', '74%']
            : ['16%', '78%']
          : isCompact
            ? ['24%', '78%']
            : ['26%', '84%'],
        center: useLegendMode ? ['50%', '43%'] : isCompact ? ['56%', '52%'] : ['54%', '52%'],
      },
      angleAxis: {
        max: maxVal,
        startAngle: 90,
        endAngle: -180,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      radiusAxis: {
        type: 'category',
        data: radialCategories,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          show: !useLegendMode,
          color: theme.textSecondary,
          fontSize: isCompact ? (denseRadial ? 8.5 : items.length >= 5 ? 9 : 9.5) : 10.5,
          ...(denseRadial ? { hideOverlap: true } : { interval: 0 }),
          align: 'right',
          margin: isCompact ? 9 : 12,
          width: isCompact ? 68 : 96,
          overflow: 'truncate',
        },
      },
      series: useLegendMode
        ? items.map((it, idx) => ({
            name: it.name,
            type: 'bar' as const,
            coordinateSystem: 'polar' as const,
            stack: 'radial',
            roundCap: true,
            showBackground: idx === 0,
            backgroundStyle: { color: trackBg },
            barWidth: radialBarW,
            itemStyle: { color: theme.colors[idx % theme.colors.length] },
            data: items.map((_, j) => (j === idx ? { name: it.name, value: it.value } : '-')),
          }))
        : [
            {
              type: 'bar',
              coordinateSystem: 'polar',
              roundCap: true,
              showBackground: true,
              backgroundStyle: { color: trackBg },
              barWidth: radialBarW,
              data: items.map((it, idx) => ({
                name: it.name,
                value: it.value,
                itemStyle: { color: theme.colors[idx % theme.colors.length] },
              })),
            },
          ],
    }
  }

  if (props.kind === 'chord') {
    const srcField = props.xField ?? 'source'
    const tgtField = props.seriesField ?? 'target'
    const valField =
      typeof props.yField === 'string' && props.yField !== '' ? props.yField : 'value'
    const { nodeNames, links } = extractFlowData(
      props.data,
      rows,
      srcField,
      tgtField,
      valField,
      'weight',
      1,
      true,
    )
    const nodes = [...nodeNames].map((name, idx) => ({
      name,
      itemStyle: { color: theme.colors[idx % theme.colors.length] },
    }))
    const estChordW = chartWidth(540)
    const estChordH = chartHeight
    const chordOuterRatio = isCompact ? 0.54 : estChordW < 460 ? 0.56 : 0.65
    const chordInnerRatio = chordOuterRatio - 0.08
    const chordLabelW = Math.max(
      44,
      Math.min(
        92,
        Math.floor(estChordW / 2 - (Math.min(estChordW, estChordH) / 2) * chordOuterRatio - 10),
      ),
    )
    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'item',
        formatter: (p: unknown) => {
          const rec = p as {
            dataType?: string
            name?: string
            value?: unknown
            data?: { source?: string; target?: string; value?: number }
          }
          if (rec.dataType === 'edge' && rec.data) {
            return `${sanitizeChartLabel(rec.data.source)} → ${sanitizeChartLabel(rec.data.target)}: ${rec.data.value ?? 0}`
          }
          const name = sanitizeChartLabel(rec.name)
          const v = rec.value
          return typeof v === 'number' && Number.isFinite(v) ? `${name}: ${v}` : name
        },
      },
      series: [
        {
          type: 'chord',
          clockwise: true,
          radius: [
            `${Math.round(chordInnerRatio * 100)}%`,
            `${Math.round(chordOuterRatio * 100)}%`,
          ],
          center: ['50%', '50%'],
          padAngle: 2,
          labelLayout: { hideOverlap: true },
          label: {
            show: true,
            color: theme.textPrimary,
            fontSize: isCompact ? 9.5 : 11,
            width: chordLabelW,
            overflow: 'truncate',
          },
          lineStyle: {
            color: 'source',
            opacity: dark ? 0.42 : 0.36,
          },
          emphasis: { focus: 'adjacency' },
          data: nodes,
          links,
        },
      ],
    }
  }

  return null
}
