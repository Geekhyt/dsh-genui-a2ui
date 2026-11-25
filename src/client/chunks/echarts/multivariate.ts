import type * as echarts from 'echarts/core'
import { resolveClientLocale } from '../../../shared/chart-i18n.ts'
import {
  type ChartBuildContext,
  FILLED_SHAPE_LABEL,
  normalizeIsoDate,
  sanitizeChartLabel,
  scanSampleKeys,
  toFiniteNum,
  toNumber,
} from './shared.ts'

export function buildMultivariateChartOption(
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
    axisTooltip,
    borderLine,
    dashedLine,
    axisLabelBase,
    chartHeight,
    chartWidth,
    haloColor,
    legend,
  } = ctx

  if (props.kind === 'heatmap') {
    const { keys: sampleKeys, stringKeys, numericKeys } = scanSampleKeys(rows)

    const hxKey = props.xField ?? stringKeys[0] ?? sampleKeys[0] ?? 'x'
    const explicitYStr =
      typeof props.yField === 'string' && props.yField !== '' ? props.yField : undefined
    const hasOtherNumericBesidesExplicitY =
      explicitYStr !== undefined && numericKeys.some((k) => k !== hxKey && k !== explicitYStr)
    const hyKey =
      props.seriesField && props.seriesField !== hxKey
        ? props.seriesField
        : explicitYStr &&
            explicitYStr !== hxKey &&
            (props.sizeField !== undefined ||
              stringKeys.includes(explicitYStr) ||
              hasOtherNumericBesidesExplicitY)
          ? explicitYStr
          : (stringKeys.find((k) => k !== hxKey) ?? sampleKeys.find((k) => k !== hxKey) ?? 'y')
    const valKey =
      props.sizeField ??
      (explicitYStr && explicitYStr !== hyKey ? explicitYStr : undefined) ??
      numericKeys.find((k) => k !== hxKey && k !== hyKey) ??
      'value'

    const xCats = [...new Set(rows.map((r) => sanitizeChartLabel(r[hxKey])))]
    const yCats = [...new Set(rows.map((r) => sanitizeChartLabel(r[hyKey])))]
    const cellMap = new Map<
      string,
      { xIdx: number; yIdx: number; xLabel: string; val: number | '-'; rowIndex: number }
    >()
    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const r = rows[rIdx]!
      const xLabel = sanitizeChartLabel(r[hxKey])
      const yLabel = sanitizeChartLabel(r[hyKey])
      const xIdx = xCats.indexOf(xLabel)
      const yIdx = yCats.indexOf(yLabel)
      const parsedV = toFiniteNum(r[valKey])
      const val: number | '-' = parsedV ?? '-'
      cellMap.set(`${xIdx}\u0000${yIdx}`, { xIdx, yIdx, xLabel, val, rowIndex: rIdx })
    }
    const dedupEntries = [...cellMap.values()].filter(
      (c): c is { xIdx: number; yIdx: number; xLabel: string; val: number; rowIndex: number } =>
        typeof c.val === 'number',
    )
    const finiteVals = dedupEntries.map((c) => c.val)
    const minVal = finiteVals.length > 0 ? Math.min(...finiteVals) : 0
    const maxVal = finiteVals.length > 0 ? Math.max(...finiteVals) : 100
    const valSpan = Math.max(1e-9, maxVal - minVal)
    const showCellLabels = isCompact
      ? xCats.length <= 6 && yCats.length <= 6 && dedupEntries.length <= 36
      : dedupEntries.length <= 48

    const cells = dedupEntries.map((entry) => {
      const norm = (entry.val - minVal) / valSpan
      return {
        name: entry.xLabel,
        rowIndex: entry.rowIndex,
        value: [entry.xIdx, entry.yIdx, entry.val],
        label:
          norm >= 0.45
            ? { ...FILLED_SHAPE_LABEL, fontSize: isCompact ? 9.5 : 11 }
            : { color: theme.textPrimary, fontSize: isCompact ? 9.5 : 11 },
      }
    })
    const estHeatW = chartWidth(520)
    const splitAreaColors = dark
      ? ['rgba(255, 255, 255, 0.02)', 'rgba(255, 255, 255, 0.05)']
      : ['rgba(15, 23, 42, 0.02)', 'rgba(15, 23, 42, 0.045)']

    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as { value?: unknown }
          if (Array.isArray(p?.value) && p.value.length >= 3) {
            const xLbl = xCats[Number(p.value[0])] ?? ''
            const yLbl = yCats[Number(p.value[1])] ?? ''
            const v = p.value[2]
            const vText = v === '-' || v === null || v === undefined ? '—' : sanitizeChartLabel(v)
            return `${yLbl} · ${xLbl}: ${vText}`
          }
          return ''
        },
      },
      grid: {
        top: 14,
        right: isCompact ? 10 : 18,
        bottom: 62,
        left: isCompact ? 6 : 12,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: xCats,
        splitArea: { show: true, areaStyle: { color: splitAreaColors } },
        axisLabel: {
          color: theme.textSecondary,
          fontSize: isCompact ? 9.5 : 11,
          hideOverlap: true,
          width: Math.max(36, Math.floor((estHeatW - 60) / Math.max(1, xCats.length))),
          overflow: 'truncate' as const,
        },
        axisLine: borderLine,
      },
      yAxis: {
        type: 'category',
        data: yCats,
        splitArea: { show: true, areaStyle: { color: splitAreaColors } },
        axisLabel: {
          color: theme.textSecondary,
          fontSize: isCompact ? 9.5 : 11,
          hideOverlap: true,
          width: Math.min(isCompact ? 80 : 124, Math.floor(estHeatW * 0.3)),
          overflow: 'truncate' as const,
        },
        axisLine: borderLine,
      },
      visualMap: {
        min: minVal,
        max: maxVal === minVal ? minVal + 1 : maxVal,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 4,
        itemWidth: 11,
        itemHeight: isCompact ? 76 : 96,
        itemGap: 14,
        textStyle: { color: theme.textPrimary, fontSize: 10.5 },
        inRange: {
          color: [theme.heatLow, theme.brand],
        },
      },
      series: [
        {
          type: 'heatmap',
          data: cells,
          label: {
            show: showCellLabels,
            fontSize: isCompact ? 9.5 : 11,
          },
          itemStyle: {
            borderRadius: 3,
            borderColor: 'transparent',
            borderWidth: 2,
          },
        },
      ],
    }
  }

  if (props.kind === 'parallel') {
    const sampleSlice = rows.slice(0, 16)
    const { keys: unionKeys } = scanSampleKeys(rows)
    const isNumericDim = (k: string) =>
      sampleSlice.some(
        (r) =>
          (typeof r[k] === 'number' && Number.isFinite(r[k])) ||
          (typeof r[k] === 'string' && r[k].trim() !== '' && Number.isFinite(Number(r[k]))),
      )
    const dimKeys =
      Array.isArray(props.yField) && props.yField.length > 0
        ? props.yField
        : unionKeys.filter((k) => k !== xKey && k !== props.seriesField && isNumericDim(k))
    const effectiveDims = dimKeys.length > 0 ? dimKeys : yKeys.length > 0 ? yKeys : ['value']
    const labelField = props.seriesField ?? xKey
    if (effectiveDims.length < 2) {
      const onlyDim = effectiveDims[0] ?? 'value'
      return {
        tooltip: axisTooltip,
        grid: { top: 14, right: isCompact ? 12 : 20, bottom: 18, left: 10, containLabel: true },
        xAxis: {
          type: 'value',
          splitNumber: isCompact ? 3 : 4,
          splitLine: dashedLine,
          axisLabel: {
            ...axisLabelBase,
          },
        },
        yAxis: {
          type: 'category',
          inverse: true,
          data: rows.map((r, idx) =>
            sanitizeChartLabel(r[labelField] ?? r.name ?? r.model ?? `#${idx + 1}`),
          ),
          axisLine: borderLine,
          axisLabel: {
            color: theme.textPrimary,
            fontSize: isCompact ? 10 : 11,
            hideOverlap: true,
            width: Math.min(isCompact ? 92 : 160, Math.floor(chartWidth(540) * 0.34)),
            overflow: 'truncate' as const,
            ellipsis: '…',
          },
        },
        series: [
          {
            name: sanitizeChartLabel(onlyDim),
            type: 'bar',
            barMaxWidth: 24,
            itemStyle: { color: theme.brand, borderRadius: [0, 4, 4, 0] },
            data: rows.map((r) => toNumber(r[onlyDim])),
          },
        ],
      }
    }
    const padLeft = isCompact ? 14 : 36
    const padRight = isCompact ? 38 : 50
    const estWidth = chartWidth(600)
    const axisGap = Math.max(
      22,
      Math.floor((estWidth - padLeft - padRight) / Math.max(1, effectiveDims.length - 1)),
    )
    const staggerHeaders = axisGap < 96 && effectiveDims.length >= 3
    const baseMaxTitleW = staggerHeaders
      ? Math.max(40, Math.floor(axisGap * 1.15))
      : Math.max(38, Math.floor(axisGap * 0.82))

    const parallelAxis = effectiveDims.map((dimKey, idx) => {
      const isLast = idx === effectiveDims.length - 1
      const isEdge = effectiveDims.length > 1 && (idx === 0 || isLast)
      const align =
        effectiveDims.length > 1
          ? idx === 0
            ? ('left' as const)
            : isLast
              ? ('right' as const)
              : ('center' as const)
          : ('center' as const)
      const axisTitleW = isEdge
        ? staggerHeaders
          ? baseMaxTitleW
          : Math.max(38, Math.floor(axisGap * 0.44))
        : baseMaxTitleW
      return {
        dim: idx,
        name: sanitizeChartLabel(dimKey),
        type: 'value' as const,
        scale: true,
        splitNumber: isCompact ? 3 : 4,
        nameLocation: 'end' as const,
        nameGap: staggerHeaders && idx % 2 === 1 ? 23 : 11,
        nameTruncate: {
          maxWidth: axisTitleW,
        },
        nameTextStyle: {
          align,
          width: axisTitleW,
          overflow: 'truncate' as const,
        },
        ...(isLast
          ? {
              axisLabel: {
                color: theme.textSecondary,
                fontSize: isCompact ? 9.5 : 10,
                hideOverlap: true,
                align: 'right' as const,
                margin: 6,
                inside: true,
                textBorderColor: haloColor,
                textBorderWidth: 1.5,
              },
            }
          : {}),
      }
    })

    const readDimVal = (r: Record<string, unknown>, k: string): number | null => {
      const raw = r[k]
      if (raw === null || raw === undefined || raw === '') return null
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, '').trim())
      return Number.isFinite(n) ? n : null
    }
    const showPerRowLegend = rows.length > 0 && rows.length <= 10
    const parallelSeries = showPerRowLegend
      ? rows.map((r, idx) => ({
          name: sanitizeChartLabel(r[labelField] ?? r.name ?? r.model ?? `#${idx + 1}`),
          type: 'parallel' as const,
          smooth: 0.18,
          lineStyle: { width: 2.4, opacity: 0.9 },
          emphasis: { lineStyle: { width: 3.6, opacity: 1 } },
          data: [effectiveDims.map((k) => readDimVal(r, k))],
        }))
      : [
          {
            name: sanitizeChartLabel(props.title ?? 'Series'),
            type: 'parallel' as const,
            smooth: 0.15,
            lineStyle: { width: 1.8, opacity: 0.65, color: theme.brand },
            emphasis: { lineStyle: { width: 3, opacity: 1 } },
            data: rows.map((r, idx) => ({
              name: sanitizeChartLabel(r[labelField] ?? r.name ?? r.model ?? `#${idx + 1}`),
              value: effectiveDims.map((k) => readDimVal(r, k)),
            })),
          },
        ]

    return {
      tooltip: {
        ...baseTooltip,
        trigger: 'item',
        formatter: (p: unknown) => {
          const rec = p as { name?: unknown; seriesName?: unknown; value?: unknown }
          const head = sanitizeChartLabel(rec?.name || rec?.seriesName)
          const vals = Array.isArray(rec?.value) ? rec.value : []
          const lines = head ? [head] : []
          for (let d = 0; d < effectiveDims.length; d++) {
            lines.push(`${sanitizeChartLabel(effectiveDims[d])}: ${vals[d] ?? '—'}`)
          }
          return lines.join('\n')
        },
      },
      legend: showPerRowLegend
        ? legend({
            scroll: true,
            itemWidth: 14,
            itemHeight: 3,
            names: parallelSeries.map((s) => s.name),
          })
        : undefined,
      parallelAxis,
      parallel: {
        top: staggerHeaders ? 50 : 34,
        bottom: showPerRowLegend ? 34 : 16,
        left: padLeft,
        right: padRight,
        parallelAxisDefault: {
          nameGap: 10,
          nameTextStyle: {
            color: theme.textPrimary,
            fontSize: isCompact ? 10 : 10.5,
            fontWeight: 600,
            width: baseMaxTitleW,
            overflow: 'truncate',
          },
          axisLine: borderLine,
          axisTick: borderLine,
          splitLine: { show: false },
          axisLabel: {
            color: theme.textSecondary,
            fontSize: isCompact ? 9.5 : 10,
            hideOverlap: true,
          },
        },
      },
      series: parallelSeries,
    }
  }

  if (props.kind === 'calendar') {
    const dateField = props.xField ?? 'date'
    const valField =
      (typeof props.yField === 'string' && props.yField !== '' ? props.yField : undefined) ??
      props.sizeField ??
      primaryY

    const dateSums = new Map<string, number>()
    for (const r of rows) {
      const iso = normalizeIsoDate(r[dateField] ?? r.date ?? r.day ?? r[xKey])
      if (!iso) continue
      const val = toNumber(r[valField] ?? r.value ?? r.count ?? r[primaryY])
      dateSums.set(iso, (dateSums.get(iso) ?? 0) + val)
    }
    let parsedCells: Array<[string, number]> = [...dateSums.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )

    const curYear = new Date().getUTCFullYear()
    let rangeStart = `${curYear}-01-01`
    let rangeEnd = `${curYear}-06-30`
    if (parsedCells.length > 0) {
      const firstIso = parsedCells[0]![0]
      const lastIso = parsedCells[parsedCells.length - 1]![0]
      const endYear = Number(lastIso.slice(0, 4))
      const startYear = Number(firstIso.slice(0, 4))
      rangeStart = endYear - startYear > 3 ? `${endYear - 2}-01-01` : `${firstIso.slice(0, 7)}-01`
      if (endYear - startYear > 3) {
        parsedCells = parsedCells.filter(([iso]) => iso >= rangeStart)
      }
      const endMonth = Number(lastIso.slice(5, 7))
      const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate()
      rangeEnd = `${lastIso.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`
    }

    const spansMultiYear = rangeStart.slice(0, 4) !== rangeEnd.slice(0, 4)
    const startMs = Date.parse(`${rangeStart}T00:00:00Z`)
    const endMs = Date.parse(`${rangeEnd}T00:00:00Z`)
    const weeksSpan = Math.max(4, Math.ceil((endMs - startMs) / (7 * 86_400_000)))
    const isZh = resolveClientLocale() === 'zh'
    const localeTag = isZh ? 'ZH' : 'EN'
    const calLeft = isCompact ? (isZh ? 24 : 30) : 36
    const calRight = isCompact ? 10 : 16
    const estWidth = chartWidth(600)
    const estHeight = chartHeight
    const estCellW = Math.max(3, (estWidth - calLeft - calRight) / weeksSpan)
    const maxSquareCellH = Math.max(8, Math.ceil(estCellW * 1.6))
    const rowCellH = Math.max(
      8,
      Math.min(20, Math.floor((estHeight - (spansMultiYear ? 82 : 66)) / 7), maxSquareCellH),
    )
    const calGridH = rowCellH * 7
    const calTop = Math.max(spansMultiYear ? 46 : 28, Math.floor((estHeight - 34 - calGridH) / 2))
    const sparseDayNameMap =
      rowCellH < 12
        ? isZh
          ? ['日', '一', '', '三', '', '五', '']
          : ['', 'M', '', 'W', '', 'F', '']
        : localeTag
    const cellBorderW = estCellW < 7 ? 0.8 : estCellW < 10 ? 1.2 : estCellW < 15 ? 1.8 : 2.5
    const monthSlotPx = estCellW * 4.33
    const monthNameMap =
      monthSlotPx < 14
        ? ['1', '', '3', '', '5', '', '7', '', '9', '', '11', '']
        : monthSlotPx < 24
          ? ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
          : monthSlotPx < 38
            ? isZh
              ? [
                  '1月',
                  '2月',
                  '3月',
                  '4月',
                  '5月',
                  '6月',
                  '7月',
                  '8月',
                  '9月',
                  '10月',
                  '11月',
                  '12月',
                ]
              : 'EN'
            : localeTag
    const monthFontSize = monthSlotPx < 24 ? 9 : isCompact ? 9.5 : 11

    const values = parsedCells.map((c) => c[1])
    const rawMin = values.length > 0 ? Math.min(0, ...values) : 0
    const rawMax = values.length > 0 ? Math.max(...values) : 10
    const emptyCellBg = dark ? '#23272f' : '#eef1f5'
    let vmMin = rawMin
    let vmMax = rawMax <= rawMin ? rawMin + 1 : rawMax
    let greenRamp: readonly string[]
    if (rawMin < 0 && rawMax > 0) {
      const absMax = Math.max(Math.abs(rawMin), Math.abs(rawMax))
      vmMin = -absMax
      vmMax = absMax
      greenRamp = [theme.danger, emptyCellBg, theme.success]
    } else if (rawMin < 0) {
      vmMin = rawMin
      vmMax = 0
      greenRamp = [theme.danger, emptyCellBg]
    } else {
      greenRamp = dark
        ? [emptyCellBg, '#143d30', '#059669', '#34d399', '#6ee7b7']
        : [emptyCellBg, '#d1fae5', '#6ee7b7', '#10b981', '#047857']
    }

    return {
      tooltip: {
        ...baseTooltip,
        formatter: (p: unknown) => {
          const val = (p as { value?: unknown })?.value
          if (Array.isArray(val) && val.length >= 2) {
            return `${sanitizeChartLabel(val[0])}: ${sanitizeChartLabel(val[1])}`
          }
          return ''
        },
      },
      visualMap: {
        min: vmMin,
        max: vmMax,
        calculable: false,
        orient: 'horizontal',
        right: calRight,
        bottom: 2,
        itemWidth: 10,
        itemHeight: isCompact ? 52 : 68,
        textStyle: { color: theme.textSecondary, fontSize: 10 },
        inRange: { color: greenRamp },
      },
      calendar: {
        top: calTop,
        left: calLeft,
        right: calRight,
        cellSize: ['auto', rowCellH],
        range: [rangeStart, rangeEnd],
        itemStyle: {
          color: emptyCellBg,
          borderWidth: cellBorderW,
          borderColor: dark ? '#18181b' : '#ffffff',
          borderRadius: estCellW < 9 ? 1.5 : 3,
        },
        splitLine: { show: false },
        yearLabel: {
          show: spansMultiYear,
          color: theme.textSecondary,
          fontSize: isCompact ? 9.5 : 10,
          position: 'top',
          margin: 26,
        },
        monthLabel: {
          color: theme.textSecondary,
          fontSize: monthFontSize,
          margin: spansMultiYear ? 6 : 8,
          nameMap: monthNameMap,
        },
        dayLabel: {
          firstDay: 1,
          color: theme.textSecondary,
          fontSize: rowCellH < 12 ? 9 : isCompact ? 9.5 : 10,
          nameMap: sparseDayNameMap,
        },
      },
      series: [
        {
          type: 'heatmap',
          coordinateSystem: 'calendar',
          data: parsedCells,
        },
      ],
    }
  }

  return null
}
