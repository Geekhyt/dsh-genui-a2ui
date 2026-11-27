import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { SurfaceGroupView } from '../src/client/runtime/SurfaceView.tsx'
import { SurfaceSessions } from '../src/host/generator.ts'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const activeRoots: Array<{ readonly container: HTMLDivElement; readonly root: Root }> = []

function mount(el: ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(el)
  })
  activeRoots.push({ container, root })
  return {
    container,
    rerender: (next: ReactElement) => {
      act(() => {
        root.render(next)
      })
    },
  }
}

afterEach(() => {
  while (activeRoots.length > 0) {
    const item = activeRoots.pop()
    if (item) {
      act(() => {
        item.root.unmount()
      })
      item.container.remove()
    }
  }
})

describe('Multi-surface titles & compact Table pageSize DOM regressions', () => {
  it('renders distinct per-surface headers directly above each surface without overwriting the first card', () => {
    const sessions = new SurfaceSessions()
    const m1 = sessions.compile(
      'dom-multi',
      'surface("harbin_budget")\nroot = Card(Text("预算总览 ¥5,000"))',
    )
    const m2 = sessions.compile(
      'dom-multi',
      'surface("harbin_wear")\nroot = Card(Text("分层穿衣方案"))',
    )
    const surfaceTitles = new Map([
      ['harbin_budget', '哈尔滨4天3晚 · 两人预算与行程'],
      ['harbin_wear', '哈尔滨12月初 · 穿衣与装备清单'],
    ])

    const view = mount(
      <SurfaceGroupView
        messages={[...m1, ...m2]}
        visibleSurfaceIds={new Set(['harbin_budget', 'harbin_wear'])}
        title={null}
        surfaceTitles={surfaceTitles}
      />,
    )

    const headers = [...view.container.querySelectorAll('header')]
    expect(headers).toHaveLength(2)
    expect(
      view.container.querySelector('[data-a2ui-surface-title="harbin_budget"]')?.textContent,
    ).toBe('哈尔滨4天3晚 · 两人预算与行程')
    expect(
      view.container.querySelector('[data-a2ui-surface-title="harbin_wear"]')?.textContent,
    ).toBe('哈尔滨12月初 · 穿衣与装备清单')

    const budgetItem = view.container.querySelector('[data-surface-id="harbin_budget"]')
    const wearItem = view.container.querySelector('[data-surface-id="harbin_wear"]')
    expect(budgetItem?.textContent).toContain('哈尔滨4天3晚 · 两人预算与行程')
    expect(budgetItem?.textContent).toContain('预算总览 ¥5,000')
    expect(budgetItem?.textContent).not.toContain('穿衣与装备清单')
    expect(wearItem?.textContent).toContain('哈尔滨12月初 · 穿衣与装备清单')
    expect(wearItem?.textContent).toContain('分层穿衣方案')
    expect(wearItem?.textContent).not.toContain('预算总览')

    const visibleText = view.container.textContent ?? ''
    expect(visibleText.indexOf('哈尔滨4天3晚 · 两人预算与行程')).toBeLessThan(
      visibleText.indexOf('预算总览 ¥5,000'),
    )
    expect(visibleText.indexOf('预算总览 ¥5,000')).toBeLessThan(
      visibleText.indexOf('哈尔滨12月初 · 穿衣与装备清单'),
    )
    expect(visibleText.indexOf('哈尔滨12月初 · 穿衣与装备清单')).toBeLessThan(
      visibleText.indexOf('分层穿衣方案'),
    )

    view.rerender(
      <SurfaceGroupView
        messages={m1}
        visibleSurfaceIds={new Set(['harbin_budget'])}
        title="哈尔滨4天3晚 · 两人预算与行程"
        surfaceTitles={new Map([['harbin_budget', '哈尔滨4天3晚 · 两人预算与行程']])}
      />,
    )

    expect(view.container.querySelector('[data-a2ui-surface-title="harbin_budget"]')).toBeNull()
    expect(view.container.querySelectorAll('header')).toHaveLength(1)
    expect(view.container.querySelector('header')?.textContent).toContain(
      '哈尔滨4天3晚 · 两人预算与行程',
    )
  })

  it('respects Table pageSize=2 in DOM pagination instead of clamping to 3', () => {
    const sessions = new SurfaceSessions()
    const messages = sessions.compile(
      'dom-table-ps2',
      [
        'surface("gpu_cmp")',
        '$/rows = [{ gpu: "H100", tok: 265 }, { gpu: "A100", tok: 146 }, { gpu: "L40S", tok: 98 }]',
        'root = Table($/rows, title="GPU 对比", pageSize=2)',
      ].join('\n'),
    )

    const view = mount(<SurfaceGroupView messages={messages} title="GPU 对比" />)
    const rows = view.container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
  })
})
