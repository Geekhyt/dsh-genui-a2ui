import { resolve } from 'node:path'
import type { AgentToRendererMessage } from '@a2ui/agent'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  discoverSpecs,
  parseTlcOutput,
  resolveJavaBinary,
  resolveTlaJar,
  runTlcForSpec,
  validateSpecStructure,
} from '../scripts/verify-tla.mjs'
import {
  countMermaidDiagramCacheEntries,
  MAX_MERMAID_CACHE_ENTRIES,
  resetMermaidDiagramCacheForTests,
  seedMermaidDiagramCacheForTests,
  subscribeMermaidDiagram,
} from '../src/client/chunk-loader.ts'
import { PendingAskRegistry } from '../src/host/ask-tool.ts'
import {
  collectMessageComponents,
  collectMessageSurfaceIds,
  getCreateSurfaceDataModel,
  getMessagePayloads,
  getUpdateDataModelPayload,
  isPlainRecord,
} from '../src/shared/a2ui-message.ts'

const ROOT_DIR = resolve(import.meta.dirname, '..')

describe('TLA+ formal state-machine specifications & TLC verification', () => {
  beforeEach(() => {
    resetMermaidDiagramCacheForTests()
  })

  it('discovers all 4 core concurrent state-machine specs with valid structure and invariants', () => {
    const specs = discoverSpecs(ROOT_DIR)
    expect(specs.map((s) => s.name)).toEqual([
      'AskLifecycle',
      'ChunkAndMermaidCache',
      'OverlayEscapeStack',
      'SurfaceTurnLifecycle',
    ])
    for (const spec of specs) {
      expect(validateSpecStructure(spec)).toEqual([])
    }
  })

  it('parses TLC summary statistics accurately including comma-formatted progress lines', () => {
    const sample = [
      'Progress(9) at 2026-11-26 11:24:46: 3,519 states generated, 579 distinct states found, 0 states left on queue.',
      'Model checking completed. No error has been found.',
      '3519 states generated, 579 distinct states found, 0 states left on queue.',
      'The depth of the complete state graph search is 9.',
    ].join('\n')
    expect(parseTlcOutput(sample)).toEqual({
      ok: true,
      statesGenerated: 3519,
      distinctStates: 579,
      diameter: 9,
    })

    const commaOnly = [
      'Model checking completed. No error has been found.',
      'Progress(10): 45,493 states generated, 11,040 distinct states found, 0 states left on queue.',
      'The depth of the complete state graph search is 10.',
    ].join('\n')
    expect(parseTlcOutput(commaOnly)).toEqual({
      ok: true,
      statesGenerated: 45493,
      distinctStates: 11040,
      diameter: 10,
    })
  })

  it('runs real TLC model checking across all 4 specs when Java and tla2tools.jar are installed', () => {
    const javaBin = resolveJavaBinary()
    const jarPath = resolveTlaJar(ROOT_DIR)
    if (javaBin === null || jarPath === null) return

    const specs = discoverSpecs(ROOT_DIR)
    for (const spec of specs) {
      const result = runTlcForSpec(javaBin, jarPath, spec)
      expect(result.ok, result.output).toBe(true)
      expect(result.distinctStates).toBeGreaterThan(20)
    }
  }, 30_000)

  it('enforces ChunkAndMermaidCache BoundedIdleCache by trimming oversized idle entries on unmount', () => {
    const unsubs: Array<() => void> = []
    const totalActive = MAX_MERMAID_CACHE_ENTRIES + 5

    for (let i = 0; i < totalActive; i++) {
      const code = `graph TD\nA${i}-->B${i}`
      unsubs.push(
        subscribeMermaidDiagram(
          code,
          false,
          () => null,
          () => {},
        ),
      )
      seedMermaidDiagramCacheForTests(code, false, `<svg id="m-${i}"></svg>`)
    }

    expect(countMermaidDiagramCacheEntries()).toBe(totalActive)

    for (const unsub of unsubs) {
      unsub()
    }

    expect(countMermaidDiagramCacheEntries()).toBe(MAX_MERMAID_CACHE_ENTRIES)
  })

  it('enforces AskLifecycle IndefiniteAskNeverTimesOut and PendingWithinCapacity', async () => {
    vi.useFakeTimers()
    try {
      const asks = new PendingAskRegistry()
      const indefinitePromise = asks.wait({
        sessionId: 'sess-tla',
        callId: 'c-indef',
        defaultSurfaceId: 'main',
        timeoutSeconds: -1,
      })

      await vi.advanceTimersByTimeAsync(10_000_000)
      expect(asks.hasPending('sess-tla', 'c-indef')).toBe(true)

      const settled = asks.settle('sess-tla', {
        callId: 'c-indef',
        action: 'confirm',
        surfaceId: 'main',
      })
      expect(settled).toBe(true)
      const outcome = await indefinitePromise
      expect(outcome.status).toBe('answered')

      const fillers: Array<Promise<unknown>> = []
      for (let i = 0; i < 16; i++) {
        fillers.push(
          asks
            .wait({
              sessionId: 'sess-cap',
              callId: `c-${i}`,
              defaultSurfaceId: 'main',
              timeoutSeconds: -1,
            })
            .catch(() => null),
        )
      }
      expect(() => asks.assertCanWait('sess-cap', undefined, 'c-overflow')).toThrow(
        /Too many concurrent pending a2ui_ask requests/,
      )
      expect(() => asks.assertCanWait('sess-cap', undefined, 'c-0')).not.toThrow()
      asks.disposeAll()
      await Promise.all(fillers)
    } finally {
      vi.useRealTimers()
    }
  })

  it('narrows A2UI protocol messages safely at boundaries without unsafe casts', () => {
    expect(isPlainRecord({ a: 1 })).toBe(true)
    expect(isPlainRecord([1, 2])).toBe(false)
    expect(isPlainRecord(null)).toBe(false)
    expect(isPlainRecord('str')).toBe(false)

    const messages = [
      {
        createSurface: {
          surfaceId: 's1',
          components: [{ id: 'root', component: 'Text' }, null, 'bad'],
          dataModel: { secret: 'x' },
        },
      },
      {
        updateComponents: {
          surfaceId: 's2',
          components: [{ id: 'chart', component: 'Chart', kind: 'bar' }],
        },
      },
      {
        updateDataModel: {
          surfaceId: 's1',
          path: '/items',
          value: [1, 2],
        },
      },
    ] as unknown as AgentToRendererMessage[]

    const ids = new Set<string>()
    collectMessageSurfaceIds(messages, ids)
    expect([...ids]).toEqual(['s1', 's2'])

    const comps: Record<string, unknown>[] = []
    collectMessageComponents(messages, comps)
    expect(comps).toHaveLength(2)
    expect(comps.map((c) => c.id)).toEqual(['root', 'chart'])

    expect(getMessagePayloads(messages[0]!)).toHaveLength(1)
    expect(getCreateSurfaceDataModel(messages[0]!)).toEqual({ secret: 'x' })
    expect(getCreateSurfaceDataModel(messages[1]!)).toBeUndefined()
    expect(getUpdateDataModelPayload(messages[2]!)).toEqual({ path: '/items', value: [1, 2] })
    expect(getUpdateDataModelPayload(messages[0]!)).toBeNull()
  })
})
