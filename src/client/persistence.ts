import { isDangerousObjectKey, isSecretKey } from '../shared/constants.ts'
import {
  collectSecretsFromNode,
  escapeJsonPointerSegment,
  isPointerObscured,
  isPointerObscuredOrParent,
  isScrubbableNumericSecret,
  normalizePointerPath,
  scrubSecretString,
} from '../shared/redaction.ts'
import { notifySubscribers } from './notify.ts'

export {
  escapeJsonPointerSegment,
  isPointerObscured,
  isPointerObscuredOrParent,
  normalizePointerPath,
}

export const DRAFTS_STORAGE_KEY = 'dsh-a2ui:drafts:v1'
export const DOCK_STORAGE_KEY = 'dsh-a2ui:dock:v1'
export const ENABLED_STORAGE_KEY = 'dsh-a2ui:tier:v1'
export const MAX_DRAFT_ENTRIES = 200
const MAX_SINGLE_DRAFT_CHARS = 32_768
const MAX_TOTAL_DRAFT_CHARS = 512_000

function touchLruMap<V>(map: Map<string, V>, key: string, value: V, maxEntries: number): void {
  map.delete(key)
  map.set(key, value)
  while (map.size > maxEntries) {
    const oldest = map.keys().next()
    if (oldest.done) break
    map.delete(oldest.value)
  }
}

interface DraftEntry {
  readonly key: string
  readonly updatedAt: number
  readonly data: Record<string, unknown>
}

interface DockUiEntry {
  readonly collapsed: boolean
  readonly dismissedSeq: number
}

interface EnabledStoreShape {
  defaultEnabled: boolean
  bySession: Record<string, boolean>
  sessionOrder?: string[]
}

interface SharedPersistenceState {
  memoryFallback: Map<string, string>
  memoryPreferredKeys: Set<string>
  warnedStorageKeys: Set<string>
  cachedDraftsRaw: string | null | undefined
  cachedDraftsList: DraftEntry[]
  dockListeners: Set<() => void>
  cachedDockRaw: string | null | undefined
  cachedDockMap: Map<string, DockUiEntry>
  enabledListeners: Set<() => void>
  lastAppliedCommandSeqBySession: Map<string, number>
  fallbackDefaultEnabled: boolean
  cachedEnabledRaw: string | null | undefined
  cachedEnabledStore: EnabledStoreShape
  cachedEnabledOrder: Map<string, boolean>
  enabledRevision: number
  commandNoticeListeners: Set<() => void>
  commandNoticesBySession: Map<string, A2uiCommandNotice>
  commandNoticeTimersBySession: Map<string, ReturnType<typeof setTimeout>>
  nextCommandNoticeSeq: number
}

const PERSISTENCE_GLOBAL_KEY = '__dshA2uiPersistence__'

function getSharedState(): SharedPersistenceState {
  const g = globalThis as Record<string, unknown>
  const existing = g[PERSISTENCE_GLOBAL_KEY] as SharedPersistenceState | undefined
  if (existing) return existing
  const created: SharedPersistenceState = {
    memoryFallback: new Map(),
    memoryPreferredKeys: new Set(),
    warnedStorageKeys: new Set(),
    cachedDraftsRaw: undefined,
    cachedDraftsList: [],
    dockListeners: new Set(),
    cachedDockRaw: undefined,
    cachedDockMap: new Map(),
    enabledListeners: new Set(),
    lastAppliedCommandSeqBySession: new Map(),
    fallbackDefaultEnabled: true,
    cachedEnabledRaw: undefined,
    cachedEnabledStore: { defaultEnabled: true, bySession: {} },
    cachedEnabledOrder: new Map(),
    enabledRevision: 0,
    commandNoticeListeners: new Set(),
    commandNoticesBySession: new Map(),
    commandNoticeTimersBySession: new Map(),
    nextCommandNoticeSeq: 0,
  }
  g[PERSISTENCE_GLOBAL_KEY] = created
  return created
}

const shared = getSharedState()
const memoryFallback = shared.memoryFallback
const memoryPreferredKeys = shared.memoryPreferredKeys
const warnedStorageKeys = shared.warnedStorageKeys

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

function warnOnceForKey(warnKey: string, message: string, err?: unknown): void {
  if (warnedStorageKeys.has(warnKey)) return
  warnedStorageKeys.add(warnKey)
  if (err !== undefined) {
    console.warn(`[dsh-genui-a2ui] ${message}`, err)
  } else {
    console.warn(`[dsh-genui-a2ui] ${message}`)
  }
}

function readStorage(storageKey: string): string | null {
  if (memoryPreferredKeys.has(storageKey)) {
    return memoryFallback.get(storageKey) ?? null
  }
  const storage = getBrowserStorage()
  if (storage !== null) {
    try {
      return storage.getItem(storageKey)
    } catch (err) {
      warnOnceForKey(`read:${storageKey}`, `localStorage read failed for "${storageKey}":`, err)
    }
  }
  return memoryFallback.get(storageKey) ?? null
}

function writeStorage(storageKey: string, value: string): boolean {
  memoryFallback.set(storageKey, value)
  const storage = getBrowserStorage()
  if (storage !== null) {
    try {
      storage.setItem(storageKey, value)
      memoryPreferredKeys.delete(storageKey)
      return true
    } catch (err) {
      memoryPreferredKeys.add(storageKey)
      warnOnceForKey(`write:${storageKey}`, `localStorage write failed for "${storageKey}":`, err)
      return false
    }
  }
  return true
}

function removeStorage(storageKey: string): void {
  memoryFallback.delete(storageKey)
  memoryPreferredKeys.delete(storageKey)
  const storage = getBrowserStorage()
  if (storage !== null) {
    try {
      storage.removeItem(storageKey)
    } catch (err) {
      warnOnceForKey(`remove:${storageKey}`, `localStorage remove failed for "${storageKey}":`, err)
    }
  }
}

function parseStoredJson(
  storageKey: string,
  raw: string,
): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown }
  } catch (err) {
    warnOnceForKey(
      `corrupt:${storageKey}`,
      `Evicting corrupt JSON stored under "${storageKey}":`,
      err,
    )
    removeStorage(storageKey)
    return { ok: false }
  }
}

export function resetPersistenceForTests(): void {
  memoryFallback.clear()
  memoryPreferredKeys.clear()
  warnedStorageKeys.clear()
  shared.fallbackDefaultEnabled = true
  shared.cachedDockRaw = undefined
  shared.cachedDockMap = new Map()
  shared.cachedDraftsRaw = undefined
  shared.cachedDraftsList = []
  shared.cachedEnabledRaw = undefined
  shared.cachedEnabledStore = { defaultEnabled: true, bySession: {} }
  shared.cachedEnabledOrder = new Map()
  shared.enabledRevision += 1
  shared.lastAppliedCommandSeqBySession.clear()
  for (const timer of shared.commandNoticeTimersBySession.values()) {
    clearTimeout(timer)
  }
  shared.commandNoticeTimersBySession.clear()
  shared.commandNoticesBySession.clear()
  removeStorage(DRAFTS_STORAGE_KEY)
  removeStorage(DOCK_STORAGE_KEY)
  removeStorage(ENABLED_STORAGE_KEY)
  notifySubscribers(shared.dockListeners, 'Persistence')
  notifySubscribers(shared.enabledListeners, 'Persistence')
  notifySubscribers(shared.commandNoticeListeners, 'Persistence')
}

export function computeMessagesFingerprint(messages: readonly unknown[]): string {
  let raw = ''
  try {
    raw = JSON.stringify(messages) ?? ''
  } catch {
    raw = String(messages.length)
  }
  let hash = 0x811c9dc5
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function sanitizeDataModel(
  value: unknown,
  obscuredPointers?: ReadonlySet<string>,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const blocked = new Set<string>()
  if (obscuredPointers !== undefined) {
    for (const p of obscuredPointers) {
      const t = p.trim()
      if (t !== '') blocked.add(t)
    }
  }
  const blockedExact = new Set<string>()
  const blockedSubstrings = new Set<string>()
  collectSecretsFromNode(value, blocked, blockedExact, blockedSubstrings, false)

  const walk = (node: unknown, currentPath: string, depth: number): unknown => {
    if (depth > 8) return undefined
    if (blocked.size > 0 && isPointerObscured(currentPath, blocked)) return undefined
    if (typeof node === 'string') {
      if (blockedExact.size === 0 && blockedSubstrings.size === 0) return node
      return scrubSecretString(node, blockedExact, blockedSubstrings)
    }
    if (typeof node === 'number' && isScrubbableNumericSecret(node, blockedExact)) {
      return undefined
    }
    if (Array.isArray(node)) {
      const out: unknown[] = []
      for (let idx = 0; idx < node.length; idx++) {
        const cleaned = walk(
          node[idx],
          currentPath === '/' ? `/${idx}` : `${currentPath}/${idx}`,
          depth + 1,
        )
        if (cleaned !== undefined) out.push(cleaned)
      }
      return out
    }
    if (typeof node === 'object' && node !== null) {
      const rec = node as Record<string, unknown>
      const isKvSecretEntry =
        (typeof rec.key === 'string' && isSecretKey(rec.key)) ||
        (typeof rec.name === 'string' && isSecretKey(rec.name))
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(rec)) {
        if (isDangerousObjectKey(k) || isSecretKey(k)) continue
        if (isKvSecretEntry && k === 'value') continue
        const escK = escapeJsonPointerSegment(k)
        const childPath = currentPath === '/' ? `/${escK}` : `${currentPath}/${escK}`
        if (blocked.size > 0 && isPointerObscured(childPath, blocked)) continue
        const cleaned = walk(v, childPath, depth + 1)
        if (cleaned !== undefined) {
          Object.defineProperty(out, k, {
            value: cleaned,
            enumerable: true,
            writable: true,
            configurable: true,
          })
        }
      }
      return out
    }
    return node
  }

  return (walk(value, '/', 0) as Record<string, unknown>) ?? {}
}

function draftKeyOf(sessionId: string, surfaceId: string, fingerprint: string): string {
  return `${sessionId}::${surfaceId}::${fingerprint}`
}

function readDraftList(): DraftEntry[] {
  const raw = readStorage(DRAFTS_STORAGE_KEY)
  if (raw === shared.cachedDraftsRaw) return [...shared.cachedDraftsList]
  shared.cachedDraftsRaw = raw
  if (!raw) {
    shared.cachedDraftsList = []
    return []
  }
  const parsed = parseStoredJson(DRAFTS_STORAGE_KEY, raw)
  if (!parsed.ok) {
    shared.cachedDraftsRaw = null
    shared.cachedDraftsList = []
    return []
  }
  if (!Array.isArray(parsed.value)) {
    warnOnceForKey(
      `shape:${DRAFTS_STORAGE_KEY}`,
      `Evicting non-array draft payload stored under "${DRAFTS_STORAGE_KEY}".`,
    )
    removeStorage(DRAFTS_STORAGE_KEY)
    shared.cachedDraftsRaw = null
    shared.cachedDraftsList = []
    return []
  }
  shared.cachedDraftsList = parsed.value.filter(
    (item): item is DraftEntry =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as DraftEntry).key === 'string' &&
      typeof (item as DraftEntry).data === 'object' &&
      (item as DraftEntry).data !== null &&
      !Array.isArray((item as DraftEntry).data),
  )
  return [...shared.cachedDraftsList]
}

export function removeSurfaceDraft(
  sessionId: string,
  surfaceId: string,
  fingerprint: string,
): void {
  if (!sessionId || !surfaceId) return
  const targetKey = draftKeyOf(sessionId, surfaceId, fingerprint)
  const prev = readDraftList()
  const next = prev.filter((e) => e.key !== targetKey)
  if (next.length !== prev.length) {
    writeDraftList(next)
  }
}

export function removeSurfaceDraftsBySurface(sessionId: string, surfaceId: string): void {
  if (!sessionId || !surfaceId) return
  const prefix = `${sessionId}::${surfaceId}::`
  const prev = readDraftList()
  const next = prev.filter((e) => !e.key.startsWith(prefix))
  if (next.length !== prev.length) {
    writeDraftList(next)
  }
}

function writeDraftList(entries: DraftEntry[]): void {
  const working = [...entries]
  let payload = JSON.stringify(working)
  while (working.length > 1 && payload.length > MAX_TOTAL_DRAFT_CHARS) {
    working.shift()
    payload = JSON.stringify(working)
  }
  while (!writeStorage(DRAFTS_STORAGE_KEY, payload) && working.length > 1) {
    working.shift()
    payload = JSON.stringify(working)
  }
  shared.cachedDraftsRaw = payload
  shared.cachedDraftsList = working
}

export function loadSurfaceDraft(
  sessionId: string,
  surfaceId: string,
  fingerprint: string,
): Record<string, unknown> | null {
  if (!sessionId || !surfaceId) return null
  const targetKey = draftKeyOf(sessionId, surfaceId, fingerprint)
  const entries = readDraftList()
  const idx = entries.findIndex((e) => e.key === targetKey)
  if (idx < 0) return null
  const hit = entries[idx]!
  if (idx !== entries.length - 1) {
    entries.splice(idx, 1)
    entries.push({ ...hit, updatedAt: Date.now() })
    writeDraftList(entries)
  }
  return hit.data
}

export function saveSurfaceDraft(
  sessionId: string,
  surfaceId: string,
  fingerprint: string,
  data: Record<string, unknown>,
  obscuredPointers?: ReadonlySet<string>,
): void {
  if (!sessionId || !surfaceId) return
  const sanitized = sanitizeDataModel(data, obscuredPointers)
  if (Object.keys(sanitized).length === 0) {
    removeSurfaceDraft(sessionId, surfaceId, fingerprint)
    return
  }
  let serialized = ''
  try {
    serialized = JSON.stringify(sanitized)
  } catch {
    return
  }
  if (serialized.length > MAX_SINGLE_DRAFT_CHARS) {
    removeSurfaceDraft(sessionId, surfaceId, fingerprint)
    return
  }

  const targetKey = draftKeyOf(sessionId, surfaceId, fingerprint)
  const entries = readDraftList().filter((e) => e.key !== targetKey)
  entries.push({
    key: targetKey,
    updatedAt: Date.now(),
    data: JSON.parse(serialized) as Record<string, unknown>,
  })
  while (entries.length > MAX_DRAFT_ENTRIES) {
    entries.shift()
  }
  writeDraftList(entries)
}

export function countSurfaceDrafts(): number {
  return readDraftList().length
}

const DEFAULT_DOCK_STATE: DockUiEntry = Object.freeze({ collapsed: false, dismissedSeq: -1 })

function readDockMap(): Map<string, DockUiEntry> {
  const raw = readStorage(DOCK_STORAGE_KEY)
  if (raw === shared.cachedDockRaw) return shared.cachedDockMap
  shared.cachedDockRaw = raw
  if (!raw) {
    shared.cachedDockMap = new Map()
    return shared.cachedDockMap
  }
  const parsed = parseStoredJson(DOCK_STORAGE_KEY, raw)
  if (parsed.ok) {
    const rawEntries = Array.isArray(parsed.value)
      ? parsed.value
      : typeof parsed.value === 'object' && parsed.value !== null
        ? Object.entries(parsed.value as Record<string, unknown>)
        : null
    if (rawEntries !== null) {
      const cleaned = new Map<string, DockUiEntry>()
      for (const pair of rawEntries) {
        if (!Array.isArray(pair) || pair.length < 2) continue
        const [k, v] = pair
        if (
          typeof k !== 'string' ||
          isDangerousObjectKey(k) ||
          typeof v !== 'object' ||
          v === null ||
          Array.isArray(v)
        ) {
          continue
        }
        const rec = v as Record<string, unknown>
        cleaned.set(k, {
          collapsed: typeof rec.collapsed === 'boolean' ? rec.collapsed : false,
          dismissedSeq:
            typeof rec.dismissedSeq === 'number' && Number.isFinite(rec.dismissedSeq)
              ? rec.dismissedSeq
              : -1,
        })
      }
      shared.cachedDockMap = cleaned
      return shared.cachedDockMap
    }
    warnOnceForKey(
      `shape:${DOCK_STORAGE_KEY}`,
      `Evicting invalid dock state stored under "${DOCK_STORAGE_KEY}".`,
    )
    removeStorage(DOCK_STORAGE_KEY)
  }
  shared.cachedDockRaw = null
  shared.cachedDockMap = new Map()
  return shared.cachedDockMap
}

function writeDockMap(next: Map<string, DockUiEntry>): void {
  const serialized = JSON.stringify([...next.entries()])
  shared.cachedDockRaw = serialized
  shared.cachedDockMap = next
  writeStorage(DOCK_STORAGE_KEY, serialized)
  notifySubscribers(shared.dockListeners, 'Persistence')
}

export function subscribeDockUi(listener: () => void): () => void {
  shared.dockListeners.add(listener)
  return () => {
    shared.dockListeners.delete(listener)
  }
}

export function getDockUiState(sessionId: string | undefined): DockUiEntry {
  if (!sessionId) return DEFAULT_DOCK_STATE
  const map = readDockMap()
  return map.get(sessionId) ?? DEFAULT_DOCK_STATE
}

export function setDockCollapsed(sessionId: string, collapsed: boolean): void {
  if (!sessionId || isDangerousObjectKey(sessionId)) return
  const prev = readDockMap()
  const cur = prev.get(sessionId) ?? DEFAULT_DOCK_STATE
  const next = new Map(prev)
  touchLruMap(next, sessionId, { ...cur, collapsed }, MAX_DRAFT_ENTRIES)
  writeDockMap(next)
}

export function dismissDockAtSeq(sessionId: string, seq: number): void {
  if (!sessionId || isDangerousObjectKey(sessionId)) return
  const prev = readDockMap()
  const cur = prev.get(sessionId) ?? DEFAULT_DOCK_STATE
  const next = new Map(prev)
  touchLruMap(next, sessionId, { ...cur, dismissedSeq: seq }, MAX_DRAFT_ENTRIES)
  writeDockMap(next)
}

export function setFallbackDefaultEnabled(enabled: boolean): void {
  if (shared.fallbackDefaultEnabled === enabled) return
  shared.fallbackDefaultEnabled = enabled
  shared.cachedEnabledRaw = undefined
  shared.enabledRevision += 1
  notifySubscribers(shared.enabledListeners, 'Persistence')
}

function parsePersistedEnabled(val: unknown): boolean | undefined {
  if (typeof val === 'boolean') return val
  if (val === 'off' || val === 'false') return false
  if (val === 'on' || val === 'full' || val === 'basic' || val === 'true') return true
  return undefined
}

function readEnabledStore(): EnabledStoreShape {
  const raw = readStorage(ENABLED_STORAGE_KEY)
  if (raw === shared.cachedEnabledRaw) return shared.cachedEnabledStore
  shared.cachedEnabledRaw = raw
  if (!raw) {
    shared.cachedEnabledOrder = new Map()
    shared.cachedEnabledStore = { defaultEnabled: shared.fallbackDefaultEnabled, bySession: {} }
    return shared.cachedEnabledStore
  }
  const parsedResult = parseStoredJson(ENABLED_STORAGE_KEY, raw)
  if (
    parsedResult.ok &&
    typeof parsedResult.value === 'object' &&
    parsedResult.value !== null &&
    !Array.isArray(parsedResult.value)
  ) {
    const parsed = parsedResult.value as Record<string, unknown>
    const defaultCandidate = parsePersistedEnabled(parsed.defaultEnabled ?? parsed.defaultTier)
    const defaultEnabled = defaultCandidate ?? shared.fallbackDefaultEnabled
    const bySession: Record<string, boolean> = {}
    const orderMap = new Map<string, boolean>()
    if (
      typeof parsed.bySession === 'object' &&
      parsed.bySession !== null &&
      !Array.isArray(parsed.bySession)
    ) {
      const srcMap = parsed.bySession as Record<string, unknown>
      const orderHint = Array.isArray(parsed.sessionOrder)
        ? parsed.sessionOrder.filter((k): k is string => typeof k === 'string')
        : []
      for (const k of [...orderHint, ...Object.keys(srcMap)]) {
        if (isDangerousObjectKey(k) || orderMap.has(k) || !Object.hasOwn(srcMap, k)) continue
        const coerced = parsePersistedEnabled(srcMap[k])
        if (coerced !== undefined) {
          bySession[k] = coerced
          orderMap.set(k, coerced)
        }
      }
    }
    shared.cachedEnabledOrder = orderMap
    shared.cachedEnabledStore = { defaultEnabled, bySession }
    return shared.cachedEnabledStore
  }
  if (parsedResult.ok) {
    warnOnceForKey(
      `shape:${ENABLED_STORAGE_KEY}`,
      `Evicting invalid enabled store under "${ENABLED_STORAGE_KEY}".`,
    )
    removeStorage(ENABLED_STORAGE_KEY)
  }
  shared.cachedEnabledRaw = null
  shared.cachedEnabledOrder = new Map()
  shared.cachedEnabledStore = { defaultEnabled: shared.fallbackDefaultEnabled, bySession: {} }
  return shared.cachedEnabledStore
}

export function subscribeA2uiEnabled(listener: () => void): () => void {
  shared.enabledListeners.add(listener)
  return () => {
    shared.enabledListeners.delete(listener)
  }
}

export function getA2uiEnabledRevision(): number {
  return shared.enabledRevision
}

export function getLastAppliedCommandSeq(sessionId: string | undefined): number {
  return shared.lastAppliedCommandSeqBySession.get(sessionId ?? 'global') ?? -1
}

export function getDefaultA2uiEnabled(): boolean {
  return readEnabledStore().defaultEnabled
}

export function getA2uiEnabled(sessionId: string | undefined): boolean {
  const store = readEnabledStore()
  if (sessionId && Object.hasOwn(store.bySession, sessionId)) {
    return store.bySession[sessionId]!
  }
  return store.defaultEnabled
}

export function setA2uiEnabled(
  sessionId: string | undefined,
  enabled: boolean,
  atCommandSeq?: number,
  updateDefault = true,
): void {
  let watermarkAdvanced = false
  if (typeof atCommandSeq === 'number') {
    const seqKey = sessionId ?? 'global'
    const prevSeq = shared.lastAppliedCommandSeqBySession.get(seqKey) ?? -1
    if (atCommandSeq > prevSeq) {
      touchLruMap(shared.lastAppliedCommandSeqBySession, seqKey, atCommandSeq, MAX_DRAFT_ENTRIES)
      watermarkAdvanced = true
    }
  }
  const prev = readEnabledStore()
  const nextOrder = new Map(shared.cachedEnabledOrder)
  if (sessionId && !isDangerousObjectKey(sessionId)) {
    touchLruMap(nextOrder, sessionId, enabled, MAX_DRAFT_ENTRIES)
  }
  const nextBySession: Record<string, boolean> = {}
  const sessionOrder: string[] = []
  for (const [k, v] of nextOrder) {
    nextBySession[k] = v
    sessionOrder.push(k)
  }
  const next: EnabledStoreShape = {
    defaultEnabled: updateDefault || !sessionId ? enabled : prev.defaultEnabled,
    bySession: nextBySession,
    sessionOrder,
  }
  const serialized = JSON.stringify(next)
  if (serialized === shared.cachedEnabledRaw) {
    if (watermarkAdvanced) {
      shared.enabledRevision += 1
      notifySubscribers(shared.enabledListeners, 'Persistence')
    }
    return
  }
  shared.cachedEnabledRaw = serialized
  shared.cachedEnabledOrder = nextOrder
  shared.cachedEnabledStore = next
  shared.enabledRevision += 1
  writeStorage(ENABLED_STORAGE_KEY, serialized)
  notifySubscribers(shared.enabledListeners, 'Persistence')
}

export function resolveEffectiveA2uiEnabled(
  sessionId: string | undefined,
  latestCommand: { readonly seq: number; readonly enabled: boolean } | null,
): boolean {
  if (latestCommand !== null) {
    const seqKey = sessionId ?? 'global'
    const watermark = shared.lastAppliedCommandSeqBySession.get(seqKey) ?? -1
    if (latestCommand.seq > watermark) {
      return latestCommand.enabled
    }
  }
  return getA2uiEnabled(sessionId)
}

export function reconcileLatestA2uiCommand(
  sessionId: string | undefined,
  latestCommand: { readonly seq: number; readonly enabled: boolean } | null,
): void {
  if (latestCommand === null) return
  const seqKey = sessionId ?? 'global'
  const watermark = shared.lastAppliedCommandSeqBySession.get(seqKey) ?? -1
  if (latestCommand.seq <= watermark) return
  setA2uiEnabled(sessionId, latestCommand.enabled, latestCommand.seq, false)
}

export interface A2uiCommandNotice {
  readonly seq: number
  readonly kind: 'success' | 'error'
  readonly text: string
}

const MAX_COMMAND_NOTICE_SESSIONS = 32
const COMMAND_NOTICE_TTL_MS = 4200

function clearNoticeTimer(sessionId: string): void {
  const prevTimer = shared.commandNoticeTimersBySession.get(sessionId)
  if (prevTimer !== undefined) {
    clearTimeout(prevTimer)
    shared.commandNoticeTimersBySession.delete(sessionId)
  }
}

export function subscribeCommandNotice(listener: () => void): () => void {
  shared.commandNoticeListeners.add(listener)
  return () => {
    shared.commandNoticeListeners.delete(listener)
  }
}

export function getCommandNotice(sessionId: string | undefined): A2uiCommandNotice | null {
  if (!sessionId) return null
  return shared.commandNoticesBySession.get(sessionId) ?? null
}

export function publishCommandNotice(
  sessionId: string | undefined,
  kind: 'success' | 'error',
  text: string,
): A2uiCommandNotice | null {
  if (!sessionId || text.trim() === '') return null
  shared.nextCommandNoticeSeq += 1
  const notice: A2uiCommandNotice = {
    seq: shared.nextCommandNoticeSeq,
    kind,
    text: text.trim(),
  }
  clearNoticeTimer(sessionId)
  shared.commandNoticesBySession.delete(sessionId)
  shared.commandNoticesBySession.set(sessionId, notice)
  while (shared.commandNoticesBySession.size > MAX_COMMAND_NOTICE_SESSIONS) {
    const oldest = shared.commandNoticesBySession.keys().next()
    if (oldest.done) break
    clearNoticeTimer(oldest.value)
    shared.commandNoticesBySession.delete(oldest.value)
  }
  const timer = setTimeout(() => {
    dismissCommandNotice(sessionId, notice.seq)
  }, COMMAND_NOTICE_TTL_MS)
  ;(timer as unknown as { unref?: () => void }).unref?.()
  shared.commandNoticeTimersBySession.set(sessionId, timer)
  notifySubscribers(shared.commandNoticeListeners, 'Persistence')
  return notice
}

export function dismissCommandNotice(sessionId: string | undefined, seq?: number): void {
  if (!sessionId) return
  const current = shared.commandNoticesBySession.get(sessionId)
  if (!current) return
  if (seq !== undefined && current.seq !== seq) return
  clearNoticeTimer(sessionId)
  shared.commandNoticesBySession.delete(sessionId)
  notifySubscribers(shared.commandNoticeListeners, 'Persistence')
}
