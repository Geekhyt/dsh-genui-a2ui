/**
 * dsh-genui-a2ui browser half.
 *
 * Zero DOM hacks, zero assistant-step shadowing — 100% official DSH seams:
 * 1. `ctx.uiConversation.events.register` projects settled `a2ui_render` results
 *    into turn-indexed chat metadata (replay-safe, fork-safe, & `update=true` aware);
 * 2. `ctx.uiConversation.userText.register` + `conversation.user.text.node`
 *    beautifies `[a2ui-action]` protocol user messages into expandable receipt chips;
 * 3. `tool.call.toolview` (`a2ui_render` & `a2ui_ask`) renders live 60fps progressive
 *    streaming surfaces and blocking in-turn interactive forms;
 * 4. `conversation.chat.turnTail` renders settled `placement="answer"` cards below
 *    the assistant's reply, turning superseded historical turns into read-only snapshots;
 * 5. `conversation.input.dock` pins `placement="dock"` workspace panels above the composer;
 * 6. `conversation.input.left` mounts the 1-click A2UI on/off toggle pill.
 *
 * @module dsh-genui-a2ui/client
 */
import type { Context } from '@deepseek-ai/cordis'
import {
  ANSWER_COMMAND,
  ASK_TOOL,
  RENDER_TOOL,
  TIER_COMMAND,
} from '../shared/constants.ts'
import type { AskAnswerInput } from '../shared/wire-types.ts'
import {
  A2UI_ACTION_NODE_ID,
  A2uiActionUserChip,
  a2uiActionUserTextRule,
} from './ActionUserChip.tsx'
import { A2uiAskDockView, A2uiAskToolView } from './AskToolView.tsx'
import { A2uiDockView } from './DockView.tsx'
import {
  fileAddressFor,
  parseFileTarget,
  resolveSessionPath,
  type WorkspaceFileOpener,
} from './file-opener.tsx'
import type { SurfaceActionCallback } from './SurfaceView.tsx'
import { getLoadedRuntimeChunk } from './chunk-loader.ts'
import { setFallbackDefaultEnabled } from './persistence.ts'
import { A2uiTierControl } from './TierControl.tsx'
import { A2uiToolView, type ChatExternalStore } from './ToolView.tsx'
import { A2uiTurnTailView } from './TurnTailView.tsx'
import { a2uiSurfaceNodeDefinition } from './turn-surfaces.ts'

export const inject = ['slots', 'sessions', 'uiConversation']

export interface ClientConfig {
  readonly defaultEnabled?: boolean
}

interface SidebarRightService {
  openResource(address: string, options?: { params?: { line?: number } }): void
  openResourceIn?(sessionId: string, address: string, options?: { params?: { line?: number } }): void
}

interface SlotsService {
  inject(name: string, register: (() => () => void) | (() => Generator<() => void, void, unknown>)): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
}

interface ConversationLike {
  send(message: string): Promise<unknown>
}

interface SessionCommandResult {
  readonly ok?: boolean
  readonly value?: {
    readonly matched?: boolean
    readonly result?: { readonly kind?: string }
  }
}

interface SessionBindingLike {
  readonly session?: {
    command?(line: string): Promise<SessionCommandResult>
    readonly projections?: {
      faceOf?(name: 'workingDirectory'): { getSnapshot?(): string | null | undefined } | undefined
    }
  }
}

interface SessionsService {
  binding?(sessionId: string): SessionBindingLike | undefined
  scope?(sessionId: string): { get?(name: string): unknown } | undefined
  readonly list?: {
    getSnapshot?(): { readonly byId?: Record<string, { readonly cwd?: string | undefined }> } | undefined
  }
}

interface UiConversationService {
  events: {
    register(definition: unknown): () => void
  }
  userText?: {
    register(rule: unknown): () => void
  }
  binding(sessionBinding: unknown): {
    target(name: 'chat'): ChatExternalStore
  }
}

interface ClientHostContext {
  slots: SlotsService
  sessions: SessionsService
  uiConversation: UiConversationService
}

function resolveChatStore(host: ClientHostContext, sessionId: string | undefined): ChatExternalStore | undefined {
  if (sessionId === undefined || sessionId === '') return undefined
  if (host.sessions.binding === undefined) return undefined
  try {
    const binding = host.sessions.binding(sessionId)
    if (binding === undefined) return undefined
    return host.uiConversation.binding(binding).target('chat')
  } catch {
    return undefined
  }
}

function createActionSender(
  host: ClientHostContext,
  sessionId: string | undefined,
): SurfaceActionCallback | undefined {
  if (sessionId === undefined || sessionId === '') return undefined
  return (message: string) => {
    const conversation = host.sessions.scope?.(sessionId)?.get?.('conversation') as ConversationLike | undefined
    if (conversation === undefined) return
    void conversation.send(message).catch((err: unknown) => {
      console.warn('[dsh-genui-a2ui] failed to send action to session:', err instanceof Error ? err.message : String(err))
    })
  }
}

async function executeSessionCommand(
  host: ClientHostContext,
  sessionId: string | undefined,
  line: string,
): Promise<boolean> {
  if (sessionId === undefined || sessionId === '') return false
  const binding = host.sessions.binding?.(sessionId)
  const session = binding?.session
  if (session === undefined || typeof session.command !== 'function') return false
  const res = await session.command(line)
  if (res?.ok === false) return false
  if (res?.value?.matched === false) return false
  if (res?.value?.result?.kind === 'error') return false
  return true
}

function createFileOpener(
  host: ClientHostContext,
  getSidebarRight: () => SidebarRightService | undefined,
  sessionId: string | undefined,
): WorkspaceFileOpener | undefined {
  if (sessionId === undefined || sessionId === '') return undefined
  return (rawPath: string, explicitLine?: number) => {
    const target = parseFileTarget(rawPath, explicitLine)
    if (target === null) return
    const sr = getSidebarRight()
    if (sr === undefined) return
    const cwd = host.sessions.list?.getSnapshot?.()?.byId?.[sessionId]?.cwd
    const workingDir =
      host.sessions.binding?.(sessionId)?.session?.projections?.faceOf?.('workingDirectory')?.getSnapshot?.() ??
      undefined
    const address = fileAddressFor(sessionId, cwd, resolveSessionPath(workingDir, target.path))
    const opts = target.line !== undefined ? { params: { line: target.line } } : undefined
    try {
      sr.openResource(address, opts)
    } catch {
      sr.openResourceIn?.(sessionId, address, opts)
    }
  }
}

export function apply(ctx: Context, config: ClientConfig = {}): void {
  if (typeof config?.defaultEnabled === 'boolean') {
    setFallbackDefaultEnabled(config.defaultEnabled)
  }

  const host = ctx as unknown as ClientHostContext
  const { slots, uiConversation } = host

  let sidebarRightSvc: SidebarRightService | undefined
  if (typeof (ctx as { inject?: unknown }).inject === 'function') {
    ctx.inject(['sidebarRight'], (srCtx) => {
      sidebarRightSvc = (srCtx as unknown as { sidebarRight?: SidebarRightService }).sidebarRight
      srCtx.effect(() => () => {
        sidebarRightSvc = undefined
      }, 'dsh-genui-a2ui: sidebarRight ref')
    })
  }
  const getSidebarRight = () => sidebarRightSvc

  ctx.effect(
    () => () => {
      getLoadedRuntimeChunk()?.cleanupA2uiRuntimeStyles()
    },
    'dsh-genui-a2ui: styles',
  )

  const match = a2uiSurfaceNodeDefinition.match.bind(a2uiSurfaceNodeDefinition)
  ctx.effect(
    () =>
      uiConversation.events.register({
        ...a2uiSurfaceNodeDefinition,
        match: {
          'tool/call': match,
          'tool/result': match,
        },
      }),
    'dsh-genui-a2ui: conversation projection',
  )

  if (uiConversation.userText !== undefined) {
    ctx.effect(
      () => uiConversation.userText!.register(a2uiActionUserTextRule),
      'dsh-genui-a2ui: [a2ui-action] userText rule',
    )
  }

  ctx.effect(
    () =>
      slots.inject('conversation.user.text.node', function* () {
        yield slots.register(
          {
            name: 'conversation.user.text.node',
            key: A2UI_ACTION_NODE_ID,
            priority: 100,
          },
          A2uiActionUserChip,
        )
      }),
    'dsh-genui-a2ui: [a2ui-action] userText node',
  )

  ctx.effect(
    () =>
      slots.inject('tool.call.toolview', function* () {
        yield slots.register(
          {
            name: 'tool.call.toolview',
            key: RENDER_TOOL,
            inject: (sessionId: string) => ({
              sessionId,
              chatStore: resolveChatStore(host, sessionId),
              sendAction: createActionSender(host, sessionId),
              openWorkspaceFile: createFileOpener(host, getSidebarRight, sessionId),
            }),
          },
          A2uiToolView,
        )
        yield slots.register(
          {
            name: 'tool.call.toolview',
            key: ASK_TOOL,
            inject: (sessionId: string) => ({
              sessionId,
              chatStore: resolveChatStore(host, sessionId),
              openWorkspaceFile: createFileOpener(host, getSidebarRight, sessionId),
              submitAskAnswer: (payload: AskAnswerInput) =>
                executeSessionCommand(host, sessionId, `/${ANSWER_COMMAND} ${JSON.stringify(payload)}`),
            }),
          },
          A2uiAskToolView,
        )
      }),
    'dsh-genui-a2ui: toolviews (render + ask)',
  )

  ctx.effect(
    () =>
      slots.inject('conversation.chat.turnTail', () =>
        slots.register(
          {
            name: 'conversation.chat.turnTail',
            id: 'dsh-genui-a2ui',
            order: 20,
            inject: (sessionId: string) => ({
              sessionId,
              chatStore: resolveChatStore(host, sessionId),
              sendAction: createActionSender(host, sessionId),
              openWorkspaceFile: createFileOpener(host, getSidebarRight, sessionId),
            }),
          },
          A2uiTurnTailView,
        ),
      ),
    'dsh-genui-a2ui: turnTail',
  )

  ctx.effect(
    () =>
      slots.inject('conversation.input.dock', function* () {
        yield slots.register(
          {
            name: 'conversation.input.dock',
            id: 'dsh-genui-a2ui.ask',
            order: 5,
            inject: (sessionId: string) => ({
              sessionId,
              chatStore: resolveChatStore(host, sessionId),
              openWorkspaceFile: createFileOpener(host, getSidebarRight, sessionId),
              submitAskAnswer: (payload: AskAnswerInput) =>
                executeSessionCommand(host, sessionId, `/${ANSWER_COMMAND} ${JSON.stringify(payload)}`),
            }),
          },
          A2uiAskDockView,
        )
        yield slots.register(
          {
            name: 'conversation.input.dock',
            id: 'dsh-genui-a2ui.dock',
            order: 15,
            inject: (sessionId: string) => ({
              sessionId,
              chatStore: resolveChatStore(host, sessionId),
              sendAction: createActionSender(host, sessionId),
              openWorkspaceFile: createFileOpener(host, getSidebarRight, sessionId),
            }),
          },
          A2uiDockView,
        )
      }),
    'dsh-genui-a2ui: dock (ask + workspace)',
  )

  ctx.effect(
    () =>
      slots.inject('conversation.input.left', () =>
        slots.register(
          {
            name: 'conversation.input.left',
            id: 'dsh-genui-a2ui.tier',
            order: 50,
            inject: (sessionId: string) => ({
              sessionId,
              chatStore: resolveChatStore(host, sessionId),
              syncHostEnabled: (enabled: boolean) =>
                executeSessionCommand(host, sessionId, `/${TIER_COMMAND} ${enabled ? 'on' : 'off'}`),
            }),
          },
          A2uiTierControl,
        ),
      ),
    'dsh-genui-a2ui: tier control',
  )
}
