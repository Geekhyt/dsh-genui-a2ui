import { readExpandedCss } from '../scripts/check-invariants.mjs'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AgentToRendererMessage } from '@a2ui/agent'
import { createElement, Fragment, type ReactElement } from 'react'
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
import {
  computeCond,
  evaluateNumericValue,
  evaluateRequiredValue,
  LocaleFormatCurrencyImplementation,
  LocaleFormatNumberImplementation,
} from '../src/client/catalog/functions.ts'
import { DshProgressImpl } from '../src/client/catalog/MediaAndDataWidgets.tsx'
import {
  DshDateRangeImpl,
  DshNumberInputImpl,
} from '../src/client/catalog/widgets/AdvancedPickers.tsx'
import { DshApprovalCardImpl } from '../src/client/catalog/widgets/DevOpsActionWidgets.tsx'
import {
  DshButtonView,
  DshChoicePickerImpl,
  DshDateTimeInputImpl,
} from '../src/client/catalog/widgets/FormFields.tsx'
import {
  DshEntityHeaderImpl,
  DshResultImpl,
} from '../src/client/catalog/widgets/PlanningAndMatrixWidgets.tsx'
import { DshSegmentedView } from '../src/client/catalog/widgets/SelectControls.tsx'
import {
  DshCheckCardImpl,
  DshTreeSelectImpl,
} from '../src/client/catalog/widgets/TreeAndCardPickers.tsx'
import { normalizeFileEntries } from '../src/client/catalog/stat-file-helpers.ts'
import {
  buildEndpointCurl,
  computeNextCrossFilterValue,
  detectNumericColumnKeys,
  filterTableRowsByField,
  formatChartDataToCsv,
  normalizeCrossFilterTokens,
  normalizeMatrixData,
  normalizeScheduleItems,
} from '../src/client/catalog/v4-helpers.ts'
import {
  buildDatePresetRange,
  computeDateRangeSpanDays,
  normalizeHierarchyTree,
} from '../src/client/catalog/v5-helpers.ts'
import {
  ModalCloseContext,
  ModalOpenContext,
  ModalTriggerContext,
  runSurfaceAction,
  SurfaceValidationContext,
  weightStyle,
} from '../src/client/catalog/widget-helpers.tsx'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { repairMermaidSource } from '../src/client/mermaid-safe.ts'
import { escapeJsonPointerSegment, sanitizeDataModel } from '../src/client/persistence.ts'
import { SurfaceSessionStore } from '../src/client/runtime/SurfaceView.tsx'
import {
  A2UI_SURFACE_NODE_KIND,
  buildReplayMessagesForSurfaceCall,
  type ChatTargetSnapshot,
  resolveTurnTailBatch,
} from '../src/client/shell/turn-surfaces.ts'
import { DshTooltip } from '../src/client/ui/primitives.tsx'
import {
  collectObscuredContextPointersFromMessages,
  collectObscuredPointersFromMessages,
  sanitizePayloadObject,
} from '../src/host/ask-tool.ts'
import { SurfaceSessions } from '../src/host/generator.ts'
import { DSH_CATALOG_ID } from '../src/shared/catalog-schema.ts'
import {
  expandDateRangeShorthandChecks,
  preprocessExpressProgram,
} from '../src/shared/express-preprocess.ts'

describe('Composition Audit v0.4.6 Generalized Fixes (G1–G8)', () => {
  it('G1: enforces CSS non-collapse contract, child-axis flex-basis, z-index tokens, and weightStyle guards', () => {
    expect(weightStyle(undefined)).toBeUndefined()
    expect(weightStyle(0)).toBeUndefined()
    expect(weightStyle(-2)).toBeUndefined()
    expect(weightStyle(Number.NaN)).toBeUndefined()
    expect(weightStyle(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(weightStyle(1, 220)).toEqual({
      flexGrow: 1,
      flexBasis: 'var(--a2ui-flex-basis, auto)',
      minWidth: 'min(100%, 220px)',
    })

    const catalogCss = readExpandedCss(
      resolve(import.meta.dirname, '../src/client/catalog/Catalog.module.css'),
    )
    expect(catalogCss).toContain(':where(')
    expect(catalogCss).toContain('.responsiveGrid[data-columns="3"]')
    expect(catalogCss).toContain('.checkCardGrid[data-columns="3"]')
    expect(catalogCss).toContain('.kvCell[data-kv-span="3"]')
    expect(catalogCss).toContain('.entityStatusPill')
    expect(catalogCss).toContain('.scheduleBarProgress')
    expect(catalogCss).toContain('.apiMethodBadge[data-method="GET"]')
    expect(catalogCss).toContain(':is(.row, .listHorizontal) > .statCard')
    expect(catalogCss).toContain('flex: 1 1 min(100%, 140px)')
    expect(catalogCss).toContain('.tabsHeaderScroll')

    const surfaceCss = readFileSync(
      resolve(import.meta.dirname, '../src/client/SurfaceView.module.css'),
      'utf8',
    )
    expect(surfaceCss).toContain('--a2ui-z-popover')
    expect(surfaceCss).toContain('--a2ui-z-modal')
    expect(surfaceCss).toContain('--a2ui-z-fullscreen')
  })

  it('G2: protects Modal triggers on invalid form, keeps Modal open on local CopyText, avoids tooltip wrapper spans, and tracks action status', async () => {
    let modalClosed = 0
    let localCopied = 0
    renderToStaticMarkup(
      createElement(
        ModalCloseContext.Provider,
        {
          value: () => {
            modalClosed += 1
          },
        },
        createElement(function LocalCopyInModalProbe() {
          const el = DshButtonView({
            props: {
              child: 'lbl',
              action: () => {
                localCopied += 1
              },
            },
            buildChild: () => '复制',
            context: {
              componentModel: {
                properties: {
                  action: { functionCall: { call: 'copyText', args: { text: 'hello' } } },
                },
              },
            },
          }) as ReactElement<{ onClick?: () => void }>
          el.props.onClick?.()
          return el
        }),
      ),
    )
    expect(localCopied).toBe(1)
    expect(modalClosed).toBe(0)

    let modalOpened = 0
    let submitMarked = 0
    renderToStaticMarkup(
      createElement(
        ModalTriggerContext.Provider,
        { value: true },
        createElement(
          ModalOpenContext.Provider,
          {
            value: () => {
              modalOpened += 1
            },
          },
          createElement(
            SurfaceValidationContext.Provider,
            {
              value: {
                submitAttempted: false,
                markSubmitAttempted: () => {
                  submitMarked += 1
                },
              },
            },
            createElement(function InvalidTriggerProbe() {
              const el = DshButtonView({
                props: {
                  child: 'lbl',
                  isValid: false,
                  validationErrors: ['必填'],
                },
                buildChild: () => '打开确认弹窗',
              }) as ReactElement<{
                onClick?: () => void
                children?: ReactElement<{ onClick?: () => void }>
              }>
              ;(el.props.onClick ?? el.props.children?.props.onClick)?.()
              return el
            }),
          ),
        ),
      ),
    )
    expect(modalOpened).toBe(0)
    expect(submitMarked).toBe(1)

    const tooltipHtml = renderToStaticMarkup(
      createElement(DshTooltip, {
        label: '提示文案',
        children: createElement('button', { type: 'button', className: 'direct-btn' }, 'Btn'),
      }),
    )
    expect(tooltipHtml.startsWith('<button')).toBe(true)
    expect(tooltipHtml).toContain('title="提示文案"')

    const fragTooltipHtml = renderToStaticMarkup(
      createElement(DshTooltip, {
        label: '片段提示',
        children: createElement(Fragment, null, 'Text'),
      }),
    )
    expect(fragTooltipHtml).toContain('title="片段提示"')

    let status = { seq: 0, ok: true }
    expect(
      await runSurfaceAction(
        async () => {
          status = { seq: 1, ok: false }
        },
        () => status,
      ),
    ).toBe(false)
    expect(
      await runSurfaceAction(
        async () => {
          status = { seq: 2, ok: true }
        },
        () => status,
      ),
    ).toBe(true)
    expect(await runSurfaceAction(() => false, null)).toBe(false)
    expect(
      await runSurfaceAction(() => {
        throw new Error('boom')
      }, null),
    ).toBe(false)
  })

  it('G3: fixes required/numeric/cond/formatNumber, express preprocessor edge cases, DateRange check expansion, and input defaults', () => {
    expect(evaluateRequiredValue(null).valid).toBe(false)
    expect(evaluateRequiredValue(undefined).valid).toBe(false)
    expect(evaluateRequiredValue('').valid).toBe(false)
    expect(evaluateRequiredValue('   ').valid).toBe(false)
    expect(evaluateRequiredValue(false).valid).toBe(false)
    expect(evaluateRequiredValue([]).valid).toBe(false)
    expect(evaluateRequiredValue(Number.NaN).valid).toBe(false)
    expect(evaluateRequiredValue(0).valid).toBe(true)
    expect(evaluateRequiredValue(true).valid).toBe(true)
    expect(evaluateRequiredValue(['a']).valid).toBe(true)

    expect(evaluateNumericValue('').valid).toBe(false)
    expect(evaluateNumericValue('   ').valid).toBe(false)
    expect(evaluateNumericValue('abc').valid).toBe(false)
    expect(evaluateNumericValue('150', 0, 100).valid).toBe(false)
    expect(evaluateNumericValue('42.5', 0, 100).valid).toBe(true)
    expect(evaluateNumericValue(0, 0, 100).valid).toBe(true)

    expect(computeCond({ valid: false }, 'OK', 'ERR')).toBe('ERR')
    expect(computeCond({ valid: true }, 'OK', 'ERR')).toBe('OK')
    expect(computeCond(false, 'OK', 'ERR')).toBe('ERR')

    const numFn = LocaleFormatNumberImplementation.execute as (
      args: Record<string, unknown>,
    ) => string
    const curFn = LocaleFormatCurrencyImplementation.execute as (
      args: Record<string, unknown>,
    ) => string
    expect(numFn({ value: '' })).toBe('')
    expect(numFn({ value: null })).toBe('')
    expect(numFn({ value: '1234.5', decimals: 1 })).toContain('1,234.5')
    expect(curFn({ value: '', currency: 'CNY' })).toBe('')

    const expanded = expandDateRangeShorthandChecks(
      'DateRange(start=$/range/start, end=$/range/end, ?required("请选择发布时间窗"))',
    )
    expect(expanded).toContain('?and([required($/range/start), required($/range/end)]')

    const withComment = preprocessExpressProgram(
      'surface("s")\n$/x = 10\nText("a" + "b") // trailing note\n',
    )
    expect(withComment).toContain('// trailing note')

    const nonCanon = preprocessExpressProgram(
      'surface("s")\n$/k = "01"\nText(cond(eq($/k, "01"), "ZeroOne", cond(eq($/k, "1.0"), "OneZero", "Other")))\n',
    )
    expect(nonCanon).not.toContain('lookup(')

    const reorderedCalc = preprocessExpressProgram(
      'surface("s")\n$/a = 10\nText(calc(decimals=2, vars={ x: $/a }, expr="x * 1.5"))\n',
    )
    expect(reorderedCalc).toContain('calc(')

    const sessions = new SurfaceSessions()
    expect(() =>
      sessions.compile(
        's-bad',
        'surface("bad_req")\nroot = Button(child=Text("提交"), action=Event("go"), ?required("请先填写"))\n',
      ),
    ).toThrow()

    const goodDrMsgs = sessions.compile(
      's-good',
      'surface("good_dr")\n$/r/s = ""\n$/r/e = ""\nroot = DateRange(start=$/r/s, end=$/r/e, ?required("请选择窗口"))\n',
    )
    expect(goodDrMsgs.length).toBeGreaterThan(0)

    const choiceRender = (
      DshChoicePickerImpl as unknown as { rawRender: (p: unknown) => ReactElement }
    ).rawRender
    const choiceHtml = renderToStaticMarkup(
      createElement(choiceRender as never, {
        props: {
          label: '模式',
          options: [
            { label: '金丝雀', value: 'canary' },
            { label: '蓝绿', value: 'blue' },
          ],
          value: ['canary'],
        },
      }),
    )
    expect(choiceHtml).toContain('role="radiogroup"')

    const dtRender = (
      DshDateTimeInputImpl as unknown as { rawRender: (p: unknown) => ReactElement }
    ).rawRender
    const dtHtml = renderToStaticMarkup(
      createElement(dtRender as never, {
        props: { label: '触发时间', value: '09:30', enableTime: true },
      }),
    )
    expect(dtHtml).toContain('type="time"')

    const segHtml = renderToStaticMarkup(
      createElement(DshSegmentedView, {
        props: {
          value: '',
          options: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
          ],
        },
      }),
    )
    expect(segHtml).not.toContain('aria-pressed="true"')
    expect(segHtml).not.toContain('aria-selected="true"')

    const numRender = (DshNumberInputImpl as unknown as { rawRender: (p: unknown) => ReactElement })
      .rawRender
    const numHtml = renderToStaticMarkup(
      createElement(numRender as never, {
        props: { label: '副本数', value: undefined },
      }),
    )
    expect(numHtml).toContain('value=""')

    expect(computeDateRangeSpanDays('2026-11-20', '2026-11-10')).toBeNull()
    const todayRange = buildDatePresetRange(1, true, '2026-11-21T14:30')
    expect(todayRange.start).toBe('2026-11-21T00:00')
    expect(todayRange.end).toBe('2026-11-21T23:59')

    const treeNodes = normalizeHierarchyTree([
      {
        id: 'root',
        value: 'root-val',
        label: 'Root Group',
        children: [{ id: 'child', value: 'child-val', label: 'Child Leaf' }],
      },
      {
        id: 'folder',
        label: 'No Value Folder',
        children: [{ id: 'c2', value: 'c2', label: 'Leaf 2' }],
      },
    ])
    expect(treeNodes[0]?.hasExplicitValue).toBe(true)
    expect(treeNodes[1]?.hasExplicitValue).toBe(false)

    const tsRender = (DshTreeSelectImpl as unknown as { rawRender: (p: unknown) => ReactElement })
      .rawRender
    const tsHtml = renderToStaticMarkup(
      createElement(tsRender as never, {
        props: {
          label: '团队',
          nodes: [{ id: 'n1', value: 'n1', label: '核心平台' }],
          value: '',
          isValid: false,
          validationErrors: ['必选'],
        },
      }),
    )
    expect(tsHtml).toContain('data-placeholder="true"')

    const drRender = (DshDateRangeImpl as unknown as { rawRender: (p: unknown) => ReactElement })
      .rawRender
    expect(
      renderToStaticMarkup(
        createElement(drRender as never, {
          props: { start: '2026-11-10', end: '2026-11-12', label: '窗口' },
        }),
      ),
    ).toContain('2026-11-10')

    const ccRender = (DshCheckCardImpl as unknown as { rawRender: (p: unknown) => ReactElement })
      .rawRender
    expect(
      renderToStaticMarkup(
        createElement(ccRender as never, {
          props: { options: [{ title: 'A', value: 'a' }], value: 'a' },
        }),
      ),
    ).toContain('data-a2ui-checkcard')
  })

  it('G4: supports array cross-filtering, centered numeric table summaries, high-SLA progress, file paths, and graph/sankey CSV', () => {
    expect(normalizeCrossFilterTokens(['华东', '华北'])).toEqual(['华东', '华北'])
    expect(computeNextCrossFilterValue(['华东'], '华北')).toEqual(['华东', '华北'])
    expect(computeNextCrossFilterValue(['华东', '华北'], '华东')).toEqual(['华北'])

    const rows = [
      { region: '华东', qps: '12,400' },
      { region: '华北', qps: '9,800' },
      { region: '华南', qps: '7,200' },
    ]
    expect(filterTableRowsByField(rows, 'region', ['华东', '华南'])).toHaveLength(2)

    const numCols = detectNumericColumnKeys(
      [
        { key: 'region', align: 'left' },
        { key: 'qps', align: 'center' },
        { key: 'date', align: 'center' },
      ],
      [
        { region: '华东', qps: '12,400', date: '2026-11-21' },
        { region: '华北', qps: '9,800', date: '2026-11-22' },
      ],
    )
    expect(numCols.has('qps')).toBe(true)
    expect(numCols.has('region')).toBe(false)
    expect(numCols.has('date')).toBe(false)

    const progRender = (DshProgressImpl as unknown as { rawRender: (p: unknown) => ReactElement })
      .rawRender
    const progHtml = renderToStaticMarkup(
      createElement(progRender as never, {
        props: { label: 'SLA', value: 99.95, max: 100 },
      }),
    )
    expect(progHtml).toContain('99.95%')
    const lowProgHtml = renderToStaticMarkup(
      createElement(progRender as never, {
        props: { label: 'Cold', value: 0.4, max: 100 },
      }),
    )
    expect(lowProgHtml).toContain('0.4%')

    const files = normalizeFileEntries([{ path: '/src/app.ts' }, { path: './src/b.ts' }])
    expect(files[0]?.path).toBe('/src/app.ts')
    expect(files[1]?.path).toBe('src/b.ts')

    const csv = formatChartDataToCsv({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ source: 'a', target: 'b', value: 42 }],
    })
    expect(csv).toContain('source,target,value')
    expect(csv).toContain('a,b,42')
  })

  it('G5 & G6: fixes 19-kind ECharts at 276px (gauge/heatmap/radar/waterfall/sankey/scatter/calendar/graph) and Mermaid paren repair', () => {
    const gaugeOpt = buildChartOption(
      {
        kind: 'gauge',
        data: [{ label: 'SLO 达标', value: 72, max: 100 }],
      },
      true,
      276,
    ) as { series: Array<{ max: number; data: Array<{ value: number; name: string }> }> }
    expect(gaugeOpt.series[0]?.data[0]?.value).toBe(72)
    expect(gaugeOpt.series[0]?.max).toBe(100)

    const hmOpt = buildChartOption(
      {
        kind: 'heatmap',
        data: [
          { day: 'Mon', hour: 0, errors: 2 },
          { day: 'Mon', hour: 6, errors: 5 },
          { day: 'Tue', hour: 12, errors: 9 },
        ],
        xField: 'day',
        yField: 'hour',
        sizeField: 'errors',
      },
      true,
      276,
    ) as { yAxis: { data: string[] } }
    expect(hmOpt.yAxis.data).toEqual(['0', '6', '12'])

    const radarOpt = buildChartOption(
      {
        kind: 'radar',
        data: [
          { metric: '吞吐', model: 'v1', score: 78 },
          { metric: '延迟', model: 'v1', score: 85 },
          { metric: '吞吐', model: 'v2', score: 92 },
          { metric: '延迟', model: 'v2', score: 91 },
        ],
        xField: 'metric',
        yField: 'score',
        seriesField: 'model',
        selected: ['v2'],
      },
      true,
      276,
    ) as { series: Array<{ data: Array<{ name: string; lineStyle?: { opacity?: number } }> }> }
    expect(radarOpt.series[0]?.data).toHaveLength(2)
    const v1 = radarOpt.series[0]?.data.find((d) => d.name === 'v1')
    const v2 = radarOpt.series[0]?.data.find((d) => d.name === 'v2')
    expect(v2?.lineStyle?.opacity).toBe(1)
    expect(v1?.lineStyle?.opacity).toBeLessThan(0.5)

    const wfOpt = buildChartOption(
      {
        kind: 'waterfall',
        data: [
          { step: '期初', delta: 40 },
          { step: '扩容', delta: -85 },
          { step: '净额', isTotal: true },
        ],
        xField: 'step',
        yField: 'delta',
      },
      true,
      276,
    ) as {
      yAxis: { min?: number }
      series: Array<{ label?: { position?: string }; data: unknown[] }>
    }
    expect(wfOpt.series[1]?.label?.position).toBe('bottom')
    expect(wfOpt.yAxis.min).toBeLessThan(-45)

    const sankeyOpt = buildChartOption(
      {
        kind: 'sankey',
        data: {
          nodes: [{ name: '入口' }, { name: '网关' }, { name: '落库' }],
          links: [
            { source: '入口', target: '网关', value: 100 },
            { source: '网关', target: '落库', value: 80 },
          ],
        },
      },
      true,
      276,
    ) as {
      series: Array<{
        data?: Array<{ name?: string; label?: { color?: string; textBorderWidth?: number } }>
      }>
    }
    const leafNode = sankeyOpt.series[0]?.data?.find((n) => n.name === '落库')
    expect(leafNode?.label?.color).toBeTruthy()
    expect(leafNode?.label?.textBorderWidth).toBe(2)

    const scatterOpt = buildChartOption(
      {
        kind: 'scatter',
        data: [
          { service: 'auth', p99: 42, qps: 1200 },
          { service: 'pay', p99: 118, qps: 680 },
        ],
        xField: 'p99',
        yField: 'qps',
        selected: ['auth'],
      },
      true,
      276,
    ) as { series: Array<{ data: Array<{ name?: string; itemStyle?: { opacity?: number } }> }> }
    expect(scatterOpt.series[0]?.data[0]?.name).toBe('auth')
    expect(scatterOpt.series[0]?.data[0]?.itemStyle?.opacity).toBe(1)
    expect(scatterOpt.series[0]?.data[1]?.itemStyle?.opacity).toBeLessThan(0.5)

    const calOpt = buildChartOption(
      {
        kind: 'calendar',
        data: [
          { date: '2026-11-01', count: 5 },
          { date: '2026-11-01', count: 7 },
          { date: '2026-11-02', count: 3 },
        ],
        selected: ['2026-11-01'],
      },
      true,
      276,
    ) as {
      series: Array<{ data: Array<{ value: [string, number]; itemStyle?: { opacity?: number } }> }>
    }
    expect(calOpt.series[0]?.data[0]?.value).toEqual(['2026-11-01', 12])
    expect(calOpt.series[0]?.data[0]?.itemStyle?.opacity).toBe(1)
    expect(calOpt.series[0]?.data[1]?.itemStyle?.opacity).toBeLessThan(0.5)

    const graphOpt = buildChartOption(
      {
        kind: 'graph',
        data: {
          nodes: [
            { id: 'svc_a', name: '鉴权服务' },
            { id: 'svc_b', name: '支付网关' },
          ],
          edges: [{ source: 'svc_a', target: 'svc_b', label: 'gRPC' }],
        },
        selected: 'svc_a',
      },
      true,
      276,
    ) as { series: Array<{ data: Array<{ id?: string; itemStyle?: { opacity?: number } }> }> }
    expect(graphOpt.series[0]?.data[0]?.itemStyle?.opacity).toBe(1)
    expect(graphOpt.series[0]?.data[1]?.itemStyle?.opacity).toBeLessThan(0.5)

    const singleGaugeOpt = buildChartOption(
      {
        kind: 'gauge',
        data: { label: 'Mem', value: 64, max: 100 },
      },
      true,
      276,
    ) as { series: Array<{ data: Array<{ value: number }> }> }
    expect(singleGaugeOpt.series[0]?.data[0]?.value).toBe(64)

    const edgesSankeyOpt = buildChartOption(
      {
        kind: 'sankey',
        data: { edges: [{ source: 'A', target: 'B', value: 12 }] },
      },
      true,
      276,
    ) as { series: Array<{ links: unknown[] }> }
    expect(edgesSankeyOpt.series[0]?.links).toHaveLength(1)

    const edgesGraphOpt = buildChartOption(
      {
        kind: 'graph',
        data: { edges: [{ source: 'X', target: 'Y' }] },
      },
      true,
      276,
    ) as { series: Array<{ data: unknown[]; links: unknown[] }> }
    expect(edgesGraphOpt.series[0]?.data).toHaveLength(2)
    expect(edgesGraphOpt.series[0]?.links).toHaveLength(1)

    const repaired = repairMermaidSource(
      'flowchart TD\n  A[用户 (管理员)] --> B["已引号 (保留)"]\n  B --> C{审核 (高风险)}\n',
    )
    expect(repaired).toContain('A["用户 (管理员)"]')
    expect(repaired).toContain('B["已引号 (保留)"]')
    expect(repaired).toContain('C{"审核 (高风险)"}')

    const mermaidChunkSrc = readFileSync(
      resolve(import.meta.dirname, '../src/client/chunks/mermaid-chunk.ts'),
      'utf8',
    )
    expect(mermaidChunkSrc).toContain("taskTextDarkColor: '#ffffff'")
  })

  it('G7: fixes overnight Schedule range+now, high-SLA Matrix precision, ApiEndpoint curl dedup, Result/EntityHeader default CTA', () => {
    const sched = normalizeScheduleItems(
      [
        { title: '预检', start: '22:30', end: '23:45', status: 'done' },
        { title: '跨零点切换', start: '23:30', end: '02:00', status: 'active' },
      ],
      ['22:00', '04:00'],
      '00:30',
    )
    expect(sched.nowPct).not.toBeNull()
    expect(sched.nowPct!).toBeGreaterThan(35)
    expect(sched.nowPct!).toBeLessThan(50)
    expect(sched.tracks[1]?.widthPct).toBeGreaterThan(30)

    const matrix = normalizeMatrixData({
      rows: ['支付', '登录'],
      columns: ['华东', '华北'],
      values: [
        [99.95, 0.03],
        [99.995, 100],
      ],
      unit: '%',
    })
    expect(matrix.cells[0]?.[0]?.display).toBe('99.95%')
    expect(matrix.cells[0]?.[1]?.display).toBe('0.03%')

    const curl = buildEndpointCurl({
      method: 'POST',
      path: '/v1/deploy',
      headers: [{ name: 'content-type', value: 'application/merge-patch+json' }],
      requestBody: { rev: 2 },
    })
    expect(curl.match(/content-type/gi)?.length).toBe(1)

    const resultRender = (DshResultImpl as unknown as { rawRender: (p: unknown) => ReactElement })
      .rawRender
    const resultHtml = renderToStaticMarkup(
      createElement(resultRender as never, {
        props: { status: 'success', title: '完成', action: async () => {} },
      }),
    )
    expect(resultHtml).toContain('<button')

    const ehRender = (DshEntityHeaderImpl as unknown as { rawRender: (p: unknown) => ReactElement })
      .rawRender
    const ehHtml = renderToStaticMarkup(
      createElement(ehRender as never, {
        props: { title: 'Order API', status: '健康', action: async () => {} },
      }),
    )
    expect(ehHtml).toContain('<button')

    const apRender = (DshApprovalCardImpl as unknown as { rawRender: (p: unknown) => ReactElement })
      .rawRender
    expect(
      renderToStaticMarkup(
        createElement(apRender as never, {
          props: { title: '发布审批', approveAction: async () => false },
        }),
      ),
    ).toContain('data-a2ui-approval')
  })

  it('G8: redacts renamed obscured context keys & RFC 6901 pointers, scopes per-surface replay, and tracks partial superseding & action status', async () => {
    const askMessages: AgentToRendererMessage[] = [
      {
        version: '1.0',
        createSurface: {
          surfaceId: 's_sec',
          catalogId: 'dsh-a2ui:v1',
          components: [
            {
              id: 'pin',
              component: 'TextField',
              variant: 'obscured',
              value: { path: '/auth/pin~1/code' },
            },
            {
              id: 'btn',
              component: 'Button',
              child: 'lbl',
              action: {
                event: {
                  name: 'verify',
                  context: {
                    entered: { path: '/auth/pin~1/code' },
                    safe: { path: '/auth/user' },
                  },
                },
              },
            },
          ],
        },
      } as unknown as AgentToRendererMessage,
    ]
    const obs = collectObscuredPointersFromMessages(askMessages)
    const obsCtx = collectObscuredContextPointersFromMessages(askMessages, obs)
    expect(obsCtx.has('/entered')).toBe(true)
    const cleanCtx = sanitizePayloadObject({ entered: '9988', safe: 'alice' }, obsCtx)
    expect(cleanCtx).toEqual({ safe: 'alice' })

    expect(escapeJsonPointerSegment('a/b~c')).toBe('a~1b~0c')
    const cleanModel = sanitizeDataModel(
      { 'a/b': { 'x~y': 'secret', keep: 'ok' } },
      new Set(['/a~1b/x~0y']),
    )
    expect(cleanModel).toEqual({ 'a/b': { keep: 'ok' } })

    const makeCallNode = (
      callId: string,
      turn: number,
      seq: number,
      placement: 'answer' | 'dock',
      surfaceIds: string[],
      messages: AgentToRendererMessage[],
    ) => ({
      kind: A2UI_SURFACE_NODE_KIND,
      id: callId,
      anchorSeq: seq,
      location: { turn: { turn, status: 'closed' } },
      data: { callId, turn, seq, title: null, placement, surfaceIds, messages },
    })

    const mCreate1 = {
      version: '1.0',
      createSurface: { surfaceId: 's1', catalogId: 'c' },
    } as unknown as AgentToRendererMessage
    const mCreate2 = {
      version: '1.0',
      createSurface: { surfaceId: 's2', catalogId: 'c' },
    } as unknown as AgentToRendererMessage
    const mUpdate2 = {
      version: '1.0',
      updateDataModel: { surfaceId: 's2', path: '/v', value: 2 },
    } as unknown as AgentToRendererMessage
    const mFuture2 = {
      version: '1.0',
      updateDataModel: { surfaceId: 's2', path: '/v', value: 3 },
    } as unknown as AgentToRendererMessage

    const snap: ChatTargetSnapshot = {
      nodes: {
        values: () => [
          makeCallNode('c1', 1, 10, 'answer', ['s1', 's2'], [mCreate1, mCreate2]),
          makeCallNode('c2', 2, 20, 'answer', ['s2'], [mUpdate2]),
          makeCallNode('c3', 3, 30, 'answer', ['s2'], [mFuture2]),
        ],
      },
    }

    const replayedC2 = buildReplayMessagesForSurfaceCall(snap, [mUpdate2], ['s2'], 20)
    expect(replayedC2).toEqual([mCreate2, mUpdate2])

    const turn1 = resolveTurnTailBatch(snap, 1)
    expect(turn1?.superseded).toBe(true)
    expect(turn1?.allSuperseded).toBe(false)
    expect(turn1?.supersededSurfaceIds.has('s2')).toBe(true)
    expect(turn1?.supersededSurfaceIds.has('s1')).toBe(false)

    const mDockCreate = {
      version: '1.0',
      createSurface: { surfaceId: 'sd', catalogId: 'c' },
    } as unknown as AgentToRendererMessage
    const mDockDel = {
      version: '1.0',
      deleteSurface: { surfaceId: 'sd' },
    } as unknown as AgentToRendererMessage
    const dockRecreateSnap: ChatTargetSnapshot = {
      nodes: {
        values: () => [
          makeCallNode('d1', 1, 1, 'dock', ['sd'], [mDockCreate]),
          makeCallNode('d2', 1, 2, 'dock', ['sd'], [mDockDel]),
          makeCallNode('a1', 2, 3, 'answer', ['sd'], [mDockCreate]),
        ],
      },
    }
    const turn2 = resolveTurnTailBatch(dockRecreateSnap, 2)
    expect(turn2?.visibleSurfaceIds.has('sd')).toBe(true)

    const store = new SurfaceSessionStore()
    const baseMsgs: AgentToRendererMessage[] = [
      {
        version: '1.0',
        createSurface: {
          surfaceId: 's_act',
          catalogId: DSH_CATALOG_ID,
          components: [{ id: 'root', component: 'Text', text: 'Hi' }],
        },
      } as unknown as AgentToRendererMessage,
    ]
    store.reconcile(baseMsgs, {
      streaming: false,
      readOnly: false,
      sessionId: undefined,
      fingerprint: '',
      visibleSurfaceIds: undefined,
      onAction: async () => false,
      skipDraftIo: true,
    })
    const gen0 = store.generation
    const extendedMsgs: AgentToRendererMessage[] = [
      ...baseMsgs,
      {
        version: '1.0',
        updateComponents: {
          surfaceId: 's_act',
          components: [{ id: 'root', component: 'Text', text: 'Step 2' }],
        },
      } as unknown as AgentToRendererMessage,
    ]
    store.reconcile(extendedMsgs, {
      streaming: false,
      readOnly: false,
      sessionId: undefined,
      fingerprint: '',
      visibleSurfaceIds: undefined,
      onAction: async () => false,
      skipDraftIo: true,
    })
    expect(store.generation).toBe(gen0 + 1)

    const surf = store.processor.getSurfaces().get('s_act')
    expect(surf).toBeDefined()
    const before = store.getActionStatus()
    await surf!.dispatchAction({ event: { name: 'submit' } }, 'root')
    const afterFail = store.getActionStatus()
    expect(afterFail.seq).toBe(before.seq + 1)
    expect(afterFail.ok).toBe(false)
  })
})
