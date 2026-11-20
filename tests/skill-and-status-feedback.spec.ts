import { type ComponentType, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

beforeAll(() => {
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
  Toast: undefined,
  Tooltip: undefined,
  CodeBlock: undefined,
  JsonTree: undefined,
  DisclosureRow: undefined,
  MarkdownText: undefined,
  IconAppsAddOutlineRegular: ({ size = 14 }: { size?: number }) =>
    createElement('svg', { 'data-icon': 'apps', width: size, height: size }),
  IconSearchOutlineRegular: undefined,
  IconChevronDownOutlineRegular: undefined,
  IconChevronUpOutlineRegular: undefined,
  IconCheckOutlineRegular: undefined,
  IconWarningOutlineRegular: undefined,
}))

import { apply as applyClient } from '../src/client/index.ts'
import {
  dismissCommandNotice,
  getA2uiEnabled,
  getCommandNotice,
  resetPersistenceForTests,
} from '../src/client/persistence.ts'
import { type ChatTargetSnapshot, isChatTimelineActive } from '../src/client/turn-surfaces.ts'
import {
  A2UI_SYSTEM_GUIDANCE,
  apply as applyHost,
  DOMAIN_SKILL_NAMES,
  SKILL_NAME,
  SYSTEM_PROMPT_SECTION_NAME,
  TIER_COMMAND,
} from '../src/index.ts'
import { setUiLocaleOverride } from '../src/shared/i18n.ts'

describe('Issue 1 & Issue 2 regression suite: dynamic skill unregistration and blank-session /a2ui status feedback', () => {
  beforeEach(() => {
    resetPersistenceForTests()
    setUiLocaleOverride(null)
  })

  it('dynamically unregisters and re-registers the a2ui skill via skills.registerProvider on /a2ui off|on, subagents, and cold off boot', async () => {
    let invalidateCount = 0
    let registeredProvider:
      | {
          readonly name: string
          list(options: {
            cwd?: string
            scope?: unknown
          }): Promise<readonly Record<string, unknown>[]>
          get(
            candidate: Record<string, unknown>,
            options: { cwd?: string; scope?: unknown },
          ): Promise<{ name: string; content: string; provider: string } | undefined>
        }
      | undefined
    let renderWhen: ((ctx: { agent?: unknown }) => boolean) | undefined
    let promptSection: { name: string; text: (ctx: { scope?: unknown }) => string } | undefined
    let tierCommandDef:
      | {
          name: string
          description: string
          input?: { hint: string }
          handler: (inv: { agent?: unknown; rawInput: string }) => { kind: string; text?: string }
        }
      | undefined
    const disposedListeners: Array<(session: { id: string }) => void> = []

    const fakeHostCtx = {
      inject(_deps: string[], fn: (c: unknown) => void) {
        fn({
          tools: {
            register: (
              def: { name: string },
              opts?: { when?: (ctx: { agent?: unknown }) => boolean },
            ) => {
              if (def.name === 'a2ui_render') renderWhen = opts?.when
              return () => {}
            },
            get: (name: string) => (name === 'a2ui_render' ? { name } : undefined),
          },
          systemPrompt: {
            section: (sec: NonNullable<typeof promptSection>) => {
              promptSection = sec
              return () => {}
            },
          },
          skills: {
            registerProvider(
              create: (control: {
                signal: AbortSignal
                invalidate: () => void
              }) => NonNullable<typeof registeredProvider>,
            ) {
              const abort = new AbortController()
              registeredProvider = create({
                signal: abort.signal,
                invalidate: () => {
                  invalidateCount += 1
                },
              })
              return () => {
                registeredProvider = undefined
                abort.abort()
              }
            },
            register: () => () => {},
          },
          commands: {
            register: (cmd: NonNullable<typeof tierCommandDef>) => {
              if (cmd.name === TIER_COMMAND) tierCommandDef = cmd
              return () => {}
            },
          },
          effect: (setup: () => () => void) => setup(),
        })
      },
      on(event: string, listener: (session: { id: string }) => void) {
        if (event === 'session/disposed') disposedListeners.push(listener)
        return () => {}
      },
    }

    applyHost(fakeHostCtx as never, { stateFile: null })

    expect(registeredProvider?.name).toBe('dsh-genui-a2ui')
    expect(promptSection?.name).toBe(SYSTEM_PROMPT_SECTION_NAME)
    expect(tierCommandDef?.input?.hint).toBe('on | off | status')

    const agentA = { session: { id: 'sess-a' } }
    const agentB = { session: { id: 'sess-b' } }
    const agentC = { session: { id: 'sess-c' } }
    const subAgent = { session: { id: 'sess-sub', header: { parentSession: 'sess-a' } } }

    const initialList = await registeredProvider!.list({ cwd: '/repo', scope: agentA })
    expect(initialList).toHaveLength(DOMAIN_SKILL_NAMES.length)
    expect(initialList.map((c) => c.name)).toEqual([...DOMAIN_SKILL_NAMES])
    expect(initialList[0]).toMatchObject({
      name: SKILL_NAME,
      source: 'bundled',
      provider: 'dsh-genui-a2ui',
      rank: 600,
      invocation: { modelInvocable: true, userInvocable: true },
    })
    const loaded = await registeredProvider!.get(initialList[0]!, { cwd: '/repo', scope: agentA })
    expect(loaded?.name).toBe(SKILL_NAME)
    expect(loaded?.content).toContain('Availability guard (`/a2ui off`)')

    const analyticsLoaded = await registeredProvider!.get(initialList[1]!, {
      cwd: '/repo',
      scope: agentA,
    })
    expect(analyticsLoaded?.name).toBe('a2ui-analytics')
    expect(analyticsLoaded?.content).toContain('Chart(')
    expect(analyticsLoaded?.content).toContain('Table(')

    expect(await registeredProvider!.list({ cwd: '/repo', scope: subAgent })).toEqual([])
    expect(
      await registeredProvider!.get(initialList[0]!, { cwd: '/repo', scope: subAgent }),
    ).toBeUndefined()
    expect(
      await registeredProvider!.get(initialList[1]!, { cwd: '/repo', scope: subAgent }),
    ).toBeUndefined()

    const beforeInval = invalidateCount
    tierCommandDef!.handler({ agent: agentA, rawInput: 'on' })
    expect(invalidateCount).toBe(beforeInval + 1)

    const offRes = tierCommandDef!.handler({ agent: agentB, rawInput: 'off' })
    expect(offRes).toEqual({ kind: 'success', text: 'A2UI 生成式界面已关闭' })
    expect(invalidateCount).toBe(beforeInval + 2)

    expect(renderWhen?.({ agent: agentB })).toBe(false)
    expect(promptSection!.text({ scope: agentB })).toBe('')
    expect(await registeredProvider!.list({ cwd: '/repo', scope: agentB })).toEqual([])
    expect(await registeredProvider!.list({ cwd: '/repo' })).toEqual([])
    expect(await registeredProvider!.list({ cwd: '/repo', scope: agentC })).toEqual([])
    expect(
      await registeredProvider!.get(initialList[0]!, { cwd: '/repo', scope: agentB }),
    ).toBeUndefined()
    expect(
      await registeredProvider!.get(initialList[1]!, { cwd: '/repo', scope: agentB }),
    ).toBeUndefined()

    expect(await registeredProvider!.list({ cwd: '/repo', scope: agentA })).toHaveLength(
      DOMAIN_SKILL_NAMES.length,
    )
    for (const fn of disposedListeners) fn({ id: 'sess-a' })
    expect(await registeredProvider!.list({ cwd: '/repo', scope: agentA })).toEqual([])

    const onRes = tierCommandDef!.handler({ agent: agentB, rawInput: 'on' })
    expect(onRes).toEqual({ kind: 'success', text: 'A2UI 生成式界面已开启' })
    expect(renderWhen?.({ agent: agentB })).toBe(true)
    expect(promptSection!.text({ scope: agentB })).toBe(A2UI_SYSTEM_GUIDANCE)
    expect(await registeredProvider!.list({ cwd: '/repo', scope: agentB })).toHaveLength(
      DOMAIN_SKILL_NAMES.length,
    )

    let coldProvider: typeof registeredProvider
    applyHost(
      {
        inject(_deps: string[], fn: (c: unknown) => void) {
          fn({
            tools: { register: () => () => {} },
            systemPrompt: { section: () => () => {} },
            skills: {
              registerProvider(
                create: (control: {
                  signal: AbortSignal
                  invalidate: () => void
                }) => NonNullable<typeof registeredProvider>,
              ) {
                coldProvider = create({
                  signal: new AbortController().signal,
                  invalidate: () => {},
                })
                return () => {}
              },
              register: () => () => {},
            },
            commands: { register: () => () => {} },
            effect: (setup: () => () => void) => setup(),
          })
        },
        on: () => () => {},
      } as never,
      { defaultEnabled: false, stateFile: null },
    )
    expect(await coldProvider!.list({ cwd: '/repo', scope: agentB })).toEqual([])
    expect(await coldProvider!.list({ cwd: '/repo' })).toEqual([])
  })

  it('supports fallback skills.register disposer toggling when registerProvider is absent', () => {
    const activeSkills = new Set<string>()
    let tierHandler: ((inv: { rawInput: string }) => { kind: string; text?: string }) | undefined

    const makeFallbackHost = () => ({
      inject(_deps: string[], fn: (c: unknown) => void) {
        fn({
          tools: { register: () => () => {} },
          systemPrompt: { section: () => () => {} },
          skills: {
            register(sk: { name: string }) {
              activeSkills.add(sk.name)
              return () => {
                activeSkills.delete(sk.name)
              }
            },
          },
          commands: {
            register(cmd: { name: string; handler: NonNullable<typeof tierHandler> }) {
              if (cmd.name === TIER_COMMAND) tierHandler = cmd.handler
              return () => {}
            },
          },
          effect: (setup: () => () => void) => setup(),
        })
      },
      on: () => () => {},
    })

    applyHost(makeFallbackHost() as never, { stateFile: null })
    expect(activeSkills.has(SKILL_NAME)).toBe(true)

    tierHandler!({ rawInput: 'off' })
    expect(activeSkills.has(SKILL_NAME)).toBe(false)

    tierHandler!({ rawInput: 'on' })
    expect(activeSkills.has(SKILL_NAME)).toBe(true)

    activeSkills.clear()
    applyHost(makeFallbackHost() as never, { defaultEnabled: false, stateFile: null })
    expect(activeSkills.has(SKILL_NAME)).toBe(false)
  })

  it('surfaces visible Toast feedback for /a2ui status (and /a2ui on|off|errors) on blank sessions without duplicating active ChatView cards', () => {
    const commandExecutedListeners: Array<
      (sessionId: string, commandName: string, result: { kind: string; text?: string }) => void
    > = []
    const snapshotsBySession = new Map<string, ChatTargetSnapshot>()
    let tierSlotRegistration:
      | {
          inject: (sessionId: string) => Record<string, unknown>
          component: ComponentType<Record<string, unknown>>
        }
      | undefined

    const blankNodes = new Map([
      [
        'cmd-1',
        {
          kind: 'command',
          anchorSeq: 1,
          data: {
            name: 'a2ui',
            seq: 1,
            outcome: { kind: 'success', text: 'A2UI 生成式界面已关闭' },
          },
        },
      ],
    ])
    snapshotsBySession.set('sess-blank', {
      order: ['cmd-1'],
      nodes: blankNodes,
    })

    const activeNodes = new Map<string, { kind: string; anchorSeq: number; data: unknown }>([
      ['user-1', { kind: 'user', anchorSeq: 1, data: {} }],
      [
        'cmd-2',
        {
          kind: 'command',
          anchorSeq: 2,
          data: {
            name: 'a2ui',
            seq: 2,
            outcome: { kind: 'success', text: 'A2UI 生成式界面已开启' },
          },
        },
      ],
    ])
    snapshotsBySession.set('sess-active', {
      order: ['user-1', 'cmd-2'],
      nodes: activeNodes,
    })

    expect(isChatTimelineActive(undefined)).toBe(false)
    expect(isChatTimelineActive(snapshotsBySession.get('sess-blank'))).toBe(false)
    expect(isChatTimelineActive(snapshotsBySession.get('sess-active'))).toBe(true)

    const fakeClientCtx = {
      slots: {
        inject(name: string, register: () => (() => void) | Generator<() => void, void, unknown>) {
          const out = register()
          if (typeof out === 'object' && out !== null && 'next' in out) {
            let step = out.next()
            while (!step.done) step = out.next()
          }
          void name
          return () => {}
        },
        register(options: Record<string, unknown>, component: unknown) {
          if (options.name === 'conversation.input.left' && options.id === 'dsh-genui-a2ui.tier') {
            tierSlotRegistration = {
              inject: options.inject as (sessionId: string) => Record<string, unknown>,
              component: component as ComponentType<Record<string, unknown>>,
            }
          }
          return () => {}
        },
      },
      sessions: {
        binding: (sid: string) => (snapshotsBySession.has(sid) ? { sid } : undefined),
      },
      uiConversation: {
        events: { register: () => () => {} },
        userText: { register: () => () => {} },
        binding: (b: { sid: string }) => ({
          target: () => ({
            subscribe: () => () => {},
            getSnapshot: () => snapshotsBySession.get(b.sid),
          }),
        }),
      },
      effect(setup: () => () => void) {
        return setup()
      },
      on(
        event: string,
        listener: (
          sessionId: string,
          commandName: string,
          result: { kind: string; text?: string },
        ) => void,
      ) {
        if (event === 'command/executed') commandExecutedListeners.push(listener)
        return () => {}
      },
    }

    applyClient(fakeClientCtx as never)
    expect(tierSlotRegistration).toBeDefined()
    expect(commandExecutedListeners).toHaveLength(1)

    const emitCommandExecuted = (
      sid: string,
      cmd: string,
      res: { kind: string; text?: string },
    ) => {
      for (const fn of commandExecutedListeners) fn(sid, cmd, res)
    }

    expect(getA2uiEnabled('sess-blank')).toBe(true)
    emitCommandExecuted('sess-blank', 'a2ui', {
      kind: 'success',
      text: 'A2UI 生成式界面已关闭',
    })
    expect(getA2uiEnabled('sess-blank')).toBe(false)
    expect(getCommandNotice('sess-blank')).toMatchObject({
      kind: 'success',
      text: 'A2UI 生成式界面已关闭',
    })
    expect(getCommandNotice('sess-other')).toBeNull()

    const TierComponent = tierSlotRegistration!.component
    const blankHtml = renderToStaticMarkup(
      createElement(TierComponent, tierSlotRegistration!.inject('sess-blank')),
    )
    expect(blankHtml).toContain('data-enabled="false"')
    expect(blankHtml).toContain('data-a2ui-toast="success"')
    expect(blankHtml).toContain('A2UI 生成式界面已关闭')

    emitCommandExecuted('sess-blank', 'a2ui', {
      kind: 'error',
      text: '无效参数 "bad"，可选值：on | off | status（或不传参直接切换）',
    })
    const errHtml = renderToStaticMarkup(
      createElement(TierComponent, tierSlotRegistration!.inject('sess-blank')),
    )
    expect(errHtml).toContain('data-a2ui-toast="default"')
    expect(errHtml).toContain('无效参数 &quot;bad&quot;')

    dismissCommandNotice('sess-blank')
    expect(getCommandNotice('sess-blank')).toBeNull()

    emitCommandExecuted('sess-blank', 'compact', {
      kind: 'success',
      text: 'Compacted',
    })
    expect(getCommandNotice('sess-blank')).toBeNull()

    setUiLocaleOverride('en')
    emitCommandExecuted('sess-active', 'a2ui', {
      kind: 'success',
      text: 'A2UI generative UI enabled',
    })
    expect(getA2uiEnabled('sess-active')).toBe(true)
    expect(getCommandNotice('sess-active')).toBeNull()

    const activeHtml = renderToStaticMarkup(
      createElement(TierComponent, tierSlotRegistration!.inject('sess-active')),
    )
    expect(activeHtml).not.toContain('data-a2ui-toast')
  })
})
