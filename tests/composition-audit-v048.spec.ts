import { describe, expect, it } from 'vitest'
import { enrichActionWithSelection, formatActionMessage } from '../src/client/action-protocol.ts'
import { normalizeKeyValueItems, normalizeStepItems } from '../src/client/catalog/p0-helpers.ts'
import {
  buildSparklineGeometry,
  normalizeFileEntries,
} from '../src/client/catalog/stat-file-helpers.ts'
import {
  buildServiceGraphLayout,
  computeMetricRingGeometry,
  normalizeComparisonData,
  normalizeSourceItems,
} from '../src/client/catalog/v3-helpers.ts'
import {
  buildEndpointCurl,
  computeTableNumericSummary,
  detectNumericColumnKeys,
  formatChartDataToCsv,
  normalizeMatrixData,
  normalizeScheduleItems,
} from '../src/client/catalog/v4-helpers.ts'
import {
  clampAndStepNumber,
  normalizeCheckCardOptions,
  normalizeHierarchyTree,
} from '../src/client/catalog/v5-helpers.ts'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { StreamingExpressSession } from '../src/client/runtime/streaming.ts'
import {
  collectObscuredContextPointersFromMessages,
  sanitizePayloadObject,
} from '../src/host/ask-tool.ts'
import { SurfaceSessions } from '../src/host/generator.ts'
import { isSubagentCall } from '../src/host/render-tool.ts'
import {
  desugarExpressConcat,
  expandDateRangeShorthandChecks,
  extractUpdateSurfaceIds,
  flattenChainedCalc,
} from '../src/shared/express-preprocess.ts'

describe('v0.4.8 composition & systemic hardening audit', () => {
  it('guarantees ECharts tooltip high contrast when host Light Mode sets dark tooltipBg', () => {
    const prevDoc = globalThis.document
    const prevGetComputedStyle = globalThis.getComputedStyle
    try {
      const fakeBody = {} as HTMLElement
      Object.defineProperty(globalThis, 'document', {
        value: { body: fakeBody, documentElement: fakeBody },
        configurable: true,
      })
      Object.defineProperty(globalThis, 'getComputedStyle', {
        value: () => ({
          getPropertyValue: (name: string) => {
            if (name === '--dsw-alias-tooltip-bg') return '#2c2c2e'
            if (name === '--dsw-alias-tooltip-label') return '#ffffff'
            if (name === '--dsw-alias-label-primary') return '#0f1115'
            if (name === '--dsw-alias-label-secondary') return '#4b5563'
            if (name === '--dsw-alias-border-l1') return 'rgba(0, 0, 0, 0.1)'
            return ''
          },
        }),
        configurable: true,
      })
      const opt = buildChartOption(
        {
          kind: 'bar',
          data: [
            { x: 'A', y: 10 },
            { x: 'B', y: 20 },
          ],
        },
        false,
        276,
      ) as { tooltip: { backgroundColor: string; textStyle: { color: string } } }
      expect(opt.tooltip.backgroundColor).toBe('#2c2c2e')
      expect(opt.tooltip.textStyle.color).toBe('#ffffff')

      Object.defineProperty(globalThis, 'getComputedStyle', {
        value: () => ({
          getPropertyValue: (name: string) => {
            if (name === '--dsw-alias-tooltip-bg') return '#2c2c2e'
            if (name === '--dsw-alias-tooltip-label') return ''
            if (name === '--dsw-alias-label-primary') return '#0f1115'
            return ''
          },
        }),
        configurable: true,
      })
      const fallbackOpt = buildChartOption(
        {
          kind: 'line',
          data: [{ x: 'A', y: 10 }],
        },
        false,
        276,
      ) as { tooltip: { textStyle: { color: string } } }
      expect(fallbackOpt.tooltip.textStyle.color).toBe('#f9fafb')
    } finally {
      Object.defineProperty(globalThis, 'document', { value: prevDoc, configurable: true })
      Object.defineProperty(globalThis, 'getComputedStyle', {
        value: prevGetComputedStyle,
        configurable: true,
      })
    }
  })

  it('fixes all-negative bar baseline, flipped negative bar radii, parallel 6-dim right margin, gauge pointer, graph edges, and waterfall zero-crossing labels', () => {
    const negBar = buildChartOption(
      {
        kind: 'bar',
        data: [
          { item: '冷存', delta: -100 },
          { item: '压缩', delta: -85 },
          { item: '回收', delta: -80 },
        ],
        xField: 'item',
        yField: 'delta',
        referenceLine: -79,
        referenceLabel: '基线 -79',
      },
      true,
      276,
    ) as {
      yAxis: { max?: number; min?: number }
      series: Array<{ data: Array<{ value: number; itemStyle: { borderRadius: number[] } }> }>
    }
    expect(negBar.yAxis.max).toBeUndefined()
    expect(negBar.series[0]?.data[0]?.itemStyle.borderRadius).toEqual([0, 0, 4, 4])

    const parallel6 = buildChartOption(
      {
        kind: 'parallel',
        data: [
          { model: 'V3', a: 100, b: 20, c: 10, d: 128, e: 92, f: 99.1 },
          { model: 'R1', a: 68, b: 44, c: 28, d: 128, e: 97, f: 98.2 },
        ],
        seriesField: 'model',
        yField: ['a', 'b', 'c', 'd', 'e', 'f'],
      },
      true,
      276,
    ) as {
      parallel: {
        left: number
        right: number
        parallelAxisDefault: { axisLabel: { hideOverlap: boolean } }
      }
    }
    expect(parallel6.parallel.right).toBeGreaterThanOrEqual(36)
    expect(parallel6.parallel.left).toBeLessThan(parallel6.parallel.right)
    expect(parallel6.parallel.parallelAxisDefault.axisLabel.hideOverlap).toBe(true)

    const gaugeOpt = buildChartOption(
      {
        kind: 'gauge',
        data: [{ name: '健康度', value: 78.5, max: 100 }],
      },
      false,
      276,
    ) as { series: Array<{ pointer: { length: string } }> }
    expect(gaugeOpt.series[0]?.pointer.length).toBe('48%')

    const graphOpt = buildChartOption(
      {
        kind: 'graph',
        data: {
          nodes: [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' },
          ],
          links: [{ source: 'a', target: 'b', label: '2ms' }],
        },
      },
      false,
      276,
    ) as { series: Array<{ lineStyle: { color: string; opacity: number } }> }
    expect(graphOpt.series[0]?.lineStyle.color).not.toBe('rgba(0,0,0,0.1)')

    const wfCross = buildChartOption(
      {
        kind: 'waterfall',
        data: [
          { step: '期初', delta: 40 },
          { step: '采购', delta: -65 },
          { step: '支出', delta: -35 },
          { step: '净额', delta: -60, total: true },
        ],
        xField: 'step',
        yField: 'delta',
      },
      false,
      276,
    ) as {
      legend: { formatter?: (name: string) => string }
      series: Array<{
        stack?: string
        name?: string
        data: Array<
          | number
          | '-'
          | {
              value: number
              itemStyle?: { borderRadius?: number[] }
              label?: { show?: boolean; position?: string; formatter?: () => string }
            }
        >
      }>
    }
    const decPosSeries = wfCross.series.find(
      (s) => s.stack === 'waterfall' && s.name?.includes('缩减'),
    )
    const decNegSeries = wfCross.series.find(
      (s) => s.stack === 'waterfall-neg' && s.name?.includes('缩减'),
    )
    const crossPosItem = decPosSeries?.data[1] as {
      itemStyle?: { borderRadius?: number[] }
      label?: { show?: boolean }
    }
    const crossNegItem = decNegSeries?.data[1] as {
      itemStyle?: { borderRadius?: number[] }
      label?: { show?: boolean; position?: string; formatter?: () => string }
    }
    expect(crossPosItem?.itemStyle?.borderRadius).toEqual([4, 4, 0, 0])
    expect(crossPosItem?.label?.show).toBe(false)
    expect(crossNegItem?.itemStyle?.borderRadius).toEqual([0, 0, 4, 4])
    expect(crossNegItem?.label?.show).toBe(true)
    expect(crossNegItem?.label?.position).toBe('bottom')
    expect(crossNegItem?.label?.formatter?.()).toBe('-65')
  })

  it('supports cross-filter hierarchy propagation, sunburst nodeClick guard, boxplot/parallel filtering, and scroll legend pagination slots', () => {
    const sunburstOpt = buildChartOption(
      {
        kind: 'sunburst',
        data: [
          {
            name: 'Compute',
            children: [
              { name: 'GPU', value: 60 },
              { name: 'CPU', value: 40 },
            ],
          },
          { name: 'Storage', value: 30 },
        ],
        selected: 'Compute',
        interactiveSelect: true,
      },
      true,
      276,
    ) as {
      series: Array<{
        nodeClick: unknown
        data: Array<{
          name: string
          itemStyle: { opacity: number }
          children?: Array<{ name: string; itemStyle: { opacity: number } }>
        }>
      }>
    }
    expect(sunburstOpt.series[0]?.nodeClick).toBe(false)
    expect(sunburstOpt.series[0]?.data[0]?.children?.[0]?.itemStyle.opacity).toBe(1)
    expect(sunburstOpt.series[0]?.data[1]?.itemStyle.opacity).toBe(0.3)

    const line4 = buildChartOption(
      {
        kind: 'line',
        data: [
          { t: '00:00', 'Gateway-P99': 80, 'Router-P99': 60, 'Cache-L1': 40, 'Auth-Svc': 20 },
          { t: '12:00', 'Gateway-P99': 90, 'Router-P99': 70, 'Cache-L1': 50, 'Auth-Svc': 30 },
        ],
        xField: 't',
        yField: ['Gateway-P99', 'Router-P99', 'Cache-L1', 'Auth-Svc'],
        referenceLine: 75,
        referenceLabel: 'SLO 200ms',
      },
      true,
      276,
    ) as {
      legend: { itemGap: number; textStyle: { width?: number; overflow?: string } }
      series: Array<{ markLine?: { label?: { width?: number; formatter?: string } } }>
    }
    expect(line4.legend.textStyle.width).toBeGreaterThanOrEqual(42)
    expect(line4.legend.textStyle.overflow).toBe('truncate')
    expect(line4.legend.itemGap).toBeGreaterThanOrEqual(24)
    expect(line4.series[0]?.markLine?.label?.width).toBeUndefined()
    expect(line4.series[0]?.markLine?.label?.formatter).toBe('SLO 200ms')

    const comboNoLine = buildChartOption(
      {
        kind: 'combo',
        data: [
          { m: 'Q1', rev: 100 },
          { m: 'Q2', rev: 120 },
        ],
        xField: 'm',
        yField: 'rev',
      },
      true,
      400,
    ) as { yAxis: unknown[] }
    expect(comboNoLine.yAxis).toHaveLength(1)
  })

  it('hardens MetricRing precision/sizing, ServiceGraph 3-node fit, ProTable dash numeric detection, and helper edge cases', () => {
    const sla = computeMetricRingGeometry({ value: 99.9997, max: 100, size: 64, unit: '%' })
    expect(sla.displayNumber).toBe('99.9997')
    const big = computeMetricRingGeometry({ value: 1234567, max: 2000000, size: 64, unit: 'req/s' })
    expect(big.numberFontSize).toBeLessThan(9)
    expect(big.stackUnit).toBe(true)

    const sg = buildServiceGraphLayout(
      [
        { id: 'gw', label: 'API Gateway', group: 'edge-gateway', metric: '2.4k RPS' },
        { id: 'api', label: 'Checkout API', group: 'core-order', metric: 'P99 184ms' },
        { id: 'risk', label: 'Fraud Scorer · TiKV', group: 'risk-engine', metric: 'P99 142ms' },
      ],
      [
        { from: 'gw', to: 'api', label: 'HTTP 200' },
        { from: 'api', to: 'risk', label: 'region #19 慢读' },
        { from: 'gw', to: 'risk', label: '直连回退' },
      ],
      'LR',
    )
    const gwNode = sg.nodes.find((n) => n.id === 'gw')
    expect(gwNode?.width ?? 0).toBeGreaterThanOrEqual(132)
    expect(621 / sg.width).toBeGreaterThanOrEqual(0.85)

    const numKeys = detectNumericColumnKeys(
      [{ key: 'svc' }, { key: 'qps' }, { key: 'errRate' }],
      [
        { svc: 'a', qps: '1420', errRate: '0.02%' },
        { svc: 'b', qps: '-', errRate: '0.00%' },
        { svc: 'c', qps: '860', errRate: '0.14%' },
      ],
    )
    expect(numKeys.has('qps')).toBe(true)
    expect(numKeys.has('errRate')).toBe(true)
    const summary = computeTableNumericSummary(
      [{ key: 'svc' }, { key: 'qps' }, { key: 'errRate' }],
      [
        { svc: 'a', qps: '1420', errRate: '0.02%' },
        { svc: 'b', qps: '-', errRate: '0.00%' },
        { svc: 'c', qps: '860', errRate: '0.14%' },
      ],
      numKeys,
    )
    expect(summary.qps).toBe('2,280')
    expect(summary.errRate).toBe('Avg 0.05%')

    const sched = normalizeScheduleItems(
      [
        { title: 'Prep', start: '21:30', end: '22:30' },
        { title: 'Cutover', start: '23:00', end: '01:00' },
      ],
      ['22:00', '02:00'],
    )
    expect(sched.tracks[0]!.leftPct).toBe(0)
    expect(sched.tracks[1]!.leftPct).toBeGreaterThan(0)

    const intraday = normalizeScheduleItems([
      { title: 'A', start: '2026-11-22T09:00:00Z', end: '2026-11-22T12:00:00Z' },
    ])
    expect(intraday.axisTicks[0]).toMatch(/^\d{2}:\d{2}$/)

    const mat = normalizeMatrixData({
      rows: ['r1'],
      columns: ['c1', 'c2', 'c3'],
      values: [['42.5', Number.NaN, 'warn:']],
    })
    expect(mat.cells[0]?.[0]?.kind).toBe('number')
    expect(mat.cells[0]?.[1]?.kind).toBe('empty')
    expect(mat.cells[0]?.[2]?.display).toBe('!')

    expect(
      buildEndpointCurl({
        method: 'GET',
        path: 'https://custom.io/v1/x',
        baseUrl: 'https://api.example.com',
      }),
    ).toContain("'https://custom.io/v1/x'")

    expect(
      formatChartDataToCsv({
        name: 'Root',
        children: [{ name: 'Leaf', value: 10 }],
      }),
    ).toContain('Root / Leaf')

    expect(clampAndStepNumber({ current: '', delta: 1, min: 10, step: 2 })).toBe(12)
    expect(normalizeCheckCardOptions([{ value: 'free', title: 'Free', price: 0 }])[0]?.badge).toBe(
      '0',
    )
    expect(
      normalizeHierarchyTree([{ id: 'n1', value: '', label: 'Zero', badge: 0, metric: 0 }])[0],
    ).toMatchObject({ value: 'n1', badge: '0', metric: '0' })

    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular
    expect(() => normalizeKeyValueItems([{ label: 'cyc', value: circular }])).not.toThrow()
    expect(normalizeStepItems([null, 'First', undefined, 'Second'], 0)).toHaveLength(2)
    expect(
      normalizeComparisonData(['a', 'a'], [{ label: 'd', values: { a: 'ok:1' } }]).options,
    ).toHaveLength(1)
    expect(normalizeSourceItems([null, { title: 'Doc 1' }])[0]?.index).toBe(1)
    expect(buildSparklineGeometry([1e308, -1e308])).not.toBeNull()
    expect(normalizeFileEntries(['./src/index.ts'])[0]?.path).toBe('src/index.ts')
  })

  it('prevents action secret re-injection, preserves token_* surfaceId roots, and fixes host ask parent-path & streaming close', () => {
    const enriched = enrichActionWithSelection({
      name: 'click',
      surfaceId: 'token_calculator',
      sourceComponentId: 'c1',
      timestamp: '2026-11-22T00:00:00Z',
      context: {},
      metadata: {
        extensions: {
          dshSelection: { source: 'chart', label: 'Q1', secret: 'leaked' },
        },
      },
    } as Parameters<typeof enrichActionWithSelection>[0])
    expect(
      (enriched as { metadata?: { extensions?: Record<string, unknown> } }).metadata?.extensions
        ?.dshSelection,
    ).toBeUndefined()

    const formatted = formatActionMessage(enriched, {
      token_calculator: { rate: 42, apiKey: 'secret-val' },
    })
    expect(formatted).toContain('"token_calculator"')
    expect(formatted).toContain('"rate":42')
    expect(formatted).not.toContain('secret-val')

    const askSanitized = sanitizePayloadObject(
      { token_calculator: { form: { name: 'Alice', pass: 'pw123' } } },
      new Set(['/form/pass']),
      true,
    )
    expect(askSanitized).toEqual({ token_calculator: { form: { name: 'Alice' } } })

    const sessions = new SurfaceSessions()
    const askMsgs = sessions.compile(
      'sec-parent-test',
      `surface("s1")
tf = TextField("Pin", $/form/pin, variant="obscured")
btn = Button(Text("Go"), action=Event("go", { whole: $/form }))
root = Column([tf, btn])`,
    )
    const obsCtx = collectObscuredContextPointersFromMessages(askMsgs, new Set(['/form/pin']))
    expect(obsCtx.has('/whole')).toBe(true)

    expect(
      isSubagentCall({ agent: { session: { parentId: '', header: { parentSession: '  ' } } } }),
    ).toBe(false)

    const stream = new StreamingExpressSession()
    const snap = stream.advance('surface("ext", update=true)\nroot = Text("hi")', true)
    expect(snap.error).toBeNull()
    expect(snap.messages.length).toBeGreaterThan(0)
  })

  it('fixes express-preprocess multi-line comments, PI/E constant shadowing, bare ?required, inline nested calc, and update surface dedup', () => {
    const multiLine = desugarExpressConcat('x = Text(\n  # note\n  "a" + "b"\n)')
    expect(multiLine).toContain('concat(["a", "b"])')

    const piProg = `a = calc("PI * r", { r: $/r })\nb = calc("a + PI", { a: a, PI: $/custom })`
    const flattened = flattenChainedCalc(piProg)
    expect(flattened).not.toContain('(PI * r) + PI')

    const nestedInline = flattenChainedCalc('x = calc("v + 1", { v: calc("n * 2", { n: $/n }) })')
    expect(nestedInline).toContain('(n * 2) + 1')

    const dr = expandDateRangeShorthandChecks(
      'dr = DateRange("Range", $/s, $/e, ?required) # comment',
    )
    expect(dr).toContain('?and([required($/s), required($/e)])')

    const ids = extractUpdateSurfaceIds(
      'surface("local")\nroot = Text("1")\nsurface("local", update=true)\nsurface("ext", update=true)\nsurface("ext", update=true)',
    )
    expect(ids).toEqual(['ext'])
  })
})
