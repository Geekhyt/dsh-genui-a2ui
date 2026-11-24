import type * as echarts from 'echarts/core'
import {
  type ChartBuildContext,
  canUseLogScale,
  computeRefAxisBounds,
  niceUpperBound,
  pickMarkLinePosition,
  pickVerticalMarkLineAlign,
  resolveYRange,
  sanitizeChartLabel,
  toNumber,
} from './shared.ts'

export function buildCartesianCoreChartOption(ctx: ChartBuildContext): echarts.EChartsCoreOption {
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
    axisTooltip,
    borderLine,
    dashedLine,
    axisLabelBase,
    chartWidth,
    valAxis,
    refLine: buildRefLine,
    markArea,
    zoom,
    legend,
  } = ctx

  if (props.kind === 'combo') {
    const categories = [...new Set(rows.map((r) => sanitizeChartLabel(r[xKey])))]
    const explicitY2 =
      typeof props.y2Field === 'string' && props.y2Field !== ''
        ? [props.y2Field]
        : Array.isArray(props.y2Field) && props.y2Field.length > 0
          ? props.y2Field
          : null

    let barKeys: string[]
    let lineKeys: string[]
    if (explicitY2) {
      lineKeys = explicitY2
      const filteredBars = yKeys.filter((k) => !lineKeys.includes(k))
      barKeys = filteredBars.length > 0 ? filteredBars : yKeys.slice(0, 1)
    } else if (yKeys.length >= 2) {
      barKeys = [yKeys[0]!]
      lineKeys = yKeys.slice(1)
    } else {
      const scanLimit = Math.min(rows.length, 16)
      const extraSet = new Set<string>()
      for (let i = 0; i < scanLimit; i++) {
        for (const [k, v] of Object.entries(rows[i]!)) {
          if (k !== xKey && !yKeys.includes(k) && typeof v === 'number' && Number.isFinite(v)) {
            extraSet.add(k)
          }
        }
      }
      barKeys = yKeys
      lineKeys = [...extraSet].slice(0, 1)
    }

    const alignSeriesByCategory = (fieldKey: string, allowNull = false): Array<number | null> => {
      if (categories.length === rows.length) {
        return rows.map((r) => {
          const raw = r[fieldKey]
          if (allowNull && (raw === null || raw === undefined || raw === '')) return null
          return toNumber(raw)
        })
      }
      const sums = new Map<string, number>()
      const counts = new Map<string, number>()
      for (const r of rows) {
        const raw = r[fieldKey]
        if (allowNull && (raw === null || raw === undefined || raw === '')) continue
        const cat = sanitizeChartLabel(r[xKey])
        sums.set(cat, (sums.get(cat) ?? 0) + toNumber(raw))
        counts.set(cat, (counts.get(cat) ?? 0) + 1)
      }
      return categories.map((cat) => {
        if (!sums.has(cat)) return allowNull ? null : 0
        const c = counts.get(cat) ?? 1
        return allowNull ? Number((sums.get(cat)! / c).toFixed(4)) : sums.get(cat)!
      })
    }

    const barDataList = barKeys.map((k) => alignSeriesByCategory(k, false) as number[])
    const lineDataList = lineKeys.map((k) => alignSeriesByCategory(k, true))
    const refEdgeSeries =
      lineDataList.length > 0
        ? (lineDataList[0] ?? []).map((v) => v ?? 0)
        : props.stacked
          ? categories.map((_, i) => barDataList.reduce((acc, arr) => acc + (arr[i] ?? 0), 0))
          : (barDataList[0] ?? [])
    const stackKey = props.stacked ? 'comboBar' : undefined
    const barFill = dark ? 'rgba(96, 165, 250, 0.40)' : 'rgba(37, 99, 235, 0.26)'

    const stackedComboVals = props.stacked
      ? [
          ...categories.map((_, i) =>
            barDataList.reduce((acc, arr) => acc + Math.max(arr[i] ?? 0, 0), 0),
          ),
          ...categories.map((_, i) =>
            barDataList.reduce((acc, arr) => acc + Math.min(arr[i] ?? 0, 0), 0),
          ),
        ]
      : barDataList.flat()
    const comboUseLog = !props.stacked && canUseLogScale(props.yScale, stackedComboVals)
    const comboMarkPos = pickMarkLinePosition(
      refEdgeSeries.slice(0, Math.min(2, refEdgeSeries.length)),
      refEdgeSeries.slice(Math.max(0, refEdgeSeries.length - 2)),
      props.referenceLine,
    )
    const comboRefValue =
      lineKeys.length === 0 &&
      comboUseLog &&
      props.referenceLine !== undefined &&
      props.referenceLine <= 0
        ? undefined
        : props.referenceLine
    const refLine = buildRefLine(theme.danger, comboMarkPos, comboRefValue)

    const barSeries = barKeys.map((k, idx) => {
      const rawArr = barDataList[idx] ?? []
      const hasNegBar = !comboUseLog && rawArr.some((v) => v < 0)
      return {
        name: sanitizeChartLabel(k),
        type: 'bar' as const,
        yAxisIndex: 0,
        stack: stackKey,
        barMaxWidth: isCompact ? 20 : 28,
        itemStyle:
          barKeys.length === 1
            ? {
                color: barFill,
                borderColor: theme.brand,
                borderWidth: 1,
                borderRadius: [4, 4, 0, 0],
              }
            : {
                color: theme.colors[idx % theme.colors.length],
                borderRadius: [4, 4, 0, 0],
              },
        markLine: lineKeys.length === 0 && idx === 0 ? refLine : undefined,
        data: comboUseLog
          ? rawArr.map((v) => (v > 0 ? v : null))
          : hasNegBar
            ? rawArr.map((v) =>
                v < 0 ? { value: v, itemStyle: { borderRadius: [0, 0, 4, 4] } } : v,
              )
            : rawArr,
      }
    })

    const lineVals = lineDataList.flat().filter((v): v is number => typeof v === 'number')
    const leftBounds =
      lineKeys.length === 0 && !comboUseLog
        ? computeRefAxisBounds(stackedComboVals, props.referenceLine)
        : {}
    const rightBounds =
      lineKeys.length > 0 ? computeRefAxisBounds(lineVals, props.referenceLine) : {}
    const comboMarkArea = markArea(
      0,
      lineKeys.length > 0
        ? resolveYRange(lineVals, rightBounds)
        : resolveYRange(stackedComboVals, leftBounds),
    )
    const comboStep = props.step ? ('end' as const) : false
    const barKeySet = new Set(barKeys)
    const lineColorStart = barKeys.length === 1 ? 3 : barKeys.length
    const lineSeries = lineKeys.map((k, idx) => {
      const col = theme.colors[(lineColorStart + idx) % theme.colors.length]!
      const label = sanitizeChartLabel(k)
      return {
        name: barKeySet.has(k) ? `${label} (2)` : label,
        type: 'line' as const,
        yAxisIndex: 1,
        smooth: !comboStep,
        ...(comboStep ? { step: comboStep } : {}),
        symbol: 'circle',
        symbolSize: isCompact ? 5 : 6,
        lineStyle: { color: col, width: isCompact ? 2 : 2.4 },
        itemStyle: { color: col },
        markLine: idx === 0 ? refLine : undefined,
        markArea: idx === 0 ? comboMarkArea : undefined,
        data: lineDataList[idx] ?? [],
      }
    })
    if (lineKeys.length === 0 && barSeries[0] && comboMarkArea) {
      ;(barSeries[0] as Record<string, unknown>).markArea = comboMarkArea
    }

    const totalSeriesCount = barSeries.length + lineSeries.length

    const zoomCfg = zoom()
    const legendBottom = props.zoom ? (isCompact ? 26 : 24) : 0
    const leftYAxis = {
      type: comboUseLog ? ('log' as const) : ('value' as const),
      ...leftBounds,
      splitNumber: isCompact ? 3 : undefined,
      splitLine: dashedLine,
      axisLabel: {
        ...axisLabelBase,
      },
    }
    const rightYAxis = {
      type: 'value' as const,
      ...rightBounds,
      splitNumber: isCompact ? 3 : undefined,
      splitLine: { show: false },
      axisLabel: {
        ...axisLabelBase,
      },
    }
    return {
      tooltip: axisTooltip,
      legend: legend({
        scroll: isCompact || totalSeriesCount >= 4,
        bottom: legendBottom,
        itemWidth: isCompact ? 10 : 12,
        fontSize: isCompact ? 10.5 : 11.5,
        names: [...barSeries.map((s) => s.name), ...lineSeries.map((s) => s.name)],
      }),
      dataZoom: zoomCfg,
      grid: {
        top: 20,
        right: isCompact ? 8 : 16,
        bottom: (isCompact ? 36 : 34) + legendBottom,
        left: isCompact ? 6 : 12,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisTick: { show: false },
        axisLabel: {
          ...axisLabelBase,
          ...(isCompact
            ? {
                width: Math.max(
                  38,
                  Math.floor(
                    ((containerWidth ?? 276) - 44) / Math.min(6, Math.max(2, categories.length)),
                  ),
                ),
                overflow: 'truncate' as const,
                ellipsis: '…',
              }
            : {}),
        },
      },
      yAxis: lineKeys.length > 0 ? [leftYAxis, rightYAxis] : [leftYAxis],
      series: [...barSeries, ...lineSeries],
    }
  }

  const categories = [...new Set(rows.map((r) => sanitizeChartLabel(r[xKey])))]
  const echartsType = props.kind === 'bar' ? 'bar' : 'line'
  const isArea = props.kind === 'area'
  const isHorizontal = props.kind === 'bar' && Boolean(props.horizontal)
  const isPercentStack = props.stackMode === 'percent'
  const isStacked = Boolean(props.stacked) || isPercentStack
  const stackKey = isStacked ? 'total' : undefined
  const lineStep = echartsType === 'line' && props.step ? ('end' as const) : false
  const barRadius = isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]
  const negBarRadius = isHorizontal ? [4, 0, 0, 4] : [0, 0, 4, 4]
  const formatBarData = (vals: readonly (number | null)[]) => {
    if (props.kind !== 'bar' || !vals.some((v) => typeof v === 'number' && v < 0)) {
      return [...vals]
    }
    return vals.map((v) =>
      typeof v === 'number' && v < 0 ? { value: v, itemStyle: { borderRadius: negBarRadius } } : v,
    )
  }

  let rawSeriesVals: Array<{ readonly name: string; readonly vals: Array<number | null> }>
  if (props.seriesField) {
    const groupField = props.seriesField
    const groups = [...new Set(rows.map((r) => sanitizeChartLabel(r[groupField])))]
    const groupedSums = new Map<string, number>()
    for (const r of rows) {
      const cat = sanitizeChartLabel(r[xKey])
      const grp = sanitizeChartLabel(r[groupField])
      const rawVal = r[primaryY]
      if (rawVal === undefined || rawVal === null || rawVal === '') continue
      const key = `${grp}\u0000${cat}`
      groupedSums.set(key, (groupedSums.get(key) ?? 0) + toNumber(rawVal))
    }
    const missingVal = echartsType === 'line' ? null : 0
    rawSeriesVals = groups.map((group) => ({
      name: group,
      vals: categories.map((cat) => {
        const key = `${group}\u0000${cat}`
        return groupedSums.has(key) ? groupedSums.get(key)! : missingVal
      }),
    }))
  } else {
    const missingVal = echartsType === 'line' ? null : 0
    rawSeriesVals = yKeys.map((k) => {
      let dataValues: Array<number | null>
      if (categories.length === rows.length) {
        dataValues = rows.map((r) => {
          const rawV = r[k]
          return rawV === undefined || rawV === null || rawV === '' ? missingVal : toNumber(rawV)
        })
      } else {
        const sums = new Map<string, number>()
        for (const r of rows) {
          const rawV = r[k]
          if (rawV === undefined || rawV === null || rawV === '') continue
          const cat = sanitizeChartLabel(r[xKey])
          sums.set(cat, (sums.get(cat) ?? 0) + toNumber(rawV))
        }
        dataValues = categories.map((cat) => (sums.has(cat) ? sums.get(cat)! : missingVal))
      }
      return { name: sanitizeChartLabel(k), vals: dataValues }
    })
  }

  const categoryTotals = isPercentStack
    ? categories.map((_, cIdx) =>
        rawSeriesVals.reduce((sum, s) => sum + Math.abs(s.vals[cIdx] ?? 0), 0),
      )
    : []
  const hasSignedPercentStack =
    isPercentStack && rawSeriesVals.some((s) => s.vals.some((v) => typeof v === 'number' && v < 0))

  const allRawNums = rawSeriesVals.flatMap((s) =>
    s.vals.filter((v): v is number => typeof v === 'number'),
  )
  const useLogAxis = !isPercentStack && !isStacked && canUseLogScale(props.yScale, allRawNums)

  const series: Record<string, unknown>[] = rawSeriesVals.map((item) => {
    const plottedVals = isPercentStack
      ? item.vals.map((v, cIdx) => {
          const tot = categoryTotals[cIdx] ?? 0
          if (v === null || tot <= 0) return echartsType === 'line' ? null : 0
          return Number((((hasSignedPercentStack ? v : Math.abs(v)) / tot) * 100).toFixed(1))
        })
      : useLogAxis
        ? item.vals.map((v) => (typeof v === 'number' && v > 0 ? v : null))
        : item.vals
    return {
      name: item.name,
      type: echartsType,
      smooth: echartsType === 'line' && !lineStep,
      ...(echartsType === 'line' ? { symbol: 'circle', symbolSize: isCompact ? 5 : 6 } : {}),
      ...(lineStep ? { step: lineStep } : {}),
      stack: stackKey,
      areaStyle: isArea ? { opacity: 0.2 } : undefined,
      barMaxWidth: 32,
      itemStyle: props.kind === 'bar' ? { borderRadius: barRadius } : undefined,
      data: formatBarData(plottedVals),
    }
  })

  const extractDatumNum = (raw: unknown): number => {
    if (typeof raw === 'object' && raw !== null && 'value' in raw) {
      return toNumber((raw as { value: unknown }).value)
    }
    return toNumber(raw)
  }

  const stackedPosSums = isStacked
    ? categories.map((_, cIdx) =>
        series.reduce((sum, s) => {
          const v = extractDatumNum((s.data as unknown[])[cIdx])
          return v > 0 ? sum + v : sum
        }, 0),
      )
    : []
  const stackedNegSums = isStacked
    ? categories.map((_, cIdx) =>
        series.reduce((sum, s) => {
          const v = extractDatumNum((s.data as unknown[])[cIdx])
          return v < 0 ? sum + v : sum
        }, 0),
      )
    : []
  const effectiveCartRef =
    useLogAxis && props.referenceLine !== undefined && props.referenceLine <= 0
      ? undefined
      : props.referenceLine
  const isNegRefLine =
    effectiveCartRef !== undefined && Number.isFinite(effectiveCartRef) && effectiveCartRef < 0
  const cartesianEdgeVals = isStacked
    ? isNegRefLine
      ? stackedNegSums
      : stackedPosSums
    : categories.map((_, cIdx) => {
        const colVals = series.map((s) => extractDatumNum((s.data as unknown[])[cIdx]))
        return isNegRefLine ? Math.min(...colVals) : Math.max(...colVals)
      })
  const cartesianVals = isStacked
    ? [...stackedPosSums, ...stackedNegSums]
    : series.flatMap((s) => (s.data as unknown[]).map(extractDatumNum))
  const cartesianBounds = isPercentStack
    ? hasSignedPercentStack
      ? {
          min: Math.max(-100, -niceUpperBound(Math.max(10, ...stackedNegSums.map(Math.abs)))),
          max: Math.min(100, niceUpperBound(Math.max(10, ...stackedPosSums))),
        }
      : {
          min: 0,
          max:
            effectiveCartRef !== undefined && effectiveCartRef >= 95
              ? Math.max(105, Math.ceil(effectiveCartRef * 1.08))
              : Math.max(100, Math.ceil(Math.max(...stackedPosSums, 100))),
        }
    : useLogAxis
      ? {}
      : computeRefAxisBounds(cartesianVals, effectiveCartRef)
  const cartMarkPos = isHorizontal
    ? 'insideEndTop'
    : pickMarkLinePosition(
        cartesianEdgeVals.slice(0, Math.min(2, cartesianEdgeVals.length)),
        cartesianEdgeVals.slice(Math.max(0, cartesianEdgeVals.length - 2)),
        effectiveCartRef,
      )
  const cartHAlign =
    isHorizontal && effectiveCartRef !== undefined
      ? pickVerticalMarkLineAlign(
          effectiveCartRef,
          cartesianBounds.min ?? Math.min(0, ...cartesianVals),
          cartesianBounds.max ?? Math.max(...cartesianVals, effectiveCartRef, 1),
        )
      : undefined
  const refLine = buildRefLine(
    theme.danger,
    cartMarkPos,
    effectiveCartRef,
    props.referenceLabel,
    isHorizontal,
    cartHAlign,
  )
  const cartMarkArea = markArea(
    0,
    isHorizontal ? undefined : resolveYRange(cartesianVals, cartesianBounds),
  )
  if (series[0] && refLine) {
    series[0].markLine = refLine
  }
  if (series[0] && cartMarkArea) {
    series[0].markArea = cartMarkArea
  }

  const showLegend = series.length > 1
  const estCartW = chartWidth(560)
  const maxHBarLabelW = isCompact
    ? Math.min(92, Math.floor(estCartW * 0.35))
    : Math.min(168, Math.floor(estCartW * 0.34))
  const maxVBarLabelW = isCompact
    ? Math.max(40, Math.floor((estCartW - 44) / Math.min(6, Math.max(2, categories.length))))
    : undefined
  const categoryAxis = {
    type: 'category' as const,
    data: categories,
    inverse: isHorizontal ? true : undefined,
    axisLine: borderLine,
    axisLabel: isHorizontal
      ? {
          color: theme.textSecondary,
          fontSize: isCompact ? 10 : 11,
          hideOverlap: true,
          width: maxHBarLabelW,
          overflow: 'truncate' as const,
          ellipsis: '…',
        }
      : {
          color: theme.textSecondary,
          fontSize: isCompact ? 10 : 11,
          hideOverlap: true,
          ...(maxVBarLabelW !== undefined
            ? { width: maxVBarLabelW, overflow: 'truncate' as const, ellipsis: '…' }
            : {}),
        },
  }
  const valueAxis = valAxis({
    type: useLogAxis ? ('log' as const) : ('value' as const),
    ...cartesianBounds,
    axisLabel: {
      ...axisLabelBase,
      ...(isPercentStack ? { formatter: '{value}%' } : {}),
    },
  })
  const zoomCfg = zoom(isHorizontal)

  return {
    tooltip: {
      ...baseTooltip,
      trigger: 'axis',
      ...(isPercentStack
        ? {
            formatter: (params: unknown) => {
              const list = (Array.isArray(params) ? params : [params]) as Array<{
                dataIndex?: number
                seriesIndex?: number
                seriesName?: string
              }>
              const first = list[0]
              const idx = first?.dataIndex ?? -1
              if (idx < 0 || idx >= categories.length) return ''
              const lines = [categories[idx] ?? '']
              const tot = categoryTotals[idx] ?? 0
              for (const item of list) {
                const sIdx = typeof item.seriesIndex === 'number' ? item.seriesIndex : -1
                const s = sIdx >= 0 ? rawSeriesVals[sIdx] : undefined
                if (!s) continue
                const rawV = s.vals[idx]
                if (rawV === null || rawV === undefined) {
                  lines.push(`${s.name}: —`)
                } else {
                  const pct =
                    tot > 0
                      ? (((hasSignedPercentStack ? rawV : Math.abs(rawV)) / tot) * 100).toFixed(1)
                      : '0.0'
                  lines.push(`${s.name}: ${pct}% (${rawV})`)
                }
              }
              return lines.join('\n')
            },
          }
        : {}),
    },
    legend: showLegend
      ? legend({
          scroll: isCompact || series.length >= 4,
          bottom: props.zoom && !isHorizontal ? 28 : 0,
          fontSize: 11.5,
          names: series.map((s) => String(s.name ?? '')),
        })
      : undefined,
    dataZoom: zoomCfg,
    grid: {
      top: isHorizontal && props.referenceLine !== undefined ? 26 : 16,
      right: isHorizontal && props.zoom ? 34 : 18,
      bottom: (showLegend ? 32 : 12) + (props.zoom && !isHorizontal ? 28 : 0),
      left: isHorizontal && isCompact ? 6 : 12,
      containLabel: true,
    },
    xAxis: isHorizontal ? valueAxis : categoryAxis,
    yAxis: isHorizontal ? categoryAxis : valueAxis,
    series,
  }
}
