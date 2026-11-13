import { describe, expect, it } from 'vitest'
import {
  A2UI_SURFACE_NODE_KIND,
  a2uiSurfaceNodeDefinition,
  isTurnClosedForCall,
  parseRenderMeta,
  resolveTurnTailBatch,
  type ChatTargetSnapshot,
} from '../src/client/turn-surfaces.ts'

describe('turn-surfaces projection', () => {
  it('projects a2ui_render tool/call + tool/result into hidden chat nodes and replays cross-turn updates', () => {
    const meta1 = parseRenderMeta({
      kind: 'dsh-a2ui',
      version: 1,
      title: '第一轮面板',
      surfaceIds: ['panel'],
      messages: [{ version: '1.0', createSurface: { surfaceId: 'panel', catalogId: 'basic' } } as never],
    })
    const meta2 = parseRenderMeta({
      kind: 'dsh-a2ui',
      version: 1,
      title: '第二轮更新',
      surfaceIds: ['panel'],
      messages: [{ version: '1.0', updateDataModel: { surfaceId: 'panel', path: '/count', value: 2 } } as never],
    })
    expect(meta1).not.toBeNull()
    expect(meta2).not.toBeNull()

    const callMatch = {
      event: { type: 'tool/call', seq: 10, data: { name: 'a2ui_render', callId: 'c1', turn: 1 } },
      location: { kind: 'step', turn: { turn: 1, status: 'closed' } },
    }
    const resultMatch = {
      event: {
        type: 'tool/result',
        seq: 11,
        surfaceOp: 'append',
        data: { turn: 1, message: { source: { callId: 'c1' }, isError: false }, meta: meta1 },
      },
      location: { kind: 'step', turn: { turn: 1, status: 'closed' } },
    }

    const s0 = a2uiSurfaceNodeDefinition.start({}, callMatch)
    const s1 = a2uiSurfaceNodeDefinition.update(
      { key: 'a2ui:c1', id: 'c1', start: callMatch, matches: [callMatch, resultMatch], state: s0 },
      resultMatch,
    )
    const node1 = a2uiSurfaceNodeDefinition.buildViewNode({
      key: 'a2ui:c1',
      id: 'c1',
      start: callMatch,
      matches: [callMatch, resultMatch],
      state: s1,
    })
    expect(node1?.visibility).toBe('hidden')
    expect(node1?.kind).toBe(A2UI_SURFACE_NODE_KIND)

    const node2 = {
      key: 'a2ui:c2',
      kind: A2UI_SURFACE_NODE_KIND,
      id: 'c2',
      anchorSeq: 22,
      location: { turn: { turn: 2, status: 'running' } },
      data: {
        callId: 'c2',
        turn: 2,
        seq: 22,
        title: meta2!.title,
        surfaceIds: meta2!.surfaceIds,
        messages: meta2!.messages,
      },
    }

    const snapshot: ChatTargetSnapshot = {
      nodes: {
        values: () => [node1!, node2],
      },
    }

    expect(isTurnClosedForCall(snapshot, 'c1')).toBe(true)
    expect(isTurnClosedForCall(snapshot, 'c2')).toBe(false)

    const turn1Batch = resolveTurnTailBatch(snapshot, 1)
    expect(turn1Batch?.messages).toHaveLength(1)
    expect([...(turn1Batch?.visibleSurfaceIds ?? [])]).toEqual(['panel'])

    const turn2Batch = resolveTurnTailBatch(snapshot, 2)
    expect(turn2Batch?.messages).toHaveLength(2)
    expect(turn2Batch?.title).toBe('第二轮更新')
  })
})
