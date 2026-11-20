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
  Input: undefined,
  Pill: undefined,
  SegmentedTabs: undefined,
  Tag: undefined,
  Modal: undefined,
  Menu: undefined,
  Tooltip: undefined,
  CodeBlock: undefined,
  JsonTree: undefined,
  DisclosureRow: undefined,
  MarkdownText: undefined,
  IconAppsAddOutlineRegular: undefined,
  IconSearchOutlineRegular: undefined,
}))

import { MessageProcessor } from '@a2ui/web_core/v1_0'
import { formatActionMessage, matchA2uiActionUserText } from '../src/client/action-protocol.ts'
import {
  clampMermaidZoom,
  DshMermaidView,
  MERMAID_ZOOM_MAX,
  MERMAID_ZOOM_MIN,
  MERMAID_ZOOM_STEP,
  scaleMermaidZoomByWheel,
  stepMermaidZoom,
} from '../src/client/catalog/ExtendedWidgets.tsx'
import { LocaleFormatCurrencyImplementation } from '../src/client/catalog/functions.ts'
import { dshReactCatalog } from '../src/client/catalog/index.ts'
import { DshRowView, isHomogeneousStatRow } from '../src/client/catalog/LayoutWidgets.tsx'
import { DshStatView } from '../src/client/catalog/MediaAndDataWidgets.tsx'
import { TableWidget } from '../src/client/catalog/TableWidget.tsx'
import { loadRuntimeChunk } from '../src/client/chunk-loader.ts'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { apply as applyClient } from '../src/client/index.ts'
import { assertSafeSvg, prepareMermaidSvg } from '../src/client/mermaid-safe.ts'
import { getPluginCssRegistry, isPluginStylesMounted } from '../src/client/style-lifecycle.ts'
import { resolveLatestA2uiCommandState } from '../src/client/turn-surfaces.ts'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { A2UI_SYSTEM_GUIDANCE, apply as applyHost, TIER_COMMAND } from '../src/index.ts'
import { MermaidApi, StatApi } from '../src/shared/catalog-schema.ts'
import { setUiLocaleOverride } from '../src/shared/i18n.ts'

interface FakeStyleTag {
  id: string
  textContent: string
  dataset: Record<string, string>
  remove: () => void
}

function installFakeDom() {
  const headTags: FakeStyleTag[] = []
  const fakeDoc = {
    adoptedStyleSheets: [] as unknown[],
    createElement(_tagName: string): FakeStyleTag {
      const el: FakeStyleTag = {
        id: '',
        textContent: '',
        dataset: {},
        remove() {
          const idx = headTags.indexOf(el)
          if (idx >= 0) headTags.splice(idx, 1)
        },
      }
      return el
    },
    getElementById(id: string): FakeStyleTag | null {
      return headTags.find((t) => t.id === id) ?? null
    },
    querySelector(sel: string): FakeStyleTag | null {
      return this.querySelectorAll(sel)[0] ?? null
    },
    querySelectorAll(sel: string): FakeStyleTag[] {
      const cssMatch = /^style\[data-plugin-css=("[^"]+")\]$/.exec(sel)
      if (cssMatch?.[1]) {
        const expected = JSON.parse(cssMatch[1]) as string
        return headTags.filter((t) => t.dataset.pluginCss === expected)
      }
      const pluginMatch = /^style\[data-plugin=("[^"]+")\]$/.exec(sel)
      if (pluginMatch?.[1]) {
        const expected = JSON.parse(pluginMatch[1]) as string
        return headTags.filter((t) => t.dataset.plugin === expected)
      }
      return []
    },
    head: {
      appendChild(el: FakeStyleTag) {
        headTags.push(el)
        return el
      },
    },
  }
  const prevDoc = (globalThis as Record<string, unknown>).document
  const prevWin = (globalThis as Record<string, unknown>).window
  ;(globalThis as Record<string, unknown>).document = fakeDoc
  ;(globalThis as Record<string, unknown>).window = {
    document: fakeDoc,
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  }
  return {
    headTags,
    restore() {
      if (prevDoc === undefined) {
        delete (globalThis as Record<string, unknown>).document
      } else {
        ;(globalThis as Record<string, unknown>).document = prevDoc
      }
      if (prevWin === undefined) {
        delete (globalThis as Record<string, unknown>).window
      } else {
        ;(globalThis as Record<string, unknown>).window = prevWin
      }
    },
  }
}

describe('OSS Readiness: Reversible Style Lifecycle & Mermaid Viewport Ergonomics', () => {
  it('cleanly detaches plugin & A2UI structural styles on dispose and restores them on hot re-enable', async () => {
    await loadRuntimeChunk()
    const dom = installFakeDom()
    try {
      const reg = getPluginCssRegistry('dsh-genui-a2ui')
      reg.sheets.set('dsh-genui-a2ui/client/TierControl.module.css', '.tier{display:flex}')
      reg.sheets.set('dsh-genui-a2ui/catalog/Catalog.module.css', '.card{border-radius:12px}')

      const cleanups: Array<() => void> = []
      const makeCtx = () => ({
        slots: { inject: () => () => {}, register: () => () => {} },
        sessions: {},
        uiConversation: {
          events: { register: () => () => {} },
          userText: { register: () => () => {} },
          binding: () => ({
            target: () => ({ subscribe: () => () => {}, getSnapshot: () => undefined }),
          }),
        },
        inject: () => {},
        effect(setup: () => () => void) {
          const teardown = setup()
          cleanups.push(teardown)
          return teardown
        },
      })

      applyClient(makeCtx() as never)
      await loadRuntimeChunk()

      expect(isPluginStylesMounted('dsh-genui-a2ui')).toBe(true)
      expect(dom.headTags.some((t) => t.id === 'a2ui-structural-styles')).toBe(true)
      expect(
        dom.headTags.filter((t) => t.dataset.plugin === 'dsh-genui-a2ui').length,
      ).toBeGreaterThanOrEqual(2)

      while (cleanups.length > 0) cleanups.pop()!()
      expect(isPluginStylesMounted('dsh-genui-a2ui')).toBe(false)
      expect(dom.headTags.some((t) => t.id === 'a2ui-structural-styles')).toBe(false)
      expect(dom.headTags.filter((t) => t.dataset.plugin === 'dsh-genui-a2ui')).toHaveLength(0)

      applyClient(makeCtx() as never)
      await loadRuntimeChunk()
      expect(isPluginStylesMounted('dsh-genui-a2ui')).toBe(true)
      expect(dom.headTags.some((t) => t.id === 'a2ui-structural-styles')).toBe(true)
      expect(
        dom.headTags.filter((t) => t.dataset.plugin === 'dsh-genui-a2ui').length,
      ).toBeGreaterThanOrEqual(2)

      while (cleanups.length > 0) cleanups.pop()!()
    } finally {
      dom.restore()
    }
  })

  it('keeps Mermaid wire schema unchanged while clamping local zoom bounds and SSR-rendering cleanly', () => {
    const schemaKeys = Object.keys(MermaidApi.schema.shape).sort()
    expect(schemaKeys).toEqual(['caption', 'code', 'title', 'weight'])

    expect(MERMAID_ZOOM_MIN).toBe(10)
    expect(MERMAID_ZOOM_MAX).toBe(2000)
    expect(MERMAID_ZOOM_STEP).toBe(25)
    expect(clampMermaidZoom(2)).toBe(10)
    expect(clampMermaidZoom(125)).toBe(125)
    expect(clampMermaidZoom(9999)).toBe(2000)

    expect(stepMermaidZoom(85, 1)).toBe(100)
    expect(stepMermaidZoom(120, -1)).toBe(100)
    expect(stepMermaidZoom(100, 1)).toBe(125)
    let cur = MERMAID_ZOOM_MIN
    for (let i = 0; i < 40 && cur < MERMAID_ZOOM_MAX; i++) {
      const next = stepMermaidZoom(cur, 1)
      expect(next).toBeGreaterThan(cur)
      cur = next
    }
    expect(cur).toBe(MERMAID_ZOOM_MAX)

    expect(scaleMermaidZoomByWheel(100, -100)).toBeGreaterThan(120)
    expect(scaleMermaidZoomByWheel(100, 100)).toBeLessThan(85)
    expect(scaleMermaidZoomByWheel(1800, -500)).toBe(2000)

    const prepared = prepareMermaidSvg(
      '<svg id="m1" width="100%" style="max-width: 3240.5px; background: transparent;" viewBox="-8 -8 3240.5 820.25"><g/></svg>',
    )
    expect(prepared.width).toBe(3240.5)
    expect(prepared.height).toBe(820.25)
    expect(prepared.markup).not.toContain('max-width')
    expect(prepared.markup).not.toContain('width="100%"')
    expect(prepared.markup).toContain('width="3240.5" height="820.25"')
    assertSafeSvg(prepared.markup)

    const fallbackPrepared = prepareMermaidSvg('<svg width="640" height="360"><g/></svg>')
    expect(fallbackPrepared.width).toBe(640)
    expect(fallbackPrepared.height).toBe(360)
    expect(fallbackPrepared.markup).toContain('viewBox="0 0 640 360"')

    const html = renderToStaticMarkup(
      createElement(DshMermaidView, {
        props: {
          code: 'flowchart LR\n  A["入口"] --> B["出口"]',
          title: '核心链路',
          caption: '流式架构',
        },
      }),
    )
    expect(html).toContain('核心链路')
    expect(html).toContain('流式架构')
    expect(html).toContain('图形')
    expect(html).toContain('源码')
    expect(html).toContain('role="status"')
    expect(html).toContain('正在渲染流程图…')
  })

  it('supports zero-dependency bilingual (zh / en) UI chrome, cross-locale action parsing, and /a2ui sync', async () => {
    try {
      setUiLocaleOverride('en')

      const enHtml = renderToStaticMarkup(
        createElement(DshMermaidView, {
          props: {
            code: 'flowchart LR\n  A --> B',
          },
        }),
      )
      expect(enHtml).toContain('Diagram')
      expect(enHtml).toContain('Source')
      expect(enHtml).toContain('Copy')
      expect(enHtml).toContain('Rendering diagram…')

      const enFormatted = formatActionMessage(
        {
          name: 'drill_down',
          surfaceId: 'sales_card',
          sourceComponentId: 'chart_1',
          context: { region: 'APAC' },
          metadata: {
            extensions: {
              dshSelection: { source: 'fileTree', path: 'src/index.ts', line: 42 },
            },
          },
        } as never,
        { filter: 'Q4' },
      )
      expect(enFormatted).toContain('User note: View file: src/index.ts:42')
      expect(enFormatted).toContain('Action params: ')
      expect(enFormatted).toContain('Current data model: ')
      expect(enFormatted).toContain('Please continue based on the interaction above')

      const parsedEn = matchA2uiActionUserText(enFormatted, 0)
      expect(parsedEn?.data.surfaceId).toBe('sales_card')
      expect(parsedEn?.data.userMessage).toBe('View file: src/index.ts:42')
      expect(parsedEn?.data.paramsText).toContain('"APAC"')
      expect(parsedEn?.data.dataModelText).toContain('"Q4"')

      const registeredCommands = new Map<
        string,
        (inv: { rawInput: string }) => { kind: string; text?: string }
      >()
      const fakeHostCtx = {
        inject(_deps: string[], fn: (c: unknown) => void) {
          fn({
            tools: { register: () => () => {} },
            systemPrompt: { section: () => () => {} },
            skills: { register: () => () => {} },
            commands: {
              register(def: {
                name: string
                handler: (inv: { rawInput: string }) => { kind: string; text?: string }
              }) {
                registeredCommands.set(def.name, def.handler)
                return () => {}
              },
            },
            effect(setup: () => () => void) {
              return setup()
            },
          })
        },
        on: () => () => {},
      }
      applyHost(fakeHostCtx as never, { stateFile: null })
      const tierHandler = registeredCommands.get(TIER_COMMAND)!
      const offOut = tierHandler({ rawInput: 'off' })
      expect(offOut.text).toBe('A2UI generative UI disabled')
      const onOut = tierHandler({ rawInput: 'on' })
      expect(onOut.text).toBe('A2UI generative UI enabled')

      const snapDisabled = {
        nodes: new Map([
          [
            'cmd-1',
            {
              kind: 'command',
              anchorSeq: 10,
              data: { name: 'a2ui', seq: 10, outcome: { kind: 'success', text: offOut.text } },
            },
          ],
        ]),
      }
      expect(resolveLatestA2uiCommandState(snapDisabled as never)).toEqual({
        seq: 10,
        enabled: false,
      })

      const snapEnabled = {
        nodes: new Map([
          [
            'cmd-2',
            {
              kind: 'command',
              anchorSeq: 11,
              data: { name: 'a2ui', seq: 11, outcome: { kind: 'success', text: onOut.text } },
            },
          ],
        ]),
      }
      expect(resolveLatestA2uiCommandState(snapEnabled as never)).toEqual({
        seq: 11,
        enabled: true,
      })
    } finally {
      setUiLocaleOverride(null)
    }
  })

  it('hardens assertSafeSvg against slash-delimited event handlers, vbscript, and numeric-entity URI obfuscation', () => {
    expect(() =>
      assertSafeSvg(
        '<svg viewBox="0 0 100 40"><g class="node"><foreignObject width="80" height="24"><div><span>Gateway</span></div></foreignObject></g></svg>',
      ),
    ).not.toThrow()

    expect(() => assertSafeSvg('<svg/onload=alert(1)></svg>')).toThrow(/sanitization/)
    expect(() => assertSafeSvg('<svg><a href="vbscript:msgbox(1)">x</a></svg>')).toThrow(
      /sanitization/,
    )
    expect(() => assertSafeSvg('<svg><a href="&#106;avascript:alert(1)">x</a></svg>')).toThrow(
      /sanitization/,
    )
    expect(() => assertSafeSvg('<svg><a href="java&#x09;script:alert(1)">x</a></svg>')).toThrow(
      /sanitization/,
    )
  })

  it('aligns Row default stretch semantics with A2UI 1.0 and scopes balanced KPI grid wrapping strictly to homogeneous Stat rows (including <a2ui-react-*> hosts)', () => {
    const sessions = new SurfaceSessions(createGenerator())
    let seq = 0
    const compileSurfaceRowCtx = (expr: string) => {
      const mp = new MessageProcessor([dshReactCatalog])
      mp.processMessages(sessions.compile(`kpi-test-${++seq}`, expr))
      const surface = mp.model.getSurface('s')!
      const rowModel = [...surface.componentsModel.entries]
        .map(([, m]) => m)
        .find((m) => m.type === 'Row')!
      return {
        componentModel: rowModel,
        dataContext: { surface },
      }
    }

    const homoCtx = compileSurfaceRowCtx(
      'surface("s")\nroot = Card(Row([Stat("月供", "9,050"), Stat("剩余利息", "58.9", weight=1), Stat("缩短年限", "26.65"), Stat("减少月供", "13.09")]))',
    )
    expect(isHomogeneousStatRow(homoCtx)).toBe(true)

    const unequalCtx = compileSurfaceRowCtx(
      'surface("s")\nroot = Card(Row([Stat("主指标", "26.65", weight=2), Stat("次指标", "13.09", weight=1)]))',
    )
    expect(isHomogeneousStatRow(unequalCtx)).toBe(false)

    const mixedCtx = compileSurfaceRowCtx(
      'surface("s")\nroot = Card(Row([Stat("主指标", "26.65"), Badge("正常", tone="success")]))',
    )
    expect(isHomogeneousStatRow(mixedCtx)).toBe(false)

    const rowHtml = renderToStaticMarkup(
      createElement(DshRowView, {
        props: { children: ['s1', 's2', 's3', 's4'] },
        context: homoCtx,
        buildChild: (id: string) =>
          createElement(DshStatView, {
            key: id,
            props: { label: `指标 ${id}`, value: '9,050', caption: '基准对照' },
          }),
      }),
    )

    expect(rowHtml).toContain('data-a2ui-row=""')
    expect(rowHtml).toContain('data-align="stretch"')
    expect(rowHtml).toContain('data-child-count="4"')
    expect(rowHtml).toContain('data-kpi-grid="true"')
    expect(rowHtml).toContain('align-items:stretch')
    expect(rowHtml).toContain('data-a2ui-stat=""')
    expect(rowHtml).not.toContain('min-width:130px')

    const startRowHtml = renderToStaticMarkup(
      createElement(DshRowView, {
        props: { children: ['s1'], align: 'start' },
        buildChild: (id: string) =>
          createElement(DshStatView, {
            key: id,
            props: { label: '单项', value: '100' },
          }),
      }),
    )
    expect(startRowHtml).toContain('data-align="start"')
    expect(startRowHtml).toContain('align-items:flex-start')
    expect(startRowHtml).not.toContain('data-kpi-grid')

    expect(A2UI_SYSTEM_GUIDANCE).toContain('Row([Stat(..., weight=1), ...])')
    expect(StatApi.schema.description).toContain('weight=1')

    const runtimeBundle = readFileSync(
      resolve(import.meta.dirname, '../lib/client.runtime.js'),
      'utf8',
    )
    expect(runtimeBundle).toContain('container-type:inline-size')
    expect(runtimeBundle).toContain('@container')
    expect(runtimeBundle).toContain('data-kpi-grid')
    expect(runtimeBundle).toMatch(/data-kpi-grid=['"]?true['"]?\]\[data-child-count\]/)
    expect(runtimeBundle).toMatch(/data-kpi-grid=['"]?true['"]?\]>\*>\.a2ui_/)

    const compactPie = buildChartOption(
      {
        kind: 'pie',
        data: [
          { name: '房租', value: 4000 },
          { name: '餐饮', value: 2240 },
          { name: '交通', value: 360 },
        ],
      },
      true,
      250,
    ) as {
      series: Array<{ label: { show: boolean; position: string }; labelLine: { show: boolean } }>
    }
    expect(compactPie.series[0]?.label.show).toBe(false)
    expect(compactPie.series[0]?.label.position).toBe('center')
    expect(compactPie.series[0]?.labelLine.show).toBe(false)

    try {
      setUiLocaleOverride('zh')
      const zhCny = String(
        LocaleFormatCurrencyImplementation.execute(
          { value: 114000, currency: 'CNY', decimals: 0 },
          {} as never,
        ),
      )
      expect(zhCny).toBe('¥114,000')

      setUiLocaleOverride('en')
      const enCny = String(
        LocaleFormatCurrencyImplementation.execute(
          { value: 114000, currency: 'CNY', decimals: 0 },
          {} as never,
        ),
      )
      expect(enCny).toBe('CN¥114,000')
    } finally {
      setUiLocaleOverride(null)
    }

    const tableHtml = renderToStaticMarkup(
      createElement(TableWidget, {
        rows: [
          {
            渠道: '抖音信息流',
            类型: '内容种草',
            曝光万: 448,
            备注: '适合高频短视频种草拉新与爆品冷启动投放场景，需配合达人素材迭代',
          },
        ],
      }),
    )
    expect(tableHtml).toContain('抖音信息流')
    expect(tableHtml).toMatch(/tdNowrap[^>]*>抖音信息流/)
    expect(tableHtml).toMatch(/tdNowrap[^>]*>内容种草/)
    expect(tableHtml).toMatch(/tdNum[^>]*>448/)
    expect(tableHtml).toMatch(/tdProse[^>]*>适合高频短视频/)
  })
})
