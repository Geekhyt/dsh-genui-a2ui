import { describe, expect, it } from 'vitest'
import {
  A2UI_SURFACE_NODE_KIND,
  a2uiSurfaceNodeDefinition,
  type ChatTargetSnapshot,
  isTurnClosedForCall,
  parseRenderMeta,
  resolveDockBatch,
  resolveTurnTailBatch,
} from '../src/client/shell/turn-surfaces.ts'

describe('turn-surfaces projection', () => {
  it('projects a2ui_render tool/call + tool/result into hidden chat nodes and replays cross-turn updates', () => {
    const meta1 = parseRenderMeta({
      kind: 'dsh-a2ui',
      version: 1,
      title: '第一轮面板',
      surfaceIds: ['panel'],
      messages: [
        { version: '1.0', createSurface: { surfaceId: 'panel', catalogId: 'basic' } } as never,
      ],
    })
    const meta2 = parseRenderMeta({
      kind: 'dsh-a2ui',
      version: 1,
      title: '第二轮更新',
      surfaceIds: ['panel'],
      messages: [
        {
          version: '1.0',
          updateDataModel: { surfaceId: 'panel', path: '/count', value: 2 },
        } as never,
      ],
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
    expect(turn2Batch?.surfaceTitles.get('panel')).toBe('第二轮更新')
  })

  it('preserves distinct per-surface titles when one turn renders multiple answer surfaces without overwriting the first card', () => {
    const budgetNode = {
      key: 'a2ui:c_budget',
      kind: A2UI_SURFACE_NODE_KIND,
      id: 'c_budget',
      anchorSeq: 10,
      location: { turn: { turn: 1, status: 'closed' } },
      data: {
        callId: 'c_budget',
        turn: 1,
        seq: 10,
        title: '哈尔滨4天3晚 · 两人预算与行程',
        placement: 'answer' as const,
        surfaceIds: ['harbin_budget'],
        messages: [
          {
            version: '1.0',
            createSurface: { surfaceId: 'harbin_budget', catalogId: 'basic' },
          } as never,
        ],
      },
    }
    const wearNode = {
      key: 'a2ui:c_wear',
      kind: A2UI_SURFACE_NODE_KIND,
      id: 'c_wear',
      anchorSeq: 12,
      location: { turn: { turn: 1, status: 'closed' } },
      data: {
        callId: 'c_wear',
        turn: 1,
        seq: 12,
        title: '哈尔滨12月初 · 穿衣与装备清单',
        placement: 'answer' as const,
        surfaceIds: ['harbin_wear'],
        messages: [
          {
            version: '1.0',
            createSurface: { surfaceId: 'harbin_wear', catalogId: 'basic' },
          } as never,
        ],
      },
    }

    const snap: ChatTargetSnapshot = {
      nodes: { values: () => [budgetNode, wearNode] },
    }
    const batch = resolveTurnTailBatch(snap, 1)
    expect(batch).not.toBeNull()
    expect(batch?.title).toBeNull()
    expect(batch?.surfaceTitles.get('harbin_budget')).toBe('哈尔滨4天3晚 · 两人预算与行程')
    expect(batch?.surfaceTitles.get('harbin_wear')).toBe('哈尔滨12月初 · 穿衣与装备清单')

    const sameTitleSnap: ChatTargetSnapshot = {
      nodes: {
        values: () => [
          budgetNode,
          { ...wearNode, data: { ...wearNode.data, title: '哈尔滨4天3晚 · 两人预算与行程' } },
        ],
      },
    }
    expect(resolveTurnTailBatch(sameTitleSnap, 1)?.title).toBe('哈尔滨4天3晚 · 两人预算与行程')

    const multiDockSnap: ChatTargetSnapshot = {
      nodes: {
        values: () => [
          { ...budgetNode, data: { ...budgetNode.data, placement: 'dock' as const } },
          { ...wearNode, data: { ...wearNode.data, placement: 'dock' as const } },
        ],
      },
    }
    const dockBatch = resolveDockBatch(multiDockSnap)
    expect(dockBatch?.title).toBeNull()
    expect(dockBatch?.surfaceTitles.get('harbin_budget')).toBe('哈尔滨4天3晚 · 两人预算与行程')
    expect(dockBatch?.surfaceTitles.get('harbin_wear')).toBe('哈尔滨12月初 · 穿衣与装备清单')

    const deletedSnap: ChatTargetSnapshot = {
      nodes: {
        values: () => [
          budgetNode,
          wearNode,
          {
            key: 'a2ui:c_del',
            kind: A2UI_SURFACE_NODE_KIND,
            id: 'c_del',
            anchorSeq: 15,
            location: { turn: { turn: 1, status: 'closed' } },
            data: {
              callId: 'c_del',
              turn: 1,
              seq: 15,
              title: null,
              placement: 'answer' as const,
              surfaceIds: ['harbin_wear'],
              messages: [{ version: '1.0', deleteSurface: { surfaceId: 'harbin_wear' } } as never],
            },
          },
        ],
      },
    }
    const afterDelete = resolveTurnTailBatch(deletedSnap, 1)
    expect(afterDelete?.title).toBe('哈尔滨4天3晚 · 两人预算与行程')
    expect(afterDelete?.surfaceTitles.has('harbin_wear')).toBe(false)
    expect(afterDelete?.surfaceTitles.get('harbin_budget')).toBe('哈尔滨4天3晚 · 两人预算与行程')
  })
})
