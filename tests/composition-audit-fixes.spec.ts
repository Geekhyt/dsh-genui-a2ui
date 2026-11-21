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

import type { ReactCatalogComponent } from '@a2ui/react'
import { ComponentContext, GenericBinder, MessageProcessor } from '@a2ui/web_core/v1_0'
import { DshAccordionImpl, DshCheckCardImpl } from '../src/client/catalog/BasicWidgets.tsx'
import { computeCond } from '../src/client/catalog/functions.ts'
import { DSH_CLIENT_CATALOGS } from '../src/client/catalog/index.ts'
import { filterTableRowsByField } from '../src/client/catalog/v4-helpers.ts'
import { isWritableProp, weightStyle } from '../src/client/catalog/widget-helpers.tsx'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { prepareMermaidSvg, repairMermaidSource } from '../src/client/mermaid-safe.ts'
import { normalizeStreamingProgram, StreamingExpressSession } from '../src/client/streaming.ts'
import {
  A2UI_SURFACE_NODE_KIND,
  type ChatTargetSnapshot,
  resolveDockBatch,
  resolveTurnTailBatch,
} from '../src/client/turn-surfaces.ts'
import { SurfaceSessions } from '../src/host/generator.ts'
import { AccordionApi, CheckCardApi } from '../src/shared/catalog-schema.ts'
import { isSecretKey } from '../src/shared/constants.ts'
import { preprocessExpressProgram } from '../src/shared/express-preprocess.ts'

describe('Generalized Multi-Component Composition & Runtime Fixes', () => {
  it('detects real writable bindings via isWritableProp and renders CheckCard prompt mode in SurfaceGroupView', () => {
    const noop = () => {}
    expect(isWritableProp({ componentModel: { properties: {} } }, 'value', noop)).toBe(false)
    expect(
      isWritableProp({ componentModel: { properties: { value: 'static' } } }, 'value', noop),
    ).toBe(false)
    expect(
      isWritableProp(
        { componentModel: { properties: { value: { '@path': '/tier' } } } },
        'value',
        noop,
      ),
    ).toBe(true)
    expect(
      isWritableProp(
        { componentModel: { properties: { value: { path: '/tier' } } } },
        'value',
        noop,
      ),
    ).toBe(true)

    const sessions = new SurfaceSessions()
    const ui = [
      'surface("prompt_check")',
      '$/opts = [{ value: "a", title: "Step A" }, { value: "b", title: "Step B" }]',
      '$/tags = []',
      'root = Column([',
      '  Badge(cond($/tags, "Has Tags", "No Tags"), tone="info"),',
      '  CheckCard("Next Actions", $/opts, action=Event("go_next"))',
      '])',
    ].join('\n')
    const compiled = sessions.compile('s-prompt', ui)
    const processor = new MessageProcessor<ReactCatalogComponent>(
      [...DSH_CLIENT_CATALOGS],
      () => {},
    )
    processor.processMessages(compiled as never)
    const surface = processor.getSurfaces().get('prompt_check')
    expect(surface).toBeDefined()
    const checkCardId = [...surface!.componentsModel.entries].find(
      ([, m]) => m.type === 'CheckCard',
    )?.[0]
    const badgeId = [...surface!.componentsModel.entries].find(([, m]) => m.type === 'Badge')?.[0]
    expect(checkCardId).toBeDefined()
    expect(badgeId).toBeDefined()

    const ccCtx = new ComponentContext(surface!, checkCardId!, '/')
    const ccBinder = new GenericBinder(ccCtx, CheckCardApi.schema)
    const ccResolved = (ccBinder.snapshot ?? {}) as Record<string, unknown>
    const ccRender = (DshCheckCardImpl as unknown as { rawRender: never }).rawRender
    const ccHtml = renderToStaticMarkup(
      createElement(ccRender, {
        props: {
          ...ccResolved,
          setValue: () => {},
          action: async () => {},
        },
        context: ccCtx,
        buildChild: () => null,
      }),
    )
    expect(ccHtml).toContain('data-prompt="true"')
    expect(ccHtml).toContain('↗')

    const badgeCtx = new ComponentContext(surface!, badgeId!, '/')
    const badgeVal = badgeCtx.dataContext.resolveDynamicValue(
      badgeCtx.componentModel.properties.label as never,
    )
    expect(badgeVal).toBe('No Tags')
  })

  it('supports Checkable checks on DateRange and defaultOpen on Accordion', () => {
    const sessions = new SurfaceSessions()
    const ui = [
      'surface("dr_acc")',
      '$/s = "2026-11-01"',
      '$/e = "2026-11-05"',
      'root = Column([',
      '  DateRange("Window", start=$/s, end=$/e, ?required("Need window")),',
      '  Accordion([{ title: "Section 1", defaultOpen: true, child: Text("Visible body") }])',
      '])',
    ].join('\n')
    const compiled = sessions.compile('s-dr', ui)
    const processor = new MessageProcessor<ReactCatalogComponent>(
      [...DSH_CLIENT_CATALOGS],
      () => {},
    )
    processor.processMessages(compiled as never)
    const surface = processor.getSurfaces().get('dr_acc')
    expect(surface).toBeDefined()
    const accId = [...surface!.componentsModel.entries].find(([, m]) => m.type === 'Accordion')?.[0]
    expect(accId).toBeDefined()
    const accCtx = new ComponentContext(surface!, accId!, '/')
    const accBinder = new GenericBinder(accCtx, AccordionApi.schema)
    const accResolved = (accBinder.snapshot ?? {}) as Record<string, unknown>
    const accRender = (DshAccordionImpl as unknown as { rawRender: never }).rawRender
    const accHtml = renderToStaticMarkup(
      createElement(accRender, {
        props: accResolved,
        context: accCtx,
        buildChild: (id: string) => createElement('span', { key: id }, 'Visible body'),
      }),
    )
    expect(accHtml).toContain('aria-expanded="true"')
    expect(accHtml).toContain('Visible body')
  })

  it('clamps weightStyle minWidth with min(100%, ...) and guards narrow layout CSS rules', () => {
    expect(weightStyle(1, 240)?.minWidth).toBe('min(100%, 240px)')
    expect(weightStyle(1, 0)?.minWidth).toBe(0)

    const catalogCss = readFileSync(
      resolve(process.cwd(), 'src/client/catalog/Catalog.module.css'),
      'utf8',
    )
    const surfaceCss = readFileSync(
      resolve(process.cwd(), 'src/client/SurfaceView.module.css'),
      'utf8',
    )
    expect(surfaceCss).toMatch(/\.bare\s*\{[^}]*overflow:\s*visible;/s)
    expect(surfaceCss).toMatch(/\.surfaceStack\s*\{[^}]*--a2ui-flex-basis:\s*auto;/s)
    expect(catalogCss).toContain('.diffSplitGutterCol')
    expect(catalogCss).toContain('.tabsHeaderScroll')
    expect(catalogCss).toMatch(/@container\s*\(max-width:\s*260px\)\s*\{[^}]*\.metricRingInner/s)
    expect(catalogCss).toMatch(/@container\s*\(max-width:\s*340px\)\s*\{[^}]*\.dateRangeInputs/s)
    expect(catalogCss).toContain('var(--tree-depth, 0)')
  })

  it('normalizes -> and → in cross-filter and tightens 2-char substring false positives', () => {
    const rows = [
      { id: '1', route: 'API -> DB', region: 'US', status: 'running' },
      { id: '2', route: 'API -> Cache', region: 'EU', status: 'cluster_ok' },
    ]
    const arrowHit = filterTableRowsByField(rows, 'route', 'API → DB')
    expect(arrowHit).toHaveLength(1)
    expect(arrowHit[0]?.id).toBe('1')

    const noFalsePos = filterTableRowsByField(
      [{ id: '1', note: 'status cluster' }],
      undefined,
      'US',
    )
    expect(noFalsePos).toHaveLength(0)

    expect(computeCond([], 'YES', 'NO')).toBe('NO')
    expect(computeCond(['a'], 'YES', 'NO')).toBe('YES')
    expect(computeCond(Number.NaN, 'YES', 'NO')).toBe('NO')
  })

  it('applies dark-safe ECharts defaults, ctrl-gated zoom, treemap nodeClick=false, and line cross-filter dimming at 276px', () => {
    const heat = buildChartOption(
      {
        kind: 'heatmap',
        data: [
          { day: 'Mon', slot: 'AM', val: 10 },
          { day: 'Tue', slot: 'PM', val: 90 },
        ],
        xField: 'day',
        yField: 'slot',
        sizeField: 'val',
      },
      true,
      276,
    ) as Record<string, unknown>
    const xAxis = heat.xAxis as { splitArea?: { areaStyle?: { color?: string[] } } }
    expect(xAxis.splitArea?.areaStyle?.color).toBeDefined()
    expect((heat.tooltip as { position?: unknown })?.position).toBeUndefined()

    const bar = buildChartOption(
      {
        kind: 'bar',
        data: [
          { k: 'A', v: 10 },
          { k: 'B', v: 20 },
        ],
        xField: 'k',
        yField: 'v',
        zoom: true,
      },
      true,
      276,
    ) as { dataZoom?: Array<Record<string, unknown>> }
    expect(bar.dataZoom?.[0]?.zoomOnMouseWheel).toBe('ctrl')
    expect((bar.dataZoom?.[1]?.handleStyle as { color?: string })?.color).toBe('#334155')

    const treemap = buildChartOption(
      {
        kind: 'treemap',
        data: [{ name: 'Root', value: 100, children: [{ name: 'Leaf', value: 100 }] }],
      },
      true,
      276,
    ) as { series?: Array<Record<string, unknown>> }
    expect(treemap.series?.[0]?.nodeClick).toBe(false)

    const graph = buildChartOption(
      {
        kind: 'graph',
        data: {
          nodes: [
            { name: 'A', value: 10 },
            { name: 'B', value: 20 },
          ],
          links: [{ source: 'A', target: 'B' }],
        },
      },
      true,
      276,
    ) as { series?: Array<Record<string, unknown>> }
    expect(graph.series?.[0]?.roam).toBe('move')

    const line = buildChartOption(
      {
        kind: 'line',
        data: [
          { route: 'API -> DB', reqs: 100, p99: 20 },
          { route: 'API -> Cache', reqs: 200, p99: 10 },
        ],
        xField: 'route',
        yField: ['reqs', 'p99'],
        selected: 'API -> DB',
      },
      true,
      276,
    ) as {
      legend?: Record<string, unknown>
      series?: Array<{ lineStyle?: { opacity?: number } }>
    }
    expect(line.legend?.inactiveColor).toBeDefined()
    expect(line.series?.[0]?.lineStyle?.opacity).toBeLessThan(1)
  })

  it('recovers degenerate Mermaid viewBox="0 0 0 0", adds preserveAspectRatio, and preserves rgb() styles', () => {
    const prepared = prepareMermaidSvg('<svg viewBox="0 0 0 0" width="500" height="300"></svg>')
    expect(prepared.markup).toContain('viewBox="0 0 500 300"')
    expect(prepared.markup).toContain('preserveAspectRatio="xMidYMid meet"')

    const repaired = repairMermaidSource(
      'flowchart LR\nA[Start] --> B[End]\nstyle A fill:rgb(10, 20, 30)',
    )
    expect(repaired).toContain('fill:rgb(10, 20, 30)')
  })

  it('hardens Express preprocessor for #/-- comments with apostrophes, @-prefixed cond keys, and trailing commas', () => {
    const withComment = [
      'surface("s1")',
      "# Don't fail here",
      '$/name = "World"',
      'root = Text("Hello " + $/name)',
    ].join('\n')
    expect(preprocessExpressProgram(withComment)).toContain('concat(["Hello ", $/name])')

    const withAtKeys = [
      'surface("s1")',
      '$/owner = "@DBA"',
      'root = Text(cond(eq($/owner, "@DBA"), "Database", cond(eq($/owner, "@SRE"), "Reliability", "Other")))',
    ].join('\n')
    const sessions = new SurfaceSessions()
    expect(() => sessions.compile('s-at', withAtKeys)).not.toThrow()

    const withTrailing = [
      'surface("s1")',
      '$/a = 10',
      'x = calc("a * 2", { a: $/a, })',
      'y = calc("x + 5", { x: x },)',
      'root = Text(formatNumber(y, 0))',
    ].join('\n')
    expect(preprocessExpressProgram(withTrailing)).toContain('(a * 2) + 5')
  })

  it('recovers StreamingExpressSession after double-wrapping and mid-stream rejection, handles deleteSurface, and preserves benign token metrics', () => {
    const dbl = '```a2ui\n<a2ui>\nsurface("s1")\nroot = Text("Hi")\n</a2ui>\n```'
    expect(normalizeStreamingProgram(dbl)).toBe('surface("s1")\nroot = Text("Hi")')

    const stream = new StreamingExpressSession()
    const bad = stream.advance('surface("s1")\nroot = UnknownWidget("x")\n', false)
    expect(bad.error).not.toBeNull()
    const healed = stream.advance('surface("s1")\nroot = Text("Recovered")\n', true)
    expect(healed.error).toBeNull()
    expect(healed.messages.length).toBeGreaterThan(0)

    const dockNodes = [
      {
        key: 'a2ui:c1',
        kind: A2UI_SURFACE_NODE_KIND,
        id: 'c1',
        anchorSeq: 1,
        location: { turn: { turn: 1, status: 'closed' } },
        data: {
          callId: 'c1',
          turn: 1,
          seq: 1,
          title: 'Dock',
          placement: 'dock',
          surfaceIds: ['pipe'],
          messages: [{ version: '1.0', createSurface: { surfaceId: 'pipe', catalogId: 'basic' } }],
        },
      },
      {
        key: 'a2ui:c2',
        kind: A2UI_SURFACE_NODE_KIND,
        id: 'c2',
        anchorSeq: 2,
        location: { turn: { turn: 2, status: 'closed' } },
        data: {
          callId: 'c2',
          turn: 2,
          seq: 2,
          title: 'Delete',
          placement: 'dock',
          surfaceIds: ['pipe'],
          messages: [{ version: '1.0', deleteSurface: { surfaceId: 'pipe' } }],
        },
      },
    ]
    const dockSnap = { nodes: { values: () => dockNodes } } as unknown as ChatTargetSnapshot
    expect(resolveDockBatch(dockSnap)).toBeNull()

    const multiTurnNodes = [
      {
        key: 'a2ui:m1',
        kind: A2UI_SURFACE_NODE_KIND,
        id: 'm1',
        anchorSeq: 1,
        location: { turn: { turn: 1, status: 'closed' } },
        data: {
          callId: 'm1',
          turn: 1,
          seq: 1,
          title: 'Turn 1',
          placement: 'answer',
          surfaceIds: ['s1', 's2'],
          messages: [
            { version: '1.0', createSurface: { surfaceId: 's1', catalogId: 'basic' } },
            { version: '1.0', createSurface: { surfaceId: 's2', catalogId: 'basic' } },
          ],
        },
      },
      {
        key: 'a2ui:m2',
        kind: A2UI_SURFACE_NODE_KIND,
        id: 'm2',
        anchorSeq: 2,
        location: { turn: { turn: 2, status: 'closed' } },
        data: {
          callId: 'm2',
          turn: 2,
          seq: 2,
          title: 'Turn 2',
          placement: 'answer',
          surfaceIds: ['s1'],
          messages: [
            { version: '1.0', updateDataModel: { surfaceId: 's1', path: '/a', value: 1 } },
          ],
        },
      },
    ]
    const multiSnap = { nodes: { values: () => multiTurnNodes } } as unknown as ChatTargetSnapshot
    expect(resolveTurnTailBatch(multiSnap, 1)?.superseded).toBe(true)

    expect(isSecretKey('tokenPerSec')).toBe(false)
    expect(isSecretKey('tokenSpeed')).toBe(false)
    expect(isSecretKey('tokenBudget')).toBe(false)
    expect(isSecretKey('accessToken')).toBe(true)
    expect(isSecretKey('apiKey')).toBe(true)
  })

  it('guards ECharts chromatic palette against monochrome host tokens, enforces [hidden], avoids @container self-queries, and thins compact Gantt ticks', () => {
    const echartsSrc = readFileSync(
      resolve(__dirname, '../src/client/chunks/echarts-chunk.ts'),
      'utf8',
    )
    const mermaidSrc = readFileSync(
      resolve(__dirname, '../src/client/chunks/mermaid-chunk.ts'),
      'utf8',
    )
    const catalogCss = readFileSync(
      resolve(__dirname, '../src/client/catalog/Catalog.module.css'),
      'utf8',
    )
    const dockCss = readFileSync(resolve(__dirname, '../src/client/DockView.module.css'), 'utf8')
    const surfaceCss = readFileSync(
      resolve(__dirname, '../src/client/SurfaceView.module.css'),
      'utf8',
    )

    expect(echartsSrc).toContain('isChromaticCanvasColor')
    expect(echartsSrc).toContain('--dsw-alias-state-business-primary')
    expect(echartsSrc).not.toContain("'--dsw-alias-brand-primary'")
    expect(mermaidSrc).toContain('--dsw-alias-state-business-primary')

    const barDark = buildChartOption(
      {
        kind: 'bar',
        data: [
          { k: 'A', v: 10 },
          { k: 'B', v: 20 },
        ],
        xField: 'k',
        yField: 'v',
      },
      true,
      276,
    ) as { color?: string[] }
    expect(barDark.color?.[0]).toBe('#60a5fa')

    expect(catalogCss).toContain('.tabPanel[hidden]')
    expect(catalogCss).toContain('.accordionPanel[hidden]')
    expect(catalogCss).toContain('.calloutBody[hidden]')
    expect(dockCss).toContain('.body[hidden]')
    expect(surfaceCss).toContain('.card [hidden]')

    expect(catalogCss).toContain('.metricRingInner')
    expect(catalogCss).toMatch(/@container \(max-width: 260px\)\s*\{\s*\.metricRingInner\s*\{/)
    expect(catalogCss).toContain('g[class~="tick"]:nth-of-type(even) text')
    expect(catalogCss).toContain('.treeSearchHeader input')
  })
})
