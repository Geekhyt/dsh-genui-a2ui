import { beforeEach, describe, expect, it } from 'vitest'
import { formatActionMessage, matchA2uiActionUserText } from '../src/client/action-protocol.ts'
import {
  computeMessagesFingerprint,
  countSurfaceDrafts,
  dismissDockAtSeq,
  ENABLED_STORAGE_KEY,
  getA2uiEnabled,
  getDockUiState,
  loadSurfaceDraft,
  MAX_DRAFT_ENTRIES,
  resetPersistenceForTests,
  sanitizeDataModel,
  saveSurfaceDraft,
  setA2uiEnabled,
  setDockCollapsed,
  setFallbackDefaultEnabled,
} from '../src/client/persistence.ts'
import {
  A2UI_SURFACE_NODE_KIND,
  resolveActiveAskCall,
  resolveDockBatch,
  resolveTurnTailBatch,
  type ChatTargetSnapshot,
} from '../src/client/turn-surfaces.ts'
import { createAskTool, PendingAskRegistry } from '../src/host/ask-tool.ts'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import { createRenderTool } from '../src/host/render-tool.ts'

describe('M2: placement, dock, & superseded historical snapshots', () => {
  it('separates answer, inline, and dock placements and marks superseded turns read-only', () => {
    const snapshot: ChatTargetSnapshot = {
      nodes: {
        values: () => [
          {
            kind: A2UI_SURFACE_NODE_KIND,
            id: 'c1',
            anchorSeq: 10,
            location: { turn: { turn: 1, status: 'closed' } },
            data: {
              callId: 'c1',
              turn: 1,
              seq: 10,
              title: '预订初稿',
              placement: 'answer',
              surfaceIds: ['booking'],
              messages: [{ version: '1.0', createSurface: { surfaceId: 'booking' } } as never],
            },
          },
          {
            kind: A2UI_SURFACE_NODE_KIND,
            id: 'c2',
            anchorSeq: 14,
            location: { turn: { turn: 1, status: 'closed' } },
            data: {
              callId: 'c2',
              turn: 1,
              seq: 14,
              title: '步骤内嵌',
              placement: 'inline',
              surfaceIds: ['inline_step'],
              messages: [{ version: '1.0', createSurface: { surfaceId: 'inline_step' } } as never],
            },
          },
          {
            kind: A2UI_SURFACE_NODE_KIND,
            id: 'c3',
            anchorSeq: 20,
            location: { turn: { turn: 2, status: 'closed' } },
            data: {
              callId: 'c3',
              turn: 2,
              seq: 20,
              title: '流水线监控',
              placement: 'dock',
              surfaceIds: ['pipeline'],
              messages: [{ version: '1.0', createSurface: { surfaceId: 'pipeline' } } as never],
            },
          },
          {
            kind: A2UI_SURFACE_NODE_KIND,
            id: 'c4',
            anchorSeq: 30,
            location: { turn: { turn: 3, status: 'closed' } },
            data: {
              callId: 'c4',
              turn: 3,
              seq: 30,
              title: '预订已确认',
              placement: 'answer',
              surfaceIds: ['booking'],
              messages: [{ version: '1.0', updateDataModel: { surfaceId: 'booking', path: '/ok', value: true } } as never],
            },
          },
        ],
      },
    }

    // Turn 1: shows only `booking` (`inline_step` is excluded from turnTail), and `superseded` is true because Turn 3 updated `booking`!
    const t1 = resolveTurnTailBatch(snapshot, 1)
    expect(t1).not.toBeNull()
    expect([...t1!.visibleSurfaceIds]).toEqual(['booking'])
    expect(t1!.superseded).toBe(true)

    // Turn 2: only had a `dock` call -> `resolveTurnTailBatch` returns null!
    expect(resolveTurnTailBatch(snapshot, 2)).toBeNull()

    // Turn 3: latest version of `booking` -> `superseded` is false!
    const t3 = resolveTurnTailBatch(snapshot, 3)
    expect(t3).not.toBeNull()
    expect([...t3!.visibleSurfaceIds]).toEqual(['booking'])
    expect(t3!.superseded).toBe(false)

    // Dock batch contains `pipeline` at `latestSeq: 20`.
    const dock = resolveDockBatch(snapshot)
    expect(dock).not.toBeNull()
    expect([...dock!.visibleSurfaceIds]).toEqual(['pipeline'])
    expect(dock!.title).toBe('流水线监控')
    expect(dock!.latestSeq).toBe(20)
  })
})

describe('M2: a2ui_ask blocking tool & PendingAskRegistry', () => {
  it('suspends until settled via PendingAskRegistry and strips secret fields', async () => {
    const sessions = new SurfaceSessions(createGenerator())
    const asks = new PendingAskRegistry()
    const askTool = createAskTool(sessions, asks)

    const pendingPromise = askTool.execute(
      {
        title: '确认环境',
        ui: [
          'surface("ask_env")',
          '$/env = ["canary"]',
          'root = Card(Button(Text("继续"), variant="primary", action=Event("go", { env: $/env })))',
        ].join('\n'),
      },
      { callId: 'call_ask_1', agent: { session: { id: 'sess-ask' } } },
    )

    expect(asks.hasPending('sess-ask', 'call_ask_1')).toBe(true)

    const ok = asks.settle('sess-ask', {
      callId: 'call_ask_1',
      action: 'go',
      surfaceId: 'ask_env',
      userMessage: '确认灰度',
      context: { env: ['canary'], apiKey: 'sk-should-strip' },
      dataModels: { ask_env: { env: ['canary'], password: 'secret-value' } },
    })
    expect(ok).toBe(true)

    const result = await pendingPromise
    expect(result.status).toBe('answered')
    expect(result.action).toBe('go')
    expect(result.userMessage).toBe('确认灰度')
    expect(result.context).toEqual({ env: ['canary'] })
    expect(result.dataModels).toEqual({ ask_env: { env: ['canary'] } })

    const meta = askTool.output.presentationMeta({}, result)
    expect(meta.kind).toBe('dsh-a2ui-ask')
    expect(meta.status).toBe('answered')
  })

  it('supports skip and AbortSignal cancellation cleanly', async () => {
    const sessions = new SurfaceSessions(createGenerator())
    const asks = new PendingAskRegistry()
    const askTool = createAskTool(sessions, asks)

    const skipPromise = askTool.execute(
      { ui: 'surface("s1")\nroot = Button(Text("确定"), action=Event("ok"))' },
      { callId: 'call_skip', agent: { session: { id: 'sess-skip' } } },
    )
    asks.settle('sess-skip', { callId: 'call_skip', skipped: true })
    const skipped = await skipPromise
    expect(skipped.status).toBe('skipped')

    const ac = new AbortController()
    const abortPromise = askTool.execute(
      { ui: 'surface("s2")\nroot = Button(Text("确定"), action=Event("ok"))' },
      { callId: 'call_abort', signal: ac.signal, agent: { session: { id: 'sess-abort' } } },
    )
    ac.abort(new Error('user pressed stop'))
    await expect(abortPromise).rejects.toThrow(/user pressed stop/)
    expect(asks.hasPending('sess-abort')).toBe(false)
  })
})

describe('M2: A2UI 1-click on/off switch', () => {
  it('compiles full 24-component catalog when enabled and blocks calls when turned off', async () => {
    const sessions = new SurfaceSessions(createGenerator())
    const renderTool = createRenderTool(sessions)
    const exec = { agent: { session: { id: 'sess-toggle' } } }

    expect(sessions.isEnabled('sess-toggle')).toBe(true)
    const enabledRes = await renderTool.execute(
      { ui: 'surface("b1")\nroot = Chart("bar", [{x: "A", y: 1}], xField="x", yField="y")' },
      exec,
    )
    expect(enabledRes.surfaceIds).toEqual(['b1'])

    sessions.setEnabled('sess-toggle', false)
    expect(sessions.isEnabled('sess-toggle')).toBe(false)
    await expect(
      renderTool.execute({ ui: 'surface("b2")\nroot = Text("off")' }, exec),
    ).rejects.toThrow(/turned OFF/)

    sessions.setEnabled('sess-toggle', true)
    const reenabledRes = await renderTool.execute({ ui: 'surface("b3")\nroot = Card(Text("重新开启"))' }, exec)
    expect(reenabledRes.surfaceIds).toEqual(['b3'])
  })
})

describe('M2: [a2ui-action] userText rule & LRU-200 persistence', () => {
  beforeEach(() => {
    resetPersistenceForTests()
  })

  it('parses formatted [a2ui-action] protocol messages into clean chip metadata', () => {
    const formatted = formatActionMessage(
      {
        name: 'confirm_booking',
        surfaceId: 'booking',
        sourceComponentId: 'btn_1',
        timestamp: new Date().toISOString(),
        userMessage: '确认餐厅预订',
        context: { guests: 6, vip: true },
      },
      { booking: { form: { guests: 6, secret: 'hide-me' } } },
    )

    const matched = matchA2uiActionUserText(formatted, 0)
    expect(matched).toBeDefined()
    expect(matched!.start).toBe(0)
    expect(matched!.end).toBe(formatted.length)
    expect(matched!.data.surfaceId).toBe('booking')
    expect(matched!.data.actionName).toBe('confirm_booking')
    expect(matched!.data.summaryLabel).toBe('确认餐厅预订')
    expect(matched!.data.paramsText).toContain('"guests":6')
    expect(matched!.data.dataModelText).not.toContain('hide-me')
  })

  it('persists sanitized surface drafts with LRU-200 eviction plus dock & tier state', () => {
    const fp = computeMessagesFingerprint([{ createSurface: { surfaceId: 'f1' } }])
    expect(fp).toHaveLength(8)

    const sanitized = sanitizeDataModel(
      { name: '李雷', pinCode: '123456', apiKey: 'sk-123' },
      new Set(['/pinCode']),
    )
    expect(sanitized).toEqual({ name: '李雷' })

    for (let i = 0; i < MAX_DRAFT_ENTRIES + 15; i++) {
      saveSurfaceDraft('sess-lru', `surf-${i}`, fp, { idx: i })
    }
    expect(countSurfaceDrafts()).toBe(MAX_DRAFT_ENTRIES)
    expect(loadSurfaceDraft('sess-lru', 'surf-0', fp)).toBeNull()
    expect(loadSurfaceDraft('sess-lru', `surf-${MAX_DRAFT_ENTRIES + 14}`, fp)).toEqual({
      idx: MAX_DRAFT_ENTRIES + 14,
    })

    setDockCollapsed('sess-dock', true)
    dismissDockAtSeq('sess-dock', 42)
    expect(getDockUiState('sess-dock')).toEqual({ collapsed: true, dismissedSeq: 42 })

    expect(getA2uiEnabled('sess-toggle')).toBe(true)
    setFallbackDefaultEnabled(false)
    expect(getA2uiEnabled('sess-toggle')).toBe(false)
    setA2uiEnabled('sess-toggle', true)
    expect(getA2uiEnabled('sess-toggle')).toBe(true)
    setA2uiEnabled('sess-toggle', false)
    expect(getA2uiEnabled('sess-toggle')).toBe(false)
    expect(ENABLED_STORAGE_KEY).toBe('dsh-a2ui:tier:v1')
  })
})

describe('M2: resolveActiveAskCall & mock-llm DSL fixtures', () => {
  it('resolves active preparing/start a2ui_ask calls and hides settled/closed ones', async () => {
    const mockMod = (await import('../scripts/mock-llm.mjs' as string)) as Record<string, string>
    const deployUi = mockMod.DEPLOY_ASK_UI!
    const waitingSnap: ChatTargetSnapshot = {
      nodes: {
        values: () => [
          {
            kind: 'tool-call',
            anchorSeq: 12,
            location: { turn: { turn: 1, status: 'open' } },
            data: {
              root: {
                phase: 'start',
                callId: 'call_ask_live',
                name: 'a2ui_ask',
                args: {
                  text: (k: string) => (k === 'title' ? '发布环境确认' : k === 'ui' ? deployUi : undefined),
                },
              },
            },
          },
        ],
      },
    }
    const active = resolveActiveAskCall(waitingSnap)
    expect(active).toEqual({
      callId: 'call_ask_live',
      phase: 'start',
      title: '发布环境确认',
      ui: deployUi,
    })

    const settledSnap: ChatTargetSnapshot = {
      nodes: {
        values: () => [
          {
            kind: 'tool-call',
            anchorSeq: 12,
            location: { turn: { turn: 1, status: 'open' } },
            data: {
              root: {
                kind: 'tool-result',
                callId: 'call_ask_live',
                name: 'a2ui_ask',
              },
            },
          },
        ],
      },
    }
    expect(resolveActiveAskCall(settledSnap)).toBeNull()
  })

  it('compiles every mock-llm Express UI fixture cleanly with SurfaceSessions', async () => {
    const m = (await import('../scripts/mock-llm.mjs' as string)) as Record<string, string>
    const sessions = new SurfaceSessions(createGenerator())
    expect(sessions.compile('mock-verify', m.BOOKING_UI!).length).toBeGreaterThan(0)
    expect(sessions.compile('mock-verify', m.UPDATE_UI!).length).toBeGreaterThan(0)
    expect(sessions.compile('mock-verify', m.DASHBOARD_UI!).length).toBeGreaterThan(0)
    expect(sessions.compile('mock-verify', m.ANALYTICS_UPDATE_UI!).length).toBeGreaterThan(0)
    expect(sessions.compile('mock-verify', m.DEPLOY_ASK_UI!).length).toBeGreaterThan(0)
    expect(sessions.compile('mock-verify', m.DOCK_MONITOR_UI!).length).toBeGreaterThan(0)
    expect(sessions.compile('mock-verify', m.DOCK_MONITOR_UPDATE_UI!).length).toBeGreaterThan(0)
    expect(sessions.compile('mock-verify', m.INLINE_SUMMARY_UI!).length).toBeGreaterThan(0)
    expect(sessions.compile('mock-showcase', m.SHOWCASE_EXECUTIVE_UI!).length).toBeGreaterThan(0)
    expect(sessions.compile('mock-showcase', m.SHOWCASE_STORE_OPS_UI!).length).toBeGreaterThan(0)
    expect(sessions.compile('mock-showcase', m.SHOWCASE_ARCHITECTURE_UI!).length).toBeGreaterThan(0)
    expect(sessions.compile('mock-showcase', m.SHOWCASE_SIMULATOR_UI!).length).toBeGreaterThan(0)
    expect(sessions.compile('mock-showcase', m.SHOWCASE_ASK_DIFF_UI!).length).toBeGreaterThan(0)
    expect(sessions.compile('mock-showcase', m.SHOWCASE_DOCK_PIPELINE_UI!).length).toBeGreaterThan(0)
  })
})
