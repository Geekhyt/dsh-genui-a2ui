import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { describe, expect, it } from 'vitest'
import {
  computeEq,
  evaluateNumericValue,
  SumImplementation,
} from '../src/client/catalog/functions.ts'
import { computeMetricRingGeometry } from '../src/client/catalog/v3-helpers.ts'
import {
  computeTableNumericSummary,
  normalizeApiParamsAndHeaders,
  normalizeScheduleItems,
} from '../src/client/catalog/v4-helpers.ts'
import {
  computeDateRangeSpanDays,
  normalizeHierarchyTree,
} from '../src/client/catalog/v5-helpers.ts'
import { clampRangeSliderBounds } from '../src/client/catalog/v6-helpers.ts'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { scopeMermaidStyleRules } from '../src/client/chunks/mermaid-chunk.ts'
import { parseFileTarget, resolveSessionPath } from '../src/client/file-opener.tsx'
import { isSafeStaticSvgImage } from '../src/client/mermaid-safe.ts'
import {
  countSurfaceDrafts,
  loadSurfaceDraft,
  removeSurfaceDraftsBySurface,
  resetPersistenceForTests,
  sanitizeDataModel,
  saveSurfaceDraft,
} from '../src/client/persistence.ts'
import { StreamingExpressSession } from '../src/client/runtime/streaming.ts'
import {
  A2UI_SURFACE_NODE_KIND,
  collectDeletedSurfaceIds,
  resolveDockBatch,
} from '../src/client/shell/turn-surfaces.ts'
import {
  collectObscuredContextPointersFromMessages,
  createAskTool,
  PendingAskRegistry,
  sanitizePayloadObject,
} from '../src/host/ask-tool.ts'
import { gradeToolAttempt } from '../src/host/eval-suite.ts'
import { SurfaceSessions } from '../src/host/generator.ts'
import { CHART_KINDS, type ChartKind } from '../src/shared/catalog-schema.ts'
import { isSecretKey } from '../src/shared/constants.ts'
import {
  assertSafeExpressProgram,
  desugarExpressConcat,
  estimateExpressExpansionSize,
  findDangerousExpressPointer,
  flattenChainedCalc,
  foldNestedCondToLookup,
} from '../src/shared/express-preprocess.ts'
import { setUiLocaleOverride } from '../src/shared/i18n.ts'
import {
  buildTemplatePathMap,
  normalizePointerPath,
  referencesObscuredPointer,
  resolveTemplateObscuredPointers,
} from '../src/shared/redaction.ts'
import {
  formatNativeTemporalValue,
  parseLocalDateAnchor,
  tryParseLocalDate,
} from '../src/shared/temporal.ts'

echarts.use([SVGRenderer])

function renderSvgAtWidth(option: echarts.EChartsCoreOption, width: number, height = 260): string {
  const inst = echarts.init(null, null, { renderer: 'svg', ssr: true, width, height })
  try {
    inst.setOption({ animation: false, ...option })
    return inst.renderToSVGString()
  } finally {
    inst.dispose()
  }
}

describe('Comprehensive Repo Audit v0.5.4 — Security, Redaction & Express Hardening', () => {
  it('blocks Express prototype-pollution pointers, literal keys, and RFC 6901 escapes on both host and client', () => {
    const attacks = [
      'root = Text("hi")\n$/__proto__/polluted = true',
      'root = Text("hi")\n$/a/constructor/prototype/x = 1',
      'root = Text("hi")\n$/a/__proto__/b = 1',
      'root = Text("hi")\n$/cfg = { "__proto__": { "admin": true } }',
      'root = Text("hi")\n$/cfg = { __proto__: { admin: true } }',
    ]
    const sessions = new SurfaceSessions()
    for (const ui of attacks) {
      expect(findDangerousExpressPointer(ui)).not.toBeNull()
      expect(() => assertSafeExpressProgram(ui)).toThrow(/forbidden/i)
      expect(() => sessions.compile('proto-sec', ui)).toThrow(/forbidden/i)

      const stream = new StreamingExpressSession()
      const snap = stream.advance(ui, true)
      expect(snap.error).toMatch(/forbidden/i)
      expect(snap.messages).toEqual([])
    }
    const benignPrograms = [
      'root = Text("hi")\n$/item = { prototype: "V1", status: "ready" }',
      'root = Text("hi")\n$/item = { "constructor": "UserService", "prototype": "alpha" }',
      'root = Text(calc("a > 0 ? 1 : 0", { a: $/n }))\n$/n = 1',
    ]
    for (const ui of benignPrograms) {
      expect(findDangerousExpressPointer(ui)).toBeNull()
      expect(() => assertSafeExpressProgram(ui)).not.toThrow()
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(({} as Record<string, unknown>).admin).toBeUndefined()
  })

  it('blocks exponential local-variable expansion bombs in both host compiler and client streaming', () => {
    const bomb = [
      'a = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"',
      'b = [a, a, a, a, a, a, a, a]',
      'c = [b, b, b, b, b, b, b, b]',
      'd = [c, c, c, c, c, c, c, c]',
      'e = [d, d, d, d, d, d, d, d]',
      'f = [e, e, e, e]',
      'root = JsonTree(f)',
    ].join('\n')
    expect(estimateExpressExpansionSize(bomb, 1024_000)).toBeGreaterThan(1024_000)

    const sessions = new SurfaceSessions()
    expect(() => sessions.compile('bomb-host', bomb)).toThrow(/exceeds limit/i)

    const stream = new StreamingExpressSession()
    const snap = stream.advance(bomb, true)
    expect(snap.error).toMatch(/exceeds limit/i)
  })

  it('runs foldNestedCondToLookup, flattenChainedCalc, isSecretKey, and normalizePointerPath in linear time', () => {
    const t0 = performance.now()
    const badCond = `${'cond(a,'.repeat(250)} "x"`
    expect(typeof foldNestedCondToLookup(badCond)).toBe('string')
    const deepCalc = `${'calc("'.repeat(60)}1${'")'.repeat(60)}`
    expect(typeof flattenChainedCalc(deepCalc)).toBe('string')
    expect(normalizePointerPath(`/${'a/'.repeat(500)}${'/'.repeat(5000)}`)).toBe(
      `/${'a/'.repeat(499)}a`,
    )
    expect(isSecretKey(`${'a'.repeat(5000)}${'9'.repeat(5000)}`)).toBe(false)
    expect(performance.now() - t0).toBeLessThan(250)
  })

  it('preserves scientific notation in desugarExpressConcat', () => {
    const src = 'root = Text(1e+5 + " items")'
    const out = desugarExpressConcat(src)
    expect(out).toContain('1e+5')
    expect(out).not.toContain('concat(1e, 5')
  })

  it('detects expanded English and CJK secret keys without false positives on benign metrics', () => {
    const secrets = [
      'cvc',
      'passkey',
      'secretkey',
      'secrettoken',
      'passwordvalue',
      'token_input',
      'github_tokens',
      'api_user_key',
      'deepseek_key',
      '数据库密码',
      '访问密钥',
      '秘钥',
      '登录口令',
      '用户凭证',
      '授权码',
    ]
    for (const key of secrets) {
      expect(isSecretKey(key), `${key} must be secret`).toBe(true)
    }
    for (const benign of [
      'tokens_per_sec',
      'promptTokens',
      'deepseek_tokens',
      'openai_tokens',
      'anthropic_tokens',
      'user_tokens',
      'service_tokens',
      'app_tokens',
      'secretary',
      'secretarial',
      'cookiejar',
      '凭证号',
      '报销凭证',
      '会计凭证',
      '付款凭证',
      'keyMetrics',
      'primaryKey',
      'cacheHit',
    ]) {
      expect(isSecretKey(benign), `${benign} must be benign`).toBe(false)
    }
  })

  it('always scrubs embedded secrets in sanitizeDataModel even when obscured pointer set is empty', () => {
    const model = {
      api_user_key: 'sk-super-secret-value-1234',
      notes: 'do not leak sk-super-secret-value-1234 here',
      safe: 'public-ok',
    }
    const sanitized = sanitizeDataModel(model, new Set())
    expect(sanitized.api_user_key).toBeUndefined()
    expect(sanitized.notes).toBe('do not leak [REDACTED] here')
    expect(sanitized.safe).toBe('public-ok')
  })

  it('composes nested templates in redaction and scopes relative template references accurately', () => {
    const components = [
      { id: 'outer', component: 'List', children: { componentId: 'inner', path: '/groups' } },
      { id: 'inner', component: 'List', children: { componentId: 'item', path: 'creds' } },
      {
        id: 'item',
        component: 'TextField',
        variant: 'obscured',
        value: { '@path': 'passkey' },
      },
    ]
    const map = buildTemplatePathMap(components)
    expect(map.get('item')?.has('/groups/*/creds')).toBe(true)
    const obscured = new Set<string>()
    resolveTemplateObscuredPointers(components, obscured)
    expect(obscured.has('/groups/*/creds/*/passkey')).toBe(true)
    expect(
      referencesObscuredPointer({ '@path': 'passkey' }, obscured, 0, new Set(['/groups/*/creds'])),
    ).toBe(true)
    expect(
      referencesObscuredPointer({ '@path': 'other' }, obscured, 0, new Set(['/groups/*/creds'])),
    ).toBe(false)
  })

  it('scrubs secrets before 32k truncation in sanitizePayloadObject and preserves Turn-1 component obscured context', () => {
    const huge = `${'x'.repeat(35000)} SUPER_SECRET_TOKEN_XYZ`
    const res = sanitizePayloadObject(
      { password: 'SUPER_SECRET_TOKEN_XYZ', summary: huge },
      new Set(['/password']),
    )
    expect(res.password).toBeUndefined()
    expect(String(res.summary)).not.toContain('SUPER_SECRET_TOKEN_XYZ')

    const priorMsgs = [
      {
        updateComponents: {
          surfaceId: 's1',
          components: [
            {
              id: 'btn',
              component: 'Button',
              action: { event: { name: 'submit', context: { secret: { '@path': '/api_key' } } } },
            },
          ],
        },
      },
    ]
    const obscuredCtx = collectObscuredContextPointersFromMessages(
      priorMsgs as never,
      new Set(['/api_key']),
      undefined,
    )
    expect(obscuredCtx.has('/secret')).toBe(true)
  })

  it('hardens static SVG and Mermaid CSS sanitization against XXE, inline style, SMIL, sibling selectors, and fixed overlays', () => {
    expect(
      isSafeStaticSvgImage(
        '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>',
      ),
    ).toBe(false)
    expect(isSafeStaticSvgImage('<svg><animateColor attributeName="fill"/></svg>')).toBe(false)
    expect(isSafeStaticSvgImage('<svg><rect style="fill:url(https://evil.test/x)"/></svg>')).toBe(
      false,
    )
    expect(
      isSafeStaticSvgImage(
        '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
      ),
    ).toBe(true)
    expect(
      isSafeStaticSvgImage(
        '<?xml-stylesheet type="text/xsl" href="https://evil.test/x.xsl"?><svg xmlns="http://www.w3.org/2000/svg"/>',
      ),
    ).toBe(false)
    expect(
      isSafeStaticSvgImage(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
      ),
    ).toBe(true)

    const scopedSvg = scopeMermaidStyleRules(
      '<svg id="m1" style="position:fixed;inset:0;z-index:9999" viewBox="0 0 100 100"><style>#m1 + .b { fill: red; } #m1 .x { position: fixed; z-index: 99999; background: -webkit-image-set(url(https://evil.test/a.png) 1x); } #m1 .ok { fill: #3b82f6; }</style><rect class="ok" width="10" height="10"/></svg>',
      'm1',
    )
    expect(scopedSvg).not.toContain('position:fixed')
    expect(scopedSvg).not.toContain('position: fixed')
    expect(scopedSvg).not.toContain('z-index')
    expect(scopedSvg).not.toContain('-webkit-image-set')
    expect(scopedSvg).not.toContain('#m1 + .b')
    expect(scopedSvg).toContain('fill: #3b82f6')
  })

  it('rejects partial percent-encoded path traversal and collapses duplicate slashes in resolveSessionPath', () => {
    expect(parseFileTarget('.%2e/etc/passwd')).toBeNull()
    expect(parseFileTarget('%2e./etc/passwd')).toBeNull()
    expect(parseFileTarget('%252e%252e/secret')).toBeNull()
    expect(parseFileTarget('foo%00bar.ts')).toBeNull()
    expect(resolveSessionPath('/workspace', 'src//client///index.ts')).toBe(
      '/workspace/src/client/index.ts',
    )
  })
})

describe('Comprehensive Repo Audit v0.5.4 — Concurrency, Lifecycle & Widget Correctness', () => {
  it('guards PendingAskRegistry after disposeAll, enforces pre-compile abort, and fails empty evals', async () => {
    const reg = new PendingAskRegistry()
    reg.disposeAll()
    await expect(
      reg.wait({
        sessionId: 'after-dispose',
        callId: 'c1',
        defaultSurfaceId: 's1',
        timeoutSeconds: 1,
      }),
    ).rejects.toThrow(/disposed/i)

    const sessions = new SurfaceSessions()
    const liveReg = new PendingAskRegistry()
    const askTool = createAskTool(sessions, liveReg)
    const ac = new AbortController()
    ac.abort()
    await expect(
      askTool.execute({ ui: 'root = Text("hi")', surfaceId: 'aborted-s' }, {
        sessionId: 'sess-abort',
        signal: ac.signal,
      } as never),
    ).rejects.toThrow(/abort/i)
    liveReg.disposeAll()

    const emptyGrade = gradeToolAttempt(sessions, 'eval-empty', 1, 'a2ui_render', '')
    expect(emptyGrade.compiledOk).toBe(false)
  })

  it('removes all fingerprint variants on removeSurfaceDraftsBySurface and ignores delete-only dock bumps', () => {
    resetPersistenceForTests()
    saveSurfaceDraft('sess-1', 'surf-a', 'fp-1', { step: 1 })
    saveSurfaceDraft('sess-1', 'surf-a', 'fp-2', { step: 2 })
    saveSurfaceDraft('sess-1', 'surf-b', 'fp-1', { keep: true })
    expect(countSurfaceDrafts()).toBe(3)
    removeSurfaceDraftsBySurface('sess-1', 'surf-a')
    expect(loadSurfaceDraft('sess-1', 'surf-a', 'fp-1')).toBeNull()
    expect(loadSurfaceDraft('sess-1', 'surf-a', 'fp-2')).toBeNull()
    expect(loadSurfaceDraft('sess-1', 'surf-b', 'fp-1')).toEqual({ keep: true })

    const snapshot = {
      nodes: new Map([
        [
          'n1',
          {
            id: 'n1',
            kind: A2UI_SURFACE_NODE_KIND,
            seq: 1,
            data: {
              callId: 'c1',
              seq: 1,
              placement: 'dock',
              messages: [{ createSurface: { surfaceId: 'dock-1' } }],
            },
          },
        ],
        [
          'n2',
          {
            id: 'n2',
            kind: A2UI_SURFACE_NODE_KIND,
            seq: 2,
            data: {
              callId: 'c2',
              seq: 2,
              placement: 'dock',
              messages: [{ deleteSurface: { surfaceId: 'dock-1' } }],
            },
          },
        ],
      ]),
    }
    expect(collectDeletedSurfaceIds(snapshot as never).has('dock-1')).toBe(true)
    expect(resolveDockBatch(snapshot as never)).toBeNull()
  })

  it('validates strict calendar dates, RangeSlider fractional steps, Tree durationMs aliases, Schedule overnight now, and functions.ts', () => {
    expect(tryParseLocalDate('2026-02-31')).toBeNull()
    expect(tryParseLocalDate('2026-04-31')).toBeNull()
    expect(tryParseLocalDate('2026-02-28')).not.toBeNull()
    expect(parseLocalDateAnchor('May 1, 2026').getFullYear()).toBe(2026)
    expect(parseLocalDateAnchor('2026/05/01').getMonth()).toBe(4)
    expect(computeDateRangeSpanDays('2026-02-31', '2026-03-02')).toBeNull()

    const catalogCss = readFileSync(
      resolve(process.cwd(), 'src/client/catalog/Catalog.module.css'),
      'utf8',
    )
    expect(catalogCss).toContain('justify-content: safe center;')
    const whereBlock = catalogCss.slice(0, catalogCss.indexOf('.row {'))
    expect(whereBlock).not.toContain('.row,')
    expect(whereBlock).not.toContain('.listHorizontal,')
    expect(formatNativeTemporalValue('2026-05-01', 'datetime-local', 'end')).toBe(
      '2026-05-01T23:59',
    )

    const slider = clampRangeSliderBounds({ min: 0, max: 1, start: 0.15, end: 0.85 })
    expect(slider.step).toBeLessThanOrEqual(0.1)
    expect(slider.start).toBeCloseTo(0.15, 2)
    expect(slider.end).toBeCloseTo(0.85, 2)

    const tree = normalizeHierarchyTree([
      {
        id: 'span-1',
        label: 'gateway.handle',
        durationMs: 184,
        children: [{ id: 's2', label: 'db.query', duration: '42ms' }],
      },
    ])
    expect(tree[0]?.metric).toBe('184ms')
    expect(tree[0]?.children[0]?.metric).toBe('42ms')

    const sched = normalizeScheduleItems(
      [{ title: 'Night job', start: '22:00', end: '02:00', status: 'active' }],
      undefined,
      '01:00',
    )
    expect(sched.nowPct).toBeDefined()
    expect(sched.nowPct!).toBeGreaterThan(50)
    expect(sched.nowPct!).toBeLessThan(90)

    const summary = computeTableNumericSummary(
      [{ key: 'rate' }],
      [{ rate: '-0.02%' }, { rate: '-0.04%' }],
      new Set(['rate']),
    )
    expect(summary.rate).toContain('-0.03%')

    const ring = computeMetricRingGeometry({ value: '99.95%', max: 100 })
    expect(ring.displayNumber).toBe('99.95')

    const api = normalizeApiParamsAndHeaders([], [{ name: 'X-Req', example: 'abc-123' }])
    expect(api[0]?.type).toBe('abc-123')

    expect(computeEq('01', '1')).toBe(false)
    expect(computeEq(1, 1)).toBe(true)
    expect(evaluateNumericValue('42.5', 0, 100).valid).toBe(true)

    const filteredSum = SumImplementation.execute(
      {
        items: [
          { svc: 'gateway-hz', qps: '$1,200' },
          { svc: 'billing', qps: '$200' },
        ],
        field: 'qps',
        filterField: 'svc',
        filterValue: ['gateway'],
      },
      {} as never,
    )
    expect(filteredSum).toBe(1200)
  })
})

describe('Comprehensive Repo Audit v0.5.4 — All 26 ECharts Kinds Adversarial Fuzz & Dark-Mode SVG Gate', () => {
  const sampleForKind = (kind: ChartKind): Record<string, unknown> => {
    switch (kind) {
      case 'bar':
      case 'line':
      case 'area':
        return {
          kind,
          xField: 'day',
          yField: ['DeepSeek-R1-0528', 'DeepSeek-V3-0324'],
          data: [
            { day: 'Mon', 'DeepSeek-R1-0528': 120, 'DeepSeek-V3-0324': 95 },
            { day: 'Tue', 'DeepSeek-R1-0528': 180, 'DeepSeek-V3-0324': 140 },
          ],
          zoom: true,
        }
      case 'pie':
      case 'funnel':
      case 'rose':
      case 'radialBar':
        return {
          kind,
          xField: 'stage',
          yField: 'value',
          data: [
            { stage: 'Stage Alpha', value: 100 },
            { stage: 'Stage Beta', value: 72 },
            { stage: 'Stage Gamma', value: 45 },
          ],
        }
      case 'scatter':
        return {
          kind,
          xField: 'latency',
          yField: 'qps',
          sizeField: 'errors',
          data: [
            { name: 'Node-A', latency: 12, qps: 450, errors: 2 },
            { name: 'Node-B', latency: 28, qps: 310, errors: 9 },
          ],
          zoom: true,
        }
      case 'radar':
        return {
          kind,
          xField: 'dim',
          yField: ['R1', 'V3'],
          data: [
            { dim: 'Reasoning', R1: -10, V3: -20 },
            { dim: 'Latency', R1: -5, V3: -15 },
            { dim: 'Safety', R1: -2, V3: -8 },
          ],
        }
      case 'gauge':
        return { kind, data: [{ name: 'SLA', value: 99.4, max: 100 }] }
      case 'heatmap':
        return {
          kind,
          xField: 'hour',
          yField: 'day',
          sizeField: 'val',
          data: [
            { hour: '00:00', day: 'Mon', val: 12 },
            { hour: '12:00', day: 'Mon', val: 248 },
            { hour: '00:00', day: 'Tue', val: 88 },
          ],
        }
      case 'treemap':
      case 'sunburst':
        return {
          kind,
          data: [
            {
              name: '评测沙箱',
              children: [
                { name: 'Unit', value: 40 },
                { name: 'E2E', value: 60 },
              ],
            },
            { name: 'Runtime', value: 55 },
          ],
        }
      case 'sankey':
        return {
          kind,
          data: {
            nodes: [
              { id: 'n1', name: 'Traffic Entry' },
              { id: 'n2', name: 'Middle Router Node' },
              { id: 'n3', name: 'Terminal Sink' },
            ],
            links: [
              { source: 'n1', target: 'n2', value: 100 },
              { source: 'n2', target: 'n3', value: 85 },
            ],
          },
        }
      case 'graph':
        return {
          kind,
          data: {
            nodes: [
              { id: 'a', name: 'Gateway' },
              { id: 'b', name: 'Auth' },
              { id: 'c', name: 'DB' },
            ],
            links: [
              { source: 'a', target: 'b' },
              { source: 'b', target: 'c' },
            ],
          },
        }
      case 'candlestick':
        return {
          kind,
          xField: 'date',
          data: [
            { date: '2026-05-01', open: 100, close: 112, low: 96, high: 115 },
            { date: '2026-05-02', open: 112, close: 105, low: 102, high: 118 },
          ],
          zoom: true,
        }
      case 'boxplot':
        return {
          kind,
          xField: 'group',
          data: [
            { group: 'P95-A', values: [10, 20, 30, 40, 50] },
            { group: 'P95-B', values: [15, 25, 35, 45, 60] },
          ],
          zoom: true,
        }
      case 'waterfall':
        return {
          kind,
          xField: 'step',
          yField: 'delta',
          data: [
            { step: 'Start', delta: 100, total: true },
            { step: 'Gain', delta: 40 },
            { step: 'Drop', delta: -15 },
            { step: 'End', delta: 125, total: true },
          ],
        }
      case 'combo':
        return {
          kind,
          xField: 'month',
          yField: 'revenue',
          y2Field: 'margin',
          data: [
            { month: 'Jan', revenue: 120, margin: 0.24 },
            { month: 'Feb', revenue: 150, margin: null },
            { month: 'Mar', revenue: 180, margin: 0.31 },
          ],
        }
      case 'parallel':
        return {
          kind,
          xField: 'model',
          yField: ['Score', 'Latency', 'Cost', 'PassRate'],
          data: [
            { model: 'DeepSeek-R1-0528', Score: 92, Latency: 420, Cost: 2.1, PassRate: 98 },
            { model: 'DeepSeek-V3-0324', Score: 88, Latency: 210, Cost: 0.9, PassRate: 95 },
          ],
        }
      case 'calendar':
        return {
          kind,
          xField: 'date',
          yField: 'count',
          data: [
            { date: '2026-01-05', count: 0 },
            { date: '2026-01-12', count: 14 },
            { date: '2026-01-19', count: 32 },
          ],
        }
      case 'range':
        return {
          kind,
          xField: 't',
          data: [
            { t: '10:00', low: 10, mid: 18, high: 26 },
            { t: '11:00', low: 12, mid: 21, high: 30 },
          ],
        }
      case 'bullet':
        return {
          kind,
          xField: 'metric',
          data: [
            { metric: 'Availability', value: 99.2, target: 99.5, max: 100 },
            { metric: 'Throughput', value: 84, target: 90, max: 100 },
          ],
        }
      case 'histogram':
        return {
          kind,
          yField: 'latency',
          data: [
            { latency: 0.0012 },
            { latency: 0.0024 },
            { latency: 0.0036 },
            { latency: 0.0049 },
          ],
        }
      case 'dumbbell':
        return {
          kind,
          xField: 'svc',
          yField: ['before', 'after'],
          data: [
            { svc: 'gateway', before: 120, after: 120 },
            { svc: 'worker', before: 240, after: 110 },
          ],
          selected: 'worker',
        }
      case 'chord':
        return {
          kind,
          data: {
            nodes: [
              { id: 'c1', name: 'API' },
              { id: 'c2', name: 'Worker' },
              { id: 'c3', name: 'Store' },
            ],
            links: [
              { source: 'c1', target: 'c2', value: 50 },
              { source: 'c1', target: 'c2', value: 25 },
              { source: 'c2', target: 'c3', value: 60 },
              { source: 'c1', target: 'c1', value: 10 },
            ],
          },
        }
    }
  }

  it('builds and SSR-renders all 26 CHART_KINDS across widths {240, 276, 640} and both themes without throws or Dark-Mode color leaks', () => {
    expect(CHART_KINDS).toHaveLength(26)
    for (const kind of CHART_KINDS) {
      const sample = sampleForKind(kind)
      for (const dark of [true, false]) {
        for (const width of [240, 276, 640]) {
          const opt = buildChartOption(sample as never, dark, width)
          const svg = renderSvgAtWidth(opt, width)
          expect(svg, `${kind} dark=${dark} w=${width}`).toContain('<svg')
          if (dark) {
            if (kind === 'radar') {
              expect(svg).not.toContain('stroke="#cfd2d7"')
            }
            if (kind === 'scatter') {
              expect(svg).not.toContain('stroke="#54555a"')
            }
            if (kind === 'funnel') {
              expect(svg).not.toContain('stroke="#fff"')
              expect(svg).not.toContain('stroke="#ffffff"')
            }
          }
        }
      }
    }
  })

  it('fixes dumbbell equal before/after TDZ crash, cross-filter connector dimming, tooltips, and opaque dark calendar visualMap', () => {
    const dbOpt = buildChartOption(
      {
        kind: 'dumbbell',
        xField: 'svc',
        yField: ['before', 'after'],
        data: [
          { svc: 'gateway', before: 100, after: 100 },
          { svc: 'search', before: 220, after: 90 },
        ],
        selected: 'search',
      },
      true,
      276,
    ) as { series: Array<{ stack?: string; data: Array<{ itemStyle?: { opacity?: number } }> }> }
    const linkSeries = dbOpt.series.filter((s) => s.stack === 'dumbbellLink')[1]
    expect(linkSeries).toBeDefined()
    expect(linkSeries?.data[0]?.itemStyle?.opacity).toBeLessThan(0.5)

    const scatterOpt = buildChartOption(sampleForKind('scatter') as never, true, 640) as {
      tooltip: { formatter: (p: unknown) => string }
    }
    expect(
      scatterOpt.tooltip.formatter({ name: 'Node-A', seriesName: 'qps', value: [12, 450, 2] }),
    ).toContain('errors: 2')

    const parallelOpt = buildChartOption(sampleForKind('parallel') as never, true, 640) as {
      tooltip: { formatter: (p: unknown) => string }
    }
    const pTip = parallelOpt.tooltip.formatter({
      seriesName: 'DeepSeek-R1-0528',
      value: [92, 420, 2.1, 98],
    })
    expect(pTip).toContain('Score: 92')
    expect(pTip).toContain('PassRate: 98')

    const calDark = buildChartOption(sampleForKind('calendar') as never, true, 276) as {
      visualMap: { inRange: { color: string[] } }
    }
    expect(calDark.visualMap.inRange.color[0]).toBe('#23272f')

    try {
      setUiLocaleOverride('en')
      const boxEn = buildChartOption(sampleForKind('boxplot') as never, true, 276) as {
        tooltip: { formatter: (p: unknown) => string }
      }
      expect(boxEn.tooltip.formatter({ name: 'G', value: [0, 10, 20, 30, 40, 50] })).toContain(
        'Median: 30',
      )
    } finally {
      setUiLocaleOverride(null)
    }
  })
})
