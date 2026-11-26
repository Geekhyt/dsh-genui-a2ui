import type { ReactCatalogComponent } from '@a2ui/react'
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dshReactCatalog } from '../src/client/catalog/index.ts'
import { defineComponent } from '../src/client/catalog/widget-helpers.tsx'
import { loadRuntimeChunk } from '../src/client/chunk-loader.ts'
import { SurfaceGroupView } from '../src/client/runtime/SurfaceView.tsx'
import { SurfaceSessions } from '../src/host/generator.ts'
import { BadgeApi } from '../src/shared/catalog-schema.ts'

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

afterEach(() => {
  while (activeRoots.length > 0) {
    activeRoots.pop()?.unmount()
  }
  vi.restoreAllMocks()
})

describe('Core runtime DOM regressions (v0.5.9)', () => {
  it('renders native accessible Progress, Slider, and RadioGroup ChoicePicker without react-aria-components', async () => {
    await loadRuntimeChunk()
    const sessions = new SurfaceSessions()
    const messages = sessions.compile(
      'native-a11y',
      [
        'surface("s-native")',
        '$/pct = 64',
        '$/replicas = 4',
        '$/tier = ["pro"]',
        'p = Progress(value=$/pct, label="Rollout")',
        's = Slider(label="Replicas", value=$/replicas, min=1, max=10, steps=1)',
        'c = ChoicePicker(label="Plan", value=$/tier, variant="mutuallyExclusive", options=[{label: "Free", value: "free"}, {label: "Pro", value: "pro"}, {label: "Enterprise", value: "ent"}])',
        'root = Column([p, s, c])',
      ].join('\n'),
    )

    const { container } = mount(<SurfaceGroupView messages={messages} />)

    const progress = container.querySelector('[role="progressbar"]')
    expect(progress).not.toBeNull()
    expect(progress?.getAttribute('aria-valuenow')).toBe('64')
    expect(progress?.getAttribute('aria-valuemax')).toBe('100')

    const slider = container.querySelector('input[type="range"]') as HTMLInputElement | null
    expect(slider).not.toBeNull()
    expect(slider?.value).toBe('4')

    const radioGroup = container.querySelector('[role="radiogroup"]')
    expect(radioGroup).not.toBeNull()
    const radios = Array.from(container.querySelectorAll('[role="radio"]')) as HTMLButtonElement[]
    expect(radios.length).toBe(3)
    expect(radios[1]?.getAttribute('aria-checked')).toBe('true')
    expect(radios[1]?.tabIndex).toBe(0)
    expect(radios[0]?.tabIndex).toBe(-1)

    act(() => {
      radios[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(radios[2]?.getAttribute('aria-checked')).toBe('true')
  })

  it('isolates widget render crashes inside per-widget ErrorBoundary without taking down sibling widgets', async () => {
    await loadRuntimeChunk()
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const compMap = dshReactCatalog.components as Map<string, ReactCatalogComponent>
    const origBadge = compMap.get('Badge')!
    const crashingBadge = defineComponent(BadgeApi, function CrashingBadge() {
      throw new Error('simulated widget failure')
    })
    compMap.set('Badge', crashingBadge)
    try {
      const sessions = new SurfaceSessions()
      const messages = sessions.compile(
        'widget-iso',
        'surface("s-iso")\nroot = Column([Text("Sibling Alive"), Badge("Boom")])',
      )
      const { container } = mount(<SurfaceGroupView messages={messages} />)
      expect(container.textContent).toContain('Sibling Alive')
      expect(container.textContent).toContain('simulated widget failure')
    } finally {
      compMap.set('Badge', origBadge)
      warnSpy.mockRestore()
    }
  })
})
