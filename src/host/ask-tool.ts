import { A2uiError, type AgentToRendererMessage } from '@a2ui/agent'
import { z } from 'zod'
import { A2UI_LIMITS } from '../shared/catalog-schema.ts'
import { isDangerousObjectKey, isSecretKey } from '../shared/constants.ts'
import { HOST_MESSAGES, resolveHostLocale } from '../shared/i18n.ts'
import {
  buildTemplatePathMap,
  collectKvSecretsFromValue,
  collectSecretsFromNode,
  escapeJsonPointerSegment,
  extractBindingPointer,
  isBindingExpression,
  isPointerObscured,
  isScrubbableNumericSecret,
  normalizePointerPath,
  referencesObscuredPointer,
  resolveTemplateObscuredPointers,
  scrubSecretString,
} from '../shared/redaction.ts'
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
const MAX_TITLE_LEN = 200
const MAX_PENDING_PER_SESSION = 16
const MAX_PENDING_TOTAL = 128
const MAX_ANSWER_STR_LEN = 32_000
const MAX_ANSWER_ARRAY_LEN = 200
const MAX_ANSWER_KEYS = 200
let fallbackAskSeq = 0

function getValueAtPointer(root: unknown, pointer: string): unknown {
  const norm = normalizePointerPath(pointer)
  if (norm === '/') return root
  const parts = norm.slice(1).split('/')
  let cur: unknown = root
  for (const rawSeg of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    const seg = rawSeg.replace(/~1/g, '/').replace(/~0/g, '~')
    if (Array.isArray(cur)) {
      const idx = Number(seg)
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) return undefined
      cur = cur[idx]
    } else {
      const rec = cur as Record<string, unknown>
      if (!Object.hasOwn(rec, seg)) return undefined
      cur = rec[seg]
    }
  }
  return cur
}

export function collectObscuredContextPointersFromMessages(
  messages: readonly AgentToRendererMessage[],
  obscuredPointers: ReadonlySet<string>,
  priorComponents?: readonly Record<string, unknown>[],
): Set<string> {
  const out = new Set<string>(obscuredPointers)
  if (obscuredPointers.size === 0) return out
  const allComponents: Record<string, unknown>[] = priorComponents ? [...priorComponents] : []
  const collectList = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const item of list) {
      if (typeof item === 'object' && item !== null) {
        allComponents.push(item as Record<string, unknown>)
      }
    }
  }
  for (const msg of messages) {
    const rec = msg as unknown as Record<string, unknown>
    if (rec.createSurface && typeof rec.createSurface === 'object') {
      collectList((rec.createSurface as Record<string, unknown>).components)
    }
    if (rec.updateComponents && typeof rec.updateComponents === 'object') {
      collectList((rec.updateComponents as Record<string, unknown>).components)
    }
  }
  const templatePathByCompId = buildTemplatePathMap(allComponents)
  const inspectContext = (
    ctx: unknown,
    prefix: string,
    depth: number,
    templatePrefixes?: ReadonlySet<string>,
  ) => {
    if (depth > 8 || typeof ctx !== 'object' || ctx === null || Array.isArray(ctx)) return
    for (const [k, v] of Object.entries(ctx as Record<string, unknown>)) {
      const seg = escapeJsonPointerSegment(k)
      const nextPath = prefix === '' ? `/${seg}` : `${prefix}/${seg}`
      if (isBindingExpression(v)) {
        if (referencesObscuredPointer(v, obscuredPointers, 0, templatePrefixes)) {
          out.add(nextPath)
        }
      } else if (Array.isArray(v)) {
        if (referencesObscuredPointer(v, obscuredPointers, 0, templatePrefixes)) {
          out.add(nextPath)
        }
      } else if (typeof v === 'object' && v !== null) {
        inspectContext(v, nextPath, depth + 1, templatePrefixes)
      }
    }
  }
  const inspectAction = (action: unknown, templatePrefixes?: ReadonlySet<string>) => {
    if (typeof action !== 'object' || action === null) return
    const event = (action as Record<string, unknown>).event
    if (typeof event !== 'object' || event === null) return
    inspectContext((event as Record<string, unknown>).context, '', 0, templatePrefixes)
  }
  for (const rec of allComponents) {
    const id = typeof rec.id === 'string' ? rec.id : ''
    const templatePrefixes = id !== '' ? templatePathByCompId.get(id) : undefined
    inspectAction(rec.action, templatePrefixes)
    inspectAction(rec.approveAction, templatePrefixes)
    inspectAction(rec.rejectAction, templatePrefixes)
  }
  return out
}

function collectKvEditorPointersFromMessages(
  messages: readonly AgentToRendererMessage[],
): Set<string> {
  const kvPointers = new Set<string>()
  const inspectComponents = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue
      const rec = item as Record<string, unknown>
      if (rec.component !== 'KvEditor') continue
      const p = extractBindingPointer(rec.items)
      if (p !== null) kvPointers.add(p)
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
  return kvPointers
}

export function collectObscuredPointersFromMessages(
  messages: readonly AgentToRendererMessage[],
  extraKvPointers?: ReadonlySet<string>,
): Set<string> {
  const obscured = new Set<string>()
  const kvPointers = collectKvEditorPointersFromMessages(messages)
  if (extraKvPointers) {
    for (const ptr of extraKvPointers) kvPointers.add(ptr)
  }
  const allComponents: Record<string, unknown>[] = []
  const collectComponents = (list: unknown) => {
    if (!Array.isArray(list)) return
    for (const item of list) {
      if (typeof item === 'object' && item !== null) {
        allComponents.push(item as Record<string, unknown>)
      }
    }
  }
  const inspectDataModel = (dmPath: string, dmValue: unknown) => {
    for (const kvPtr of kvPointers) {
      const normKv = normalizePointerPath(kvPtr)
      if (dmPath === normKv) {
        collectKvSecretsFromValue(dmValue, normKv, obscured, new Set(), new Set())
      } else if (dmPath === '/') {
        const val = getValueAtPointer(dmValue, normKv)
        if (val !== undefined) {
          collectKvSecretsFromValue(val, normKv, obscured, new Set(), new Set())
        }
      } else if (normKv.startsWith(`${dmPath}/`)) {
        const suffix = normKv.slice(dmPath.length)
        const val = getValueAtPointer(dmValue, suffix)
        if (val !== undefined) {
          collectKvSecretsFromValue(val, normKv, obscured, new Set(), new Set())
        }
      } else if (normKv === '/' ? dmPath !== '/' : dmPath.startsWith(`${normKv}/`)) {
        const relStart = normKv === '/' ? 1 : normKv.length + 1
        const relParts = dmPath.slice(relStart).split('/')
        const firstSeg = relParts[0]?.replace(/~1/g, '/').replace(/~0/g, '~') ?? ''
        if (firstSeg !== '' && isSecretKey(firstSeg)) {
          obscured.add(dmPath)
        } else if (
          typeof dmValue === 'object' &&
          dmValue !== null &&
          !Array.isArray(dmValue) &&
          relParts.length === 1
        ) {
          const rec = dmValue as Record<string, unknown>
          const k =
            typeof rec.key === 'string' ? rec.key : typeof rec.name === 'string' ? rec.name : ''
          if (k !== '' && isSecretKey(k)) {
            obscured.add(`${dmPath}/value`)
          }
        }
      }
    }
  }
  for (const msg of messages) {
    const rec = msg as unknown as Record<string, unknown>
    if (rec.createSurface && typeof rec.createSurface === 'object') {
      const cs = rec.createSurface as Record<string, unknown>
      collectComponents(cs.components)
      if (kvPointers.size > 0 && cs.dataModel !== undefined) {
        inspectDataModel('/', cs.dataModel)
      }
    }
    if (rec.updateComponents && typeof rec.updateComponents === 'object') {
      collectComponents((rec.updateComponents as Record<string, unknown>).components)
    }
    if (kvPointers.size > 0 && rec.updateDataModel && typeof rec.updateDataModel === 'object') {
      const dm = rec.updateDataModel as { path?: unknown; value?: unknown }
      const dmPath = normalizePointerPath(typeof dm.path === 'string' ? dm.path : '/')
      inspectDataModel(dmPath, dm.value)
    }
  }
  resolveTemplateObscuredPointers(allComponents, obscured)
  return obscured
}

export function sanitizePayloadObject(
  value: unknown,
  obscuredPointers?: ReadonlySet<string>,
  stripPerSurfaceRoot = false,
  blockedExact?: ReadonlySet<string>,
  blockedSubstrings?: ReadonlySet<string>,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const blocked = obscuredPointers ?? new Set<string>()
  const exactSet = blockedExact ?? new Set<string>()
  const subSet = blockedSubstrings ?? new Set<string>()
  const clean = (
    node: unknown,
    path: string,
    depth: number,
    isSurfaceRootLevel: boolean,
  ): unknown => {
    if (depth > 8) return undefined
    if (blocked.size > 0 && path !== '' && isPointerObscured(path, blocked)) return undefined
    if (typeof node === 'string') {
      const scrubbed =
        exactSet.size === 0 && subSet.size === 0 ? node : scrubSecretString(node, exactSet, subSet)
      if (scrubbed === undefined) return undefined
      return scrubbed.length > MAX_ANSWER_STR_LEN ? scrubbed.slice(0, MAX_ANSWER_STR_LEN) : scrubbed
    }
    if (typeof node === 'number' && isScrubbableNumericSecret(node, exactSet)) {
      return undefined
    }
    if (Array.isArray(node)) {
      const out: unknown[] = []
      const limit = Math.min(node.length, MAX_ANSWER_ARRAY_LEN)
      for (let i = 0; i < limit; i++) {
        const childPath = path === '' ? `/${i}` : `${path}/${i}`
        const next = clean(node[i], childPath, depth + 1, false)
        if (next !== undefined) out.push(next)
      }
      return out
    }
    if (typeof node === 'object' && node !== null) {
      const rec = node as Record<string, unknown>
      const isKvSecretEntry =
        !isSurfaceRootLevel &&
        ((typeof rec.key === 'string' && isSecretKey(rec.key)) ||
          (typeof rec.name === 'string' && isSecretKey(rec.name)))
      const out: Record<string, unknown> = {}
      let count = 0
      for (const [k, v] of Object.entries(rec)) {
        if (count >= MAX_ANSWER_KEYS) break
        if (isDangerousObjectKey(k)) continue
        if (isSurfaceRootLevel) {
          if (typeof v !== 'object' || v === null || Array.isArray(v)) continue
        } else if (isSecretKey(k)) {
          continue
        }
        if (isKvSecretEntry && k === 'value') continue
        const seg = escapeJsonPointerSegment(k)
        const childPath = isSurfaceRootLevel ? '' : path === '' ? `/${seg}` : `${path}/${seg}`
        if (blocked.size > 0 && childPath !== '' && isPointerObscured(childPath, blocked)) continue
        const next = clean(v, childPath, isSurfaceRootLevel ? depth : depth + 1, false)
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
  return (clean(value, '', 0, stripPerSurfaceRoot) as Record<string, unknown>) ?? {}
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
  private readonly entriesBySession = new Map<string, Map<string, PendingEntry>>()
  private disposed = false

  private totalPendingCount(): number {
    let total = 0
    for (const sessionMap of this.entriesBySession.values()) {
      total += sessionMap.size
    }
    return total
  }

  private removeEntry(sessionId: string, callId: string, expected?: PendingEntry): void {
    const sessionMap = this.entriesBySession.get(sessionId)
    if (!sessionMap) return
    if (expected !== undefined && sessionMap.get(callId) !== expected) return
    sessionMap.delete(callId)
    if (sessionMap.size === 0) {
      this.entriesBySession.delete(sessionId)
    }
  }

  hasPending(sessionId: string, callId?: string): boolean {
    const sessionMap = this.entriesBySession.get(sessionId)
    if (!sessionMap || sessionMap.size === 0) return false
    if (callId !== undefined && callId !== '') {
      return sessionMap.has(callId)
    }
    return true
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
    if (this.disposed) {
      return Promise.reject(new Error('dsh-genui-a2ui plugin disposed'))
    }
    if (signal?.aborted) {
      const reason = signal.reason
      return Promise.reject(reason instanceof Error ? reason : new Error('a2ui_ask aborted'))
    }

    const effectiveTimeout =
      timeoutSeconds === -1
        ? -1
        : Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
          ? Math.min(timeoutSeconds, MAX_TIMEOUT_SECONDS)
          : DEFAULT_ASK_TIMEOUT_SECONDS

    let sessionMap = this.entriesBySession.get(sessionId)
    if (!sessionMap) {
      sessionMap = new Map<string, PendingEntry>()
      this.entriesBySession.set(sessionId, sessionMap)
    }
    const existing = sessionMap.get(callId)
    if (existing !== undefined) {
      existing.reject(new Error(`a2ui_ask "${callId}" superseded by a newer call`))
      sessionMap = this.entriesBySession.get(sessionId)
      if (!sessionMap) {
        sessionMap = new Map<string, PendingEntry>()
        this.entriesBySession.set(sessionId, sessionMap)
      }
    }
    if (
      sessionMap.size >= MAX_PENDING_PER_SESSION ||
      this.totalPendingCount() >= MAX_PENDING_TOTAL
    ) {
      if (sessionMap.size === 0) this.entriesBySession.delete(sessionId)
      return Promise.reject(new Error('Too many concurrent pending a2ui_ask requests'))
    }

    return new Promise<AskSettlement>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      let entryRef: PendingEntry | undefined
      const onAbort = () => {
        cleanup()
        this.removeEntry(sessionId, callId, entryRef)
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

      if (effectiveTimeout !== -1) {
        timer = setTimeout(() => {
          cleanup()
          this.removeEntry(sessionId, callId, entryRef)
          resolve({ status: 'timed_out' })
        }, effectiveTimeout * 1000)
      }

      signal?.addEventListener('abort', onAbort, { once: true })

      const entry: PendingEntry = {
        sessionId,
        callId,
        defaultSurfaceId,
        obscuredPointers: obscuredPointers ?? new Set<string>(),
        obscuredContextPointers: obscuredContextPointers ?? obscuredPointers ?? new Set<string>(),
        resolve: (settlement) => {
          cleanup()
          this.removeEntry(sessionId, callId, entry)
          resolve(settlement)
        },
        reject: (err) => {
          cleanup()
          this.removeEntry(sessionId, callId, entry)
          reject(err)
        },
        cleanup,
      }
      entryRef = entry
      sessionMap.set(callId, entry)
    })
  }

  settle(sessionId: string, input: AskAnswerInput): boolean {
    const sessionMap = this.entriesBySession.get(sessionId)
    if (!sessionMap || sessionMap.size === 0) return false
    const callIdProvided =
      input.callId !== undefined && input.callId !== null && input.callId !== ''
    let target: PendingEntry | undefined
    if (callIdProvided) {
      if (typeof input.callId === 'string' && input.callId.trim() !== '') {
        target = sessionMap.get(input.callId.trim())
      }
    } else if (sessionMap.size === 1) {
      target = sessionMap.values().next().value
    }
    if (target === undefined) return false

    if (input.skipped === true) {
      target.resolve({ status: 'skipped' })
      return true
    }

    const trimCap = (val: unknown, max: number): string =>
      typeof val === 'string' ? val.trim().slice(0, max) : ''
    const blockedExact = new Set<string>()
    const blockedSubstrings = new Set<string>()
    collectSecretsFromNode(
      input.dataModels,
      target.obscuredPointers,
      blockedExact,
      blockedSubstrings,
      true,
    )
    collectSecretsFromNode(
      input.context,
      target.obscuredContextPointers,
      blockedExact,
      blockedSubstrings,
      false,
    )
    const rawUserMessage = trimCap(input.userMessage, 4_000)
    const scrubbedUserMessage =
      rawUserMessage !== ''
        ? (scrubSecretString(rawUserMessage, blockedExact, blockedSubstrings) ?? '')
        : ''

    target.resolve({
      status: 'answered',
      action: trimCap(input.action, 256) || 'submit',
      surfaceId: trimCap(input.surfaceId, 256) || target.defaultSurfaceId,
      sourceComponentId: trimCap(input.sourceComponentId, 256),
      ...(scrubbedUserMessage !== '' ? { userMessage: scrubbedUserMessage } : {}),
      context: sanitizePayloadObject(
        input.context,
        target.obscuredContextPointers,
        false,
        blockedExact,
        blockedSubstrings,
      ),
      dataModels: sanitizePayloadObject(
        input.dataModels,
        target.obscuredPointers,
        true,
        blockedExact,
        blockedSubstrings,
      ),
    })
    return true
  }

  forgetSession(sessionId: string): void {
    const sessionMap = this.entriesBySession.get(sessionId)
    if (!sessionMap) return
    const entries = [...sessionMap.values()]
    this.entriesBySession.delete(sessionId)
    for (const entry of entries) {
      entry.cleanup()
      entry.reject(new Error(`session "${sessionId}" disposed`))
    }
  }

  disposeAll(): void {
    this.disposed = true
    const allEntries: PendingEntry[] = []
    for (const sessionMap of this.entriesBySession.values()) {
      for (const entry of sessionMap.values()) allEntries.push(entry)
    }
    this.entriesBySession.clear()
    for (const entry of allEntries) {
      entry.cleanup()
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
    title: z.unknown().optional(),
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
        ? parsed.data.title.trim().slice(0, MAX_TITLE_LEN)
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
      if (exec?.signal?.aborted) {
        const reason = exec.signal.reason
        throw reason instanceof Error ? reason : new Error('a2ui_ask aborted')
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
        const fails = sessions.recordCompileFailure(sid, 'ask')
        if (fails > A2UI_LIMITS.maxRepairsPerTurn) {
          sessions.clearCompileFailures(sid, 'ask')
          throw new Error(
            `a2ui_ask: the program produced no UI messages (is \`root\` assigned?).\nRepair limit (${A2UI_LIMITS.maxRepairsPerTurn}) reached for this turn. STOP calling a2ui_ask and ask the user concisely in plain text.`,
          )
        }
        throw new Error(
          `a2ui_ask: the program produced no UI messages (is \`root\` assigned?). Fix it and retry (${fails}/${A2UI_LIMITS.maxRepairsPerTurn}).`,
        )
      }

      sessions.clearCompileFailures(sid, 'ask')
      const surfaceIds = surfaceIdsOf(messages)
      const sessionRedaction = sessions.getSessionRedactionState(sid, surfaceIds)
      const obscuredPointers = collectObscuredPointersFromMessages(
        messages,
        sessionRedaction.kvPointers,
      )
      for (const p of sessionRedaction.obscuredPointers) obscuredPointers.add(p)
      const obscuredContextPointers = collectObscuredContextPointersFromMessages(
        messages,
        obscuredPointers,
        sessionRedaction.components,
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
