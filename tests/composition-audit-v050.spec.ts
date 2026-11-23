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

import { DshTreeImpl } from '../src/client/catalog/AntdParityWidgets.tsx'
import {
  computeArrayCount,
  computeArraySum,
  evaluateRequiredValue,
} from '../src/client/catalog/functions.ts'
import {
  DshChecklistImpl,
  DshKvEditorImpl,
  DshRangeSliderImpl,
  DshRatingImpl,
} from '../src/client/catalog/NextGenWidgets.tsx'
import { normalizeDiffAnnotations, normalizeDiffFiles } from '../src/client/catalog/p0-helpers.ts'
import {
  computeTableNumericSummary,
  detectNumericColumnKeys,
  filterTableRowsByField,
  formatChartDataToCsv,
  normalizeCrossFilterTokens,
} from '../src/client/catalog/v4-helpers.ts'
import {
  buildAnnotatedTextSegments,
  clampImageComparePosition,
  clampRangeSliderBounds,
  clampRatingScore,
  normalizeSortableItems,
} from '../src/client/catalog/v6-helpers.ts'
import {
  areExternalValuesEqual,
  ModalCloseContext,
  useSurfaceActionRunner,
} from '../src/client/catalog/widget-helpers.tsx'
import { buildChartOption, computeHistogramBins } from '../src/client/chunks/echarts-chunk.ts'
import { sanitizeDataModel } from '../src/client/persistence.ts'
import {
  sanitizeActionContextForSurface,
  sanitizeActionPayloadForSurface,
} from '../src/client/runtime/SurfaceView.tsx'
import {
  collectObscuredContextPointersFromMessages,
  collectObscuredPointersFromMessages,
  PendingAskRegistry,
  sanitizePayloadObject,
} from '../src/host/ask-tool.ts'
import { SurfaceSessions } from '../src/host/generator.ts'
import { A2UI_SYSTEM_GUIDANCE } from '../src/index.ts'
import { expandDateRangeShorthandChecks } from '../src/shared/express-preprocess.ts'

describe('v0.5.0 composition audit regressions', () => {
  describe('Group A: security redaction across nested @call, interpolations, short PINs, and KvEditor secrets', () => {
    it('redacts obscured pointers inside nested @call args, pointer interpolations, and KvEditor rows on host ask settlement', async () => {
      const sessions = new SurfaceSessions()
      const pinInterp = `$${'{/pin}'}`
      const msgs = sessions.compile(
        'sec-host-1',
        [
          'surface("sec_ask")',
          '$/pin = "042"',
          '$/note = "public"',
          '$/env = [{ key: "HOST", value: "prod" }, { key: "API_TOKEN", value: "sk-top-secret-999" }]',
          'root = Card(Column([',
          '  TextField("PIN", $/pin, variant="obscured"),',
          '  KvEditor($/env, title="Env"),',
          '  Button(Text("Submit"), variant="primary", action=Event("go", {',
          '    ok: $/note,',
          '    derivedCalc: calc("p + 1", { p: $/pin }),',
          `    derivedInterp: formatString("PIN=${pinInterp}"),`,
          '    nested: { safe: $/note, leak: $/pin }',
          '  }))',
          ']))',
        ].join('\n'),
      )

      const obscured = collectObscuredPointersFromMessages(msgs)
      expect(obscured.has('/pin')).toBe(true)
      expect(obscured.has('/env/1/value')).toBe(true)

      const obscuredCtx = collectObscuredContextPointersFromMessages(msgs, obscured)
      expect(obscuredCtx.has('/derivedCalc')).toBe(true)
      expect(obscuredCtx.has('/derivedInterp')).toBe(true)
      expect(obscuredCtx.has('/nested/leak')).toBe(true)
      expect(obscuredCtx.has('/nested/safe')).toBe(false)
      expect(obscuredCtx.has('/ok')).toBe(false)

      const registry = new PendingAskRegistry()
      const pending = registry.wait({
        sessionId: 'sec-host-1',
        callId: 'call-1',
        defaultSurfaceId: 'sec_ask',
        timeoutSeconds: 30,
        obscuredPointers: obscured,
        obscuredContextPointers: obscuredCtx,
      })

      registry.settle('sec-host-1', {
        callId: 'call-1',
        action: 'go',
        surfaceId: 'sec_ask',
        sourceComponentId: 'btn',
        userMessage: 'Submitted token sk-top-secret-999 and runtime sk-runtime-added-888',
        context: {
          ok: 'public',
          derivedCalc: 43,
          derivedInterp: 'PIN=042',
          leakedStr: 'copy sk-runtime-added-888',
          exactPin: '042',
          nested: { safe: 'public', leak: '042' },
        },
        dataModels: {
          api_key: 'sk-top-level-bypass',
          sec_ask: {
            pin: '042',
            note: 'public',
            env: [
              { key: 'HOST', value: 'prod' },
              { key: 'API_TOKEN', value: 'sk-top-secret-999' },
              { key: 'DB_SECRET', value: 'sk-runtime-added-888' },
            ],
          },
        },
      })

      const settled = await pending
      expect(settled.status).toBe('answered')
      if (settled.status !== 'answered') return
      expect(settled.userMessage).not.toContain('sk-top-secret-999')
      expect(settled.userMessage).not.toContain('sk-runtime-added-888')
      expect(settled.userMessage).toContain('[REDACTED]')
      expect(settled.context.ok).toBe('public')
      expect(settled.context.derivedCalc).toBeUndefined()
      expect(settled.context.derivedInterp).toBeUndefined()
      expect(settled.context.exactPin).toBeUndefined()
      expect(settled.context.leakedStr).toBe('copy [REDACTED]')
      expect(settled.context.nested).toEqual({ safe: 'public' })
      expect(settled.dataModels.api_key).toBeUndefined()
      const model = settled.dataModels.sec_ask as Record<string, unknown>
      expect(model.pin).toBeUndefined()
      expect(model.note).toBe('public')
      expect(model.env).toEqual([
        { key: 'HOST', value: 'prod' },
        { key: 'API_TOKEN' },
        { key: 'DB_SECRET' },
      ])
    })

    it('redacts client action context bindings referencing obscured fields through @call or interpolation and compacts sanitized arrays', () => {
      const pinInterp = `$${'{/pin}'}`
      const fakeSurface = {
        id: 'main',
        componentsModel: {
          entries: [
            [
              'pinField',
              { type: 'TextField', properties: { variant: 'obscured', value: { path: '/pin' } } },
            ],
            ['kv1', { type: 'KvEditor', properties: { items: { path: '/env' } } }],
            [
              'submitBtn',
              {
                type: 'Button',
                properties: {
                  action: {
                    event: {
                      name: 'submit',
                      context: {
                        ok: { path: '/ok' },
                        calcLeak: {
                          call: 'calc',
                          args: { expr: 'p + 1', vars: { p: { path: '/pin' } } },
                        },
                        interpLeak: { call: 'formatString', args: { value: `v=${pinInterp}` } },
                      },
                    },
                  },
                },
              },
            ],
          ],
        },
        dataModel: {
          get(ptr: string) {
            const root = {
              pin: '7',
              ok: 'hello',
              env: [{ key: 'AUTH_TOKEN', value: 'tok-live-9876' }],
            }
            if (ptr === '/') return root
            if (ptr === '/pin') return root.pin
            if (ptr === '/env') return root.env
            if (ptr === '/env/0/value') return 'tok-live-9876'
            return undefined
          },
        },
      }

      const cleaned = sanitizeActionContextForSurface(fakeSurface as never, {
        name: 'submit',
        surfaceId: 'main',
        sourceComponentId: 'submitBtn',
        timestamp: '2026-11-23T00:00:00Z',
        context: {
          ok: 'hello',
          calcLeak: 8,
          interpLeak: 'v=7',
          leakedKv: 'bearer tok-live-9876',
        },
      })
      expect(cleaned).toEqual({
        ok: 'hello',
        leakedKv: 'bearer [REDACTED]',
      })

      const compacted = sanitizeDataModel(
        { items: ['keep', 'secret-val', 'keep2'] },
        new Set(['/items/1']),
      )
      expect(compacted.items).toEqual(['keep', 'keep2'])
      expect(sanitizePayloadObject({ secret: 'nope', s1: { x: 1 } }, undefined, true)).toEqual({
        s1: { x: 1 },
      })
    })

    it('avoids false-positive redaction on unrelated short numeric fields and benign sentinel values under secret-like keys', async () => {
      const sessions = new SurfaceSessions()
      const msgs = sessions.compile(
        'sec-noncollision-1',
        [
          'surface("cfg")',
          '$/pin = "100"',
          '$/qps = 100',
          '$/auth_secret = "none"',
          '$/password_policy = "enabled"',
          'root = Card(Column([',
          '  TextField("PIN", $/pin, variant="obscured"),',
          '  Slider("QPS", 10, 500, $/qps),',
          '  Button(Text("Apply"), variant="primary", action=Event("apply", { qps: $/qps, mode: "none", policy: "enabled", pinLeak: $/pin }))',
          ']))',
        ].join('\n'),
      )
      const obscured = collectObscuredPointersFromMessages(msgs)
      const obscuredCtx = collectObscuredContextPointersFromMessages(msgs, obscured)
      const registry = new PendingAskRegistry()
      const pending = registry.wait({
        sessionId: 'sec-noncollision-1',
        callId: 'call-nc',
        defaultSurfaceId: 'cfg',
        timeoutSeconds: 30,
        obscuredPointers: obscured,
        obscuredContextPointers: obscuredCtx,
      })

      registry.settle('sec-noncollision-1', {
        callId: 'call-nc',
        action: 'apply',
        surfaceId: 'cfg',
        sourceComponentId: 'btn',
        userMessage: 'Apply qps 100 with mode none and policy enabled',
        context: { qps: 100, port: 8080, mode: 'none', policy: 'enabled', pinLeak: '100' },
        dataModels: {
          cfg: {
            pin: '100',
            qps: 100,
            auth_secret: 'none',
            password_policy: 'enabled',
          },
        },
      })

      const settled = await pending
      expect(settled.status).toBe('answered')
      if (settled.status !== 'answered') return
      expect(settled.userMessage).toBe('Apply qps 100 with mode none and policy enabled')
      expect(settled.context).toEqual({ qps: 100, port: 8080, mode: 'none', policy: 'enabled' })
      const cfgModel = settled.dataModels.cfg as Record<string, unknown>
      expect(cfgModel.pin).toBeUndefined()
      expect(cfgModel.auth_secret).toBeUndefined()
      expect(cfgModel.password_policy).toBeUndefined()
      expect(cfgModel.qps).toBe(100)

      const fakeSurface = {
        id: 'cfg',
        componentsModel: {
          entries: [
            [
              'pinField',
              { type: 'TextField', properties: { variant: 'obscured', value: { path: '/pin' } } },
            ],
            [
              'applyBtn',
              {
                type: 'Button',
                properties: {
                  action: {
                    event: {
                      name: 'apply',
                      context: {
                        qps: { path: '/qps' },
                        pinLeak: { path: '/pin' },
                        mode: 'none',
                      },
                    },
                  },
                },
              },
            ],
          ],
        },
        dataModel: {
          get(ptr: string) {
            const root = {
              pin: '100',
              qps: 100,
              otp: 998877,
              auth_secret: 'none',
              password_policy: 'enabled',
            }
            if (ptr === '/') return root
            if (ptr === '/pin') return root.pin
            return undefined
          },
        },
      }
      const clientClean = sanitizeActionContextForSurface(fakeSurface as never, {
        name: 'apply',
        surfaceId: 'cfg',
        sourceComponentId: 'applyBtn',
        timestamp: '2026-11-23T00:00:00Z',
        context: { qps: 100, pinLeak: '100', mode: 'none', note: 'policy enabled' },
      })
      expect(clientClean).toEqual({ qps: 100, mode: 'none', note: 'policy enabled' })
    })
  })

  describe('Group B: host compiler validation, shorthand preprocessing, and prompt parity', () => {
    it('expands ?required on DateRange, RangeSlider, and KvEditor and rejects literal-value check rules across all validators', () => {
      expect(
        expandDateRangeShorthandChecks(
          'RangeSlider("Budget", 0, 100, $/lo, $/hi, ?required("Need range"))',
        ),
      ).toContain('?and([required($/lo), required($/hi)], "Need range")')
      expect(
        expandDateRangeShorthandChecks('KvEditor($/env, title="Env", ?required("Need env"))'),
      ).toContain('?required($/env, "Need env")')

      const sessions = new SurfaceSessions()
      expect(() =>
        sessions.compile(
          'check-ok',
          [
            'surface("s")',
            '$/lo = 10',
            '$/hi = 80',
            '$/env = { HOST: "prod" }',
            'root = Column([RangeSlider("Budget", 0, 100, $/lo, $/hi, ?required("Need range")), KvEditor($/env, ?required("Need env"))])',
          ].join('\n'),
        ),
      ).not.toThrow()

      expect(() =>
        sessions.compile(
          'check-bad-numeric',
          [
            'surface("s")',
            '$/lo = 10',
            '$/hi = 80',
            'root = RangeSlider("Budget", 0, 100, $/lo, $/hi, ?numeric(20, 90, "Out of bounds"))',
          ].join('\n'),
        ),
      ).toThrow(/literal value/i)

      expect(() =>
        sessions.compile(
          'check-bad-regex',
          [
            'surface("s")',
            'root = Button(Text("Go"), action=Event("go"), ?regex("^[a-z]+$", "bad"))',
          ].join('\n'),
        ),
      ).toThrow(/literal value/i)

      expect(evaluateRequiredValue({})).toEqual({
        valid: false,
        message: 'This field is required.',
      })
      expect(evaluateRequiredValue({ HOST: 'prod' })).toEqual({ valid: true })
      expect(A2UI_SYSTEM_GUIDANCE).toContain(
        'KvEditor($/entries, title?, keyLabel?, valueLabel?, keyPlaceholder?, valuePlaceholder?, addLabel?, maxItems?)',
      )
    })
  })

  describe('Group C: exact conditional aggregates, boolean cross-filter, Table summaries, and Histogram CSV', () => {
    it('prevents substring false positives in conditional aggregates and supports boolean filter tokens', () => {
      const rows = [
        { status: 'unhealthy', amount: 100, enabled: false },
        { status: 'degraded', amount: 200, enabled: true },
      ]
      expect(computeArrayCount(rows, 'status', 'healthy')).toBe(0)
      expect(computeArraySum(rows, 'amount', 'status', 'healthy')).toBe(0)
      expect(normalizeCrossFilterTokens(true)).toEqual(['true'])
      expect(normalizeCrossFilterTokens(false)).toEqual(['false'])
      expect(computeArrayCount(rows, 'enabled', true)).toBe(1)
      expect(filterTableRowsByField(rows, 'status', 'healthy')).toEqual([])
      expect(
        filterTableRowsByField([{ tag: '[p0] outage' }, { tag: 'ap0x' }], 'tag', 'p0'),
      ).toHaveLength(1)
    })

    it('excludes code/badge/sparkline columns from numeric summary, averages bounded bar(max=100), and exports scalar histogram CSV', () => {
      const cols = [
        { key: 'port', format: 'code' },
        { key: 'load', format: 'bar', max: 100 },
        { key: 'cost' },
      ]
      const rows = [
        { port: 8080, load: 86, cost: 5200 },
        { port: 8443, load: 74, cost: 4660 },
        { port: 9090, load: 94, cost: 4120 },
      ]
      const numericKeys = detectNumericColumnKeys(cols, rows)
      expect(numericKeys.has('port')).toBe(false)
      expect(numericKeys.has('load')).toBe(true)
      expect(numericKeys.has('cost')).toBe(true)

      const summary = computeTableNumericSummary(cols, rows, numericKeys, (v) => `均值 ${v}`)
      expect(summary.port).toBeUndefined()
      expect(summary.load).toBe('均值 84.7')
      expect(summary.cost).toBe('13,980')

      const csv = formatChartDataToCsv([14, 18, 22])
      expect(csv).toBe('\uFEFFindex,value\r\n1,14\r\n2,18\r\n3,22')
    })
  })

  describe('Group D & E: pure widget helpers, DiffView filePath separation, and component rendering contracts', () => {
    it('prevents null/empty coercion to 0 in RangeSlider/ImageCompare, preserves stable SortableList IDs, and separates DiffView filePath', () => {
      const bounds = clampRangeSliderBounds({ min: 10, max: 90, start: null, end: '' })
      expect(bounds.start).toBe(10)
      expect(bounds.end).toBe(90)
      expect(clampImageComparePosition(null)).toBe(50)
      expect(clampImageComparePosition('')).toBe(50)

      const s1 = normalizeSortableItems(['Alpha', 'Beta', 'Alpha'])
      const s2 = normalizeSortableItems(['Beta', 'Alpha', 'Alpha'])
      expect(s1.map((x) => x.id)).toEqual(['sort_Alpha', 'sort_Beta', 'sort_Alpha__2'])
      expect(s2.map((x) => x.id)).toEqual(['sort_Beta', 'sort_Alpha', 'sort_Alpha__2'])

      const files = normalizeDiffFiles([
        { title: 'Virtual Snippet', before: 'a', after: 'b' },
        { path: 'src/app.ts', before: 'x', after: 'y' },
      ])
      expect(files[0]?.filePath).toBeUndefined()
      expect(files[1]?.filePath).toBe('src/app.ts')
    })

    it('renders RangeSlider 9px rail formula, KvEditor readOnly attribute, Rating, and Tree inside ModalCloseContext cleanly', () => {
      const rawOf = (impl: unknown) => (impl as { rawRender: never }).rawRender
      const rangeHtml = renderToStaticMarkup(
        createElement(rawOf(DshRangeSliderImpl), {
          props: { label: 'R', min: 0, max: 100, start: 20, end: 80 },
          context: {},
        }),
      )
      expect(rangeHtml).toContain('calc(20% + 5.40px)')
      expect(rangeHtml).toContain('sliderOutput')

      const kvHtml = renderToStaticMarkup(
        createElement(rawOf(DshKvEditorImpl), {
          props: { items: { HOST: 'prod', API_TOKEN: 'sec' } },
          context: {},
        }),
      )
      expect(kvHtml).toContain('HOST')
      expect(kvHtml).toContain('type="password"')

      const ratingHtml = renderToStaticMarkup(
        createElement(rawOf(DshRatingImpl), {
          props: { label: 'Score', value: 3, max: 5 },
          context: {},
        }),
      )
      expect(ratingHtml).toContain('3 / 5')

      const closeSpy = vi.fn()
      const treeHtml = renderToStaticMarkup(
        createElement(
          ModalCloseContext.Provider,
          { value: closeSpy },
          createElement(rawOf(DshTreeImpl), {
            props: { nodes: [{ id: 'n1', label: 'Node 1' }], action: vi.fn() },
            context: {},
          }),
        ),
      )
      expect(treeHtml).toContain('Node 1')
    })
  })

  describe('Group F: ECharts 276px compact geometry, cross-filter isolation, and axis/bin contracts', () => {
    it('centers bullet actual bar on twin yAxis, uses clean X interval, and protects silent bands/connectors during cross-filter', () => {
      const bulletOpt = buildChartOption(
        {
          kind: 'bullet',
          data: [
            { label: 'ARR', actual: 92, target: 90, ranges: [60, 85, 110] },
            { label: 'Cache', actual: 78, target: 85, ranges: [55, 80, 100] },
          ],
          selected: 'ARR',
        },
        true,
        276,
      ) as Record<string, unknown>

      expect(Array.isArray(bulletOpt.yAxis)).toBe(true)
      expect((bulletOpt.yAxis as unknown[]).length).toBe(2)
      const xAxis = bulletOpt.xAxis as { max: number; interval: number }
      expect(xAxis.max % xAxis.interval).toBe(0)

      const series = bulletOpt.series as Record<string, unknown>[]
      const silentBars = series.filter((s) => s.silent === true && s.type === 'bar')
      expect(silentBars.length).toBe(3)
      for (const sb of silentBars) {
        for (const pt of sb.data as unknown[]) {
          expect(typeof pt).toBe('number')
        }
      }
      const actualBar = series.find((s) => s.silent !== true && s.type === 'bar')
      expect(actualBar?.yAxisIndex).toBe(1)

      const dumbbellOpt = buildChartOption(
        {
          kind: 'dumbbell',
          data: [
            { label: 'Pay', before: 420, after: 112 },
            { label: 'Search', before: 295, after: 84 },
          ],
          selected: 'Pay',
        },
        true,
        276,
      ) as Record<string, unknown>
      const dbSeries = dumbbellOpt.series as Record<string, unknown>[]
      const connector = dbSeries.find((s) => s.type === 'bar' && s.silent === true)
      expect(connector).toBeDefined()
      for (const pt of (connector?.data ?? []) as Record<string, unknown>[]) {
        expect((pt.itemStyle as Record<string, unknown> | undefined)?.borderColor).toBeUndefined()
      }
    })

    it('shifts negative range markArea by -baseline, bounds referenceLine, uses roundRect legend, and guards scatter/combo log & referenceX', () => {
      const rangeOpt = buildChartOption(
        {
          kind: 'range',
          data: [
            { day: 'Mon', low: -20, forecast: 38, high: 112 },
            { day: 'Tue', low: 35, forecast: 225, high: 320 },
          ],
          xField: 'day',
          yField: ['low', 'forecast', 'high'],
          referenceLine: 360,
          referenceLabel: 'Cap 360',
          markArea: [{ axis: 'y', start: -20, end: 0, label: 'Sub-zero' }],
          selected: 'Tue',
        },
        true,
        276,
      ) as Record<string, unknown>
      const rangeYAxis = rangeOpt.yAxis as { max?: number }
      expect(rangeYAxis.max ?? 0).toBeGreaterThanOrEqual(380)
      const rangeSeries = rangeOpt.series as Record<string, unknown>[]
      const baseSeries = rangeSeries[0]!
      expect(baseSeries.silent).toBe(true)
      expect(typeof (baseSeries.data as unknown[])[0]).toBe('number')
      const midSeries = rangeSeries[2]!
      const maData = (midSeries.markArea as { data: [[{ yAxis: number }, { yAxis: number }]] })
        .data[0]!
      expect(maData[0].yAxis).toBe(0)
      expect(maData[1].yAxis).toBe(20)
      const legendData = (rangeOpt.legend as { data: unknown[] }).data
      expect(
        legendData.some(
          (d) =>
            typeof d === 'object' && d !== null && (d as { icon?: string }).icon === 'roundRect',
        ),
      ).toBe(true)

      const scatterOpt = buildChartOption(
        {
          kind: 'scatter',
          data: [
            { x: 28, y: 82 },
            { x: 48, y: 0 },
            { x: 74, y: 76 },
          ],
          xField: 'x',
          yField: 'y',
          yScale: 'log',
          referenceX: 95,
          referenceXLabel: 'Max 95',
        },
        true,
        276,
      ) as Record<string, unknown>
      expect((scatterOpt.xAxis as { max?: number }).max).toBeGreaterThanOrEqual(95)
      expect((scatterOpt.yAxis as { type: string }).type).toBe('log')
      const scatterPts = (scatterOpt.series as { data: { value: [number, number | null] }[] }[])[0]!
        .data
      expect(scatterPts[1]?.value[1]).toBeNull()

      const stackedComboOpt = buildChartOption(
        {
          kind: 'combo',
          data: [
            { m: 'A', b1: 10, b2: 20, r: 5 },
            { m: 'B', b1: 15, b2: 25, r: 8 },
          ],
          xField: 'm',
          yField: ['b1', 'b2'],
          y2Field: 'r',
          stacked: true,
          yScale: 'log',
        },
        true,
        276,
      ) as Record<string, unknown>
      expect((stackedComboOpt.yAxis as { type: string }[])[0]?.type).toBe('value')
    })

    it('adds radialBar label breathing room and snaps auto histogram bins to clean integer intervals', () => {
      const radialOpt = buildChartOption(
        {
          kind: 'radialBar',
          data: [
            { name: 'GPU', value: 92 },
            { name: 'HBM', value: 84 },
            { name: 'KV', value: 76 },
            { name: 'Net', value: 68 },
            { name: 'Disk', value: 54 },
          ],
        },
        true,
        276,
      ) as Record<string, unknown>
      expect((radialOpt.polar as { center: string[] }).center[0]).toBe('56%')
      expect(
        (radialOpt.radiusAxis as { axisLabel: { margin: number } }).axisLabel.margin,
      ).toBeGreaterThanOrEqual(9)

      const bins = computeHistogramBins(
        [14, 18, 22, 24, 26, 28, 30, 32, 34, 36, 38, 42, 46, 52, 58, 68, 76, 94, 118, 136],
        undefined,
        true,
      )
      expect(bins.length).toBeGreaterThanOrEqual(4)
      expect(bins.length).toBeLessThanOrEqual(8)
      expect(bins.reduce((acc, b) => acc + b.count, 0)).toBe(20)
      for (const b of bins) {
        expect(Number.isInteger(b.start)).toBe(true)
        expect(Number.isInteger(b.end)).toBe(true)
      }
    })

    it('guards scatter negative-X interval, positions top vs bottom Y markArea labels without clipping, and avoids IEEE-754 histogram drift', () => {
      const negScatter = buildChartOption(
        {
          kind: 'scatter',
          data: [
            { x: -500, y: 12 },
            { x: -100, y: 24 },
            { x: 5, y: 36 },
          ],
          xField: 'x',
          yField: 'y',
          referenceX: 10,
        },
        true,
        276,
      ) as Record<string, unknown>
      expect((negScatter.xAxis as { interval?: number }).interval).toBeUndefined()

      const posScatter = buildChartOption(
        {
          kind: 'scatter',
          data: [
            { x: 10, y: 12 },
            { x: 20, y: 24 },
            { x: 30, y: 36 },
          ],
          xField: 'x',
          yField: 'y',
          referenceX: 35,
        },
        true,
        276,
      ) as Record<string, unknown>
      expect((posScatter.xAxis as { min?: number; interval?: number }).min).toBe(0)
      expect((posScatter.xAxis as { interval?: number }).interval).toBeGreaterThan(0)

      const lineWithBands = buildChartOption(
        {
          kind: 'line',
          data: [
            { t: 'T1', v: 15 },
            { t: 'T2', v: 65 },
            { t: 'T3', v: 95 },
          ],
          xField: 't',
          yField: 'v',
          markArea: [
            { axis: 'y', start: 0, end: 15, label: 'Low Band', tone: 'info' },
            { axis: 'y', start: 80, end: 100, label: 'Danger Zone', tone: 'danger' },
          ],
        },
        true,
        276,
      ) as Record<string, unknown>
      const maList =
        (
          (lineWithBands.series as Record<string, unknown>[])[0]?.markArea as
            | { data: [{ label: { position: string } }, unknown][] }
            | undefined
        )?.data ?? []
      expect(maList[0]?.[0]?.label.position).toBe('top')
      expect(maList[1]?.[0]?.label.position).toBe('insideTop')

      const decBins = computeHistogramBins([0.3, 0.35, 0.4, 0.5, 0.6], undefined, true)
      expect(decBins[0]?.start).toBe(0.3)
      expect(decBins.reduce((s, b) => s + b.count, 0)).toBe(5)

      const tinyBins = computeHistogramBins([1e-8, 1.5e-8, 2e-8, 2.5e-8, 3e-8], undefined, true)
      expect(tinyBins.length).toBeGreaterThanOrEqual(4)
      expect(tinyBins[0]?.end).toBeGreaterThan(tinyBins[0]?.start ?? 0)
      expect(tinyBins.reduce((s, b) => s + b.count, 0)).toBe(5)
    })

    it('preserves shallow-equal array literals in useWritablePropState and exposes action runner safely', async () => {
      expect(areExternalValuesEqual(['a', 'b'], ['a', 'b'])).toBe(true)
      expect(areExternalValuesEqual(['a', 'b'], ['a', 'c'])).toBe(false)
      expect(areExternalValuesEqual(['a'], ['a', 'b'])).toBe(false)
      expect(areExternalValuesEqual(Number.NaN, Number.NaN)).toBe(true)
      expect(areExternalValuesEqual('x', ['x'])).toBe(false)

      const closeModal = vi.fn()
      const act = vi.fn().mockResolvedValue(undefined)
      let capturedRunner: (() => Promise<boolean>) | undefined
      function Probe({ fn, ctx }: { fn?: () => Promise<void>; ctx: unknown }) {
        capturedRunner = useSurfaceActionRunner(ctx, fn)
        return createElement('span', null, capturedRunner ? 'ready' : 'none')
      }
      renderToStaticMarkup(
        createElement(
          ModalCloseContext.Provider,
          { value: closeModal },
          createElement(Probe, {
            fn: act,
            ctx: { componentModel: { properties: { action: { event: { name: 'submit' } } } } },
          }),
        ),
      )
      expect(typeof capturedRunner).toBe('function')
      await capturedRunner?.()
      expect(act).toHaveBeenCalledTimes(1)
      expect(closeModal).toHaveBeenCalledTimes(1)

      closeModal.mockClear()
      renderToStaticMarkup(
        createElement(
          ModalCloseContext.Provider,
          { value: closeModal },
          createElement(Probe, {
            fn: act,
            ctx: {
              componentModel: {
                properties: { action: { functionCall: { call: 'copyText', args: {} } } },
              },
            },
          }),
        ),
      )
      await capturedRunner?.()
      expect(closeModal).not.toHaveBeenCalled()
    })

    it('covers sibling fixes: payload redaction namespace isolation, literal Checklist value, coercion guards, and tiny/negative ECharts axes', () => {
      let rootReads = 0
      const fakeSurface = {
        id: 'ops',
        componentsModel: {
          entries: [
            [
              'codePin',
              { type: 'TextField', properties: { variant: 'obscured', value: { path: '/code' } } },
            ],
            [
              'tbl',
              {
                type: 'Table',
                properties: {
                  action: { event: { name: 'inspect', context: { env: 'prod' } } },
                },
              },
            ],
          ],
        },
        dataModel: {
          get(ptr: string) {
            const root = {
              code: 'sec-9988',
              metrics: [{ name: 'API Key Rotation', value: 'ops' }],
            }
            if (ptr === '/') {
              rootReads += 1
              return root
            }
            if (ptr === '/code') return root.code
            return undefined
          },
        },
      }
      const payload = sanitizeActionPayloadForSurface(fakeSurface as never, {
        name: 'inspect',
        surfaceId: 'ops',
        sourceComponentId: 'tbl',
        timestamp: '2026-11-23T00:00:00Z',
        context: { env: 'prod', code: 'HTTP-500', team: 'ops', note: 'leaked sec-9988' },
      })
      expect(rootReads).toBe(1)
      expect(payload.context).toEqual({
        env: 'prod',
        code: 'HTTP-500',
        team: 'ops',
        note: 'leaked [REDACTED]',
      })

      const checklistRender = (
        DshChecklistImpl as unknown as {
          rawRender: (arg: { props: Record<string, unknown>; context: unknown }) => unknown
        }
      ).rawRender
      const checklistHtml = renderToStaticMarkup(
        createElement(checklistRender as never, {
          props: {
            title: 'Checks',
            items: [
              { id: 'a', label: 'Step A' },
              { id: 'b', label: 'Step B' },
            ],
            value: ['b'],
          },
          context: { componentModel: { properties: { value: ['b'] } } },
        }),
      )
      expect(checklistHtml).toContain('data-checked="true"')
      expect(checklistHtml).toContain('1 / 2')

      expect(clampRatingScore(true, 5, false)).toBe(0)
      expect(clampRatingScore('', 5, false)).toBe(0)
      const annRes = buildAnnotatedTextSegments('hello bar world', [
        { start: null, end: 5, match: 'bar', label: 'Hit' },
      ])
      const markSeg = annRes.segments.find((s) => s.kind === 'mark')
      expect(markSeg?.kind).toBe('mark')
      if (markSeg?.kind === 'mark') {
        expect(markSeg.annotation.text).toBe('bar')
        expect(markSeg.annotation.start).toBe(6)
      }
      expect(normalizeDiffAnnotations([{ line: true, message: 'bad' }])).toEqual([])
      expect(
        normalizeDiffFiles([{ path: 'a.ts', line: true, before: 'a', after: 'b' }])[0]?.line,
      ).toBeUndefined()

      const tinyScatter = buildChartOption(
        {
          kind: 'scatter',
          data: [
            { x: 0.00001, y: 1 },
            { x: 0.00002, y: 2 },
            { x: 0.00003, y: 3 },
          ],
          xField: 'x',
          yField: 'y',
          referenceX: 0.000035,
        },
        true,
        276,
      ) as Record<string, unknown>
      expect((tinyScatter.xAxis as { interval?: number }).interval).toBeGreaterThan(0)

      const negDumbbell = buildChartOption(
        {
          kind: 'dumbbell',
          data: [
            { metric: 'Delta A', before: -0.3, after: 0.4 },
            { metric: 'Delta B', before: -0.1, after: 0.2 },
          ],
          xField: 'metric',
          yField: ['before', 'after'],
        },
        true,
        276,
      ) as Record<string, unknown>
      const dbBase = (negDumbbell.series as { data: number[] }[])[0]!.data
      expect(dbBase[0]).toBe(0)
      const dbFormatter = (negDumbbell.xAxis as { axisLabel: { formatter: (v: number) => string } })
        .axisLabel.formatter
      expect(dbFormatter(0)).toBe('-0.3')

      const roseCompact = buildChartOption(
        {
          kind: 'rose',
          data: [
            { name: '深度推理', value: 42 },
            { name: '代码生成', value: 34 },
            { name: '数据分析', value: 26 },
            { name: '系统运维', value: 21 },
            { name: '文档写作', value: 15 },
          ],
        },
        true,
        276,
      ) as Record<string, unknown>
      const roseLegend = roseCompact.legend as { itemGap?: number; type?: string }
      expect(roseLegend.type).toBe('scroll')
      expect(roseLegend.itemGap ?? 0).toBeGreaterThanOrEqual(52)
    })
  })
})
