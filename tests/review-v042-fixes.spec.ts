import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  Input: undefined,
  Pill: undefined,
  SegmentedTabs: undefined,
  Tag: undefined,
  Modal: undefined,
  Menu: undefined,
  Tooltip: undefined,
  CodeBlock: undefined,
  JsonTree: undefined,
  DisclosureRow: undefined,
  MarkdownText: undefined,
  IconAppsAddOutlineRegular: undefined,
  IconSearchOutlineRegular: undefined,
}))

const mermaidRenderMock = vi.fn<() => Promise<string>>()
vi.mock('../src/client/chunks/mermaid-chunk.ts', () => ({
  renderMermaidDiagram: (...args: unknown[]) => mermaidRenderMock(...(args as [])),
}))

import { SHOWCASE_V042_QA_UI } from '../scripts/mock-llm.mjs'
import { DshMatrixImpl } from '../src/client/catalog/EnterpriseWidgets.tsx'
import { formatTableToCsv, normalizeMatrixData } from '../src/client/catalog/v4-helpers.ts'
import { getMermaidDiagramSnapshot, subscribeMermaidDiagram } from '../src/client/chunk-loader.ts'
import { buildChartOption } from '../src/client/chunks/echarts-chunk.ts'
import { ErrorBoundary } from '../src/client/runtime/ErrorBoundary.tsx'
import { sanitizeActionContextForSurface } from '../src/client/runtime/SurfaceView.tsx'
import { PendingAskRegistry } from '../src/host/ask-tool.ts'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { readArgs, resetRenderArgsWarningForTests } from '../src/host/render-tool.ts'
import { isSecretKey } from '../src/shared/constants.ts'

describe('v0.4.2 Review Remediation (H-01..H-08 & Visual Polish)', () => {
  beforeEach(() => {
    resetRenderArgsWarningForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('H-01: PendingAskRegistry.settle rejects mismatched explicit callId instead of settling unrelated active ask', async () => {
    const asks = new PendingAskRegistry()
    const pending = asks.wait({
      sessionId: 'sess-1',
      callId: 'call-new',
      defaultSurfaceId: 'approve_deploy',
      timeoutSeconds: 30,
    })

    expect(asks.settle('sess-1', { callId: 'call-stale', action: 'approve' })).toBe(false)
    expect(asks.settle('sess-1', { callId: '   ', action: 'approve' })).toBe(false)
    expect(asks.hasPending('sess-1')).toBe(true)

    expect(asks.settle('sess-1', { callId: 'call-new', action: 'confirm' })).toBe(true)
    const settled = await pending
    expect(settled.status).toBe('answered')
    if (settled.status === 'answered') {
      expect(settled.action).toBe('confirm')
    }

    const fallbackPending = asks.wait({
      sessionId: 'sess-2',
      callId: 'call-only',
      defaultSurfaceId: 'wizard',
      timeoutSeconds: 30,
    })
    expect(asks.settle('sess-2', { action: 'submit' })).toBe(true)
    expect((await fallbackPending).status).toBe('answered')
  })

  it('H-02: readArgs accepts title: null and string-encoded { arguments } payloads', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(
      readArgs({
        ui: 'surface("s1")\nroot = Text("ok")',
        title: null,
        placement: 'answer',
      }),
    ).toEqual({
      ui: 'surface("s1")\nroot = Text("ok")',
      title: undefined,
      placement: 'answer',
    })

    expect(
      readArgs(JSON.stringify({ arguments: { ui: 'surface("s2")\nroot = Text("nested")' } })),
    ).toEqual({
      ui: 'surface("s2")\nroot = Text("nested")',
      title: undefined,
      placement: 'answer',
    })

    expect(
      readArgs({ arguments: JSON.stringify({ ui: 'surface("s3")\nroot = Text("wrapped")' }) }),
    ).toEqual({
      ui: 'surface("s3")\nroot = Text("wrapped")',
      title: undefined,
      placement: 'answer',
    })
  })

  it('H-03: expands isSecretKey and redacts obscured TextField values from action.context (fail-closed)', () => {
    for (const secret of [
      'token',
      'pin',
      'otp',
      'passcode',
      'cvv',
      'passphrase',
      'credential',
      'credentials',
      'authorization',
      'cookie',
      'accessKey',
      'sshKey',
      'signingKey',
      'encryptionKey',
    ]) {
      expect(isSecretKey(secret), `expected ${secret} to be secret`).toBe(true)
    }

    for (const safe of ['tokens', 'promptTokens', 'totalTokens', 'primaryKey', 'region']) {
      expect(isSecretKey(safe), `expected ${safe} to stay non-secret`).toBe(false)
    }

    const compMap = new Map<string, unknown>([
      [
        'tf_pin',
        {
          type: 'TextField',
          properties: { variant: 'obscured', value: { path: '/customCode' } },
        },
      ],
      [
        'tf_short',
        {
          type: 'TextField',
          properties: { variant: 'obscured', value: { path: '/shortCode' } },
        },
      ],
      [
        'btn_submit',
        {
          type: 'Button',
          properties: {
            action: {
              event: {
                name: 'submit',
                context: {
                  userCode: { path: '/customCode' },
                  nested: { digit: { path: 'shortCode' } },
                  step: { path: '/step' },
                  note: { path: '/note' },
                },
              },
            },
          },
        },
      ],
    ])
    const surface = {
      id: 'auth_form',
      componentsModel: {
        get entries() {
          return compMap.entries()
        },
      },
      dataModel: {
        get: (p: string) => {
          if (p === '/customCode') return '998877'
          if (p === '/shortCode') return '1'
          return 'hello'
        },
      },
    }

    const cleaned = sanitizeActionContextForSurface(surface as never, {
      name: 'submit',
      surfaceId: 'auth_form',
      sourceComponentId: 'btn_submit',
      timestamp: '2026-11-21T00:00:00Z',
      context: {
        userCode: '998877',
        mirrored: '998877',
        nested: { digit: '1', keep: 'ok' },
        step: '1',
        note: 'hello',
      },
    })
    expect(cleaned).toEqual({ nested: { keep: 'ok' }, step: '1', note: 'hello' })

    vi.spyOn(console, 'error').mockImplementation(() => {})
    const brokenSurface = {
      id: 'broken',
      componentsModel: {
        get entries() {
          throw new Error('corrupt')
        },
      },
      dataModel: { get: () => 'secret' },
    }
    expect(
      sanitizeActionContextForSurface(brokenSurface as never, {
        name: 'submit',
        surfaceId: 'broken',
        sourceComponentId: 'btn',
        timestamp: '2026-11-21T00:00:00Z',
        context: { custom: '998877' },
      }),
    ).toEqual({})

    const approvalSurface = {
      id: 'approval_form',
      componentsModel: {
        entries: new Map([
          [
            'tf_pin',
            { type: 'TextField', properties: { variant: 'obscured', value: { path: '/pin/' } } },
          ],
          [
            'card_approve',
            {
              type: 'ApprovalCard',
              properties: {
                approveAction: {
                  event: {
                    name: 'approve_deploy',
                    context: { confirmCode: { path: '/pin' }, env: 'prod' },
                  },
                },
                rejectAction: {
                  event: {
                    name: 'reject_deploy',
                    context: { reason: 'manual' },
                  },
                },
              },
            },
          ],
        ]),
      },
      dataModel: {
        get: (p: string) => (p === '/pin' ? '12' : 'prod'),
      },
    }
    expect(
      sanitizeActionContextForSurface(approvalSurface as never, {
        name: 'approve_deploy',
        surfaceId: 'approval_form',
        sourceComponentId: 'card_approve',
        timestamp: '2026-11-21T00:00:00Z',
        context: { confirmCode: '12', env: 'prod' },
      }),
    ).toEqual({ env: 'prod' })
  })

  it('H-04: formatTableToCsv neutralizes signed/whitespace formula injection while preserving pure signed numbers', () => {
    const csv = formatTableToCsv(
      [{ key: 'val', label: 'Value' }],
      [
        { val: -42 },
        { val: '+18.5' },
        { val: "+1+cmd|' /C calc'!A0" },
        { val: '-2+3+HYPERLINK("https://evil.test","x")' },
        { val: '\n=1+1' },
        { val: ' =SUM(A1:A2)' },
      ],
    )
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n')
    expect(lines[1]).toBe('-42')
    expect(lines[2]).toBe('+18.5')
    expect(lines[3]).toBe("'+1+cmd|' /C calc'!A0")
    expect(lines[4]).toBe('"\'-2+3+HYPERLINK(""https://evil.test"",""x"")"')
    expect(csv).toContain('"\'\n=1+1"')
    expect(csv).toContain("' =SUM(A1:A2)")
  })

  it('H-05: Matrix colorScale="auto" exposes ratio 0..1 and renders green, amber, and red bands', () => {
    const model = normalizeMatrixData({
      rows: ['r1'],
      columns: ['low', 'mid', 'high'],
      values: [[10, 50, 95]],
      unit: 'ms',
    })
    expect(model.cells[0]?.[0]?.ratio).toBe(0)
    expect(model.cells[0]?.[1]?.ratio).toBeGreaterThan(0.4)
    expect(model.cells[0]?.[2]?.ratio).toBe(1)

    const MatrixRaw = (DshMatrixImpl as unknown as { rawRender: React.ComponentType<unknown> })
      .rawRender
    const markup = renderToStaticMarkup(
      createElement(MatrixRaw, {
        surfaceId: 'matrix_auto',
        componentId: 'm1',
        dataContextPath: '/',
        buildChild: () => null,
        props: {
          rows: ['r1'],
          columns: ['low', 'mid', 'high'],
          values: [[10, 50, 95]],
          unit: 'ms',
          colorScale: 'auto',
        },
      } as never),
    )
    expect(markup).toContain('--dsw-alias-state-success-primary')
    expect(markup).toContain('--dsw-alias-state-warn-primary')
    expect(markup).toContain('--dsw-alias-state-error-primary')
  })

  it('H-06: ErrorBoundary clears error state when resetKey changes', () => {
    const err = new Error('transient stream mismatch')
    expect(
      ErrorBoundary.getDerivedStateFromProps(
        { resetKey: '1:0:5', children: null },
        { error: err, prevResetKey: '1:0:5' },
      ),
    ).toBeNull()
    expect(
      ErrorBoundary.getDerivedStateFromProps(
        { resetKey: '1:0:6', children: null },
        { error: err, prevResetKey: '1:0:5' },
      ),
    ).toEqual({ error: null, prevResetKey: '1:0:6' })
  })

  it('H-07: Mermaid cache does not permanently poison rejected in-flight renders after unmount and retries cleanly', async () => {
    vi.useFakeTimers()
    try {
      let rejectFirst!: (reason: Error) => void
      mermaidRenderMock.mockReset()
      mermaidRenderMock.mockImplementationOnce(
        () =>
          new Promise<string>((_resolve, reject) => {
            rejectFirst = reject
          }),
      )
      mermaidRenderMock.mockResolvedValueOnce('<svg>recovered</svg>')

      const code = 'flowchart LR\n  A --> B'
      const unsub1 = subscribeMermaidDiagram(
        code,
        true,
        () => null,
        () => {},
      )
      await vi.advanceTimersByTimeAsync(100)
      unsub1()

      rejectFirst(new Error('transient render error'))
      await Promise.resolve()
      await Promise.resolve()

      expect(getMermaidDiagramSnapshot(code, true).error).toBeNull()

      const unsub2 = subscribeMermaidDiagram(
        code,
        true,
        () => null,
        () => {},
      )
      await vi.advanceTimersByTimeAsync(100)
      await Promise.resolve()
      expect(getMermaidDiagramSnapshot(code, true).svg).toBe('<svg>recovered</svg>')
      unsub2()
    } finally {
      vi.useRealTimers()
    }
  })

  it('H-08 & Visual Polish: CSS guards LogViewer 306px toggle, amber AAA contrast, DateTimeInput, compact charts, and showcase-26 compiles', () => {
    const cssText = readFileSync(
      resolve(import.meta.dirname, '../src/client/catalog/Catalog.module.css'),
      'utf8',
    )
    expect(cssText).not.toContain('.logRowMain > :last-child')
    const baseLogMsgIdx = cssText.indexOf('.logMessage {\n  color:')
    const compactLogMsgIdx = cssText.indexOf('.logMessage {\n    flex: 1 0 100%;')
    expect(baseLogMsgIdx).toBeGreaterThan(-1)
    expect(compactLogMsgIdx).toBeGreaterThan(baseLogMsgIdx)
    expect(cssText).toMatch(/\.logDetailToggle\s*\{\s*margin-left:\s*auto;\s*\}/)
    expect(cssText).toMatch(/\.apiMethodBadge\[data-method="PATCH"\]\s*\{[^}]*color:\s*#18181b;/)
    expect(cssText).toMatch(/\.scheduleBar\[data-status="warning"\]\s*\{[^}]*color:\s*#18181b;/)
    expect(cssText).toMatch(/\.resultEmblem\[data-status="warning"\]\s*\{[^}]*color:\s*#18181b;/)
    expect(cssText).toContain('.dateInput::-webkit-calendar-picker-indicator')

    const wfOpt = buildChartOption(
      {
        kind: 'waterfall',
        data: [
          { step: 'Q2', value: 480, isTotal: true },
          { step: 'New', value: 165 },
          { step: 'Q3', value: 645, isTotal: true },
        ],
        xField: 'step',
        yField: 'value',
        referenceLine: 680,
        referenceLabel: '目标 ¥680w',
      },
      true,
      276,
    )
    const wfSeries = wfOpt.series as Array<{ markLine?: { label?: Record<string, unknown> } }>
    expect(wfSeries[1]?.markLine?.label?.fontSize).toBe(9.5)
    expect(wfSeries[1]?.markLine?.label?.distance).toBe(6)

    const tmOpt = buildChartOption(
      {
        kind: 'treemap',
        data: [
          { name: 'R1 深度推理 36w', value: 36 },
          { name: 'A2UI 渲染 16w', value: 16 },
        ],
      },
      true,
      276,
    )
    const tmSeries = tmOpt.series as Array<{ label?: Record<string, unknown> }>
    expect(tmSeries[0]?.label?.fontSize).toBe(9.5)
    expect(tmSeries[0]?.label?.padding).toEqual([2, 3])

    const sessions = new SurfaceSessions(createGenerator())
    const compiled = sessions.compile('qa-v042', SHOWCASE_V042_QA_UI)
    expect(compiled.length).toBeGreaterThan(0)
  })
})
