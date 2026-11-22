import { A2uiError, type AgentToRendererMessage } from '@a2ui/agent'
import { z } from 'zod'
import { A2UI_LIMITS } from '../shared/catalog-schema.ts'
import { isDangerousObjectKey, isSecretKey } from '../shared/constants.ts'
import { HOST_MESSAGES, resolveHostLocale } from '../shared/i18n.ts'
import type { AskAnswerInput, AskMeta } from '../shared/wire-types.ts'
import { ASK_TOOL, type SurfaceSessions } from './generator.ts'
import {
  isSubagentCall,
  sessionIdOf,
  surfaceIdsOf,
  type ToolExec,
  unwrapLegacyToolArgs,
} from './render-tool.ts'

export type { AskAnswerInput, AskMeta }

export const DEFAULT_ASK_TIMEOUT_SECONDS = 180
const MAX_TIMEOUT_SECONDS = 2_147_483
const MAX_ANSWER_STR_LEN = 32_000
const MAX_ANSWER_ARRAY_LEN = 200
const MAX_ANSWER_KEYS = 200
let fallbackAskSeq = 0

function escapeObsPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

function normalizeObsPointer(pointer: string): string {
  const trimmed = pointer.trim()
  if (trimmed === '' || trimmed === '/') return '/'
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash
}

function isPathObscured(path: string, obscured: ReadonlySet<string>): boolean {
  if (obscured.size === 0) return false
  const norm = normalizeObsPointer(path)
  for (const raw of obscured) {
    const trimmed = raw.trim()
    if (trimmed === '') continue
    const isRelative = !trimmed.startsWith('/')
    const obs = normalizeObsPointer(trimmed)
    if (obs === '/') return true
    if (norm === obs || norm.startsWith(`${obs}/`)) return true
    if (isRelative && (norm.endsWith(obs) || norm.includes(`${obs}/`))) return true
  }
  return false
}

function referencesObscuredPointer(
  node: unknown,
  obscured: ReadonlySet<string>,
  depth = 0,
): boolean {
  if (obscured.size === 0 || depth > 8 || typeof node !== 'object' || node === null) return false
  if (Array.isArray(node)) {
    return node.some((el) => referencesObscuredPointer(el, obscured, depth + 1))
  }
  const rec = node as Record<string, unknown>
  const rawPath = rec.path ?? rec['@path']
  if (typeof rawPath === 'string' && rawPath.trim() !== '' && isPathObscured(rawPath, obscured)) {
    return true
  }
  for (const val of Object.values(rec)) {
    if (referencesObscuredPointer(val, obscured, depth + 1)) return true
  }
  return false
}

export function collectObscuredContextPointersFromMessages(
  messages: readonly AgentToRendererMessage[],
  obscuredPointers: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>(obscuredPointers)
  if (obscuredPointers.size === 0) return out
  const inspectContext = (ctx: unknown, prefix: string, depth: number) => {
    if (depth > 6 || typeof ctx !== 'object' || ctx === null || Array.isArray(ctx)) return
    for (const [k, v] of Object.entries(ctx as Record<string, unknown>)) {
      const seg = escapeObsPointerSegment(k)
      const nextPath = prefix === '' ? `/${seg}` : `${prefix}/${seg}`
      if (referencesObscuredPointer(v, obscuredPointers)) {
        out.add(nextPath)
      } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        inspectContext(v, nextPath, depth + 1)
      }
    }
  }
  const inspectAction = (action: unknown) => {
    if (typeof action !== 'object' || action === null) return
    const event = (action as Record<string, unknown>).event
    if (typeof event !== 'object' || event === null) return
    inspectContext((event as Record<string, unknown>).context, '', 0)
  }
  const inspectComponents = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue
      const rec = item as Record<string, unknown>
      inspectAction(rec.action)
      inspectAction(rec.approveAction)
      inspectAction(rec.rejectAction)
    }
  }
  for (const msg of messages) {
    const rec = msg as unknown as Record<string, unknown>
    if (rec.createSurface && typeof rec.createSurface === 'object') {
      inspectComponents((rec.createSurface as Record<string, unknown>).components)
    }
    if (rec.updateComponents && typeof rec.updateComponents === 'object') {
      inspectComponents((rec.updateComponents as Record<string, unknown>).components)
    }
  }
  return out
}

export function collectObscuredPointersFromMessages(
  messages: readonly AgentToRendererMessage[],
): Set<string> {
  const obscured = new Set<string>()
  const inspectComponents = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue
      const rec = item as Record<string, unknown>
      if (rec.component !== 'TextField' || rec.variant !== 'obscured') continue
      const val = rec.value
      if (typeof val === 'object' && val !== null) {
        const rawPath =
          (val as { path?: unknown; '@path'?: unknown }).path ??
          (val as { '@path'?: unknown })['@path']
        if (typeof rawPath === 'string' && rawPath.trim() !== '') {
          obscured.add(rawPath.trim())
        }
      }
    }
  }
  for (const msg of messages) {
    const rec = msg as unknown as Record<string, unknown>
    if (rec.createSurface && typeof rec.createSurface === 'object') {
      inspectComponents((rec.createSurface as Record<string, unknown>).components)
    }
    if (rec.updateComponents && typeof rec.updateComponents === 'object') {
      inspectComponents((rec.updateComponents as Record<string, unknown>).components)
    }
  }
  return obscured
}

export function sanitizePayloadObject(
  value: unknown,
  obscuredPointers?: ReadonlySet<string>,
  stripPerSurfaceRoot = false,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const blocked = obscuredPointers ?? new Set<string>()
  const clean = (node: unknown, path: string, depth: number): unknown => {
    if (depth > 8) return undefined
    if (blocked.size > 0 && path !== '' && isPathObscured(path, blocked)) return undefined
    if (typeof node === 'string') {
      return node.length > MAX_ANSWER_STR_LEN ? node.slice(0, MAX_ANSWER_STR_LEN) : node
    }
    if (Array.isArray(node)) {
      const out: unknown[] = []
      const limit = Math.min(node.length, MAX_ANSWER_ARRAY_LEN)
      for (let i = 0; i < limit; i++) {
        const childPath = path === '' ? `/${i}` : `${path}/${i}`
        const next = clean(node[i], childPath, depth + 1)
        if (next !== undefined) out.push(next)
      }
      return out
    }
    if (typeof node === 'object' && node !== null) {
      const out: Record<string, unknown> = {}
      let count = 0
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (count >= MAX_ANSWER_KEYS) break
        if (isDangerousObjectKey(k) || isSecretKey(k)) continue
        const seg = escapeObsPointerSegment(k)
        const childPath =
          stripPerSurfaceRoot && depth === 0 ? '' : path === '' ? `/${seg}` : `${path}/${seg}`
        if (blocked.size > 0 && childPath !== '' && isPathObscured(childPath, blocked)) continue
        const next = clean(v, childPath, depth + 1)
        if (next !== undefined) {
          Object.defineProperty(out, k, {
            value: next,
            enumerable: true,
            writable: true,
            configurable: true,
          })
          count += 1
        }
      }
      return out
    }
    return node
  }
  return (clean(value, '', 0) as Record<string, unknown>) ?? {}
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
  readonly obscuredPointers: ReadonlySet<string>
  readonly obscuredContextPointers: ReadonlySet<string>
  resolve(settlement: AskSettlement): void
  reject(error: Error): void
  cleanup(): void
}

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
    readonly obscuredPointers?: ReadonlySet<string> | undefined
    readonly obscuredContextPointers?: ReadonlySet<string> | undefined
  }): Promise<AskSettlement> {
    const {
      sessionId,
      callId,
      defaultSurfaceId,
      timeoutSeconds,
      signal,
      obscuredPointers,
      obscuredContextPointers,
    } = options
    if (signal?.aborted) {
      const reason = signal.reason
      return Promise.reject(reason instanceof Error ? reason : new Error('a2ui_ask aborted'))
    }

    const mapKey = this.keyOf(sessionId, callId)
    const existing = this.entries.get(mapKey)
    if (existing !== undefined) {
      existing.reject(new Error(`a2ui_ask "${callId}" superseded by a newer call`))
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
        obscuredPointers: obscuredPointers ?? new Set<string>(),
        obscuredContextPointers: obscuredContextPointers ?? obscuredPointers ?? new Set<string>(),
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

  settle(sessionId: string, input: AskAnswerInput): boolean {
    const callIdProvided =
      input.callId !== undefined && input.callId !== null && input.callId !== ''
    let target: PendingEntry | undefined
    if (callIdProvided) {
      if (typeof input.callId === 'string' && input.callId.trim() !== '') {
        target = this.entries.get(this.keyOf(sessionId, input.callId.trim()))
      }
    } else {
      const candidates = [...this.entries.values()].filter((e) => e.sessionId === sessionId)
      if (candidates.length === 1) target = candidates[0]
    }
    if (target === undefined) return false

    if (input.skipped === true) {
      target.resolve({ status: 'skipped' })
      return true
    }

    const trimCap = (val: unknown, max: number): string =>
      typeof val === 'string' ? val.trim().slice(0, max) : ''
    const userMessage = trimCap(input.userMessage, 4_000)

    target.resolve({
      status: 'answered',
      action: trimCap(input.action, 256) || 'submit',
      surfaceId: trimCap(input.surfaceId, 256) || target.defaultSurfaceId,
      sourceComponentId: trimCap(input.sourceComponentId, 256),
      ...(userMessage !== '' ? { userMessage } : {}),
      context: sanitizePayloadObject(input.context, target.obscuredContextPointers, false),
      dataModels: sanitizePayloadObject(input.dataModels, target.obscuredPointers, true),
    })
    return true
  }

  forgetSession(sessionId: string): void {
    for (const [key, entry] of this.entries.entries()) {
      if (entry.sessionId === sessionId) {
        entry.cleanup()
        this.entries.delete(key)
        entry.reject(new Error(`session "${sessionId}" disposed`))
      }
    }
  }

  disposeAll(): void {
    for (const [key, entry] of this.entries.entries()) {
      entry.cleanup()
      this.entries.delete(key)
      entry.reject(new Error('dsh-genui-a2ui plugin disposed'))
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

const AskArgsSchema = z
  .object({
    ui: z.string(),
    title: z.union([z.string(), z.null()]).optional(),
    timeout: z.unknown().optional(),
  })
  .passthrough()

let warnedLegacyAskBridgeArgs = false

function warnLegacyAskBridgeEncoding(reason: string): void {
  if (warnedLegacyAskBridgeArgs) return
  warnedLegacyAskBridgeArgs = true
  console.warn(
    `[dsh-genui-a2ui] Unwrapped non-standard a2ui_ask arguments (${reason}); upstream tool bridge should pass a JSON object.`,
  )
}

export function resetAskArgsWarningForTests(): void {
  warnedLegacyAskBridgeArgs = false
}

export function readAskArgs(args: unknown): {
  ui: string | undefined
  title: string | undefined
  timeout: number
} {
  const { value, rawUiFallback } = unwrapLegacyToolArgs(args, warnLegacyAskBridgeEncoding)
  if (rawUiFallback !== undefined) {
    return { ui: rawUiFallback, title: undefined, timeout: DEFAULT_ASK_TIMEOUT_SECONDS }
  }
  const parsed = AskArgsSchema.safeParse(value)
  if (!parsed.success) {
    return { ui: undefined, title: undefined, timeout: DEFAULT_ASK_TIMEOUT_SECONDS }
  }
  let timeout = DEFAULT_ASK_TIMEOUT_SECONDS
  if (typeof parsed.data.timeout === 'number' && Number.isInteger(parsed.data.timeout)) {
    if (
      parsed.data.timeout === -1 ||
      (parsed.data.timeout >= 1 && parsed.data.timeout <= MAX_TIMEOUT_SECONDS)
    ) {
      timeout = parsed.data.timeout
    }
  }
  return {
    ui: parsed.data.ui,
    title:
      typeof parsed.data.title === 'string' && parsed.data.title.trim() !== ''
        ? parsed.data.title.trim()
        : undefined,
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
      const obscuredPointers = collectObscuredPointersFromMessages(messages)
      const obscuredContextPointers = collectObscuredContextPointersFromMessages(
        messages,
        obscuredPointers,
      )
      const callId =
        typeof exec?.callId === 'string' && exec.callId.trim() !== ''
          ? exec.callId.trim()
          : `ask_${Date.now()}_${++fallbackAskSeq}`
      const settlement = await asks.wait({
        sessionId: sid,
        callId,
        defaultSurfaceId: surfaceIds[0] ?? 'default',
        timeoutSeconds: timeout,
        signal: exec?.signal,
        obscuredPointers,
        obscuredContextPointers,
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
