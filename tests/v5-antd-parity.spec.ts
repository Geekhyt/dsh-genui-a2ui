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

import { enrichActionWithSelection } from '../src/client/action-protocol.ts'
import {
  DshCheckCardImpl,
  DshDateRangeImpl,
  DshGridImpl,
  DshKeyValueImpl,
  DshMultiSelectImpl,
  DshNumberInputImpl,
  DshScheduleImpl,
  DshTableImpl,
  DshTrackerImpl,
  DshTreeImpl,
  DshTreeSelectImpl,
} from '../src/client/catalog/BasicWidgets.tsx'
import { dshReactCatalog } from '../src/client/catalog/index.ts'
import { normalizeKeyValueItems } from '../src/client/catalog/p0-helpers.ts'
import {
  buildDatePresetRange,
  clampAndStepNumber,
  collectAllBranchIds,
  computeDateRangeSpanDays,
  filterHierarchyTree,
  findBreadcrumbByValue,
  normalizeCheckCardOptions,
  normalizeHierarchyTree,
  normalizeMultiSelectMergedOptions,
} from '../src/client/catalog/v5-helpers.ts'
import { computeClampedPopoverBox } from '../src/client/catalog/widget-helpers.tsx'
import { SurfaceGroupView } from '../src/client/SurfaceView.tsx'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { DSH_COMPONENT_APIS, dshSchemaCatalog } from '../src/shared/catalog-schema.ts'

describe('Evolution v5: Ant Design 5.x / AntD Pro / AntD X Parity (57 Components Total)', () => {
  const V5_NAMES = [
    'NumberInput',
    'MultiSelect',
    'DateRange',
    'TreeSelect',
    'CheckCard',
    'Tree',
    'Grid',
  ] as const

  it('registers all 57 components across Host schema catalog and Client React catalog', () => {
    expect(DSH_COMPONENT_APIS).toHaveLength(57)
    const schemaNames = Object.keys(dshSchemaCatalog.toJson().components as Record<string, unknown>)
    const reactNames = [...dshReactCatalog.components.keys()]
    expect(schemaNames).toHaveLength(57)
    expect(reactNames).toHaveLength(57)
    expect(schemaNames).toEqual(expect.arrayContaining([...V5_NAMES]))
    expect(reactNames).toEqual(expect.arrayContaining([...V5_NAMES]))
  })

  it('compiles all 7 new v5 components + KeyValue(bordered=true) + Table(expandKey) + Checkable rules in A2UI Express', () => {
    const sessions = new SurfaceSessions(createGenerator())
    const program = [
      'surface("v5_antd_parity")',
      '$/replicas = 6',
      '$/concurrency = 128',
      '$/regions = ["cn-hangzhou", "cn-shanghai"]',
      '$/start = "2026-11-01"',
      '$/end = "2026-11-19"',
      '$/target = "prod/payments/checkout-api"',
      '$/tier = "h20-tp4"',
      '$/treeNodes = [',
      '  { label: "prod-cn-hz", children: [',
      '    { label: "payments", children: [',
      '      { label: "checkout-api", value: "prod/payments/checkout-api", badge: "12 Pods" }',
      '    ] }',
      '  ] }',
      ']',
      '$/traceNodes = [',
      '  { label: "POST /v1/checkout", metric: "184 ms", sharePct: 100, status: "warning", children: [',
      '    { label: "auth.verifyToken", metric: "14 ms", sharePct: 8, status: "healthy" },',
      '    { label: "risk.scoreOrder", metric: "142 ms", sharePct: 77, status: "error", badge: "慢调用" }',
      '  ] }',
      ']',
      '$/specs = [',
      '  { label: "租户编号", value: "TEN-2026-8842", mono: true },',
      '  { label: "合规等级", value: "SOC2 Type II", tone: "success" },',
      '  { label: "变更备注", value: "双十一峰值弹性扩容策略已就绪", span: 2 }',
      ']',
      '$/auditRows = [',
      '  { id: "AUD-901", action: "扩容副本 4->6", status: "已生效", detail: "operator=sre-bot\\ncluster=prod-cn-hz" }',
      ']',
      'estRps = calc("r * c * 1.25", { r: $/replicas, c: $/concurrency }, decimals=0)',
      'root = Card(Column([',
      '  Grid([',
      '    Stat("预估吞吐峰值", estRps, caption="RPS", trend="up"),',
      '    Stat("生效可用区", "2", caption="多活容灾"),',
      '    Stat("当前目标副本", $/replicas, caption="Pods")',
      '  ], columns=3, gap="md"),',
      '  Row([',
      '    NumberInput("目标副本数", $/replicas, min=1, max=32, step=1, unit="Pods", weight=1, ?numeric(1, 32, "副本范围 1–32")),',
      '    NumberInput("单实例并发上限", $/concurrency, min=16, max=1024, step=16, prefix="×", unit="req", weight=1)',
      '  ]),',
      '  MultiSelect("容灾多活地域", [{ value: "cn-hangzhou", label: "华东1（杭州）" }, { value: "cn-shanghai", label: "华东2（上海）" }, { value: "cn-beijing", label: "华北2（北京）" }], $/regions, allowCreate=true, ?required("至少选择 1 个地域")),',
      '  DateRange("灰度观测时间窗", start=$/start, end=$/end, presets=true),',
      '  TreeSelect("发布目标服务", $/treeNodes, $/target, searchable=true),',
      '  CheckCard("算力规格档位", [{ value: "l20-tp2", title: "L20 · TP2 标准型", badge: "¥18/h", description: "适合中小并发在线服务" }, { value: "h20-tp4", title: "H20 · TP4 旗舰型", badge: "¥46/h", recommended: true, description: "适合长上下文低延迟推理" }], value=$/tier, columns=2),',
      '  KeyValue($/specs, title="变更工单详情（Bordered Descriptions）", columns=2, bordered=true, copyable=true),',
      '  Tree($/traceNodes, title="全链路 APM 调用瀑布树", summary="P99 184 ms", searchable=true, action=Event("inspect_span")),',
      '  Table($/auditRows, title="变更审计流水", expandKey="detail", searchable=true),',
      '  CheckCard("推荐下一步诊断", [{ value: "flamegraph", title: "生成 risk.scoreOrder 火焰图", description: "定位 142ms 慢调用栈" }, { value: "canary_rollback", title: "演练一键回滚脚本", description: "验证 5s 内切流恢复" }], columns=2, action=Event("next_prompt"))',
      ']))',
    ].join('\n')

    const compiled = sessions.compile('sess-v5', program)
    expect(compiled.length).toBeGreaterThan(0)
    const createMsg = compiled.find((m) => 'createSurface' in m) as
      | { createSurface: { components?: Array<{ component: string }> } }
      | undefined
    const used = (createMsg?.createSurface.components ?? []).map((c) => c.component)
    expect(used).toEqual(expect.arrayContaining([...V5_NAMES, 'KeyValue', 'Table', 'Stat']))

    const envelopes = compiled.flatMap((part) => ('a2ui' in part ? part.a2ui : [part]))
    const shellHtml = renderToStaticMarkup(
      createElement(SurfaceGroupView, {
        messages: envelopes as never,
        readOnly: false,
      }),
    )
    expect(typeof shellHtml).toBe('string')
  })

  it('renders SSR markup cleanly across all 7 v5 widgets + bordered KeyValue + expandable Table', () => {
    const renderOf = (impl: unknown) => (impl as { rawRender: never }).rawRender
    const dummyCtx = {
      surfaceId: 's1',
      componentId: 'c1',
      dataContextPath: '/',
      buildChild: (id: string) => createElement('div', { key: id, 'data-child': id }, id),
    }

    const numHtml = renderToStaticMarkup(
      createElement(renderOf(DshNumberInputImpl), {
        ...dummyCtx,
        props: { label: '副本数', value: 6, min: 1, max: 32, step: 1, unit: 'Pods', prefix: '#' },
      }),
    )
    expect(numHtml).toContain('data-a2ui-numberinput')
    expect(numHtml).toContain('Pods')

    const multiHtml = renderToStaticMarkup(
      createElement(renderOf(DshMultiSelectImpl), {
        ...dummyCtx,
        props: {
          label: '地域',
          options: [
            { value: 'hz', label: '杭州' },
            { value: 'sh', label: '上海' },
          ],
          value: ['hz', 'custom-tag'],
          allowCreate: true,
        },
      }),
    )
    expect(multiHtml).toContain('data-a2ui-multiselect')
    expect(multiHtml).toContain('杭州')
    expect(multiHtml).toContain('custom-tag')

    const rangeHtml = renderToStaticMarkup(
      createElement(renderOf(DshDateRangeImpl), {
        ...dummyCtx,
        props: { label: '观测窗口', start: '2026-11-01', end: '2026-11-07', presets: true },
      }),
    )
    expect(rangeHtml).toContain('data-a2ui-daterange')
    expect(rangeHtml).toContain('7')

    const treeSelHtml = renderToStaticMarkup(
      createElement(renderOf(DshTreeSelectImpl), {
        ...dummyCtx,
        props: {
          label: '服务',
          nodes: [{ label: 'prod', children: [{ label: 'gateway', value: 'prod/gateway' }] }],
          value: 'prod/gateway',
        },
      }),
    )
    expect(treeSelHtml).toContain('data-a2ui-treeselect')
    expect(treeSelHtml).toContain('prod / gateway')

    const checkHtml = renderToStaticMarkup(
      createElement(renderOf(DshCheckCardImpl), {
        ...dummyCtx,
        props: {
          label: '规格',
          options: [{ value: 'pro', title: '旗舰版', badge: '¥99', recommended: true }],
          value: 'pro',
          setValue: () => {},
        },
      }),
    )
    expect(checkHtml).toContain('data-a2ui-checkcard')
    expect(checkHtml).toContain('旗舰版')

    const treeHtml = renderToStaticMarkup(
      createElement(renderOf(DshTreeImpl), {
        ...dummyCtx,
        props: {
          title: '调用链',
          nodes: [
            {
              label: 'GET /orders',
              metric: '92 ms',
              sharePct: 100,
              status: 'healthy',
              children: [{ label: 'db.query', metric: '48 ms', sharePct: 52, status: 'warning' }],
            },
          ],
        },
      }),
    )
    expect(treeHtml).toContain('data-a2ui-tree')
    expect(treeHtml).toContain('GET /orders')
    expect(treeHtml).toContain('db.query')

    const gridHtml = renderToStaticMarkup(
      createElement(renderOf(DshGridImpl), {
        ...dummyCtx,
        buildChild: dummyCtx.buildChild,
        props: { children: ['k1', 'k2', 'k3'], columns: 3, gap: 'md' },
      }),
    )
    expect(gridHtml).toContain('data-a2ui-grid')
    expect(gridHtml).toContain('data-columns="3"')

    const kvHtml = renderToStaticMarkup(
      createElement(renderOf(DshKeyValueImpl), {
        ...dummyCtx,
        props: {
          title: '工单摘要',
          bordered: true,
          columns: 2,
          items: [
            { label: '单号', value: 'WO-101', mono: true },
            { label: '说明', value: '跨两列备注', span: 2 },
          ],
        },
      }),
    )
    expect(kvHtml).toContain('data-bordered="true"')
    expect(kvHtml).toContain('--kv-span:2')

    const tblHtml = renderToStaticMarkup(
      createElement(renderOf(DshTableImpl), {
        ...dummyCtx,
        props: {
          title: '可展开表格',
          expandKey: 'trace',
          rows: [{ service: 'checkout', latency: '42ms', trace: 'span_01 -> span_02' }],
        },
      }),
    )
    expect(tblHtml).toContain('checkout')
    expect(tblHtml).not.toContain('span_01 -&gt; span_02')
    expect(tblHtml).toContain('▸')
  })

  it('validates v5 pure helpers & dshSelection enrichment for checkCard and tree', () => {
    expect(clampAndStepNumber({ current: 0.1, delta: 2, min: 0, max: 1, step: 0.1 })).toBe(0.3)
    expect(clampAndStepNumber({ current: 31, delta: 5, min: 1, max: 32, step: 1 })).toBe(32)

    const merged = normalizeMultiSelectMergedOptions(
      [{ value: 'a', label: 'Alpha' }],
      ['a', 'custom-x'],
    )
    expect(merged).toHaveLength(2)
    expect(merged[1]).toEqual({ value: 'custom-x', label: 'custom-x' })

    expect(computeDateRangeSpanDays('2026-11-01', '2026-11-07')).toBe(7)
    const preset = buildDatePresetRange(7, false, '2026-11-19')
    expect(preset).toEqual({ start: '2026-11-13', end: '2026-11-19' })

    const tree = normalizeHierarchyTree([
      {
        label: 'ClusterA',
        children: [
          { label: 'ns-pay', children: [{ label: 'order-svc', value: 'a/pay/order' }] },
          { label: 'ns-search', children: [{ label: 'rank-svc', value: 'a/search/rank' }] },
        ],
      },
    ])
    expect(findBreadcrumbByValue(tree, 'a/pay/order')).toBe('ClusterA / ns-pay / order-svc')
    expect(collectAllBranchIds(tree)).toHaveLength(3)

    const filtered = filterHierarchyTree(tree, 'rank')
    expect(filtered[0]?.children).toHaveLength(1)
    expect(filtered[0]?.children[0]?.label).toBe('ns-search')

    const cards = normalizeCheckCardOptions([
      'Quick Start',
      { value: 'deep', title: 'Deep Audit', recommended: true, badge: 'Pro' },
    ])
    expect(cards).toHaveLength(2)
    expect(cards[1]?.recommended).toBe(true)

    const kvEntries = normalizeKeyValueItems([
      { label: 'A', value: '1', span: 3 },
      { label: 'B', value: '2' },
    ])
    expect(kvEntries[0]?.span).toBe(3)
    expect(kvEntries[1]).toEqual({ label: 'B', value: '2', mono: false, copyable: false })

    const enriched = enrichActionWithSelection({
      name: 'next_prompt',
      surfaceId: 's1',
      sourceComponentId: 'cc1',
      timestamp: '2026-11-19T00:00:00Z',
      context: {},
      metadata: {
        extensions: {
          dshSelection: {
            source: 'checkCard',
            label: '生成火焰图',
            value: 'flamegraph',
          },
        },
      },
    } as never)
    expect(enriched.userMessage).toContain('生成火焰图')
    expect((enriched.context as Record<string, unknown>).selection).toMatchObject({
      source: 'checkCard',
      value: 'flamegraph',
    })
  })

  it('guards Schedule narrow Gantt labels, 90-slice Tracker density, and right-edge Popover clamping', () => {
    const renderOf = (impl: unknown) => (impl as { rawRender: never }).rawRender
    const dummyCtx = {
      surfaceId: 's_guard',
      componentId: 'c_guard',
      dataContextPath: '/',
      buildChild: () => null,
    }

    const schedHtml = renderToStaticMarkup(
      createElement(renderOf(DshScheduleImpl), {
        ...dummyCtx,
        props: {
          title: '窄条排期测试',
          range: ['00:00', '06:00'],
          items: [
            { title: '短时闪断演练', start: '00:05', end: '00:15', note: '00:05 准时注入故障' },
            { title: '尾段收口验证', start: '05:45', end: '05:55', progress: 100 },
          ],
        },
      }),
    )
    expect(schedHtml).toContain('data-narrow="true"')
    expect(schedHtml).toContain('00:05 准时注入故障')
    expect(schedHtml).toContain('left:calc(')
    expect(schedHtml).toContain('right:calc(')

    const slices90 = Array.from({ length: 90 }, (_, i) => ({
      label: `D-${90 - i}`,
      status: i === 42 ? 'warning' : 'ok',
    }))
    const trackerHtml = renderToStaticMarkup(
      createElement(renderOf(DshTrackerImpl), {
        ...dummyCtx,
        props: { title: '90天可用性', data: slices90 },
      }),
    )
    expect(trackerHtml).toContain('gap:1px')
    expect(trackerHtml).toContain('minmax(1.5px, 1fr)')

    // Default SSR viewport is 1024x800; a narrow right-edge trigger at left=910 must shift left so left+width <= 1016
    const clamped = computeClampedPopoverBox(
      { top: 120, bottom: 156, left: 910, width: 100 },
      { minWidth: 240, estHeight: 260 },
    )
    expect(clamped.width).toBe(240)
    expect(clamped.left + clamped.width).toBeLessThanOrEqual(1016)
    expect(clamped.left).toBeGreaterThanOrEqual(8)
  })

  it('compiles every exported SHOWCASE_*_UI example in scripts/mock-llm.mjs cleanly', async () => {
    const mockHref = new URL('../scripts/mock-llm.mjs', import.meta.url).href
    const mockMod = (await import(mockHref)) as Record<string, unknown>
    const sessions = new SurfaceSessions(createGenerator())
    const showcaseEntries = Object.entries(mockMod).filter(
      ([k, v]) => k.startsWith('SHOWCASE_') && k.endsWith('_UI') && typeof v === 'string',
    )
    expect(showcaseEntries.length).toBeGreaterThanOrEqual(15)
    for (const [name, dsl] of showcaseEntries) {
      const compiled = sessions.compile(`mock_${name}`, dsl as string)
      expect(compiled.length, `${name} failed to compile`).toBeGreaterThan(0)
    }
  })
})
