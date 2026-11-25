import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

const LIB_DIR = resolve(import.meta.dirname, '../lib')
const nodeRequire = createRequire(import.meta.url)

interface ModuleLoaderSpec {
  readonly id: string
  readonly chunk?: string
  readonly factory: (
    req: ((id: string) => unknown) & { async?: (id: string) => Promise<unknown> },
  ) => Record<string, unknown>
}

interface SandboxRuntime {
  readonly context: Record<string, unknown>
  readonly loadChunk: (fileName: string) => Record<string, unknown>
  readonly dispose: () => Promise<void>
}

function createDshBundleSandbox(): SandboxRuntime {
  const loadedSpecs = new Map<string, ModuleLoaderSpec>()
  const moduleCache = new Map<string, Record<string, unknown>>()
  const realReact = nodeRequire('react')
  const realReactDom = nodeRequire('react-dom')
  const realJsxRuntime = nodeRequire('react/jsx-runtime')
  const primitivesStub = new Proxy<Record<string, unknown>>(
    {},
    {
      get(_target, prop) {
        if (prop === '__esModule') return true
        return () => null
      },
    },
  )

  const win = new Window({ url: 'http://127.0.0.1:18991/' })
  const sandbox: Record<string, unknown> = {
    console,
    structuredClone,
    crypto: globalThis.crypto,
    atob: globalThis.atob,
    btoa: globalThis.btoa,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Date,
    Math,
    JSON,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    Array,
    Object,
    Number,
    String,
    Boolean,
    Symbol,
    Uint8Array,
    Int32Array,
    Float64Array,
    ArrayBuffer,
    DataView,
    performance,
    document: win.document,
    navigator: win.navigator,
    localStorage: win.localStorage,
    sessionStorage: win.sessionStorage,
    location: win.location,
    Node: win.Node,
    Element: win.Element,
    HTMLElement: win.HTMLElement,
    SVGElement: win.SVGElement,
    Document: win.Document,
    DocumentFragment: win.DocumentFragment,
    ShadowRoot: win.ShadowRoot,
    Event: win.Event,
    CustomEvent: win.CustomEvent,
    CSSStyleSheet: win.CSSStyleSheet,
    customElements: win.customElements,
    MutationObserver: win.MutationObserver,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    getComputedStyle: win.getComputedStyle.bind(win),
    matchMedia: win.matchMedia.bind(win),
    addEventListener: win.addEventListener.bind(win),
    removeEventListener: win.removeEventListener.bind(win),
    dispatchEvent: win.dispatchEvent.bind(win),
    requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    __ModuleLoader__: {
      load(spec: ModuleLoaderSpec) {
        loadedSpecs.set(spec.chunk ?? 'client.js', spec)
      },
    },
  }
  sandbox.window = sandbox
  sandbox.self = sandbox
  sandbox.globalThis = sandbox

  const vmContext = vm.createContext(sandbox)

  const loadChunk = (fileName: string): Record<string, unknown> => {
    const cached = moduleCache.get(fileName)
    if (cached) return cached
    const code = readFileSync(resolve(LIB_DIR, fileName), 'utf8')
    vm.runInContext(code, vmContext, { filename: fileName })
    const spec = loadedSpecs.get(fileName)
    if (!spec) {
      throw new Error(`Chunk ${fileName} did not call window.__ModuleLoader__.load`)
    }
    const req = Object.assign(
      (modId: string): unknown => {
        if (modId === 'react') return realReact
        if (modId === 'react-dom') return realReactDom
        if (modId === 'react/jsx-runtime') return realJsxRuntime
        if (modId === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub
        throw new Error(`Unexpected sync require(${modId}) inside ${fileName}`)
      },
      {
        async: async (asyncId: string): Promise<unknown> => {
          const clean = asyncId.replace(/^\.\//, '')
          return loadChunk(clean)
        },
      },
    )
    const exported = spec.factory(req)
    moduleCache.set(fileName, exported)
    return exported
  }

  return {
    context: sandbox,
    loadChunk,
    dispose: () => win.happyDOM.close(),
  }
}

describe('Built-bundle cross-chunk integration & security contracts (lib/*.js)', () => {
  it('shares one globalThis.__dshA2uiPersistence__ singleton across built lib/client.js and lib/client.runtime.js', async () => {
    const { context, loadChunk, dispose } = createDshBundleSandbox()
    try {
      const shellExports = loadChunk('client.js')
      const stateAfterShell = context.__dshA2uiPersistence__ as Record<string, unknown> | undefined
      expect(stateAfterShell).toBeDefined()
      expect(stateAfterShell?.memoryFallback).toBeInstanceOf(Map)
      expect(stateAfterShell?.cachedEnabledOrder).toBeInstanceOf(Map)

      const runtimeExports = loadChunk('client.runtime.js')
      const stateAfterRuntime = context.__dshA2uiPersistence__ as
        | Record<string, unknown>
        | undefined
      expect(Object.is(stateAfterShell, stateAfterRuntime)).toBe(true)

      let commandListener:
        | ((sessionId: string, cmd: string, res: { kind: string; text: string }) => void)
        | undefined
      const noopUnsub = () => () => {}
      const fakeCtx = {
        slots: {
          inject: (_name: string, fn: () => unknown) => {
            const res = fn()
            if (res && typeof (res as Iterator<unknown>).next === 'function') {
              let step = (res as Iterator<unknown>).next()
              while (!step.done) step = (res as Iterator<unknown>).next()
            }
            return () => {}
          },
          register: () => () => {},
        },
        sessions: {
          binding: () => undefined,
          scope: () => undefined,
          list: { getSnapshot: () => ({ byId: {} }) },
        },
        uiConversation: {
          events: { register: () => () => {} },
          userText: { register: () => () => {} },
          binding: () => ({
            target: () => ({
              getSnapshot: () => undefined,
              subscribe: noopUnsub,
            }),
          }),
        },
        effect: (cb: () => (() => void) | undefined) => {
          cb()
        },
        on: (event: string, fn: unknown) => {
          if (event === 'command/executed') {
            commandListener = fn as typeof commandListener
          }
          return () => {}
        },
      }

      const applyShell = shellExports.apply as (ctx: unknown, cfg?: Record<string, unknown>) => void
      applyShell(fakeCtx, { defaultEnabled: false })
      expect(stateAfterRuntime?.fallbackDefaultEnabled).toBe(false)

      expect(commandListener).toBeDefined()
      commandListener?.('sess-chunk-1', 'a2ui', { kind: 'success', text: 'A2UI 已开启 (on)' })
      const enabledOrder = stateAfterRuntime?.cachedEnabledOrder as Map<string, boolean>
      expect(enabledOrder.get('sess-chunk-1')).toBe(true)

      const StreamingCtor = runtimeExports.StreamingExpressSession as new () => {
        advance: (
          src: string,
          isFinal: boolean,
        ) => {
          readonly messages: readonly unknown[]
          readonly error?: string
        }
      }
      expect(typeof StreamingCtor).toBe('function')
      const okStream = new StreamingCtor().advance(
        'surface("bundle_ok")\nroot = Card(Text("OK"))',
        true,
      )
      expect(okStream.error).toBeNull()
      expect(okStream.messages.length).toBeGreaterThan(0)

      const protoStream = new StreamingCtor().advance(
        'surface("bundle_bad")\nx = {\n  "__proto__"\n  : { polluted: true }\n}\nroot = Text("bad")',
        true,
      )
      expect(protoStream.error).toBeTruthy()
    } finally {
      await dispose()
    }
  }, 15_000)

  it('executes built lib/client.echarts.js cleanly with literal brace formatters, derived graph nodes, and NaN-free heatmap', async () => {
    const { loadChunk, dispose } = createDshBundleSandbox()
    try {
      const echartsExports = loadChunk('client.echarts.js')
      const registerThemes = echartsExports.registerA2uiEchartsThemes as () => void
      const buildOption = echartsExports.buildChartOption as (
        spec: Record<string, unknown>,
        dark: boolean,
        width: number,
      ) => Record<string, unknown>

      expect(typeof registerThemes).toBe('function')
      expect(typeof buildOption).toBe('function')
      registerThemes()

      const lineOpt = buildOption(
        {
          kind: 'line',
          xField: 'day',
          yField: 'v',
          referenceLine: 130,
          referenceLabel: 'SLA {c} / {a}',
          data: [
            { day: 'Mon', v: 120 },
            { day: 'Tue', v: 145 },
          ],
        },
        true,
        276,
      )
      const lineSeries = (lineOpt.series as Array<Record<string, unknown>>)[0]!
      const markLine = lineSeries.markLine as {
        label?: { formatter?: unknown }
        data: Array<{ label?: { formatter?: unknown } }>
      }
      const fmt = markLine.label?.formatter ?? markLine.data[0]?.label?.formatter
      expect(typeof fmt).toBe('function')
      expect((fmt as () => string)()).toBe('SLA {c} / {a}')

      const graphOpt = buildOption(
        {
          kind: 'graph',
          data: {
            links: [
              { source: 'Gateway', target: 'Auth' },
              { source: 'Auth', target: 'Ledger' },
            ],
          },
        },
        true,
        276,
      )
      const graphSeries = (graphOpt.series as Array<{ data: Array<{ name: string }> }>)[0]!
      expect(graphSeries.data.map((n) => n.name)).toEqual(
        expect.arrayContaining(['Gateway', 'Auth', 'Ledger']),
      )

      const heatmapOpt = buildOption(
        {
          kind: 'heatmap',
          xField: 'd',
          yField: 'h',
          sizeField: 'v',
          data: [
            { d: 'Mon', h: '09:00', v: null },
            { d: 'Tue', h: '09:00', v: 12 },
            { d: 'Mon', h: '10:00', v: Number.NaN },
          ],
        },
        true,
        276,
      )
      expect(JSON.stringify(heatmapOpt)).not.toContain('NaN')
    } finally {
      await dispose()
    }
  }, 15_000)

  it('keeps dompurifyConfig in built lib/client.mermaid.js and enforces security guards in built lib/index.js', async () => {
    const mermaidBundle = readFileSync(resolve(LIB_DIR, 'client.mermaid.js'), 'utf8')
    expect(mermaidBundle).toContain('dompurifyConfig')
    expect(mermaidBundle).toContain('FORBID_TAGS')

    const libHref = new URL('../lib/index.js', import.meta.url).href
    const hostMod = (await import(libHref)) as {
      apply: (ctx: unknown) => void
    }
    let renderHandler:
      | ((args: Record<string, unknown>, meta: Record<string, unknown>) => Promise<unknown>)
      | undefined

    const fakeCtx = {
      inject(_deps: string[], fn: (inner: unknown) => void) {
        fn({
          tools: {
            register: (def: { name: string; handler?: unknown; execute?: unknown }) => {
              if (def.name === 'a2ui_render') {
                renderHandler = (def.handler ?? def.execute) as typeof renderHandler
              }
              return () => {}
            },
          },
          skills: { register: () => () => {} },
          commands: { register: () => () => {} },
          effect: (cb: () => () => void) => cb(),
        })
      },
      on: () => () => {},
    }

    hostMod.apply(fakeCtx)
    expect(typeof renderHandler).toBe('function')

    const invokeRender = async (args: Record<string, unknown>) => {
      try {
        const res = await renderHandler!(args, { agent: { session: { id: 'bundle-sec-1' } } })
        return { threw: false, text: JSON.stringify(res) }
      } catch (err) {
        return { threw: true, text: err instanceof Error ? err.message : String(err) }
      }
    }

    const okResult = await invokeRender({
      ui: 'surface("sec_ok")\nroot = Card(Text("hello"))',
    })
    expect(okResult.threw).toBe(false)
    expect(okResult.text).toContain('sec_ok')

    const protoResult = await invokeRender({
      ui: 'surface("sec_proto")\nx = {\n "__proto__" \n : { pwn: 1 } }\nroot = Text("x")',
    })
    expect(
      protoResult.threw || /error|dangerous|__proto__|blocked|invalid/i.test(protoResult.text),
    ).toBe(true)

    const bombProgram =
      'surface("sec_bomb")\na = "xxxx"; b = a + a; c = b + b; d = c + c; e = d + d; f = e + e; g = f + f; h = g + g; i = h + h; j = i + i; k = j + j; l = k + k; m = l + l; n = m + m; o = n + n; p = o + o; q = p + p; root = Text(q)'
    const bombStart = Date.now()
    const bombResult = await invokeRender({ ui: bombProgram })
    expect(Date.now() - bombStart).toBeLessThan(2000)
    expect(
      bombResult.threw || /error|limit|depth|too|size|exceeded|invalid/i.test(bombResult.text),
    ).toBe(true)
  }, 15_000)
})
