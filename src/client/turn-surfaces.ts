/**
 * Official `uiConversation` projection for settled `a2ui_render` calls.
 *
 * Mirrors the architecture of `@deepseek-ai/dsh-client-ui-plan`: each settled
 * `a2ui_render` tool result produces a `visibility: "hidden"` Chat Node of kind
 * `a2ui-surface` anchored at its `seq` and `location`. That gives:
 * - replay/refresh/fork safety with zero custom side-stores;
 * - cross-turn `surface("id", update=true)` continuity across `answer`, `inline`,
 *   and `dock` placements;
 * - automatic `superseded: true` detection for historical turn cards whose
 *   surfaces were updated in a later turn (preventing stale re-submissions);
 * - reactive `resolveDockBatch` for the persistent `conversation.input.dock` panel.
 */
import type { AgentToRendererMessage } from '@a2ui/agent'
import { ASK_TOOL, normalizePlacement, RENDER_TOOL, type SurfacePlacement } from '../shared/constants.ts'
import type { AskMeta, RenderMeta } from '../shared/wire-types.ts'

export const A2UI_SURFACE_NODE_KIND = 'a2ui-surface'

export interface SettledA2uiCall {
  readonly callId: string
  readonly turn: number
  readonly seq: number
  readonly title: string | null
  readonly placement: SurfacePlacement
  readonly surfaceIds: readonly string[]
  readonly messages: readonly AgentToRendererMessage[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractSurfaceIds(messages: readonly AgentToRendererMessage[]): string[] {
  const ids = new Set<string>()
  for (const msg of messages) {
    if (!isRecord(msg)) continue
    for (const val of Object.values(msg)) {
      if (isRecord(val) && typeof val.surfaceId === 'string') {
        ids.add(val.surfaceId)
      }
    }
  }
  return [...ids]
}

/** Validate and normalize `presentationMeta` from an `a2ui_render` `tool/result`. */
export function parseRenderMeta(meta: unknown): RenderMeta | null {
  if (!isRecord(meta)) return null
  if (meta.kind !== undefined && meta.kind !== 'dsh-a2ui') return null
  if (meta.version !== 1 || !Array.isArray(meta.messages) || meta.messages.length === 0) return null
  const messages = meta.messages as AgentToRendererMessage[]
  const title = typeof meta.title === 'string' && meta.title.trim() !== '' ? meta.title.trim() : null
  const placement = normalizePlacement(meta.placement)
  const surfaceIds = Array.isArray(meta.surfaceIds)
    ? meta.surfaceIds.filter((s): s is string => typeof s === 'string')
    : extractSurfaceIds(messages)
  return {
    kind: 'dsh-a2ui',
    version: 1,
    title,
    placement,
    surfaceIds,
    messages,
  }
}

/** Validate and normalize `presentationMeta` from an `a2ui_ask` `tool/result`. */
export function parseAskMeta(meta: unknown): AskMeta | null {
  if (!isRecord(meta) || meta.kind !== 'dsh-a2ui-ask' || meta.version !== 1) return null
  if (!Array.isArray(meta.messages) || meta.messages.length === 0) return null
  const status = meta.status
  if (status !== 'answered' && status !== 'skipped' && status !== 'timed_out') return null
  const messages = meta.messages as AgentToRendererMessage[]
  return {
    kind: 'dsh-a2ui-ask',
    version: 1,
    status,
    callId: typeof meta.callId === 'string' ? meta.callId : '',
    title: typeof meta.title === 'string' && meta.title.trim() !== '' ? meta.title.trim() : null,
    action: typeof meta.action === 'string' ? meta.action : null,
    userMessage: typeof meta.userMessage === 'string' ? meta.userMessage : null,
    context: isRecord(meta.context) ? meta.context : null,
    surfaceIds: Array.isArray(meta.surfaceIds)
      ? meta.surfaceIds.filter((s): s is string => typeof s === 'string')
      : extractSurfaceIds(messages),
    messages,
  }
}

interface ConversationEvent {
  readonly type: string
  readonly seq: number
  readonly surfaceOp?: string
  readonly data?: Record<string, unknown>
}

interface EventMatch {
  readonly event: ConversationEvent
  readonly location: {
    readonly kind?: string
    readonly turn?: { readonly turn?: number; readonly status?: string }
  }
}

interface NodeContext {
  readonly key: string
  readonly id: string
  readonly start?: EventMatch
  readonly matches: readonly EventMatch[]
  readonly state?: {
    readonly isRenderTool: boolean
    readonly settled?: SettledA2uiCall
  }
}

function turnNumberOf(match: EventMatch | undefined): number {
  const fromLoc = match?.location?.turn?.turn
  if (typeof fromLoc === 'number') return fromLoc
  const fromData = match?.event.data?.turn
  return typeof fromData === 'number' ? fromData : 0
}

function extractSettledFromResult(match: EventMatch, requireExplicitKind: boolean): SettledA2uiCall | undefined {
  const event = match.event
  if (event.type !== 'tool/result') return undefined
  if (event.surfaceOp !== undefined && event.surfaceOp !== 'append') return undefined
  const data = event.data
  if (!isRecord(data)) return undefined
  const message = data.message
  if (!isRecord(message) || message.isError === true) return undefined
  const source = message.source
  const callId = isRecord(source) && typeof source.callId === 'string' ? source.callId : ''
  if (callId === '') return undefined
  if (requireExplicitKind && (!isRecord(data.meta) || data.meta.kind !== 'dsh-a2ui')) return undefined
  const meta = parseRenderMeta(data.meta)
  if (meta === null) return undefined
  return {
    callId,
    turn: turnNumberOf(match),
    seq: event.seq,
    title: meta.title,
    placement: meta.placement,
    surfaceIds: meta.surfaceIds,
    messages: meta.messages,
  }
}

/** Definition registered with `ctx.uiConversation.events.register(...)`. */
export const a2uiSurfaceNodeDefinition = {
  kind: A2UI_SURFACE_NODE_KIND,
  target: 'chat',
  match: (event: ConversationEvent) => {
    const data = event.data
    if (!isRecord(data)) return null
    if (event.type === 'tool/call' && data.name === RENDER_TOOL && typeof data.callId === 'string' && data.callId !== '') {
      return { id: data.callId, role: 'start' as const }
    }
    if (event.type === 'tool/result') {
      const msg = data.message
      const source = isRecord(msg) ? msg.source : undefined
      const callId = isRecord(source) && typeof source.callId === 'string' ? source.callId : ''
      if (callId === '') return null
      if (isRecord(data.meta) && data.meta.kind === 'dsh-a2ui') {
        return { id: callId, role: 'start' as const }
      }
      return { id: callId, role: 'update' as const }
    }
    return null
  },
  start: (_ctx: unknown, match: EventMatch) => {
    if (match.event.type === 'tool/call') {
      return { isRenderTool: true }
    }
    const settled = extractSettledFromResult(match, true)
    return settled !== undefined ? { isRenderTool: true, settled } : { isRenderTool: false }
  },
  update: (ctx: NodeContext, match: EventMatch) => {
    const prev = ctx.state ?? { isRenderTool: false }
    if (!prev.isRenderTool) {
      const standalone = extractSettledFromResult(match, true)
      return standalone !== undefined ? { isRenderTool: true, settled: standalone } : prev
    }
    const settled = extractSettledFromResult(match, false)
    return settled !== undefined ? { ...prev, settled } : prev
  },
  buildViewNode: (ctx: NodeContext) => {
    const settled = ctx.state?.settled
    const anchorMatch = ctx.start ?? ctx.matches[0]
    if (settled === undefined || anchorMatch === undefined) return null
    return {
      key: ctx.key,
      kind: A2UI_SURFACE_NODE_KIND,
      id: ctx.id,
      target: 'chat',
      anchorSeq: settled.seq,
      location: anchorMatch.location,
      visibility: 'hidden' as const,
      data: settled,
    }
  },
}

/** Minimal shape of DSH's Chat target snapshot we inspect. */
export interface ChatTargetSnapshot {
  readonly nodes: {
    values(): readonly {
      readonly kind: string
      readonly id?: string
      readonly anchorSeq: number
      readonly location?: { readonly turn?: { readonly turn?: number; readonly status?: string } }
      readonly data: unknown
    }[]
  }
}

/** Whether the turn owning a given `callId` has already closed (`turn/end` arrived). */
export function isTurnClosedForCall(snapshot: ChatTargetSnapshot | undefined, callId: string): boolean {
  if (snapshot === undefined) return false
  for (const node of snapshot.nodes.values()) {
    if ((node.kind === 'tool-call' || node.kind === A2UI_SURFACE_NODE_KIND) && node.id === callId) {
      return node.location?.turn?.status === 'closed'
    }
  }
  return false
}

const orderedCallsCache = new WeakMap<ChatTargetSnapshot, readonly SettledA2uiCall[]>()

function collectOrderedCalls(snapshot: ChatTargetSnapshot | undefined): readonly SettledA2uiCall[] {
  if (snapshot === undefined) return []
  const cached = orderedCallsCache.get(snapshot)
  if (cached !== undefined) return cached
  const calls: SettledA2uiCall[] = []
  for (const node of snapshot.nodes.values()) {
    if (node.kind !== A2UI_SURFACE_NODE_KIND) continue
    const data = node.data as SettledA2uiCall | undefined
    if (data !== undefined) {
      calls.push({
        ...data,
        placement: data.placement ?? 'answer',
      })
    }
  }
  calls.sort((a, b) => a.seq - b.seq)
  orderedCallsCache.set(snapshot, calls)
  return calls
}

/** Retain only A2UI wire messages targeting a surface ID in `allowedIds`. */
export function filterMessagesBySurfaceIds(
  messages: readonly AgentToRendererMessage[],
  allowedIds: ReadonlySet<string>,
): AgentToRendererMessage[] {
  if (allowedIds.size === 0) return []
  const out: AgentToRendererMessage[] = []
  for (const msg of messages) {
    if (!isRecord(msg)) continue
    let keep = false
    for (const val of Object.values(msg)) {
      if (isRecord(val) && typeof val.surfaceId === 'string' && allowedIds.has(val.surfaceId)) {
        keep = true
        break
      }
    }
    if (keep) out.push(msg)
  }
  return out
}

/** All settled A2UI wire messages in the session in ascending sequence order. */
export function resolveSessionMessages(snapshot: ChatTargetSnapshot | undefined): AgentToRendererMessage[] {
  return collectOrderedCalls(snapshot).flatMap((c) => c.messages)
}

export interface TurnTailBatch {
  readonly title: string | null
  readonly visibleSurfaceIds: ReadonlySet<string>
  readonly messages: readonly AgentToRendererMessage[]
  readonly latestSeq: number
  /** True when every visible surface in this turn has been updated/replaced in a later turn. */
  readonly superseded: boolean
}

const turnTailMemo = new Map<string, { sig: string; batch: TurnTailBatch }>()
const MAX_TURN_TAIL_MEMO = 256

/**
 * Compute the post-answer (`placement === 'answer'`) A2UI surface batch for `turnNumber`.
 *
 * - Replays only prior messages targeting `visibleSurfaceIds` (`turn <= turnNumber`) so
 *   `update=true` works across turns while avoiding O(T^2) hidden SurfaceModel accumulation.
 * - Memoizes batch references by structural signature so later streaming text tokens
 *   trigger 0 re-renders on settled historical cards.
 */
export function resolveTurnTailBatch(
  snapshot: ChatTargetSnapshot | undefined,
  turnNumber: number,
): TurnTailBatch | null {
  const allCalls = collectOrderedCalls(snapshot)
  if (allCalls.length === 0) return null

  const upToTurn: SettledA2uiCall[] = []
  const inThisTurnAnswer: SettledA2uiCall[] = []
  const laterUpdatedIds = new Set<string>()
  const dockedIdsUpToTurn = new Set<string>()

  for (const call of allCalls) {
    if (call.turn <= turnNumber) {
      upToTurn.push(call)
      if (call.placement === 'dock') {
        for (const id of call.surfaceIds) dockedIdsUpToTurn.add(id)
      }
      if (call.turn === turnNumber && call.placement === 'answer') {
        inThisTurnAnswer.push(call)
      }
    } else {
      for (const id of call.surfaceIds) laterUpdatedIds.add(id)
    }
  }

  if (inThisTurnAnswer.length === 0) return null

  const visibleSurfaceIds = new Set<string>()
  let lastTitle: string | null = null
  let latestSeq = 0
  for (const call of inThisTurnAnswer) {
    if (call.title !== null) lastTitle = call.title
    if (call.seq > latestSeq) latestSeq = call.seq
    for (const id of call.surfaceIds) {
      if (!dockedIdsUpToTurn.has(id)) {
        visibleSurfaceIds.add(id)
      }
    }
  }

  if (visibleSurfaceIds.size === 0) return null

  let superseded = true
  for (const id of visibleSurfaceIds) {
    if (!laterUpdatedIds.has(id)) {
      superseded = false
      break
    }
  }

  const messages = filterMessagesBySurfaceIds(
    upToTurn.flatMap((call) => call.messages),
    visibleSurfaceIds,
  )

  const firstCallId = inThisTurnAnswer[0]?.callId ?? String(turnNumber)
  const memoKey = `${firstCallId}::${turnNumber}`
  const sig = `${latestSeq}|${superseded ? 1 : 0}|${messages.length}|${[...visibleSurfaceIds].join(',')}|${lastTitle ?? ''}`
  const prev = turnTailMemo.get(memoKey)
  if (prev !== undefined && prev.sig === sig) {
    return prev.batch
  }

  const batch: TurnTailBatch = { title: lastTitle, visibleSurfaceIds, messages, latestSeq, superseded }
  if (turnTailMemo.size >= MAX_TURN_TAIL_MEMO) {
    const oldest = turnTailMemo.keys().next().value
    if (oldest !== undefined) turnTailMemo.delete(oldest)
  }
  turnTailMemo.set(memoKey, { sig, batch })
  return batch
}

export interface DockBatch {
  readonly title: string | null
  readonly visibleSurfaceIds: ReadonlySet<string>
  readonly messages: readonly AgentToRendererMessage[]
  readonly latestSeq: number
}

let lastDockMemo: { sig: string; batch: DockBatch } | null = null

/**
 * Compute the persistent workspace dock batch (`placement === 'dock'`) across
 * the entire session. Later `update=true` calls targeting a docked surface ID
 * update the docked surface in place and advance `latestSeq`.
 */
export function resolveDockBatch(snapshot: ChatTargetSnapshot | undefined): DockBatch | null {
  const allCalls = collectOrderedCalls(snapshot)
  if (allCalls.length === 0) return null

  const dockedIds = new Set<string>()
  let lastTitle: string | null = null
  let latestSeq = 0

  for (const call of allCalls) {
    const touchesDock =
      call.placement === 'dock' || call.surfaceIds.some((id) => dockedIds.has(id))
    if (!touchesDock) continue

    if (call.placement === 'dock') {
      for (const id of call.surfaceIds) dockedIds.add(id)
    }
    if (call.title !== null) lastTitle = call.title
    if (call.seq > latestSeq) latestSeq = call.seq
  }

  if (dockedIds.size === 0) return null

  const messages = filterMessagesBySurfaceIds(
    allCalls.flatMap((call) => call.messages),
    dockedIds,
  )
  const sig = `${allCalls[0]?.callId ?? ''}::${latestSeq}|${messages.length}|${[...dockedIds].join(',')}|${lastTitle ?? ''}`
  if (lastDockMemo !== null && lastDockMemo.sig === sig) {
    return lastDockMemo.batch
  }
  const batch: DockBatch = {
    title: lastTitle,
    visibleSurfaceIds: dockedIds,
    messages,
    latestSeq,
  }
  lastDockMemo = { sig, batch }
  return batch
}

/** Detect the latest settled `/a2ui` slash-command outcome in the chat stream for UI pill sync. */
export function resolveLatestA2uiCommandState(
  snapshot: ChatTargetSnapshot | undefined,
): { readonly seq: number; readonly enabled: boolean } | null {
  if (snapshot === undefined) return null
  let latest: { seq: number; enabled: boolean } | null = null
  for (const node of snapshot.nodes.values()) {
    if (node.kind !== 'command') continue
    const data = node.data as
      | {
          readonly name?: unknown
          readonly seq?: unknown
          readonly outcome?: { readonly kind?: unknown; readonly text?: unknown } | null
        }
      | undefined
    if (!data || data.name !== 'a2ui') continue
    if (data.outcome?.kind !== 'success' || typeof data.outcome.text !== 'string') continue
    const text = data.outcome.text
    const enabled = text.includes('已开启') ? true : text.includes('已关闭') ? false : null
    if (enabled === null) continue
    const seq = typeof data.seq === 'number' ? data.seq : node.anchorSeq
    if (latest === null || seq >= latest.seq) {
      latest = { seq, enabled }
    }
  }
  return latest
}

export interface ActiveAskCall {
  readonly callId: string
  readonly phase: 'preparing' | 'start'
  readonly title: string | undefined
  readonly ui: string
}

interface RawToolCallRoot {
  readonly kind?: string
  readonly phase?: string
  readonly callId?: unknown
  readonly name?: unknown
  readonly interrupted?: boolean
  readonly args?: {
    text?(field: string): string | undefined
  }
}

/**
 * Resolve an in-flight `a2ui_ask` tool call (`preparing` or `start`) from the
 * live Chat target snapshot so it can pop open above the composer (`conversation.input.dock`),
 * remaining visible even when DSH's `stepGrouping: "collapsed"` hides the process group.
 */
export function resolveActiveAskCall(snapshot: ChatTargetSnapshot | undefined): ActiveAskCall | null {
  if (snapshot === undefined) return null
  let latest: { seq: number; ask: ActiveAskCall } | null = null
  for (const node of snapshot.nodes.values()) {
    if (node.kind !== 'tool-call') continue
    if (node.location?.turn?.status === 'closed') continue
    const data = node.data as { readonly root?: RawToolCallRoot } | undefined
    const root = data?.root
    if (!root || 'kind' in root) continue
    if (root.name !== ASK_TOOL || root.interrupted === true) continue
    if (root.phase !== 'preparing' && root.phase !== 'start') continue
    const callId = typeof root.callId === 'string' && root.callId !== '' ? root.callId : ''
    if (callId === '') continue
    const rawTitle = root.args?.text?.('title')?.trim()
    const ui = root.args?.text?.('ui') ?? ''
    const ask: ActiveAskCall = {
      callId,
      phase: root.phase,
      title: rawTitle && rawTitle !== '' ? rawTitle : undefined,
      ui,
    }
    if (latest === null || node.anchorSeq >= latest.seq) {
      latest = { seq: node.anchorSeq, ask }
    }
  }
  return latest?.ask ?? null
}
