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

import { computeArrayAvg, extractNumericValues } from '../src/client/catalog/functions.ts'
import { DshSegmentedView } from '../src/client/catalog/InputWidgets.tsx'
import { normalizeKeyValueItems } from '../src/client/catalog/p0-helpers.ts'
import { buildServiceGraphLayout } from '../src/client/catalog/v3-helpers.ts'
import { buildEndpointCurl, formatTableToCsv } from '../src/client/catalog/v4-helpers.ts'
import { buildDatePresetRange } from '../src/client/catalog/v5-helpers.ts'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { parseFileTarget } from '../src/client/file-opener.tsx'
import { assertSafeSvg } from '../src/client/mermaid-safe.ts'
import {
  DOCK_STORAGE_KEY,
  ENABLED_STORAGE_KEY,
  MAX_DRAFT_ENTRIES,
  resetPersistenceForTests,
  sanitizeDataModel,
  setA2uiEnabled,
  setDockCollapsed,
} from '../src/client/persistence.ts'
import { readSanitizedDataModels, SurfaceSessionStore } from '../src/client/SurfaceView.tsx'
import { StreamingExpressSession } from '../src/client/streaming.ts'
import { PendingAskRegistry, sanitizePayloadObject } from '../src/host/ask-tool.ts'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { apply } from '../src/index.ts'
import { validateCalcExpression } from '../src/shared/calc-engine.ts'
import { flattenChainedCalc, foldNestedCondToLookup } from '../src/shared/express-preprocess.ts'

describe('Full Repo Audit & Visual QA Regression Suite (v0.4.1)', () => {
  it('H-1 & V-1: DshSegmentedView renders safely with empty options and uses wrapping pill grid for wide 4-item sets', () => {
    const emptyHtml = renderToStaticMarkup(
      createElement(DshSegmentedView, { props: { label: 'Mode', options: [] } }),
    )
    expect(emptyHtml).toBe('')

    const wideHtml = renderToStaticMarkup(
      createElement(DshSegmentedView, {
        props: {
          label: '半宽 4 项长标题分段器',
          value: 'hybrid',
          options: [
            { value: 'v3', label: 'DeepSeek-V3 主力' },
            { value: 'r1', label: 'DeepSeek-R1 深度' },
            { value: 'hybrid', label: '混合智能路由' },
            { value: 'fallback', label: '降级容灾模式' },
          ],
        },
      }),
    )
    expect(wideHtml).toContain('role="radiogroup"')
    expect(wideHtml).toContain('aria-checked="true"')
    expect(wideHtml).toContain('混合智能路由')
  })

  it('H-2: SurfaceSessions.compile rolls back RendererState cleanly via transaction on post-parse validation failure', () => {
    const sessions = new SurfaceSessions(createGenerator(), true)
    // Turn 1: create initial surface so RendererState exists for this session
    const first = sessions.compile('sess-rollback', 'surface("base")\nroot = Text("ok")')
    expect(first.length).toBeGreaterThan(0)

    // Turn 2 (attempt 1): parses validly into RendererState, then fails validateCompiledLimits (unbound calc var)
    const badUi = [
      'surface("new_calc")',
      '$/a = 10',
      'root = Text(calc("a + missingVar", { a: $/a }))',
    ].join('\n')
    expect(() => sessions.compile('sess-rollback', badUi)).toThrow(/missingVar|Unbound/i)

    // Turn 2 (self-repair retry): reusing surface("new_calc") must succeed instead of "already exists"
    const fixedUi = [
      'surface("new_calc")',
      '$/a = 10',
      '$/b = 5',
      'root = Text(calc("a + b", { a: $/a, b: $/b }))',
    ].join('\n')
    const repaired = sessions.compile('sess-rollback', fixedUi)
    expect(repaired.length).toBeGreaterThan(0)
  })

  it('H-3: readSanitizedDataModels scopes serialization to visibleSurfaceIds', () => {
    const sessions = new SurfaceSessions(createGenerator(), true)
    const msg1 = sessions.compile(
      'sess-scope',
      'surface("old_big")\n$/rows = [1, 2, 3]\nroot = Text("old")',
    )
    const msg2 = sessions.compile(
      'sess-scope',
      'surface("ask_card")\n$/confirm = true\nroot = Text("ask")',
    )

    const store = new SurfaceSessionStore()
    store.reconcile([...msg1, ...msg2], {
      streaming: false,
      readOnly: false,
      sessionId: 'sess-scope',
      fingerprint: 'fp1',
      visibleSurfaceIds: new Set(['ask_card']),
      onAction: undefined,
    })

    const scoped = readSanitizedDataModels(store.processor, new Set(['ask_card']))
    expect(Object.keys(scoped)).toEqual(['ask_card'])
    expect(scoped.old_big).toBeUndefined()
  })

  it('H-4: rejects /a2ui-answer null, rejects superseded PendingAskRegistry promises, and disposes on cleanup', async () => {
    const reg = new PendingAskRegistry()
    const firstPromise = reg.wait({
      sessionId: 's1',
      callId: 'c1',
      defaultSurfaceId: 'surf1',
      timeoutSeconds: 30,
    })
    const secondPromise = reg.wait({
      sessionId: 's1',
      callId: 'c1',
      defaultSurfaceId: 'surf1',
      timeoutSeconds: 30,
    })
    await expect(firstPromise).rejects.toThrow(/superseded/i)
    reg.disposeAll()
    await expect(secondPromise).rejects.toThrow(/disposed/i)

    // Verify /a2ui-answer null returns structured error instead of throwing TypeError
    let answerHandler: ((args: { agent: unknown; rawInput: string }) => unknown) | undefined
    const fakeCtx = {
      inject: (deps: string[], fn: (c: unknown) => void) => {
        if (deps.includes('commands')) {
          fn({
            commands: {
              register: (def: { name: string; handler: typeof answerHandler }) => {
                if (def.name === 'a2ui-answer') answerHandler = def.handler
                return () => {}
              },
            },
            effect: (cb: () => unknown) => cb(),
          })
        }
      },
      effect: (cb: () => unknown) => cb(),
      on: () => {},
    }
    apply(fakeCtx as never, {})
    expect(answerHandler).toBeDefined()
    const resNull = answerHandler!({ agent: { sessionId: 's1' }, rawInput: 'null' }) as {
      kind: string
    }
    expect(resNull.kind).toBe('error')
    const resArr = answerHandler!({ agent: { sessionId: 's1' }, rawInput: '[]' }) as {
      kind: string
    }
    expect(resArr.kind).toBe('error')
  })

  it('M-1, V-2, V-3, V-4, V-7 & L-4: ECharts richText tooltips, waterfall pill avoidance, compact graph labels, treemap wrap, and duplicate xField alignment', () => {
    // Waterfall: plain newline tooltip (no <br/>) + Bar 3 (+110) avoids 目标 ¥680w pill
    const wfOpt = buildChartOption(
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
      tooltip: { formatter: (p: unknown) => string }
      series: Array<{ data: Array<unknown> }>
    }
    const wfTip = wfOpt.tooltip.formatter([{ name: '缓存降本', seriesName: '增长', value: 65 }])
    expect(wfTip).not.toContain('<br')
    expect(wfTip).toContain('\n')
    // Bar 2 (+165) stays inside; Bar 3 (+110) moves to bottom so it never overlaps 目标 ¥680w
    expect(wfOpt.series[2]?.data[1]).toMatchObject({ value: 165, label: { position: 'inside' } })
    expect(wfOpt.series[2]?.data[2]).toMatchObject({ value: 110, label: { position: 'bottom' } })

    // Calendar: plain text tooltip (no <strong>)
    const calOpt = buildChartOption(
      {
        kind: 'calendar',
        data: [{ date: '2026-10-29', count: 26 }],
        xField: 'date',
        yField: 'count',
      },
      true,
      580,
    ) as { tooltip: { formatter: (p: unknown) => string } }
    const calTip = calOpt.tooltip.formatter({ value: ['2026-10-29', 26] })
    expect(calTip).toBe('2026-10-29: 26')
    expect(calTip).not.toContain('<strong')

    // Compact Graph: never hides node labels via labelLayout.hideOverlap
    const graphOpt = buildChartOption(
      {
        kind: 'graph',
        data: {
          nodes: [
            { id: 'gw', name: 'Edge Gateway', group: '入口' },
            { id: 'cache', name: 'Prompt Cache', group: '存储' },
          ],
          links: [{ source: 'gw', target: 'cache', label: 'hit 76%' }],
        },
      },
      true,
      271,
    ) as { series: Array<{ labelLayout?: unknown }> }
    expect(graphOpt.series[0]?.labelLayout).toBeUndefined()

    // Compact Treemap: breaks on whitespace rather than mid-word ASCII
    const treeOpt = buildChartOption(
      {
        kind: 'treemap',
        data: [{ name: 'A2UI 渲染 16w', value: 16 }],
        xField: 'name',
        yField: 'value',
      },
      true,
      271,
    ) as {
      series: Array<{ label: { overflow: string; formatter: (p: { name: string }) => string } }>
    }
    expect(treeOpt.series[0]?.label.overflow).toBe('truncate')
    expect(treeOpt.series[0]?.label.formatter({ name: 'A2UI 渲染 16w' })).toBe('A2UI\n渲染\n16w')

    // Duplicate xField rows align length strictly to unique categories
    const dupBar = buildChartOption(
      {
        kind: 'bar',
        data: [
          { region: '华东', gmv: 100 },
          { region: '华东', gmv: 50 },
          { region: '华南', gmv: 80 },
        ],
        xField: 'region',
        yField: 'gmv',
      },
      true,
    ) as { xAxis: { data: string[] }; series: Array<{ data: number[] }> }
    expect(dupBar.xAxis.data).toEqual(['华东', '华南'])
    expect(dupBar.series[0]?.data).toEqual([150, 80])
  })

  it('M-2: assertSafeSvg permits technical text like "online = true" / "once = 1" while blocking inline event handlers', () => {
    expect(() =>
      assertSafeSvg(
        '<svg><text>status: online = true</text><foreignObject>once = 1</foreignObject></svg>',
      ),
    ).not.toThrow()
    expect(() => assertSafeSvg('<svg onload="alert(1)"></svg>')).toThrow(/sanitization/i)
    expect(() => assertSafeSvg('<svg><img/onerror=alert(1)></svg>')).toThrow(/sanitization/i)
  })

  it('M-3: sanitizers block prototype pollution and redact compound secret keys without false-positives on promptTokens', () => {
    const raw = JSON.parse(
      '{"__proto__":{"polluted":true},"userPassword":"x","db_password":"y","auth_token":"z","clientSecret":"s","bearerToken":"b","openaiApiKey":"k","promptTokens":1200,"region":"cn-hz"}',
    )
    const hostClean = sanitizePayloadObject(raw)
    expect((hostClean as { polluted?: unknown }).polluted).toBeUndefined()
    expect(Object.keys(hostClean).sort()).toEqual(['promptTokens', 'region'])

    const clientClean = sanitizeDataModel(raw)
    expect((clientClean as { polluted?: unknown }).polluted).toBeUndefined()
    expect(Object.keys(clientClean).sort()).toEqual(['promptTokens', 'region'])
  })

  it('M-4: buildDatePresetRange anchors date-only strings in local calendar time without UTC-negative drift', () => {
    const range = buildDatePresetRange(7, false, '2026-11-30')
    expect(range).toEqual({ start: '2026-11-24', end: '2026-11-30' })
  })

  it('M-6: extractNumericValues & computeArrayAvg ignore null, blank strings, and booleans', () => {
    const rows = [{ v: 10 }, { v: null }, { v: '' }, { v: true }, { v: false }, { v: 20 }]
    expect(extractNumericValues(rows, 'v')).toEqual([10, 20])
    expect(computeArrayAvg(rows, 'v')).toBe(15)
  })

  it('M-8 & L-1: supports KeyValue span=4, ApiEndpoint array headers in cURL, and CSV formula injection hardening', () => {
    const kv = normalizeKeyValueItems([{ label: 'Wide', value: 'ok', span: 4 }])
    expect(kv[0]?.span).toBe(4)

    const curl = buildEndpointCurl({
      method: 'POST',
      path: '/v1/limits',
      headers: [{ name: 'X-Tenant-Id', value: 't-01' }],
    })
    expect(curl).toContain('X-Tenant-Id: t-01')

    const csv = formatTableToCsv(
      [
        { key: 'formula', label: 'Formula' },
        { key: 'delta', label: 'Delta' },
      ],
      [
        { formula: '=CMD|"calc"!A0', delta: '+14.2%' },
        { formula: '@SUM(1,2)', delta: '-4.2%' },
      ],
    )
    expect(csv).toContain("'=CMD|")
    expect(csv).toContain("'@SUM(1,2)")
    expect(csv).toContain('+14.2%')
    expect(csv).toContain('-4.2%')
  })

  it('M-9 & L-5: express-preprocess deduplicates cond keys, bounds multi-occurrence calc expansion, supports streaming concat, and validates calc arity & file: scheme', () => {
    const folded = foldNestedCondToLookup(
      'cond(eq($/k, "a"), 1, cond(eq($/k, "a"), 2, cond(eq($/k, "b"), 3, 0)))',
    )
    expect(folded).toBe('lookup($/k, { "a": 1, "b": 3 }, 0)')

    // Multi-occurrence expansion guard stays bounded
    const heavy = [
      'a = calc("x + y + z + x * y + y * z + x * z + 100 + 200 + 300", { x: $/x, y: $/y, z: $/z })',
      'b = calc("a + a + a + a + a + a + a + a + a + a + a + a", { a: a })',
    ].join('\n')
    const flattened = flattenChainedCalc(heavy)
    expect(flattened.length).toBeLessThan(700)

    // StreamingExpressSession preprocesses `+` concat on completed lines
    const stream = new StreamingExpressSession()
    const snap = stream.advance(
      'surface("s")\n$/n = 42\nroot = Text(formatNumber($/n, 0) + " req/s")\n',
      true,
    )
    expect(snap.error).toBeNull()
    expect(snap.surfaceIds).toContain('s')

    // calc arity validation & file: scheme block
    expect(validateCalcExpression('pmt(0.01)')).toMatch(/expects 3 argument/i)
    expect(parseFileTarget('file:///etc/passwd')).toBeNull()
  })

  it('L-4 & V-6: localStorage session maps enforce LRU-200 cap and ServiceGraph gives 3-rank nodes room for full labels', () => {
    resetPersistenceForTests()
    for (let i = 0; i < MAX_DRAFT_ENTRIES + 25; i++) {
      setDockCollapsed(`sess-${i}`, true)
      setA2uiEnabled(`sess-${i}`, i % 2 === 0)
    }
    const dockRaw = (
      globalThis as { window?: { localStorage?: Storage } }
    ).window?.localStorage?.getItem(DOCK_STORAGE_KEY)
    if (dockRaw) {
      expect(
        Object.keys(JSON.parse(dockRaw) as Record<string, unknown>).length,
      ).toBeLessThanOrEqual(MAX_DRAFT_ENTRIES)
    }
    const enabledRaw = (
      globalThis as { window?: { localStorage?: Storage } }
    ).window?.localStorage?.getItem(ENABLED_STORAGE_KEY)
    if (enabledRaw) {
      const parsed = JSON.parse(enabledRaw) as { bySession: Record<string, unknown> }
      expect(Object.keys(parsed.bySession).length).toBeLessThanOrEqual(MAX_DRAFT_ENTRIES)
    }

    const layout = buildServiceGraphLayout(
      [
        { id: 'gw', label: 'API Gateway', metric: '2.4k RPS', status: 'healthy' },
        { id: 'chk', label: 'Checkout API', metric: 'P99 184ms', status: 'warning' },
        { id: 'fraud', label: 'Fraud Scorer · TiKV', metric: 'P99 142ms', status: 'error' },
      ],
      [
        { from: 'gw', to: 'chk', label: 'HTTP 200' },
        { from: 'chk', to: 'fraud', label: 'region #19 慢读' },
      ],
    )
    const fraudNode = layout.nodes.find((n) => n.id === 'fraud')
    const chkNode = layout.nodes.find((n) => n.id === 'chk')
    expect(chkNode?.width ?? 0).toBeGreaterThanOrEqual(116)
    expect(fraudNode?.width ?? 0).toBeGreaterThanOrEqual(160)
  })
})
