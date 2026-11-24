import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  IconAppsAddOutlineRegular: ({ size = 14 }: { size?: number }) =>
    createElement('svg', { 'data-icon': 'apps', width: size, height: size }),
  IconSearchOutlineRegular: undefined,
  IconChevronDownOutlineRegular: undefined,
  IconChevronUpOutlineRegular: undefined,
  IconCheckOutlineRegular: undefined,
  IconWarningOutlineRegular: undefined,
}))

import { DshMermaidView } from '../src/client/catalog/widgets/MermaidWidget.tsx'
import {
  countMermaidDiagramCacheEntries,
  MAX_MERMAID_CACHE_ENTRIES,
  resetMermaidDiagramCacheForTests,
  seedMermaidDiagramCacheForTests,
} from '../src/client/chunk-loader.ts'
import { subscribeClientLocale } from '../src/client/i18n.ts'
import {
  computeMessagesFingerprint,
  loadSurfaceDraft,
  resetPersistenceForTests,
  saveSurfaceDraft,
  setA2uiEnabled,
} from '../src/client/persistence.ts'
import { SurfaceGroupView, SurfaceSessionStore } from '../src/client/runtime/SurfaceView.tsx'
import { A2uiTierControl } from '../src/client/shell/TierControl.tsx'
import { subscribeDarkTheme } from '../src/client/theme.ts'
import type { ChatTargetSnapshot } from '../src/client/shell/turn-surfaces.ts'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'

const ROOT_DIR = resolve(import.meta.dirname, '..')
const SRC_DIR = resolve(ROOT_DIR, 'src')
const SKILL_DIR = resolve(ROOT_DIR, '.agents/skills/vercel-react-best-practices')

function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full))
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('Vercel React Best Practices architecture & zero-business-useEffect governance', () => {
  beforeEach(() => {
    resetPersistenceForTests()
    resetMermaidDiagramCacheForTests()
  })

  it('keeps local .agents/skills/ out of the published npm tarball and validates skill structure when present', () => {
    if (existsSync(SKILL_DIR)) {
      expect(existsSync(join(SKILL_DIR, 'SKILL.md'))).toBe(true)
      expect(existsSync(join(SKILL_DIR, 'AGENTS.md'))).toBe(true)
      expect(existsSync(join(SKILL_DIR, 'metadata.json'))).toBe(true)

      const skillMd = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8')
      expect(skillMd).toContain('name: vercel-react-best-practices')
      expect(skillMd).toContain('rerender-derived-state-no-effect')
      expect(skillMd).toContain('rerender-move-effect-to-event')
      expect(skillMd).toContain('client-event-listeners')

      const ruleFiles = readdirSync(join(SKILL_DIR, 'rules')).filter((f) => f.endsWith('.md'))
      expect(ruleFiles.length).toBeGreaterThanOrEqual(55)
    }

    const pkg = JSON.parse(readFileSync(join(ROOT_DIR, 'package.json'), 'utf8')) as {
      files: string[]
    }
    for (const allowedEntry of pkg.files) {
      expect(allowedEntry.startsWith('.agents')).toBe(false)
    }
  })

  it('forbids useEffect and useLayoutEffect across 100% of business and UI .tsx/.ts modules (isolated strictly to src/client/dom-hooks.ts)', () => {
    const allSrcFiles = collectSourceFiles(SRC_DIR)
    expect(allSrcFiles.length).toBeGreaterThanOrEqual(25)

    for (const absPath of allSrcFiles) {
      const relPath = relative(ROOT_DIR, absPath).replace(/\\/g, '/')
      if (relPath === 'src/client/dom-hooks.ts') continue
      const code = stripComments(readFileSync(absPath, 'utf8'))
      expect(code, `${relPath} must not import or call useEffect / useLayoutEffect`).not.toMatch(
        /\buse(?:Layout)?Effect\b/,
      )
    }

    const biomeConfig = JSON.parse(readFileSync(join(ROOT_DIR, 'biome.json'), 'utf8')) as {
      overrides?: Array<{
        includes?: string[]
        linter?: {
          rules?: {
            style?: {
              noRestrictedImports?: {
                level?: string
                options?: { paths?: { react?: { importNames?: string[] } } }
              }
            }
          }
        }
      }>
    }
    const tsxGuard = biomeConfig.overrides?.find((o) => o.includes?.includes('src/**/*.tsx'))
    expect(tsxGuard?.linter?.rules?.style?.noRestrictedImports?.level).toBe('error')
    expect(
      tsxGuard?.linter?.rules?.style?.noRestrictedImports?.options?.paths?.react?.importNames,
    ).toEqual(['useEffect', 'useLayoutEffect'])
  })

  it('deduplicates theme and locale MutationObservers across N concurrent subscribers (client-event-listeners)', () => {
    let createdObservers = 0
    let disconnectedObservers = 0
    const callbacks: Array<() => void> = []

    class FakeMutationObserver {
      constructor(cb: () => void) {
        createdObservers += 1
        callbacks.push(cb)
      }
      observe(): void {}
      disconnect(): void {
        disconnectedObservers += 1
      }
    }

    const prevDoc = (globalThis as Record<string, unknown>).document
    const prevMO = (globalThis as Record<string, unknown>).MutationObserver
    ;(globalThis as Record<string, unknown>).document = {
      body: { hasAttribute: () => true },
      documentElement: { lang: 'zh-CN' },
    }
    ;(globalThis as Record<string, unknown>).MutationObserver = FakeMutationObserver

    try {
      let darkNotifications = 0
      const darkUnsubs = Array.from({ length: 20 }, () =>
        subscribeDarkTheme(() => {
          darkNotifications += 1
        }),
      )
      expect(createdObservers).toBe(1)
      expect(disconnectedObservers).toBe(0)

      callbacks[0]!()
      expect(darkNotifications).toBe(20)

      for (let i = 0; i < 19; i++) darkUnsubs[i]!()
      expect(disconnectedObservers).toBe(0)
      darkUnsubs[19]!()
      expect(disconnectedObservers).toBe(1)

      let localeNotifications = 0
      const localeUnsubs = Array.from({ length: 20 }, () =>
        subscribeClientLocale(() => {
          localeNotifications += 1
        }),
      )
      expect(createdObservers).toBe(2)
      callbacks[1]!()
      expect(localeNotifications).toBe(20)

      for (const unsub of localeUnsubs) unsub()
      expect(disconnectedObservers).toBe(2)
    } finally {
      if (prevDoc === undefined) delete (globalThis as Record<string, unknown>).document
      else (globalThis as Record<string, unknown>).document = prevDoc
      if (prevMO === undefined) delete (globalThis as Record<string, unknown>).MutationObserver
      else (globalThis as Record<string, unknown>).MutationObserver = prevMO
    }
  })

  it('resolves cached Mermaid SVGs synchronously on Frame 1 via LRU-64 external store and evicts oldest entries cleanly', () => {
    const code = 'flowchart LR\n  A["Gateway"] --> B["Worker"]'
    seedMermaidDiagramCacheForTests(
      code,
      false,
      '<svg id="cached-m1" viewBox="0 0 420 160"><g class="node"><rect width="80" height="32"/></g></svg>',
    )

    for (let i = 0; i < MAX_MERMAID_CACHE_ENTRIES + 12; i++) {
      seedMermaidDiagramCacheForTests(
        `flowchart LR\n  N${i} --> M${i}`,
        true,
        `<svg viewBox="0 0 100 50"><g id="g-${i}"/></svg>`,
      )
    }
    expect(countMermaidDiagramCacheEntries()).toBe(MAX_MERMAID_CACHE_ENTRIES)

    const emptyHtml = renderToStaticMarkup(
      createElement(DshMermaidView, { props: { code: '   ' } }),
    )
    expect(emptyHtml).toContain('（空流程图）')
  })

  it('compiles SurfaceSessionStore and restores persisted localStorage drafts synchronously on Frame 1 (StrictMode-idempotent & SSR-safe)', () => {
    const sessions = new SurfaceSessions(createGenerator())
    const compiled = sessions.compile(
      'sess-frame1',
      [
        'surface("order_form")',
        '$/customer = "初始客户"',
        '$/customPin = ""',
        'root = Card(Column([',
        '  Text($/customer),',
        '  TextField("客户姓名", value=$/customer),',
        '  TextField("安全 PIN", value=$/customPin, variant="obscured")',
        ']))',
      ].join('\n'),
    )
    const fp = computeMessagesFingerprint(compiled)
    saveSurfaceDraft('sess-frame1', 'order_form', fp, { customer: '已保存草稿客户' })

    const store = new SurfaceSessionStore()
    const reconcileOpts = {
      streaming: false,
      readOnly: false,
      sessionId: 'sess-frame1',
      fingerprint: fp,
      visibleSurfaceIds: undefined,
      onAction: undefined,
    }
    store.reconcile(compiled as never, reconcileOpts)
    expect(store.generation).toBe(0)
    expect(store.getSurfaces()).toHaveLength(1)
    expect(store.getSurfaces()[0]!.dataModel.get('/customer')).toBe('已保存草稿客户')

    const unsub = store.subscribe(() => {})
    store.getSurfaces()[0]!.dataModel.set('/customer', '用户新输入')
    store.getSurfaces()[0]!.dataModel.set('/customPin', '998877-secret-pin')
    store.reconcile(compiled as never, reconcileOpts)
    expect(store.generation).toBe(0)
    expect(store.getSurfaces()[0]!.dataModel.get('/customer')).toBe('用户新输入')
    expect(loadSurfaceDraft('sess-frame1', 'order_form', fp)).toEqual({ customer: '用户新输入' })

    const replacement = sessions.compile(
      'sess-frame1-next',
      'surface("next_form")\nroot = Card(Text("下一步"))',
    )
    store.reconcile(replacement as never, {
      ...reconcileOpts,
      fingerprint: computeMessagesFingerprint(replacement),
    })
    expect(store.generation).toBe(1)
    expect(store.getSurfaces().map((s) => s.id)).toEqual(['next_form'])
    unsub()

    const ssrHtml = renderToStaticMarkup(
      createElement(SurfaceGroupView, {
        messages: compiled as never,
        sessionId: 'sess-frame1',
        title: '订单确认单',
        streaming: false,
      }),
    )
    expect(ssrHtml).toContain('订单确认单')
    expect(ssrHtml).toContain('data-dsh-a2ui-card=""')
  })

  it('derives A2uiTierControl enabled state from chat command watermarks and 1-click overrides without useEffect', () => {
    const makeChatStore = (seq: number, text: string) => {
      const snap: ChatTargetSnapshot = {
        order: [`cmd-${seq}`],
        nodes: new Map([
          [
            `cmd-${seq}`,
            {
              kind: 'command',
              anchorSeq: seq,
              data: { name: 'a2ui', seq, outcome: { kind: 'success', text } },
            },
          ],
        ]),
      }
      return {
        subscribe: () => () => {},
        getSnapshot: () => snap,
      }
    }

    const offHtml = renderToStaticMarkup(
      createElement(A2uiTierControl, {
        sessionId: 'sess-watermark',
        chatStore: makeChatStore(4, 'A2UI 生成式界面已关闭'),
      }),
    )
    expect(offHtml).toContain('data-enabled="false"')

    setA2uiEnabled('sess-watermark', true, 4)
    const toggledOnHtml = renderToStaticMarkup(
      createElement(A2uiTierControl, {
        sessionId: 'sess-watermark',
        chatStore: makeChatStore(4, 'A2UI 生成式界面已关闭'),
      }),
    )
    expect(toggledOnHtml).toContain('data-enabled="true"')

    const newerCommandOffHtml = renderToStaticMarkup(
      createElement(A2uiTierControl, {
        sessionId: 'sess-watermark',
        chatStore: makeChatStore(5, 'A2UI 生成式界面已关闭'),
      }),
    )
    expect(newerCommandOffHtml).toContain('data-enabled="false"')
  })
})
