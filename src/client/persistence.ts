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

function pruneRecordLru<T>(map: Record<string, T>, maxEntries: number): Record<string, T> {
  const keys = Object.keys(map)
  if (keys.length <= maxEntries) return map
  const trimmed: Record<string, T> = {}
  for (const k of keys.slice(keys.length - maxEntries)) {
    trimmed[k] = map[k]!
  }
  return trimmed
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
}

const memoryFallback = new Map<string, string>()
const memoryPreferredKeys = new Set<string>()
const warnedStorageKeys = new Set<string>()

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
  fallbackDefaultEnabled = true
  cachedDockRaw = undefined
  cachedDockMap = {}
  cachedDraftsRaw = undefined
  cachedDraftsList = []
  cachedEnabledRaw = undefined
  cachedEnabledStore = { defaultEnabled: true, bySession: {} }
  lastAppliedCommandSeqBySession.clear()
  for (const timer of commandNoticeTimersBySession.values()) {
    clearTimeout(timer)
  }
  commandNoticeTimersBySession.clear()
  commandNoticesBySession.clear()
  removeStorage(DRAFTS_STORAGE_KEY)
  removeStorage(DOCK_STORAGE_KEY)
  removeStorage(ENABLED_STORAGE_KEY)
  notifySubscribers(dockListeners, 'Persistence')
  notifySubscribers(enabledListeners, 'Persistence')
  notifySubscribers(commandNoticeListeners, 'Persistence')
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

let cachedDraftsRaw: string | null | undefined
let cachedDraftsList: DraftEntry[] = []

function readDraftList(): DraftEntry[] {
  const raw = readStorage(DRAFTS_STORAGE_KEY)
  if (raw === cachedDraftsRaw) return [...cachedDraftsList]
  cachedDraftsRaw = raw
  if (!raw) {
    cachedDraftsList = []
    return []
  }
  const parsed = parseStoredJson(DRAFTS_STORAGE_KEY, raw)
  if (!parsed.ok) {
    cachedDraftsRaw = null
    cachedDraftsList = []
    return []
  }
  if (!Array.isArray(parsed.value)) {
    warnOnceForKey(
      `shape:${DRAFTS_STORAGE_KEY}`,
      `Evicting non-array draft payload stored under "${DRAFTS_STORAGE_KEY}".`,
    )
    removeStorage(DRAFTS_STORAGE_KEY)
    cachedDraftsRaw = null
    cachedDraftsList = []
    return []
  }
  cachedDraftsList = parsed.value.filter(
    (item): item is DraftEntry =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as DraftEntry).key === 'string' &&
      typeof (item as DraftEntry).data === 'object' &&
      (item as DraftEntry).data !== null &&
      !Array.isArray((item as DraftEntry).data),
  )
  return [...cachedDraftsList]
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
  cachedDraftsRaw = payload
  cachedDraftsList = working
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

const dockListeners = new Set<() => void>()
const DEFAULT_DOCK_STATE: DockUiEntry = Object.freeze({ collapsed: false, dismissedSeq: -1 })
let cachedDockRaw: string | null | undefined
let cachedDockMap: Record<string, DockUiEntry> = {}

function readDockMap(): Record<string, DockUiEntry> {
  const raw = readStorage(DOCK_STORAGE_KEY)
  if (raw === cachedDockRaw) return cachedDockMap
  cachedDockRaw = raw
  if (!raw) {
    cachedDockMap = {}
    return cachedDockMap
  }
  const parsed = parseStoredJson(DOCK_STORAGE_KEY, raw)
  if (parsed.ok) {
    if (typeof parsed.value === 'object' && parsed.value !== null && !Array.isArray(parsed.value)) {
      const cleaned: Record<string, DockUiEntry> = {}
      for (const [k, v] of Object.entries(parsed.value as Record<string, unknown>)) {
        if (isDangerousObjectKey(k) || typeof v !== 'object' || v === null || Array.isArray(v)) {
          continue
        }
        const rec = v as Record<string, unknown>
        cleaned[k] = {
          collapsed: typeof rec.collapsed === 'boolean' ? rec.collapsed : false,
          dismissedSeq:
            typeof rec.dismissedSeq === 'number' && Number.isFinite(rec.dismissedSeq)
              ? rec.dismissedSeq
              : -1,
        }
      }
      cachedDockMap = cleaned
      return cachedDockMap
    }
    warnOnceForKey(
      `shape:${DOCK_STORAGE_KEY}`,
      `Evicting invalid dock state stored under "${DOCK_STORAGE_KEY}".`,
    )
    removeStorage(DOCK_STORAGE_KEY)
  }
  cachedDockRaw = null
  cachedDockMap = {}
  return cachedDockMap
}

function writeDockMap(next: Record<string, DockUiEntry>): void {
  const serialized = JSON.stringify(next)
  cachedDockRaw = serialized
  cachedDockMap = next
  writeStorage(DOCK_STORAGE_KEY, serialized)
  notifySubscribers(dockListeners, 'Persistence')
}

export function subscribeDockUi(listener: () => void): () => void {
  dockListeners.add(listener)
  return () => {
    dockListeners.delete(listener)
  }
}

export function getDockUiState(sessionId: string | undefined): DockUiEntry {
  if (!sessionId) return DEFAULT_DOCK_STATE
  const map = readDockMap()
  if (!Object.hasOwn(map, sessionId)) return DEFAULT_DOCK_STATE
  return map[sessionId] ?? DEFAULT_DOCK_STATE
}

export function setDockCollapsed(sessionId: string, collapsed: boolean): void {
  if (!sessionId || isDangerousObjectKey(sessionId)) return
  const prev = readDockMap()
  const cur = Object.hasOwn(prev, sessionId)
    ? (prev[sessionId] ?? DEFAULT_DOCK_STATE)
    : DEFAULT_DOCK_STATE
  const next = { ...prev }
  delete next[sessionId]
  next[sessionId] = { ...cur, collapsed }
  writeDockMap(pruneRecordLru(next, MAX_DRAFT_ENTRIES))
}

export function dismissDockAtSeq(sessionId: string, seq: number): void {
  if (!sessionId || isDangerousObjectKey(sessionId)) return
  const prev = readDockMap()
  const cur = Object.hasOwn(prev, sessionId)
    ? (prev[sessionId] ?? DEFAULT_DOCK_STATE)
    : DEFAULT_DOCK_STATE
  const next = { ...prev }
  delete next[sessionId]
  next[sessionId] = { ...cur, dismissedSeq: seq }
  writeDockMap(pruneRecordLru(next, MAX_DRAFT_ENTRIES))
}

const enabledListeners = new Set<() => void>()
const lastAppliedCommandSeqBySession = new Map<string, number>()
let fallbackDefaultEnabled = true
let cachedEnabledRaw: string | null | undefined
let cachedEnabledStore: EnabledStoreShape = { defaultEnabled: true, bySession: {} }

export function setFallbackDefaultEnabled(enabled: boolean): void {
  if (fallbackDefaultEnabled === enabled) return
  fallbackDefaultEnabled = enabled
  cachedEnabledRaw = undefined
  notifySubscribers(enabledListeners, 'Persistence')
}

function parsePersistedEnabled(val: unknown): boolean | undefined {
  if (typeof val === 'boolean') return val
  if (val === 'off' || val === 'false') return false
  if (val === 'on' || val === 'full' || val === 'basic' || val === 'true') return true
  return undefined
}

function readEnabledStore(): EnabledStoreShape {
  const raw = readStorage(ENABLED_STORAGE_KEY)
  if (raw === cachedEnabledRaw) return cachedEnabledStore
  cachedEnabledRaw = raw
  if (!raw) {
    cachedEnabledStore = { defaultEnabled: fallbackDefaultEnabled, bySession: {} }
    return cachedEnabledStore
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
    const defaultEnabled = defaultCandidate ?? fallbackDefaultEnabled
    const bySession: Record<string, boolean> = {}
    if (
      typeof parsed.bySession === 'object' &&
      parsed.bySession !== null &&
      !Array.isArray(parsed.bySession)
    ) {
      for (const [k, v] of Object.entries(parsed.bySession as Record<string, unknown>)) {
        if (isDangerousObjectKey(k)) continue
        const coerced = parsePersistedEnabled(v)
        if (coerced !== undefined) bySession[k] = coerced
      }
    }
    cachedEnabledStore = { defaultEnabled, bySession }
    return cachedEnabledStore
  }
  if (parsedResult.ok) {
    warnOnceForKey(
      `shape:${ENABLED_STORAGE_KEY}`,
      `Evicting invalid enabled store under "${ENABLED_STORAGE_KEY}".`,
    )
    removeStorage(ENABLED_STORAGE_KEY)
  }
  cachedEnabledRaw = null
  cachedEnabledStore = { defaultEnabled: fallbackDefaultEnabled, bySession: {} }
  return cachedEnabledStore
}

export function subscribeA2uiEnabled(listener: () => void): () => void {
  enabledListeners.add(listener)
  return () => {
    enabledListeners.delete(listener)
  }
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
    const prevSeq = lastAppliedCommandSeqBySession.get(seqKey) ?? -1
    if (atCommandSeq > prevSeq) {
      lastAppliedCommandSeqBySession.set(seqKey, atCommandSeq)
      watermarkAdvanced = true
    }
  }
  const prev = readEnabledStore()
  const nextBySession = { ...prev.bySession }
  if (sessionId && !isDangerousObjectKey(sessionId)) {
    delete nextBySession[sessionId]
    nextBySession[sessionId] = enabled
  }
  const next: EnabledStoreShape = {
    defaultEnabled: updateDefault || !sessionId ? enabled : prev.defaultEnabled,
    bySession: pruneRecordLru(nextBySession, MAX_DRAFT_ENTRIES),
  }
  const serialized = JSON.stringify(next)
  if (serialized === cachedEnabledRaw) {
    if (watermarkAdvanced) notifySubscribers(enabledListeners, 'Persistence')
    return
  }
  cachedEnabledRaw = serialized
  cachedEnabledStore = next
  writeStorage(ENABLED_STORAGE_KEY, serialized)
  notifySubscribers(enabledListeners, 'Persistence')
}

export function resolveEffectiveA2uiEnabled(
  sessionId: string | undefined,
  latestCommand: { readonly seq: number; readonly enabled: boolean } | null,
): boolean {
  if (latestCommand !== null) {
    const seqKey = sessionId ?? 'global'
    const watermark = lastAppliedCommandSeqBySession.get(seqKey) ?? -1
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
  const watermark = lastAppliedCommandSeqBySession.get(seqKey) ?? -1
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
const commandNoticeListeners = new Set<() => void>()
const commandNoticesBySession = new Map<string, A2uiCommandNotice>()
const commandNoticeTimersBySession = new Map<string, ReturnType<typeof setTimeout>>()
let nextCommandNoticeSeq = 0

function clearNoticeTimer(sessionId: string): void {
  const prevTimer = commandNoticeTimersBySession.get(sessionId)
  if (prevTimer !== undefined) {
    clearTimeout(prevTimer)
    commandNoticeTimersBySession.delete(sessionId)
  }
}

export function subscribeCommandNotice(listener: () => void): () => void {
  commandNoticeListeners.add(listener)
  return () => {
    commandNoticeListeners.delete(listener)
  }
}

export function getCommandNotice(sessionId: string | undefined): A2uiCommandNotice | null {
  if (!sessionId) return null
  return commandNoticesBySession.get(sessionId) ?? null
}

export function publishCommandNotice(
  sessionId: string | undefined,
  kind: 'success' | 'error',
  text: string,
): A2uiCommandNotice | null {
  if (!sessionId || text.trim() === '') return null
  nextCommandNoticeSeq += 1
  const notice: A2uiCommandNotice = {
    seq: nextCommandNoticeSeq,
    kind,
    text: text.trim(),
  }
  clearNoticeTimer(sessionId)
  commandNoticesBySession.delete(sessionId)
  commandNoticesBySession.set(sessionId, notice)
  while (commandNoticesBySession.size > MAX_COMMAND_NOTICE_SESSIONS) {
    const oldest = commandNoticesBySession.keys().next()
    if (oldest.done) break
    clearNoticeTimer(oldest.value)
    commandNoticesBySession.delete(oldest.value)
  }
  const timer = setTimeout(() => {
    dismissCommandNotice(sessionId, notice.seq)
  }, COMMAND_NOTICE_TTL_MS)
  ;(timer as unknown as { unref?: () => void }).unref?.()
  commandNoticeTimersBySession.set(sessionId, timer)
  notifySubscribers(commandNoticeListeners, 'Persistence')
  return notice
}

export function dismissCommandNotice(sessionId: string | undefined, seq?: number): void {
  if (!sessionId) return
  const current = commandNoticesBySession.get(sessionId)
  if (!current) return
  if (seq !== undefined && current.seq !== seq) return
  clearNoticeTimer(sessionId)
  commandNoticesBySession.delete(sessionId)
  notifySubscribers(commandNoticeListeners, 'Persistence')
}
