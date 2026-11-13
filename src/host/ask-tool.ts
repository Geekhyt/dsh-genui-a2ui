/**
 * `a2ui_ask`: blocking in-turn interactive question/form tool.
 *
 * Unlike `a2ui_render` (which renders a display/action card and lets the turn
 * finish immediately), `a2ui_ask` suspends tool execution inside the current
 * turn until the user clicks a `Button` action (or skips) in `AskToolView`.
 * The browser dispatches `/a2ui-answer <json>` via `session.command(...)`
 * (`recordInput: false`), resolving the pending tool call with structured
 * `{ action, userMessage, context, dataModels }` without opening an extra turn.
 */
import { A2uiError, type AgentToRendererMessage } from '@a2ui/agent'
import { A2UI_LIMITS } from '../shared/catalog-schema.ts'
import { HOST_MESSAGES, resolveHostLocale } from '../shared/i18n.ts'
import type { AskAnswerInput, AskMeta } from '../shared/wire-types.ts'
import { ASK_TOOL, type SurfaceSessions } from './generator.ts'
import { isSubagentCall, sessionIdOf, surfaceIdsOf, type ToolExec } from './render-tool.ts'

export type { AskAnswerInput, AskMeta }

export const DEFAULT_ASK_TIMEOUT_SECONDS = 180
const MAX_TIMEOUT_SECONDS = 2_147_483

const SECRET_KEY_RE = /^(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key)$/i

export function sanitizePayloadObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const clean = (node: unknown, depth: number): unknown => {
    if (depth > 8) return undefined
    if (Array.isArray(node)) return node.map((item) => clean(item, depth + 1))
    if (typeof node === 'object' && node !== null) {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (SECRET_KEY_RE.test(k)) continue
        const next = clean(v, depth + 1)
        if (next !== undefined) out[k] = next
      }
      return out
    }
    return node
  }
  return (clean(value, 0) as Record<string, unknown>) ?? {}
}

export type AskSettlement =
  | {
      readonly status: 'answered'
      readonly action: string
      readonly surfaceId: string
      readonly sourceComponentId: string
      readonly userMessage?: string
      readonly context: Record<string, unknown>
      readonly dataModels: Record<string, unknown>
    }
  | { readonly status: 'skipped' }
  | { readonly status: 'timed_out' }

export interface AskValue {
  readonly status: 'answered' | 'skipped' | 'timed_out'
  readonly callId: string
  readonly title: string | null
  readonly surfaceIds: string[]
  readonly messages: AgentToRendererMessage[]
  readonly action?: string
  readonly surfaceId?: string
  readonly sourceComponentId?: string
  readonly userMessage?: string
  readonly context?: Record<string, unknown>
  readonly dataModels?: Record<string, unknown>
}

interface PendingEntry {
  readonly sessionId: string
  readonly callId: string
  readonly defaultSurfaceId: string
  resolve(settlement: AskSettlement): void
  reject(error: Error): void
  cleanup(): void
}

/** Coordinates in-flight `a2ui_ask` tool executions with `/a2ui-answer` RPC commands. */
export class PendingAskRegistry {
  private readonly entries = new Map<string, PendingEntry>()

  private keyOf(sessionId: string, callId: string): string {
    return `${sessionId}::${callId}`
  }

  hasPending(sessionId: string, callId?: string): boolean {
    if (callId !== undefined && callId !== '') {
      return this.entries.has(this.keyOf(sessionId, callId))
    }
    for (const entry of this.entries.values()) {
      if (entry.sessionId === sessionId) return true
    }
    return false
  }

  wait(options: {
    readonly sessionId: string
    readonly callId: string
    readonly defaultSurfaceId: string
    readonly timeoutSeconds: number
    readonly signal?: AbortSignal | undefined
  }): Promise<AskSettlement> {
    const { sessionId, callId, defaultSurfaceId, timeoutSeconds, signal } = options
    if (signal?.aborted) {
      const reason = signal.reason
      return Promise.reject(reason instanceof Error ? reason : new Error('a2ui_ask aborted'))
    }

    const mapKey = this.keyOf(sessionId, callId)
    const existing = this.entries.get(mapKey)
    if (existing !== undefined) {
      existing.cleanup()
      this.entries.delete(mapKey)
    }

    return new Promise<AskSettlement>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const onAbort = () => {
        cleanup()
        this.entries.delete(mapKey)
        const reason = signal?.reason
        reject(reason instanceof Error ? reason : new Error('a2ui_ask cancelled'))
      }

      const cleanup = () => {
        if (timer !== undefined) {
          clearTimeout(timer)
          timer = undefined
        }
        signal?.removeEventListener('abort', onAbort)
      }

      if (timeoutSeconds !== -1) {
        timer = setTimeout(() => {
          cleanup()
          this.entries.delete(mapKey)
          resolve({ status: 'timed_out' })
        }, timeoutSeconds * 1000)
      }

      signal?.addEventListener('abort', onAbort, { once: true })

      this.entries.set(mapKey, {
        sessionId,
        callId,
        defaultSurfaceId,
        resolve: (settlement) => {
          cleanup()
          this.entries.delete(mapKey)
          resolve(settlement)
        },
        reject: (err) => {
          cleanup()
          this.entries.delete(mapKey)
          reject(err)
        },
        cleanup,
      })
    })
  }

  /** Settle a pending `a2ui_ask` call from the `/a2ui-answer` command handler. */
  settle(sessionId: string, input: AskAnswerInput): boolean {
    let target: PendingEntry | undefined
    if (input.callId !== undefined && input.callId !== '') {
      target = this.entries.get(this.keyOf(sessionId, input.callId))
    }
    if (target === undefined) {
      const candidates = [...this.entries.values()].filter((e) => e.sessionId === sessionId)
      if (candidates.length === 1) target = candidates[0]
    }
    if (target === undefined) return false

    if (input.skipped === true) {
      target.resolve({ status: 'skipped' })
      return true
    }

    target.resolve({
      status: 'answered',
      action: typeof input.action === 'string' && input.action.trim() !== '' ? input.action.trim() : 'submit',
      surfaceId:
        typeof input.surfaceId === 'string' && input.surfaceId.trim() !== ''
          ? input.surfaceId.trim()
          : target.defaultSurfaceId,
      sourceComponentId: typeof input.sourceComponentId === 'string' ? input.sourceComponentId : '',
      ...(typeof input.userMessage === 'string' && input.userMessage.trim() !== ''
        ? { userMessage: input.userMessage.trim() }
        : {}),
      context: sanitizePayloadObject(input.context),
      dataModels: sanitizePayloadObject(input.dataModels),
    })
    return true
  }

  /** Cancel and clean up all pending asks for a disposed session. */
  forgetSession(sessionId: string): void {
    for (const [key, entry] of this.entries.entries()) {
      if (entry.sessionId === sessionId) {
        entry.cleanup()
        this.entries.delete(key)
        entry.reject(new Error(`session "${sessionId}" disposed`))
      }
    }
  }
}

const ASK_PARAMETERS = {
  type: 'object',
  properties: {
    ui: {
      type: 'string',
      description:
        'The A2UI Express program presenting the interactive form/wizard. MUST include at least one Button(..., action=Event("...", {...})) so the user can submit their answer.',
    },
    title: {
      type: 'string',
      description: 'Short prompt title shown in the interactive ask header.',
    },
    timeout: {
      type: 'integer',
      description: `Seconds to wait for the user's submission before returning timed_out (default ${DEFAULT_ASK_TIMEOUT_SECONDS}; use -1 to wait indefinitely).`,
    },
  },
  required: ['ui'],
  additionalProperties: false,
} as const

export function readAskArgs(args: unknown): {
  ui: string | undefined
  title: string | undefined
  timeout: number
} {
  let value: unknown = args
  for (let i = 0; i < 3; i++) {
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value)
      } catch {
        return { ui: value as string, title: undefined, timeout: DEFAULT_ASK_TIMEOUT_SECONDS }
      }
      continue
    }
    if (typeof value === 'object' && value !== null && 'arguments' in value && !('ui' in value)) {
      value = (value as { arguments: unknown }).arguments
      continue
    }
    break
  }
  if (typeof value !== 'object' || value === null) {
    return { ui: undefined, title: undefined, timeout: DEFAULT_ASK_TIMEOUT_SECONDS }
  }
  const record = value as Record<string, unknown>
  let timeout = DEFAULT_ASK_TIMEOUT_SECONDS
  if (typeof record.timeout === 'number' && Number.isInteger(record.timeout)) {
    if (record.timeout === -1 || (record.timeout >= 1 && record.timeout <= MAX_TIMEOUT_SECONDS)) {
      timeout = record.timeout
    }
  }
  return {
    ui: typeof record.ui === 'string' ? record.ui : undefined,
    title: typeof record.title === 'string' && record.title.trim() !== '' ? record.title.trim() : undefined,
    timeout,
  }
}

export function createAskTool(sessions: SurfaceSessions, asks: PendingAskRegistry) {
  return {
    name: ASK_TOOL,
    description: [
      'Present a rich interactive A2UI form, configurator, or diff-approval card (`DiffView`, `FileTree`, `Callout`, `KeyValue`, `Slider`, `ChoicePicker`, `CheckBox`, `TextField`, `DateTimeInput`, `Button`) and pause the current turn until the user submits a Button `Event(...)` or skips.',
      'Load the `a2ui` skill first for form input, check-rule, and `Event(...)` signatures if not yet loaded in this session.',
      'Prefer this over plain-text question tools when collecting multiple typed parameters or reviewing structured diffs/configs; for a single simple text choice, use `ask_user_question` if available.',
      'Returns `{ status, action, userMessage, context, dataModels }` directly in the same turn. Never ask for passwords, API keys, or secrets.',
    ].join(' '),
    parameters: ASK_PARAMETERS,
    output: {
      schema: { type: 'object' },
      render(_args: unknown, value: AskValue) {
        if (value.status === 'skipped') {
          return [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'skipped',
                message:
                  'The user skipped this interactive prompt. Continue safely without asking again, and do not treat skip as approval for destructive actions.',
              }),
            },
          ]
        }
        if (value.status === 'timed_out') {
          return [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'timed_out',
                message:
                  'No submission arrived before the timeout. Do not treat timeout as approval; summarize options concisely or stop safely.',
              }),
            },
          ]
        }
        return [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'answered',
              action: value.action,
              surfaceId: value.surfaceId,
              ...(value.userMessage ? { userMessage: value.userMessage } : {}),
              context: value.context ?? {},
              dataModels: value.dataModels ?? {},
            }),
          },
        ]
      },
      presentationMeta(_args: unknown, value: AskValue): AskMeta {
        return {
          kind: 'dsh-a2ui-ask',
          version: 1,
          status: value.status,
          callId: value.callId,
          title: value.title,
          action: value.action ?? null,
          userMessage: value.userMessage ?? null,
          context: value.context ?? null,
          surfaceIds: value.surfaceIds,
          messages: value.messages,
        }
      },
    },
    async execute(args: unknown, exec?: ToolExec): Promise<AskValue> {
      if (isSubagentCall(exec)) {
        throw new Error(
          'a2ui_ask cannot be called inside a background subagent. Return structured questions to the parent agent instead.',
        )
      }

      const { ui, title, timeout } = readAskArgs(args)
      if (ui === undefined || ui.trim() === '') {
        throw new Error('a2ui_ask: `ui` must be a non-empty A2UI Express program.')
      }

      const sid = sessionIdOf(exec)
      let messages: AgentToRendererMessage[]
      try {
        messages = sessions.compile(sid, ui)
      } catch (error) {
        if (error instanceof A2uiError) {
          const fails = sessions.recordCompileFailure(sid, 'ask')
          if (fails > A2UI_LIMITS.maxRepairsPerTurn) {
            sessions.clearCompileFailures(sid, 'ask')
            throw new Error(
              `a2ui_ask: the program was rejected — ${error.message}\nRepair limit (${A2UI_LIMITS.maxRepairsPerTurn}) reached for this turn. STOP calling a2ui_ask and ask the user concisely in plain text.`,
            )
          }
          throw new Error(
            `a2ui_ask: the program was rejected — ${error.message}\nFix it and call a2ui_ask again (retry ${fails}/${A2UI_LIMITS.maxRepairsPerTurn}).`,
          )
        }
        throw error
      }

      if (messages.length === 0) {
        throw new Error('a2ui_ask: the program produced no UI messages (is `root` assigned?).')
      }

      sessions.clearCompileFailures(sid, 'ask')
      const surfaceIds = surfaceIdsOf(messages)
      const callId = typeof exec?.callId === 'string' && exec.callId !== '' ? exec.callId : `ask_${Date.now()}`
      const settlement = await asks.wait({
        sessionId: sid,
        callId,
        defaultSurfaceId: surfaceIds[0] ?? 'default',
        timeoutSeconds: timeout,
        signal: exec?.signal,
      })

      if (settlement.status !== 'answered') {
        return {
          status: settlement.status,
          callId,
          title: title ?? null,
          surfaceIds,
          messages,
        }
      }

      return {
        status: 'answered',
        callId,
        title: title ?? null,
        surfaceIds,
        messages,
        action: settlement.action,
        surfaceId: settlement.surfaceId,
        sourceComponentId: settlement.sourceComponentId,
        ...(settlement.userMessage !== undefined ? { userMessage: settlement.userMessage } : {}),
        context: settlement.context,
        dataModels: settlement.dataModels,
      }
    },
    presentCall(args: unknown) {
      const { title } = readAskArgs(args)
      return {
        card: 'generic',
        title: title ?? HOST_MESSAGES[resolveHostLocale()].askDefaultTitle,
        kind: 'other',
      }
    },
    presentResult(args: unknown) {
      const { title } = readAskArgs(args)
      return {
        card: 'generic',
        title: title ?? HOST_MESSAGES[resolveHostLocale()].askDefaultTitle,
      }
    },
  }
}
