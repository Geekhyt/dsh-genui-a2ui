import { describe, expect, it } from 'vitest'
import { computeMetricRingGeometry, normalizeLogEntries } from '../src/client/catalog/v3-helpers.ts'
import {
  buildEndpointCurl,
  compareTableAlphanumericCells,
  computeTableNumericSummary,
  detectNumericColumnKeys,
  formatChartDataToCsv,
  normalizeScheduleItems,
  normalizeTerminalCommands,
} from '../src/client/catalog/v4-helpers.ts'
import {
  computeDateRangeSpanDays,
  findBreadcrumbByValue,
  normalizeHierarchyTree,
} from '../src/client/catalog/v5-helpers.ts'
import {
  buildAnnotatedTextSegments,
  normalizeSortableItems,
} from '../src/client/catalog/v6-helpers.ts'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { buildCompactCategoryFormatter } from '../src/client/chunks/echarts/shared.ts'
import { isAbsoluteWorkspacePath, isPathWithinWorkspace } from '../src/client/file-opener.tsx'
import {
  isSafeStaticSvgImage,
  namespaceSvgIds,
  repairMermaidSource,
  stripUnsafeDirectives,
} from '../src/client/mermaid-safe.ts'
import {
  getA2uiEnabled,
  resetPersistenceForTests,
  setA2uiEnabled,
} from '../src/client/persistence.ts'
import { SurfaceSessions } from '../src/host/generator.ts'
import {
  assertSafeExpressProgram,
  estimateExpressExpansionSize,
  findDangerousCompiledKey,
  findDangerousExpressPointer,
  preprocessExpressProgram,
} from '../src/shared/express-preprocess.ts'
import { isPointerObscured, resolveTemplateObscuredPointers } from '../src/shared/redaction.ts'
import { formatNativeTemporalValue } from '../src/shared/temporal.ts'

describe('Comprehensive Repo Audit v0.5.5 Regressions (Workstreams A–H)', () => {
  it('Workstream A: blocks split-line/raw/comment __proto__, semicolon DoS, calc reassignment, and redacts root/kv secrets', () => {
    expect(findDangerousExpressPointer('x = { /* c */ "__proto__": 1 }')).toBe('__proto__')
    expect(findDangerousExpressPointer('x = { r"__proto__": 1 }')).toBe('__proto__')
    expect(findDangerousExpressPointer('x = { """__proto__""": 1 }')).toBe('__proto__')
    expect(findDangerousExpressPointer('$/\n__proto__/polluted = 1')).toContain('__proto__')
    expect(() => assertSafeExpressProgram('$/a/\nconstructor/b = 1')).toThrow(/prototype/i)

    const semiBomb = 'a="xxxxxxxxxx";b=a+a;c=b+b;d=c+c;e=d+d;f=e+e;g=f+f;h=g+g;i=h+h;j=i+i;k=j+j'
    expect(estimateExpressExpansionSize(semiBomb, 1000)).toBeGreaterThan(1000)

    const reassigned = preprocessExpressProgram(
      [
        'surface("s")',
        'x = calc(expr="1 + 1")',
        'y = calc(expr="x + 1")',
        'x = calc(expr="10")',
        'z = calc(expr="x + 2")',
      ].join('\n'),
    )
    expect(reassigned).toContain('10')

    expect(findDangerousCompiledKey({ a: [{ path: '/safe/__proto__/x' }] })).toBe(
      '/safe/__proto__/x',
    )

    const sessions = new SurfaceSessions()
    const msgs = sessions.compile(
      'audit-sec-kv',
      [
        'surface("sec_kv")',
        '$/env = [{"key": "API_TOKEN", "value": "sk-live-secret-99999"}, {"key": "HOST", "value": "prod.local"}]',
        'root = KvEditor(title="Env", items=$/env)',
      ].join('\n'),
    )
    expect(msgs.length).toBeGreaterThan(0)
    const redactionState = sessions.getSessionRedactionState('audit-sec-kv')
    expect(redactionState.kvPointers.has('/env')).toBe(true)
    expect(redactionState.obscuredPointers.has('/env/0/value')).toBe(true)

    const rootTplObscured = new Set<string>()
    resolveTemplateObscuredPointers(
      [
        { id: 'list', component: 'List', children: { componentId: 'item', path: '/' } },
        { id: 'item', component: 'TextField', variant: 'obscured', value: { path: './pin' } },
      ],
      rootTplObscured,
    )
    expect(isPointerObscured('/0/pin', rootTplObscured)).toBe(true)
    expect(isPointerObscured('/1/pin', rootTplObscured)).toBe(true)

    expect(formatNativeTemporalValue('2026-5-7T9:05:03.125Z', 'date')).toBe('2026-05-07')
    expect(computeDateRangeSpanDays('2026-03-01', '2026-03-10')).toBe(10)

    const tree = normalizeHierarchyTree([
      {
        id: 'root',
        label: 'Root',
        children: [{ id: 'leaf', value: 'leaf-val', label: 'Leaf' }],
      },
    ])
    expect(findBreadcrumbByValue(tree, 'root')).toBeNull()
    expect(findBreadcrumbByValue(tree, 'leaf-val')).toBe('Root / Leaf')

    expect(isAbsoluteWorkspacePath('\\etc\\passwd')).toBe(true)
    expect(isPathWithinWorkspace('/etc/passwd', '/workspace')).toBe(false)
    expect(isPathWithinWorkspace('/src/app.ts', '/')).toBe(true)
    expect(isPathWithinWorkspace('C:\\Windows\\win.ini', 'C:\\workspace')).toBe(false)
  })

  it('Workstream B: hardens Mermaid SVG tags, external fetch attrs, unclosed directives, linear edge repair, and SQL/hex ID namespacing', () => {
    expect(
      isSafeStaticSvgImage('<svg xmlns="http://www.w3.org/2000/svg"><img src="x"/></svg>'),
    ).toBe(false)
    expect(
      isSafeStaticSvgImage('<svg xmlns="http://www.w3.org/2000/svg"><dialog open></dialog></svg>'),
    ).toBe(false)
    expect(
      isSafeStaticSvgImage(
        '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.test/x.svg#a"/></svg>',
      ),
    ).toBe(false)
    expect(
      stripUnsafeDirectives(
        '  ---\nconfig: {}\n---\n%%{init: {"theme":"dark"}\nflowchart TD\nA-->B',
      ),
    ).toBe('flowchart TD\nA-->B')

    const longInput = `flowchart LR\nA["${'x'.repeat(8000)}"] --> B[done]`
    const t0 = performance.now()
    const repaired = repairMermaidSource(longInput)
    expect(performance.now() - t0).toBeLessThan(200)
    expect(repaired).toContain('B[done]')

    const svg =
      '<svg id="m1"><defs><marker id="arr"><path d="M0 0"/></marker></defs><style>#m1 .node{fill:#fff;color:#abc}</style><g id="n1"><text>SELECT * FROM t WHERE id="123" AND color="#fff"</text><path marker-end="url(#arr)"/></g></svg>'
    const ns = namespaceSvgIds(svg, 'p42-')
    expect(ns).toContain('WHERE id="123" AND color="#fff"')
    expect(ns).toContain('fill:#fff')
    expect(ns).toContain('id="p42-arr"')
    expect(ns).toContain('url(#p42-arr)')
  })

  it('Workstream C: preserves LRU order for numeric session IDs in global persistence state', () => {
    resetPersistenceForTests()
    for (let i = 0; i < 205; i += 1) {
      setA2uiEnabled(String(i), i % 2 === 0)
    }
    expect(getA2uiEnabled('204')).toBe(true)
    expect(getA2uiEnabled('203')).toBe(false)
    resetPersistenceForTests()
  })

  it('Workstreams E & F: hardens Table sorting/N/A/high-SLA, curl --data-raw, Schedule overnight, logs, MetricRing, and AnnotatedText', () => {
    expect(compareTableAlphanumericCells(true, false)).toBe(1)
    expect(compareTableAlphanumericCells(false, true)).toBe(-1)
    expect(compareTableAlphanumericCells(true, true)).toBe(0)

    const rows = [
      { svc: 'edge', active: true, sla: '99.992%', cost: '$120', toString: 'ok' },
      { svc: 'auth', active: false, sla: '99.985%', cost: '¥200', toString: 'ok' },
      { svc: 'pay', active: true, sla: 'N/A', cost: 'N/A', toString: 'ok' },
    ]
    const cols = [{ key: 'svc' }, { key: 'sla' }, { key: 'cost' }]
    const numKeys = detectNumericColumnKeys(cols, rows)
    expect(numKeys.has('sla')).toBe(true)
    expect(numKeys.has('cost')).toBe(true)
    const summary = computeTableNumericSummary(cols, rows, numKeys)
    expect(summary.sla).toBe('Avg 99.9885%')
    expect(summary.cost).toBe('320')

    const curl = buildEndpointCurl({
      method: 'POST',
      path: '/v1/items',
      baseUrl: 'https://api.example.com',
      requestBody: '@/etc/passwd',
    })
    expect(curl).toContain('--data-raw')
    expect(curl).not.toMatch(/\s-d\s/)

    const termCmds = normalizeTerminalCommands('# comment\n$ echo hi\n$ ls -la')
    expect(termCmds.map((c) => c.cmd)).toEqual(['echo hi', 'ls -la'])

    const csv = formatChartDataToCsv([{ day: 'Mon', p99: 42 }], { xField: 'day', yField: 'p99' })
    expect(csv?.replace(/^\ufeff/, '').split(/\r?\n/)[0]).toBe('day,p99')

    const sched = normalizeScheduleItems(
      [
        { title: 'Build', start: '09:00', end: '11:00' },
        { title: 'Cutover', start: '23:00', end: '01:00' },
      ],
      undefined,
    )
    expect(sched.tracks).toHaveLength(2)
    expect(sched.tracks[1]!.widthPct).toBeGreaterThan(0)

    const logs = normalizeLogEntries(
      '[2026-11-24T10:00:00+08:00] ERROR: gateway timeout\n[10:00:05] WARN: retry #1',
    )
    expect(logs[0]?.level).toBe('error')
    expect(logs[1]?.level).toBe('warn')

    const ring = computeMetricRingGeometry({ value: 0.004, max: 1, unit: '%', size: 80 })
    expect(ring.displayNumber).toBe('0.004')
    expect(ring.numericValue).toBeCloseTo(0.004)

    const sortable = normalizeSortableItems([
      { id: 'sort_A', title: 'A' },
      { id: 'sort_A__2', title: 'A2' },
      { id: 'sort_A', title: 'A3' },
    ])
    expect(new Set(sortable.map((s) => s.id)).size).toBe(3)
    expect(sortable[2]?.id).toBe('sort_A__3')

    const { segments } = buildAnnotatedTextSegments('alpha beta gamma', [
      { start: 6, end: 10, label: 'Second' },
      { match: 'alpha', label: 'First' },
    ])
    expect(
      segments
        .filter((s) => s.kind === 'mark')
        .map((s) => (s.kind === 'mark' ? s.annotation.text : '')),
    ).toEqual(['alpha', 'beta'])
  })

  it('Workstream G: verifies all generalized 276px ECharts layout, precision, legend, and formatter fixes', () => {
    const pctOpt = buildChartOption(
      {
        kind: 'bar',
        stacked: true,
        stackMode: 'percent',
        xField: 'q',
        yField: ['a', 'b', 'c'],
        data: [
          { q: 'Q1', a: 1, b: 1, c: 1 },
          { q: 'Q2', a: 2, b: 1, c: 1 },
        ],
      },
      true,
      276,
    ) as { yAxis: { max?: number; interval?: number }; series: { data: number[] }[] }
    expect(pctOpt.yAxis.max).toBe(100)
    expect(pctOpt.yAxis.interval).toBe(50)
    const sumQ1 = pctOpt.series.reduce((acc, s) => acc + (s.data[0] ?? 0), 0)
    expect(Math.abs(sumQ1 - 100)).toBeLessThanOrEqual(0.01)

    const fmt = buildCompactCategoryFormatter(
      ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'],
      32,
      true,
    )
    expect(fmt).toBeDefined()
    expect(fmt?.('2026-03')).toBe('26-03')

    const radial7 = buildChartOption(
      {
        kind: 'radialBar',
        data: Array.from({ length: 7 }, (_, i) => ({ name: `Item ${i + 1}`, value: 40 + i * 8 })),
        xField: 'name',
        yField: 'value',
      },
      true,
      276,
    ) as {
      legend?: { type?: string }
      polar: { center: [string, string] }
      radiusAxis: { axisLabel: { show?: boolean; hideOverlap?: boolean } }
      series: unknown[]
    }
    expect(radial7.legend?.type).toBe('scroll')
    expect(radial7.polar.center).toEqual(['50%', '43%'])
    expect(radial7.radiusAxis.axisLabel.show).toBe(false)
    expect(radial7.radiusAxis.axisLabel.hideOverlap).toBe(true)
    expect(radial7.series).toHaveLength(7)

    const wideLegend = buildChartOption(
      {
        kind: 'line',
        xField: 'm',
        yField: ['Primary Cluster Alpha', 'Secondary Cluster Beta', 'Disaster Recovery Gamma'],
        data: [
          {
            m: 'W1',
            'Primary Cluster Alpha': 10,
            'Secondary Cluster Beta': 20,
            'Disaster Recovery Gamma': 30,
          },
          {
            m: 'W2',
            'Primary Cluster Alpha': 14,
            'Secondary Cluster Beta': 22,
            'Disaster Recovery Gamma': 28,
          },
        ],
        referenceLine: 25,
        referenceLabel: 'SLA {p99}',
      },
      true,
      276,
    ) as {
      legend?: { type?: string }
      series: Array<{ markLine?: { label?: { formatter?: () => string } } }>
    }
    expect(wideLegend.legend?.type).toBe('scroll')
    expect(wideLegend.series[0]?.markLine?.label?.formatter?.()).toBe('SLA {p99}')

    const wfZero = buildChartOption(
      {
        kind: 'waterfall',
        xField: 'step',
        yField: 'delta',
        data: [
          { step: 'Start', delta: 100, total: true },
          { step: 'Drop', delta: -100 },
        ],
      },
      true,
      276,
    ) as { series: Array<{ data: unknown[] }> }
    const dropItem = wfZero.series[3]?.data[1] as { label?: { position?: string } } | undefined
    expect(dropItem?.label?.position).not.toBe('bottom')

    const emptyGraph = buildChartOption(
      { kind: 'graph', data: { nodes: [], edges: [{ source: 'A', target: 'B', label: '{c}' }] } },
      true,
      276,
    ) as { series: Array<{ data: unknown[]; edgeLabel?: { formatter?: (p: unknown) => string } }> }
    expect(emptyGraph.series[0]?.data).toHaveLength(2)

    const sparseHeat = buildChartOption(
      {
        kind: 'heatmap',
        data: [
          { x: 'Mon', y: 'API', v: null },
          { x: 'Tue', y: 'API', v: 42 },
        ],
      },
      true,
      276,
    ) as { series: Array<{ data: unknown[] }> }
    expect(sparseHeat.series[0]?.data).toHaveLength(1)

    const emptyBullet = buildChartOption({ kind: 'bullet', data: [] }, true, 276) as {
      xAxis: { max?: number }
    }
    expect(emptyBullet.xAxis.max).toBe(100)
  })
})
