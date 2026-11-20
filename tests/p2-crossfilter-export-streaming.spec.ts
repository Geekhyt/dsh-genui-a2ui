import { describe, expect, it } from 'vitest'
import {
  computeNextCrossFilterSelection,
  filterTableRowsByField,
  formatChartDataToCsv,
} from '../src/client/catalog/v4-helpers.ts'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { createEvalSession } from '../src/host/eval-suite.ts'

describe('P2: Chart <-> ProTable Cross-Filtering, Chart Export & Streaming', () => {
  it('toggles cross-filter selection cleanly (select, switch, click-again-to-clear)', () => {
    expect(computeNextCrossFilterSelection('', '华东')).toBe('华东')
    expect(computeNextCrossFilterSelection('华东', '华南')).toBe('华南')
    expect(computeNextCrossFilterSelection('华东', '华东')).toBe('')
    expect(computeNextCrossFilterSelection('us-east', 'US-East')).toBe('')
    expect(computeNextCrossFilterSelection('华东', '   ')).toBe('')
  })

  it('filters ProTable rows locally at 0ms with exact-first and substring fallback', () => {
    const rows = [
      { id: 1, region: 'US', revenue: 120 },
      { id: 2, region: 'US-West', revenue: 80 },
      { id: 3, region: '华东', revenue: 310 },
      { id: 4, region: '华南', revenue: 205 },
    ]

    // Empty filter returns original rows untouched
    expect(filterTableRowsByField(rows, 'region', '')).toHaveLength(4)

    // Exact match takes precedence so "US" does not accidentally match "US-West"
    const usOnly = filterTableRowsByField(rows, 'region', 'us')
    expect(usOnly.map((r) => r.id)).toEqual([1])

    // Substring fallback handles Sankey/annotated labels like "华东 310w"
    const eastFromLabel = filterTableRowsByField(rows, 'region', '华东 310w')
    expect(eastFromLabel.map((r) => r.id)).toEqual([3])

    // Omitted filterField scans all columns
    const anyCol = filterTableRowsByField(rows, undefined, '华南')
    expect(anyCol.map((r) => r.id)).toEqual([4])
  })

  it('serializes tabular and graph/sankey chart datasets to UTF-8 BOM CSV', () => {
    const tabular = [
      { region: '华东', gmv: 9860, note: 'core, tier1' },
      { region: '华南', gmv: 7420, note: 'growth "fast"' },
    ]
    const csv = formatChartDataToCsv(tabular)
    expect(csv).not.toBeNull()
    expect(csv?.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('region,gmv,note')
    expect(csv).toContain('华东,9860,"core, tier1"')
    expect(csv).toContain('华南,7420,"growth ""fast"""')

    const sankey = {
      nodes: [{ name: '曝光' }, { name: '成交' }],
      links: [{ source: '曝光', target: '成交', value: 128 }],
    }
    const sankeyCsv = formatChartDataToCsv(sankey)
    expect(sankeyCsv).toContain('source,target,value')
    expect(sankeyCsv).toContain('曝光,成交,128')

    expect(formatChartDataToCsv([])).toBeNull()
    expect(formatChartDataToCsv(null)).toBeNull()
  })

  it('dims non-selected items and highlights the active item across bar, pie, and sankey at 276px compact width', () => {
    const barRows = [
      { region: '华东', gmv: 9860 },
      { region: '华南', gmv: 7420 },
      { region: '华北', gmv: 6180 },
    ]
    const barOpt = buildChartOption(
      {
        kind: 'bar',
        data: barRows,
        xField: 'region',
        yField: 'gmv',
        selected: '华东',
      },
      true,
      276,
    ) as { series: Array<{ data: Array<{ value: number; itemStyle: { opacity: number } }> }> }
    expect(barOpt.series[0]?.data[0]?.itemStyle.opacity).toBe(1)
    expect(barOpt.series[0]?.data[1]?.itemStyle.opacity).toBeLessThan(0.4)
    expect(barOpt.series[0]?.data[2]?.itemStyle.opacity).toBeLessThan(0.4)

    const pieOpt = buildChartOption(
      {
        kind: 'pie',
        data: barRows,
        xField: 'region',
        yField: 'gmv',
        selected: '华南',
      },
      false,
      276,
    ) as { series: Array<{ data: Array<{ name: string; itemStyle: { opacity: number } }> }> }
    expect(pieOpt.series[0]?.data[0]?.itemStyle.opacity).toBeLessThan(0.4)
    expect(pieOpt.series[0]?.data[1]?.itemStyle.opacity).toBe(1)

    const sankeyOpt = buildChartOption(
      {
        kind: 'sankey',
        data: [
          { source: '曝光', target: '访问', value: 186 },
          { source: '访问', target: '成交', value: 42 },
        ],
        selected: '访问',
      },
      true,
      276,
    ) as { series: Array<{ data: Array<{ name: string; itemStyle?: { opacity: number } }> }> }
    const visitedNode = sankeyOpt.series[0]?.data.find((n) => n.name === '访问')
    const otherNode = sankeyOpt.series[0]?.data.find((n) => n.name === '曝光')
    expect(visitedNode?.itemStyle?.opacity).toBe(1)
    expect(otherNode?.itemStyle?.opacity).toBeLessThan(0.4)
  })

  it('compiles a full A2UI 1.0 Chart <-> ProTable cross-filtering surface cleanly', () => {
    const sessions = createEvalSession()
    const dsl = [
      'surface("p2_crossfilter_demo")',
      '$/activeRegion = ""',
      '$/regional = [{ region: "华东", gmv: 9860, orders: 420 }, { region: "华南", gmv: 7420, orders: 315 }, { region: "华北", gmv: 6180, orders: 268 }]',
      '$/orders = [{ id: "ORD-1", region: "华东", customer: "星海科技", amount: 3200 }, { id: "ORD-2", region: "华南", customer: "岭南数科", amount: 2450 }, { id: "ORD-3", region: "华北", customer: "燕京智算", amount: 1890 }]',
      'charts = Row([Chart("bar", $/regional, title="各区域 GMV（点击联动筛选）", xField="region", yField="gmv", selected=$/activeRegion, height=220, weight=1), Chart("pie", $/regional, title="区域占比（双向同步）", xField="region", yField="gmv", selected=$/activeRegion, height=220, weight=1)], align="stretch")',
      'tbl = Table($/orders, title="订单明细（0ms 联动筛选）", filterField="region", filterValue=$/activeRegion, searchable=true, exportable=true, showSummary=true)',
      'root = Card(Column([charts, tbl]))',
    ].join('\n')

    const ops = sessions.compile('p2_demo', dsl)
    expect(ops.length).toBeGreaterThan(0)
  })
})
