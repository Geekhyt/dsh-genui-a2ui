import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
import { A2uiActionUserChip } from '../src/client/shell/ActionUserChip.tsx'
import { A2uiAskDockView, A2uiAskToolView } from '../src/client/shell/AskToolView.tsx'
import { formatActionMessage, matchA2uiActionUserText } from '../src/client/action-protocol.ts'
import { DSH_REACT_COMPONENTS } from '../src/client/catalog/BasicWidgets.tsx'
import { namespaceSvgIds } from '../src/client/catalog/ExtendedWidgets.tsx'
import {
  computeArrayAvg,
  computeArraySum,
  computeGt,
  computeIncludes,
  computeLt,
} from '../src/client/catalog/functions.ts'
import {
  buildEndpointCurl,
  compareFormattedNumericCells,
  computeTableNumericSummary,
  filterTableRowsByField,
  normalizeScheduleItems,
} from '../src/client/catalog/v4-helpers.ts'
import {
  collectBranchDepths,
  decimalPlacesOf,
  normalizeHierarchyTree,
} from '../src/client/catalog/v5-helpers.ts'
import {
  computeClampedPopoverBox,
  isSafeAvMediaUrl,
  isSafeImageUrl,
} from '../src/client/catalog/widget-helpers.tsx'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { scopeMermaidStyleRules } from '../src/client/chunks/mermaid-chunk.ts'
import {
  cleanupA2uiRuntimeStyles,
  ensureA2uiRuntimeStyles,
} from '../src/client/chunks/runtime-chunk.ts'
import { A2uiDockView } from '../src/client/shell/DockView.tsx'
import { ErrorBoundary } from '../src/client/runtime/ErrorBoundary.tsx'
import { isPathWithinWorkspace, parseFileTarget } from '../src/client/file-opener.tsx'
import {
  assertSafeSvg,
  repairMermaidSource,
  stripUnsafeDirectives,
} from '../src/client/mermaid-safe.ts'
import { isPointerObscured, isPointerObscuredOrParent } from '../src/client/persistence.ts'
import { A2uiTierControl } from '../src/client/shell/TierControl.tsx'
import { A2uiToolView } from '../src/client/shell/ToolView.tsx'
import { A2uiTurnTailView } from '../src/client/shell/TurnTailView.tsx'
import { collectObscuredPointersFromMessages, PendingAskRegistry } from '../src/host/ask-tool.ts'
import { isSubagentCall } from '../src/host/render-tool.ts'
import { evaluateCalcExpression } from '../src/shared/calc-engine.ts'
import { CHART_KINDS } from '../src/shared/catalog-schema.ts'
import { isSecretKey, safeStringifyJson, sanitizeInlineUrlText } from '../src/shared/constants.ts'
import {
  extractUpdateSurfaceIds,
  preprocessExpressProgram,
} from '../src/shared/express-preprocess.ts'
import { resolveClientLocale, setUiLocaleOverride } from '../src/shared/i18n.ts'
import { formatNativeTemporalValue } from '../src/shared/temporal.ts'

describe('v0.4.4 Comprehensive Review Hardening (CLS-1..CLS-8)', () => {
  it('CLS-1: hardens Mermaid directive/CSS/SVG sanitization, file targets, media URLs, cURL, and action headers', () => {
    expect(
      stripUnsafeDirectives('%%%%{init: {"securityLevel":"loose"}}%%\ngraph TD\nA-->B'),
    ).not.toContain('init')
    expect(
      stripUnsafeDirectives('---   \nsecurityLevel: loose\n---\ngraph TD\nA-->B'),
    ).not.toContain('securityLevel')
    expect(repairMermaidSource('graph TD\n`%%{init: {"theme":"dark"}}%%`\nA-->B')).not.toContain(
      '%%{',
    )

    const scoped = scopeMermaidStyleRules(
      '<svg id="a2ui-mmd-1"><style>/*x*/ body { display:none } @import url(//evil); #a2ui-mmd-1 .node { fill: red; background: url(https://evil.com/a.png); } @media screen { #a2ui-mmd-1 text { font-size: 12px; } }</style><foreignObject style="position:fixed;inset:0;color:red">x</foreignObject></svg>',
      'a2ui-mmd-1',
    )
    expect(scoped).not.toContain('body')
    expect(scoped).not.toContain('@import')
    expect(scoped).not.toContain('https://evil.com')
    expect(scoped).not.toContain('position:fixed')
    expect(scoped).not.toContain('inset:0')
    expect(scoped).toContain('color:red')
    expect(scoped).toContain('#a2ui-mmd-1 text')

    expect(() => assertSafeSvg('<svg><text>JavaScript: Event Loop</text></svg>')).not.toThrow()
    expect(() =>
      assertSafeSvg('<svg><animateTransform attributeName="transform" /></svg>'),
    ).toThrow()
    expect(() => assertSafeSvg('<svg><image href="https://evil.com/x.png" /></svg>')).toThrow()

    expect(parseFileTarget('\\/evil.com/share/a.ts')).toBeNull()
    expect(parseFileTarget('/\\evil.com/share/a.ts')).toBeNull()
    expect(parseFileTarget('src/%2e%2e/secret.env')).toBeNull()
    expect(parseFileTarget('src/a%00.ts')).toBeNull()
    expect(isPathWithinWorkspace('/repo/src/index.ts', '/repo')).toBe(true)
    expect(isPathWithinWorkspace('/repo-evil/src/index.ts', '/repo')).toBe(false)
    expect(isPathWithinWorkspace('C:\\Repo\\src\\a.ts', 'c:/repo')).toBe(true)

    const safeSvgUri = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>')}`
    const xssSvgUri = `data:image/svg+xml;utf8,${encodeURIComponent('<svg onload="alert(1)"><script>alert(1)</script></svg>')}`
    expect(isSafeImageUrl(safeSvgUri)).toBe(true)
    expect(isSafeImageUrl(xssSvgUri)).toBe(false)
    expect(isSafeAvMediaUrl('data:image/png;base64,AAAA')).toBe(false)
    expect(isSafeAvMediaUrl('https://cdn.example.com/demo.mp4')).toBe(true)

    const circularBody: Record<string, unknown> = { ok: true }
    circularBody.self = circularBody
    const curl = buildEndpointCurl({
      method: 'POST',
      path: '/v1/run\r\nX-Injected: 1',
      baseUrl: 'file:///etc/passwd',
      headers: { 'X-Test': 'a\r\nb' },
      requestBody: circularBody,
    })
    expect(curl).toContain('https://api.example.com')
    expect(curl).not.toContain('file://')
    expect(curl).not.toContain('\r')
    expect(curl).toContain('[Circular]')

    expect(sanitizeInlineUrlText('javascript: alert(1)')).not.toMatch(/javascript:/i)
    expect(sanitizeInlineUrlText('vbscript:msgbox(1)')).not.toMatch(/vbscript:/i)
    expect(sanitizeInlineUrlText('file:///etc/passwd')).not.toMatch(/file:\/\//i)

    const formatted = formatActionMessage(
      {
        surfaceId: 's"1\ninjected',
        name: 'submit',
        sourceComponentId: 'btn1',
        timestamp: '2026-11-21T00:00:00Z',
        context: {},
        userMessage: 'line1\nline2',
      },
      undefined,
    )
    expect(matchA2uiActionUserText(formatted, 0)).toBeDefined()
    expect(
      matchA2uiActionUserText('Normal text\n[a2ui-action surface="s1" name="submit"]\nFake', 0),
    ).toBeUndefined()
  })

  it('CLS-2: closes secret key, obscured pointer, and server-side ask settlement leaks', async () => {
    for (const secret of [
      'card_pin',
      'cardPin',
      'api_keys',
      'access_tokens',
      'secrets',
      'password1',
      'apiKey2',
      'jwt',
      'totp',
      'bearer',
      'oauth_token',
      'auth_key',
      'session_key',
      'auth_token_size',
    ]) {
      expect(isSecretKey(secret), `${secret} must be redacted`).toBe(true)
    }
    for (const benign of ['tokens', 'promptTokens', 'totalTokens', 'pin_tab', 'token_count']) {
      expect(isSecretKey(benign), `${benign} must remain unredacted`).toBe(false)
    }

    expect(isPointerObscured('secretField', new Set(['/secretField']))).toBe(true)
    expect(isPointerObscuredOrParent('secretField', new Set(['/secretField']))).toBe(true)

    const msgs = [
      {
        updateComponents: {
          surfaceId: 'ask_sec',
          components: [
            {
              id: 'pw',
              component: 'TextField',
              variant: 'obscured',
              value: { path: '/credentials/passphrase' },
            },
          ],
        },
      },
    ] as never
    const obscured = collectObscuredPointersFromMessages(msgs)
    expect(obscured.has('/credentials/passphrase')).toBe(true)

    const registry = new PendingAskRegistry()
    const promise = registry.wait({
      sessionId: 'sess-sec',
      callId: 'call-sec',
      defaultSurfaceId: 'ask_sec',
      timeoutSeconds: 5,
      obscuredPointers: obscured,
    })
    registry.settle('sess-sec', {
      callId: 'call-sec',
      action: 'submit',
      dataModels: {
        ask_sec: {
          user: 'alice',
          credentials: { passphrase: 'super-secret-value' },
        },
      },
    })
    const settled = await promise
    expect(settled.status).toBe('answered')
    if (settled.status === 'answered') {
      const askModel = (settled.dataModels?.ask_sec ?? {}) as Record<
        string,
        Record<string, unknown>
      >
      expect(askModel.credentials?.passphrase).toBeUndefined()
    }
  })

  it('CLS-3: enforces linear O(N) Express preprocessing, chained calc accuracy, safe stringify, and symmetric rounding', () => {
    const evil = '('.repeat(60_000)
    const t0 = performance.now()
    preprocessExpressProgram(evil)
    expect(performance.now() - t0).toBeLessThan(150)

    const withComment = [
      "surface('s1') // user's dashboard",
      '$/msg = """hello // not a comment"""',
      'root = Card(Text($/msg))',
    ].join('\n')
    const prep = preprocessExpressProgram(withComment)
    expect(prep).toContain('"""hello // not a comment"""')
    expect(
      extractUpdateSurfaceIds(
        '/* surface("fake", update=true) */\nsurface(id="real_s", update=true)',
      ),
    ).toEqual(['real_s'])

    const chained = [
      'surface("c1")',
      '$/x = 10',
      '$/y = 20',
      'a = calc("x * 1.115", { x: $/x }, decimals=1)',
      'b = calc("a + x", { a: a, x: $/y }, decimals=2)',
      'root = Card(Stat("R", b))',
    ].join('\n')
    const flat = preprocessExpressProgram(chained)
    expect(flat).toContain('round(')
    expect(flat).not.toMatch(/x:\s*\$\/x,\s*x:\s*\$\/y/)

    const shared = { tag: 'ok' }
    const multiRef = { first: shared, second: shared }
    const serialized = safeStringifyJson(multiRef, 0)
    expect(serialized).not.toContain('[Circular]')
    expect(JSON.parse(serialized)).toEqual({ first: { tag: 'ok' }, second: { tag: 'ok' } })

    expect(evaluateCalcExpression('round(-2.5, 0)')).toBe(-3)
    expect(evaluateCalcExpression('round(35.855, 2)')).toBe(35.86)
    expect(evaluateCalcExpression('-2.5', {}, 0)).toBe(-3)
    expect(evaluateCalcExpression('35.855', {}, 2)).toBe(35.86)
  })

  it('CLS-4: covers all 19 ECharts kinds at 276px, thin filled-shape halos, smart legends, waterfall & boxplot math', () => {
    const samples: Record<(typeof CHART_KINDS)[number], Record<string, unknown>> = {
      bar: { data: [{ x: '华东大区核心集群', y: 120 }], xField: 'x', yField: 'y' },
      line: {
        data: [{ x: '10:00', a: 0.04, b: 0.08 }],
        xField: 'x',
        yField: ['a', 'b'],
        referenceLine: 0.05,
      },
      area: { data: [{ x: 'Q1', a: 30, b: -10 }], xField: 'x', yField: ['a', 'b'], stacked: true },
      pie: {
        data: [
          { x: 'A', y: 40 },
          { x: 'B', y: 60 },
        ],
      },
      scatter: {
        data: [
          { x: 10, y: 20, g: 'Fast' },
          { x: 30, y: 40, g: 'Slow' },
        ],
        xField: 'x',
        yField: 'y',
        seriesField: 'g',
      },
      radar: {
        data: [{ dim: '推理', 'DeepSeek-V3': 88, 'DeepSeek-R1': 95 }],
        xField: 'dim',
        yField: ['DeepSeek-V3', 'DeepSeek-R1'],
      },
      funnel: {
        data: [
          { stage: '曝光', v: 100 },
          { stage: '转化', v: 20 },
        ],
      },
      gauge: { data: [{ name: '集群吞吐率指标', value: 78, max: 120 }] },
      heatmap: {
        data: [
          { x: '周一', y: '网关延迟', v: 10 },
          { x: '周二', y: '网关延迟', v: 90 },
        ],
        xField: 'x',
        yField: 'y',
        sizeField: 'v',
      },
      treemap: { data: [{ name: 'R1 深度推理', value: 36 }] },
      sunburst: { data: [{ name: '深度研究', value: 36, parent: 'AI 对话' }] },
      sankey: {
        data: [
          { source: 'A', target: 'B', value: 10 },
          { source: 'A', target: 'B', value: 15 },
        ],
      },
      boxplot: { data: [{ name: '延迟分布', values: [1, 2, 3, 4, 5, 10, 20, 40, 100] }] },
      graph: {
        data: {
          nodes: [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' },
          ],
          links: [{ source: 'a', target: 'b' }],
        },
      },
      candlestick: { data: [{ date: '11-01', open: 10, close: 12, low: 9, high: 14 }] },
      waterfall: {
        data: [
          { step: '基线', delta: 50, total: true },
          { step: '暴跌', delta: -80 },
          { step: '再跌', delta: -20 },
        ],
      },
      combo: {
        data: [{ h: '10:00', qps: 100, p99: 80 }],
        xField: 'h',
        yField: 'qps',
        y2Field: 'p99',
      },
      parallel: {
        data: [
          { m: 'DeepSeek-V3', a: 1, b: 2 },
          { m: 'DeepSeek-R1', a: 3, b: 4 },
        ],
        xField: 'm',
        yField: ['a', 'b'],
      },
      calendar: {
        data: [
          { date: 1730419200, count: 5 },
          { date: '2026-02-31', count: 9 },
        ],
      },
      range: {
        data: [
          { t: '10:00', low: 18, value: 26, high: 35 },
          { t: '11:00', low: 20, value: 30, high: 42 },
        ],
        xField: 't',
        yField: 'value',
      },
      bullet: {
        data: [{ label: '订单达成率', value: 86, target: 90, max: 100 }],
      },
      histogram: {
        data: [12, 18, 22, 24, 29, 31, 45, 58, 62, 74],
      },
      dumbbell: {
        data: [{ name: '结算接口 P99', before: 420, after: 118 }],
      },
      rose: {
        data: [
          { name: '华东', value: 42 },
          { name: '华南', value: 31 },
          { name: '华北', value: 27 },
        ],
      },
      radialBar: {
        data: [
          { name: 'GPU 利用率', value: 84, max: 100 },
          { name: '显存占用', value: 71, max: 100 },
        ],
      },
      chord: {
        data: {
          nodes: [{ name: 'Gateway' }, { name: 'Order' }, { name: 'Pay' }],
          links: [
            { source: 'Gateway', target: 'Order', value: 40 },
            { source: 'Order', target: 'Pay', value: 30 },
            { source: 'Pay', target: 'Gateway', value: 12 },
          ],
        },
      },
    }

    for (const kind of CHART_KINDS) {
      const opt = buildChartOption({ kind, ...samples[kind] } as never, false, 276) as Record<
        string,
        unknown
      >
      expect(Array.isArray(opt.series), `${kind} should build series at 276px`).toBe(true)
    }

    const radarOpt = buildChartOption(
      {
        kind: 'radar',
        data: [{ dim: '推理', 'DeepSeek-V3': 88, 'DeepSeek-R1': 95 }],
        xField: 'dim',
        yField: ['DeepSeek-V3', 'DeepSeek-R1'],
      },
      true,
      276,
    ) as { legend: { formatter: (n: string) => string } }
    expect(radarOpt.legend.formatter('DeepSeek-V3')).toBe('DeepSeek-V3')
    expect(radarOpt.legend.formatter('DeepSeek-R1')).toBe('DeepSeek-R1')

    const multiCollision = buildChartOption(
      {
        kind: 'line',
        data: [{ t: 'T1', 'DeepSeek-V3': 1, 'DeepSeek-R1': 2, 'DeepSeek-25': 3 }],
        xField: 't',
        yField: ['DeepSeek-V3', 'DeepSeek-R1', 'DeepSeek-25'],
      },
      true,
      276,
    ) as { legend: { formatter: (n: string) => string } }
    const l1 = multiCollision.legend.formatter('DeepSeek-V3')
    const l2 = multiCollision.legend.formatter('DeepSeek-R1')
    expect(l1).not.toBe(l2)

    const tmOpt = buildChartOption(
      { kind: 'treemap', data: [{ name: 'A', value: 10 }] },
      true,
      276,
    ) as {
      series: Array<{ label: { textBorderWidth: number; textShadowBlur: number } }>
    }
    expect(tmOpt.series[0]?.label.textBorderWidth).toBe(0.8)
    expect(tmOpt.series[0]?.label.textShadowBlur).toBe(3)

    const wfWide = buildChartOption(
      {
        kind: 'waterfall',
        data: [
          { step: '基线', delta: 480, total: true },
          { step: '增量', delta: 165 },
          { step: '回撤', delta: -55 },
          { step: '增量2', delta: 70 },
          { step: '合计', delta: 660, total: true },
        ],
        xField: 'step',
        yField: 'delta',
        referenceLine: 645,
        referenceLabel: '目标 645',
      },
      true,
      520,
    ) as { series: Array<{ data: Array<{ label?: { position?: string } } | string> }> }
    const wfNarrow = buildChartOption(
      {
        kind: 'waterfall',
        data: [
          { step: '基线', delta: 480, total: true },
          { step: '增量', delta: 165 },
          { step: '回撤', delta: -55 },
          { step: '增量2', delta: 70 },
          { step: '合计', delta: 660, total: true },
        ],
        xField: 'step',
        yField: 'delta',
        referenceLine: 645,
        referenceLabel: '目标 645',
      },
      true,
      276,
    ) as { series: Array<{ data: Array<{ label?: { position?: string } } | string> }> }
    expect((wfWide.series[2]?.data[1] as { label?: { position?: string } })?.label?.position).toBe(
      'inside',
    )
    expect(
      (wfNarrow.series[2]?.data[1] as { label?: { position?: string } })?.label?.position,
    ).toBe('bottom')

    const wfNeg = buildChartOption(
      {
        kind: 'waterfall',
        data: [
          { step: '基线', delta: 50, total: true },
          { step: '回撤', delta: -80 },
          { step: '再跌', delta: -20 },
        ],
        xField: 'step',
        yField: 'delta',
      },
      true,
      276,
    ) as { tooltip: { formatter: (p: unknown) => string } }
    const negTip = wfNeg.tooltip.formatter([
      { name: '再跌', seriesName: '缩减', value: -20, dataIndex: 2 },
    ])
    expect(negTip).toContain('-20')
    expect(negTip).not.toContain('--20')
    const crossTip = wfNeg.tooltip.formatter([
      { name: '回撤', seriesName: '缩减', value: 50, dataIndex: 1 },
    ])
    expect(crossTip).toContain('-80')

    const boxOpt = buildChartOption(
      { kind: 'boxplot', data: [{ name: 'B', values: [1, 2, 3, 4, 5, 10, 20, 40, 100] }] },
      false,
      276,
    ) as { series: Array<{ data: number[][] }> }
    expect(boxOpt.series[0]?.data[0]?.[4]).toBe(100)

    const calOpt = buildChartOption(
      {
        kind: 'calendar',
        data: [
          { date: 1730419200, count: 5 },
          { date: '2026-02-31', count: 9 },
        ],
      },
      false,
      276,
    ) as { series: Array<{ data: Array<[string, number]> }> }
    expect(calOpt.series[0]?.data).toEqual([['2024-11-01', 5]])
  })

  it('CLS-5: fixes Table numeric sort/summary, cross-filter precision, Schedule overnight, temporal, Tree allOpen, SVG IDs, and functions', () => {
    expect(compareFormattedNumericCells('¥800', '¥1,200')).toBeLessThan(0)
    expect(compareFormattedNumericCells('-¥500', '¥100')).toBeLessThan(0)
    expect(compareFormattedNumericCells(null, '¥100')).toBeGreaterThan(0)

    const summary = computeTableNumericSummary(
      [{ key: 'dt' }, { key: 'pct' }, { key: 'net' }],
      [
        { dt: '2026-11-21', pct: '10%', net: '-¥500' },
        { dt: '2026-11-22', pct: '', net: '¥1,500' },
        { dt: '2026-11-23', pct: '20%', net: '¥200' },
      ],
      new Set(['dt', 'pct', 'net']),
      (val) => `均值 ${val}`,
    )
    expect(summary.dt).toBeUndefined()
    expect(summary.pct).toBe('均值 15.0%')
    expect(summary.net).toBe('¥1,200')

    const rows = [
      { region: 'US-East', rev: 10 },
      { region: 'a', rev: 20 },
      { region: '华东', rev: 30 },
    ]
    expect(filterTableRowsByField(rows, 'region', '华东 9,860')).toEqual([
      { region: '华东', rev: 30 },
    ])
    expect(filterTableRowsByField(rows, 'region', 'US-East 100')).toEqual([
      { region: 'US-East', rev: 10 },
    ])

    const sched = normalizeScheduleItems([{ title: 'Night', start: '23:00', end: '02:00' }])
    expect(sched.tracks[0]?.widthPct).toBeCloseTo(100, 1)
    expect(sched.axisTicks[0]).toBe('23:00')
    expect(sched.axisTicks[3]).toBe('02:00')

    expect(formatNativeTemporalValue('2026-11-21T14:30', 'datetime-local')).toBe('2026-11-21T14:30')
    expect(formatNativeTemporalValue('2026-11-21T14:30:00Z', 'date')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(decimalPlacesOf(1e-5)).toBe(5)

    const tree = normalizeHierarchyTree([
      {
        id: 'r1',
        label: 'Root',
        children: [{ id: 'c1', label: 'Child', children: [{ id: 'l1', label: 'Leaf' }] }],
      },
    ])
    const branches = collectBranchDepths(tree)
    expect(branches.every((b) => b.depth < 3)).toBe(true)

    const nsSvg = namespaceSvgIds(
      '<svg id="m1"><style>#m1 .a{fill:red}</style><defs><marker id="arr"/></defs><path marker-end="url(#arr)" href="#arr"/></svg>',
      'p1_',
    )
    expect(nsSvg).toContain('id="p1_m1"')
    expect(nsSvg).toContain('#p1_m1 .a')
    expect(nsSvg).toContain('url(#p1_arr)')
    expect(nsSvg).toContain('href="#p1_arr"')

    expect(computeGt('abc', -1)).toBe(false)
    expect(computeLt('abc', 1)).toBe(false)
    expect(computeIncludes('hello', null)).toBe(false)
    expect(computeArrayAvg([0.001, 0.002])).toBe(0.0015)
    expect(computeArraySum([0.1, 0.2])).toBe(0.3)

    const upward = computeClampedPopoverBox(
      { top: 720, bottom: 754, left: 20, width: 220 },
      { minWidth: 200, estHeight: 240 },
    )
    expect(upward.placeAbove).toBe(true)
    expect(typeof upward.bottom).toBe('number')
  })

  it('CLS-6 & CLS-7: enforces bundle purity, cross-chunk locale, subagent guard, adoptedStyleSheets cleanup, and CSS invariants', () => {
    const clientJs = readFileSync(resolve(import.meta.dirname, '../lib/client.js'), 'utf8')
    const runtimeJs = readFileSync(resolve(import.meta.dirname, '../lib/client.runtime.js'), 'utf8')
    const echartsJs = readFileSync(resolve(import.meta.dirname, '../lib/client.echarts.js'), 'utf8')
    expect(Buffer.byteLength(clientJs, 'utf8')).toBeLessThan(100 * 1024)
    expect(runtimeJs).not.toContain('litServerRoot')
    expect(echartsJs).not.toContain('kanbanPriorityHigh')

    expect(isSubagentCall({ parentCallId: null as unknown as undefined })).toBe(false)
    expect(isSubagentCall({ parentCallId: '' })).toBe(false)
    expect(isSubagentCall({ parentCallId: 'parent-1' })).toBe(true)

    try {
      setUiLocaleOverride('en')
      expect(resolveClientLocale()).toBe('en')
      expect(
        (globalThis as { __dshA2uiI18n__?: { override: string | null } }).__dshA2uiI18n__?.override,
      ).toBe('en')
    } finally {
      setUiLocaleOverride(null)
    }

    const prevDoc = globalThis.document
    const prevCss = (globalThis as { CSSStyleSheet?: unknown }).CSSStyleSheet
    try {
      class FakeSheet {
        replaceSync() {}
      }
      const fakeDoc = {
        adoptedStyleSheets: [] as unknown[],
        getElementById: () => null,
      }
      ;(globalThis as { CSSStyleSheet?: unknown }).CSSStyleSheet = FakeSheet
      ;(globalThis as { document?: unknown }).document = fakeDoc
      ensureA2uiRuntimeStyles()
      expect(fakeDoc.adoptedStyleSheets.length).toBeGreaterThan(0)
      cleanupA2uiRuntimeStyles()
      expect(fakeDoc.adoptedStyleSheets.length).toBe(0)
    } finally {
      ;(globalThis as { document?: unknown }).document = prevDoc
      ;(globalThis as { CSSStyleSheet?: unknown }).CSSStyleSheet = prevCss
    }

    const catalogCss = readFileSync(
      resolve(import.meta.dirname, '../src/client/catalog/Catalog.module.css'),
      'utf8',
    )
    expect(catalogCss).toContain('.selectSearchRow > *')
    expect(catalogCss).toContain('contain: layout paint')
    expect(catalogCss).toContain('--a2ui-z-popover')
    expect(catalogCss).toContain('--a2ui-z-fullscreen')
    const chartActionsBaseIdx = catalogCss.indexOf('.chartActions {')
    const chartActionsContainerIdx = catalogCss.lastIndexOf('.chartActions {')
    expect(chartActionsContainerIdx).toBeGreaterThan(chartActionsBaseIdx)
    const kvCellBaseIdx = catalogCss.indexOf('.kvCell {')
    const kvCellContainerIdx = catalogCss.lastIndexOf('.kvCell {')
    expect(kvCellContainerIdx).toBeGreaterThan(kvCellBaseIdx)
  })

  it('CLS-8: renders all 64 catalog components and all 7 Slot Views without throwing', () => {
    expect(DSH_REACT_COMPONENTS).toHaveLength(64)
    const buildChild = (id: string) => createElement('span', { key: id }, id)

    for (const comp of DSH_REACT_COMPONENTS) {
      const renderFn = (comp as unknown as { rawRender: (arg: Record<string, unknown>) => unknown })
        .rawRender
      expect(typeof renderFn, `${comp.name} must expose rawRender`).toBe('function')
      const htmlEmpty = renderToStaticMarkup(
        createElement(renderFn as never, {
          props: {},
          buildChild,
          context: {},
        }),
      )
      expect(typeof htmlEmpty).toBe('string')
    }

    expect(
      renderToStaticMarkup(
        createElement(A2uiActionUserChip, {
          node: {
            id: 'a2ui-action',
            start: 0,
            end: 2,
            data: {
              surfaceId: 's1',
              actionName: 'confirm',
              componentId: 'btn1',
              userMessage: 'OK',
              summaryLabel: 'OK',
              paramsText: null,
              dataModelText: null,
            },
          },
          raw: 'OK',
        }),
      ),
    ).toContain('OK')
    expect(
      renderToStaticMarkup(
        createElement(A2uiToolView, {
          callId: 'c1',
          toolName: 'a2ui_render',
          phase: 'result',
          block: { callId: 'c1', name: 'a2ui_render', isError: false } as never,
        }),
      ),
    ).toBeTypeOf('string')
    expect(
      renderToStaticMarkup(createElement(A2uiTurnTailView, { seq: 1, turn: { turn: 1 } as never })),
    ).toBeTypeOf('string')
    expect(renderToStaticMarkup(createElement(A2uiDockView, {}))).toBe('')
    expect(renderToStaticMarkup(createElement(A2uiAskDockView, {}))).toBe('')
    expect(
      renderToStaticMarkup(
        createElement(A2uiAskToolView, {
          callId: 'a1',
          toolName: 'a2ui_ask',
          phase: 'result',
          block: {
            callId: 'a1',
            name: 'a2ui_ask',
            isError: false,
            args: {
              text: (k: string) =>
                k === 'title'
                  ? 'Auth'
                  : k === 'ui'
                    ? 'surface("ask1")\nroot = Card(Text("hi"))'
                    : '',
            },
          } as never,
        }),
      ),
    ).toContain('data-tool="a2ui_ask"')
    expect(ErrorBoundary.getDerivedStateFromError('non-error throw').error?.message).toBe(
      'non-error throw',
    )
    expect(renderToStaticMarkup(createElement(A2uiTierControl, {}))).toContain('A2UI')
  })
})
