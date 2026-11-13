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
  Input: undefined,
  Pill: undefined,
  SegmentedTabs: undefined,
  Tag: undefined,
  Modal: undefined,
  Menu: undefined,
  Tooltip: undefined,
  CodeBlock: undefined,
  JsonTree: undefined,
  DisclosureRow: undefined,
  MarkdownText: undefined,
  IconAppsAddOutlineRegular: undefined,
  IconSearchOutlineRegular: undefined,
}))

import { enrichActionWithSelection } from '../src/client/action-protocol.ts'
import { DSH_REACT_COMPONENTS } from '../src/client/catalog/BasicWidgets.tsx'
import { dshReactCatalog } from '../src/client/catalog/index.ts'
import {
  buildFileTree,
  buildSparklineGeometry,
  normalizeSparklinePoints,
  splitStatValueUnit,
} from '../src/client/catalog/stat-file-helpers.ts'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { fileAddressFor, parseFileTarget, resolveSessionPath } from '../src/client/file-opener.tsx'
import { apply as applyClient } from '../src/client/index.ts'
import {
  assertSafeSvg,
  ensureFlowchartKind,
  extractMermaidKind,
  repairMermaidSource,
  stripUnsafeDirectives,
} from '../src/client/mermaid-safe.ts'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import {
  CHART_KINDS,
  DSH_COMPONENT_APIS,
  dshSchemaCatalog,
} from '../src/shared/catalog-schema.ts'

describe('Evolution v2: 32-Component Catalog Parity & Scope Governance', () => {
  it('registers exact 32 components across Host schema catalog and Client React catalog with zero banned features', () => {
    expect(DSH_COMPONENT_APIS).toHaveLength(32)
    expect(DSH_REACT_COMPONENTS).toHaveLength(32)
    expect(CHART_KINDS).toHaveLength(14)

    const schemaJson = dshSchemaCatalog.toJson()
    const schemaNames = Object.keys(schemaJson.components as Record<string, unknown>).sort()
    const reactNames = [...dshReactCatalog.components.keys()].sort()
    expect(reactNames).toEqual(schemaNames)

    expect(schemaNames).toEqual(
      expect.arrayContaining(['Accordion', 'JsonTree', 'FileTree', 'Mermaid']),
    )
    // Explicitly excluded items must NOT exist
    expect(schemaNames).not.toContain('Plot')
    expect(schemaNames).not.toContain('Quiz')
    expect(CHART_KINDS).not.toContain('wordCloud')

    // No global `visible` / `when` conditional visibility prop added to components
    for (const [compName, compDef] of Object.entries(
      schemaJson.components as Record<string, { properties?: Record<string, unknown> }>,
    )) {
      expect(compDef.properties?.visible, `${compName} should not define global visible`).toBeUndefined()
      expect(compDef.properties?.when, `${compName} should not define global when`).toBeUndefined()
    }
  })

  it('compiles upgraded Stat/Code/DiffView, all 14 Chart kinds, and Accordion/JsonTree/FileTree/Mermaid in Express', () => {
    const sessions = new SurfaceSessions(createGenerator())
    const program = [
      'surface("evo_v2_showcase")',
      '$/spark = [120, 138, 132, 156, 174, 192]',
      '$/heat = [{ x: "周一", y: "早高峰", v: 82 }, { x: "周二", y: "晚高峰", v: 95 }]',
      '$/flow = [{ source: "网关", target: "鉴权", value: 100 }, { source: "鉴权", target: "订单", value: 86 }]',
      '$/ohlc = [{ date: "11-10", open: 102, close: 108, low: 99, high: 110 }]',
      '$/payload = { cluster: "cn-hz", healthy: true, shards: [1, 2, 3] }',
      '$/files = [',
      '  { path: "src/index.ts", status: "modified", line: 42, summary: "新增 4 个组件引导" },',
      '  { path: "src/client/catalog/ExtendedWidgets.tsx", status: "added", summary: "Accordion/JsonTree/FileTree/Mermaid" }',
      ']',
      'acc = Accordion([',
      '  { title: "架构流向图", badge: "Mermaid", open: true, child: Mermaid("flowchart LR\\n  A[\\"网关 (Gateway)\\"] --> B[\\"核心服务\\"]", title="请求链路", caption="严格模式 SVG 渲染") },',
      '  { title: "配置负载", subtitle: "只读快照", child: JsonTree($/payload, title="Runtime Payload", expandedDepth=2) }',
      '], multiple=true)',
      'root = Card(Column([',
      '  Row([Stat("吞吐峰值", "192 req/s", delta="+18%", trend="up", spark=$/spark, weight=1)]),',
      '  Chart("heatmap", $/heat, xField="x", yField="y", sizeField="v", title="时段热力矩阵"),',
      '  Chart("sankey", $/flow, title="流量漏损桑基图"),',
      '  Chart("candlestick", $/ohlc, zoom=true, title="区间 K 线"),',
      '  FileTree($/files, title="变更文件影响面", expandedDepth=3, action=Event("inspect_file")),',
      '  DiffView("timeout: 5s", "timeout: 15s", filePath="config/gateway.yaml", line=18, language="yaml"),',
      '  Code("export const READY = true;", language="ts", title="健康探针", filePath="src/probe.ts", line=7),',
      '  acc',
      ']))',
    ].join('\n')

    const compiled = sessions.compile('sess-v2', program)
    expect(compiled.length).toBeGreaterThan(0)
    const createMsg = compiled.find((m) => 'createSurface' in m) as
      | { createSurface: { components?: Array<{ component: string }> } }
      | undefined
    const used = (createMsg?.createSurface.components ?? []).map((c) => c.component)
    expect(used).toEqual(
      expect.arrayContaining([
        'Stat',
        'Chart',
        'FileTree',
        'DiffView',
        'Code',
        'Accordion',
        'Mermaid',
        'JsonTree',
      ]),
    )
  })
})

describe('Evolution v2: 14-Kind ECharts Option Builder', () => {
  it('builds valid ECharts options for heatmap, treemap, cyclic sankey, boxplot, graph, candlestick, bubble scatter & horizontal bar', () => {
    // 1. Horizontal Bar + DataZoom
    const hBar = buildChartOption(
      {
        kind: 'bar',
        data: [{ team: '核心研发', score: 94 }, { team: '平台架构', score: 88 }],
        xField: 'team',
        yField: 'score',
        horizontal: true,
        zoom: true,
      },
      false,
    )
    expect((hBar.yAxis as { type: string }).type).toBe('category')
    expect((hBar.xAxis as { type: string }).type).toBe('value')
    expect(Array.isArray(hBar.dataZoom)).toBe(true)

    // 2. Bubble Scatter with sizeField
    const bubble = buildChartOption(
      {
        kind: 'scatter',
        data: [
          { cost: 10, roi: 25, users: 100 },
          { cost: 30, roi: 60, users: 900 },
        ],
        xField: 'cost',
        yField: 'roi',
        sizeField: 'users',
      },
      true,
    )
    const scatterSeries = (bubble.series as Array<{
      symbolSize?: (val: number[], params?: { dataIndex?: number }) => number
    }>)[0]!
    expect(typeof scatterSeries.symbolSize).toBe('function')
    expect(scatterSeries.symbolSize!([10, 25, 100], { dataIndex: 0 })).toBeLessThan(
      scatterSeries.symbolSize!([30, 60, 900], { dataIndex: 1 }),
    )

    // 3. Heatmap 2D matrix
    const heat = buildChartOption(
      {
        kind: 'heatmap',
        data: [
          { day: '周一', slot: '上午', load: 42 },
          { day: '周二', slot: '下午', load: 91 },
        ],
        xField: 'day',
        yField: 'slot',
        sizeField: 'load',
      },
      false,
    )
    expect(heat.visualMap).toBeDefined()
    expect((heat.series as Array<{ type: string }>)[0]?.type).toBe('heatmap')

    // 4. Treemap hierarchy
    const tree = buildChartOption(
      {
        kind: 'treemap',
        data: [
          { name: 'client.echarts.js', kb: 778, group: 'Lazy Chunks' },
          { name: 'client.js', kb: 45, group: 'Boot Entry' },
        ],
        xField: 'name',
        yField: 'kb',
        seriesField: 'group',
      },
      false,
    )
    const treeData = (tree.series as Array<{ data: Array<{ name: string; children: unknown[] }> }>)[0]!.data
    expect(treeData).toHaveLength(2)

    // 5. Sankey with cycle (A -> B -> C -> A) breaks cycle cleanly instead of crashing ECharts
    const sankey = buildChartOption(
      {
        kind: 'sankey',
        data: [
          { source: 'A', target: 'B', value: 50 },
          { source: 'B', target: 'C', value: 40 },
          { source: 'C', target: 'A', value: 10 },
        ],
      },
      false,
    )
    const sankeyLinks = (sankey.series as Array<{ links: unknown[] }>)[0]!.links
    expect(sankeyLinks).toHaveLength(2)

    // 6. Boxplot from raw sample arrays
    const box = buildChartOption(
      {
        kind: 'boxplot',
        data: [
          { service: 'API 网关', values: [12, 15, 18, 22, 35] },
          { service: '订单核心', min: 20, q1: 28, median: 34, q3: 45, max: 62 },
        ],
        xField: 'service',
      },
      false,
    )
    const boxData = (box.series as Array<{ data: number[][] }>)[0]!.data
    expect(boxData[0]).toEqual([12, 15, 18, 22, 35])
    expect(boxData[1]).toEqual([20, 28, 34, 45, 62])

    // 7. Graph topology (both edge rows and { nodes, links })
    const graph = buildChartOption(
      {
        kind: 'graph',
        data: {
          nodes: [{ name: 'Gateway', category: 'edge', value: 30 }, { name: 'DB', category: 'storage', value: 20 }],
          links: [{ source: 'Gateway', target: 'DB', value: 120 }],
        },
      },
      true,
    )
    expect((graph.series as Array<{ type: string; data: unknown[] }>)[0]?.type).toBe('graph')
    expect((graph.series as Array<{ data: unknown[] }>)[0]?.data).toHaveLength(2)

    // 8. Candlestick OHLC ([open, close, low, high])
    const kline = buildChartOption(
      {
        kind: 'candlestick',
        data: [{ date: '2026-11-12', open: 100, close: 112, low: 96, high: 115 }],
      },
      false,
    )
    const kData = (kline.series as Array<{ data: number[][] }>)[0]!.data
    expect(kData[0]).toEqual([100, 112, 96, 115])
  })
})

describe('Evolution v2: Mermaid Sanitizer, Official sidebarRight File Opener & Helpers', () => {
  it('strips unsafe %%{init}%% directives, validates diagram kinds, repairs CJK labels, and enforces assertSafeSvg', () => {
    const dirty = '%%{init: {"securityLevel": "loose"}}%%\nflowchart LR\n  A[网关 (Gateway): 入口] --> B[核心服务]'
    const stripped = stripUnsafeDirectives(dirty)
    expect(stripped).not.toContain('securityLevel')
    expect(extractMermaidKind(stripped)).toBe('flowchart')

    expect(ensureFlowchartKind('A --> B')).toBe('graph TD\nA --> B')
    expect(ensureFlowchartKind('sequenceDiagram\n  Alice->>Bob: Hi')).toBe('sequenceDiagram\n  Alice->>Bob: Hi')

    const repaired = repairMermaidSource(stripped)
    expect(repaired).toContain('A["网关 (Gateway): 入口"]')
    expect(repaired).toContain('B["核心服务"]')

    expect(() => assertSafeSvg('<svg viewBox="0 0 100 40"><g><rect width="10" height="10"/></g></svg>')).not.toThrow()
    expect(() => assertSafeSvg('<svg><script>alert(1)</script></svg>')).toThrow(/sanitization/)
    expect(() => assertSafeSvg('<svg onload="alert(1)"></svg>')).toThrow(/sanitization/)
    expect(() => assertSafeSvg('<svg><a href="javascript:evil()">x</a></svg>')).toThrow(/sanitization/)
  })

  it('constructs exact official DSH dsh-resource://file addresses and opens files via sidebarRight.openResource', () => {
    expect(fileAddressFor('sess-1', '/workspace/repo', 'src/index.ts')).toBe(
      'dsh-resource://file/session/sess-1/src/index.ts',
    )
    expect(fileAddressFor('sess-1', '/workspace/repo', '/workspace/repo/src/client/index.ts')).toBe(
      'dsh-resource://file/session/sess-1/src/client/index.ts',
    )
    expect(fileAddressFor('sess-1', '/workspace/repo', '/etc/hosts')).toBe(
      'dsh-resource://file/session/sess-1//etc/hosts',
    )
    expect(resolveSessionPath('packages/ui', 'Button.tsx')).toBe('packages/ui/Button.tsx')

    expect(parseFileTarget('src/index.ts:42')).toEqual({ path: 'src/index.ts', line: 42 })
    expect(parseFileTarget('src/index.ts#L108')).toEqual({ path: 'src/index.ts', line: 108 })
    expect(parseFileTarget('src/index.ts', 15)).toEqual({ path: 'src/index.ts', line: 15 })
    expect(parseFileTarget('https://example.com/app.ts')).toBeNull()
    expect(parseFileTarget('javascript:alert(1)')).toBeNull()

    // End-to-end client apply() wiring with sidebarRight service
    const openedCalls: Array<{ address: string; options: unknown }> = []
    let registeredTurnTailInject: ((sid: string) => { openWorkspaceFile?: (p: string, l?: number) => void }) | undefined

    const fakeClientCtx = {
      slots: {
        inject: (_name: string, fn: () => unknown) => {
          const res = fn()
          if (res && typeof (res as Iterator<unknown>).next === 'function') {
            let step = (res as Iterator<unknown>).next()
            while (!step.done) step = (res as Iterator<unknown>).next()
          }
          return () => {}
        },
        register: (opts: { name?: string; inject?: typeof registeredTurnTailInject }) => {
          if (opts.name === 'conversation.chat.turnTail') {
            registeredTurnTailInject = opts.inject
          }
          return () => {}
        },
      },
      sessions: {
        list: {
          getSnapshot: () => ({ byId: { 'sess-live': { cwd: '/workspace/dsh-genui-a2ui' } } }),
        },
        binding: () => ({ session: { projections: { faceOf: () => ({ getSnapshot: () => undefined }) } } }),
      },
      uiConversation: {
        events: { register: () => () => {} },
        userText: { register: () => () => {} },
        binding: () => ({ target: () => ({ subscribe: () => () => {}, getSnapshot: () => undefined }) }),
      },
      inject(deps: string[], cb: (inner: unknown) => void) {
        if (deps.includes('sidebarRight')) {
          cb({
            sidebarRight: {
              openResource(address: string, options?: unknown) {
                openedCalls.push({ address, options })
              },
            },
            effect: (fn: () => () => void) => fn(),
          })
        }
      },
      effect: (fn: () => () => void) => fn(),
    }

    applyClient(fakeClientCtx as never)
    expect(registeredTurnTailInject).toBeDefined()
    const injected = registeredTurnTailInject!('sess-live')
    injected.openWorkspaceFile!('src/index.ts:88')
    expect(openedCalls).toEqual([
      {
        address: 'dsh-resource://file/session/sess-live/src/index.ts',
        options: { params: { line: 88 } },
      },
    ])

    const enriched = enrichActionWithSelection({
      name: 'inspect_file',
      surfaceId: 's1',
      sourceComponentId: 'ft1',
      timestamp: new Date().toISOString(),
      metadata: {
        extensions: {
          dshSelection: { source: 'fileTree', path: 'src/index.ts', line: 42, status: 'modified' },
        },
      },
    } as never)
    expect(enriched.userMessage).toBe('查看文件：src/index.ts:42')
  })

  it('splits Stat units, builds zero-NaN sparkline paths, and constructs hierarchical FileTree nodes', () => {
    expect(splitStatValueUnit('99.95%')).toEqual({ main: '99.95', unit: '%' })
    expect(splitStatValueUnit('142 ms')).toEqual({ main: '142', unit: 'ms' })
    expect(splitStatValueUnit('+32.5万元')).toEqual({ main: '+32.5', unit: '万元' })
    expect(splitStatValueUnit('2026-11-12')).toEqual({ main: '2026-11-12', unit: '' })
    expect(splitStatValueUnit('运行正常')).toEqual({ main: '运行正常', unit: '' })

    const pts = normalizeSparklinePoints([10, '20', { value: 15 }, { y: 30 }])
    expect(pts).toEqual([10, 20, 15, 30])
    const geom = buildSparklineGeometry(pts)
    expect(geom?.linePath.startsWith('M')).toBe(true)
    expect(geom?.linePath).not.toContain('NaN')

    // Constant series must not divide by zero
    const flatGeom = buildSparklineGeometry([42, 42, 42])
    expect(flatGeom?.linePath).not.toContain('NaN')

    const tree = buildFileTree([
      { path: 'src/client/index.ts', status: 'M', line: 10 },
      { path: 'src/shared/constants.ts', status: 'A', summary: '轻量常量' },
      'README.md',
    ])
    expect(tree).toHaveLength(2)
    expect(tree[0]?.kind).toBe('dir')
    expect(tree[0]?.name).toBe('src')
    expect(tree[0]?.fileCount).toBe(2)
    expect(tree[1]?.kind).toBe('file')
    expect(tree[1]?.name).toBe('README.md')
  })
})
