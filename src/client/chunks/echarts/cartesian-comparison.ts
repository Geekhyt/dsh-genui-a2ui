import type * as echarts from 'echarts/core'
import {
  type ChartBuildContext,
  FILLED_SHAPE_LABEL,
  ZOOM_LEGEND_BOTTOM,
  computeEvenAxisInterval,
  computeRefAxisBounds,
  formatCompactTickNum,
  niceUpperBound,
  pickMarkLinePosition,
  sanitizeChartLabel,
  toNumber,
  visualWidthOf,
} from './shared.ts'

export function buildComparisonChartOption(
  ctx: ChartBuildContext,
): echarts.EChartsCoreOption | null {
  const {
    props,
    dark,
    rows,
    theme,
    xKey,
    yKeys,
    primaryY,
    isCompact,
    baseTooltip,
    borderLine,
    dashedLine,
    axisLabelBase,
    msg,
    chartHeight,
    chartWidth,
    compactCatLabel,
    valAxis,
    refLine: buildRefLine,
    zoom,
    legend,
  } = ctx

  if (props.kind === 'waterfall') {
    const localeMsg = msg
    const valField =
      (typeof props.yField === 'string' && props.yField !== '' ? props.yField : undefined) ??
      primaryY
    const categories = rows.map((r) => sanitizeChartLabel(r[xKey] ?? r.step ?? r.name ?? r.label))

    let running = 0
    const peaks: number[] = [0]
    const stepDeltas: number[] = []
    const isTotalFlags: boolean[] = []
    const baseData: number[] = []
    const baseNegData: number[] = []
    const totalData: Array<number | '-'> = []
    const incData: Array<number | '-'> = []
    const incNegData: Array<number | '-'> = []
    const decData: Array<number | '-'> = []
    const decNegData: Array<number | '-'> = []
    let hasNegativeRegion = false

    for (const r of rows) {
      const rawVal = r[valField] ?? r.delta ?? r.value ?? r.amount
      const isTotal =
        Boolean(r.total ?? r.isTotal ?? r.summary) || r.type === 'total' || r.kind === 'total'
      const val =
        isTotal && (rawVal === undefined || rawVal === null || rawVal === '')
          ? running
          : toNumber(rawVal)
      stepDeltas.push(val)
      isTotalFlags.push(isTotal)
      if (isTotal) {
        baseData.push(0)
        baseNegData.push(0)
        totalData.push(val)
        incData.push('-')
        incNegData.push('-')
        decData.push('-')
        decNegData.push('-')
        running = val
        peaks.push(running)
        if (val < 0) hasNegativeRegion = true
      } else if (val >= 0) {
        const prev = running
        const next = running + val
        running = next
        peaks.push(prev, next)
        totalData.push('-')
        decData.push('-')
        decNegData.push('-')
        if (prev >= 0) {
          baseData.push(prev)
          baseNegData.push(0)
          incData.push(val)
          incNegData.push('-')
        } else if (next <= 0) {
          hasNegativeRegion = true
          baseData.push(0)
          baseNegData.push(next)
          incData.push('-')
          incNegData.push(-val)
        } else {
          hasNegativeRegion = true
          baseData.push(0)
          baseNegData.push(0)
          incData.push(next)
          incNegData.push(prev)
        }
      } else {
        const prev = running
        const next = running + val
        running = next
        peaks.push(prev, next)
        totalData.push('-')
        incData.push('-')
        incNegData.push('-')
        if (prev >= 0 && next >= 0) {
          baseData.push(next)
          baseNegData.push(0)
          decData.push(Math.abs(val))
          decNegData.push('-')
        } else if (prev <= 0 && next <= 0) {
          hasNegativeRegion = true
          baseData.push(0)
          baseNegData.push(prev)
          decData.push('-')
          decNegData.push(val)
        } else {
          hasNegativeRegion = true
          baseData.push(0)
          baseNegData.push(0)
          decData.push(prev)
          decNegData.push(next)
        }
      }
    }

    const zoomCfg = zoom()
    const wfIsNegRef =
      props.referenceLine !== undefined &&
      Number.isFinite(props.referenceLine) &&
      props.referenceLine < 0
    const stepEdgeVals = baseData.map((b, i) => {
      const tot = totalData[i]
      if (typeof tot === 'number') return tot
      if (wfIsNegRef) {
        const negB = baseNegData[i] ?? 0
        const decN = decNegData[i]
        const incN = incNegData[i]
        if (typeof decN === 'number') return negB + decN
        if (typeof incN === 'number') return negB + incN
      }
      const inc = incData[i]
      const dec = decData[i]
      if (typeof inc === 'number') return b + inc
      if (typeof dec === 'number') return b + dec
      return b
    })
    const leftEdge = stepEdgeVals.slice(0, Math.min(2, stepEdgeVals.length))
    const rightEdge = stepEdgeVals.slice(Math.max(0, stepEdgeVals.length - 2))
    const wfMarkPos = pickMarkLinePosition(leftEdge, rightEdge, props.referenceLine)
    const refLine = buildRefLine(theme.warn, wfMarkPos)
    const refBounds = computeRefAxisBounds(peaks, props.referenceLine)
    const minPeak = Math.min(0, ...peaks)
    const negHeadroomMin = minPeak < 0 ? -niceUpperBound(Math.abs(minPeak) * 1.24) : undefined
    const bounds = {
      ...refBounds,
      ...(negHeadroomMin !== undefined
        ? {
            min:
              refBounds.min !== undefined
                ? Math.min(refBounds.min, negHeadroomMin)
                : negHeadroomMin,
          }
        : {}),
    }
    const hasTotal = totalData.some((v) => v !== '-')
    const showBarLabels = rows.length <= 8
    const barLabelFontSize = isCompact ? 9.5 : 10.5

    const refVal =
      props.referenceLine !== undefined && Number.isFinite(props.referenceLine)
        ? props.referenceLine
        : undefined
    const yMaxEst = bounds.max ?? niceUpperBound(Math.max(...peaks, refVal ?? 0, 1))
    const yMinEst = bounds.min ?? Math.min(0, ...peaks)
    const ySpan = Math.max(1e-9, yMaxEst - yMinEst)
    const refText =
      props.referenceLabel !== undefined && props.referenceLabel.trim() !== ''
        ? sanitizeChartLabel(props.referenceLabel)
        : refVal !== undefined
          ? String(refVal)
          : ''
    const estW = chartWidth(520)
    const barSlotW = Math.max(22, (estW - 56) / Math.max(1, rows.length))
    const estBarW = Math.min(34, barSlotW * 0.62)
    const estPillW = Math.max(48, 18 + visualWidthOf(refText) * 6.2)
    const pillSpanBars = Math.min(rows.length, Math.max(2, Math.ceil(estPillW / barSlotW)))

    const overlapsRefBand = (idx: number, low: number, high: number): boolean => {
      if (refVal === undefined) return false
      const lineLow = refVal - ySpan * 0.035
      const lineHigh = refVal + ySpan * 0.035
      if (high >= lineLow && low <= lineHigh) return true
      const inPillX =
        wfMarkPos === 'insideStartTop'
          ? idx < pillSpanBars
          : idx >= Math.max(0, rows.length - pillSpanBars)
      if (!inPillX) return false
      const pillLow = refVal - ySpan * 0.02
      const pillHigh = refVal + ySpan * 0.14
      return high >= pillLow && low <= pillHigh
    }

    const fitsInsideBar = (labelText: string, barHeight: number): boolean => {
      const estLabelPx = labelText.length * barLabelFontSize * 0.62
      return barHeight >= ySpan * 0.1 && estBarW >= estLabelPx + 4
    }

    const insideHaloLabel = {
      position: 'inside' as const,
      ...FILLED_SHAPE_LABEL,
    }

    const hasPosTotal = totalData.some((v) => typeof v === 'number' && v >= 0)
    const hasNegTotal = totalData.some((v) => typeof v === 'number' && v < 0)
    const allTotalsNeg = hasNegTotal && !hasPosTotal

    const totalItems = totalData.map((val, i) => {
      if (typeof val !== 'number') return val
      if (val < 0) {
        if (showBarLabels && overlapsRefBand(i, val - ySpan * 0.085, val)) {
          if (fitsInsideBar(String(val), Math.abs(val))) {
            return {
              value: val,
              itemStyle: { color: theme.brand, borderRadius: [0, 0, 4, 4] },
              label: insideHaloLabel,
            }
          }
        }
        if (allTotalsNeg) return val
        return {
          value: val,
          itemStyle: { color: theme.brand, borderRadius: [0, 0, 4, 4] },
          label: { position: 'bottom' as const },
        }
      }
      if (showBarLabels && overlapsRefBand(i, val, val + ySpan * 0.085)) {
        if (fitsInsideBar(String(val), Math.abs(val))) {
          return { value: val, label: insideHaloLabel }
        }
      }
      return val
    })

    const incItems = incData.map((val, i) => {
      if (typeof val !== 'number') return val
      const crossesZero = typeof incNegData[i] === 'number'
      const bottom = baseData[i] ?? 0
      const top = bottom + val
      const text = `+${Math.abs(stepDeltas[i] ?? val)}`
      const styleOverride = crossesZero
        ? { itemStyle: { color: theme.success, borderRadius: [4, 4, 0, 0] } }
        : {}
      if (showBarLabels && overlapsRefBand(i, top, top + ySpan * 0.085)) {
        const mid = bottom + val / 2
        if (
          fitsInsideBar(text, val) &&
          !overlapsRefBand(i, mid - ySpan * 0.04, mid + ySpan * 0.04)
        ) {
          return { value: val, ...styleOverride, label: insideHaloLabel }
        }
        if (!crossesZero && !overlapsRefBand(i, bottom - ySpan * 0.085, bottom - ySpan * 0.015)) {
          return { value: val, ...styleOverride, label: { position: 'bottom' as const } }
        }
        if (val >= ySpan * 0.1 && fitsInsideBar(text, val)) {
          return { value: val, ...styleOverride, label: insideHaloLabel }
        }
      }
      return crossesZero ? { value: val, ...styleOverride } : val
    })

    const decItems = decData.map((val, i) => {
      if (typeof val !== 'number') return val
      const crossesZero = typeof decNegData[i] === 'number'
      if (crossesZero) {
        return {
          value: val,
          itemStyle: { color: theme.danger, borderRadius: [4, 4, 0, 0] },
          label: { show: false },
        }
      }
      const bottom = baseData[i] ?? 0
      const top = bottom + val
      const text = `-${Math.abs(stepDeltas[i] ?? val)}`
      const hitsBottomAxis = !hasNegativeRegion && bottom <= ySpan * 0.12
      if (showBarLabels && (hitsBottomAxis || overlapsRefBand(i, bottom - ySpan * 0.085, bottom))) {
        if (hitsBottomAxis && fitsInsideBar(text, val)) {
          return { value: val, label: insideHaloLabel }
        }
        if (!overlapsRefBand(i, top, top + ySpan * 0.085)) {
          return { value: val, label: { position: 'top' as const } }
        }
        if (fitsInsideBar(text, val)) {
          return { value: val, label: insideHaloLabel }
        }
      }
      return val
    })

    const formatDeltaLabel =
      (sign: '+' | '-') =>
      (p: { dataIndex?: number; value?: unknown }): string => {
        const idx = typeof p.dataIndex === 'number' ? p.dataIndex : -1
        const delta = idx >= 0 ? stepDeltas[idx] : undefined
        return `${sign}${delta !== undefined ? Math.abs(delta) : sanitizeChartLabel(p.value)}`
      }
    const mapNegItems = (
      arr: readonly (number | '-')[],
      color: string,
      sign: '+' | '-',
      onlyWhenPosEmpty: boolean,
    ) =>
      arr.map((val, i) =>
        typeof val !== 'number'
          ? val
          : {
              value: val,
              itemStyle: { color, borderRadius: [0, 0, 4, 4] },
              label: {
                show: showBarLabels && (!onlyWhenPosEmpty || incData[i] === '-'),
                position: 'bottom' as const,
                color,
                fontSize: barLabelFontSize,
                formatter: () => `${sign}${Math.abs(stepDeltas[i] ?? val)}`,
              },
            },
      )
    const incNegItems = mapNegItems(incNegData, theme.success, '+', true)
    const decNegItems = mapNegItems(decNegData, theme.danger, '-', false)
    const silentBase = (
      stack: string,
      data: readonly number[],
      extra?: Record<string, unknown>,
    ) => ({
      name: '',
      type: 'bar' as const,
      stack,
      silent: true,
      tooltip: { show: false },
      emphasis: { disabled: true },
      itemStyle: { borderColor: 'transparent', color: 'transparent' },
      data,
      ...extra,
    })

    const wfLegendData = hasTotal
      ? [
          localeMsg.chartWaterfallTotal,
          localeMsg.chartWaterfallIncrease,
          localeMsg.chartWaterfallDecrease,
        ]
      : [localeMsg.chartWaterfallIncrease, localeMsg.chartWaterfallDecrease]

    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          if (!Array.isArray(params)) return ''
          const active = (
            params as Array<{
              name?: unknown
              seriesName?: unknown
              value?: unknown
              dataIndex?: unknown
            }>
          ).find((p) => p.value !== '-' && p.value !== undefined && p.seriesName !== '')
          if (!active) return ''
          const title = sanitizeChartLabel(active.name)
          const sName = sanitizeChartLabel(active.seriesName)
          const idx = typeof active.dataIndex === 'number' ? active.dataIndex : -1
          if (idx >= 0 && idx < stepDeltas.length) {
            const delta = stepDeltas[idx]!
            const isTot = isTotalFlags[idx] === true
            const formatted = isTot ? String(delta) : delta > 0 ? `+${delta}` : String(delta)
            return `${title}\n${sName}: ${formatted}`
          }
          const sign = sName === localeMsg.chartWaterfallDecrease ? '-' : ''
          return `${title}\n${sName}: ${sign}${sanitizeChartLabel(active.value)}`
        },
      },
      legend: legend({
        scroll: isCompact,
        bottom: props.zoom ? ZOOM_LEGEND_BOTTOM : 0,
        data: wfLegendData,
      }),
      dataZoom: zoomCfg,
      grid: {
        top: 22,
        right: 18,
        bottom: 34 + (props.zoom ? ZOOM_LEGEND_BOTTOM : 0),
        left: 12,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisTick: { show: false },
        axisLabel: compactCatLabel(categories.length),
      },
      yAxis: valAxis(bounds, true),
      series: [
        silentBase('waterfall', baseData),
        {
          name: localeMsg.chartWaterfallTotal,
          type: 'bar',
          stack: 'waterfall',
          barMaxWidth: 34,
          itemStyle: {
            color: theme.brand,
            borderRadius: allTotalsNeg ? [0, 0, 4, 4] : [4, 4, 0, 0],
          },
          labelLayout: { hideOverlap: true },
          label: {
            show: showBarLabels,
            position: allTotalsNeg ? 'bottom' : 'top',
            color: theme.textPrimary,
            fontSize: barLabelFontSize,
          },
          markLine: hasTotal ? refLine : undefined,
          data: totalItems,
        },
        {
          name: localeMsg.chartWaterfallIncrease,
          type: 'bar',
          stack: 'waterfall',
          barMaxWidth: 34,
          itemStyle: { color: theme.success, borderRadius: [4, 4, 0, 0] },
          labelLayout: { hideOverlap: true },
          label: {
            show: showBarLabels,
            position: 'top',
            color: theme.success,
            fontSize: barLabelFontSize,
            formatter: formatDeltaLabel('+'),
          },
          markLine: !hasTotal ? refLine : undefined,
          data: incItems,
        },
        {
          name: localeMsg.chartWaterfallDecrease,
          type: 'bar',
          stack: 'waterfall',
          barMaxWidth: 34,
          itemStyle: { color: theme.danger, borderRadius: [0, 0, 4, 4] },
          labelLayout: { hideOverlap: true },
          label: {
            show: showBarLabels,
            position: 'bottom',
            color: theme.danger,
            fontSize: barLabelFontSize,
            formatter: formatDeltaLabel('-'),
          },
          data: decItems,
        },
        ...(hasNegativeRegion
          ? [
              silentBase('waterfall-neg', baseNegData, { barGap: '-100%' }),
              {
                name: localeMsg.chartWaterfallIncrease,
                type: 'bar',
                stack: 'waterfall-neg',
                barGap: '-100%',
                barMaxWidth: 34,
                itemStyle: { color: theme.success, borderRadius: [0, 0, 4, 4] },
                labelLayout: { hideOverlap: true },
                label: { show: false },
                data: incNegItems,
              },
              {
                name: localeMsg.chartWaterfallDecrease,
                type: 'bar',
                stack: 'waterfall-neg',
                barGap: '-100%',
                barMaxWidth: 34,
                itemStyle: { color: theme.danger, borderRadius: [0, 0, 4, 4] },
                labelLayout: { hideOverlap: true },
                label: { show: false },
                data: decNegItems,
              },
            ]
          : []),
      ],
    }
  }

  if (props.kind === 'bullet') {
    const localeMsg = msg
    const valField =
      typeof props.yField === 'string' && props.yField !== '' ? props.yField : primaryY
    const parsedRows = rows.map((r, idx) => {
      const label = sanitizeChartLabel(r[xKey] ?? r.label ?? r.name ?? `#${idx + 1}`)
      const actual = toNumber(r[valField] ?? r.actual ?? r.value ?? 0)
      const hasTarget = r.target !== undefined && r.target !== null
      const target = hasTarget ? toNumber(r.target) : undefined
      const rawRanges = Array.isArray(r.ranges)
        ? (r.ranges as unknown[])
            .map(toNumber)
            .filter((n) => n > 0)
            .sort((a, b) => a - b)
        : []
      const explicitMax = r.max !== undefined && r.max !== null ? toNumber(r.max) : 0
      const hasScaleHint = explicitMax > 0 || rawRanges.length > 0
      const dataPeak = Math.max(actual, target ?? 0)
      const defaultFloor = !hasScaleHint && dataPeak > 5 && dataPeak <= 100 ? 100 : 0
      const inferredMax = hasScaleHint
        ? Math.max(explicitMax, rawRanges[rawRanges.length - 1] ?? 0, dataPeak)
        : Math.max(dataPeak * 1.15, defaultFloor, 1)
      const rHigh = rawRanges[rawRanges.length - 1] ?? inferredMax
      const rMid =
        rawRanges.length >= 2
          ? rawRanges[rawRanges.length - 2]!
          : Number((rHigh * 0.85).toPrecision(6))
      const rLow = rawRanges.length >= 3 ? rawRanges[0]! : Number((rHigh * 0.6).toPrecision(6))
      return { label, actual, target, rLow, rMid, rHigh, hasScaleHint }
    })
    const categories = parsedRows.map((p) => p.label)
    const maxBound =
      parsedRows.length > 0
        ? Math.max(...parsedRows.map((p) => Math.max(p.rHigh, p.actual, p.target ?? 0)), 1e-6)
        : 100
    const minActual = Math.min(0, ...parsedRows.flatMap((p) => [p.actual, p.target ?? 0]))
    const bulletMin = minActual < 0 ? -niceUpperBound(Math.abs(minActual)) : 0
    const estW = chartWidth(540)
    const estH = chartHeight
    const maxYLabelW = isCompact
      ? Math.min(88, Math.floor(estW * 0.34))
      : Math.min(156, Math.floor(estW * 0.32))
    const bgHigh = dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.07)'
    const bgMid = dark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(15, 23, 42, 0.13)'
    const bgLow = dark ? 'rgba(255, 255, 255, 0.21)' : 'rgba(15, 23, 42, 0.19)'
    const barBandH = Math.max(
      8,
      Math.min(
        isCompact ? 16 : 22,
        Math.floor(((estH - 40) / Math.max(1, parsedRows.length)) * 0.62),
      ),
    )
    const actualBarH = Math.max(4, Math.round(barBandH * 0.45))
    const targetPoints = parsedRows
      .map((p, idx) => (p.target !== undefined ? { name: p.label, value: [p.target, idx] } : null))
      .filter((pt): pt is { name: string; value: [number, number] } => pt !== null)

    const bulletMax = niceUpperBound(maxBound)
    const bulletInterval =
      bulletMin === 0 ? computeEvenAxisInterval(bulletMax, isCompact) : undefined

    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [params]
          const first = list[0] as { dataIndex?: number } | undefined
          const idx = first?.dataIndex ?? -1
          const item = parsedRows[idx]
          if (!item) return ''
          const lines = [`${item.label}`, `${localeMsg.chartBulletActual}: ${item.actual}`]
          if (item.target !== undefined) {
            const pctSuffix =
              item.target > 0 ? ` (${Math.round((item.actual / item.target) * 100)}%)` : ''
            lines.push(`${localeMsg.chartBulletTarget}: ${item.target}${pctSuffix}`)
          }
          return lines.join('\n')
        },
      },
      grid: {
        top: 14,
        right: isCompact ? 12 : 20,
        bottom: 18,
        left: isCompact ? 6 : 12,
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        min: bulletMin,
        max: bulletMax,
        interval: bulletInterval,
        splitLine: dashedLine,
        axisLabel: axisLabelBase,
      },
      yAxis: [
        {
          type: 'category',
          inverse: true,
          data: categories,
          axisLine: borderLine,
          axisTick: { show: false },
          axisLabel: {
            color: theme.textPrimary,
            fontSize: isCompact ? 10 : 11.5,
            hideOverlap: true,
            width: maxYLabelW,
            overflow: 'truncate',
            ellipsis: '…',
          },
        },
        {
          type: 'category',
          inverse: true,
          data: categories,
          show: false,
        },
      ],
      series: [
        {
          name: '',
          type: 'bar',
          yAxisIndex: 0,
          barWidth: barBandH,
          barGap: '-100%',
          silent: true,
          z: 1,
          itemStyle: { color: bgHigh, borderRadius: 4 },
          data: parsedRows.map((p) => p.rHigh),
        },
        {
          name: '',
          type: 'bar',
          yAxisIndex: 0,
          barWidth: barBandH,
          barGap: '-100%',
          silent: true,
          z: 2,
          itemStyle: { color: bgMid, borderRadius: 4 },
          data: parsedRows.map((p) => p.rMid),
        },
        {
          name: '',
          type: 'bar',
          yAxisIndex: 0,
          barWidth: barBandH,
          barGap: '-100%',
          silent: true,
          z: 3,
          itemStyle: { color: bgLow, borderRadius: 4 },
          data: parsedRows.map((p) => p.rLow),
        },
        {
          name: localeMsg.chartBulletActual,
          type: 'bar',
          yAxisIndex: 1,
          barWidth: actualBarH,
          z: 4,
          data: parsedRows.map((p) => {
            const col =
              p.target !== undefined
                ? p.actual >= p.target
                  ? theme.success
                  : p.actual >= p.target * 0.8
                    ? theme.brand
                    : theme.warn
                : theme.brand
            return {
              value: p.actual,
              itemStyle: { color: col, borderRadius: 3 },
            }
          }),
        },
        ...(targetPoints.length > 0
          ? [
              {
                name: localeMsg.chartBulletTarget,
                type: 'scatter' as const,
                yAxisIndex: 0,
                silent: true,
                symbol: 'rect',
                symbolSize: [3, Math.min(isCompact ? 16 : 22, Math.round(barBandH * 1.25))],
                z: 6,
                itemStyle: { color: theme.danger },
                data: targetPoints,
              },
            ]
          : []),
      ],
    }
  }

  if (props.kind === 'dumbbell') {
    const localeMsg = msg
    const sample = rows[0] ?? {}
    const sampleKeys = Object.keys(sample)
    const explicitList = Array.isArray(props.yField) ? props.yField : []
    const beforeKey =
      explicitList.length >= 2
        ? explicitList[0]!
        : (sampleKeys.find((k) => /^(?:before|start|from|baseline|old|min|prev)$/i.test(k)) ??
          (yKeys.length >= 2 ? yKeys[0]! : 'before'))
    const afterKey =
      explicitList.length >= 2
        ? explicitList[1]!
        : (sampleKeys.find((k) => /^(?:after|end|to|current|new|max|next)$/i.test(k)) ??
          (yKeys.length >= 2 ? yKeys[1]! : 'after'))
    const beforeName =
      explicitList.length >= 2 ? sanitizeChartLabel(beforeKey) : localeMsg.chartDumbbellBefore
    const afterName =
      explicitList.length >= 2 ? sanitizeChartLabel(afterKey) : localeMsg.chartDumbbellAfter

    const parsed = rows.map((r, idx) => {
      const label = sanitizeChartLabel(r[xKey] ?? r.label ?? r.name ?? `#${idx + 1}`)
      const before = toNumber(r[beforeKey] ?? r.before ?? r.start ?? r.from ?? 0)
      const after = toNumber(r[afterKey] ?? r.after ?? r.end ?? r.to ?? 0)
      return { label, before, after, delta: Number((after - before).toPrecision(6)) }
    })
    const categories = parsed.map((p) => p.label)
    const allVals = parsed.flatMap((p) => [p.before, p.after])
    const minVal = allVals.length > 0 ? Math.min(...allVals) : 0
    const maxVal = allVals.length > 0 ? Math.max(...allVals) : 0
    const rawSpan = maxVal - minVal
    const useHighOffsetBaseline = minVal > 0 && rawSpan > 0 && rawSpan < minVal * 0.45
    const offsetStep = 10 ** Math.floor(Math.log10(Math.max(1e-9, rawSpan)))
    const baseline =
      minVal < 0
        ? -niceUpperBound(Math.abs(minVal))
        : useHighOffsetBaseline
          ? Number(
              Math.max(
                0,
                Math.floor((minVal - rawSpan * 0.25) / offsetStep) * offsetStep,
              ).toPrecision(6),
            )
          : 0
    const connectorColor = dark ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.42)'
    const beforeColor = dark ? '#94a3b8' : '#64748b'
    const baseData = parsed.map((p) => Number((Math.min(p.before, p.after) - baseline).toFixed(4)))
    const spanData = parsed.map((p) => ({
      value: Number(Math.abs(p.after - p.before).toFixed(4)),
      itemStyle: {
        color:
          p.after > p.before ? theme.success : p.after < p.before ? theme.warn : connectorColor,
        opacity: 0.65,
        borderRadius: 2,
      },
    }))
    const estW = chartWidth(540)
    const maxYLabelW = isCompact
      ? Math.min(88, Math.floor(estW * 0.34))
      : Math.min(156, Math.floor(estW * 0.32))
    const dotSize = isCompact ? 9 : 11

    return {
      color: [beforeColor, theme.brand],
      tooltip: {
        ...baseTooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [params]
          const first = list[0] as { dataIndex?: number } | undefined
          const item = parsed[first?.dataIndex ?? -1]
          if (!item) return ''
          const sign = item.delta > 0 ? '+' : ''
          return `${item.label}\n${beforeName}: ${item.before}\n${afterName}: ${item.after} (${sign}${item.delta})`
        },
      },
      legend: legend({
        scroll: isCompact,
        bottom: 0,
        names: [beforeName, afterName],
        data: [beforeName, afterName],
      }),
      grid: {
        top: 14,
        right: isCompact ? 12 : 20,
        bottom: 34,
        left: isCompact ? 6 : 12,
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        splitNumber: isCompact ? 3 : 5,
        splitLine: dashedLine,
        axisLabel: {
          ...axisLabelBase,
          formatter: (val: number) => formatCompactTickNum(val + baseline, rawSpan),
        },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: categories,
        axisTick: { show: false },
        axisLabel: {
          color: theme.textPrimary,
          fontSize: isCompact ? 10 : 11.5,
          hideOverlap: true,
          width: maxYLabelW,
          overflow: 'truncate',
          ellipsis: '…',
        },
      },
      series: [
        {
          name: '',
          type: 'bar',
          stack: 'dumbbellLink',
          barWidth: 3,
          silent: true,
          tooltip: { show: false },
          itemStyle: { color: 'transparent' },
          data: baseData,
        },
        {
          name: '',
          type: 'bar',
          stack: 'dumbbellLink',
          barWidth: 3,
          silent: true,
          tooltip: { show: false },
          itemStyle: { color: connectorColor, borderRadius: 2 },
          data: spanData,
        },
        {
          name: beforeName,
          type: 'scatter',
          symbolSize: dotSize,
          z: 5,
          itemStyle: {
            color: beforeColor,
            borderColor: dark ? '#0f172a' : '#ffffff',
            borderWidth: 1.5,
          },
          data: parsed.map((p, idx) => ({
            name: p.label,
            value: [p.before - baseline, idx],
            ...(baseline !== 0 ? { rawValue: p.before } : {}),
          })),
        },
        {
          name: afterName,
          type: 'scatter',
          symbolSize: dotSize + 1,
          z: 6,
          itemStyle: {
            color: theme.brand,
            borderColor: dark ? '#0f172a' : '#ffffff',
            borderWidth: 1.5,
          },
          data: parsed.map((p, idx) => ({
            name: p.label,
            value: [p.after - baseline, idx],
            ...(baseline !== 0 ? { rawValue: p.after } : {}),
          })),
        },
      ],
    }
  }

  return null
}
