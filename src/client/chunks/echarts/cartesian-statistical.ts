import type * as echarts from 'echarts/core'
import {
  type ChartBuildContext,
  ZOOM_LEGEND_BOTTOM,
  buildCompactCategoryFormatter,
  canUseLogScale,
  computeEvenAxisInterval,
  computeHistogramBins,
  computeRefAxisBounds,
  extractBoxplotFive,
  formatCompactTickNum,
  niceUpperBound,
  pickMarkLinePosition,
  pickVerticalMarkLineAlign,
  resolveYRange,
  sanitizeChartLabel,
  scanSampleKeys,
  toFiniteNum,
  toNumber,
} from './shared.ts'

export function buildStatisticalChartOption(
  ctx: ChartBuildContext,
): echarts.EChartsCoreOption | null {
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
    borderLine,
    axisLabelBase,
    msg,
    chartWidth,
    compactCatLabel,
    valAxis,
    refLine: buildRefLine,
    markArea,
    zoom,
    legend,
  } = ctx

  if (props.kind === 'boxplot') {
    const categories = rows.map((r) => sanitizeChartLabel(r[xKey] ?? r.name ?? r.label))
    const boxYField =
      typeof props.yField === 'string' && props.yField !== '' ? props.yField : undefined
    const boxData = rows.map((r) => extractBoxplotFive(r, boxYField))
    const zoomCfg = zoom()
    const boxHighs = boxData.map((b) => b[4] ?? 0)
    const boxMarkPos = pickMarkLinePosition(
      boxHighs.slice(0, Math.min(2, boxHighs.length)),
      boxHighs.slice(Math.max(0, boxHighs.length - 2)),
      props.referenceLine,
    )
    const refLine = buildRefLine(theme.textDanger, boxMarkPos)
    const bounds = computeRefAxisBounds(boxData.flat(), props.referenceLine)
    const compactWrapCat = isCompact && categories.length >= 2 && categories.length <= 5
    const estW = chartWidth(520)
    const catSlotPx = Math.max(32, Math.floor((estW - 56) / Math.max(1, categories.length)) - 6)
    const measureBoxPx = (s: string) => {
      let px = 0
      for (const ch of s) px += (ch.codePointAt(0) ?? 0) > 0xff ? 9.5 : 5.89
      return px
    }
    const clipBoxLine = (s: string): string => {
      if (measureBoxPx(s) <= catSlotPx) return s
      let out = ''
      let px = 0
      for (const ch of s) {
        const w = (ch.codePointAt(0) ?? 0) > 0xff ? 9.5 : 5.89
        if (px + w + 5.5 > catSlotPx) return `${out}…`
        out += ch
        px += w
      }
      return out
    }
    const formatCompactCat = (raw: string): string => {
      if (measureBoxPx(raw) <= catSlotPx) return raw
      let splitAt = -1
      let keepSep = false
      for (let i = 1; i < raw.length - 1; i++) {
        const ch = raw[i]!
        if (ch === '-' || ch === '/' || ch === '_' || ch === ' ') {
          const head = ch === ' ' ? raw.slice(0, i) : raw.slice(0, i + 1)
          if (measureBoxPx(head) <= catSlotPx) {
            splitAt = i
            keepSep = ch !== ' '
          }
        }
      }
      if (splitAt > 0) {
        const l1 = keepSep ? raw.slice(0, splitAt + 1) : raw.slice(0, splitAt)
        const l2 = raw.slice(splitAt + 1).trimStart()
        return l2 ? `${l1}\n${clipBoxLine(l2)}` : l1
      }
      let l1 = ''
      let l2 = ''
      let px = 0
      for (const ch of raw) {
        const w = (ch.codePointAt(0) ?? 0) > 0xff ? 9.5 : 5.89
        if (!l2 && l1 && px + w > catSlotPx) {
          px = w
          l2 = ch
        } else if (l2) {
          if (px + w > catSlotPx) return `${l1}\n${l2}…`
          l2 += ch
          px += w
        } else {
          l1 += ch
          px += w
        }
      }
      return l2 ? `${l1}\n${l2}` : l1
    }
    const boxMsg = msg
    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'item',
        formatter: (p: unknown) => {
          const rec = p as { name?: unknown; value?: unknown }
          const arr = Array.isArray(rec?.value) ? rec.value : null
          if (!arr || arr.length < 5) return sanitizeChartLabel(rec?.name)
          const off = arr.length >= 6 ? 1 : 0
          return `${sanitizeChartLabel(rec?.name)}\n${boxMsg.chartStatMax}: ${arr[off + 4]}\n${boxMsg.chartStatQ3}: ${arr[off + 3]}\n${boxMsg.chartStatMedian}: ${arr[off + 2]}\n${boxMsg.chartStatQ1}: ${arr[off + 1]}\n${boxMsg.chartStatMin}: ${arr[off]}`
        },
      },
      grid: { top: 18, right: 18, bottom: props.zoom ? 42 : 16, left: 12, containLabel: true },
      dataZoom: zoomCfg,
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: {
          color: theme.textSecondary,
          fontSize: compactWrapCat ? 9.5 : isCompact ? 10 : 11,
          lineHeight: 12,
          interval: compactWrapCat ? 0 : 'auto',
          hideOverlap: !compactWrapCat,
          formatter: compactWrapCat ? formatCompactCat : undefined,
          ...(!compactWrapCat && isCompact
            ? { width: Math.max(44, catSlotPx), overflow: 'truncate' as const }
            : {}),
        },
      },
      yAxis: valAxis(bounds),
      series: [
        {
          name: sanitizeChartLabel(props.title ?? msg.chartBoxplotDefault),
          type: 'boxplot',
          itemStyle: {
            color: dark ? 'rgba(96, 165, 250, 0.22)' : 'rgba(37, 99, 235, 0.14)',
            borderColor: theme.brand,
            borderWidth: 1.6,
          },
          markLine: refLine,
          data: boxData,
        },
      ],
    }
  }

  if (props.kind === 'candlestick') {
    const dateField = props.xField ?? 'date'
    const parsedCandles = rows
      .map((r) => {
        const o = toFiniteNum(r.open ?? r.o ?? r.start)
        const c = toFiniteNum(r.close ?? r.c ?? r.end)
        const l = toFiniteNum(r.low ?? r.l ?? r.min)
        const h = toFiniteNum(r.high ?? r.h ?? r.max)
        const open = o ?? c ?? l ?? h
        if (open === null) return null
        const close = c ?? open
        const low = l ?? Math.min(open, close)
        const high = h ?? Math.max(open, close)
        return {
          cat: sanitizeChartLabel(r[dateField] ?? r[xKey] ?? r.time ?? r.name),
          tuple: [open, close, Math.min(low, open, close), Math.max(high, open, close)] as [
            number,
            number,
            number,
            number,
          ],
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    const categories = parsedCandles.map((entry) => entry.cat)
    const ohlc = parsedCandles.map((entry) => entry.tuple)
    const zoomCfg = zoom()
    const candleHighs = ohlc.map((c) => c[3] ?? 0)
    const candlePos = pickMarkLinePosition(
      candleHighs.slice(0, 2),
      candleHighs.slice(-2),
      props.referenceLine,
    )
    const refLine = buildRefLine(theme.textWarn, candlePos)
    const bounds = computeRefAxisBounds(ohlc.flat(), props.referenceLine, true)
    const ohlcMsg = msg
    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'axis',
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [params]
          const first = list[0] as { axisValueLabel?: unknown; name?: unknown; value?: unknown }
          const arr = Array.isArray(first?.value) ? first.value : null
          const head = sanitizeChartLabel(first?.axisValueLabel ?? first?.name)
          if (!arr || arr.length < 4) return head
          const off = arr.length >= 5 ? 1 : 0
          return `${head}\n${ohlcMsg.chartOhlcOpen}: ${arr[off]}\n${ohlcMsg.chartOhlcClose}: ${arr[off + 1]}\n${ohlcMsg.chartOhlcLow}: ${arr[off + 2]}\n${ohlcMsg.chartOhlcHigh}: ${arr[off + 3]}`
        },
      },
      grid: {
        top: 18,
        right: isCompact ? 10 : 18,
        bottom: props.zoom ? 42 : 16,
        left: isCompact ? 6 : 12,
        containLabel: true,
      },
      dataZoom: zoomCfg,
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: compactCatLabel(categories.length, 40, 5, categories),
      },
      yAxis: valAxis({ scale: true, ...bounds }),
      series: [
        {
          name: sanitizeChartLabel(props.title ?? msg.chartCandlestickDefault),
          type: 'candlestick',
          itemStyle: {
            color: theme.success,
            color0: theme.danger,
            borderColor: theme.success,
            borderColor0: theme.danger,
          },
          markLine: refLine,
          data: ohlc,
        },
      ],
    }
  }

  if (props.kind === 'scatter') {
    const sizeKey = props.sizeField
    let scatterXKey = xKey
    let scatterYKeys = yKeys
    let scatterPrimaryY = primaryY
    if (!props.xField && rows.length > 0) {
      const excludedSet = new Set(
        [props.seriesField, sizeKey].filter((k): k is string => Boolean(k)),
      )
      const explicitYSet = new Set(
        typeof props.yField === 'string' && props.yField !== ''
          ? [props.yField]
          : Array.isArray(props.yField)
            ? props.yField
            : [],
      )
      const numericCandidates = scanSampleKeys(rows).numericKeys.filter((k) => !excludedSet.has(k))
      const xFirstVal = rows.find((r) => r[scatterXKey] !== undefined && r[scatterXKey] !== null)?.[
        scatterXKey
      ]
      const currentXNumeric = typeof xFirstVal === 'number' && Number.isFinite(xFirstVal)
      if (!currentXNumeric) {
        const autoX = numericCandidates.find((k) => !explicitYSet.has(k))
        if (autoX && (explicitYSet.size > 0 || numericCandidates.length >= 2)) {
          scatterXKey = autoX
          if (explicitYSet.size === 0) {
            scatterYKeys = numericCandidates.filter((k) => k !== autoX)
            scatterPrimaryY = scatterYKeys[0] ?? primaryY
          }
        }
      }
    }
    const firstNonNullX = rows.find(
      (r) => r[scatterXKey] !== undefined && r[scatterXKey] !== null,
    )?.[scatterXKey]
    const numericX = toFiniteNum(firstNonNullX) !== null
    const validRows = numericX ? rows.filter((r) => toFiniteNum(r[scatterXKey]) !== null) : rows
    const rawSizes = sizeKey ? validRows.map((r) => Math.max(0, toNumber(r[sizeKey]))) : []
    const maxSize = rawSizes.length > 0 ? Math.max(...rawSizes, 1) : 1
    const computeRadiusForVal = (rawVal: number): number => {
      if (!sizeKey) return isCompact ? 9 : 11
      const ratio = Math.sqrt(Math.max(0, rawVal) / maxSize)
      return isCompact ? Math.round(6 + ratio * 20) : Math.round(8 + ratio * 32)
    }

    const zoomCfg = zoom()
    const activeYKeys = props.seriesField ? [scatterPrimaryY] : scatterYKeys
    const scatterYVals = validRows.flatMap((r) =>
      activeYKeys.map((k) => toFiniteNum(r[k])).filter((n): n is number => n !== null),
    )
    const scatterUseLog = canUseLogScale(props.yScale, scatterYVals)
    const effectiveScatterRefY =
      scatterUseLog && props.referenceLine !== undefined && props.referenceLine <= 0
        ? undefined
        : props.referenceLine
    const sortedByX = validRows
      .map((r, i) => {
        const yList = activeYKeys
          .map((k) => toFiniteNum(r[k]))
          .filter((n): n is number => n !== null)
        return {
          x: numericX ? toNumber(r[scatterXKey]) : i,
          y: yList.length > 0 ? Math.max(...yList) : 0,
        }
      })
      .sort((a, b) => a.x - b.x)
    const midIdx = Math.max(1, Math.floor(sortedByX.length / 2))
    const scatterMarkPos = pickMarkLinePosition(
      sortedByX.slice(0, midIdx).map((p) => p.y),
      sortedByX.slice(midIdx).map((p) => p.y),
      effectiveScatterRefY,
    )
    const refLineY = buildRefLine(theme.textDanger, scatterMarkPos, effectiveScatterRefY)
    const scatterXVals = numericX ? validRows.map((r) => toNumber(r[scatterXKey])) : []
    const allNonNegX = scatterXVals.length > 0 && scatterXVals.every((v) => v >= 0)
    const xBounds = numericX ? computeRefAxisBounds(scatterXVals, props.referenceX, false) : {}
    const xRangeMin = xBounds.min ?? (allNonNegX ? 0 : Math.min(0, ...scatterXVals))
    const xMaxCandidates = [
      ...scatterXVals,
      ...(props.referenceX !== undefined && Number.isFinite(props.referenceX)
        ? [props.referenceX]
        : []),
    ]
    const xRangeMax = xBounds.max ?? (xMaxCandidates.length > 0 ? Math.max(...xMaxCandidates) : 1)
    const refLineX =
      numericX && props.referenceX !== undefined && Number.isFinite(props.referenceX)
        ? buildRefLine(
            theme.textBrand,
            'end',
            props.referenceX,
            props.referenceXLabel,
            true,
            pickVerticalMarkLineAlign(props.referenceX, xRangeMin, xRangeMax),
          )
        : undefined
    const refLine =
      refLineY && refLineX
        ? {
            silent: true,
            animation: false,
            symbol: ['none', 'none'],
            lineStyle: refLineY.lineStyle,
            label: refLineY.label,
            data: [
              {
                yAxis: effectiveScatterRefY,
                lineStyle: refLineY.lineStyle,
                label: refLineY.label,
              },
              { xAxis: props.referenceX, lineStyle: refLineX.lineStyle, label: refLineX.label },
            ],
          }
        : (refLineY ?? refLineX)
    const bounds = computeRefAxisBounds(scatterYVals, effectiveScatterRefY, false, scatterUseLog)
    const scatterCategories = numericX
      ? undefined
      : [...new Set(validRows.map((r) => sanitizeChartLabel(r[scatterXKey])))]
    const scatterMarkArea = markArea(
      0,
      resolveYRange(scatterYVals, bounds),
      scatterCategories,
      false,
      scatterUseLog,
    )
    const scatterLabelKey = Object.keys(validRows[0] ?? {}).find(
      (rk) =>
        rk !== scatterXKey &&
        !scatterYKeys.includes(rk) &&
        rk !== sizeKey &&
        rk !== props.seriesField &&
        typeof validRows[0]?.[rk] === 'string' &&
        String(validRows[0]?.[rk]).trim() !== '',
    )
    const resolveScatterPointName = (r: Record<string, unknown>, fallback?: unknown): string =>
      sanitizeChartLabel(
        r.name ??
          r.label ??
          (scatterLabelKey !== undefined ? r[scatterLabelKey] : undefined) ??
          fallback ??
          r[scatterXKey],
      )

    const makeScatterSeries = (
      name: string,
      idx: number,
      srcRows: readonly Record<string, unknown>[],
      yFieldKey: string,
      useCategoryIdx: boolean,
      fallbackLabel?: (r: Record<string, unknown>) => unknown,
    ): Record<string, unknown> => ({
      name,
      type: 'scatter',
      symbolSize: (val: unknown) =>
        sizeKey && Array.isArray(val) && val.length >= 3
          ? computeRadiusForVal(Math.max(0, toNumber(val[2])))
          : isCompact
            ? 9
            : 11,
      itemStyle: sizeKey ? { opacity: 0.78 } : undefined,
      markLine: idx === 0 ? refLine : undefined,
      markArea: idx === 0 ? scatterMarkArea : undefined,
      data: srcRows
        .map((r) => {
          const rawY = toFiniteNum(r[yFieldKey])
          if (rawY === null) return null
          const yVal = scatterUseLog && rawY <= 0 ? null : rawY
          const sz = sizeKey ? Math.max(0, toNumber(r[sizeKey])) : undefined
          if (numericX) {
            const xv = toNumber(r[scatterXKey])
            return {
              name: resolveScatterPointName(r, fallbackLabel?.(r)),
              value: sz !== undefined ? [xv, yVal, sz] : [xv, yVal],
            }
          }
          const cxLabel = sanitizeChartLabel(r[scatterXKey])
          const cxVal = useCategoryIdx ? (scatterCategories?.indexOf(cxLabel) ?? 0) : cxLabel
          return {
            name: cxLabel,
            value: sz !== undefined ? [cxVal, yVal, sz] : [cxVal, yVal],
          }
        })
        .filter((pt): pt is NonNullable<typeof pt> => pt !== null),
    })

    const scatterSeries: Record<string, unknown>[] = props.seriesField
      ? (() => {
          const groupField = props.seriesField
          const groups = [...new Set(validRows.map((r) => sanitizeChartLabel(r[groupField])))]
          return groups.map((group, idx) =>
            makeScatterSeries(
              group,
              idx,
              validRows.filter((r) => sanitizeChartLabel(r[groupField]) === group),
              scatterPrimaryY,
              true,
              (r) => r[groupField],
            ),
          )
        })()
      : scatterYKeys.map((k, idx) =>
          makeScatterSeries(sanitizeChartLabel(k), idx, validRows, k, false),
        )

    const showScatterLegend = scatterSeries.length > 1

    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'item',
        formatter: (p: unknown) => {
          const rec = p as { name?: unknown; seriesName?: unknown; value?: unknown }
          const head = sanitizeChartLabel(rec?.name || rec?.seriesName)
          const v = rec?.value
          if (Array.isArray(v)) {
            const lines = head ? [head] : []
            if (v[0] !== undefined) {
              const xDisplay =
                !numericX && typeof v[0] === 'number' && scatterCategories
                  ? (scatterCategories[v[0]] ?? v[0])
                  : v[0]
              lines.push(`${sanitizeChartLabel(scatterXKey)}: ${xDisplay}`)
            }
            if (v[1] !== undefined) {
              const yLbl = sanitizeChartLabel(
                props.seriesField
                  ? scatterPrimaryY
                  : showScatterLegend
                    ? (rec?.seriesName ?? primaryY)
                    : (scatterYKeys[0] ?? primaryY),
              )
              lines.push(`${yLbl}: ${v[1]}`)
            }
            if (sizeKey && v[2] !== undefined) lines.push(`${sanitizeChartLabel(sizeKey)}: ${v[2]}`)
            return lines.join('\n')
          }
          return `${head}: ${sanitizeChartLabel(v)}`
        },
      },
      legend: showScatterLegend
        ? legend({
            scroll: isCompact || scatterSeries.length >= 4,
            bottom: props.zoom ? ZOOM_LEGEND_BOTTOM : 0,
            names: scatterSeries.map((s) => String(s.name ?? '')),
          })
        : undefined,
      grid: {
        top: refLineX ? 26 : 18,
        right: isCompact ? 12 : 18,
        bottom: (showScatterLegend ? 32 : 16) + (props.zoom ? ZOOM_LEGEND_BOTTOM : 0),
        left: isCompact ? 8 : 12,
        containLabel: true,
      },
      dataZoom: zoomCfg,
      xAxis: {
        type: numericX ? 'value' : 'category',
        data: scatterCategories,
        ...xBounds,
        ...(numericX && allNonNegX && xBounds.max !== undefined && xBounds.min === undefined
          ? { min: 0, interval: computeEvenAxisInterval(xBounds.max, isCompact) }
          : { splitNumber: numericX && isCompact ? 3 : undefined }),
        axisLabel: {
          ...axisLabelBase,
          ...(!numericX && isCompact && scatterCategories
            ? {
                width: Math.max(
                  38,
                  Math.floor(
                    ((containerWidth ?? 276) - 44) /
                      Math.min(5, Math.max(2, scatterCategories.length)),
                  ),
                ),
                overflow: 'truncate' as const,
                ellipsis: '…',
              }
            : {}),
        },
        splitLine: borderLine,
      },
      yAxis: {
        type: scatterUseLog ? 'log' : 'value',
        ...bounds,
        splitNumber: isCompact ? 3 : undefined,
        axisLabel: axisLabelBase,
        splitLine: borderLine,
      },
      series: scatterSeries,
    }
  }

  if (props.kind === 'range') {
    const localeMsg = msg
    const sample = rows[0] ?? {}
    const sampleKeys = Object.keys(sample)
    const explicitList = Array.isArray(props.yField) ? props.yField : []
    const lowKey =
      explicitList.length >= 2
        ? explicitList[0]!
        : (sampleKeys.find((k) => /^(?:low|lower|min|p10|p25|floor)$/i.test(k)) ?? 'low')
    const highKey =
      explicitList.length >= 3
        ? explicitList[2]!
        : explicitList.length === 2
          ? explicitList[1]!
          : (sampleKeys.find((k) => /^(?:high|upper|max|p90|p95|p99|ceil)$/i.test(k)) ?? 'high')
    const midKey =
      explicitList.length >= 3
        ? explicitList[1]!
        : typeof props.yField === 'string' &&
            props.yField !== '' &&
            props.yField !== lowKey &&
            props.yField !== highKey
          ? props.yField
          : sampleKeys.find(
              (k) =>
                k !== xKey &&
                k !== lowKey &&
                k !== highKey &&
                /^(?:value|mid|median|mean|avg|p50|forecast|actual|predicted)$/i.test(k),
            )

    const categories = rows.map((r) => sanitizeChartLabel(r[xKey] ?? r.name ?? r.date ?? r.label))
    const rawLows = rows.map((r) => toNumber(r[lowKey] ?? r.low ?? r.lower ?? r.min))
    const rawHighs = rows.map((r) => toNumber(r[highKey] ?? r.high ?? r.upper ?? r.max))
    const orderedLows = rawLows.map((lo, i) => Math.min(lo, rawHighs[i] ?? lo))
    const orderedHighs = rawHighs.map((hi, i) => Math.max(hi, rawLows[i] ?? hi))
    const midVals = midKey
      ? rows.map((r, i) => {
          const raw = r[midKey]
          return raw !== undefined && raw !== null
            ? toNumber(raw)
            : Number((((orderedLows[i] ?? 0) + (orderedHighs[i] ?? 0)) / 2).toPrecision(10))
        })
      : orderedLows.map((lo, i) => Number(((lo + (orderedHighs[i] ?? lo)) / 2).toPrecision(10)))
    const minLow = orderedLows.length > 0 ? Math.min(...orderedLows) : 0
    const maxHigh = orderedHighs.length > 0 ? Math.max(...orderedHighs) : 0
    const rawRangeSpan = maxHigh - minLow
    const baseline = minLow < 0 ? -niceUpperBound(Math.abs(minLow)) : 0
    const baseData = orderedLows.map((lo) => Number((lo - baseline).toPrecision(10)))
    const spanData = orderedHighs.map((hi, i) =>
      Number((hi - (orderedLows[i] ?? 0)).toPrecision(10)),
    )
    const shiftedHighs = orderedHighs.map((hi) => Number((hi - baseline).toPrecision(10)))
    const shiftedMid = midVals.map((m) => Number((m - baseline).toPrecision(10)))
    const rangeStep = props.step ? ('end' as const) : false
    const shiftedRef =
      props.referenceLine !== undefined && Number.isFinite(props.referenceLine)
        ? props.referenceLine - baseline
        : undefined
    const rangeBounds = computeRefAxisBounds([...baseData, ...shiftedHighs], shiftedRef)
    const rangeMarkArea = markArea(
      -baseline,
      resolveYRange([...baseData, ...shiftedHighs], rangeBounds),
      categories,
    )
    const rangeRefLabel =
      props.referenceLabel !== undefined && props.referenceLabel.trim() !== ''
        ? props.referenceLabel
        : props.referenceLine !== undefined && Number.isFinite(props.referenceLine)
          ? String(props.referenceLine)
          : undefined
    const rangeMarkPos = pickMarkLinePosition(
      [...shiftedMid.slice(0, 2), ...shiftedHighs.slice(0, 2)],
      [...shiftedMid.slice(-2), ...shiftedHighs.slice(-2)],
      shiftedRef,
    )
    const refLine = buildRefLine(theme.textDanger, rangeMarkPos, shiftedRef, rangeRefLabel)
    const estW = chartWidth(540)
    const maxCatW = isCompact
      ? Math.max(40, Math.floor((estW - 44) / Math.min(6, Math.max(2, categories.length))))
      : undefined
    const rangeCatFmt =
      maxCatW !== undefined
        ? buildCompactCategoryFormatter(categories, maxCatW, isCompact)
        : undefined
    const rangeInterval =
      rangeBounds.max !== undefined && rangeBounds.min === undefined
        ? computeEvenAxisInterval(rangeBounds.max, isCompact)
        : undefined
    const zoomCfg = zoom()
    const midSeriesName = midKey ? sanitizeChartLabel(midKey) : localeMsg.chartRangeMid

    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'axis',
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [params]
          const first = list[0] as { dataIndex?: number; axisValueLabel?: string } | undefined
          const idx = first?.dataIndex ?? -1
          if (idx < 0 || idx >= categories.length) return ''
          const lo = orderedLows[idx] ?? 0
          const hi = orderedHighs[idx] ?? 0
          const mid = midVals[idx] ?? 0
          return `${categories[idx]}\n${midSeriesName}: ${mid}\n${localeMsg.chartRangeBand}: ${lo} – ${hi}`
        },
      },
      legend: legend({
        scroll: isCompact,
        bottom: props.zoom ? ZOOM_LEGEND_BOTTOM : 0,
        names: [midSeriesName, localeMsg.chartRangeBand],
        data: [midSeriesName, { name: localeMsg.chartRangeBand, icon: 'roundRect' }],
      }),
      dataZoom: zoomCfg,
      grid: {
        top: 18,
        right: isCompact ? 10 : 18,
        bottom: 34 + (props.zoom ? ZOOM_LEGEND_BOTTOM : 0),
        left: isCompact ? 6 : 12,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: categories,
        axisLabel: {
          ...axisLabelBase,
          ...(maxCatW !== undefined
            ? {
                width: maxCatW,
                overflow: 'truncate' as const,
                ellipsis: '…',
                ...(rangeCatFmt ? { formatter: rangeCatFmt } : {}),
              }
            : {}),
        },
      },
      yAxis: {
        type: 'value',
        min: rangeBounds.min ?? 0,
        ...rangeBounds,
        ...(rangeInterval !== undefined
          ? { interval: rangeInterval }
          : { splitNumber: isCompact ? 3 : undefined }),
        splitLine: borderLine,
        axisLabel: {
          ...axisLabelBase,
          formatter: (val: number) => formatCompactTickNum(val + baseline, rawRangeSpan),
        },
      },
      series: [
        {
          name: '',
          type: 'line',
          stack: 'rangeBand',
          smooth: !rangeStep,
          ...(rangeStep ? { step: rangeStep } : {}),
          symbol: 'none',
          lineStyle: { opacity: 0 },
          areaStyle: { opacity: 0 },
          silent: true,
          tooltip: { show: false },
          data: baseData,
        },
        {
          name: localeMsg.chartRangeBand,
          type: 'line',
          stack: 'rangeBand',
          smooth: !rangeStep,
          ...(rangeStep ? { step: rangeStep } : {}),
          symbol: 'none',
          silent: true,
          lineStyle: { width: 1, opacity: 0.45, color: theme.brand },
          areaStyle: { color: theme.brand, opacity: dark ? 0.24 : 0.18 },
          itemStyle: { color: theme.brand },
          data: spanData,
        },
        {
          name: midSeriesName,
          type: 'line',
          smooth: !rangeStep,
          ...(rangeStep ? { step: rangeStep } : {}),
          symbol: 'circle',
          symbolSize: isCompact ? 4 : 6,
          lineStyle: { width: 2.2, color: theme.brand },
          itemStyle: { color: theme.brand },
          markLine: refLine,
          markArea: rangeMarkArea,
          data:
            baseline !== 0
              ? shiftedMid.map((v, i) => ({ value: v, rawValue: midVals[i] ?? v }))
              : shiftedMid,
        },
      ],
    }
  }

  if (props.kind === 'histogram') {
    const localeMsg = msg
    const rawValues: number[] = []
    if (Array.isArray(props.data)) {
      let inferredKey: string | undefined =
        typeof props.yField === 'string' && props.yField !== '' ? props.yField : undefined
      if (!inferredKey) {
        for (let i = 0; i < Math.min(props.data.length, 16); i++) {
          const item = props.data[i]
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            const rec = item as Record<string, unknown>
            inferredKey = Object.keys(rec).find((k) => typeof rec[k] === 'number')
            if (inferredKey) break
          }
        }
      }
      const valKey = inferredKey ?? primaryY
      for (const item of props.data) {
        if (typeof item === 'number' && Number.isFinite(item)) {
          rawValues.push(item)
        } else if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          const rec = item as Record<string, unknown>
          const rawV = rec[valKey] ?? rec.value ?? rec.x
          if (typeof rawV === 'number' && Number.isFinite(rawV)) {
            rawValues.push(rawV)
          } else if (typeof rawV === 'string' && rawV.trim() !== '') {
            const parsed = Number(rawV.replace(/,/g, '').trim())
            if (Number.isFinite(parsed)) rawValues.push(parsed)
          }
        }
      }
    }
    const bins = computeHistogramBins(rawValues, props.bins, isCompact)
    const categories = bins.map((b) => b.label)
    const counts = bins.map((b) => b.count)
    const useLog = canUseLogScale(props.yScale, counts)
    let refMarkLine: Record<string, unknown> | undefined
    if (
      props.referenceLine !== undefined &&
      Number.isFinite(props.referenceLine) &&
      bins.length > 0
    ) {
      let targetIdx = bins.findIndex(
        (b, i) =>
          props.referenceLine! >= b.start &&
          (i === bins.length - 1 ? props.referenceLine! <= b.end : props.referenceLine! < b.end),
      )
      if (targetIdx < 0) {
        targetIdx = props.referenceLine! < bins[0]!.start ? 0 : bins.length - 1
      }
      const refLbl =
        props.referenceLabel !== undefined && props.referenceLabel.trim() !== ''
          ? sanitizeChartLabel(props.referenceLabel)
          : String(props.referenceLine)
      refMarkLine = buildRefLine(
        theme.textDanger,
        'end',
        targetIdx,
        refLbl,
        true,
        pickVerticalMarkLineAlign(targetIdx, 0, Math.max(1, bins.length - 1)),
      )
    }
    const estW = chartWidth(540)
    const maxCatW = isCompact
      ? Math.max(36, Math.floor((estW - 44) / Math.min(6, Math.max(2, categories.length))))
      : undefined
    const zoomCfg = zoom()

    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const list = Array.isArray(params) ? params : [params]
          const first = list[0] as { dataIndex?: number } | undefined
          const bin = bins[first?.dataIndex ?? -1]
          if (!bin) return ''
          return `${bin.label}\n${localeMsg.chartHistogramFreq}: ${bin.count} (${bin.pct}%)`
        },
      },
      dataZoom: zoomCfg,
      grid: {
        top: refMarkLine ? 26 : 16,
        right: isCompact ? 10 : 18,
        bottom: 18 + (props.zoom ? 28 : 0),
        left: isCompact ? 6 : 12,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: {
          color: theme.textSecondary,
          fontSize: isCompact ? 9.5 : 10.5,
          hideOverlap: true,
          ...(maxCatW !== undefined
            ? { width: maxCatW, overflow: 'truncate' as const, ellipsis: '…' }
            : {}),
        },
      },
      yAxis: {
        type: useLog ? 'log' : 'value',
        splitNumber: isCompact ? 3 : undefined,
        splitLine: borderLine,
        axisLabel: axisLabelBase,
      },
      series: [
        {
          name: localeMsg.chartHistogramFreq,
          type: 'bar',
          barCategoryGap: '8%',
          itemStyle: { color: theme.brand, borderRadius: [3, 3, 0, 0] },
          markLine: refMarkLine,
          data: useLog ? counts.map((c) => (c > 0 ? c : null)) : counts,
        },
      ],
    }
  }

  return null
}
