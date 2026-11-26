import { resolve } from 'node:path'
import { Window } from 'happy-dom'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
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
import { DshTabsImpl } from '../src/client/catalog/LayoutWidgets.tsx'
import { computeMetricRingGeometry } from '../src/client/catalog/v3-helpers.ts'
import {
  normalizeCategorySegments,
  stripRedundantTrailingPct,
} from '../src/client/catalog/v4-helpers.ts'
import { DshTrackerImpl } from '../src/client/catalog/widgets/DevOpsActionWidgets.tsx'
import { DshMetricRingImpl } from '../src/client/catalog/widgets/TelemetryVisualWidgets.tsx'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { SKILL_PREAMBLE } from '../src/index.ts'

const renderOf = (comp: unknown) => (comp as { rawRender: never }).rawRender
const dummyCtx = {
  surfaceId: 's_live_fix',
  componentId: 'c_live_fix',
  dataContextPath: '/',
  buildChild: () => null,
}

describe('live generalization QA fixes: MetricRing.higherIsBetter, Tracker pct dedup, Tabs scroll fade, and SKILL_PREAMBLE', () => {
  it('supports MetricRing higherIsBetter with tone="auto" in geometry helper, compiler, and DOM', () => {
    expect(computeMetricRingGeometry({ value: 100, max: 100, tone: 'auto' }).resolvedTone).toBe(
      'danger',
    )
    expect(
      computeMetricRingGeometry({ value: 100, max: 100, tone: 'auto', higherIsBetter: true })
        .resolvedTone,
    ).toBe('success')
    expect(
      computeMetricRingGeometry({ value: 76, max: 100, tone: 'auto', higherIsBetter: true })
        .resolvedTone,
    ).toBe('warning')
    expect(
      computeMetricRingGeometry({ value: 45, max: 100, tone: 'auto', higherIsBetter: true })
        .resolvedTone,
    ).toBe('danger')

    const sessions = new SurfaceSessions(createGenerator(), true)
    const ui = [
      'surface("solar_payback_ring")',
      'root = Card(Row([MetricRing("10 年投资回收进度", 100, unit="%", tone="auto", higherIsBetter=true, weight=1), MetricRing("CPU 水位", 92, unit="%", tone="auto", weight=1)]))',
    ].join('\n')
    expect(sessions.compile('ring-session', ui).length).toBeGreaterThan(0)

    const positiveHtml = renderToStaticMarkup(
      createElement(renderOf(DshMetricRingImpl), {
        ...dummyCtx,
        props: {
          label: '10 年投资回收进度',
          value: 100,
          unit: '%',
          tone: 'auto',
          higherIsBetter: true,
        },
      }),
    )
    const utilizationHtml = renderToStaticMarkup(
      createElement(renderOf(DshMetricRingImpl), {
        ...dummyCtx,
        props: { label: 'CPU 水位', value: 100, unit: '%', tone: 'auto' },
      }),
    )
    expect(positiveHtml).toContain('data-tone="success"')
    expect(utilizationHtml).toContain('data-tone="danger"')
  })

  it('strips redundant trailing percentages in Tracker category segments without harming distinct labels', () => {
    expect(stripRedundantTrailingPct('电商快递 62%', 62)).toBe('电商快递')
    expect(stripRedundantTrailingPct('跨境专线（18.0%）', 18)).toBe('跨境专线')
    expect(stripRedundantTrailingPct('同城即时 · 4.5%', 4.5)).toBe('同城即时')
    expect(stripRedundantTrailingPct('营收占比 - 12%', 12)).toBe('营收占比')
    expect(stripRedundantTrailingPct('营收同比 -12%', 12)).toBe('营收同比 -12%')
    expect(stripRedundantTrailingPct('SKU62%', 62)).toBe('SKU62%')
    expect(stripRedundantTrailingPct('99.9% SLA 组', 25)).toBe('99.9% SLA 组')
    expect(stripRedundantTrailingPct('增长率 12%', 40)).toBe('增长率 12%')
    expect(stripRedundantTrailingPct('62%', 62)).toBe('62%')

    const segs = normalizeCategorySegments([
      { label: '电商快递 62%', value: 62, tone: 'danger' },
      { label: '跨境专线 (18%)', value: 18, tone: 'warning' },
      { label: '仓配一体', value: 12, tone: 'neutral' },
      { label: '同城即时 4.5%', value: 4.5, tone: 'neutral' },
      { label: '99.9% 达标组', value: 3.5, tone: 'success' },
    ])
    expect(segs.map((s) => `${s.label}:${s.pct}%`)).toEqual([
      '电商快递:62%',
      '跨境专线:18%',
      '仓配一体:12%',
      '同城即时:4.5%',
      '99.9% 达标组:3.5%',
    ])

    const html = renderToStaticMarkup(
      createElement(renderOf(DshTrackerImpl), {
        ...dummyCtx,
        props: {
          mode: 'category',
          title: '业务线分布',
          data: [
            { label: '电商快递 62%', value: 62, tone: 'danger' },
            { label: '跨境专线 38%', value: 38, tone: 'warning' },
          ],
        },
      }),
    )
    expect(html).not.toContain('电商快递 62%')
    expect(html).toContain('>电商快递</span>')
    expect(html).toContain('>62%</span>')
  })

  it('toggles horizontal scroll fade data attributes on Tabs header only when overflowing', () => {
    const expandedCss = readExpandedCss(
      resolve(import.meta.dirname, '..', 'src/client/catalog/Catalog.module.css'),
    )
    expect(expandedCss).toContain('.tabsHeaderScroll[data-scroll-right="true"]')
    expect(expandedCss).toContain('.tabsHeaderScroll[data-scroll-left="true"]')
    expect(expandedCss).toContain(
      '.tabsHeaderScroll[data-scroll-left="true"][data-scroll-right="true"]',
    )

    const win = new Window()
    const prevDoc = globalThis.document
    const prevWin = globalThis.window
    const prevHTMLElement = globalThis.HTMLElement
    const prevAct = (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as unknown as { document: unknown }).document = win.document
    ;(globalThis as unknown as { window: unknown }).window = win
    ;(globalThis as unknown as { HTMLElement: unknown }).HTMLElement = win.HTMLElement
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true

    try {
      const host = win.document.createElement('div')
      win.document.body.appendChild(host)
      const root = createRoot(host as unknown as Element)
      const TabsRender = renderOf(DshTabsImpl)
      const tabs = Array.from({ length: 6 }, (_, i) => ({
        title: `页签 ${i + 1} 长标题`,
        child: `c${i}`,
      }))

      act(() => {
        root.render(
          createElement(TabsRender, {
            ...dummyCtx,
            props: { tabs },
            buildChild: (id: string) => createElement('div', null, id),
          }),
        )
      })

      const scroller = host.querySelector('[data-a2ui-tabs] > div') as unknown as {
        scrollLeft: number
        clientWidth: number
        scrollWidth: number
        getAttribute: (name: string) => string | null
        dispatchEvent: (e: Event) => boolean
      }
      expect(scroller).toBeTruthy()
      expect(scroller.getAttribute('data-scroll-left')).toBeNull()
      expect(scroller.getAttribute('data-scroll-right')).toBeNull()

      Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 300 })
      Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 600 })
      Object.defineProperty(scroller, 'scrollLeft', {
        configurable: true,
        writable: true,
        value: 0,
      })

      act(() => {
        scroller.dispatchEvent(new win.Event('scroll') as unknown as Event)
      })
      expect(scroller.getAttribute('data-scroll-left')).toBeNull()
      expect(scroller.getAttribute('data-scroll-right')).toBe('true')

      act(() => {
        scroller.scrollLeft = 120
        scroller.dispatchEvent(new win.Event('scroll') as unknown as Event)
      })
      expect(scroller.getAttribute('data-scroll-left')).toBe('true')
      expect(scroller.getAttribute('data-scroll-right')).toBe('true')

      act(() => {
        scroller.scrollLeft = 300
        scroller.dispatchEvent(new win.Event('scroll') as unknown as Event)
      })
      expect(scroller.getAttribute('data-scroll-left')).toBe('true')
      expect(scroller.getAttribute('data-scroll-right')).toBeNull()

      act(() => {
        root.unmount()
      })
    } finally {
      ;(globalThis as unknown as { document: unknown }).document = prevDoc
      ;(globalThis as unknown as { window: unknown }).window = prevWin
      ;(globalThis as unknown as { HTMLElement: unknown }).HTMLElement = prevHTMLElement
      ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
        prevAct
      win.close()
    }
  })

  it('documents derived local Chart arrays and low-depth calc+lookup tier pattern in SKILL_PREAMBLE', () => {
    expect(SKILL_PREAMBLE).toContain('series = [{ x: "A", y: pmt }]')
    expect(SKILL_PREAMBLE).toContain('lookup(tier,')

    const sessions = new SurfaceSessions(createGenerator(), true)
    const runwayUi = [
      'surface("saas_runway_flat")',
      '$/cash = 300',
      '$/mrr = 20',
      '$/rd = 35',
      '$/cac = 3000',
      '$/arpu = 500',
      '$/churn = 3',
      '$/grow = 8',
      'v = { c: $/cash, m: $/mrr, r: $/rd, cac: $/cac, arpu: $/arpu, ch: $/churn, g: $/grow }',
      'runway = calc("c / max(0.1, r - m * (1 - ((g + ch) / 100) * (cac / arpu)))", v, decimals=1)',
      'ltvCac = calc("(arpu / (ch / 100)) / cac", v, decimals=2)',
      'tier = calc("c / max(0.1, r - m * (1 - ((g + ch) / 100) * (cac / arpu))) >= 18 ? 2 : c / max(0.1, r - m * (1 - ((g + ch) / 100) * (cac / arpu))) >= 12 ? 1 : 0", v, decimals=0)',
      'advice = lookup(tier, { "0": "🔴 跑道不足 12 月，立即控费或启动融资", "1": "🟡 跑道 12–18 月，关注净燃烧与流失率", "2": "🟢 跑道充裕，可加速投放增长" })',
      'root = Card(Column([Row([Stat("剩余跑道（月）", runway, weight=1), Stat("LTV / CAC", ltvCac, weight=1)]), Callout("健康预警", advice, tone="info")]))',
    ].join('\n')
    expect(sessions.compile('runway-flat', runwayUi).length).toBeGreaterThan(0)
  })
})
