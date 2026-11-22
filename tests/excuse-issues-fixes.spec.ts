import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

import { startMockLlmServer } from '../scripts/mock-llm.mjs'
import { safeStringifyJson } from '../src/client/catalog/ExtendedWidgets.tsx'
import {
  cleanupA2uiRuntimeStyles,
  ensureA2uiRuntimeStyles,
} from '../src/client/chunks/runtime-chunk.ts'
import {
  DOCK_STORAGE_KEY,
  DRAFTS_STORAGE_KEY,
  ENABLED_STORAGE_KEY,
  getA2uiEnabled,
  getDockUiState,
  loadSurfaceDraft,
  removeSurfaceDraft,
  resetPersistenceForTests,
  saveSurfaceDraft,
  setDockCollapsed,
  subscribeDockUi,
} from '../src/client/persistence.ts'
import {
  collectObscuredPointers,
  readSanitizedDataModels,
} from '../src/client/runtime/SurfaceView.tsx'
import { StreamingExpressSession } from '../src/client/runtime/streaming.ts'
import { readArgs, resetRenderArgsWarningForTests } from '../src/host/render-tool.ts'
import { writePersistedEnabled } from '../src/index.ts'

describe('Excuse Issue Remediation (Issues 1-9)', () => {
  beforeEach(() => {
    resetPersistenceForTests()
    resetRenderArgsWarningForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Issue 1: fails closed in collectObscuredPointers and readSanitizedDataModels when componentsModel throws', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const brokenSurface = {
      id: 'secret_form',
      componentsModel: {
        get entries() {
          throw new Error('corrupt component map')
        },
      },
      dataModel: {
        get: () => ({ pin: '998877', note: 'hello' }),
      },
    }

    expect(collectObscuredPointers(brokenSurface as never)).toBeNull()
    expect(errSpy).toHaveBeenCalled()

    const fakeProcessor = {
      getSurfaces: () => new Map([['secret_form', brokenSurface]]),
    }
    expect(readSanitizedDataModels(fakeProcessor as never)).toEqual({})
  })

  it('Issue 2: evicts corrupt localStorage JSON with warning and supports removeSurfaceDraft', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const backing = new Map<string, string>([
      [DRAFTS_STORAGE_KEY, '{not-json'],
      [DOCK_STORAGE_KEY, 'broken-json'],
      [ENABLED_STORAGE_KEY, '[]'],
    ])
    const prevWin = (globalThis as Record<string, unknown>).window
    ;(globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: (k: string) => backing.get(k) ?? null,
        setItem: (k: string, v: string) => {
          backing.set(k, v)
        },
        removeItem: (k: string) => {
          backing.delete(k)
        },
      },
    }

    try {
      expect(loadSurfaceDraft('s1', 'surf', 'fp1')).toBeNull()
      expect(backing.has(DRAFTS_STORAGE_KEY)).toBe(false)

      expect(getDockUiState('s1')).toEqual({ collapsed: false, dismissedSeq: -1 })
      expect(backing.has(DOCK_STORAGE_KEY)).toBe(false)

      expect(getA2uiEnabled('s1')).toBe(true)
      expect(backing.has(ENABLED_STORAGE_KEY)).toBe(false)
      expect(warnSpy).toHaveBeenCalledTimes(3)

      saveSurfaceDraft('s1', 'surf', 'fp1', { customer: 'Alice' })
      expect(loadSurfaceDraft('s1', 'surf', 'fp1')).toEqual({ customer: 'Alice' })
      removeSurfaceDraft('s1', 'surf', 'fp1')
      expect(loadSurfaceDraft('s1', 'surf', 'fp1')).toBeNull()
    } finally {
      if (prevWin === undefined) delete (globalThis as Record<string, unknown>).window
      else (globalThis as Record<string, unknown>).window = prevWin
    }
  })

  it('Issue 3: safeStringifyJson serializes circular references and BigInt without throwing', () => {
    const node: Record<string, unknown> = { name: 'root', count: 42n }
    node.self = node
    const text = safeStringifyJson(node, 0)
    expect(JSON.parse(text)).toEqual({ name: 'root', count: '42', self: '[Circular]' })
  })

  it('Issue 4: surfaces subscriber exceptions via console.error without blocking sibling subscribers', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let siblingCalls = 0
    const unsub1 = subscribeDockUi(() => {
      throw new Error('boom-listener')
    })
    const unsub2 = subscribeDockUi(() => {
      siblingCalls += 1
    })
    try {
      setDockCollapsed('sess-err', true)
      expect(siblingCalls).toBe(1)
      expect(errSpy).toHaveBeenCalled()
    } finally {
      unsub1()
      unsub2()
    }
  })

  it('Issue 5: runtime-chunk style guards handle minimal DOM stubs without throwing', () => {
    const prevDoc = (globalThis as Record<string, unknown>).document
    ;(globalThis as Record<string, unknown>).document = {}
    try {
      expect(() => ensureA2uiRuntimeStyles()).not.toThrow()
      expect(() => cleanupA2uiRuntimeStyles()).not.toThrow()
    } finally {
      if (prevDoc === undefined) delete (globalThis as Record<string, unknown>).document
      else (globalThis as Record<string, unknown>).document = prevDoc
    }
  })

  it('Issue 6: StreamingExpressSession records seedWarnings instead of silently swallowing seed errors', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const session = new StreamingExpressSession()
    const internal = session as unknown as {
      seededUpdateIds: Set<string>
      parser: { openStream: () => { feed: () => never; close: () => never } }
    }
    internal.seededUpdateIds.add('bad_surf')
    internal.parser = {
      openStream: () => ({
        feed: () => {
          throw new Error('seed boom')
        },
        close: () => {
          throw new Error('close boom')
        },
      }),
    }
    session.reset(true)
    expect(session.getSeedWarnings()).toEqual(['Failed to seed surface "bad_surf": seed boom'])
    expect(warnSpy).toHaveBeenCalled()
  })

  it('Issue 7: readArgs enforces Zod schema and warns once on string-encoded legacy payloads', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(
      readArgs({ ui: 'surface("ok")\nroot = Text("hi")', title: ' 标题 ', placement: 'dock' }),
    ).toEqual({
      ui: 'surface("ok")\nroot = Text("hi")',
      title: '标题',
      placement: 'dock',
    })
    expect(warnSpy).not.toHaveBeenCalled()

    expect(readArgs({ ui: 123 })).toEqual({ ui: undefined, title: undefined, placement: 'answer' })

    expect(
      readArgs(JSON.stringify({ ui: 'surface("s")\nroot = Text("x")', placement: 'inline' })),
    ).toEqual({
      ui: 'surface("s")\nroot = Text("x")',
      title: undefined,
      placement: 'inline',
    })
    expect(warnSpy).toHaveBeenCalledTimes(1)

    readArgs({ arguments: { ui: 'surface("s2")\nroot = Text("y")' } })
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('Issue 8: writePersistedEnabled reports filesystem persistence errors via callback', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-a2ui-state-err-'))
    const blockingFile = join(dir, 'not-a-dir')
    writeFileSync(blockingFile, 'occupied', 'utf8')
    const unwritableStateFile = join(blockingFile, 'state.json')
    const warnings: string[] = []

    try {
      const ok = writePersistedEnabled(unwritableStateFile, false, (msg) => {
        warnings.push(msg)
      })
      expect(ok).toBe(false)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain(unwritableStateFile)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('Issue 9: mock-llm returns HTTP 400 on malformed JSON instead of crashing or falling through', async () => {
    const server = await startMockLlmServer(0)
    const addr = server.address()
    const port = typeof addr === 'object' && addr !== null ? addr.port : 0
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{malformed-json',
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error?: { message?: string } }
      expect(body.error?.message).toContain('Invalid JSON request body')
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
    }
  })
})
