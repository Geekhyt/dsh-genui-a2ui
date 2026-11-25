import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { describe, expect, it } from 'vitest'
import * as mockLlm from '../scripts/mock-llm.mjs'
import {
  buildChartOption,
  getA2uiEchartsThemeName,
  registerA2uiEchartsThemes,
} from '../src/client/chunks/echarts-chunk.ts'
import { SurfaceSessions } from '../src/host/generator.ts'
import { CHART_KINDS, type ChartKind } from '../src/shared/catalog-schema.ts'

echarts.use([SVGRenderer])
registerA2uiEchartsThemes()

interface TextBox {
  readonly text: string
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

const DARK_LEAK_HEX_RE = /^#(?:cfd2d7|54555a|6e7079|e0e6f1|d2dbee|b9b8ce|ccc|cccccc)$/i
const WHITE_HEX_RE = /^#(?:fff|ffffff)$/i

function renderSvgWithTheme(
  option: echarts.EChartsCoreOption,
  dark: boolean,
  width: number,
  height = 260,
): string {
  const inst = echarts.init(null, getA2uiEchartsThemeName(dark), {
    renderer: 'svg',
    ssr: true,
    width,
    height,
  })
  try {
    inst.setOption({ animation: false, ...option })
    return inst.renderToSVGString()
  } finally {
    inst.dispose()
  }
}

function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    w += cp > 0xff ? fontSize * 0.96 : fontSize * 0.56
  }
  return w
}

function parseAttr(tag: string, name: string): string {
  const re = new RegExp(`\\b${name}="([^"]*)"`, 'i')
  return re.exec(tag)?.[1] ?? ''
}

function parseTransformXY(transform: string): readonly [number, number] | null {
  if (!transform) return [0, 0]
  const mat =
    /matrix\(\s*([+-]?[\d.eE-]+)[,\s]+([+-]?[\d.eE-]+)[,\s]+([+-]?[\d.eE-]+)[,\s]+([+-]?[\d.eE-]+)[,\s]+([+-]?[\d.eE-]+)[,\s]+([+-]?[\d.eE-]+)\s*\)/.exec(
      transform,
    )
  if (mat) {
    const a = Number(mat[1])
    const b = Number(mat[2])
    const tx = Number(mat[5])
    const ty = Number(mat[6])
    if (Math.abs(b) > 0.15 || Math.abs(a - 1) > 0.25) return null
    return [tx, ty]
  }
  const tr = /translate\(\s*([+-]?[\d.eE-]+)(?:[,\s]+([+-]?[\d.eE-]+))?\s*\)/.exec(transform)
  if (tr) {
    return [Number(tr[1]), Number(tr[2] ?? 0)]
  }
  if (/rotate\(/i.test(transform)) return null
  return [0, 0]
}

function extractTextBoxes(svg: string): TextBox[] {
  const unclippedSvg = svg.replace(/<g\b[^>]*\bclip-path="[^"]*"[^>]*>[\s\S]*?<\/g>/gi, '')
  const boxes: TextBox[] = []
  const textRe = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi
  let m: RegExpExecArray | null
  while ((m = textRe.exec(unclippedSvg)) !== null) {
    const attrs = m[1] ?? ''
    const rawText = (m[2] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim()
    if (rawText === '') continue
    const opacity = parseAttr(attrs, 'fill-opacity') || parseAttr(attrs, 'opacity')
    if (opacity !== '' && Number(opacity) === 0) continue
    const pos = parseTransformXY(parseAttr(attrs, 'transform'))
    if (pos === null) continue
    const x = pos[0] + Number(parseAttr(attrs, 'x') || 0)
    const y = pos[1] + Number(parseAttr(attrs, 'y') || 0)
    const style = parseAttr(attrs, 'style')
    const fsMatch = /font-size:\s*([\d.]+)px/i.exec(style)
    const fontSize = fsMatch ? Number(fsMatch[1]) : Number(parseAttr(attrs, 'font-size') || 11)
    const anchor = parseAttr(attrs, 'text-anchor') || 'start'
    const w = estimateTextWidth(rawText, fontSize)
    const h = fontSize * 1.05
    const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x
    const baseline = parseAttr(attrs, 'dominant-baseline')
    const y0 = baseline === 'central' || baseline === 'middle' ? y - h / 2 : y - h * 0.8
    boxes.push({ text: rawText, x0, y0, x1: x0 + w, y1: y0 + h })
  }
  return boxes
}

function findSevereTextCollisions(boxes: readonly TextBox[]): string[] {
  const collisions: string[] = []
  for (let i = 0; i < boxes.length; i += 1) {
    const a = boxes[i]!
    const aw = Math.max(1, a.x1 - a.x0)
    const ah = Math.max(1, a.y1 - a.y0)
    for (let j = i + 1; j < boxes.length; j += 1) {
      const b = boxes[j]!
      const bw = Math.max(1, b.x1 - b.x0)
      const bh = Math.max(1, b.y1 - b.y0)
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
      if (ox <= 0 || oy <= 0) continue
      const minW = Math.min(aw, bw)
      const minH = Math.min(ah, bh)
      if (ox / minW > 0.5 && oy / minH > 0.55) {
        collisions.push(`"${a.text}" <-> "${b.text}"`)
      }
    }
  }
  return collisions
}

function scanDarkColorLeaks(svg: string): string[] {
  const leaks: string[] = []
  const shapeRe = /<(?:path|rect|line|circle|polygon|polyline)\b([^>]*)>/gi
  let m: RegExpExecArray | null
  while ((m = shapeRe.exec(svg)) !== null) {
    const attrs = m[1] ?? ''
    const stroke = parseAttr(attrs, 'stroke').trim()
    const strokeWidth = parseAttr(attrs, 'stroke-width').trim()
    const strokeOpacity = parseAttr(attrs, 'stroke-opacity').trim()
    const visibleStroke =
      stroke !== '' &&
      stroke !== 'none' &&
      strokeWidth !== '0' &&
      (strokeOpacity === '' || Number(strokeOpacity) > 0)
    if (visibleStroke && (DARK_LEAK_HEX_RE.test(stroke) || WHITE_HEX_RE.test(stroke))) {
      leaks.push(`stroke=${stroke}`)
    }
    const fill = parseAttr(attrs, 'fill').trim()
    const fillOpacity = parseAttr(attrs, 'fill-opacity').trim()
    const visibleFill =
      fill !== '' && fill !== 'none' && (fillOpacity === '' || Number(fillOpacity) > 0)
    if (visibleFill && DARK_LEAK_HEX_RE.test(fill)) {
      leaks.push(`fill=${fill}`)
    }
  }
  return [...new Set(leaks)]
}

function sampleForKind(kind: ChartKind): Record<string, unknown> {
  switch (kind) {
    case 'bar':
    case 'line':
    case 'area':
      return {
        kind,
        xField: 'day',
        yField: ['DeepSeek-R1-0528', 'DeepSeek-V3-0324'],
        data: [
          { day: 'Mon', 'DeepSeek-R1-0528': 120, 'DeepSeek-V3-0324': 95 },
          { day: 'Tue', 'DeepSeek-R1-0528': 180, 'DeepSeek-V3-0324': 140 },
          { day: 'Wed', 'DeepSeek-R1-0528': 155, 'DeepSeek-V3-0324': 165 },
        ],
        zoom: true,
      }
    case 'pie':
    case 'funnel':
    case 'rose':
    case 'radialBar':
      return {
        kind,
        xField: 'stage',
        yField: 'value',
        data: [
          { stage: 'Stage Alpha', value: 100 },
          { stage: 'Stage Beta', value: 72 },
          { stage: 'Stage Gamma', value: 45 },
        ],
      }
    case 'scatter':
      return {
        kind,
        xField: 'latency',
        yField: 'qps',
        sizeField: 'errors',
        data: [
          { name: 'Node-A', latency: 12, qps: 450, errors: 2 },
          { name: 'Node-B', latency: 28, qps: 310, errors: 9 },
        ],
        zoom: true,
      }
    case 'radar':
      return {
        kind,
        xField: 'dim',
        yField: ['R1', 'V3'],
        data: [
          { dim: 'Reasoning', R1: 92, V3: 84 },
          { dim: 'Latency', R1: 78, V3: 94 },
          { dim: 'Safety', R1: 95, V3: 90 },
          { dim: 'Cost', R1: 80, V3: 96 },
        ],
      }
    case 'gauge':
      return { kind, data: [{ name: 'SLA', value: 99.4, max: 100 }] }
    case 'heatmap':
      return {
        kind,
        xField: 'hour',
        yField: 'day',
        sizeField: 'val',
        data: [
          { hour: '00:00', day: 'Mon', val: 12 },
          { hour: '12:00', day: 'Mon', val: 248 },
          { hour: '00:00', day: 'Tue', val: 88 },
          { hour: '12:00', day: 'Tue', val: 164 },
        ],
      }
    case 'treemap':
    case 'sunburst':
      return {
        kind,
        data: [
          {
            name: '评测沙箱',
            children: [
              { name: 'Unit', value: 40 },
              { name: 'E2E', value: 60 },
            ],
          },
          { name: 'Runtime', value: 55 },
        ],
      }
    case 'sankey':
      return {
        kind,
        data: {
          nodes: [
            { id: 'n1', name: 'Traffic Entry' },
            { id: 'n2', name: 'Middle Router Node' },
            { id: 'n3', name: 'Terminal Sink' },
          ],
          links: [
            { source: 'n1', target: 'n2', value: 100 },
            { source: 'n2', target: 'n3', value: 85 },
          ],
        },
      }
    case 'graph':
      return {
        kind,
        data: {
          nodes: [
            { id: 'a', name: 'Gateway' },
            { id: 'b', name: 'Auth' },
            { id: 'c', name: 'Store' },
          ],
          links: [
            { source: 'a', target: 'b' },
            { source: 'b', target: 'c' },
          ],
        },
      }
    case 'candlestick':
      return {
        kind,
        xField: 'date',
        data: [
          { date: '2026-05-01', open: 100, close: 112, low: 96, high: 115 },
          { date: '2026-05-02', open: 112, close: 105, low: 102, high: 118 },
        ],
        zoom: true,
      }
    case 'boxplot':
      return {
        kind,
        xField: 'group',
        data: [
          { group: 'P95-A', values: [10, 20, 30, 40, 50] },
          { group: 'P95-B', values: [15, 25, 35, 45, 60] },
        ],
        zoom: true,
      }
    case 'waterfall':
      return {
        kind,
        xField: 'step',
        yField: 'delta',
        data: [
          { step: 'Start', delta: 100, total: true },
          { step: 'Gain', delta: 40 },
          { step: 'Drop', delta: -15 },
          { step: 'End', delta: 125, total: true },
        ],
      }
    case 'combo':
      return {
        kind,
        xField: 'month',
        yField: 'revenue',
        y2Field: 'margin',
        data: [
          { month: 'Jan', revenue: 120, margin: 0.24 },
          { month: 'Feb', revenue: 150, margin: 0.28 },
          { month: 'Mar', revenue: 180, margin: 0.31 },
        ],
      }
    case 'parallel':
      return {
        kind,
        xField: 'model',
        yField: ['Score', 'Latency', 'Cost', 'PassRate'],
        data: [
          { model: 'DeepSeek-R1-0528', Score: 92, Latency: 420, Cost: 2.1, PassRate: 98 },
          { model: 'DeepSeek-V3-0324', Score: 88, Latency: 210, Cost: 0.9, PassRate: 95 },
        ],
      }
    case 'calendar':
      return {
        kind,
        xField: 'date',
        yField: 'count',
        data: [
          { date: '2026-01-05', count: 0 },
          { date: '2026-01-12', count: 14 },
          { date: '2026-01-19', count: 32 },
        ],
      }
    case 'range':
      return {
        kind,
        xField: 't',
        data: [
          { t: '10:00', low: 10, mid: 18, high: 26 },
          { t: '11:00', low: 12, mid: 21, high: 30 },
        ],
      }
    case 'bullet':
      return {
        kind,
        xField: 'metric',
        data: [
          { metric: 'Availability', value: 99.2, target: 99.5, max: 100 },
          { metric: 'Throughput', value: 84, target: 90, max: 100 },
        ],
      }
    case 'histogram':
      return {
        kind,
        yField: 'latency',
        data: [{ latency: 12 }, { latency: 24 }, { latency: 36 }, { latency: 49 }],
      }
    case 'dumbbell':
      return {
        kind,
        xField: 'svc',
        yField: ['before', 'after'],
        data: [
          { svc: 'gateway', before: 120, after: 120 },
          { svc: 'worker', before: 240, after: 110 },
        ],
        selected: 'worker',
      }
    case 'chord':
      return {
        kind,
        data: {
          nodes: [
            { id: 'c1', name: 'API' },
            { id: 'c2', name: 'Worker' },
            { id: 'c3', name: 'Store' },
          ],
          links: [
            { source: 'c1', target: 'c2', value: 50 },
            { source: 'c2', target: 'c3', value: 60 },
          ],
        },
      }
  }
}

describe('ECharts White-Box SVG Geometry & Dark-Theme Gate (26 kinds × 3 widths × 2 themes)', () => {
  it('registers deterministic a2ui-dark and a2ui-light themes', () => {
    expect(getA2uiEchartsThemeName(true)).toBe('a2ui-dark')
    expect(getA2uiEchartsThemeName(false)).toBe('a2ui-light')
  })

  it('enforces zero dark-mode light-color leakage, zero NaN/undefined, non-empty geometry, and zero severe label collisions across all 156 rendered SVGs', () => {
    expect(CHART_KINDS).toHaveLength(26)
    for (const kind of CHART_KINDS) {
      const sample = sampleForKind(kind)
      for (const dark of [true, false]) {
        for (const width of [240, 276, 640]) {
          const opt = buildChartOption(sample as never, dark, width)
          const svg = renderSvgWithTheme(opt, dark, width, 260)
          expect(svg, `${kind} dark=${dark} w=${width}`).toContain('<svg')
          expect(svg, `${kind} NaN check`).not.toMatch(/\b(?:NaN|Infinity|undefined)\b/)
          expect(
            /<(?:path|rect|circle|polygon|polyline)\b/i.test(svg),
            `${kind} dark=${dark} w=${width} must emit visible geometry`,
          ).toBe(true)
          if (dark) {
            expect(scanDarkColorLeaks(svg), `${kind} w=${width} dark color leaks`).toEqual([])
          }
          const boxes = extractTextBoxes(svg)
          const collisions = findSevereTextCollisions(boxes)
          expect(collisions, `${kind} dark=${dark} w=${width} severe text collisions`).toEqual([])
          const clippedText = boxes.filter(
            (b) => b.x0 < -12 || b.x1 > width + 12 || b.y0 < -12 || b.y1 > 272,
          )
          expect(
            clippedText.map(
              (b) =>
                `${b.text}@(${Math.round(b.x0)},${Math.round(b.y0)},${Math.round(b.x1)},${Math.round(b.y1)})`,
            ),
            `${kind} dark=${dark} w=${width} off-canvas text`,
          ).toEqual([])
        }
      }
    }
  })

  it('audits every compiled Chart across all exported SHOWCASE_*_UI suites at 276px and 640px in both themes', () => {
    const resolvePointer = (model: Record<string, unknown>, path: string): unknown => {
      const segs = path.replace(/^\/+/, '').split('/').filter(Boolean)
      let cur: unknown = model
      for (const s of segs) {
        if (cur && typeof cur === 'object' && s in (cur as Record<string, unknown>)) {
          cur = (cur as Record<string, unknown>)[s]
        } else {
          return undefined
        }
      }
      return cur
    }
    const resolveDynamic = (val: unknown, model: Record<string, unknown>): unknown => {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const rec = val as Record<string, unknown>
        const ptr =
          typeof rec['@path'] === 'string'
            ? rec['@path']
            : typeof rec.path === 'string'
              ? rec.path
              : null
        if (ptr !== null && Object.keys(rec).length === 1) {
          return resolvePointer(model, ptr)
        }
      }
      return val
    }

    const showcaseEntries = Object.entries(mockLlm).filter(
      ([k, v]) => /^SHOWCASE_[A-Z0-9_]+_UI$/.test(k) && typeof v === 'string' && v.trim() !== '',
    ) as Array<[string, string]>
    expect(showcaseEntries.length).toBeGreaterThanOrEqual(40)

    let totalCharts = 0
    const issues: string[] = []
    for (const [key, dsl] of showcaseEntries) {
      const sessions = new SurfaceSessions()
      const msgs = sessions.compile(`whitebox-${key}`, dsl)
      const models = new Map<string, Record<string, unknown>>()
      const charts: Array<{ surfaceId: string; comp: Record<string, unknown> }> = []

      for (const msg of msgs) {
        if ('createSurface' in msg && msg.createSurface) {
          const sid = msg.createSurface.surfaceId
          if (msg.createSurface.dataModel && typeof msg.createSurface.dataModel === 'object') {
            models.set(sid, { ...(msg.createSurface.dataModel as Record<string, unknown>) })
          }
          if (Array.isArray(msg.createSurface.components)) {
            for (const c of msg.createSurface.components) {
              if (c.component === 'Chart') {
                charts.push({ surfaceId: sid, comp: c as Record<string, unknown> })
              }
            }
          }
        }
        if ('updateDataModel' in msg && msg.updateDataModel) {
          const sid = msg.updateDataModel.surfaceId
          const existing = models.get(sid) ?? {}
          const p = msg.updateDataModel.path
          if (!p || p === '/') {
            models.set(sid, {
              ...existing,
              ...(msg.updateDataModel.value as Record<string, unknown>),
            })
          } else {
            const segs = p.replace(/^\/+/, '').split('/')
            let cur: Record<string, unknown> = existing
            for (let i = 0; i < segs.length - 1; i += 1) {
              const s = segs[i]!
              if (!cur[s] || typeof cur[s] !== 'object') cur[s] = {}
              cur = cur[s] as Record<string, unknown>
            }
            cur[segs[segs.length - 1]!] = msg.updateDataModel.value
            models.set(sid, existing)
          }
        }
        if ('updateComponents' in msg && msg.updateComponents) {
          for (const c of msg.updateComponents.components) {
            if (c.component === 'Chart') {
              charts.push({
                surfaceId: msg.updateComponents.surfaceId,
                comp: c as Record<string, unknown>,
              })
            }
          }
        }
      }

      for (const { surfaceId, comp } of charts) {
        totalCharts += 1
        const model = models.get(surfaceId) ?? {}
        const resolved: Record<string, unknown> = {}
        for (const [propKey, propVal] of Object.entries(comp)) {
          if (propKey === 'id' || propKey === 'component') continue
          resolved[propKey] = resolveDynamic(propVal, model)
        }
        const h = typeof resolved.height === 'number' ? resolved.height : 260
        for (const dark of [true, false]) {
          for (const width of [276, 640]) {
            const opt = buildChartOption(resolved as never, dark, width)
            const svg = renderSvgWithTheme(opt, dark, width, h)
            if (/\b(?:NaN|Infinity|undefined)\b/.test(svg)) {
              issues.push(
                `${key}#${String(comp.id)} dark=${dark} w=${width}: NaN/Infinity/undefined`,
              )
            }
            if (!/<(?:path|rect|circle|polygon|polyline)\b/i.test(svg)) {
              issues.push(`${key}#${String(comp.id)} dark=${dark} w=${width}: empty geometry`)
            }
            if (dark) {
              const leaks = scanDarkColorLeaks(svg)
              if (leaks.length > 0) {
                issues.push(`${key}#${String(comp.id)} dark w=${width}: leaks ${leaks.join(',')}`)
              }
            }
            const boxes = extractTextBoxes(svg)
            const cols = findSevereTextCollisions(boxes)
            if (cols.length > 0) {
              issues.push(`${key}#${String(comp.id)} dark=${dark} w=${width}: ${cols.join('; ')}`)
            }
            const clipped = boxes.filter(
              (b) => b.x0 < -12 || b.x1 > width + 12 || b.y0 < -12 || b.y1 > h + 12,
            )
            if (clipped.length > 0) {
              issues.push(
                `${key}#${String(comp.id)} dark=${dark} w=${width}: clipped ${clipped.map((b) => b.text).join(',')}`,
              )
            }
          }
        }
      }
    }

    expect(totalCharts).toBeGreaterThanOrEqual(80)
    expect(issues).toEqual([])
  }, 30_000)

  it('survives 26 kinds × 9 adversarial data-distribution payloads with zero NaN, zero crashes, and intact semantics', () => {
    const adversarialPayloads: ReadonlyArray<{
      readonly name: string
      readonly build: (kind: ChartKind) => Record<string, unknown>
    }> = [
      { name: 'empty-array', build: (kind) => ({ kind, data: [], xField: 'x', yField: 'y' }) },
      { name: 'empty-graph', build: (kind) => ({ kind, data: { nodes: [], links: [] } }) },
      {
        name: 'null-nan-rows',
        build: (kind) => ({
          kind,
          xField: 'x',
          yField: 'y',
          data: [
            { x: 'A', y: null },
            { x: 'B', y: Number.NaN },
            { x: 'C', y: Number.POSITIVE_INFINITY },
            { x: 'D', y: 0 },
          ],
        }),
      },
      {
        name: 'all-zeros',
        build: (kind) => ({
          kind,
          xField: 'x',
          yField: 'y',
          data: [
            { x: 'A', y: 0 },
            { x: 'B', y: 0 },
            { x: 'C', y: 0 },
          ],
        }),
      },
      {
        name: 'negatives-log-scale',
        build: (kind) => ({
          kind,
          xField: 'x',
          yField: 'y',
          yScale: 'log',
          data: [
            { x: 'A', y: -50 },
            { x: 'B', y: 0 },
            { x: 'C', y: 120 },
          ],
        }),
      },
      {
        name: 'percent-stack-with-zeros',
        build: (kind) => ({
          kind,
          xField: 'x',
          yField: ['a', 'b'],
          stacked: true,
          stackMode: 'percent',
          data: [
            { x: 'Q1', a: 0, b: 0 },
            { x: 'Q2', a: -10, b: 30 },
            { x: 'Q3', a: 50, b: 50 },
          ],
        }),
      },
      {
        name: 'single-datum',
        build: (kind) => ({
          kind,
          xField: 'x',
          yField: 'y',
          data: [{ x: 'OnlyOneVeryLongCategoryNameHere', y: 42 }],
        }),
      },
      {
        name: 'tiny-magnitude-decimals',
        build: (kind) =>
          kind === 'boxplot'
            ? {
                kind,
                xField: 'group',
                data: [
                  { group: 'API-A', values: [0.001, 0.0018, 0.0025, 0.0038, 0.0045] },
                  { group: 'API-B', values: [0.0012, 0.0023, 0.0032, 0.0046, 0.0055] },
                ],
              }
            : {
                kind,
                xField: 'x',
                yField: 'y',
                data: [
                  { x: 'T1', y: 0.0012 },
                  { x: 'T2', y: 0.0038 },
                  { x: 'T3', y: 0.0054 },
                ],
              },
      },
      {
        name: 'template-braces-and-prefix',
        build: (kind) => ({
          kind,
          xField: 'month',
          yField: 'value',
          referenceLine: 50,
          referenceLabel: 'SLA {c} / {a}',
          data: [
            { month: '2026-01', value: 40 },
            { month: '2026-02', value: 55 },
            { month: '2026-03', value: 48 },
            { month: '2026-04', value: 62 },
            { month: '2026-05', value: 70 },
            { month: '2026-06', value: 76 },
          ],
        }),
      },
    ]

    const failures: string[] = []
    for (const kind of CHART_KINDS) {
      for (const payload of adversarialPayloads) {
        const opt = buildChartOption(payload.build(kind) as never, true, 276)
        const svg = renderSvgWithTheme(opt, true, 276, 240)
        if (!svg.includes('<svg') || /\b(?:NaN|Infinity|undefined)\b/.test(svg)) {
          failures.push(`${kind}/${payload.name}: invalid SVG or NaN leak`)
        }
        if (payload.name === 'template-braces-and-prefix' && (kind === 'line' || kind === 'bar')) {
          if (!svg.includes('SLA {c} / {a}')) {
            failures.push(`${kind}/${payload.name}: markLine literal braces expanded or missing`)
          }
          if (svg.includes('2026...')) {
            failures.push(`${kind}/${payload.name}: common-prefix dates collapsed to 2026...`)
          }
        }
        if (payload.name === 'tiny-magnitude-decimals' && kind === 'boxplot') {
          if (!svg.includes('0.004') && !svg.includes('0.002') && !svg.includes('0.005')) {
            failures.push(`boxplot/${payload.name}: small decimal ticks collapsed`)
          }
        }
      }
    }

    const linksOnlyGraphSvg = renderSvgWithTheme(
      buildChartOption(
        {
          kind: 'graph',
          data: {
            links: [
              { source: 'Gateway', target: 'Auth' },
              { source: 'Auth', target: 'Ledger' },
            ],
          },
        } as never,
        true,
        276,
      ),
      true,
      276,
      240,
    )
    expect(linksOnlyGraphSvg).toContain('Gateway')
    expect(linksOnlyGraphSvg).toContain('Ledger')

    const sparseHeatmapSvg = renderSvgWithTheme(
      buildChartOption(
        {
          kind: 'heatmap',
          xField: 'day',
          yField: 'hour',
          sizeField: 'val',
          data: [
            { day: 'Mon', hour: '09:00', val: null },
            { day: 'Tue', hour: '09:00', val: 12 },
            { day: 'Mon', hour: '10:00', val: 5 },
            { day: 'Tue', hour: '10:00', val: 8 },
          ],
        } as never,
        true,
        276,
      ),
      true,
      276,
      240,
    )
    expect(sparseHeatmapSvg).not.toMatch(/\b(?:NaN|Infinity|undefined)\b/)
    expect(sparseHeatmapSvg).toContain('12')
    expect(sparseHeatmapSvg).toContain('5')

    expect(failures).toEqual([])
  }, 20_000)
})
