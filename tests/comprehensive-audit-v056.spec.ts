import { describe, expect, it } from 'vitest'
import { computeCalc } from '../src/client/catalog/functions.ts'
import { normalizeLogEntries } from '../src/client/catalog/v3-helpers.ts'
import {
  buildEndpointCurl,
  compareTableAlphanumericCells,
  computeTableNumericSummary,
  normalizeMatrixData,
  normalizeScheduleItems,
  normalizeTerminalCommands,
  parseFormattedNumericCell,
  resolveTableBadgeTone,
} from '../src/client/catalog/v4-helpers.ts'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { scopeMermaidStyleRules } from '../src/client/chunks/mermaid-chunk.ts'
import { parseFileTarget } from '../src/client/file-opener.tsx'
import { isSafeStaticSvgImage, namespaceSvgIds } from '../src/client/mermaid-safe.ts'
import { StreamingExpressSession } from '../src/client/runtime/streaming.ts'
import { PendingAskRegistry } from '../src/host/ask-tool.ts'
import { sanitizeInlineUrlText } from '../src/shared/constants.ts'
import {
  assertSafeExpressProgram,
  estimateExpressExpansionSize,
  extractUpdateSurfaceIds,
  findDangerousExpressPointer,
  preprocessExpressProgram,
} from '../src/shared/express-preprocess.ts'
import {
  isScrubbableNumericSecret,
  normalizePointerPath,
  referencesObscuredPointer,
  resolveTemplateKvPointers,
} from '../src/shared/redaction.ts'

describe('Comprehensive Repo Audit v0.5.6 Regressions (Batches 1–4)', () => {
  it('Batch 1: blocks multiline Billion Laughs, bare/collapsed __proto__, and scopes settled dataModels', async () => {
    const multilineBomb = [
      'a = "xxxxxxxxxx"',
      'b = (a +\n a)',
      'c = (b +\n b)',
      'd = (c +\n c)',
      'e = (d +\n d)',
      'f = (e +\n e)',
      'g = (f +\n f)',
      'h = (g +\n g)',
      'i = (h +\n h)',
      'j = (i +\n i)',
      'k = (j +\n j)',
    ].join('\n')
    expect(estimateExpressExpansionSize(multilineBomb, 1000)).toBeGreaterThan(1000)

    expect(findDangerousExpressPointer('$__proto__ = 1')).toContain('__proto__')
    expect(findDangerousExpressPointer('$/a//__proto__ = 1')).toContain('__proto__')
    expect(() => assertSafeExpressProgram('$__proto__ = 1')).toThrow(/prototype/i)

    const ids = extractUpdateSurfaceIds(
      [
        'surface("s1")',
        '# surface("commented", true)',
        'surface("s2", true)',
        'surface(id="s3", update=true)',
      ].join('\n'),
    )
    expect(ids).toEqual(['s2', 's3'])

    expect(normalizePointerPath('/a//b///c/')).toBe('/a/b/c')
    expect(referencesObscuredPointer({ path: '' }, new Set(['/']))).toBe(true)
    expect(isScrubbableNumericSecret(1234, new Set(['1234']))).toBe(true)
    expect(isScrubbableNumericSecret(123, new Set(['123']))).toBe(false)

    const tplKv = new Set<string>()
    resolveTemplateKvPointers(
      [
        { id: 'list', component: 'List', children: { componentId: 'kv', path: '/groups' } },
        { id: 'kv', component: 'KvEditor', items: { path: './env' } },
      ],
      tplKv,
    )
    expect(tplKv.has('/groups/*/env')).toBe(true)

    const registry = new PendingAskRegistry()
    expect(() => registry.assertCanWait('sess-1')).not.toThrow()
    const pendingPromise = registry.wait({
      sessionId: 'sess-1',
      callId: 'call-1',
      defaultSurfaceId: 'ask_s1',
      allowedSurfaceIds: ['ask_s1'],
      timeoutSeconds: 5,
    })
    const settled = registry.settle('sess-1', {
      callId: 'call-1',
      surfaceId: 'ask_s1',
      dataModels: {
        ask_s1: { ok: true },
        unrelated_surface: { leak: 'secret' },
      },
    })
    expect(settled).toBe(true)
    const res = await pendingPromise
    expect(res.status).toBe('answered')
    if (res.status === 'answered') {
      expect(res.dataModels).toEqual({ ask_s1: { ok: true } })
    }
  })

  it('Batch 1b: preserves data: label strings, trig calc functions, and nested calc flattening', () => {
    expect(sanitizeInlineUrlText('data:users')).toBe('data:users')
    expect(sanitizeInlineUrlText('data:prod')).toBe('data:prod')
    expect(sanitizeInlineUrlText('data:text/html,<script>alert(1)</script>')).not.toContain(
      'data:text/html',
    )
    expect(computeCalc('sin(0) + cos(0) + tan(0)', {})).toBe(1)

    const nestedCalc = preprocessExpressProgram(
      [
        'surface("s")',
        '$/base = 2',
        'x = calc("a + 3", { a: $/base })',
        'y = calc("x * 4", { x: x })',
        'root = Text(text=y)',
      ].join('\n'),
    )
    expect(nestedCalc).toContain('(a + 3) * 4')
  })

  it('Batch 2: hardens Mermaid CSS/SVG sanitizer, ID namespacing, streaming wipe, and file paths', () => {
    const scopedCss = scopeMermaidStyleRules(
      '<svg id="m1"><style>.a{position:fixed;inset-block:0;background:u\\72 l(https://evil.test/x);color:red}</style></svg>',
      'm1',
    )
    expect(scopedCss).not.toMatch(/position\s*:/i)
    expect(scopedCss).not.toMatch(/inset-block/i)
    expect(scopedCss).not.toMatch(/evil\.test/i)

    expect(
      isSafeStaticSvgImage(
        '<svg xmlns="http://www.w3.org/2000/svg"><g data-onclick="safe" data-onhover="ok"><rect width="10" height="10"/></g></svg>',
      ),
    ).toBe(true)
    expect(
      isSafeStaticSvgImage(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(&quot;#grad1&quot;)" width="10" height="10"/></svg>',
      ),
    ).toBe(true)

    const nsSvg = namespaceSvgIds(
      '<svg id="m1"><defs><linearGradient id="g1"/></defs><style>@media screen { #m1 .box { fill: url(#g1); } }</style><g id="n1" data-id="n1" aria-labelledby="t1"><title id="t1">T</title></g></svg>',
      'p9-',
    )
    expect(nsSvg).toContain('data-id="n1"')
    expect(nsSvg).toContain('aria-labelledby="p9-t1"')
    expect(nsSvg).toContain('url(#p9-g1)')
    expect(nsSvg).toContain('#p9-m1')

    const stream = new StreamingExpressSession()
    const okSnap = stream.advance('surface("s1")\nroot = Text(text="ok")\n', false)
    expect(okSnap.messages.length).toBeGreaterThan(0)
    const badSnap = stream.advance('$__proto__ = 1', true)
    expect(badSnap.messages).toEqual([])
    expect(badSnap.surfaceIds).toEqual([])

    const pctFile = parseFileTarget('/workspace/100%_cpu.log:42')
    expect(pctFile).toEqual({ path: '/workspace/100%_cpu.log', line: 42 })
    expect(parseFileTarget('/workspace/%2e%2e/etc/passwd')).toBeNull()
  })

  it('Batch 3: verifies generalized 276px ECharts fixes across treemap, boxplot, heatmap, candlestick, hbar, gauge, bullet, pie, parallel, sankey, graph, and combo', () => {
    const tmOpt = buildChartOption(
      {
        kind: 'treemap',
        data: [
          {
            name: 'Infra',
            value: 0,
            children: [
              { name: 'Compute', value: 120 },
              { name: 'Storage', value: 80 },
            ],
          },
        ],
      },
      true,
      276,
    ) as { series: Array<{ data: Array<{ name: string; value?: number; children?: unknown[] }> }> }
    expect(tmOpt.series[0]?.data[0]?.value).toBeUndefined()
    expect(tmOpt.series[0]?.data[0]?.children).toHaveLength(2)

    const bpOpt = buildChartOption(
      {
        kind: 'boxplot',
        xField: 'svc',
        yField: 'vals',
        data: [
          { svc: 'Pay-Core', vals: [10, null, 20, Number.NaN, 30, 40, 50] },
          { svc: 'Order-DB', vals: [15, 25, 35, 45, 55] },
        ],
      },
      true,
      276,
    ) as {
      xAxis: { data: string[] }
      series: Array<{ data: number[][] }>
    }
    expect(bpOpt.series[0]?.data[0]?.[0]).toBe(10)
    expect(bpOpt.xAxis.data[0]).toContain('Pay-')

    const hmOpt = buildChartOption(
      {
        kind: 'heatmap',
        xField: 'x',
        yField: 'y',
        sizeField: 'v',
        data: [
          { x: 'A', y: 'R1', v: 1250000 },
          { x: 'B', y: 'R1', v: 980000 },
          { x: 'A', y: 'R2', v: 2450000 },
          { x: 'B', y: 'R2', v: 1500000 },
        ],
      },
      true,
      276,
    ) as {
      visualMap: { formatter?: (v: number) => string }
      series: Array<{ label?: { formatter?: (p: unknown) => string } }>
    }
    expect(hmOpt.visualMap.formatter?.(2450000)).toBe('2.45M')
    expect(hmOpt.series[0]?.label?.formatter?.({ value: [0, 0, 1250000] })).toBe('1.25M')

    const csOpt = buildChartOption(
      {
        kind: 'candlestick',
        xField: 'd',
        data: [
          { d: '2025-12-28', open: 98, close: 100, low: 96, high: 102 },
          { d: '2025-12-29', open: 100, close: 103, low: 99, high: 106 },
          { d: '2025-12-30', open: 103, close: 105, low: 98, high: 108 },
          { d: '2025-12-31', open: 105, close: 104, low: 102, high: 109 },
          { d: '2026-01-02', open: 105, close: 102, low: 101, high: 109 },
          { d: '2026-01-03', open: 102, close: 110, low: 100, high: 112 },
        ],
      },
      true,
      276,
    ) as { xAxis: { axisLabel?: { formatter?: (v: string) => string } } }
    expect(csOpt.xAxis.axisLabel?.formatter?.('2026-01-02')).toBe('01/02')

    const hbarOpt = buildChartOption(
      {
        kind: 'bar',
        horizontal: true,
        xField: 'svc',
        yField: 'err',
        referenceLine: 0.38,
        referenceLabel: 'Max 0.38',
        data: [
          { svc: 'Auth', err: 0.12 },
          { svc: 'Pay', err: 0.45 },
        ],
      },
      true,
      276,
    ) as {
      series: Array<{
        markLine?: { label?: { align?: string } }
      }>
    }
    expect(hbarOpt.series[0]?.markLine?.label?.align).toBe('right')

    const gaugeOpt = buildChartOption(
      {
        kind: 'gauge',
        data: { value: 1850000, min: 0, max: 2000000, unit: 'req/s' },
      },
      true,
      276,
    ) as {
      series: Array<{
        detail?: { formatter?: (v: number) => string }
        axisLabel?: { formatter?: (v: number) => string }
      }>
    }
    expect(gaugeOpt.series[0]?.detail?.formatter?.(1850000)).toBe('1.85M')
    expect(gaugeOpt.series[0]?.axisLabel?.formatter?.(2000000)).toBe('2M')

    const bulletOpt = buildChartOption(
      {
        kind: 'bullet',
        data: [{ name: 'QPS', value: 78000, target: 90000, ranges: [30000, 60000, 100000] }],
      },
      true,
      276,
    ) as {
      xAxis: { axisLabel?: { formatter?: (v: number) => string } }
      series: Array<{ data: number[] }>
    }
    expect(bulletOpt.series[0]?.data[0]).toBe(100000)
    expect(bulletOpt.xAxis.axisLabel?.formatter?.(100000)).toBe('100K')

    const pieOpt = buildChartOption(
      {
        kind: 'pie',
        xField: 'name',
        yField: 'v',
        data: [
          { name: "R&D 'Core'", v: 42 },
          { name: 'Ops & QA', v: 58 },
        ],
      },
      true,
      276,
    ) as {
      tooltip: { formatter?: (p: unknown) => string }
    }
    expect(typeof pieOpt.tooltip.formatter).toBe('function')
    expect(pieOpt.tooltip.formatter?.({ name: "R&D 'Core'", value: 42, percent: 42 })).toContain(
      "R&D 'Core'",
    )

    const parOpt = buildChartOption(
      {
        kind: 'parallel',
        yField: ['a', 'b', 'c', 'd', 'e'],
        data: [
          { a: 1000001, b: 10, c: 20, d: 30, e: 40 },
          { a: 1000004, b: 12, c: 25, d: 35, e: 45 },
        ],
      },
      true,
      276,
    ) as {
      parallelAxis: Array<{
        axisLabel?: { formatter?: (v: number) => string; align?: string }
      }>
    }
    expect(parOpt.parallelAxis[0]?.axisLabel?.formatter?.(1000001)).toBe('1,000,001')
    expect(parOpt.parallelAxis[4]?.axisLabel?.align).toBe('left')

    const sankeyOpt = buildChartOption(
      {
        kind: 'sankey',
        data: {
          links: [{ source: 'Source', target: 'Very Long Leaf Target Node Name', value: 10 }],
        },
      },
      true,
      276,
    ) as {
      series: Array<{ right?: number; data: Array<{ name: string; label?: { width?: number } }> }>
    }
    const rightPad = sankeyOpt.series[0]?.right ?? 0
    const leaf = sankeyOpt.series[0]?.data.find((d) => d.name === 'Very Long Leaf Target Node Name')
    expect(leaf?.label?.width).toBeLessThanOrEqual(Math.max(40, rightPad - 18))

    const graphOpt = buildChartOption(
      {
        kind: 'graph',
        data: {
          categories: [{ name: 'Edge' }, { name: 'Core' }],
          nodes: [
            { id: 'n1', name: 'GW', category: 0, value: 88 },
            { id: 'n2', name: 'API', category: 1, value: 99 },
          ],
          links: [
            { source: 'n1', target: 'n2' },
            { source: 'n1', target: 'missing-node' },
          ],
        },
      },
      true,
      276,
    ) as {
      series: Array<{
        data: Array<{ id: string; category?: number; value?: number }>
        links: Array<{ source: string; target: string }>
      }>
    }
    expect(graphOpt.series[0]?.links).toHaveLength(1)
    expect(graphOpt.series[0]?.data[0]?.value).toBe(88)
    expect(graphOpt.series[0]?.data[1]?.category).toBe(1)

    const comboOpt = buildChartOption(
      {
        kind: 'combo',
        xField: 'q',
        yField: 'rev',
        y2Field: 'growth',
        referenceLine: -5,
        data: [
          { q: 'Q1', rev: -20, growth: -15 },
          { q: 'Q2', rev: 40, growth: 25 },
        ],
      },
      true,
      276,
    ) as { yAxis: Array<{ min?: number; max?: number; interval?: number }> }
    expect(comboOpt.yAxis[0]?.min).not.toBe(0)
    expect(comboOpt.yAxis[1]?.min).not.toBe(0)
    expect(comboOpt.yAxis[0]?.min === undefined || comboOpt.yAxis[0].min < 0).toBe(true)
    expect(comboOpt.yAxis[1]?.min === undefined || comboOpt.yAxis[1].min < 0).toBe(true)
  })

  it('Batch 4: verifies pure helpers across Table, Matrix, Schedule, LogViewer, ApiEndpoint, and Terminal', () => {
    expect(resolveTableBadgeTone('无异常').tone).toBe('success')
    expect(resolveTableBadgeTone('0 failed').tone).toBe('success')
    expect(resolveTableBadgeTone('No error').tone).toBe('success')
    expect(resolveTableBadgeTone('CRITICAL error').tone).toBe('danger')

    expect(parseFormattedNumericCell('−12.5%')).toBe(-12.5)
    expect(parseFormattedNumericCell('.5')).toBe(0.5)
    expect(parseFormattedNumericCell('1,23')).toBeNull()

    const mixed = ['2', '10', 'alpha', '2b']
    for (const a of mixed) {
      for (const b of mixed) {
        for (const c of mixed) {
          const ab = compareTableAlphanumericCells(a, b)
          const bc = compareTableAlphanumericCells(b, c)
          const ac = compareTableAlphanumericCells(a, c)
          if (ab <= 0 && bc <= 0) {
            expect(ac).toBeLessThanOrEqual(0)
          }
        }
      }
    }

    const summary = computeTableNumericSummary(
      [{ key: 'sla' }],
      [{ sla: '99.99998%' }, { sla: '99.99996%' }],
      new Set(['sla']),
    )
    expect(summary.sla).toBe('Avg 99.99997%')

    const matrix = normalizeMatrixData({
      rows: ['Auth'],
      columns: ['SLA', 'Missing'],
      values: [[99.99998, ' - ']],
    })
    expect(matrix.cells[0]?.[0]?.display).toBe('99.99998')
    expect(matrix.cells[0]?.[1]?.kind).toBe('empty')

    const sched = normalizeScheduleItems(
      [
        { title: 'Late Shift', start: '20:00', end: '24:00' },
        { title: 'Daytime Typo', start: '10:00', end: '09:00' },
        { title: 'Invalid Label', start: 'Day 1', end: 'Day 2' },
      ],
      undefined,
    )
    expect(sched.tracks).toHaveLength(2)
    expect(sched.tracks[0]?.widthPct).toBeGreaterThan(0)
    expect(sched.axisTicks).toHaveLength(4)

    const logs = normalizeLogEntries(
      [
        '2026-11-24 14:32:01,452 [auth-svc] ERROR token signature mismatch',
        '2026-11-24 14:32:02,010 WARN [cache] hit ratio below 80%',
        '2026-11-24 14:32:03,118 INFO Error recovery completed successfully',
      ].join('\n'),
    )
    expect(logs.map((l) => l.level)).toEqual(['error', 'warn', 'info'])
    expect(logs[0]?.service).toBe('auth-svc')
    expect(logs[1]?.service).toBe('cache')

    const curl = buildEndpointCurl({
      method: 'GET',
      path: '/v1/orders/{id}',
      baseUrl: 'https://api.example.com',
      params: [
        { name: 'q', in: 'query', example: 'hello world' },
        { name: 'X-Tenant', in: 'header', example: 'acme' },
      ],
    })
    expect(curl).toContain('curl -g')
    expect(curl).toContain('q=hello%20world')
    expect(curl).toContain('X-Tenant: acme')

    const cmds = normalizeTerminalCommands('$ echo \\\n  hello\n> pkg@1.0.0 build\n$ ls')
    expect(cmds.map((c) => c.cmd)).toEqual(['echo hello', 'ls'])
  })
})
