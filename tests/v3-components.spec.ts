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
import { dshReactCatalog } from '../src/client/catalog/index.ts'
import {
  buildServiceGraphLayout,
  computeMetricRingGeometry,
  normalizeComparisonData,
  normalizeKanbanColumns,
  normalizeLogEntries,
  normalizeSelectOptions,
  normalizeSourceItems,
  parseComparisonCell,
} from '../src/client/catalog/v3-helpers.ts'
import { SurfaceGroupView } from '../src/client/SurfaceView.tsx'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { DSH_COMPONENT_APIS, dshSchemaCatalog } from '../src/shared/catalog-schema.ts'

describe('Evolution v3: 10 New A2UI 1.0 Components (42 Total)', () => {
  const V3_NAMES = [
    'Select',
    'Segmented',
    'Switch',
    'Comparison',
    'LogViewer',
    'Timeline',
    'Kanban',
    'SourceList',
    'MetricRing',
    'ServiceGraph',
  ] as const

  it('registers all 10 v3 components in both Host schema catalog and Client React catalog (57 total)', () => {
    expect(DSH_COMPONENT_APIS).toHaveLength(57)
    const schemaNames = Object.keys(dshSchemaCatalog.toJson().components as Record<string, unknown>)
    const reactNames = [...dshReactCatalog.components.keys()]
    expect(schemaNames).toHaveLength(57)
    expect(reactNames).toHaveLength(57)
    expect(schemaNames).toEqual(expect.arrayContaining([...V3_NAMES]))
    expect(reactNames).toEqual(expect.arrayContaining([...V3_NAMES]))
  })

  it('compiles all 10 v3 components in A2UI Express including Checkable ?required rules and nested Timeline child', () => {
    const sessions = new SurfaceSessions(createGenerator())
    const program = [
      'surface("v3_all_in_one")',
      '$/env = "prod"',
      '$/period = "monthly"',
      '$/autoScale = true',
      '$/cmpOpts = [{ key: "pg", title: "PostgreSQL 17", subtitle: "关系型主力", recommended: true, badge: "推荐" }, { key: "es", title: "Elasticsearch", subtitle: "全文检索" }]',
      '$/cmpRows = [{ label: "ACID 事务", values: { pg: "ok:完整支持", es: "no:最终一致" } }, { label: "向量混合检索", values: { pg: "warn:pgvector HNSW", es: "ok:原生稠密+稀疏" } }]',
      '$/logs = [{ time: "10:41:02", level: "error", service: "order-api", message: "Connection pool exhausted", detail: "Error: timeout after 5000ms\\n  at Pool.acquire (src/db.ts:48)", filePath: "src/index.ts", line: 48 }, { time: "10:41:05", level: "info", service: "k8s-hpa", message: "Scaled replicas 4 -> 8" }]',
      '$/cols = [{ id: "todo", title: "待排查", tone: "warning", cards: [{ id: "c1", title: "补充连接池告警", priority: "high", tag: "SRE", assignee: "后端组", meta: "#204" }] }, { id: "done", title: "已闭环", tone: "success", cards: [{ id: "c2", title: "扩容只读副本", priority: "medium" }] }]',
      '$/sources = [{ title: "A2UI v1.0 Specification", url: "https://a2ui.org/spec", snippet: "Thin-Schema Smart-Client declarative rendering contract.", score: 0.96, badge: "Spec" }, { title: "Host Generator Entry", filePath: "src/host/generator.ts", line: 96, snippet: "Creates A2UI request processor over 42-component catalog.", score: 91 }]',
      '$/nodes = [{ id: "gw", label: "API Gateway", status: "healthy", metric: "12ms" }, { id: "ord", label: "Order Service", status: "warning", metric: "184ms" }, { id: "db", label: "Primary DB", status: "error", metric: "96% CPU" }]',
      '$/edges = [{ from: "gw", to: "ord", label: "1.4k rps", status: "healthy" }, { from: "ord", to: "db", label: "pool wait", status: "error" }]',
      'root = Card(Column([',
      '  Row([',
      '    Select("部署集群", [{ value: "prod", label: "生产集群 (cn-hz)", description: "多可用区高可用" }, { value: "stg", label: "预发环境" }], $/env, searchable=true, ?required("请选择部署集群"), weight=1),',
      '    Segmented("计费周期", [{ value: "monthly", label: "按月" }, { value: "yearly", label: "按年 (-20%)" }], $/period, ?required("请选择周期"), weight=1)',
      '  ]),',
      '  Switch("启用弹性扩缩容 (HPA)", $/autoScale, description="CPU > 75% 时自动扩容副本", ?required("请确认开关")),',
      '  Row([',
      '    MetricRing("CPU 水位", 89, sublabel="57 / 64 Cores", tone="auto", weight=1),',
      '    MetricRing("SLO 达标率", 99.95, unit="%", sublabel="近 30 天", tone="success", weight=1)',
      '  ]),',
      '  Comparison($/cmpOpts, $/cmpRows, title="存储引擎选型对比", action=Event("choose_engine")),',
      '  ServiceGraph($/nodes, $/edges, title="核心调用链拓扑", direction="LR", action=Event("inspect_node")),',
      '  LogViewer($/logs, title="order-api · 诊断日志", searchable=true, action=Event("diagnose_log")),',
      '  Timeline([',
      '    { time: "10:41", title: "连接池告警触发", status: "danger", actor: "prometheus", detail: "active_conns=200/200" },',
      '    { time: "10:44", title: "自动扩容生效", status: "success", actor: "k8s-hpa", child: Badge("已恢复", tone="success") }',
      '  ], title="故障处置时间线", badge="MTTR 3m"),',
      '  Kanban($/cols, title="跟进任务看板", action=Event("open_card")),',
      '  SourceList($/sources, title="参考依据与源码定位", action=Event("open_source"))',
      ']))',
    ].join('\n')

    const compiled = sessions.compile('sess-v3', program)
    expect(compiled.length).toBeGreaterThan(0)
    const createMsg = compiled.find((m) => 'createSurface' in m) as
      | { createSurface: { components?: Array<{ component: string }> } }
      | undefined
    const used = (createMsg?.createSurface.components ?? []).map((c) => c.component)
    expect(used).toEqual(expect.arrayContaining([...V3_NAMES, 'Badge']))

    const envelopes = compiled.flatMap((part) => ('a2ui' in part ? part.a2ui : [part]))
    const html = renderToStaticMarkup(
      createElement(SurfaceGroupView, {
        messages: envelopes as never,
        readOnly: false,
      }),
    )
    expect(typeof html).toBe('string')
  })

  it('normalizes tolerant v3 inputs, strips unsafe URLs, computes ring arcs, and lays out cyclic DAGs safely', () => {
    const opts = normalizeSelectOptions([
      'alpha',
      { value: 'beta', label: 'Beta', description: 'Desc' },
      'alpha',
    ])
    expect(opts).toEqual([
      { value: 'alpha', label: 'alpha', description: undefined },
      { value: 'beta', label: 'Beta', description: 'Desc' },
    ])

    expect(parseComparisonCell(true)).toEqual({ kind: 'ok', text: '' })
    expect(parseComparisonCell('warn: 仅部分可用')).toEqual({ kind: 'warn', text: '仅部分可用' })
    expect(parseComparisonCell('no: 不支持')).toEqual({ kind: 'no', text: '不支持' })
    const cmp = normalizeComparisonData(['A', 'B'], [{ label: '事务', A: 'ok:支持', B: false }])
    expect(cmp.options).toHaveLength(2)
    expect(cmp.rows[0]?.cells.A).toEqual({ kind: 'ok', text: '支持' })
    expect(cmp.rows[0]?.cells.B).toEqual({ kind: 'no', text: '' })

    const logs = normalizeLogEntries(
      '10:42:01 [ERROR] [gateway] Upstream 502\n10:42:02 [INFO] Retry OK',
    )
    expect(logs).toHaveLength(2)
    expect(logs[0]?.level).toBe('error')
    expect(logs[0]?.service).toBe('gateway')
    expect(logs[0]?.message).toBe('Upstream 502')

    const cols = normalizeKanbanColumns([
      { title: 'Doing', tone: 'info', items: ['Fix bug', { title: 'Ship v3', priority: 'p0' }] },
    ])
    expect(cols[0]?.cards).toHaveLength(2)
    expect(cols[0]?.cards[1]?.priority).toBe('high')

    const sources = normalizeSourceItems([
      { title: 'Safe HTTPS', url: 'https://www.example.com/doc', score: 0.875 },
      { title: 'Unsafe XSS', url: 'javascript:alert(1)', filePath: 'src/index.ts', line: 10 },
    ])
    expect(sources[0]?.url).toBe('https://www.example.com/doc')
    expect(sources[0]?.domain).toBe('example.com')
    expect(sources[0]?.scorePercent).toBe(88)
    expect(sources[1]?.url).toBeUndefined()
    expect(sources[1]?.domain).toBe('workspace')

    expect(computeMetricRingGeometry({ value: 92, max: 100, tone: 'auto' }).resolvedTone).toBe(
      'danger',
    )
    expect(computeMetricRingGeometry({ value: 76, max: 100, tone: 'auto' }).resolvedTone).toBe(
      'warning',
    )
    expect(computeMetricRingGeometry({ value: 45, max: 100, tone: 'auto' }).resolvedTone).toBe(
      'success',
    )

    const cyclic = buildServiceGraphLayout(
      [
        { id: 'a', label: 'Gateway' },
        { id: 'b', label: 'Auth', status: 'warning' },
        { id: 'c', label: 'SessionCache', status: 'error' },
      ],
      [
        { from: 'a', to: 'b', label: '10ms' },
        { from: 'b', to: 'c', label: '4ms' },
        { from: 'c', to: 'a', label: 'callback' },
      ],
      'TB',
    )
    expect(cyclic.nodes).toHaveLength(3)
    expect(cyclic.edges).toHaveLength(3)
    expect(cyclic.edges.some((e) => e.isBackEdge)).toBe(true)

    const lrWideLabel = buildServiceGraphLayout(
      [
        { id: 'checkout', label: 'Checkout API' },
        { id: 'risk', label: 'Fraud Scorer · TiKV' },
      ],
      [{ from: 'checkout', to: 'risk', label: 'region #19 慢读超时重试', status: 'error' }],
      'LR',
    )
    const n0 = lrWideLabel.nodes[0]!
    const n1 = lrWideLabel.nodes[1]!
    const e0 = lrWideLabel.edges[0]!
    expect(n1.x - (n0.x + n0.width)).toBeGreaterThanOrEqual(e0.labelWidth + 24)

    const assertGraphCollisionFree = (layout: ReturnType<typeof buildServiceGraphLayout>) => {
      for (const n of layout.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(12)
        expect(n.y).toBeGreaterThanOrEqual(12)
        expect(n.x + n.width).toBeLessThanOrEqual(layout.width - 12)
        expect(n.y + n.height).toBeLessThanOrEqual(layout.height - 12)
      }
      const labeled = layout.edges.filter((e) => Boolean(e.label))
      for (let i = 0; i < labeled.length; i++) {
        const e = labeled[i]!
        const lx1 = e.labelX - e.labelWidth / 2
        const ly1 = e.labelY - 9
        const lx2 = e.labelX + e.labelWidth / 2
        const ly2 = e.labelY + 9
        expect(lx1).toBeGreaterThanOrEqual(10)
        expect(ly1).toBeGreaterThanOrEqual(10)
        expect(lx2).toBeLessThanOrEqual(layout.width - 10)
        expect(ly2).toBeLessThanOrEqual(layout.height - 10)
        for (const n of layout.nodes) {
          const overlapsNode = lx1 < n.x + n.width && lx2 > n.x && ly1 < n.y + n.height && ly2 > n.y
          expect(overlapsNode).toBe(false)
        }
        for (let j = i + 1; j < labeled.length; j++) {
          const other = labeled[j]!
          const ox1 = other.labelX - other.labelWidth / 2
          const oy1 = other.labelY - 9
          const ox2 = other.labelX + other.labelWidth / 2
          const oy2 = other.labelY + 9
          const overlapsOther = lx1 < ox2 && lx2 > ox1 && ly1 < oy2 && ly2 > oy1
          expect(overlapsOther).toBe(false)
        }
      }
    }

    assertGraphCollisionFree(cyclic)
    assertGraphCollisionFree(
      buildServiceGraphLayout(
        [
          { id: 'gw', label: 'API Gateway' },
          { id: 'cache', label: 'Redis Cluster' },
          { id: 'db', label: 'Primary TiKV' },
        ],
        [
          { from: 'gw', to: 'cache', label: 'read 2ms' },
          { from: 'cache', to: 'db', label: 'miss 18ms' },
          { from: 'gw', to: 'db', label: '穿透降级直连 140ms', status: 'warning' },
          { from: 'db', to: 'gw', label: '熔断回退信令', status: 'error' },
        ],
        'LR',
      ),
    )
    assertGraphCollisionFree(
      buildServiceGraphLayout(
        [
          { id: 'w1', label: 'Ingress AZ-A' },
          { id: 'w2', label: 'Ingress AZ-B' },
          { id: 's1', label: 'Shard-01' },
          { id: 's2', label: 'Shard-02' },
        ],
        [
          { from: 'w1', to: 's2', label: 'cross-AZ 38ms' },
          { from: 'w2', to: 's1', label: 'cross-AZ 41ms' },
        ],
        'LR',
      ),
    )
    assertGraphCollisionFree(
      buildServiceGraphLayout(
        [
          { id: 'primary', label: 'MySQL Master' },
          { id: 'replica', label: 'Read Replica' },
        ],
        [{ from: 'primary', to: 'replica', label: '跨地域半同步 binlog 复制延迟 128ms' }],
        'TB',
      ),
    )

    const smallBusyRing = computeMetricRingGeometry({
      value: 99.95,
      max: 100,
      size: 64,
      unit: '%',
    })
    expect(smallBusyRing.numberFontSize).toBeLessThan(13)
    expect(smallBusyRing.numberFontSize).toBeGreaterThanOrEqual(10)
  })

  it('enriches outbound dshSelection metadata for Comparison, Kanban, and ServiceGraph actions', () => {
    const enriched = enrichActionWithSelection({
      name: 'inspect_node',
      surfaceId: 'topo',
      sourceComponentId: 'sg_1',
      timestamp: '2026-11-19T12:00:00Z',
      context: {},
      metadata: {
        extensions: {
          dshSelection: {
            source: 'serviceGraph',
            label: 'Order Service',
            series: 'Warning',
            value: '184ms',
            nodeId: 'ord',
          },
        },
      },
    } as never)
    expect(enriched.userMessage).toContain('Order Service')
    expect((enriched.context as Record<string, unknown>).selection).toMatchObject({
      source: 'serviceGraph',
      nodeId: 'ord',
    })
  })
})
