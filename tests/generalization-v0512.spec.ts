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
import {
  buildServiceGraphLayout,
  computeServiceGraphFitScale,
} from '../src/client/catalog/v3-helpers.ts'
import { DshCalloutImpl } from '../src/client/catalog/widgets/DiffAndSummaryWidgets.tsx'
import { DshTimelineImpl } from '../src/client/catalog/widgets/OpsTimelineWidgets.tsx'
import { DshAnnotationTextImpl } from '../src/client/catalog/widgets/RatingAndMediaCompare.tsx'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { createRenderTool } from '../src/host/render-tool.ts'
import { A2UI_SYSTEM_GUIDANCE, SKILL_PREAMBLE } from '../src/index.ts'
import { escapeCurrencyDollarsForMarkdown } from '../src/shared/markdown-currency.ts'

const renderOf = (comp: unknown) => (comp as { rawRender: never }).rawRender
const dummyCtx = {
  surfaceId: 's_gen_v0512',
  componentId: 'c_gen_v0512',
  dataContextPath: '/',
  buildChild: () => null,
}

describe('live generalization v0.5.12 fixes: routing, ServiceGraph fit, currency $, AnnotationText click, and schema tolerances', () => {
  it('P0: documents 0ms cross-filtering in A2UI_SYSTEM_GUIDANCE and removes inline placement collision', () => {
    expect(A2UI_SYSTEM_GUIDANCE).toContain('selected=$/sel')
    expect(A2UI_SYSTEM_GUIDANCE).toContain('filterField')
    expect(A2UI_SYSTEM_GUIDANCE).toContain('default `placement="answer"`')
    expect(A2UI_SYSTEM_GUIDANCE).not.toContain('dashboards inline via')
    expect(A2UI_SYSTEM_GUIDANCE.length).toBeLessThan(8500)

    expect(SKILL_PREAMBLE).toContain('collapsed inside tool drawer only')
    expect(SKILL_PREAMBLE).not.toContain('dashboards inline via')

    const tool = createRenderTool(new SurfaceSessions(createGenerator(), true)) as {
      parameters: { properties: { placement: { description: string } } }
    }
    expect(tool.parameters.properties.placement.description).toContain(
      'collapsed inside the tool-call drawer',
    )
  })

  it('P1-1: fits 4-tier LR ServiceGraph topologies inside chat column and exposes scroll fade CSS', () => {
    expect(computeServiceGraphFitScale(920, 580, 'auto')).toBeCloseTo(580 / 920, 4)
    expect(computeServiceGraphFitScale(920, 580, 'actual')).toBe(1)
    expect(computeServiceGraphFitScale(1400, 580, 'auto')).toBe(0.56)
    expect(computeServiceGraphFitScale(500, 580, 'auto')).toBe(1)

    const layout = buildServiceGraphLayout(
      [
        { id: 'gw', label: 'api-gateway', status: 'healthy', metric: '12.6k QPS' },
        { id: 'order', label: 'order-service', status: 'warning', metric: 'P99 3.1s' },
        { id: 'coupon', label: 'coupon-service', status: 'error', metric: 'CPU 92%' },
        { id: 'promo', label: 'promo-service', status: 'warning', metric: '降级' },
        { id: 'inv', label: 'inventory-service', status: 'error', metric: 'Hikari 20/20' },
        { id: 'redis', label: 'redis-coupon', status: 'error', metric: 'CPU 91%' },
        { id: 'mysql', label: 'mysql-stock', status: 'error', metric: '行锁 1.8s' },
      ],
      [
        { from: 'gw', to: 'order', label: '12.6k QPS', status: 'healthy' },
        { from: 'order', to: 'coupon', label: '4.1k QPS · 3.7x 重试', status: 'error' },
        { from: 'order', to: 'promo', label: '2.1k QPS', status: 'warning' },
        { from: 'order', to: 'inv', label: '8.9k QPS', status: 'error' },
        { from: 'coupon', to: 'redis', label: 'Lua EVAL', status: 'error' },
        { from: 'inv', to: 'mysql', label: 'UPDATE qty', status: 'error' },
      ],
      'LR',
    )
    expect(layout.width).toBeLessThan(900)
    expect(computeServiceGraphFitScale(layout.width, 580, 'auto')).toBeGreaterThan(0.64)

    const cssText = readExpandedCss(resolve(process.cwd(), 'src/client/catalog/Catalog.module.css'))
    expect(cssText).toContain('.serviceGraphViewport[data-scroll-right="true"]')
    expect(cssText).toContain('.serviceGraphViewport[data-scroll-left="true"]')
    expect(cssText).toContain('.serviceGraphScaleBtn')
  })

  it('P1-2: escapes currency dollar signs for MarkdownText while preserving LaTeX math and code', () => {
    expect(
      escapeCurrencyDollarsForMarkdown('所选套餐 US$59/席·月，落在预算区间（区间US$25 - US$99）'),
    ).toBe('所选套餐 US\\$59/席·月，落在预算区间（区间US\\$25 - US\\$99）')

    expect(escapeCurrencyDollarsForMarkdown('预算从 $25 涨到 $99，最高 $1,200.50')).toBe(
      '预算从 \\$25 涨到 \\$99，最高 \\$1,200.50',
    )

    expect(escapeCurrencyDollarsForMarkdown('区间 $10k - $50k，港币 HK$88 起')).toBe(
      '区间 \\$10k - \\$50k，港币 HK\\$88 起',
    )

    expect(escapeCurrencyDollarsForMarkdown('质能方程 $E = mc^2$ 与线性方程 $2x + 3 = 7$')).toBe(
      '质能方程 $E = mc^2$ 与线性方程 $2x + 3 = 7$',
    )

    expect(escapeCurrencyDollarsForMarkdown('复杂度 $10^6$ 次操作')).toBe('复杂度 $10^6$ 次操作')
    expect(escapeCurrencyDollarsForMarkdown('行内代码 `$25 - $99` 与已转义 \\$50')).toBe(
      '行内代码 `$25 - $99` 与已转义 \\$50',
    )
    expect(escapeCurrencyDollarsForMarkdown('```\nUS$25 - US$99\n```\n外部 US$59')).toBe(
      '```\nUS$25 - US$99\n```\n外部 US\\$59',
    )
    expect(escapeCurrencyDollarsForMarkdown('块公式 $$100 + 200$$ 与 US$59')).toBe(
      '块公式 $$100 + 200$$ 与 US\\$59',
    )
  })

  it('P1-3: AnnotationText opens and closes inline detail panel on click even without action', () => {
    const win = new Window()
    const prevDoc = globalThis.document
    const prevWin = globalThis.window
    const prevHTMLElement = globalThis.HTMLElement
    const prevAct = (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as Record<string, unknown>).document = win.document
    ;(globalThis as Record<string, unknown>).window = win
    ;(globalThis as Record<string, unknown>).HTMLElement = win.HTMLElement
    ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

    try {
      const container = win.document.createElement('div')
      win.document.body.appendChild(container)
      const root = createRoot(container as unknown as Element)
      act(() => {
        root.render(
          createElement(renderOf(DshAnnotationTextImpl), {
            ...dummyCtx,
            props: {
              title: '隐私条款审阅',
              text: '我们可能将数据转移至境外司法辖区，并按内部政策保留。',
              annotations: [
                {
                  match: '转移至境外司法辖区',
                  label: '跨境传输',
                  tone: 'danger',
                  sourceId: 'gdpr-transfer',
                  note: '需配置 SCCs 标准合同条款与 TIA 评估。',
                },
              ],
            },
          }),
        )
      })

      expect(container.querySelector('[data-a2ui-annotation-detail]')).toBeNull()
      const mark = container.querySelector('mark[role="button"]') as HTMLElement | null
      expect(mark).not.toBeNull()

      act(() => {
        mark!.click()
      })

      const detail = container.querySelector('[data-a2ui-annotation-detail]')
      expect(detail).not.toBeNull()
      expect(detail?.textContent).toContain('gdpr-transfer')
      expect(detail?.textContent).toContain('需配置 SCCs 标准合同条款与 TIA 评估')

      const closeBtn = detail?.querySelector('button') as HTMLButtonElement | null
      expect(closeBtn).not.toBeNull()
      act(() => {
        closeBtn!.click()
      })
      expect(container.querySelector('[data-a2ui-annotation-detail]')).toBeNull()

      act(() => {
        root.unmount()
      })
    } finally {
      ;(globalThis as Record<string, unknown>).document = prevDoc
      ;(globalThis as Record<string, unknown>).window = prevWin
      ;(globalThis as Record<string, unknown>).HTMLElement = prevHTMLElement
      ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = prevAct
      win.close()
    }
  })

  it('P2: accepts Callout tone="neutral", Timeline status aliases error/healthy, and compact Chart height=100..139', () => {
    const sessions = new SurfaceSessions(createGenerator(), true)
    const ui = [
      'surface("p2_ergonomics")',
      '$/bullet = [{ label: "单席月价", value: 59, target: 99, ranges: [50, 120, 160] }]',
      'root = Card(Column([',
      '  Callout("中性口径说明", "本页展示示例口径，不构成建议。", tone="neutral"),',
      '  Chart("bullet", $/bullet, title="单席月价 vs 预算", xField="label", height=110),',
      '  Timeline([',
      '    { time: "00:05", title: "库存扣减超时", status: "error" },',
      '    { time: "00:25", title: "限流生效恢复", status: "healthy" }',
      '  ], title="复盘时间轴")',
      ']))',
    ].join('\n')
    expect(sessions.compile('p2-sess', ui).length).toBeGreaterThan(0)

    expect(() =>
      sessions.compile(
        'p2-too-short',
        'surface("too_short")\nroot = Card(Chart("bar", [{ x: "A", y: 1 }], xField="x", yField="y", height=80))',
      ),
    ).toThrow(/100/)

    const neutralHtml = renderToStaticMarkup(
      createElement(renderOf(DshCalloutImpl), {
        ...dummyCtx,
        props: { title: '说明', message: '中性提示', tone: 'neutral' },
      }),
    )
    expect(neutralHtml).toContain('data-tone="neutral"')

    const timelineHtml = renderToStaticMarkup(
      createElement(renderOf(DshTimelineImpl), {
        ...dummyCtx,
        props: {
          items: [
            { time: '00:05', title: '故障', status: 'error' },
            { time: '00:25', title: '恢复', status: 'healthy' },
          ],
        },
      }),
    )
    expect(timelineHtml).toContain('data-status="danger"')
    expect(timelineHtml).toContain('data-status="success"')
  })
})
