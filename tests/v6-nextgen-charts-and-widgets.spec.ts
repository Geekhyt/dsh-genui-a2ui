import * as echarts from 'echarts'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  if (typeof globalThis.HTMLElement === 'undefined') {
    ;(globalThis as Record<string, unknown>).HTMLElement = class {}
  }
  if (typeof globalThis.customElements === 'undefined') {
    const reg = new Map<string, unknown>()
    ;(globalThis as Record<string, unknown>).customElements = {
      get: (name: string) => reg.get(name),
      define: (name: string, ctor: unknown) => reg.set(name, ctor),
    }
  }
})

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: undefined,
  Checkbox: undefined,
  Switch: undefined,
  Input: undefined,
  Pill: undefined,
  SegmentedTabs: undefined,
  SegmentedControl: undefined,
  Tag: undefined,
  Modal: undefined,
  Menu: undefined,
  Toast: undefined,
  Tooltip: undefined,
  CodeBlock: undefined,
  JsonTree: undefined,
  DisclosureRow: undefined,
  MarkdownText: undefined,
  StateDot: undefined,
  HoverCard: undefined,
  HoverCardGroup: undefined,
  ImageLightbox: undefined,
  FileTypeIcon: undefined,
  PathLabel: undefined,
  LinkIconRegular: undefined,
  TextShimmer: undefined,
  IconAppsAddOutlineRegular: undefined,
  IconSearchOutlineRegular: undefined,
  IconChevronDownOutlineRegular: undefined,
  IconChevronUpOutlineRegular: undefined,
  IconCheckOutlineRegular: undefined,
  IconWarningOutlineRegular: undefined,
}))
vi.mock('@deepseek-ai/dsh-client-ui-sidebar-right', () => ({}))
import {
  SHOWCASE_V050_CHARTS_UI,
  SHOWCASE_V050_UPGRADES_UI,
  SHOWCASE_V050_WIDGETS_UI,
} from '../scripts/mock-llm.mjs'
import {
  computeArrayAvg,
  computeArrayCount,
  computeArrayMax,
  computeArrayMin,
  computeArraySum,
} from '../src/client/catalog/functions.ts'
import {
  DshAnnotationTextImpl,
  DshChecklistImpl,
  DshImageCompareImpl,
  DshKvEditorImpl,
  DshRangeSliderImpl,
  DshRatingImpl,
  DshSortableListImpl,
} from '../src/client/catalog/NextGenWidgets.tsx'
import { DshDiffViewImpl } from '../src/client/catalog/P0Widgets.tsx'
import { normalizeDiffAnnotations, normalizeDiffFiles } from '../src/client/catalog/p0-helpers.ts'
import { TableWidget } from '../src/client/catalog/TableWidget.tsx'
import { normalizeHierarchyTree } from '../src/client/catalog/v5-helpers.ts'
import {
  buildAnnotatedTextSegments,
  clampImageComparePosition,
  clampRangeSliderBounds,
  clampRatingScore,
  computeChecklistSummary,
  isKvKeySensitive,
  normalizeChecklistItems,
  normalizeKvEditorRows,
  normalizeSortableItems,
  reorderListItems,
} from '../src/client/catalog/v6-helpers.ts'
import { buildChartOption, computeHistogramBins } from '../src/client/chunks/echarts-chunk.ts'
import { sanitizeDataModel } from '../src/client/persistence.ts'
import { sanitizePayloadObject } from '../src/host/ask-tool.ts'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { CHART_KINDS, DSH_COMPONENT_APIS, DSH_FUNCTION_APIS } from '../src/shared/catalog-schema.ts'

function renderEChartsSvg(option: Record<string, unknown>, width = 276, height = 220): string {
  const inst = echarts.init(null, undefined, { renderer: 'svg', ssr: true, width, height })
  try {
    inst.setOption({ animation: false, ...option })
    return inst.renderToSVGString()
  } finally {
    inst.dispose()
  }
}

describe('v0.5.0 Next-Gen Charts (19 -> 26 Kinds + 5 Horizontal Enhancements)', () => {
  it('registers all 26 chart kinds, 64 components, and 28 functions', () => {
    expect(CHART_KINDS).toHaveLength(26)
    expect(CHART_KINDS).toEqual(
      expect.arrayContaining([
        'range',
        'bullet',
        'histogram',
        'dumbbell',
        'rose',
        'radialBar',
        'chord',
      ]),
    )
    expect(DSH_COMPONENT_APIS).toHaveLength(64)
    expect(DSH_FUNCTION_APIS).toHaveLength(28)
  })

  it('builds and SSR-renders all 7 new chart kinds cleanly at 276px and 240px in Dark & Light modes', () => {
    const specs: Array<{
      readonly kind: (typeof CHART_KINDS)[number]
      readonly input: Record<string, unknown>
    }> = [
      {
        kind: 'range',
        input: {
          data: [
            { day: '周一', low: -10, forecast: 5, high: 20 },
            { day: '周二', low: 15, forecast: 30, high: 45 },
            { day: '周三', low: 25, forecast: 42, high: 65 },
          ],
          xField: 'day',
          yField: 'forecast',
          referenceLine: 50,
          referenceLabel: '上限 50',
          markArea: [{ start: '周一', end: '周二', label: '窗口', tone: 'warning' }],
        },
      },
      {
        kind: 'bullet',
        input: {
          data: [
            {
              label: '核心集群 SLA 达成率超长指标名',
              value: 92,
              target: 90,
              max: 110,
              ranges: [65, 85, 110],
            },
            { label: '缓存命中率', value: 78, target: 85, max: 100 },
          ],
          xField: 'label',
          yField: 'value',
        },
      },
      {
        kind: 'histogram',
        input: {
          data: [12, 16, 18, 22, 24, 25, 31, 35, 42, 48, 55, 62, 78, 95, 112],
          referenceLine: 80,
          referenceLabel: 'P95 80ms',
        },
      },
      {
        kind: 'dumbbell',
        input: {
          data: [
            { name: '支付结算接口 P99 延迟', before: 420, after: 118 },
            { name: '订单检索 P99', before: -20, after: 35 },
          ],
          xField: 'name',
        },
      },
      {
        kind: 'rose',
        input: {
          data: [
            { name: '推理', value: 44 },
            { name: '代码', value: 36 },
            { name: '检索', value: 25 },
            { name: '可视化', value: 29 },
          ],
          xField: 'name',
          yField: 'value',
        },
      },
      {
        kind: 'radialBar',
        input: {
          data: [
            { name: 'GPU 算力', value: 86, max: 100 },
            { name: '显存带宽', value: 74, max: 100 },
            { name: 'KV Cache', value: 91, max: 100 },
          ],
          xField: 'name',
          yField: 'value',
        },
      },
      {
        kind: 'chord',
        input: {
          data: {
            nodes: [{ name: 'Gateway' }, { name: 'Order' }, { name: 'Pay' }, { name: 'Risk' }],
            links: [
              { source: 'Gateway', target: 'Order', value: 64 },
              { source: 'Order', target: 'Pay', value: 52 },
              { source: 'Pay', target: 'Risk', value: 38 },
              { source: 'Risk', target: 'Pay', value: 24 },
              { source: 'Pay', target: 'Gateway', value: 18 },
            ],
          },
        },
      },
    ]

    for (const dark of [true, false]) {
      for (const width of [276, 240]) {
        for (const item of specs) {
          const opt = buildChartOption(
            { kind: item.kind, ...item.input } as never,
            dark,
            width,
          ) as Record<string, unknown>
          expect(Array.isArray(opt.series), `${item.kind} @ ${width}px`).toBe(true)
          const svg = renderEChartsSvg(opt, width, 220)
          expect(svg.startsWith('<svg'), `${item.kind} SVG @ ${width}px`).toBe(true)
        }
      }
    }

    const bins = computeHistogramBins([10, 12, 15, 20, 22, 35, 50, 80, 120], undefined, true)
    expect(bins.length).toBeGreaterThanOrEqual(4)
    expect(bins.length).toBeLessThanOrEqual(8)
    expect(bins.reduce((sum, b) => sum + b.count, 0)).toBe(9)
  })

  it('supports step, yScale="log", stackMode="percent", markArea, and scatter referenceX quadrants', () => {
    const pctBar = buildChartOption(
      {
        kind: 'bar',
        data: [
          { q: 'Q1', ok: 80, err: 20 },
          { q: 'Q2', ok: 90, err: 10 },
        ],
        xField: 'q',
        yField: ['ok', 'err'],
        stackMode: 'percent',
      },
      true,
      276,
    ) as {
      yAxis: { min?: number; max?: number; axisLabel?: { formatter?: string } }
      series: Array<{ stack?: string; data: number[] }>
    }
    expect(pctBar.yAxis.min).toBe(0)
    expect(pctBar.yAxis.max).toBe(100)
    expect(pctBar.yAxis.axisLabel?.formatter).toBe('{value}%')
    expect(pctBar.series[0]?.stack).toBe('total')
    expect(pctBar.series[0]?.data).toEqual([80, 90])
    expect(pctBar.series[1]?.data).toEqual([20, 10])

    const stepLogLine = buildChartOption(
      {
        kind: 'line',
        data: [
          { t: '08:00', v: 0 },
          { t: '10:00', v: 10 },
          { t: '12:00', v: 1000 },
        ],
        xField: 't',
        yField: 'v',
        step: true,
        yScale: 'log',
        markArea: [{ start: '10:00', end: '12:00', label: '高峰', tone: 'danger' }],
      },
      false,
      276,
    ) as {
      yAxis: { type?: string }
      series: Array<{
        step?: string
        smooth?: boolean
        data: Array<number | null>
        markArea?: { data?: unknown[] }
      }>
    }
    expect(stepLogLine.yAxis.type).toBe('log')
    expect(stepLogLine.series[0]?.step).toBe('end')
    expect(stepLogLine.series[0]?.smooth).toBe(false)
    expect(stepLogLine.series[0]?.data[0]).toBeNull()
    expect(stepLogLine.series[0]?.markArea?.data).toHaveLength(1)

    const quadrantScatter = buildChartOption(
      {
        kind: 'scatter',
        data: [
          { name: 'A', cost: 20, score: 90 },
          { name: 'B', cost: 80, score: 70 },
        ],
        xField: 'cost',
        yField: 'score',
        referenceLine: 80,
        referenceLabel: '得分线',
        referenceX: 50,
        referenceXLabel: '成本线',
      },
      true,
      276,
    ) as {
      series: Array<{
        markLine?: {
          animation?: boolean
          data?: Array<{
            xAxis?: number
            yAxis?: number
            label?: { position?: string; rotate?: number }
          }>
        }
      }>
    }
    expect(quadrantScatter.series[0]?.markLine?.animation).toBe(false)
    expect(quadrantScatter.series[0]?.markLine?.data).toHaveLength(2)
    expect(quadrantScatter.series[0]?.markLine?.data?.some((d) => d.yAxis === 80)).toBe(true)
    const refXItem = quadrantScatter.series[0]?.markLine?.data?.find((d) => d.xAxis === 50)
    expect(refXItem).toBeDefined()
    expect(refXItem?.label?.position).toBe('end')
    expect(refXItem?.label?.rotate).toBe(0)

    const histOpt = buildChartOption(
      {
        kind: 'histogram',
        data: [10, 20, 30, 40, 60, 80, 100],
        referenceLine: 75,
        referenceLabel: 'P95',
      },
      true,
      276,
    ) as {
      series: Array<{
        markLine?: { animation?: boolean; label?: { position?: string; rotate?: number } }
      }>
    }
    expect(histOpt.series[0]?.markLine?.animation).toBe(false)
    expect(histOpt.series[0]?.markLine?.label?.position).toBe('end')
    expect(histOpt.series[0]?.markLine?.label?.rotate).toBe(0)

    const dumbbellOpt = buildChartOption(
      {
        kind: 'dumbbell',
        data: [{ name: 'API', before: 400, after: 120 }],
        xField: 'name',
      },
      true,
      276,
    ) as { series: Array<{ itemStyle?: { color?: string } }> }
    expect(dumbbellOpt.series[2]?.itemStyle?.color).toBeTruthy()
    expect(dumbbellOpt.series[3]?.itemStyle?.color).toBeTruthy()
    expect(dumbbellOpt.series[3]?.itemStyle?.color).not.toBe(
      dumbbellOpt.series[2]?.itemStyle?.color,
    )

    const radialOpt = buildChartOption(
      {
        kind: 'radialBar',
        data: [
          { name: 'GPU', value: 92, max: 100 },
          { name: 'Mem', value: 80, max: 100 },
        ],
        xField: 'name',
        yField: 'value',
      },
      true,
      276,
    ) as { angleAxis: { startAngle?: number; endAngle?: number } }
    expect(radialOpt.angleAxis.startAngle).toBe(90)
    expect(radialOpt.angleAxis.endAngle).toBe(-180)
  })
})

describe('v0.5.0 Conditional Aggregates & In-Place Component Upgrades', () => {
  it('computes conditional sum/avg/count/min/max with scalar and array cross-filters', () => {
    const orders = [
      { region: '华东', amount: 5200 },
      { region: '华东', amount: 4800 },
      { region: '华南', amount: 3000 },
      { region: '华北', amount: 2000 },
    ]
    expect(computeArraySum(orders, 'amount', 'region', '')).toBe(15000)
    expect(computeArraySum(orders, 'amount', 'region', [])).toBe(15000)
    expect(computeArraySum(orders, 'amount', 'region', '华东')).toBe(10000)
    expect(computeArraySum(orders, 'amount', 'region', ['华东', '华北'])).toBe(12000)
    expect(computeArrayAvg(orders, 'amount', 'region', ['华南', '华北'])).toBe(2500)
    expect(computeArrayCount(orders, 'region', ['华东', '华南'])).toBe(3)
    expect(computeArrayMin(orders, 'amount', 'region', ['华东', '华南'])).toBe(3000)
    expect(computeArrayMax(orders, 'amount', 'region', ['华南', '华北'])).toBe(3000)
  })

  it('renders Table column formatters (badge/bar/delta/sparkline/code) + stickyFirstColumn', () => {
    const html = renderToStaticMarkup(
      createElement(TableWidget, {
        title: '语义列 ProTable',
        stickyFirstColumn: true,
        rows: [
          {
            id: 'ORD-1',
            load: 84,
            delta: '+12.5%',
            trend: [10, 14, 18, 22],
            status: 'ok:健康',
          },
          {
            id: 'ORD-2',
            load: 96,
            delta: '-5.2%',
            trend: '30,25,20,16',
            status: 'no:熔断',
          },
        ],
        columns: [
          { key: 'id', label: 'ID', format: 'code' },
          { key: 'load', label: '负载', format: 'bar', max: 100 },
          { key: 'delta', label: '环比', format: 'delta' },
          { key: 'trend', label: '趋势', format: 'sparkline' },
          { key: 'status', label: '状态', format: 'badge' },
        ],
      }),
    )
    expect(html).toContain('<code')
    expect(html).toContain('width:84.0%')
    expect(html).toContain('data-dir="up"')
    expect(html).toContain('data-dir="down"')
    expect(html).toContain('<svg')
    expect(html).toContain('健康')
    expect(html).toContain('熔断')
    expect(html).toContain('tableStickyCol')
  })

  it('normalizes Tree offsetPct and DiffView multi-file PR annotations', () => {
    const nodes = normalizeHierarchyTree([
      { id: 'span1', label: 'db.query', sharePct: 45, offsetPct: 30, status: 'warning' },
      { id: 'span2', label: 'clamp', sharePct: 140, offsetPct: 120, status: 'error' },
    ])
    expect(nodes[0]?.offsetPct).toBe(30)
    expect(nodes[0]?.sharePct).toBe(45)
    expect(nodes[1]?.offsetPct).toBe(97)
    expect(nodes[1]?.sharePct).toBe(100)

    const files = normalizeDiffFiles([
      {
        path: 'src/a.ts',
        before: 'const x = 1',
        after: 'const x = 2\nconst y = 3',
        annotations: [
          { line: 2, side: 'after', author: '@qa', tone: 'warning', message: 'Check y' },
        ],
      },
      { path: 'src/b.ts', before: 'old', after: 'new' },
    ])
    expect(files).toHaveLength(2)
    expect(files[0]?.annotations).toHaveLength(1)
    expect(
      normalizeDiffAnnotations([
        { line: 0, message: 'bad' },
        { line: 2, message: 'ok' },
      ]),
    ).toHaveLength(1)

    const DiffRaw = (DshDiffViewImpl as unknown as { rawRender: (p: unknown) => unknown }).rawRender
    const diffHtml = renderToStaticMarkup(
      createElement(DiffRaw as never, {
        props: { files },
      }),
    )
    expect(diffHtml).toContain('src/a.ts')
    expect(diffHtml).toContain('src/b.ts')
    expect(diffHtml).toContain('Check y')
    expect(diffHtml).toContain('@qa')
  })
})

describe('v0.5.0 7 New Zero-Dependency Widgets & Showcases', () => {
  it('validates pure helpers for RangeSlider, Checklist, SortableList, KvEditor, Rating, ImageCompare, and AnnotationText', () => {
    const range = clampRangeSliderBounds({ min: 0, max: 100, start: 80, end: 30, step: 5 })
    expect(range.start).toBe(30)
    expect(range.end).toBe(80)
    expect(range.startPct).toBe(30)
    expect(range.endPct).toBe(80)

    const chkItems = normalizeChecklistItems([
      { id: 'a', label: 'A', required: true, checked: true },
      { id: 'b', label: 'B', required: true },
      'C',
    ])
    const chkSum = computeChecklistSummary(chkItems, new Set(['a']))
    expect(chkSum).toEqual({ total: 3, done: 1, requiredTotal: 2, requiredMissing: 1, pct: 33 })

    const sortItems = normalizeSortableItems([
      { id: '1', title: 'First' },
      { id: '2', title: 'Second' },
    ])
    expect(reorderListItems(sortItems, 0, 1).map((x) => x.id)).toEqual(['2', '1'])

    const kvRows = normalizeKvEditorRows([
      { key: 'NODE_ENV', value: 'prod' },
      { key: 'OPENAI_API_KEY', value: 'sk-123' },
    ])
    expect(kvRows[0]?.sensitive).toBe(false)
    expect(kvRows[1]?.sensitive).toBe(true)
    expect(isKvKeySensitive('promptTokens')).toBe(false)

    expect(clampRatingScore(4.3, 5, true)).toBe(4.5)
    expect(clampRatingScore(4.3, 5, false)).toBe(4)
    expect(clampImageComparePosition(150)).toBe(100)
    expect(clampImageComparePosition(-10)).toBe(0)

    const text = 'Alpha beta gamma delta.'
    const { segments, legend } = buildAnnotatedTextSegments(text, [
      { match: 'beta', label: 'Risk', tone: 'danger', note: 'Watch out' },
      { start: 11, end: 16, label: 'Info', tone: 'info' },
      { start: 12, end: 18, label: 'Overlap', tone: 'warning' },
    ])
    const rebuilt = segments.map((s) => (s.kind === 'plain' ? s.text : s.annotation.text)).join('')
    expect(rebuilt).toBe(text)
    expect(legend.map((l) => l.label)).toEqual(['Risk', 'Info'])
  })

  it('SSR-renders all 7 new widgets safely and blocks unsafe ImageCompare URLs', () => {
    const rawOf = (impl: unknown) =>
      (impl as { rawRender: (p: unknown) => unknown }).rawRender as never

    const rangeHtml = renderToStaticMarkup(
      createElement(rawOf(DshRangeSliderImpl), {
        props: { label: '预算', min: 50, max: 500, start: 100, end: 300, prefix: '¥', unit: 'k' },
      }),
    )
    expect(rangeHtml).toContain('data-a2ui-rangeslider')
    expect(rangeHtml).toContain('¥100k – ¥300k')

    const chkHtml = renderToStaticMarkup(
      createElement(rawOf(DshChecklistImpl), {
        props: {
          title: '发布核查',
          items: [{ id: 's1', label: '快照校验', required: true }],
          value: [],
        },
        context: {},
      }),
    )
    expect(chkHtml).toContain('data-a2ui-checklist')
    expect(chkHtml).toContain('快照校验')

    const sortHtml = renderToStaticMarkup(
      createElement(rawOf(DshSortableListImpl), {
        props: {
          title: '优先级',
          items: [
            { id: '1', title: '任务 A' },
            { id: '2', title: '任务 B' },
          ],
        },
        context: {},
      }),
    )
    expect(sortHtml).toContain('data-a2ui-sortable')
    expect(sortHtml).toContain('#1')

    const kvHtml = renderToStaticMarkup(
      createElement(rawOf(DshKvEditorImpl), {
        props: {
          title: 'Env',
          items: [
            { key: 'PORT', value: '8080' },
            { key: 'DB_PASSWORD', value: 'secret' },
          ],
        },
        context: {},
      }),
    )
    expect(kvHtml).toContain('data-a2ui-kveditor')
    expect(kvHtml).toContain('type="password"')

    const ratingHtml = renderToStaticMarkup(
      createElement(rawOf(DshRatingImpl), {
        props: { label: '打分', value: 4.5, max: 5, allowHalf: true },
      }),
    )
    expect(ratingHtml).toContain('data-a2ui-rating')
    expect(ratingHtml).toContain('4.5 / 5')

    const unsafeCompareHtml = renderToStaticMarkup(
      createElement(rawOf(DshImageCompareImpl), {
        props: { beforeUrl: 'javascript:alert(1)', afterUrl: 'https://example.com/a.png' },
      }),
    )
    expect(unsafeCompareHtml).toBe('')

    const safeSvg =
      'data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2010%2010%22%3E%3Crect%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22red%22%2F%3E%3C%2Fsvg%3E'
    const safeCompareHtml = renderToStaticMarkup(
      createElement(rawOf(DshImageCompareImpl), {
        props: { beforeUrl: safeSvg, afterUrl: safeSvg, title: 'QA 对比', initialPosition: 40 },
      }),
    )
    expect(safeCompareHtml).toContain('data-a2ui-imagecompare')
    expect(safeCompareHtml).toContain('40%')

    const annHtml = renderToStaticMarkup(
      createElement(rawOf(DshAnnotationTextImpl), {
        props: {
          title: '条款审阅',
          text: '违约金上限为 300%。',
          annotations: [{ match: '300%', label: '高风险', tone: 'danger', note: '过高' }],
        },
        context: {},
      }),
    )
    expect(annHtml).toContain('data-a2ui-annotationtext')
    expect(annHtml).toContain('高风险')
  })

  it('compiles all 3 new v0.5.0 showcases cleanly with zero diagnostics', () => {
    const sessions = new SurfaceSessions(createGenerator())
    for (const [idx, ui] of [
      SHOWCASE_V050_CHARTS_UI,
      SHOWCASE_V050_WIDGETS_UI,
      SHOWCASE_V050_UPGRADES_UI,
    ].entries()) {
      const compiled = sessions.compile(`v050-sc-${idx}`, ui)
      expect(compiled.length).toBeGreaterThan(0)
    }
  })

  it('redacts array-backed KvEditor secret values in ask-tool & persistence and preserves negative range referenceLabel', () => {
    const sample = {
      envVars: [
        { key: 'NODE_ENV', value: 'production' },
        { key: 'OPENAI_API_KEY', value: 'sk-live-secret-999' },
        { name: 'db_password', value: 'hunter2' },
      ],
    }
    const askClean = sanitizePayloadObject(sample) as {
      envVars: Array<Record<string, unknown>>
    }
    expect(askClean.envVars[0]).toEqual({ key: 'NODE_ENV', value: 'production' })
    expect(askClean.envVars[1]).toEqual({ key: 'OPENAI_API_KEY' })
    expect(askClean.envVars[2]).toEqual({ name: 'db_password' })

    const draftClean = sanitizeDataModel(sample) as {
      envVars: Array<Record<string, unknown>>
    }
    expect(draftClean.envVars[0]).toEqual({ key: 'NODE_ENV', value: 'production' })
    expect(draftClean.envVars[1]).toEqual({ key: 'OPENAI_API_KEY' })
    expect(draftClean.envVars[2]).toEqual({ name: 'db_password' })

    const negRange = buildChartOption(
      {
        kind: 'range',
        data: [
          { d: 'D1', low: -40, mid: -20, high: 10 },
          { d: 'D2', low: -30, mid: -5, high: 20 },
        ],
        xField: 'd',
        yField: 'mid',
        yScale: 'log',
        referenceLine: -10,
      },
      true,
      276,
    ) as {
      yAxis: { type?: string }
      series: Array<{ markLine?: { label?: { formatter?: string } } }>
    }
    expect(negRange.yAxis.type).toBe('value')
    expect(negRange.series[2]?.markLine?.label?.formatter).toBe('-10')

    const rawOf = (impl: unknown) =>
      (impl as { rawRender: (p: unknown) => unknown }).rawRender as never
    const sourceOnlyAnn = renderToStaticMarkup(
      createElement(rawOf(DshAnnotationTextImpl), {
        props: {
          text: '遵循 SEC-4.2 规则执行。',
          annotations: [{ match: 'SEC-4.2', sourceId: 'SEC-4.2', note: '安全条款' }],
        },
        context: {},
      }),
    )
    expect(sourceOnlyAnn).toContain('SEC-4.2')
  })
})
