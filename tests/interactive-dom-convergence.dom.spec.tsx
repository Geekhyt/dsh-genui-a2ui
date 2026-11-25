import { act, type ReactElement, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DSH_REACT_COMPONENTS } from '../src/client/catalog/BasicWidgets.tsx'
import { TableWidget } from '../src/client/catalog/TableWidget.tsx'
import { resolveDshHostElement } from '../src/client/catalog/widget-helpers.tsx'
import { DshTextFieldView } from '../src/client/catalog/widgets/FormFields.tsx'
import { DshSelectView } from '../src/client/catalog/widgets/SelectControls.tsx'
import { loadRuntimeChunk } from '../src/client/chunk-loader.ts'
import { useEChartsMount } from '../src/client/dom-hooks.ts'
import { isSafeStaticSvgImage } from '../src/client/mermaid-safe.ts'
import {
  loadSurfaceDraft,
  resetPersistenceForTests,
  saveSurfaceDraft,
} from '../src/client/persistence.ts'
import { SurfaceGroupView } from '../src/client/runtime/SurfaceView.tsx'
import { A2uiAskDockView } from '../src/client/shell/AskToolView.tsx'
import { A2uiToolView } from '../src/client/shell/ToolView.tsx'
import type { ChatTargetSnapshot } from '../src/client/shell/turn-surfaces.ts'
import { DshModal } from '../src/client/ui/primitives.tsx'
import { SurfaceSessions } from '../src/host/generator.ts'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface MountedRoot {
  readonly container: HTMLDivElement
  readonly rerender: (el: ReactElement) => void
  readonly unmount: () => void
}

const activeRoots: MountedRoot[] = []

function mount(el: ReactElement): MountedRoot {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(el)
  })
  const handle: MountedRoot = {
    container,
    rerender: (nextEl) => {
      act(() => {
        root.render(nextEl)
      })
    },
    unmount: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
  activeRoots.push(handle)
  return handle
}

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  proto?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

afterEach(() => {
  while (activeRoots.length > 0) {
    activeRoots.pop()?.unmount()
  }
  document.body.innerHTML = ''
  resetPersistenceForTests()
})

describe('Real Interactive DOM Convergence Tests (happy-dom + React 18)', () => {
  it('commits true JS numbers from TextField(variant="number") while preserving intermediate decimal typing', () => {
    const committed: unknown[] = []
    function Harness() {
      const [val, setVal] = useState<unknown>(10)
      return (
        <DshTextFieldView
          props={{
            label: 'Quota',
            variant: 'number',
            value: val,
            setValue: (next) => {
              committed.push(next)
              setVal(next)
            },
          }}
        />
      )
    }

    const { container } = mount(<Harness />)
    const input = container.querySelector('input')!
    expect(input.type).toBe('text')
    expect(input.getAttribute('inputmode')).toBe('decimal')
    expect(input.value).toBe('10')

    act(() => {
      input.focus()
      setNativeInputValue(input, '1.')
    })
    expect(input.value).toBe('1.')
    expect(committed[committed.length - 1]).toBe(1)

    act(() => {
      setNativeInputValue(input, '1.05')
    })
    expect(committed[committed.length - 1]).toBe(1.05)
    expect(typeof committed[committed.length - 1]).toBe('number')

    act(() => {
      setNativeInputValue(input, 'abc')
    })
    expect(committed[committed.length - 1]).toBe('abc')
  })

  it('enforces LIFO Escape stack for nested Modal + Select Portal popover', () => {
    const onCloseModal = vi.fn()
    const { container } = mount(
      <DshModal open title="Deploy Config" closeLabel="Close" onClose={onCloseModal}>
        <DshSelectView
          props={{
            label: 'Cluster',
            searchable: true,
            value: 'hz',
            options: [
              { value: 'hz', label: 'Hangzhou' },
              { value: 'sh', label: 'Shanghai' },
            ],
          }}
        />
      </DshModal>,
    )

    expect(
      container.querySelector('[role="dialog"]') || document.querySelector('[role="dialog"]'),
    ).not.toBeNull()
    const trigger = document.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement
    expect(trigger).not.toBeNull()

    act(() => {
      trigger.click()
    })
    expect(document.querySelector('[role="listbox"]')).not.toBeNull()

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    expect(onCloseModal).not.toHaveBeenCalled()

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onCloseModal).toHaveBeenCalledTimes(1)
  })

  it('keeps null/dash rows pinned last on both desc and asc clicks and supports live search in TableWidget', () => {
    const rows = [
      { id: 'gateway-hz', qps: 1200 },
      { id: 'search-neg', qps: -45 },
      { id: 'billing-core', qps: '-' },
      { id: 'audit-empty', qps: null },
    ]
    const { container } = mount(
      <TableWidget
        rows={rows}
        searchable
        columns={[
          { key: 'id', label: 'Service', sortable: true },
          { key: 'qps', label: 'QPS', sortable: true },
        ]}
      />,
    )

    const headers = Array.from(container.querySelectorAll('th'))
    const qpsTh = headers.find((th) => th.textContent?.includes('QPS'))!
    expect(qpsTh).toBeDefined()

    const readOrder = () =>
      Array.from(container.querySelectorAll('tbody tr')).map(
        (tr) => tr.querySelector('td')?.textContent?.trim() ?? '',
      )

    act(() => {
      qpsTh.click()
    })
    const firstSort = readOrder()
    expect(firstSort.slice(2)).toEqual(['billing-core', 'audit-empty'])

    act(() => {
      qpsTh.click()
    })
    const secondSort = readOrder()
    expect(secondSort.slice(2)).toEqual(['billing-core', 'audit-empty'])
    expect(secondSort[0]).not.toBe(firstSort[0])

    const search = container.querySelector('input') as HTMLInputElement
    expect(search).not.toBeNull()
    act(() => {
      setNativeInputValue(search, 'gateway')
    })
    expect(readOrder()).toEqual(['gateway-hz'])
  })

  it('preserves pending ask drafts across session switch and clears them only when the same session settles', async () => {
    await loadRuntimeChunk()
    const makeAskSnapshot = (callId: string, surfaceId: string): ChatTargetSnapshot => ({
      nodes: new Map([
        [
          callId,
          {
            id: callId,
            kind: 'tool-call',
            anchorSeq: 1,
            data: {
              root: {
                callId,
                name: 'a2ui_ask',
                phase: 'start',
                args: {
                  text: (k: string) =>
                    k === 'ui'
                      ? `surface("${surfaceId}")\nroot = Text("Ask")`
                      : k === 'title'
                        ? 'Confirm'
                        : undefined,
                },
              },
            },
          },
        ],
      ]),
    })

    const emptySnap: ChatTargetSnapshot = { nodes: new Map() }
    const makeStore = (initial: ChatTargetSnapshot) => {
      const listeners = new Set<() => void>()
      let current = initial
      return {
        subscribe: (l: () => void) => {
          listeners.add(l)
          return () => {
            listeners.delete(l)
          }
        },
        getSnapshot: () => current,
        set: (next: ChatTargetSnapshot) => {
          current = next
          act(() => {
            for (const l of listeners) l()
          })
        },
      }
    }
    const storeA = makeStore(makeAskSnapshot('ask-1', 'surf-a'))
    const storeB = makeStore(emptySnap)

    saveSurfaceDraft('sess-a::ask::ask-1', 'surf-a', 'fp-1', { note: 'unfinished draft' })
    const mounted = mount(
      <A2uiAskDockView sessionId="sess-a" chatStore={storeA} submitAskAnswer={async () => true} />,
    )

    mounted.rerender(
      <A2uiAskDockView sessionId="sess-b" chatStore={storeB} submitAskAnswer={async () => true} />,
    )
    expect(loadSurfaceDraft('sess-a::ask::ask-1', 'surf-a', 'fp-1')).toEqual({
      note: 'unfinished draft',
    })

    mounted.rerender(
      <A2uiAskDockView sessionId="sess-a" chatStore={storeA} submitAskAnswer={async () => true} />,
    )
    expect(loadSurfaceDraft('sess-a::ask::ask-1', 'surf-a', 'fp-1')).toEqual({
      note: 'unfinished draft',
    })

    storeA.set(emptySnap)
    expect(loadSurfaceDraft('sess-a::ask::ask-1', 'surf-a', 'fp-1')).toBeNull()
  })

  it('routes relative paths to host openFile and absolute paths to openWorkspaceFile in A2uiToolView', async () => {
    await loadRuntimeChunk()
    const openFile = vi.fn()
    const openWorkspaceFile = vi.fn()
    const sessions = new SurfaceSessions()
    const messages = sessions.compile(
      'dom-file-route',
      'surface("s-file")\nroot = Column([Code("const x = 1", filePath="src/app.ts", line=42), Code("const y = 2", filePath="/workspace/src/abs.ts", line=7)])',
    )

    const { container } = mount(
      <A2uiToolView
        callId="call-file"
        toolName="a2ui_render"
        phase="result"
        sessionId="sess-file"
        openFile={openFile}
        openWorkspaceFile={openWorkspaceFile}
        block={{
          callId: 'call-file',
          meta: {
            kind: 'dsh-a2ui',
            version: 1,
            surfaceIds: ['s-file'],
            placement: 'inline',
            messages,
          },
        }}
      />,
    )

    const buttons = Array.from(container.querySelectorAll('button'))
    const relBtn = buttons.find((b) => b.textContent?.includes('app.ts'))
    const absBtn = buttons.find((b) => b.textContent?.includes('abs.ts'))
    expect(relBtn).toBeDefined()
    expect(absBtn).toBeDefined()

    act(() => {
      relBtn!.click()
    })
    expect(openFile).toHaveBeenCalledWith('src/app.ts', { line: 42 })
    expect(openWorkspaceFile).not.toHaveBeenCalled()

    act(() => {
      absBtn!.click()
    })
    expect(openWorkspaceFile).toHaveBeenCalledWith('/workspace/src/abs.ts', 7)
  })

  it('preserves user dataZoom window and legend selection across Dark/Light ECharts theme switches', () => {
    const applied: Array<{ dark: boolean | undefined; option: Record<string, unknown> }> = []
    const mockChunk = {
      initChartInstance: (_el: HTMLElement, dark?: boolean) => ({
        on: () => {},
        resize: () => {},
        dispose: () => {},
        getDataURL: () => '',
        getOption: () => ({
          dataZoom: [{ start: 20, end: 65 }],
          legend: [{ selected: { A: true, B: false } }],
        }),
        setOption: (opt: Record<string, unknown>) => {
          applied.push({ dark, option: opt })
        },
      }),
    }
    const stableData = [{ d: 'Mon', A: 1, B: 2 }]

    function ChartHarness({ dark }: { dark: boolean }) {
      const hostRef = useRef<HTMLDivElement | null>(null)
      useEChartsMount({
        hostRef,
        chunk: mockChunk as never,
        option: {
          legend: { data: ['A', 'B'] },
          dataZoom: [{ type: 'slider', start: 0, end: 100 }],
          series: [],
        },
        dark,
        chartKind: 'line',
        dataIdentity: stableData,
        onPointClick: () => {},
        onContainerWidth: () => {},
      })
      return (
        <div
          ref={(el) => {
            hostRef.current = el
            if (el) {
              Object.defineProperty(el, 'clientWidth', { configurable: true, value: 480 })
              Object.defineProperty(el, 'clientHeight', { configurable: true, value: 260 })
            }
          }}
        />
      )
    }

    const mounted = mount(<ChartHarness dark />)
    expect(applied).toHaveLength(1)
    expect(applied[0]?.dark).toBe(true)
    expect(applied[0]!.option.animation).toBeUndefined()

    mounted.rerender(<ChartHarness dark={false} />)
    expect(applied).toHaveLength(2)
    expect(applied[1]?.dark).toBe(false)
    expect(applied[1]!.option.animation).toBe(false)
    expect(
      (applied[1]!.option.dataZoom as Array<{ start?: number; end?: number }>)[0],
    ).toMatchObject({ start: 20, end: 65 })
    expect((applied[1]!.option.legend as { selected?: Record<string, boolean> }).selected).toEqual({
      A: true,
      B: false,
    })
  })

  it('enforces DOMParser strict tag/attribute allowlist for static SVG images', () => {
    expect(typeof DOMParser).toBe('function')
    expect(
      isSafeStaticSvgImage(
        '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" aria-label="Chart data: 2026 Q3, file: report.csv" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0%" stop-color="#3b82f6"/></linearGradient><filter id="f"><feComponentTransfer><feFuncA type="linear" slope="0.5"/></feComponentTransfer></filter></defs><rect width="10" height="10" fill="url(#g)" filter="url(#f)"/></svg>',
      ),
    ).toBe(true)
    expect(
      isSafeStaticSvgImage(
        '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>xss</div></foreignObject></svg>',
      ),
    ).toBe(false)
    expect(
      isSafeStaticSvgImage('<svg xmlns="http://www.w3.org/2000/svg"><cursor href="#x"/></svg>'),
    ).toBe(false)
    expect(
      isSafeStaticSvgImage(
        '<svg xmlns="http://www.w3.org/2000/svg"><audio src="https://evil.test/a.mp3"/></svg>',
      ),
    ).toBe(false)
  })

  it('assigns unique reload-safe dsh-a2ui-* custom element definitions to all catalog components', () => {
    const tags = new Set<string>()
    for (const comp of DSH_REACT_COMPONENTS) {
      const rec = comp as unknown as { tagName?: unknown; element?: unknown }
      expect(typeof rec.tagName).toBe('string')
      expect(String(rec.tagName)).toMatch(/^dsh-a2ui-[a-z0-9-]+$/)
      expect(typeof rec.element).toBe('function')
      tags.add(String(rec.tagName))
    }
    expect(tags.size).toBe(DSH_REACT_COMPONENTS.length)
  })

  it('renders weather_week surface without collision when a2ui-react-card and dsh-a2ui-card are pre-registered', () => {
    if (!customElements.get('a2ui-react-card')) {
      customElements.define('a2ui-react-card', class ForeignPluginCard extends HTMLElement {})
    }
    if (!customElements.get('dsh-a2ui-card')) {
      customElements.define(
        'dsh-a2ui-card',
        class PriorBundleCard extends HTMLElement {
          connectedCallback(): void {
            this.style.display = 'contents'
          }
        },
      )
    }
    delete (globalThis as Record<string, unknown>).__dshA2uiHostElements__

    const sessions = new SurfaceSessions()
    const messages = sessions.compile(
      'dom-weather-collision',
      [
        'surface("weather_week")',
        'root = Card(Column([Text("未来一周天气", variant="h3"), Row([Stat("今日气温", "24°C"), Badge("晴转多云", tone="info")]), Text("未来7天以晴到多云为主，昼夜温差较大。")]))',
      ].join('\n'),
    )
    expect(messages.length).toBeGreaterThan(0)

    const { container } = mount(<SurfaceGroupView messages={messages} />)
    expect(container.textContent).toContain('未来一周天气')
    expect(container.textContent).toContain('24°C')
    expect(container.textContent).toContain('晴转多云')
    expect(container.textContent).not.toContain('collision')
    expect(container.textContent).not.toContain('渲染失败')

    expect(container.querySelector('dsh-a2ui-card')).not.toBeNull()
    const colHost = container.querySelector('dsh-a2ui-column') as HTMLElement | null
    expect(colHost).not.toBeNull()
    expect(colHost?.style.display).toBe('contents')
    expect(resolveDshHostElement('dsh-a2ui-card')).toBe(customElements.get('dsh-a2ui-card'))
  })

  it('sorts boolean columns cleanly and preserves Table selection across unrelated title updates', () => {
    const rows = [
      { id: '1', name: 'Alpha', active: false },
      { id: '2', name: 'Beta', active: true },
      { id: '3', name: 'Gamma', active: false },
    ]
    const cols = [
      { key: 'name', label: 'Name' },
      { key: 'active', label: 'Active' },
    ]
    const { container, rerender } = mount(
      <TableWidget title="v1" rows={rows} columns={cols} selectable={true} />,
    )

    const rowChecks = container.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')
    expect(rowChecks.length).toBe(3)
    act(() => {
      rowChecks[0]?.click()
    })
    expect(
      container.querySelectorAll('tbody tr.a2ui_trSelected, tbody tr[class*="trSelected"]').length,
    ).toBe(1)

    rerender(<TableWidget title="v2" rows={[...rows]} columns={cols} selectable={true} />)
    expect(container.querySelectorAll('tbody tr[class*="trSelected"]').length).toBe(1)

    const activeTh = Array.from(container.querySelectorAll('th')).find((th) =>
      th.textContent?.includes('Active'),
    )
    expect(activeTh).toBeTruthy()
    act(() => {
      activeTh?.click()
    })
    const firstOrder = Array.from(container.querySelectorAll('tbody tr')).map(
      (tr) => tr.querySelectorAll('td')[1]?.textContent,
    )
    act(() => {
      activeTh?.click()
    })
    const secondOrder = Array.from(container.querySelectorAll('tbody tr')).map(
      (tr) => tr.querySelectorAll('td')[1]?.textContent,
    )
    expect(firstOrder).not.toEqual(secondOrder)
  })

  it('skips tabindex=-1 buttons inside DshModal focus trap on Tab', () => {
    const { rerender } = mount(
      <DshModal open={true} title="Trap Test" closeLabel="Close" onClose={() => {}}>
        <button type="button" id="first-btn">
          First
        </button>
        <button type="button" id="skip-btn" tabIndex={-1}>
          Skipped
        </button>
      </DshModal>,
    )
    const firstBtn = document.getElementById('first-btn') as HTMLButtonElement | null
    const skipBtn = document.getElementById('skip-btn') as HTMLButtonElement | null
    expect(firstBtn).not.toBeNull()
    expect(skipBtn).not.toBeNull()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null
    expect(dialog).not.toBeNull()
    act(() => {
      firstBtn?.focus()
      dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })
    expect(document.activeElement).not.toBe(skipBtn)
    rerender(
      <DshModal open={false} title="Trap Test" closeLabel="Close" onClose={() => {}}>
        <div />
      </DshModal>,
    )
  })
})
