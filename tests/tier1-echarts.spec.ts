import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EChartsWidget } from '../src/client/catalog/EChartsWidget.tsx'
import { computeMetricRingGeometry } from '../src/client/catalog/v3-helpers.ts'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { CHART_KINDS } from '../src/shared/catalog-schema.ts'
import { setUiLocaleOverride } from '../src/shared/i18n.ts'

echarts.use([SVGRenderer])

function renderOptionToSvg(option: echarts.EChartsCoreOption): string {
  const inst = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 640, height: 260 })
  try {
    inst.setOption({ animation: false, ...option })
    return inst.renderToSVGString()
  } finally {
    inst.dispose()
  }
}

describe('Tier-1 ECharts Expansion (14 -> 19 Kinds + y2Field + referenceLine)', () => {
  it('includes waterfall, combo, sunburst, parallel, and calendar in CHART_KINDS without leaking into cold-boot chunks', () => {
    expect(CHART_KINDS).toEqual(
      expect.arrayContaining(['waterfall', 'combo', 'sunburst', 'parallel', 'calendar']),
    )
    expect(CHART_KINDS).toHaveLength(19)

    const clientEntry = readFileSync(resolve(import.meta.dirname, '../lib/client.js'), 'utf8')
    const runtimeChunk = readFileSync(
      resolve(import.meta.dirname, '../lib/client.runtime.js'),
      'utf8',
    )
    for (const sym of ['SunburstChart', 'ParallelChart', 'CalendarComponent']) {
      expect(clientEntry).not.toContain(sym)
      expect(runtimeChunk).not.toContain(sym)
    }
  })

  it('builds and SSR-renders valid ECharts 6 SVG options for all 5 new chart kinds and referenceLine', () => {
    // 1. Waterfall + referenceLine + zh/en locale labels
    const wfOpt = buildChartOption(
      {
        kind: 'waterfall',
        data: [
          { step: 'Q2 基线', delta: 480, total: true },
          { step: '新客签约', delta: 165 },
          { step: '客户流失', delta: -45 },
          { step: 'Q3 实绩', delta: 600, total: true },
        ],
        xField: 'step',
        yField: 'delta',
        referenceLine: 550,
        referenceLabel: '目标 ¥550w',
      },
      true,
      640,
    ) as { series: Array<{ data: unknown[]; markLine?: { label?: { formatter?: string } } }> }
    expect(wfOpt.series).toHaveLength(4)
    expect(wfOpt.series[0]?.data).toEqual([0, 480, 600, 0])
    expect(wfOpt.series[1]?.markLine?.label?.formatter).toBe('目标 ¥550w')
    const wfSvg = renderOptionToSvg(wfOpt)
    expect(wfSvg).toContain('<svg')
    expect(wfSvg).toContain('目标 ¥550w')

    try {
      setUiLocaleOverride('en')
      const wfEn = buildChartOption(
        {
          kind: 'waterfall',
          data: [
            { name: 'Add', value: 20 },
            { name: 'Drop', value: -5 },
          ],
        },
        false,
      ) as { legend: { data: string[] } }
      expect(wfEn.legend.data).toEqual(['Increase', 'Decrease'])
    } finally {
      setUiLocaleOverride(null)
    }

    // 2. Combo dual-axis (explicit y2Field + auto fallback + SLO referenceLine)
    const comboOpt = buildChartOption(
      {
        kind: 'combo',
        data: [
          { hour: '10:00', qps: 280, p99: 115 },
          { hour: '16:00', qps: 495, p99: 224 },
        ],
        xField: 'hour',
        yField: 'qps',
        y2Field: 'p99',
        referenceLine: 200,
        referenceLabel: 'SLO 200ms',
      },
      true,
      640,
    ) as {
      yAxis: unknown[]
      series: Array<{ type: string; yAxisIndex: number; markLine?: unknown }>
    }
    expect(comboOpt.yAxis).toHaveLength(2)
    expect(comboOpt.series).toHaveLength(2)
    expect(comboOpt.series[0]?.type).toBe('bar')
    expect(comboOpt.series[0]?.yAxisIndex).toBe(0)
    expect(comboOpt.series[1]?.type).toBe('line')
    expect(comboOpt.series[1]?.yAxisIndex).toBe(1)
    expect(comboOpt.series[1]?.markLine).toBeDefined()
    const comboSvg = renderOptionToSvg(comboOpt)
    expect(comboSvg).toContain('SLO 200ms')

    // 3. Sunburst (nested tree + flat parent group + compact mode)
    const sunburstOpt = buildChartOption(
      {
        kind: 'sunburst',
        data: [
          { name: '深度研究', cost: 36, parent: 'AI 对话' },
          { name: 'Milvus', cost: 18, parent: '向量检索' },
        ],
        xField: 'name',
        yField: 'cost',
        seriesField: 'parent',
      },
      true,
      640,
    ) as { series: Array<{ type: string; nodeClick: string; data: unknown[] }> }
    expect(sunburstOpt.series[0]?.type).toBe('sunburst')
    expect(sunburstOpt.series[0]?.nodeClick).toBe('rootToNode')
    expect(sunburstOpt.series[0]?.data).toHaveLength(2)
    expect(renderOptionToSvg(sunburstOpt)).toContain('<svg')
    expect(
      renderOptionToSvg(
        buildChartOption({ kind: 'sunburst', data: [{ name: 'A', value: 10 }] }, false, 320),
      ),
    ).toContain('<svg')

    // 4. Parallel coordinates (<=10 named legend series & >10 bulk sweep mode)
    const parallelOpt = buildChartOption(
      {
        kind: 'parallel',
        data: [
          { model: 'DeepSeek-R1', gpqa: 86, ttft: 620, tps: 52 },
          { model: 'DeepSeek-V3', gpqa: 76, ttft: 220, tps: 118 },
        ],
        xField: 'model',
        yField: ['gpqa', 'ttft', 'tps'],
      },
      true,
      640,
    ) as { parallelAxis: unknown[]; series: Array<{ name: string; type: string }> }
    expect(parallelOpt.parallelAxis).toHaveLength(3)
    expect(parallelOpt.series.map((s) => s.name)).toEqual(['DeepSeek-R1', 'DeepSeek-V3'])
    expect(renderOptionToSvg(parallelOpt)).toContain('<svg')

    // 5. Calendar heatmap (chronological range auto-inference + empty fallback)
    const calOpt = buildChartOption(
      {
        kind: 'calendar',
        data: [
          { date: '2026-10-03', count: 8 },
          { date: '2026-11-18', count: 19 },
        ],
        xField: 'date',
        yField: 'count',
      },
      true,
      640,
    ) as { calendar: { range: [string, string] }; series: Array<{ coordinateSystem: string }> }
    expect(calOpt.calendar.range).toEqual(['2026-10-01', '2026-11-30'])
    expect(calOpt.series[0]?.coordinateSystem).toBe('calendar')
    expect(renderOptionToSvg(calOpt)).toContain('<svg')
    expect(renderOptionToSvg(buildChartOption({ kind: 'calendar', data: [] }, false))).toContain(
      '<svg',
    )

    // 6. Cross-cutting referenceLine on standard Cartesian line/bar
    const lineRef = buildChartOption(
      {
        kind: 'line',
        data: [
          { t: 'T1', ms: 120 },
          { t: 'T2', ms: 240 },
        ],
        xField: 't',
        yField: 'ms',
        referenceLine: 180,
      },
      false,
    ) as { series: Array<{ markLine?: { label?: { formatter?: string } } }> }
    expect(lineRef.series[0]?.markLine?.label?.formatter).toBe('180')
  })

  it('compiles all 5 new Chart kinds and reactive $/path referenceLine cleanly in A2UI Express', () => {
    const sessions = new SurfaceSessions(createGenerator())
    const program = [
      'surface("tier1_charts")',
      '$/slo = 200',
      '$/wf = [{ step: "Q2", delta: 480, total: true }, { step: "新增", delta: 120 }, { step: "Q3", delta: 600, total: true }]',
      '$/combo = [{ h: "10:00", qps: 300, p99: 140 }, { h: "16:00", qps: 500, p99: 225 }]',
      '$/tree = [{ name: "R1", cost: 36, parent: "对话" }, { name: "Milvus", cost: 18, parent: "检索" }]',
      '$/models = [{ m: "R1", gpqa: 86, tps: 52 }, { m: "V3", gpqa: 76, tps: 118 }]',
      '$/cal = [{ date: "2026-11-01", count: 6 }, { date: "2026-11-20", count: 15 }]',
      'root = Card(Column([',
      '  Slider("SLO 阈值 (ms)", 100, 300, $/slo, steps=20),',
      '  Chart("waterfall", $/wf, xField="step", yField="delta", referenceLine=550, referenceLabel="目标线", title="ARR 归因瀑布图"),',
      '  Chart("combo", $/combo, xField="h", yField="qps", y2Field="p99", referenceLine=$/slo, referenceLabel="SLO 红线", title="吞吐与延迟双轴图"),',
      '  Chart("sunburst", $/tree, xField="name", yField="cost", seriesField="parent", title="多级成本旭日图"),',
      '  Chart("parallel", $/models, xField="m", yField=["gpqa", "tps"], title="模型多维平行坐标"),',
      '  Chart("calendar", $/cal, xField="date", yField="count", title="发布活跃度日历")',
      ']))',
    ].join('\n')

    const compiled = sessions.compile('sess-tier1-charts', program)
    expect(compiled.length).toBeGreaterThan(0)

    const ssrHtml = renderToStaticMarkup(
      createElement(EChartsWidget, {
        kind: 'combo',
        data: [{ h: '10:00', qps: 300, p99: 140 }],
        xField: 'h',
        yField: 'qps',
        y2Field: 'p99',
        referenceLine: 200,
        referenceLabel: 'SLO 200ms',
        title: '双轴监控',
      }),
    )
    expect(ssrHtml).toContain('data-a2ui-chart="combo"')
    expect(ssrHtml).toContain('双轴监控')
  })

  it('prevents text collisions and clipping in narrow multi-component compositions', () => {
    // 1. Waterfall per-bar label avoidance against referenceLine pill & dashed line at 276px width
    const wfNarrow = buildChartOption(
      {
        kind: 'waterfall',
        data: [
          { step: 'Q2 基线', delta: 480, total: true },
          { step: '新客签约', delta: 165 },
          { step: '老客增购', delta: 110 },
          { step: '缓存降本', delta: 65 },
          { step: '席位缩减', delta: -52 },
          { step: '客户流失', delta: -38 },
          { step: 'Q3 实绩', delta: 730, total: true },
        ],
        xField: 'step',
        yField: 'delta',
        referenceLine: 680,
        referenceLabel: '目标 ¥680w',
      },
      true,
      276,
    ) as {
      series: Array<{
        markLine?: { label?: { position?: string } }
        data: Array<unknown>
      }>
    }
    expect(wfNarrow.series[1]?.markLine?.label?.position).toBe('insideStartTop')
    // Bar 2 (+165) moves inside its green bar instead of colliding with 目标 ¥680w pill
    expect(wfNarrow.series[2]?.data[1]).toMatchObject({
      value: 165,
      label: { position: 'inside' },
    })
    // Bar 6 (-38) flips to 'top' so the dashed 680 referenceLine never slices across it
    expect(wfNarrow.series[3]?.data[5]).toMatchObject({
      value: 38,
      label: { position: 'top' },
    })

    // 2. Combo picks insideStartTop when right edge crosses referenceLine and tightens compact grid
    const comboNarrow = buildChartOption(
      {
        kind: 'combo',
        data: [
          { hour: '08:00', qps: 120, p99: 88 },
          { hour: '12:00', qps: 280, p99: 140 },
          { hour: '18:00', qps: 380, p99: 198 },
          { hour: '22:00', qps: 210, p99: 215 },
        ],
        xField: 'hour',
        yField: 'qps',
        y2Field: 'p99',
        referenceLine: 200,
        referenceLabel: 'SLO 200',
        zoom: true,
      },
      true,
      271,
    ) as {
      grid: { left: number; right: number }
      series: Array<{ markLine?: { label?: { position?: string } } }>
    }
    expect(comboNarrow.series[1]?.markLine?.label?.position).toBe('insideStartTop')
    expect(comboNarrow.grid.left).toBeLessThanOrEqual(8)
    expect(comboNarrow.grid.right).toBeLessThanOrEqual(10)

    // 3. Calendar 12-month narrow (271px) drops to compact numeric month labels & sparse GitHub-style weekday ticks with zero overlap
    const cal12Narrow = buildChartOption(
      {
        kind: 'calendar',
        data: [
          { date: '2026-01-10', count: 5 },
          { date: '2026-12-20', count: 18 },
        ],
        xField: 'date',
        yField: 'count',
        height: 255,
      },
      true,
      271,
    ) as {
      calendar: {
        top: number
        monthLabel: { nameMap: unknown; fontSize: number }
        dayLabel: { nameMap: unknown }
      }
    }
    expect(cal12Narrow.calendar.monthLabel.nameMap).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
    ])
    expect(cal12Narrow.calendar.monthLabel.fontSize).toBe(9)
    expect(cal12Narrow.calendar.dayLabel.nameMap).toEqual(['日', '一', '', '三', '', '五', ''])
    expect(cal12Narrow.calendar.top).toBeGreaterThan(50)

    // 4. Parallel staggers axis headers and sets explicit nameTruncate.maxWidth at 320px
    const parallelNarrow = buildChartOption(
      {
        kind: 'parallel',
        data: [{ model: 'R1', A: 1, B: 2, C: 3, D: 4, E: 5 }],
        xField: 'model',
        yField: [
          'GPQA推理得分',
          '首字响应延迟(ms)',
          '每秒吞吐(tok/s)',
          '百万Token成本($)',
          'A2UI一次合格率(%)',
        ],
      },
      true,
      320,
    ) as { parallelAxis: Array<{ nameGap: number; nameTruncate: { maxWidth: number } }> }
    expect(parallelNarrow.parallelAxis[1]?.nameGap).toBe(23)
    expect(parallelNarrow.parallelAxis[0]?.nameTruncate.maxWidth).toBeGreaterThanOrEqual(76)

    // 5. Radar ultra-narrow (<300px) wraps long CJK+ASCII labels onto two lines
    const radarUltraNarrow = buildChartOption(
      {
        kind: 'radar',
        data: [{ dim: '结构化JSON稳定度', R1: 99, V3: 97 }],
        xField: 'dim',
        yField: ['R1', 'V3'],
      },
      true,
      221,
    ) as { radar: { axisName: { formatter: (s: string) => string } } }
    expect(radarUltraNarrow.radar.axisName.formatter('结构化JSON稳定度')).toContain('\n')

    // 6. Narrow funnel/scatter/boxplot/treemap/graph/candlestick hardening at 276px width
    const funnelNarrow = buildChartOption(
      {
        kind: 'funnel',
        data: [
          { stage: '触达', value: 100 },
          { stage: '安装', value: 60 },
          { stage: '留存', value: 30 },
          { stage: '签约', value: 10 },
        ],
        xField: 'stage',
        yField: 'value',
      },
      true,
      276,
    ) as { legend: { type: string }; series: Array<{ minSize: string }> }
    expect(funnelNarrow.legend.type).toBe('scroll')
    expect(funnelNarrow.series[0]?.minSize).toBe('32%')

    const scatterNarrow = buildChartOption(
      {
        kind: 'scatter',
        data: [
          { latency: 220, score: 75, qps: 100 },
          { latency: 260, score: 73, qps: 90 },
          { latency: 480, score: 85, qps: 70 },
          { latency: 620, score: 88, qps: 50 },
        ],
        xField: 'latency',
        yField: 'score',
        sizeField: 'qps',
        referenceLine: 85,
        referenceLabel: 'S 级基线 85',
      },
      true,
      276,
    ) as { series: Array<{ markLine?: { label?: { position?: string } } }> }
    expect(scatterNarrow.series[0]?.markLine?.label?.position).toBe('insideStartTop')

    const boxNarrow = buildChartOption(
      {
        kind: 'boxplot',
        data: [
          { sector: 'AI 算力芯片', min: -1, q1: 1, median: 3, q3: 5, max: 8 },
          { sector: '云原生软件', min: -2, q1: 0, median: 2, q3: 4, max: 6 },
          { sector: '智能终端硬件', min: -1, q1: 0, median: 1, q3: 2, max: 4 },
          { sector: '企业级数据库', min: -1, q1: 1, median: 2, q3: 4, max: 7 },
        ],
        xField: 'sector',
        referenceLine: 6,
      },
      true,
      276,
    ) as { xAxis: { axisLabel: { interval: number; formatter: (s: string) => string } } }
    expect(boxNarrow.xAxis.axisLabel.interval).toBe(0)
    expect(boxNarrow.xAxis.axisLabel.formatter('企业级数据库')).toContain('\n')

    const candleTight = buildChartOption(
      {
        kind: 'candlestick',
        data: [
          { date: '11-11', open: 3420, close: 3468, low: 3405, high: 3482 },
          { date: '11-18', open: 3522, close: 3586, low: 3518, high: 3598 },
        ],
        xField: 'date',
        referenceLine: 3550,
      },
      true,
      276,
    ) as { yAxis: { max?: number } }
    expect(candleTight.yAxis.max).toBeLessThanOrEqual(3700)

    const graphNarrow = buildChartOption(
      {
        kind: 'graph',
        data: {
          nodes: [
            { id: 'a', name: 'Edge Gateway' },
            { id: 'b', name: 'Prompt Cache' },
          ],
          links: [{ source: 'a', target: 'b', label: '2ms' }],
        },
      },
      true,
      276,
    ) as { series: Array<{ layout?: string; label: { position: string }; right: number }> }
    expect(graphNarrow.series[0]?.layout).toBe('circular')
    expect(graphNarrow.series[0]?.label.position).toBe('bottom')
    expect(graphNarrow.series[0]?.right).toBeGreaterThanOrEqual(40)

    const hbarNarrow = buildChartOption(
      {
        kind: 'bar',
        horizontal: true,
        data: [
          { name: '亚太新加坡高可用推理集群节点01', value: 92 },
          { name: '欧洲法兰克福边缘缓存网关组', value: 64 },
        ],
        xField: 'name',
        yField: 'value',
        referenceLine: 80,
        referenceLabel: 'Target 80%',
      },
      true,
      276,
    ) as {
      xAxis: { splitNumber?: number; axisLabel: { hideOverlap?: boolean } }
      yAxis: { axisLabel: { overflow?: string; width?: number } }
      series: Array<{ markLine?: { label?: { position?: string; rotate?: number } } }>
    }
    expect(hbarNarrow.yAxis.axisLabel.overflow).toBe('truncate')
    expect(hbarNarrow.yAxis.axisLabel.width).toBeLessThanOrEqual(96)
    expect(hbarNarrow.xAxis.splitNumber).toBe(3)
    expect(hbarNarrow.xAxis.axisLabel.hideOverlap).toBe(true)
    expect(hbarNarrow.series[0]?.markLine?.label?.position).toBe('start')
    expect(hbarNarrow.series[0]?.markLine?.label?.rotate).toBe(0)

    const ringStacked = computeMetricRingGeometry({
      value: 12480,
      max: 15000,
      unit: 'req/s',
      size: 68,
    })
    expect(ringStacked.stackUnit).toBe(true)
    expect(ringStacked.displayNumber).toBe('12480')

    const ringHighSla = computeMetricRingGeometry({
      value: 99.995,
      max: 100,
      unit: '%',
      size: 68,
    })
    expect(ringHighSla.stackUnit).toBe(false)
    expect(ringHighSla.displayNumber).toBe('99.995')
  })
})
