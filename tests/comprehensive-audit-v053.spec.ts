import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AgentToRendererMessage } from '@a2ui/agent'
import { describe, expect, it } from 'vitest'
import * as mockLlm from '../scripts/mock-llm.mjs'
import { DEFAULT_AUDIT_SHOWCASES } from '../scripts/visual-qa-bot.mjs'
import { CATALOG_ICON_NAMES } from '../src/client/catalog/icons.tsx'
import {
  makeUniqueIdFactory,
  normalizeComparisonData,
  normalizeLogEntries,
  normalizeSourceItems,
} from '../src/client/catalog/v3-helpers.ts'
import {
  formatChartDataToCsv,
  normalizeMatrixData,
  normalizeScheduleItems,
  normalizeTerminalCommands,
  tokenizeEndpointPath,
} from '../src/client/catalog/v4-helpers.ts'
import {
  buildDatePresetRange,
  computeDateRangeSpanDays,
  normalizeHierarchyTree,
} from '../src/client/catalog/v5-helpers.ts'
import { normalizeChecklistItems } from '../src/client/catalog/v6-helpers.ts'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { scopeMermaidStyleRules } from '../src/client/chunks/mermaid-chunk.ts'
import { assertSafeSvg, isSafeStaticSvgImage } from '../src/client/mermaid-safe.ts'
import {
  getA2uiEnabled,
  loadSurfaceDraft,
  resetPersistenceForTests,
  saveSurfaceDraft,
  setA2uiEnabled,
} from '../src/client/persistence.ts'
import {
  normalizeStreamingProgram,
  StreamingExpressSession,
} from '../src/client/runtime/streaming.ts'
import {
  A2UI_SURFACE_NODE_KIND,
  type ChatTargetSnapshot,
  resolveDockBatch,
  resolveTurnTailBatch,
} from '../src/client/shell/turn-surfaces.ts'
import {
  collectObscuredPointersFromMessages,
  PendingAskRegistry,
  sanitizePayloadObject,
} from '../src/host/ask-tool.ts'
import { classifyCompileError } from '../src/host/eval-suite.ts'
import { SurfaceSessions } from '../src/host/generator.ts'
import { CHART_KINDS, DSH_CATALOG_ID, dshSchemaCatalog } from '../src/shared/catalog-schema.ts'
import { isSecretKey } from '../src/shared/constants.ts'
import { preprocessExpressProgram } from '../src/shared/express-preprocess.ts'
import {
  collectSecretsFromNode,
  extractInterpolatedPointers,
  isPointerObscured,
  resolveTemplateObscuredPointers,
  scrubSecretString,
} from '../src/shared/redaction.ts'
import { formatNativeTemporalValue } from '../src/shared/temporal.ts'

function makeSnapshot(
  calls: readonly {
    readonly id: string
    readonly callId: string
    readonly seq: number
    readonly turnNumber?: number
    readonly placement: 'answer' | 'inline' | 'dock'
    readonly title?: string
    readonly messages: readonly AgentToRendererMessage[]
  }[],
): ChatTargetSnapshot {
  const map = new Map<
    string,
    {
      readonly kind: string
      readonly id: string
      readonly anchorSeq: number
      readonly location: { readonly turn: { readonly turn: number; readonly status: string } }
      readonly data: unknown
    }
  >()
  const order: string[] = []
  for (const c of calls) {
    order.push(c.id)
    const sids = new Set<string>()
    for (const m of c.messages) {
      for (const v of Object.values(m as unknown as Record<string, unknown>)) {
        if (typeof v === 'object' && v !== null && 'surfaceId' in v) {
          const sid = (v as { surfaceId?: unknown }).surfaceId
          if (typeof sid === 'string') sids.add(sid)
        }
      }
    }
    map.set(c.id, {
      id: c.id,
      kind: A2UI_SURFACE_NODE_KIND,
      anchorSeq: c.seq,
      location: { turn: { turn: c.turnNumber ?? 1, status: 'closed' } },
      data: {
        callId: c.callId,
        turn: c.turnNumber ?? 1,
        seq: c.seq,
        placement: c.placement,
        title: c.title ?? 'Panel',
        surfaceIds: [...sids],
        messages: c.messages,
      },
    })
  }
  return {
    order,
    nodes: map,
  }
}

describe('Comprehensive Repository Audit Regression Suite (v0.5.3)', () => {
  describe('1. Security, Redaction & Host Core', () => {
    it('detects plural tokens and algorithm/format-qualified secret keys', () => {
      expect(isSecretKey('auth_tokens1')).toBe(true)
      expect(isSecretKey('id_tokens')).toBe(true)
      expect(isSecretKey('SSH_RSA_KEY')).toBe(true)
      expect(isSecretKey('API_V2_KEY')).toBe(true)
      expect(isSecretKey('PRIVATE_PEM_KEY')).toBe(true)
      expect(isSecretKey('CLIENT_TLS_KEY')).toBe(true)
      expect(isSecretKey('primary_key_name')).toBe(false)
      expect(isSecretKey('region')).toBe(false)
    })

    it('parses nested/formatted interpolation pointers, template obscured fields, and container secrets', () => {
      const nestedExpr = '$' + '{$' + '{/code}}'
      const fnExpr = '$' + '{formatNumber(value:/auth/pin)}'
      const unclosedExpr = '$' + '{/unclosed'
      expect([...new Set(extractInterpolatedPointers(nestedExpr))]).toEqual(['/code'])
      expect(extractInterpolatedPointers(fnExpr)).toEqual(['/auth/pin'])
      expect(extractInterpolatedPointers(unclosedExpr)).toEqual(['/'])

      const templateComps: Record<string, unknown>[] = [
        {
          id: 'list1',
          component: 'List',
          children: { componentId: 't1', path: '/users' },
        },
        {
          id: 't1',
          component: 'TextField',
          variant: 'obscured',
          value: { path: '' },
        },
        {
          id: 'list2',
          component: 'List',
          children: { componentId: 't2', path: '/tokens' },
        },
        {
          id: 't2',
          component: 'TextField',
          variant: 'obscured',
          value: { path: 'token' },
        },
      ]
      const resolved = new Set<string>()
      resolveTemplateObscuredPointers(templateComps, resolved)
      expect(resolved.has('/users')).toBe(true)
      expect(resolved.has('/tokens/*/token')).toBe(true)
      expect(isPointerObscured('/tokens/0/token', resolved, false)).toBe(true)
      expect(isPointerObscured('/tokens/0/label', resolved, false)).toBe(false)

      const blockedExact = new Set<string>()
      const blockedSubstrings = new Set<string>()
      collectSecretsFromNode(
        {
          s1: {
            credentials: { primary: 'cred_nested_123456' },
            nested: { publicLabel: 'ok' },
          },
        },
        new Set(['/credentials/primary']),
        blockedExact,
        blockedSubstrings,
        true,
      )
      expect(blockedExact.has('cred_nested_123456')).toBe(true)
      expect(isPointerObscured('/nested', new Set(['/nested/secret']), false)).toBe(false)
      expect(isPointerObscured('/nested/secret', new Set(['/nested/secret']), false)).toBe(true)

      const scrubbed = scrubSecretString(
        'leak=prefix_secret_full_token',
        new Set(),
        new Set(['prefix', 'prefix_secret_full_token']),
      )
      expect(scrubbed).toBe('leak=[REDACTED]')

      const sanitized = sanitizePayloadObject(
        { note: 'Bearer tok_alpha_9988', ok: 'visible' },
        new Set(),
        false,
        new Set(['tok_alpha_9988']),
        new Set(['tok_alpha_9988']),
      )
      expect(sanitized.note).toBe('Bearer [REDACTED]')
      expect(sanitized.ok).toBe('visible')
    })

    it('isolates PendingAskRegistry across sessions containing "::" and tracks cumulative update redaction', async () => {
      const reg = new PendingAskRegistry()
      const p1 = reg.wait({
        sessionId: 'a::b',
        callId: 'c',
        defaultSurfaceId: 's1',
        timeoutSeconds: 5,
      })
      const p2 = reg.wait({
        sessionId: 'a',
        callId: 'b::c',
        defaultSurfaceId: 's2',
        timeoutSeconds: 5,
      })
      expect(reg.settle('a::b', { callId: 'c', action: 'ok1', dataModels: {} })).toBe(true)
      expect(reg.settle('a', { callId: 'b::c', action: 'ok2', dataModels: {} })).toBe(true)
      const [r1, r2] = await Promise.all([p1, p2])
      expect(r1.status).toBe('answered')
      expect(r2.status).toBe('answered')
      if (r1.status === 'answered') expect(r1.action).toBe('ok1')
      if (r2.status === 'answered') expect(r2.action).toBe('ok2')

      const sessions = new SurfaceSessions()
      sessions.setEnabled('s1', true)
      expect(sessions.getDefaultEnabled()).toBe(true)
      const turn1 = sessions.compile(
        's1',
        `surface("sec", "${DSH_CATALOG_ID}")\nroot = Column([TextField("API Key", $/secret, variant="obscured")])`,
      )
      const turn2 = sessions.compile(
        's1',
        'surface("sec", update=true)\nroot = Column([Text("Summary")])',
      )
      expect(turn1.length).toBeGreaterThan(0)
      expect(turn2.length).toBeGreaterThan(0)
      const state = sessions.getSessionRedactionState('s1')
      expect(state.obscuredPointers.has('/secret')).toBe(true)
      const msgPointers = collectObscuredPointersFromMessages(turn1)
      expect(msgPointers.has('/secret')).toBe(true)
    })

    it('hardens express-preprocess against ReDoS, multi-surface calc leaks, and non-object vars', () => {
      const t0 = performance.now()
      const hugeSpaces = `surface("s", Text("${'a'.repeat(16)}${' '.repeat(40000)}"))`
      preprocessExpressProgram(hugeSpaces)
      const hugeStream = `${' '.repeat(40000)}<not-a2ui>`
      expect(normalizeStreamingProgram(hugeStream)).toBe(hugeStream)
      expect(performance.now() - t0).toBeLessThan(200)

      const multiSurface = [
        '$/a = 10',
        '$/c = calc("a * 2", { a: $/a })',
        'surface("s1", Text($/c))',
        'surface("s2", Text($/c))',
      ].join('\n')
      const out = preprocessExpressProgram(multiSurface)
      expect(out).toContain('surface("s1"')
      expect(out).toContain('surface("s2"')

      const sessions = new SurfaceSessions()
      expect(() =>
        sessions.compile(
          's_calc',
          `surface("bad", "${DSH_CATALOG_ID}")\nroot = Text(calc("a + 1", [1, 2]))`,
        ),
      ).toThrow(/vars must be an object map/i)

      expect(classifyCompileError('Surface component count exceeds limit of 400')).toBe(
        'LIMIT_EXCEEDED',
      )
    })

    it('validates temporal rollover, invalid fallback strings, and 2-digit TZ offsets', () => {
      expect(formatNativeTemporalValue('2026-02-31', 'date')).toBe('')
      expect(formatNativeTemporalValue('not-a-date', 'date')).toBe('')
      expect(formatNativeTemporalValue('2026-11-19', 'date')).toBe('2026-11-19')
      expect(formatNativeTemporalValue('2026-11-19T10:30:00+08', 'date')).toBe('2026-11-19')
      expect(formatNativeTemporalValue('2026-11-19', 'datetime-local', 'end')).toBe(
        '2026-11-19T23:59',
      )
    })
  })

  describe('2. Client Security, Mermaid Sanitizer, Streaming & Persistence', () => {
    it('blocks namespace-prefixed SVG tags, CSS comments, nesting escapes, and inline style bypasses', () => {
      expect(() => assertSafeSvg('<svg><svg:script>alert(1)</svg:script></svg>')).toThrow()
      expect(isSafeStaticSvgImage('<svg><svg:image href="https://evil.test/x.png"/></svg>')).toBe(
        false,
      )

      const dirty = [
        '<svg id="m1"><style>',
        '#m1 .ok { fill: red; }',
        '#m1 .bad1 { background: url("https://evil.test/?a=)"); }',
        '#m1 .bad2 { background: url(/*comment*/ "https://evil.test/x"); }',
        '#m1 .nest { & body { display: none; } }',
        '@keyframes leak { from { opacity: 0; } to { opacity: 1; } }',
        '</style><g data-x=">" style="position: fixed; fill: green"></g></svg>',
      ].join('')
      const clean = scopeMermaidStyleRules(dirty, 'm1')
      expect(clean).toContain('fill: red')
      expect(clean).not.toContain('evil.test')
      expect(clean).not.toContain('display: none')
      expect(clean).not.toContain('@keyframes')
      expect(clean).not.toContain('position: fixed')
      expect(clean).toContain('fill: green')
    })

    it('isolates turn/dock caches across sessions and preserves streaming messages on incomplete tail', () => {
      const msgA: AgentToRendererMessage = {
        version: '1.0',
        createSurface: { surfaceId: 'shared', catalogId: 'dsh' },
      }
      const msgB: AgentToRendererMessage = {
        version: '1.0',
        createSurface: { surfaceId: 'other', catalogId: 'dsh' },
      }
      const batchA = resolveTurnTailBatch(
        makeSnapshot([{ id: 'n1', callId: 'c1', seq: 1, placement: 'answer', messages: [msgA] }]),
        1,
      )
      const batchB = resolveTurnTailBatch(
        makeSnapshot([{ id: 'n1', callId: 'c1', seq: 1, placement: 'answer', messages: [msgB] }]),
        1,
      )
      expect([...(batchA?.visibleSurfaceIds ?? [])]).toEqual(['shared'])
      expect([...(batchB?.visibleSurfaceIds ?? [])]).toEqual(['other'])

      const dockRecreate = resolveDockBatch(
        makeSnapshot([
          {
            id: 'n2',
            callId: 'd1',
            seq: 2,
            placement: 'dock',
            title: 'Panel',
            messages: [
              { version: '1.0', deleteSurface: { surfaceId: 'p1' } },
              { version: '1.0', createSurface: { surfaceId: 'p1', catalogId: 'dsh' } },
            ],
          },
        ]),
      )
      expect([...(dockRecreate?.visibleSurfaceIds ?? [])]).toEqual(['p1'])

      const sess = new StreamingExpressSession()
      const snap1 = sess.advance(
        `surface("live", "${DSH_CATALOG_ID}")\nroot = Text("Hello")\n`,
        false,
      )
      expect(snap1.messages.length).toBeGreaterThan(0)
      const snap2 = sess.advance(
        `surface("live", "${DSH_CATALOG_ID}")\nroot = Text("Hello")\nText("unterminated`,
        false,
      )
      expect(snap2.messages.length).toBe(snap1.messages.length)
      expect(snap2.surfaceIds).toEqual(['live'])
    })

    it('isolates passive persistence updates and clears empty/oversized drafts', () => {
      resetPersistenceForTests()
      setA2uiEnabled('sess_a', true, undefined, true)
      setA2uiEnabled('sess_b', false, undefined, false)
      expect(getA2uiEnabled('sess_c')).toBe(true)
      expect(getA2uiEnabled('sess_b')).toBe(false)

      saveSurfaceDraft('sess_draft', 'surf1', 'fp1', { note: 'hello' })
      expect(loadSurfaceDraft('sess_draft', 'surf1', 'fp1')).toEqual({ note: 'hello' })
      saveSurfaceDraft('sess_draft', 'surf1', 'fp1', {})
      expect(loadSurfaceDraft('sess_draft', 'surf1', 'fp1')).toBeNull()
    })
  })

  describe('3. Catalog Icons, Pure Helpers & Widget Correctness', () => {
    it('implements 100% of schema-declared standard icons in CATALOG_ICON_NAMES', () => {
      const iconDef = dshSchemaCatalog.components.get('Icon')
      expect(iconDef).toBeDefined()
      const nameSchema = (iconDef!.schema as unknown as { shape: Record<string, unknown> }).shape
        .name as { options?: ReadonlyArray<{ options?: readonly string[] }> }
      const enumBranch = nameSchema.options?.find(
        (opt) => Array.isArray(opt.options) && opt.options.length > 10,
      )
      const schemaIcons = enumBranch?.options ?? []
      expect(schemaIcons.length).toBeGreaterThanOrEqual(50)
      const catalogSet = new Set(CATALOG_ICON_NAMES)
      const missing = schemaIcons.filter((name) => !catalogSet.has(name))
      expect(missing).toEqual([])
      expect(catalogSet.size).toBeGreaterThanOrEqual(schemaIcons.length)
    })

    it('generates globally unique IDs, handles overnight schedules, terminal comments, CSV trees, and DateRange timestamps', () => {
      const nextId = makeUniqueIdFactory()
      expect([nextId('dup'), nextId('dup'), nextId('dup')]).toEqual(['dup', 'dup_2', 'dup_3'])

      const logs = normalizeLogEntries([
        { id: 'x', message: 'first' },
        { id: 'x', message: 'second' },
      ])
      expect(new Set(logs.map((l) => l.id)).size).toBe(2)

      const sources = normalizeSourceItems([
        { id: 's', title: 'Doc A', url: 'https://example.com/a' },
        { id: 's', title: 'Doc B', url: 'https://example.com/b' },
      ])
      expect(new Set(sources.map((s) => s.id)).size).toBe(2)

      const cmp = normalizeComparisonData(
        [{ key: 'a', title: 'A' }],
        [{ label: 'Row', values: { a: 'ok', __proto__: 'bad' } }],
      )
      expect(Object.getPrototypeOf(cmp.rows[0]!.cells)).toBeNull()

      const sched = normalizeScheduleItems(
        [
          { title: 'Night Shift', start: '22:00', end: '02:00' },
          { title: 'Next Morning', start: '03:00', end: '13:30' },
        ],
        ['22:00', '14:00'],
      )
      expect(sched.axisTicks[0]).toBe('22:00')
      expect(sched.axisTicks[sched.axisTicks.length - 1]).toBe('14:00')
      expect(sched.tracks[0]!.leftPct).toBe(0)
      expect(sched.tracks[1]!.leftPct).toBeGreaterThan(sched.tracks[0]!.leftPct)

      const term = normalizeTerminalCommands('# Setup database\n$ psql -c "SELECT 1"\n1 row')
      expect(term).toHaveLength(1)
      expect(term[0]!.comment).toBe('Setup database')
      expect(term[0]!.cmd).toBe('psql -c "SELECT 1"')

      const tokens = tokenizeEndpointPath('https://api.test:8443/v1/{tenant}/:id')
      expect(tokens.filter((t) => t.isParam).map((t) => t.text)).toEqual(['{tenant}', ':id'])

      const matrix = normalizeMatrixData({
        rows: ['R1'],
        columns: ['C1', 'C2'],
        values: [[-1e308, 1e308]],
      })
      expect(Number.isFinite(matrix.cells[0]![0]!.ratio)).toBe(true)
      expect(Number.isFinite(matrix.cells[0]![1]!.ratio)).toBe(true)

      const csvTree = formatChartDataToCsv([
        { name: 'Root', children: [{ name: 'Leaf', value: 42 }] },
      ])
      expect(csvTree).toContain('Root / Leaf')
      const csvGauge = formatChartDataToCsv({ name: 'SLA', value: 99.9, max: 100 })
      expect(csvGauge).toContain('SLA')

      expect(computeDateRangeSpanDays('2026-11-19T14:00', '2026-11-19T10:00')).toBeNull()
      const preset = buildDatePresetRange(7, true, '2026-11-19T16:30')
      expect(preset.start).toBe('2026-11-13T00:00')
      expect(preset.end).toBe('2026-11-19T16:30')

      const tree = normalizeHierarchyTree([
        { id: 'dup', label: 'A', children: [{ id: 'dup', label: 'B' }] },
      ])
      expect(tree[0]!.id).not.toBe(tree[0]!.children[0]!.id)

      const checklist = normalizeChecklistItems([
        { id: 'c', label: 'One' },
        { id: 'c', label: 'Two' },
      ])
      expect(new Set(checklist.map((c) => c.id)).size).toBe(2)
    })
  })

  describe('4. ECharts 6 Geometry, Scales, Tooltips & 64/64 + 26/26 Audit Coverage', () => {
    it('honors sub-100 explicit max on bullet & radialBar and avoids 7-item radialBar overlap', () => {
      const bulletOpt = buildChartOption(
        {
          kind: 'bullet',
          data: [
            { label: 'Recall', actual: 0.86, target: 0.9, ranges: [0.6, 0.85, 1.0], max: 1.0 },
            { label: 'NDCG', actual: 0.78, target: 0.8, ranges: [0.5, 0.75, 1.0], max: 1.0 },
          ],
        },
        true,
        276,
      ) as { xAxis: { max: number; min: number } }
      expect(bulletOpt.xAxis.max).toBe(1)
      expect(bulletOpt.xAxis.min).toBe(0)

      const radialSub = buildChartOption(
        {
          kind: 'radialBar',
          data: [
            { name: 'Search', value: 4.6, max: 5 },
            { name: 'Checkout', value: 3.8, max: 5 },
          ],
        },
        true,
        276,
      ) as { angleAxis: { max: number } }
      expect(radialSub.angleAxis.max).toBe(5)

      const radial7 = buildChartOption(
        {
          kind: 'radialBar',
          data: Array.from({ length: 7 }, (_, i) => ({ name: `Item ${i + 1}`, value: 90 - i * 8 })),
        },
        true,
        276,
      ) as { radiusAxis: { axisLabel: { hideOverlap?: boolean; interval?: number } } }
      expect(radial7.radiusAxis.axisLabel.hideOverlap).toBe(true)
      expect(radial7.radiusAxis.axisLabel.interval).toBeUndefined()
    })

    it('edge-aligns vertical markLines, infers numeric scatter axes, and preserves signed percent stacks', () => {
      const histOpt = buildChartOption(
        {
          kind: 'histogram',
          data: [10, 15, 20, 22, 25, 30, 35, 40, 120, 130],
          referenceLine: 130,
          referenceLabel: 'P99 SLA 130ms',
        },
        true,
        276,
      ) as { series: Array<{ markLine: { label: { align?: string } } }> }
      expect(histOpt.series[0]!.markLine.label.align).toBe('right')

      const scatterOpt = buildChartOption(
        {
          kind: 'scatter',
          data: [
            { service: 'api-gw', qps: 1200, p99: 42 },
            { service: 'orders', qps: 2400, p99: 88 },
          ],
          referenceX: 2000,
          referenceXLabel: 'QPS 2000',
        },
        true,
        276,
      ) as { xAxis: { type: string }; series: Array<{ markLine?: unknown }> }
      expect(scatterOpt.xAxis.type).toBe('value')
      expect(scatterOpt.series[0]!.markLine).toBeDefined()

      const pctSigned = buildChartOption(
        {
          kind: 'bar',
          stackMode: 'percent',
          data: [
            { q: 'Q1', gain: 60, loss: -40 },
            { q: 'Q2', gain: 80, loss: -20 },
          ],
          xField: 'q',
          yField: ['gain', 'loss'],
        },
        true,
        276,
      ) as { yAxis: { min: number; max: number }; series: Array<{ data: unknown[] }> }
      expect(pctSigned.yAxis.min).toBeLessThan(0)
      const lossPt = pctSigned.series[1]!.data[0] as { value: number } | number
      const lossVal = typeof lossPt === 'object' ? lossPt.value : lossPt
      expect(lossVal).toBeLessThan(0)
    })

    it('samples multi-row parallel dims, guards 1-dim parallel, aligns sunburst rings, and formats heatmap tooltips', () => {
      const parallelOpt = buildChartOption(
        {
          kind: 'parallel',
          data: [
            { model: 'A', qps: null, latency: 42, cost: 180000 },
            { model: 'B', qps: 2400, latency: 28, cost: 120000 },
          ],
        },
        true,
        276,
      ) as {
        parallelAxis: Array<{ name: string; axisLabel?: { align?: string; inside?: boolean } }>
      }
      expect(parallelOpt.parallelAxis.map((a) => a.name)).toContain('qps')
      const lastAxis = parallelOpt.parallelAxis[parallelOpt.parallelAxis.length - 1]!
      expect(lastAxis.axisLabel?.inside).toBe(true)

      const parallel1Dim = buildChartOption(
        {
          kind: 'parallel',
          data: [{ model: 'OnlyOne', score: 95 }],
        },
        true,
        276,
      ) as { series: Array<{ type: string }> }
      expect(parallel1Dim.series[0]!.type).toBe('bar')

      const sunburst3L = buildChartOption(
        {
          kind: 'sunburst',
          data: [
            {
              name: 'Cloud',
              children: [
                {
                  name: 'Compute',
                  children: [
                    { name: 'GPU', value: 60 },
                    { name: 'CPU', value: 40 },
                  ],
                },
              ],
            },
          ],
        },
        true,
        620,
      ) as {
        series: Array<{ radius: [string, string]; levels: Array<{ r0?: string; r?: string }> }>
      }
      const s = sunburst3L.series[0]!
      expect(s.levels[1]!.r).toBe(s.levels[2]!.r0)
      expect(s.levels[2]!.r).toBe(s.levels[3]!.r0)
      expect(s.levels[3]!.r).toBe(s.radius[1])

      const heatOpt = buildChartOption(
        {
          kind: 'heatmap',
          data: [
            { hour: '10:00', store: '朝阳店', orders: 172 },
            { hour: '10:00', store: '朝阳店', orders: 185 },
          ],
          xField: 'hour',
          yField: 'store',
          sizeField: 'orders',
        },
        true,
        276,
      ) as {
        tooltip: { formatter: (p: unknown) => string }
        series: Array<{ data: unknown[] }>
      }
      expect(heatOpt.series[0]!.data).toHaveLength(1)
      expect(heatOpt.tooltip.formatter({ value: [0, 0, 185] })).toBe('朝阳店 · 10:00: 185')

      const calOpt = buildChartOption(
        {
          kind: 'calendar',
          data: [
            { date: '2025-12-15', count: 12 },
            { date: '2026-01-15', count: 18 },
          ],
        },
        true,
        276,
      ) as { calendar: { top: number; yearLabel: { show: boolean; margin: number } } }
      expect(calOpt.calendar.yearLabel.show).toBe(true)
      expect(calOpt.calendar.yearLabel.margin).toBeGreaterThanOrEqual(24)
      expect(calOpt.calendar.top).toBeGreaterThanOrEqual(44)

      const chordOpt = buildChartOption(
        {
          kind: 'chord',
          data: [
            { source: 'A', target: 'B', value: 0 },
            { source: 'A', target: 'C', value: 10 },
          ],
        },
        true,
        276,
      ) as { series: Array<{ links: unknown[]; labelLayout?: { hideOverlap?: boolean } }> }
      expect(chordOpt.series[0]!.links).toHaveLength(1)
      expect(chordOpt.series[0]!.labelLayout?.hideOverlap).toBe(true)

      const graphOpt = buildChartOption(
        {
          kind: 'graph',
          data: {
            nodes: ['A', 'B', 'C', 'D', 'E'].map((id) => ({ id, name: id })),
            links: [{ source: 'A', target: 'D' }],
          },
        },
        true,
        276,
      ) as { series: Array<{ data: Array<{ label?: { position?: string } }> }> }
      const positions = graphOpt.series[0]!.data.map((d) => d.label?.position)
      expect(positions).toContain('top')
      expect(positions).toContain('bottom')
    })

    it('ensures DEFAULT_AUDIT_SHOWCASES covers 64/64 components and 26/26 chart kinds', () => {
      const src = readFileSync(resolve(import.meta.dirname, '../scripts/mock-llm.mjs'), 'utf8')
      const map: Record<string, string> = {}
      for (const m of src.matchAll(
        /if \(isShowcase(\d+)(Dock)?\)\s*\{[\s\S]{0,260}?ui:\s*(SHOWCASE_[A-Z0-9_]+)/g,
      )) {
        map[`showcase-${m[1]}${m[2] ? '-dock' : ''}`] = m[3]!
      }
      const compNames = [...dshSchemaCatalog.components.keys()]
      const usedComps = new Set<string>()
      const usedCharts = new Set<string>()
      for (const id of DEFAULT_AUDIT_SHOWCASES) {
        const key = map[id]
        const txt = key ? String((mockLlm as Record<string, unknown>)[key] ?? '') : ''
        for (const c of compNames) {
          if (new RegExp(`\\b${c}\\s*\\(`).test(txt)) usedComps.add(c)
        }
        for (const k of CHART_KINDS) {
          if (new RegExp(`Chart\\s*\\(\\s*["']${k}["']`).test(txt)) usedCharts.add(k)
        }
      }
      expect(compNames.filter((c) => !usedComps.has(c))).toEqual([])
      expect(CHART_KINDS.filter((k) => !usedCharts.has(k))).toEqual([])
    })
  })
})
