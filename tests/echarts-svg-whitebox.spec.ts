import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { describe, expect, it } from 'vitest'
import {
  buildChartOption,
  getA2uiEchartsThemeName,
  registerA2uiEchartsThemes,
} from '../src/client/chunks/echarts-chunk.ts'
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
})
