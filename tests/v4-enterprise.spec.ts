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

import { dshReactCatalog } from '../src/client/catalog/index.ts'
import {
  buildEndpointCurl,
  computeTableNumericSummary,
  detectNumericColumnKeys,
  formatTableToCsv,
  formatTableToMarkdown,
  normalizeCategorySegments,
  normalizeMatrixData,
  normalizeScheduleItems,
  normalizeTerminalCommands,
  normalizeTrackerSlices,
  tokenizeEndpointPath,
} from '../src/client/catalog/v4-helpers.ts'
import { SurfaceGroupView } from '../src/client/SurfaceView.tsx'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { DSH_COMPONENT_APIS, dshSchemaCatalog } from '../src/shared/catalog-schema.ts'

describe('Evolution v4: 8 Vercel/Tremor & Enterprise B2B Components + ProTable (50 Total)', () => {
  const V4_NAMES = [
    'Tracker',
    'Terminal',
    'ApprovalCard',
    'ApiEndpoint',
    'Schedule',
    'Result',
    'EntityHeader',
    'Matrix',
  ] as const

  it('registers all 57 components across Host schema catalog and Client React catalog', () => {
    expect(DSH_COMPONENT_APIS).toHaveLength(57)
    const schemaNames = Object.keys(dshSchemaCatalog.toJson().components as Record<string, unknown>)
    const reactNames = [...dshReactCatalog.components.keys()]
    expect(schemaNames).toHaveLength(57)
    expect(reactNames).toHaveLength(57)
    expect(schemaNames).toEqual(expect.arrayContaining([...V4_NAMES]))
    expect(reactNames).toEqual(expect.arrayContaining([...V4_NAMES]))
  })

  it('compiles all 8 v4 components + ProTable in A2UI Express and renders SSR cleanly', () => {
    const sessions = new SurfaceSessions(createGenerator())
    const program = [
      'surface("v4_enterprise_suite")',
      '$/sla = [{ label: "11-18", status: "ok", note: "100% 正常" }, { label: "11-19", status: "warning", note: "P99 420ms" }]',
      '$/cmds = [{ cmd: "kubectl rollout status deploy/order-api -n prod", output: "deployment successfully rolled out", exitCode: 0 }]',
      '$/req = { rpmLimit: 12000, reason: "Q4 Peak" }',
      '$/resp = { tenantId: "ten_8901", effective: true }',
      '$/sched = [{ title: "快照备份", start: "00:00", end: "01:30", progress: 100, status: "done" }, { title: "索引重建", start: "01:00", end: "04:00", progress: 65, status: "active", owner: "@张工" }]',
      '$/proRows = [{ inst: "gpu-hz-01", util: "3.2%", save: 12400 }, { inst: "gpu-bj-02", util: "5.8%", save: 8900 }]',
      'root = Card(Column([',
      '  EntityHeader("华泰资管专属推理集群", subtitle="租户 ten_8901 · CSM 林珊", status="healthy", statusLabel="运行正常", badge="KA-Enterprise", tags=["专线", "ISO-27001"], metrics=[{ label: "ARR", value: "¥240万" }, { label: "SLA", value: "99.99%" }], actionLabel="巡检报告", action=Event("open_audit")),',
      '  Row([',
      '    Tracker($/sla, title="网关 30 日可用性", summary="99.94%", mode="uptime", weight=1),',
      '    Tracker([{ label: "缓存命中", value: 62, tone: "success" }, { label: "新增输入", value: 38, tone: "brand" }], title="Token 构成", summary="48.2M", mode="category", weight=1)',
      '  ]),',
      '  Terminal($/cmds, title="生产探针手册", cwd="~/k8s-prod", shell="zsh"),',
      '  ApprovalCard("执行核心账单表分区归档", summary="仅涉及 2024 冷分区", severity="high", scope="DDL-1119", impacts=["涉及 1,420 万行", "元数据锁 < 60ms"], confirmLabel="已确认备份快照完整", approveAction=Event("approve_ddl"), rejectAction=Event("reject_ddl")),',
      '  ApiEndpoint("POST", "/v1/tenants/{tenantId}/quotas", status=200, latency="34ms", params=[{ name: "tenantId", in: "path", required: true }], requestBody=$/req, responseBody=$/resp, action=Event("call_api")),',
      '  Schedule($/sched, title="凌晨维护窗口排期", range=["00:00", "06:00"], now="02:30", action=Event("inspect_track")),',
      '  Matrix(["2026-Q1", "2026-Q2"], ["首月", "第3月", "第6月"], [[100, 94, 89], [100, 96, null]], title="客户 NDR 净留存热力表", unit="%", showTotals=true),',
      '  Table($/proRows, title="闲置算力巡检 ProTable", searchable=true, exportable=true, selectable=true, batchLabel="批量回收", showSummary=true, action=Event("reclaim_batch")),',
      '  Result("success", "灰度切流已完成", subtitle="流水号 CHG-1119", meta={ "实例": "12/12", "耗时": "1.4s" }, actionLabel="查看监控", action=Event("view_mon"), child=Badge("自动回滚守护中", tone="success"))',
      ']))',
    ].join('\n')

    const compiled = sessions.compile('sess-v4', program)
    expect(compiled.length).toBeGreaterThan(0)
    const createMsg = compiled.find((m) => 'createSurface' in m) as
      | { createSurface: { components?: Array<{ component: string }> } }
      | undefined
    const used = (createMsg?.createSurface.components ?? []).map((c) => c.component)
    expect(used).toEqual(expect.arrayContaining([...V4_NAMES, 'Table', 'Badge']))

    const envelopes = compiled.flatMap((part) => ('a2ui' in part ? part.a2ui : [part]))
    const html = renderToStaticMarkup(
      createElement(SurfaceGroupView, {
        messages: envelopes as never,
        readOnly: false,
      }),
    )
    expect(typeof html).toBe('string')
  })

  it('validates v4 pure normalizers, shell-safe cURL generation, schedule spans, matrix heat, and ProTable CSV/MD exporters', () => {
    const slices = normalizeTrackerSlices(['ok', { label: 'D2', status: 'down', note: '503' }])
    expect(slices[0]?.status).toBe('ok')
    expect(slices[1]?.status).toBe('error')

    const segs = normalizeCategorySegments([
      { label: 'Cache', value: 60, tone: 'success' },
      { label: 'Fresh', value: 40, tone: 'brand' },
    ])
    expect(segs.map((s) => s.pct)).toEqual([60, 40])

    const cmds = normalizeTerminalCommands('$ npm run build\nBuild complete\n$ npm test\n68 passed')
    expect(cmds).toHaveLength(2)
    expect(cmds[0]?.cmd).toBe('npm run build')
    expect(cmds[0]?.output).toBe('Build complete')

    const tokens = tokenizeEndpointPath('/v1/tenants/{tenantId}/items/:itemId')
    expect(tokens.filter((t) => t.isParam).map((t) => t.text)).toEqual(['{tenantId}', ':itemId'])

    const curl = buildEndpointCurl({
      method: 'post',
      path: '/v1/quotas',
      baseUrl: 'https://api.dsh.local/',
      headers: { Authorization: "Bearer a'b" },
      requestBody: { rpm: 100 },
    })
    expect(curl).toContain("curl -X POST 'https://api.dsh.local/v1/quotas'")
    expect(curl).toContain("'\\''")

    const sched = normalizeScheduleItems(
      [{ title: 'Window', start: '01:30', end: '04:30', progress: 50 }],
      ['00:00', '06:00'],
      '03:00',
    )
    expect(sched.tracks[0]?.leftPct).toBeCloseTo(25, 1)
    expect(sched.tracks[0]?.widthPct).toBeCloseTo(50, 1)
    expect(sched.nowPct).toBeCloseTo(50, 1)

    const mat = normalizeMatrixData({
      rows: ['R1', 'R2'],
      columns: ['C1', 'C2'],
      values: [
        [100, 80],
        ['ok:Pass', false],
      ],
      unit: '%',
      showTotals: true,
    })
    expect(mat.cells[0]?.[0]?.display).toBe('100%')
    expect(mat.rowSummaries?.[0]).toBe('90%')
    expect(mat.cells[1]?.[0]?.kind).toBe('ok')
    expect(mat.cells[1]?.[1]?.kind).toBe('no')

    const cols = [
      { key: 'name', label: '实例,名称' },
      { key: 'util', label: '利用率' },
      { key: 'cost', label: '月度费用' },
    ]
    const rows = [
      { name: 'node-"1"', util: '4.0%', cost: '¥1,200' },
      { name: 'node-2', util: '6.0%', cost: '¥800' },
    ]
    const numKeys = detectNumericColumnKeys(cols, rows)
    expect(numKeys.has('util')).toBe(true)
    expect(numKeys.has('cost')).toBe(true)

    const summary = computeTableNumericSummary(cols, rows, numKeys)
    expect(summary.util).toBe('Avg 5.0%')
    expect(summary.cost).toBe('¥2,000')

    const csv = formatTableToCsv(cols, rows)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"实例,名称"')
    expect(csv).toContain('"node-""1"""')

    const md = formatTableToMarkdown(cols, rows, numKeys)
    expect(md).toContain('| :--- | ---: | ---: |')
  })
})
