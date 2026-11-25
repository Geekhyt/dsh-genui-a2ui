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

import { readExpandedCss } from '../scripts/check-invariants.mjs'
import { resolveTableTrendPolarity, TableWidget } from '../src/client/catalog/TableWidget.tsx'
import {
  applyMarkAreaHeadroom,
  hasLabeledXMarkArea,
} from '../src/client/chunks/echarts/scale-helpers.ts'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { findDeepestFunctionCallSites } from '../src/host/depth-diagnostics.ts'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { flattenChainedCalc, preprocessExpressProgram } from '../src/shared/express-preprocess.ts'

describe('live generalization hardening: markArea headroom, calc flattening/diagnostics, and Table.lowerIsBetter', () => {
  it('computes Y-axis headroom for labeled X-axis markArea without disturbing unlabeled or Y-axis bands', () => {
    expect(hasLabeledXMarkArea(undefined)).toBe(false)
    expect(hasLabeledXMarkArea([{ start: '20:00', end: '20:30' }])).toBe(false)
    expect(hasLabeledXMarkArea([{ start: 10, end: 20, axis: 'y', label: '目标区' }])).toBe(false)
    expect(hasLabeledXMarkArea([{ start: '20:00', end: '20:30', label: '故障窗口' }])).toBe(true)

    const labeled = [{ start: '20:00', end: '20:30', label: '故障窗口', tone: 'warning' }]
    expect(applyMarkAreaHeadroom([0.3, 12, 38.6], labeled, {})).toEqual({ max: 50 })
    expect(applyMarkAreaHeadroom([0.3, 12, 38.6], labeled, { max: 80 })).toEqual({ max: 80 })
    expect(applyMarkAreaHeadroom([10, 50, 100], labeled, {}, false, true)).toEqual({ max: 150 })
    expect(applyMarkAreaHeadroom([0.3, 12, 38.6], [{ start: '20:00', end: '20:30' }], {})).toEqual(
      {},
    )
  })

  it('adds top headroom and translucent pill backdrop to labeled markArea across 276px combo, bar, range, and scatter charts', () => {
    const incidentData = [
      { t: '19:50', timeout: 0.3, p99: 420 },
      { t: '20:00', timeout: 2.1, p99: 1100 },
      { t: '20:10', timeout: 14.2, p99: 5200 },
      { t: '20:20', timeout: 38.6, p99: 12800 },
      { t: '20:30', timeout: 16.4, p99: 4900 },
      { t: '20:40', timeout: 0.6, p99: 520 },
    ]
    const markArea = [{ start: '20:00', end: '20:30', label: '故障窗口', tone: 'warning' }]

    const comboDark = buildChartOption(
      {
        kind: 'combo',
        data: incidentData,
        xField: 't',
        yField: 'timeout',
        y2Field: 'p99',
        markArea,
      },
      true,
      276,
    ) as Record<string, unknown>
    const comboYAxes = comboDark.yAxis as Array<{ max?: number }>
    expect(comboYAxes[0]?.max).toBeGreaterThanOrEqual(45)
    expect(comboYAxes[1]?.max).toBeGreaterThanOrEqual(15000)
    const comboSeries = comboDark.series as Array<{
      markArea?: {
        data?: Array<Array<{ label?: { backgroundColor?: string; padding?: unknown } }>>
      }
    }>
    const comboLabel = comboSeries[1]?.markArea?.data?.[0]?.[0]?.label
    expect(comboLabel?.backgroundColor).toContain('rgba(20, 24, 36')
    expect(comboLabel?.padding).toEqual([1, 4])

    const barLight = buildChartOption(
      {
        kind: 'bar',
        data: incidentData,
        xField: 't',
        yField: 'timeout',
        markArea,
      },
      false,
      276,
    ) as Record<string, unknown>
    expect((barLight.yAxis as { max?: number }).max).toBeGreaterThanOrEqual(45)
    const barSeries = barLight.series as Array<{
      markArea?: { data?: Array<Array<{ label?: { backgroundColor?: string } }>> }
    }>
    expect(barSeries[0]?.markArea?.data?.[0]?.[0]?.label?.backgroundColor).toContain(
      'rgba(255, 255, 255',
    )

    const pctStackBar = buildChartOption(
      {
        kind: 'bar',
        data: [
          { t: '20:00', a: 60, b: 40 },
          { t: '20:20', a: 70, b: 30 },
        ],
        xField: 't',
        yField: ['a', 'b'],
        stacked: true,
        stackMode: 'percent',
        markArea,
      },
      true,
      276,
    ) as Record<string, unknown>
    expect((pctStackBar.yAxis as { max?: number }).max).toBe(100)

    const rangeOpt = buildChartOption(
      {
        kind: 'range',
        data: [
          { t: '20:00', low: 80, mid: 100, high: 120 },
          { t: '20:20', low: 140, mid: 180, high: 200 },
          { t: '20:30', low: 90, mid: 110, high: 130 },
        ],
        xField: 't',
        yField: ['low', 'mid', 'high'],
        markArea,
      },
      true,
      276,
    ) as Record<string, unknown>
    expect((rangeOpt.yAxis as { max?: number }).max).toBeGreaterThanOrEqual(235)

    const scatterOpt = buildChartOption(
      {
        kind: 'scatter',
        data: [
          { x: 5, y: 12 },
          { x: 10, y: 38 },
          { x: 15, y: 22 },
        ],
        xField: 'x',
        yField: 'y',
        markArea: [{ start: 8, end: 12, label: '高危区', tone: 'danger' }],
      },
      true,
      276,
    ) as Record<string, unknown>
    expect((scatterOpt.yAxis as { max?: number }).max).toBeGreaterThanOrEqual(45)
  })

  it('flattens deep multi-parameter TCO calc chains beyond 520 chars so they compile on first pass', () => {
    const ui = [
      'surface("ev_vs_ice_tco")',
      '$/price = 25',
      '$/km = 15000',
      '$/homePct = 70',
      '$/eHome = 0.5',
      '$/eFast = 1.5',
      '$/cons = 15',
      '$/gasPrice = 7.5',
      '$/fuel = 7.5',
      '$/evRes = 35',
      '$/iceRes = 45',
      'v = { p: $/price, km: $/km, hp: $/homePct, eh: $/eHome, ef: $/eFast, c: $/cons, gp: $/gasPrice, f: $/fuel, er: $/evRes, ir: $/iceRes }',
      'evEnergy = calc("km / 100 * c * (hp / 100 * eh + (1 - hp / 100) * ef) * 5 / 10000", v, decimals=2)',
      'iceEnergy = calc("km / 100 * f * gp * 5 / 10000", v, decimals=2)',
      'evNet = calc("p + 1.11 + ee + 0.25 + 3.1 - p * er / 100", { p: $/price, ee: evEnergy, er: $/evRes }, decimals=2)',
      'iceNet = calc("p + 2.21 + ie + 0.9 + 2.6 - p * ir / 100", { p: $/price, ie: iceEnergy, ir: $/iceRes }, decimals=2)',
      'diffWan = calc("a - b", { a: evNet, b: iceNet }, decimals=2)',
      'absDiff = calc("abs(d)", { d: diffWan }, decimals=2)',
      'perKmEv = calc("t * 10000 / (km * 5)", { t: evNet, km: $/km }, decimals=2)',
      'summary = concat([cond(lt(diffWan, 0), "纯电 5 年省 ", "燃油 5 年省 "), formatNumber(absDiff, 2), " 万元（纯电 ", formatNumber(perKmEv, 2), " 元/km）"])',
      'root = Card(Column([Row([Stat("纯电总成本", evNet, weight=1), Stat("燃油总成本", iceNet, weight=1), Stat("差额", diffWan, weight=1)]), Text(summary)]))',
    ].join('\n')

    const flattened = flattenChainedCalc(ui)
    expect(flattened).not.toContain('{ d: diffWan }')
    expect(flattened).not.toContain('{ a: evNet, b: iceNet }')

    const sessions = new SurfaceSessions(createGenerator(), true)
    const msgs = sessions.compile('tco-session', ui)
    expect(msgs.length).toBeGreaterThan(0)
  })

  it('pinpoints exact line, variable, depth, and call chain when functionCall depth exceeds 5', () => {
    const deepUi = [
      'surface("too_deep")',
      '$/a = 1',
      '$/b = 2',
      'd1 = cond(eq($/a, 1), 10, 20)',
      'd2 = cond(gt(d1, 5), d1, 0)',
      'd3 = cond(lt(d2, 30), d2, 30)',
      'd4 = cond(gt(d3, 0), d3, 1)',
      'd5 = formatNumber(d4, 2)',
      'summary = concat(["val=", d5])',
      'root = Card(Text(summary))',
    ].join('\n')

    const cleaned = preprocessExpressProgram(deepUi)
    const sites = findDeepestFunctionCallSites(cleaned, 5)
    expect(sites.length).toBeGreaterThan(0)
    expect(sites[0]?.target).toBe('summary')
    expect(sites[0]?.depth).toBeGreaterThan(5)
    expect(sites[0]?.line).toBe(9)
    expect(sites[0]?.chain.slice(0, 3)).toEqual(['concat', 'formatNumber', 'cond'])

    const sessions = new SurfaceSessions(createGenerator(), true)
    expect(() => sessions.compile('deep-err', deepUi)).toThrow(/Culprit\(s\): line 9 `summary`/)
  })

  it('supports Table.columns[].lowerIsBetter for both delta and sparkline columns in compiler, DOM, and CSS', () => {
    expect(resolveTableTrendPolarity('up', false)).toBe('good')
    expect(resolveTableTrendPolarity('down', false)).toBe('bad')
    expect(resolveTableTrendPolarity('down', true)).toBe('good')
    expect(resolveTableTrendPolarity('up', true)).toBe('bad')
    expect(resolveTableTrendPolarity('neutral', true)).toBe('neutral')

    const sessions = new SurfaceSessions(createGenerator(), true)
    const ui = [
      'surface("cost_delta_table")',
      '$/rows = [{ item: "能源费", diff: "-3.32", trend: [890, 620, 410] }, { item: "保险", diff: "+0.50", trend: [210, 240, 260] }]',
      'root = Card(Table($/rows, columns=[{ key: "item", label: "费用项" }, { key: "diff", label: "差额", format: "delta", lowerIsBetter: true }, { key: "trend", label: "走势", format: "sparkline", lowerIsBetter: true }]))',
    ].join('\n')
    const msgs = sessions.compile('delta-session', ui)
    expect(msgs.length).toBeGreaterThan(0)

    const html = renderToStaticMarkup(
      createElement(TableWidget, {
        rows: [
          { item: '能源费', diff: '-3.32', revDelta: '+12.5%', latTrend: [890, 620, 410] },
          { item: '保险', diff: '+0.50', revDelta: '-4.2%', latTrend: [210, 240, 260] },
        ],
        columns: [
          { key: 'item', label: '费用项' },
          { key: 'diff', label: '成本差额', format: 'delta', lowerIsBetter: true },
          { key: 'revDelta', label: '营收增幅', format: 'delta' },
          { key: 'latTrend', label: 'P95 走势', format: 'sparkline', lowerIsBetter: true },
        ],
      }),
    )

    expect(html).toContain('data-dir="down" data-invert="true">-3.32')
    expect(html).toContain('data-dir="up" data-invert="true">+0.50')
    expect(html).toContain('data-dir="up">+12.5%')
    expect(html).toContain('data-dir="down">-4.2%')
    expect(html).toContain('aria-label="890, 620, 410"><path')
    expect(html).toContain('stroke="var(--dsw-alias-state-success-primary, #10b981)"')
    expect(html).toContain('stroke="var(--dsw-alias-state-error-primary, #ef4444)"')

    const expandedCss = readExpandedCss(
      resolve(import.meta.dirname, '..', 'src/client/catalog/Catalog.module.css'),
    )
    expect(expandedCss).toContain('.tableDeltaCell[data-dir="down"][data-invert="true"]')
    expect(expandedCss).toContain('.tableDeltaCell[data-dir="up"][data-invert="true"]')
  })
})
