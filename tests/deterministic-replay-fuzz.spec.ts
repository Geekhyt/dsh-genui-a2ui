import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { evaluateEvalThresholds } from '../scripts/eval-llm.mjs'
import * as mockLlm from '../scripts/mock-llm.mjs'
import {
  buildDomGeometryAuditExpression,
  decodePngRgba,
  evaluateStickyTintParity,
  evaluateVisualQaReport,
  SCREENSHOT_SHOWCASE_MAP,
  samplePngMedianRgb,
} from '../scripts/visual-qa-bot.mjs'
import { computeMetricRingGeometry } from '../src/client/catalog/v3-helpers.ts'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import {
  assertSafeSvg,
  repairMermaidSource,
  stripUnsafeDirectives,
} from '../src/client/mermaid-safe.ts'
import { StreamingExpressSession } from '../src/client/runtime/streaming.ts'
import {
  A2UI_SURFACE_NODE_KIND,
  type ChatTargetSnapshot,
  resolveDockBatch,
  resolveTurnTailBatch,
} from '../src/client/shell/turn-surfaces.ts'
import { evaluateCalcExpression } from '../src/shared/calc-engine.ts'
import { preprocessExpressProgram } from '../src/shared/express-preprocess.ts'

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function collectExportedShowcases(): Array<readonly [string, string]> {
  const out: Array<readonly [string, string]> = []
  for (const [k, v] of Object.entries(mockLlm)) {
    if (/^SHOWCASE_[A-Z0-9_]+_UI$/.test(k) && typeof v === 'string' && v.trim() !== '') {
      out.push([k, v])
    }
  }
  return out.sort(([a], [b]) => (a < b ? -1 : 1))
}

function streamProgramWithRandomChunks(
  program: string,
  seed: number,
): ReturnType<StreamingExpressSession['advance']> {
  const rng = mulberry32(seed)
  const session = new StreamingExpressSession()
  let cursor = 0
  while (cursor < program.length) {
    const step = 1 + Math.floor(rng() * 37)
    cursor = Math.min(program.length, cursor + step)
    session.advance(program.slice(0, cursor), false)
  }
  return session.advance(program, true)
}

function materializeA2uiMessages(
  messages: readonly unknown[],
): Record<
  string,
  { components: Record<string, unknown>; dataPatches: Array<{ path: string; value: unknown }> }
> {
  const surfaces: Record<
    string,
    { components: Record<string, unknown>; dataPatches: Array<{ path: string; value: unknown }> }
  > = {}
  const ensure = (id: string) => {
    if (!surfaces[id]) surfaces[id] = { components: {}, dataPatches: [] }
    return surfaces[id]!
  }
  for (const raw of messages) {
    if (typeof raw !== 'object' || raw === null) continue
    const msg = raw as Record<string, Record<string, unknown> | undefined>
    if (msg.createSurface && typeof msg.createSurface.surfaceId === 'string') {
      const s = ensure(msg.createSurface.surfaceId)
      if (Array.isArray(msg.createSurface.components)) {
        for (const c of msg.createSurface.components) {
          if (
            typeof c === 'object' &&
            c !== null &&
            typeof (c as { id?: unknown }).id === 'string'
          ) {
            s.components[(c as { id: string }).id] = c
          }
        }
      }
    }
    if (msg.updateComponents && typeof msg.updateComponents.surfaceId === 'string') {
      const s = ensure(msg.updateComponents.surfaceId)
      if (Array.isArray(msg.updateComponents.components)) {
        for (const c of msg.updateComponents.components) {
          if (
            typeof c === 'object' &&
            c !== null &&
            typeof (c as { id?: unknown }).id === 'string'
          ) {
            s.components[(c as { id: string }).id] = c
          }
        }
      }
    }
    if (msg.updateDataModel && typeof msg.updateDataModel.surfaceId === 'string') {
      const s = ensure(msg.updateDataModel.surfaceId)
      const path = typeof msg.updateDataModel.path === 'string' ? msg.updateDataModel.path : '/'
      const existingIdx = s.dataPatches.findIndex((p) => p.path === path)
      const entry = { path, value: msg.updateDataModel.value }
      if (existingIdx >= 0) s.dataPatches[existingIdx] = entry
      else s.dataPatches.push(entry)
    }
    if (msg.deleteSurface && typeof msg.deleteSurface.surfaceId === 'string') {
      delete surfaces[msg.deleteSurface.surfaceId]
    }
  }
  return surfaces
}

describe('Deterministic streaming replay equivalence across all showcases', () => {
  const showcases = collectExportedShowcases()

  it('replays every exported SHOWCASE_*_UI with random token chunking identically to one-shot compilation', () => {
    expect(showcases.length).toBeGreaterThanOrEqual(25)

    for (let idx = 0; idx < showcases.length; idx++) {
      const [name, ui] = showcases[idx]!
      const oneShot = new StreamingExpressSession().advance(ui, true)
      expect(oneShot.error, `${name} one-shot compile error`).toBeNull()
      expect(oneShot.messages.length, `${name} produced zero messages`).toBeGreaterThan(0)

      const streamed = streamProgramWithRandomChunks(ui, 10_000 + idx)
      expect(streamed.error, `${name} streamed compile error`).toBeNull()
      expect(streamed.surfaceIds, `${name} surfaceIds mismatch`).toEqual(oneShot.surfaceIds)
      expect(
        materializeA2uiMessages(streamed.messages),
        `${name} materialized state mismatch`,
      ).toEqual(materializeA2uiMessages(oneShot.messages))
    }
  }, 20_000)

  it('recovers deterministically from wrapped fences and mid-stream corruption', () => {
    const sample = showcases[0]![1]
    const wrapped = `<a2ui>\n\`\`\`a2ui\n${sample}\n\`\`\`\n</a2ui>`
    const baseline = new StreamingExpressSession().advance(sample, true)
    const baselineState = materializeA2uiMessages(baseline.messages)
    const streamedWrapped = streamProgramWithRandomChunks(wrapped, 4242)
    expect(streamedWrapped.error).toBeNull()
    expect(materializeA2uiMessages(streamedWrapped.messages)).toEqual(baselineState)

    const session = new StreamingExpressSession()
    session.advance('surface("broken"\nroot = Text(((', false)
    const healed = session.advance(sample, true)
    expect(healed.error).toBeNull()
    expect(materializeA2uiMessages(healed.messages)).toEqual(baselineState)
  })

  it('replays multi-turn dock, partial supersede, and deleteSurface event logs deterministically', () => {
    const makeSnapshot = (): ChatTargetSnapshot => ({
      nodes: new Map([
        [
          'n1',
          {
            key: 'n1',
            kind: A2UI_SURFACE_NODE_KIND,
            anchorSeq: 1,
            location: { turn: { turn: 1 } },
            data: {
              callId: 'c1',
              turn: 1,
              seq: 1,
              title: 'Turn 1',
              placement: 'answer',
              surfaceIds: ['s1', 's2'],
              messages: [
                { createSurface: { surfaceId: 's1', catalogId: 'dsh' } },
                { createSurface: { surfaceId: 's2', catalogId: 'dsh' } },
              ],
            },
          },
        ],
        [
          'n2',
          {
            key: 'n2',
            kind: A2UI_SURFACE_NODE_KIND,
            anchorSeq: 2,
            location: { turn: { turn: 2 } },
            data: {
              callId: 'c2',
              turn: 2,
              seq: 2,
              title: 'Dock s3',
              placement: 'dock',
              surfaceIds: ['s3'],
              messages: [{ createSurface: { surfaceId: 's3', catalogId: 'dsh' } }],
            },
          },
        ],
        [
          'n3',
          {
            key: 'n3',
            kind: A2UI_SURFACE_NODE_KIND,
            anchorSeq: 3,
            location: { turn: { turn: 3 } },
            data: {
              callId: 'c3',
              turn: 3,
              seq: 3,
              title: 'Update s1 and remove s3',
              placement: 'answer',
              surfaceIds: ['s1', 's3'],
              messages: [
                { updateDataModel: { surfaceId: 's1', path: '/v', value: 2 } },
                { deleteSurface: { surfaceId: 's3' } },
              ],
            },
          },
        ],
      ]),
    })

    const snapA = makeSnapshot()
    const snapB = makeSnapshot()
    const turn1A = resolveTurnTailBatch(snapA, 1)
    const turn1B = resolveTurnTailBatch(snapB, 1)
    expect(turn1A).not.toBeNull()
    expect(turn1A?.superseded).toBe(true)
    expect(turn1A?.allSuperseded).toBe(false)
    expect([...(turn1A?.supersededSurfaceIds ?? [])]).toEqual(['s1'])
    expect([...(turn1A?.visibleSurfaceIds ?? [])]).toEqual(['s1', 's2'])
    expect(turn1A?.messages).toEqual(turn1B?.messages)

    expect(resolveDockBatch(snapA)).toBeNull()
    expect(resolveDockBatch(snapB)).toBeNull()
  })
})

describe('Seeded linear-time compiler & security fuzzing', () => {
  it('fuzzes preprocessExpressProgram across 200 adversarial inputs in linear time without crashing', () => {
    const rng = mulberry32(20261122)
    const atoms = [
      'Text("hello \'world\'")',
      'calc("a + b * 2")',
      'cond($/x, "a", "b")',
      '"""triple\'quote"""',
      "# comment with don't",
      "-- sql comment isn't closed",
      '("a" + "b" + "c")',
      'DateRange($/range, ?required)',
      '[[[((()))]]]',
      '\\"',
      '\n',
    ]

    const start = performance.now()
    for (let i = 0; i < 200; i++) {
      const len = 5 + Math.floor(rng() * 35)
      let prog = 'surface("fuzz")\n'
      for (let j = 0; j < len; j++) {
        prog += atoms[Math.floor(rng() * atoms.length)]
        if (j % 4 === 3) prog += '\n'
      }
      const out = preprocessExpressProgram(prog)
      expect(typeof out).toBe('string')
    }

    const hugeNested = `surface("big")\nroot = Column([${'Text("x"), '.repeat(400)}Text("end")])`
    const hugeStart = performance.now()
    const hugeOut = preprocessExpressProgram(hugeNested)
    expect(hugeOut).toContain('surface("big")')
    expect(performance.now() - hugeStart).toBeLessThan(150)
    expect(performance.now() - start).toBeLessThan(500)
  })

  it('fuzzes evaluateCalcExpression and mermaid-safe sanitization fail-closed', () => {
    const rng = mulberry32(991122)
    const tokens = ['1', '0', '-2.5', 'a', 'b', '+', '-', '*', '/', '(', ')', 'round(', 'pmt(', ',']
    for (let i = 0; i < 200; i++) {
      let expr = ''
      const len = 3 + Math.floor(rng() * 14)
      for (let j = 0; j < len; j++) {
        expr += tokens[Math.floor(rng() * tokens.length)]
      }
      try {
        const res = evaluateCalcExpression(expr, { a: 12.5, b: 0, __proto__: { hacked: 99 } })
        expect(typeof res).toBe('number')
      } catch {
        expect(true).toBe(true)
      }
    }

    const unsafeSvgs = [
      '<svg><a href="javascript&colon;alert(1)"><text>x</text></a></svg>',
      '<svg><script>alert(1)</script></svg>',
      '<svg><rect onclick="alert(1)" /></svg>',
      '<svg><animate attributeName="href" to="javascript:alert(1)" /></svg>',
      '<svg><image href="data:image/svg+xml,<svg/>" /></svg>',
      '<svg><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(1)></body></foreignObject></svg>',
    ]
    for (const payload of unsafeSvgs) {
      expect(() => assertSafeSvg(payload), payload).toThrow()
    }

    const nestedDirective =
      '---\nconfig:\n  securityLevel: loose\n---\n%%{init: {"theme": "dark"}}%%\ngraph TD\nA[用户 (管理员)] --> B[结束]'
    const stripped = stripUnsafeDirectives(nestedDirective)
    expect(stripped).not.toContain('securityLevel')
    expect(stripped).not.toContain('%%{init')
    const repaired = repairMermaidSource(stripped)
    expect(repaired).toContain('A["用户 (管理员)"]')
  })
})

describe('Ultra-narrow 240px ECharts & MetricRing geometry regression', () => {
  const chartKinds = [
    'bar',
    'horizontalBar',
    'line',
    'area',
    'pie',
    'scatter',
    'radar',
    'funnel',
    'gauge',
    'heatmap',
    'treemap',
    'sunburst',
    'sankey',
    'waterfall',
    'boxplot',
    'candlestick',
    'calendar',
    'graph',
    'parallel',
    'combo',
  ] as const

  it('builds valid compact options at containerWidth = 240 in both Dark and Light modes without throwing', () => {
    const sampleData = [
      {
        category: 'Alpha Service Node Very Long Label',
        value: 42,
        target: 50,
        open: 30,
        close: 42,
        low: 25,
        high: 48,
        min: 10,
        q1: 20,
        median: 30,
        q3: 40,
        max: 50,
        date: '2026-06-01',
        source: 'API',
        targetNode: 'DB',
      },
      {
        category: 'Beta Service Node Very Long Label',
        value: 68,
        target: 60,
        open: 42,
        close: 68,
        low: 40,
        high: 75,
        min: 15,
        q1: 25,
        median: 35,
        q3: 45,
        max: 60,
        date: '2026-06-02',
        source: 'DB',
        targetNode: 'Cache',
      },
      {
        category: 'Gamma Service Node Very Long Label',
        value: 51,
        target: 55,
        open: 68,
        close: 51,
        low: 48,
        high: 70,
        min: 12,
        q1: 22,
        median: 32,
        q3: 42,
        max: 55,
        date: '2026-06-03',
        source: 'Cache',
        targetNode: 'Edge',
      },
    ]

    for (const kind of chartKinds) {
      for (const dark of [true, false]) {
        const opt = buildChartOption(
          {
            kind: kind === 'horizontalBar' ? 'bar' : kind,
            horizontal: kind === 'horizontalBar',
            data:
              kind === 'sankey'
                ? {
                    nodes: [{ name: 'API' }, { name: 'DB' }, { name: 'Cache' }],
                    links: [
                      { source: 'API', target: 'DB', value: 42 },
                      { source: 'DB', target: 'Cache', value: 28 },
                    ],
                  }
                : kind === 'graph'
                  ? {
                      nodes: [
                        { id: 'a', name: 'API' },
                        { id: 'b', name: 'DB' },
                        { id: 'c', name: 'Cache' },
                      ],
                      links: [
                        { source: 'a', target: 'b', value: 12 },
                        { source: 'b', target: 'c', value: 5 },
                      ],
                    }
                  : kind === 'treemap' || kind === 'sunburst'
                    ? [
                        {
                          name: 'Root',
                          value: 100,
                          children: [
                            { name: 'A', value: 60 },
                            { name: 'B', value: 40 },
                          ],
                        },
                      ]
                    : sampleData,
            xField: kind === 'calendar' ? 'date' : 'category',
            yField: 'value',
            referenceLine: 55,
            referenceLabel: 'Target 55',
          },
          dark,
          240,
        )
        expect(opt, `${kind} dark=${dark} @240px`).toBeDefined()
        expect(typeof opt).toBe('object')
      }
    }

    const ring = computeMetricRingGeometry({
      value: 99.995,
      max: 100,
      size: 64,
      unit: 'req/s',
    })
    expect(ring.displayNumber).toBe('99.995')
    expect(ring.stackUnit).toBe(true)
  })
})

describe('Eval KPI threshold baseline gate', () => {
  it('accepts passing KPI summaries and rejects regressions against .eval-baseline.json', () => {
    const baseline = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../.eval-baseline.json'), 'utf8'),
    ) as Record<string, unknown>

    const passing = evaluateEvalThresholds(
      [
        {
          strategy: 'scoped',
          routingAccuracyPct: 100,
          firstPassCompileRatePct: 87,
          finalCompileRatePct: 100,
          selfRepairRecoveryPct: 100,
          avgPromptTokens: 6500,
          uniqueComponentsUsed: 64,
        },
        {
          strategy: 'monolithic',
          routingAccuracyPct: 100,
          firstPassCompileRatePct: 87,
          finalCompileRatePct: 100,
          selfRepairRecoveryPct: 100,
          avgPromptTokens: 19400,
          uniqueComponentsUsed: 64,
        },
      ],
      baseline,
      'mock',
    )
    expect(passing).toEqual({ ok: true, violations: [] })

    const failing = evaluateEvalThresholds(
      [
        {
          strategy: 'scoped',
          routingAccuracyPct: 92,
          firstPassCompileRatePct: 60,
          finalCompileRatePct: 85,
          selfRepairRecoveryPct: 50,
          avgPromptTokens: 12000,
          uniqueComponentsUsed: 40,
        },
        {
          strategy: 'monolithic',
          avgPromptTokens: 19400,
        },
      ],
      baseline,
      'mock',
    )
    expect(failing.ok).toBe(false)
    expect(failing.violations.length).toBeGreaterThanOrEqual(5)
  })
})

describe('Headless Visual QA bot contracts & screenshot manifest parity', () => {
  it('maps every entry in screenshots.json to a valid showcase trigger and evaluates geometry runs accurately', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../screenshots.json'), 'utf8'),
    ) as string[]
    expect(manifest.length).toBeGreaterThanOrEqual(8)
    for (const rel of manifest) {
      expect(SCREENSHOT_SHOWCASE_MAP[rel], `missing showcase mapping for ${rel}`).toMatch(
        /^showcase-\d+/,
      )
    }

    const auditExpr = buildDomGeometryAuditExpression()
    expect(auditExpr).toContain('overflowViolations')
    expect(auditExpr).toContain('buttonWrapViolations')
    expect(auditExpr).toContain('clippingViolations')
    expect(auditExpr).toContain('popoverViolations')
    expect(auditExpr).toContain('svgTextClipViolations')

    const clean = evaluateVisualQaReport([
      {
        showcase: 'showcase-16',
        theme: 'dark',
        a2uiElementCount: 120,
        canvasCount: 2,
        svgCount: 4,
        overflowViolations: [],
        buttonWrapViolations: [],
        clippingViolations: [],
        popoverViolations: [],
        svgTextClipViolations: [],
        consoleErrors: [],
        pageErrors: [],
      },
    ])
    expect(clean.ok).toBe(true)
    expect(clean.passedRuns).toBe(1)

    const broken = evaluateVisualQaReport([
      {
        showcase: 'showcase-21',
        theme: 'light',
        a2uiElementCount: 80,
        canvasCount: 0,
        svgCount: 1,
        overflowViolations: [{ cls: 'card', scrollWidth: 400, clientWidth: 306 }],
        buttonWrapViolations: [{ text: 'Copy', width: 22, height: 54 }],
        clippingViolations: [],
        popoverViolations: [],
        svgTextClipViolations: [
          { kind: 'node-box', text: '12.4k/s', textRight: 240, boxRight: 200 },
        ],
        consoleErrors: ['boom'],
        pageErrors: [],
      },
    ])
    expect(broken.ok).toBe(false)
    expect(broken.failures[0]?.issues.length).toBe(4)

    const makeChunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4)
      len.writeUInt32BE(data.length, 0)
      const typeBuf = Buffer.from(type, 'ascii')
      const crc = Buffer.alloc(4)
      return Buffer.concat([len, typeBuf, data, crc])
    }
    const buildSyntheticPng = (
      width: number,
      height: number,
      paint: (x: number, y: number) => readonly [number, number, number, number],
    ) => {
      const ihdr = Buffer.alloc(13)
      ihdr.writeUInt32BE(width, 0)
      ihdr.writeUInt32BE(height, 4)
      ihdr[8] = 8
      ihdr[9] = 6
      const scanlines = Buffer.alloc(height * (1 + width * 4))
      for (let y = 0; y < height; y += 1) {
        const row = y * (1 + width * 4)
        scanlines[row] = 0
        for (let x = 0; x < width; x += 1) {
          const [r, g, b, a] = paint(x, y)
          const off = row + 1 + x * 4
          scanlines[off] = r
          scanlines[off + 1] = g
          scanlines[off + 2] = b
          scanlines[off + 3] = a
        }
      }
      return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        makeChunk('IHDR', ihdr),
        makeChunk('IDAT', deflateSync(scanlines)),
        makeChunk('IEND', Buffer.alloc(0)),
      ])
    }

    const seamPng = buildSyntheticPng(20, 10, (x) =>
      x < 10 ? [33, 33, 33, 255] : [48, 48, 48, 255],
    )
    const decodedSeam = decodePngRgba(seamPng)
    const leftRgb = samplePngMedianRgb(decodedSeam, { x: 1, y: 1, w: 6, h: 6 })
    const rightRgb = samplePngMedianRgb(decodedSeam, { x: 12, y: 1, w: 6, h: 6 })
    expect(leftRgb).toEqual([33, 33, 33])
    expect(rightRgb).toEqual([48, 48, 48])
    expect(
      evaluateStickyTintParity(
        [{ label: 'dark:selected', stickyRgb: leftRgb, normalRgb: rightRgb }],
        4,
      ).ok,
    ).toBe(false)
    expect(
      evaluateStickyTintParity(
        [{ label: 'dark:selected', stickyRgb: rightRgb, normalRgb: rightRgb }],
        4,
      ).ok,
    ).toBe(true)
  })
})
