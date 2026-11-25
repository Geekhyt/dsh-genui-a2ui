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
import {
  DshBadgeImpl,
  resolveStatPresentation,
} from '../src/client/catalog/MediaAndDataWidgets.tsx'
import { normalizeKeyValueItems } from '../src/client/catalog/p0-helpers.ts'
import { buildFileTree, normalizeFileEntries } from '../src/client/catalog/stat-file-helpers.ts'
import {
  buildEndpointCurl,
  normalizeApiParamsAndHeaders,
} from '../src/client/catalog/v4-helpers.ts'
import { normalizeKvEditorRows } from '../src/client/catalog/v6-helpers.ts'
import { DshKeyValueImpl } from '../src/client/catalog/widgets/DiffAndSummaryWidgets.tsx'
import { DshFileTreeImpl } from '../src/client/catalog/widgets/StructuredTrees.tsx'
import { createAskTool, PendingAskRegistry, sanitizePayloadObject } from '../src/host/ask-tool.ts'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { slicePromptSnippetByDomain } from '../src/host/prompt-compact.ts'
import { createRenderTool } from '../src/host/render-tool.ts'
import { A2UI_SYSTEM_GUIDANCE, SKILL_PREAMBLE } from '../src/index.ts'
import {
  collectKvSecretsForDataModelUpdate,
  collectKvSecretsFromValue,
  collectSecretsFromNode,
  extractKvEntryKey,
  isKvValueField,
} from '../src/shared/redaction.ts'

describe('v0.5.7 live generalization hardening', () => {
  it('normalizes shorthand { k, v } / { title, text } / { label, val } entries across KeyValue, KvEditor, and ApiEndpoint', () => {
    const kv = normalizeKeyValueItems([
      { k: '年化 4%', v: '154.2 万' },
      { k: '年化 6%', v: '207.9 万' },
      { title: '年化 8%', text: '285.3 万' },
    ])
    expect(kv.map((e) => [e.label, e.value])).toEqual([
      ['年化 4%', '154.2 万'],
      ['年化 6%', '207.9 万'],
      ['年化 8%', '285.3 万'],
    ])

    const editorRows = normalizeKvEditorRows([
      { k: 'API_KEY', v: 'sk-live-secret-999' },
      { label: 'REGION', val: 'cn-hangzhou' },
    ])
    expect(editorRows).toEqual([
      { key: 'API_KEY', value: 'sk-live-secret-999', sensitive: true },
      { key: 'REGION', value: 'cn-hangzhou', sensitive: false },
    ])

    const apiParams = normalizeApiParamsAndHeaders(
      [{ k: 'limit', type: 'int', required: true }],
      [{ k: 'X-Tenant', v: 'fin-300' }],
    )
    expect(apiParams).toEqual([
      { name: 'limit', location: 'QUERY', type: 'int', required: true, description: '' },
      { name: 'X-Tenant', location: 'HEADER', type: 'fin-300', required: false, description: '' },
    ])

    const curl = buildEndpointCurl({
      method: 'GET',
      path: '/v1/orders',
      params: [{ k: 'limit', v: '50' }],
      headers: [{ k: 'X-Tenant', v: 'fin-300' }],
    })
    expect(curl).toContain('limit=50')
    expect(curl).toContain('X-Tenant: fin-300')
  })

  it('maintains secret-redaction parity for shorthand { k, v } / { label, val } KV rows', () => {
    expect(extractKvEntryKey({ k: 'OPENAI_API_KEY', v: 'sk-123456' })).toBe('OPENAI_API_KEY')
    expect(extractKvEntryKey({ label: 'DB_PASSWORD', val: 'supersecret' })).toBe('DB_PASSWORD')
    expect(isKvValueField('value')).toBe(true)
    expect(isKvValueField('val')).toBe(true)
    expect(isKvValueField('v')).toBe(true)
    expect(isKvValueField('key')).toBe(false)

    const ptrs = new Set<string>()
    const exact = new Set<string>()
    const sub = new Set<string>()
    collectKvSecretsFromValue(
      [
        { k: 'API_KEY', v: 'sk-live-alpha999' },
        { label: 'DB_PASSWORD', val: 'pw-beta888' },
        { k: 'APP_ENV', v: 'production' },
      ],
      '/env',
      ptrs,
      exact,
      sub,
    )
    expect(ptrs.has('/env/0/v')).toBe(true)
    expect(ptrs.has('/env/0/value')).toBe(true)
    expect(ptrs.has('/env/1/val')).toBe(true)
    expect(exact.has('sk-live-alpha999')).toBe(true)
    expect(exact.has('pw-beta888')).toBe(true)
    expect(exact.has('production')).toBe(false)

    const dmObscured = new Set<string>()
    collectKvSecretsForDataModelUpdate(
      '/env/0',
      { k: 'AUTH_TOKEN', v: 'tok-gamma777' },
      new Set(['/env']),
      dmObscured,
    )
    expect(dmObscured.has('/env/0/v')).toBe(true)
    expect(dmObscured.has('/env/0/val')).toBe(true)
    expect(dmObscured.has('/env/0/value')).toBe(true)

    const nodeExact = new Set<string>()
    const nodeSub = new Set<string>()
    collectSecretsFromNode(
      { rows: [{ k: 'SECRET_KEY', v: 'sec-delta666' }] },
      new Set(),
      nodeExact,
      nodeSub,
    )
    expect(nodeExact.has('sec-delta666')).toBe(true)

    const sanitized = sanitizePayloadObject(
      {
        env: [
          { k: 'API_KEY', v: 'sk-live-alpha999' },
          { label: 'DB_PASSWORD', val: 'pw-beta888' },
          { k: 'APP_ENV', v: 'production' },
        ],
      },
      ptrs,
      false,
      exact,
      sub,
    )
    expect(sanitized).toEqual({
      env: [{ k: 'API_KEY' }, { label: 'DB_PASSWORD' }, { k: 'APP_ENV', v: 'production' }],
    })
  })

  it('supports Stat.tone semantic override for negative spikes in both compiler and renderer', () => {
    const sessions = new SurfaceSessions(createGenerator(), true)
    const ui = [
      'surface("sre_stat_tone")',
      'root = Row([Stat("线程池占用", "100%", delta="已触顶", trend="up", tone="danger", weight=1), Stat("入口 P99", ">5s", delta="基线 120ms", trend="up", tone="warning", weight=1)])',
    ].join('\n')
    const msgs = sessions.compile('s1', ui)
    expect(msgs.length).toBeGreaterThan(0)

    expect(resolveStatPresentation('up', 'danger').tagTone).toBe('danger')
    expect(resolveStatPresentation('up', 'danger').sparkColor).toContain('error')
    expect(resolveStatPresentation('up', 'warning').tagTone).toBe('warning')
    expect(resolveStatPresentation('up', 'warning').sparkColor).toContain('warn')
    expect(resolveStatPresentation('up', undefined).tagTone).toBe('success')
    expect(resolveStatPresentation('down', undefined).tagTone).toBe('danger')
    expect(resolveStatPresentation('neutral', 'info').tagTone).toBe('info')
  })

  it('flattens nested FileTree children, renders directory summaries, and hides zero counts on stub dirs', () => {
    const flat = normalizeFileEntries([
      { path: 'specs', kind: 'dir', summary: '4 组 TLA+ 形式化规格' },
      {
        name: 'src',
        description: '核心源码',
        children: [{ name: 'index.ts', description: 'Host 插件入口' }],
      },
    ])
    expect(flat.map((f) => [f.path, f.kind, f.summary])).toEqual([
      ['specs', 'dir', '4 组 TLA+ 形式化规格'],
      ['src', 'dir', '核心源码'],
      ['src/index.ts', 'file', 'Host 插件入口'],
    ])

    const tree = buildFileTree([
      { path: 'specs', kind: 'dir', summary: '4 组 TLA+ 形式化规格' },
      { path: 'src/index.ts', kind: 'file', summary: 'Host 入口' },
    ])
    const specsNode = tree.find((n) => n.name === 'specs')
    expect(specsNode?.fileCount).toBe(0)
    expect(specsNode?.summary).toBe('4 组 TLA+ 形式化规格')

    const renderOf = (impl: unknown) => (impl as { rawRender: never }).rawRender
    const dummyCtx = {
      surfaceId: 's1',
      componentId: 'c1',
      context: {} as never,
      buildChild: () => null,
    }
    const html = renderToStaticMarkup(
      createElement(renderOf(DshFileTreeImpl), {
        ...dummyCtx,
        props: {
          title: '目录结构',
          expandedDepth: 3,
          items: [
            { path: 'specs', kind: 'dir', summary: '4 组 TLA+ 形式化规格' },
            { path: 'src/index.ts', kind: 'file', summary: 'Host 入口' },
          ],
        },
      }),
    )
    expect(html).toContain('4 组 TLA+ 形式化规格')
    expect(html).not.toContain('>0<')
    expect(html).toContain('>1<')
  })

  it('uses multiline chip styling for long KeyValue/Badge tags and enforces symmetric 4->2 grid & 660px bordered KV collapse', () => {
    const renderOf = (impl: unknown) => (impl as { rawRender: never }).rawRender
    const dummyCtx = {
      surfaceId: 's1',
      componentId: 'c1',
      context: {} as never,
      buildChild: () => null,
    }
    const kvHtml = renderToStaticMarkup(
      createElement(renderOf(DshKeyValueImpl), {
        ...dummyCtx,
        props: {
          bordered: true,
          columns: 2,
          items: [
            { label: '状态', value: '健康', tone: 'success' },
            {
              label: '主要风险',
              value: 'fd 上限未同步时，新连接在 fd 层先失败；建议先核 fs.file-max',
              tone: 'warning',
            },
          ],
        },
      }),
    )
    expect(kvHtml).toContain('multilineTag')

    const badgeHtml = renderToStaticMarkup(
      createElement(renderOf(DshBadgeImpl), {
        ...dummyCtx,
        props: {
          label: '这是一个超过十八个字符的长风控提示标签内容',
          tone: 'warning',
        },
      }),
    )
    expect(badgeHtml).toContain('multilineTag')

    const catalogCss = readExpandedCss(
      resolve(import.meta.dirname, '../src/client/catalog/Catalog.module.css'),
    )
    expect(catalogCss).toContain('@container (max-width: 660px)')
    expect(catalogCss).toMatch(
      /\.responsiveGrid\[data-columns="4"\]\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
    )
    expect(catalogCss).toMatch(
      /\.checkCardGrid\[data-columns="4"\]\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
    )
  })

  it('enforces anti-spelunking, chart data shapes, and silent self-repair in prompts and tool errors', async () => {
    expect(A2UI_SYSTEM_GUIDANCE).toContain('app.asar')
    expect(A2UI_SYSTEM_GUIDANCE).toContain('Repair any compile rejection silently')
    expect(A2UI_SYSTEM_GUIDANCE).toContain('quoted string keys')
    expect(SKILL_PREAMBLE).toContain('app.asar')

    const sessions = new SurfaceSessions(createGenerator(), true)
    const analyticsSkill = slicePromptSnippetByDomain(sessions.rawPromptSnippet(), 'analytics')
    expect(analyticsSkill).toContain('waterfall')
    expect(analyticsSkill).toContain('dumbbell')
    expect(analyticsSkill).toContain('bullet')
    expect(analyticsSkill).toContain('<=12 nodes')
    expect(analyticsSkill).toContain('neutral descriptors unprefixed')

    const renderTool = createRenderTool(sessions)
    await expect(
      renderTool.execute({ ui: 'surface("bad")\nroot = UnknownWidget()' }, {}),
    ).rejects.toThrow(/Fix it silently.*without mentioning compiler errors/i)

    const askTool = createAskTool(sessions, new PendingAskRegistry())
    await expect(
      askTool.execute({ ui: 'surface("bad_ask")\nroot = UnknownWidget()' }, {}),
    ).rejects.toThrow(/Fix it silently.*without mentioning compiler errors/i)
  })
})
