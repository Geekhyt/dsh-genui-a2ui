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

import {
  formatActionMessage,
  matchA2uiActionUserText,
} from '../src/client/action-protocol.ts'
import {
  clampMermaidZoom,
  DshMermaidView,
  MERMAID_ZOOM_MAX,
  MERMAID_ZOOM_MIN,
  MERMAID_ZOOM_STEP,
} from '../src/client/catalog/ExtendedWidgets.tsx'
import { loadRuntimeChunk } from '../src/client/chunk-loader.ts'
import { apply as applyClient } from '../src/client/index.ts'
import { assertSafeSvg } from '../src/client/mermaid-safe.ts'
import {
  getPluginCssRegistry,
  isPluginStylesMounted,
} from '../src/client/style-lifecycle.ts'
import { resolveLatestA2uiCommandState } from '../src/client/turn-surfaces.ts'
import { apply as applyHost, TIER_COMMAND } from '../src/index.ts'
import { MermaidApi } from '../src/shared/catalog-schema.ts'
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
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
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
    // Pre-import the lazy runtime module in Node before installing our minimal DOM stub
    // so react-aria's top-level browser focus monkeypatch stays dormant in Node.
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
          binding: () => ({ target: () => ({ subscribe: () => () => {}, getSnapshot: () => undefined }) }),
        },
        inject: () => {},
        effect(setup: () => () => void) {
          const teardown = setup()
          cleanups.push(teardown)
          return teardown
        },
      })

      // 1. Initial plugin mount + lazy runtime chunk load
      applyClient(makeCtx() as never)
      await loadRuntimeChunk()

      expect(isPluginStylesMounted('dsh-genui-a2ui')).toBe(true)
      expect(dom.headTags.some((t) => t.id === 'a2ui-structural-styles')).toBe(true)
      expect(
        dom.headTags.filter((t) => t.dataset.plugin === 'dsh-genui-a2ui').length,
      ).toBeGreaterThanOrEqual(2)

      // 2. Disable plugin in DSH Plugin Manager -> all plugin & structural styles removed
      while (cleanups.length > 0) cleanups.pop()!()
      expect(isPluginStylesMounted('dsh-genui-a2ui')).toBe(false)
      expect(dom.headTags.some((t) => t.id === 'a2ui-structural-styles')).toBe(false)
      expect(dom.headTags.filter((t) => t.dataset.plugin === 'dsh-genui-a2ui')).toHaveLength(0)

      // 3. Re-enable plugin without reloading window -> both CSS Module sheets and #a2ui-structural-styles restored!
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
    // A2UI principle check: Mermaid schema only exposes semantic props (code, title, caption, weight),
    // never leaking ephemeral viewport zoom/fullscreen props into LLM prompt tokens.
    const schemaKeys = Object.keys(MermaidApi.schema.shape).sort()
    expect(schemaKeys).toEqual(['caption', 'code', 'title', 'weight'])

    expect(MERMAID_ZOOM_MIN).toBe(50)
    expect(MERMAID_ZOOM_MAX).toBe(250)
    expect(MERMAID_ZOOM_STEP).toBe(25)
    expect(clampMermaidZoom(10)).toBe(50)
    expect(clampMermaidZoom(125)).toBe(125)
    expect(clampMermaidZoom(999)).toBe(250)

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

      // 1. English widget chrome
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

      // 2. Outbound English [a2ui-action] formatting + inbound parser compatibility across both locales
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

      // 3. Host /a2ui command responds in English when locale is 'en' and client sync parses both zh & en
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
    expect(() => assertSafeSvg('<svg><a href="vbscript:msgbox(1)">x</a></svg>')).toThrow(/sanitization/)
    expect(() => assertSafeSvg('<svg><a href="&#106;avascript:alert(1)">x</a></svg>')).toThrow(
      /sanitization/,
    )
    expect(() => assertSafeSvg('<svg><a href="java&#x09;script:alert(1)">x</a></svg>')).toThrow(
      /sanitization/,
    )
  })
})
