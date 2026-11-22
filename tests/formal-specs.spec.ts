import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
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

  it('parses TLC summary statistics accurately', () => {
    const sample = [
      'Model checking completed. No error has been found.',
      '13503 states generated, 2906 distinct states found, 0 states left on queue.',
      'The depth of the complete state graph search is 10.',
    ].join('\n')
    expect(parseTlcOutput(sample)).toEqual({
      ok: true,
      statesGenerated: 13503,
      distinctStates: 2906,
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
})
