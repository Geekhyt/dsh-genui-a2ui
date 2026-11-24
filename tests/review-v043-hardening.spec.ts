import { readExpandedCss } from '../scripts/check-invariants.mjs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NativeDateField } from '../src/client/catalog/NativeDateField.tsx'
import {
  buildEndpointCurl,
  formatTableToCsv,
  formatTableToMarkdown,
} from '../src/client/catalog/v4-helpers.ts'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { parseFileTarget } from '../src/client/file-opener.tsx'
import { assertSafeSvg, stripUnsafeDirectives } from '../src/client/mermaid-safe.ts'
import { notifySubscribers } from '../src/client/notify.ts'
import {
  getA2uiEnabled,
  getDockUiState,
  isPointerObscured,
  isPointerObscuredOrParent,
  normalizePointerPath,
  sanitizeDataModel,
} from '../src/client/persistence.ts'
import { readAskArgs, resetAskArgsWarningForTests } from '../src/host/ask-tool.ts'
import { SurfaceSessions, stripWrapping } from '../src/host/generator.ts'
import { compactPromptSnippet } from '../src/host/prompt-compact.ts'
import { A2UI_SYSTEM_GUIDANCE } from '../src/index.ts'
import { evaluateCalcExpression, validateCalcExpression } from '../src/shared/calc-engine.ts'
import { isSecretKey, safeStringifyJson, sanitizeInlineUrlText } from '../src/shared/constants.ts'
import { desugarExpressConcat, foldNestedCondToLookup } from '../src/shared/express-preprocess.ts'

describe('v0.4.3 Comprehensive Review & Visual QA Hardening', () => {
  it('H-01: rejects HTML named entity XSS, data:image/svg+xml, SMIL animate/set, and repeated frontmatter', () => {
    expect(() =>
      assertSafeSvg('<svg><a href="javascript&colon;alert(1)"><text>x</text></a></svg>'),
    ).toThrow(/sanitization/i)
    expect(() =>
      assertSafeSvg('<svg><image href="data:image/svg+xml;base64,PHN2Zz4="/></svg>'),
    ).toThrow(/sanitization/i)
    expect(() =>
      assertSafeSvg('<svg><animate attributeName="href" to="javascript:alert(1)"/></svg>'),
    ).toThrow(/sanitization/i)
    expect(() =>
      assertSafeSvg('<svg><set attributeName="onmouseover" to="alert(1)"/></svg>'),
    ).toThrow(/sanitization/i)

    const stripped = stripUnsafeDirectives(
      '---\nsecurityLevel: loose\n---\n---\ntheme: dark\n---\ngraph TD\n  A --> B',
    )
    expect(stripped).toBe('graph TD\n  A --> B')
  })

  it('H-02: blocks path traversal (..), UNC paths, control chars, and arbitrary URI schemes in parseFileTarget', () => {
    expect(parseFileTarget('../../../.ssh/id_rsa')).toBeNull()
    expect(parseFileTarget('src/../../etc/passwd')).toBeNull()
    expect(parseFileTarget('\\\\attacker\\share\\secret.txt')).toBeNull()
    expect(parseFileTarget('//attacker/share/secret.txt')).toBeNull()
    expect(parseFileTarget('dsh-resource://file/session/a/b')).toBeNull()
    expect(parseFileTarget('smb://host/share/file')).toBeNull()
    expect(parseFileTarget('\u0001javascript:alert(1)')).toBeNull()
    expect(parseFileTarget('src/client/index.ts:42')).toEqual({
      path: 'src/client/index.ts',
      line: 42,
    })
    expect(parseFileTarget('C:\\repo\\src\\index.ts:12')).toEqual({
      path: 'C:\\repo\\src\\index.ts',
      line: 12,
    })
  })

  it('H-03: sanitizes HTTP method in buildEndpointCurl against command injection', () => {
    const injected = buildEndpointCurl({
      method: 'GET; rm -rf / #',
      path: '/v1/health',
    })
    expect(injected).toContain('curl -X GET ')
    expect(injected).not.toContain('rm -rf')

    const nonString = buildEndpointCurl({
      method: 123 as unknown as string,
      path: '/v1/health',
    })
    expect(nonString).toContain('curl -X GET ')
  })

  it('H-04: detects acronym secret keys (SSHKey, MFAToken, HTTPAuthorization, APISECRET) without false-positiving benign metrics', () => {
    for (const s of [
      'SSHKey',
      'MFAToken',
      'HTTPAuthorization',
      'APISECRET',
      'clientSecret',
      'accessToken',
      'token',
      'pin',
    ]) {
      expect(isSecretKey(s), `expected ${s} to be secret`).toBe(true)
    }
    for (const safe of ['tokenBudget', 'maxToken', 'tokenPrice', 'pinToDock', 'primaryKey']) {
      expect(isSecretKey(safe), `expected ${safe} to stay non-secret`).toBe(false)
    }
  })

  it('H-05: stripWrapping runs linearly without ReDoS and handles outer fences wrapping <a2ui>', () => {
    const start = performance.now()
    const unclosed = `<a2ui>${' '.repeat(4000)}x`
    expect(stripWrapping(unclosed)).toBe(unclosed)
    expect(performance.now() - start).toBeLessThan(50)

    const nested = '```express\n<a2ui>\nsurface("a")\nroot = Text("hi")\n</a2ui>\n```'
    expect(stripWrapping(nested)).toBe('surface("a")\nroot = Text("hi")')
  })

  it('H-06: express-preprocess handles deep nesting without stack overflow or quadratic stall', () => {
    const deepConcat = `x = ${'('.repeat(2500)}"a" + "b"${')'.repeat(2500)}`
    expect(() => desugarExpressConcat(deepConcat)).not.toThrow()

    const start = performance.now()
    const deepCond = `x = ${'cond(a,'.repeat(2000)}1${',2)'.repeat(2000)}`
    expect(foldNestedCondToLookup(deepCond)).toBe(deepCond)
    expect(performance.now() - start).toBeLessThan(100)
  })

  it('H-07: validateCompiledLimits blocks variable expansion payload amplification', () => {
    const sessions = new SurfaceSessions()
    const big = 'x'.repeat(600)
    const ui = [
      'surface("amp")',
      `a = "${big}"`,
      'b = [a, a, a, a, a, a, a, a, a, a]',
      'c = [b, b, b, b, b, b, b, b, b, b]',
      'd = [c, c, c, c, c, c, c, c, c, c]',
      'root = JsonTree(d)',
    ].join('\n')
    expect(() => sessions.compile('amp-sess', ui)).toThrow(/exceeds limit/i)
  })

  it('H-08: prompt guidance and compacted skill signatures match actual schema positional order', () => {
    const compacted = compactPromptSnippet(new SurfaceSessions().rawPromptSnippet())
    expect(compacted).toContain('pluralize(value, zero?, one?, two?, few?, many?, other)')
    expect(A2UI_SYSTEM_GUIDANCE).toContain(
      'Stat(label, value, delta?, trend?="up"|"down"|"neutral", spark?, caption?)',
    )
    expect(A2UI_SYSTEM_GUIDANCE).toContain(
      'KeyValue(items, title?, columns?=2, bordered?=false, copyable?=false)',
    )
    expect(A2UI_SYSTEM_GUIDANCE).toContain(
      'DiffView(before?, after?, title?, filePath?, line?, language?, mode?="unified"|"split", files?, annotations?)',
    )
  })

  it('M-02: calc-engine resolves user E/PI vars, avoids -0 and decimals overflow, and stabilizes pmt at high nper', () => {
    expect(validateCalcExpression('E * 2', new Set(['E']))).toBeNull()
    expect(evaluateCalcExpression('E * 2', { E: 10 })).toBe(20)
    expect(evaluateCalcExpression('E', {})).toBeCloseTo(Math.E, 6)
    expect(evaluateCalcExpression('1e305', {}, 4)).toBe(1e305)
    expect(Object.is(evaluateCalcExpression('-0.001', {}, 2), 0)).toBe(true)
    expect(evaluateCalcExpression('pmt(0.5, 2000, 10000)', {})).toBeCloseTo(5000, 4)
  })

  it('H-11: persistence lookups guard against Object.prototype keys', () => {
    expect(getDockUiState('toString')).toEqual({ collapsed: false, dismissedSeq: -1 })
    expect(typeof getA2uiEnabled('constructor')).toBe('boolean')
  })

  it('H-12 & H-13 & V-03: hardens waterfall zero-crossing, radar small scale, graph dedup, seriesField sums, exact cross-filter & compact legend truncation', () => {
    const wfOpt = buildChartOption(
      {
        kind: 'waterfall',
        data: [
          { step: 'Start', delta: 10 },
          { step: 'Drop', delta: -30 },
          { step: 'Net', isTotal: true },
        ],
        xField: 'step',
        yField: 'delta',
      },
      true,
      276,
    ) as { series: Array<{ name?: string; stack?: string; data: unknown[] }> }
    expect(wfOpt.series.length).toBe(7)
    const totalSeries = wfOpt.series.find((s) => s.data[2] === -20)
    expect(totalSeries).toBeDefined()

    const radarOpt = buildChartOption(
      {
        kind: 'radar',
        data: [
          { metric: 'A', s1: 0.8, s2: 0.6 },
          { metric: 'B', s1: 0.9, s2: 0.7 },
        ],
        xField: 'metric',
        yField: ['s1', 's2'],
      },
      true,
      276,
    ) as { radar: { indicator: Array<{ max: number }> }; legend: { type: string } }
    expect(radarOpt.radar.indicator[0]!.max).toBeLessThan(2)
    expect(radarOpt.legend.type).toBe('scroll')

    const graphOpt = buildChartOption(
      {
        kind: 'graph',
        data: {
          nodes: [
            { id: 'n1', name: 'Node 1', category: 'A' },
            { id: 'n1', name: 'Dup 1', category: 'A' },
            { id: 'n2', name: 'Node 2', category: 'B' },
          ],
          links: [{ source: 'n1', target: 'n2' }],
        },
      },
      true,
      276,
    ) as { series: Array<{ data: unknown[] }>; legend: { type: string } }
    expect(graphOpt.series[0]!.data).toHaveLength(2)
    expect(graphOpt.legend.type).toBe('scroll')

    const groupedLine = buildChartOption(
      {
        kind: 'line',
        data: [
          { day: 'D1', team: 'A', v: 10 },
          { day: 'D1', team: 'A', v: 15 },
          { day: 'D2', team: 'B', v: 30 },
        ],
        xField: 'day',
        yField: 'v',
        seriesField: 'team',
      },
      true,
      276,
    ) as { series: Array<{ name: string; data: Array<number | null> }> }
    expect(groupedLine.series[0]!.data).toEqual([25, null])
    expect(groupedLine.series[1]!.data).toEqual([null, 30])

    const crossBar = buildChartOption(
      {
        kind: 'bar',
        data: [
          { country: 'US', v: 100 },
          { country: 'Russia', v: 80 },
        ],
        xField: 'country',
        yField: 'v',
        selected: 'US',
      },
      true,
      276,
    ) as { series: Array<{ data: Array<{ itemStyle: { opacity: number } }> }> }
    expect(crossBar.series[0]!.data[0]!.itemStyle.opacity).toBe(1)
    expect(crossBar.series[0]!.data[1]!.itemStyle.opacity).toBeLessThan(0.5)

    const crossSunburst = buildChartOption(
      {
        kind: 'sunburst',
        data: [
          {
            name: 'Compute',
            children: [
              { name: 'GPU-A', value: 60 },
              { name: 'GPU-B', value: 40 },
            ],
          },
          { name: 'Storage', value: 30 },
        ],
        selected: 'GPU-A',
      },
      true,
      276,
    ) as {
      series: Array<{
        data: Array<{
          name: string
          itemStyle: { opacity: number }
          children?: Array<{ name: string; itemStyle: { opacity: number } }>
        }>
      }>
    }
    expect(crossSunburst.series[0]!.data[0]!.itemStyle.opacity).toBe(1)
    expect(crossSunburst.series[0]!.data[0]!.children![0]!.itemStyle.opacity).toBe(1)
    expect(crossSunburst.series[0]!.data[0]!.children![1]!.itemStyle.opacity).toBeLessThan(0.5)
    expect(crossSunburst.series[0]!.data[1]!.itemStyle.opacity).toBeLessThan(0.5)

    const funnelOpt = buildChartOption(
      {
        kind: 'funnel',
        data: [
          { stage: '自然流量触达', v: 100 },
          { stage: '插件市场安装', v: 70 },
          { stage: '首日成功渲染', v: 50 },
          { stage: '团队协作留存', v: 30 },
        ],
        xField: 'stage',
        yField: 'v',
      },
      true,
      276,
    ) as { legend: { formatter?: (name: string) => string } }
    expect(funnelOpt.legend.formatter?.('首日成功渲染')).toBe('首日成功…')
  })

  it('H-15 & V-01/V-04: removes non-existent host CSS tokens and enforces split diff wrapping + shared NativeDateField', () => {
    const cssText = readExpandedCss(
      resolve(import.meta.dirname, '../src/client/catalog/Catalog.module.css'),
    )
    expect(cssText).not.toContain('--dsw-alias-status-')
    expect(cssText).not.toContain('--dsw-alias-state-info-primary')
    const blocks = cssText.split('}')
    for (const block of blocks) {
      if (
        /background\s*:\s*var\(--dsw-alias-brand-primary\b/.test(block) &&
        /color\s*:\s*#fff(?:fff)?\b/i.test(block)
      ) {
        throw new Error(
          `CSS block pairs monochrome --dsw-alias-brand-primary background with hardcoded #fff text (breaks Dark Mode): ${block.trim().slice(0, 120)}`,
        )
      }
    }
    expect(cssText).toContain('.diffSplitTable')
    expect(cssText).toContain('@container (max-width: 720px)')
    expect(cssText).toContain('.datePickerBtn')
    expect(cssText).toContain('.dateRangePickerBtn')
    expect(cssText).toContain('.entityMetricValue[data-tone="success"]')

    const dtDark = renderToStaticMarkup(
      createElement(NativeDateField, {
        type: 'datetime-local',
        dark: true,
        value: '2026-11-21T14:30',
        wrapClassName: 'w',
        inputClassName: 'i',
        buttonClassName: 'b',
        ariaLabel: 'Publish time',
        onChange: () => {},
      }),
    )
    expect(dtDark).toContain('color-scheme:dark')
    expect(dtDark).toContain('<rect')
    expect(dtDark).toContain('aria-label="Publish time"')

    const timeLight = renderToStaticMarkup(
      createElement(NativeDateField, {
        type: 'time',
        dark: false,
        value: '14:30',
        wrapClassName: 'w',
        inputClassName: 'i',
        buttonClassName: 'b',
        onChange: () => {},
      }),
    )
    expect(timeLight).toContain('color-scheme:light')
    expect(timeLight).toContain('<circle')
  })

  it('Generalization: applies unified compact visual-width scroll legends across all multi-series ECharts kinds at 276px', () => {
    const cases: Array<{ name: string; opt: unknown }> = [
      {
        name: 'line',
        opt: buildChartOption(
          {
            kind: 'line',
            data: [
              { d: 'D1', 在线推理吞吐: 120, 离线批处理任务: 80 },
              { d: 'D2', 在线推理吞吐: 140, 离线批处理任务: 90 },
            ],
            xField: 'd',
            yField: ['在线推理吞吐', '离线批处理任务'],
          },
          true,
          276,
        ),
      },
      {
        name: 'combo',
        opt: buildChartOption(
          {
            kind: 'combo',
            data: [
              { t: '08:00', 在线调用量: 100, 延迟指标: 45 },
              { t: '12:00', 在线调用量: 200, 延迟指标: 65 },
            ],
            xField: 't',
            yField: '在线调用量',
            y2Field: '延迟指标',
            referenceLine: 55,
          },
          true,
          276,
        ),
      },
      {
        name: 'radar',
        opt: buildChartOption(
          {
            kind: 'radar',
            data: [
              { k: 'A', 旗舰模型表现: 90, 轻量模型表现: 75 },
              { k: 'B', 旗舰模型表现: 88, 轻量模型表现: 80 },
            ],
            xField: 'k',
            yField: ['旗舰模型表现', '轻量模型表现'],
          },
          true,
          276,
        ),
      },
      {
        name: 'parallel',
        opt: buildChartOption(
          {
            kind: 'parallel',
            data: [
              { model: '旗舰推理深度版', a: 90, b: 80 },
              { model: '轻量快速对话版', a: 75, b: 92 },
            ],
            xField: 'model',
            yField: ['a', 'b'],
          },
          true,
          276,
        ),
      },
      {
        name: 'waterfall',
        opt: buildChartOption(
          {
            kind: 'waterfall',
            data: [
              { step: 'Q2', delta: 100, isTotal: true },
              { step: 'Add', delta: 30 },
            ],
            xField: 'step',
            yField: 'delta',
          },
          true,
          276,
        ),
      },
    ]

    for (const c of cases) {
      const legend = (
        c.opt as {
          legend?: {
            type?: string
            pageIconSize?: number
            pageButtonGap?: number
            formatter?: (n: string) => string
          }
        }
      ).legend
      expect(legend?.type, `${c.name} compact legend should scroll`).toBe('scroll')
      expect(legend?.pageIconSize, `${c.name} compact pageIconSize`).toBe(10)
      expect(legend?.pageButtonGap, `${c.name} compact pageButtonGap`).toBe(8)
      expect(legend?.formatter?.('首日成功渲染'), `${c.name} CJK visual truncation`).toBe(
        '首日成功…',
      )
      expect(legend?.formatter?.('Gateway-P99-Edge'), `${c.name} ASCII visual truncation`).toBe(
        'Gateway-…',
      )
    }
  })

  it('G1-G5 consolidation: shared legacy arg unwrapper, pointer normalization, subscriber fault isolation, safe JSON table export, and scheme sanitization', () => {
    resetAskArgsWarningForTests()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const wrappedAsk = readAskArgs({
        arguments: JSON.stringify({
          ui: 'surface("a")\nroot = Text("hi")',
          title: ' Confirm ',
          timeout: 60,
        }),
      })
      expect(wrappedAsk).toEqual({
        ui: 'surface("a")\nroot = Text("hi")',
        title: 'Confirm',
        timeout: 60,
      })
      expect(readAskArgs({ ui: 123, timeout: 99999999 })).toEqual({
        ui: undefined,
        title: undefined,
        timeout: 180,
      })
      expect(warnSpy).toHaveBeenCalledTimes(1)

      expect(normalizePointerPath('/auth/pin/')).toBe('/auth/pin')
      expect(isPointerObscured('/auth/pin/nested', new Set(['/auth/pin/']))).toBe(true)
      expect(isPointerObscured('/auth/user', new Set(['/auth/pin/']))).toBe(false)
      expect(isPointerObscuredOrParent('/auth', new Set(['/auth/pin/']))).toBe(true)
      expect(
        sanitizeDataModel(
          { auth: { user: 'alice', pin: { value: '1234' } }, ok: true },
          new Set(['/auth/pin/']),
        ),
      ).toEqual({ auth: { user: 'alice' }, ok: true })

      const called: string[] = []
      const listeners = new Set<() => void>([
        () => {
          called.push('first')
          throw new Error('boom')
        },
        () => {
          called.push('second')
        },
      ])
      notifySubscribers(listeners, 'TestStore')
      expect(called).toEqual(['first', 'second'])
      expect(errSpy).toHaveBeenCalledTimes(1)

      const circular: Record<string, unknown> = { a: 1 }
      circular.self = circular
      expect(safeStringifyJson(circular)).toContain('[Circular]')
      const csv = formatTableToCsv(
        [{ key: 'meta', label: 'Meta' }],
        [{ meta: { env: 'prod', replicas: 3 } }, { meta: circular }],
      )
      expect(csv).not.toContain('[object Object]')
      expect(csv).toContain('prod')
      const md = formatTableToMarkdown(
        [{ key: 'meta', label: 'Meta' }],
        [{ meta: { env: 'prod' } }],
      )
      expect(md).not.toContain('[object Object]')
      expect(md).toContain('prod')

      expect(sanitizeInlineUrlText('Click javascript:alert(1) or data:text/html,hi')).toBe(
        'Click or',
      )
      expect(sanitizeInlineUrlText('Visit https://evil.test/x ok')).toBe('Visit ok')
    } finally {
      warnSpy.mockRestore()
      errSpy.mockRestore()
    }
  })
})
