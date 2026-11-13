/**
 * Browser-side persistence and reactive UI state for `dsh-genui-a2ui`:
 * 1. LRU-200 form/data-model draft store in `localStorage` (`dsh-a2ui:drafts:v1`),
 *    keyed by `sessionId + surfaceId + messageFingerprint`, with secret/obscured
 *    fields stripped before storage.
 * 2. Per-session Dock panel state (`collapsed` + `dismissedSeq`) so docked
 *    surfaces remember their collapse state and re-open automatically when a
 *    newer `update=true` or docked render arrives.
 * 3. Client A2UI on/off switch preference synced with `/a2ui on|off`.
 */

export const DRAFTS_STORAGE_KEY = 'dsh-a2ui:drafts:v1'
export const DOCK_STORAGE_KEY = 'dsh-a2ui:dock:v1'
export const ENABLED_STORAGE_KEY = 'dsh-a2ui:tier:v1'
export const MAX_DRAFT_ENTRIES = 200
const MAX_SINGLE_DRAFT_CHARS = 32_768

const SECRET_KEY_RE = /^(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key)$/i

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

function readStorage(storageKey: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(storageKey)
    }
  } catch {
    // Fall back to in-memory map in restricted sandboxes / Node tests without localStorage.
  }
  return memoryFallback.get(storageKey) ?? null
}

function writeStorage(storageKey: string, value: string): void {
  memoryFallback.set(storageKey, value)
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(storageKey, value)
    }
  } catch {
    // Ignore quota / sandbox errors; in-memory fallback remains consistent.
  }
}

/** Reset all persisted state (used in unit tests). */
export function resetPersistenceForTests(): void {
  memoryFallback.clear()
  fallbackDefaultEnabled = true
  cachedDockRaw = undefined
  cachedDockMap = {}
  cachedEnabledRaw = undefined
  cachedEnabledStore = { defaultEnabled: true, bySession: {} }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(DRAFTS_STORAGE_KEY)
      window.localStorage.removeItem(DOCK_STORAGE_KEY)
      window.localStorage.removeItem(ENABLED_STORAGE_KEY)
    }
  } catch {
    // Ignore
  }
  notifyListeners(dockListeners)
  notifyListeners(enabledListeners)
}

/** Fast deterministic FNV-1a 32-bit hex fingerprint over compiled messages. */
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

function normalizePointerPath(pointer: string): string {
  const trimmed = pointer.trim()
  if (trimmed === '' || trimmed === '/') return '/'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/**
 * Deep-clone a surface data model while stripping:
 * - any JSON Pointer path bound to an `obscured` `TextField`, and
 * - any key matching common credential/secret names.
 */
export function sanitizeDataModel(
  value: unknown,
  obscuredPointers?: ReadonlySet<string>,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const blocked = new Set<string>()
  if (obscuredPointers !== undefined) {
    for (const p of obscuredPointers) blocked.add(normalizePointerPath(p))
  }

  const walk = (node: unknown, currentPath: string, depth: number): unknown => {
    if (depth > 8) return undefined
    if (blocked.has(currentPath)) return undefined
    if (Array.isArray(node)) {
      return node.map((item, idx) => walk(item, `${currentPath}/${idx}`, depth + 1))
    }
    if (typeof node === 'object' && node !== null) {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (SECRET_KEY_RE.test(k)) continue
        const childPath = currentPath === '/' ? `/${k}` : `${currentPath}/${k}`
        if (blocked.has(childPath)) continue
        const cleaned = walk(v, childPath, depth + 1)
        if (cleaned !== undefined) out[k] = cleaned
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
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is DraftEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as DraftEntry).key === 'string' &&
        typeof (item as DraftEntry).data === 'object' &&
        (item as DraftEntry).data !== null,
    )
  } catch {
    return []
  }
}

function writeDraftList(entries: DraftEntry[]): void {
  writeStorage(DRAFTS_STORAGE_KEY, JSON.stringify(entries))
}

/** Load a previously saved user-edited surface data model (updates LRU order on hit). */
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
  // Promote to MRU end when not already at tail
  if (idx !== entries.length - 1) {
    entries.splice(idx, 1)
    entries.push({ ...hit, updatedAt: Date.now() })
    writeDraftList(entries)
  }
  return hit.data
}

/** Save a sanitized surface data model into the LRU-200 store. */
export function saveSurfaceDraft(
  sessionId: string,
  surfaceId: string,
  fingerprint: string,
  data: Record<string, unknown>,
  obscuredPointers?: ReadonlySet<string>,
): void {
  if (!sessionId || !surfaceId) return
  const sanitized = sanitizeDataModel(data, obscuredPointers)
  if (Object.keys(sanitized).length === 0) return
  let serialized = ''
  try {
    serialized = JSON.stringify(sanitized)
  } catch {
    return
  }
  if (serialized.length > MAX_SINGLE_DRAFT_CHARS) return

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

/** Return the current count of persisted surface drafts (for diagnostics/tests). */
export function countSurfaceDrafts(): number {
  return readDraftList().length
}

// ---------------------------------------------------------------------------
// Reactive Dock UI State (per-session collapse + dismissed sequence watermark)
// ---------------------------------------------------------------------------

const dockListeners = new Set<() => void>()
const DEFAULT_DOCK_STATE: DockUiEntry = Object.freeze({ collapsed: false, dismissedSeq: -1 })
let cachedDockRaw: string | null | undefined
let cachedDockMap: Record<string, DockUiEntry> = {}

function notifyListeners(listeners: ReadonlySet<() => void>): void {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      // Ignore subscriber errors
    }
  }
}

function readDockMap(): Record<string, DockUiEntry> {
  const raw = readStorage(DOCK_STORAGE_KEY)
  if (raw === cachedDockRaw) return cachedDockMap
  cachedDockRaw = raw
  if (!raw) {
    cachedDockMap = {}
    return cachedDockMap
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      cachedDockMap = parsed as Record<string, DockUiEntry>
      return cachedDockMap
    }
  } catch {
    // Ignore
  }
  cachedDockMap = {}
  return cachedDockMap
}

function writeDockMap(next: Record<string, DockUiEntry>): void {
  const serialized = JSON.stringify(next)
  cachedDockRaw = serialized
  cachedDockMap = next
  writeStorage(DOCK_STORAGE_KEY, serialized)
  notifyListeners(dockListeners)
}

export function subscribeDockUi(listener: () => void): () => void {
  dockListeners.add(listener)
  return () => {
    dockListeners.delete(listener)
  }
}

export function getDockUiState(sessionId: string | undefined): DockUiEntry {
  if (!sessionId) return DEFAULT_DOCK_STATE
  const entry = readDockMap()[sessionId]
  if (!entry) return DEFAULT_DOCK_STATE
  return entry
}

export function setDockCollapsed(sessionId: string, collapsed: boolean): void {
  if (!sessionId) return
  const prev = readDockMap()
  const cur = prev[sessionId] ?? DEFAULT_DOCK_STATE
  writeDockMap({
    ...prev,
    [sessionId]: { ...cur, collapsed },
  })
}

export function dismissDockAtSeq(sessionId: string, seq: number): void {
  if (!sessionId) return
  const prev = readDockMap()
  const cur = prev[sessionId] ?? DEFAULT_DOCK_STATE
  writeDockMap({
    ...prev,
    [sessionId]: { ...cur, dismissedSeq: seq },
  })
}

// ---------------------------------------------------------------------------
// Reactive Client Switch Store (`enabled: boolean`)
// ---------------------------------------------------------------------------

const enabledListeners = new Set<() => void>()
let fallbackDefaultEnabled = true
let cachedEnabledRaw: string | null | undefined
let cachedEnabledStore: EnabledStoreShape = { defaultEnabled: true, bySession: {} }

/**
 * Configure the client-side fallback `defaultEnabled` used when `localStorage`
 * has not yet recorded an explicit user toggle.
 */
export function setFallbackDefaultEnabled(enabled: boolean): void {
  if (fallbackDefaultEnabled === enabled) return
  fallbackDefaultEnabled = enabled
  cachedEnabledRaw = undefined
  notifyListeners(enabledListeners)
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
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const defaultCandidate = parsePersistedEnabled(parsed.defaultEnabled ?? parsed.defaultTier)
    const defaultEnabled = defaultCandidate ?? fallbackDefaultEnabled
    const bySession: Record<string, boolean> = {}
    if (typeof parsed.bySession === 'object' && parsed.bySession !== null) {
      for (const [k, v] of Object.entries(parsed.bySession as Record<string, unknown>)) {
        const coerced = parsePersistedEnabled(v)
        if (coerced !== undefined) bySession[k] = coerced
      }
    }
    cachedEnabledStore = { defaultEnabled, bySession }
    return cachedEnabledStore
  } catch {
    cachedEnabledStore = { defaultEnabled: fallbackDefaultEnabled, bySession: {} }
    return cachedEnabledStore
  }
}

export function subscribeA2uiEnabled(listener: () => void): () => void {
  enabledListeners.add(listener)
  return () => {
    enabledListeners.delete(listener)
  }
}

export function getA2uiEnabled(sessionId: string | undefined): boolean {
  const store = readEnabledStore()
  if (sessionId && sessionId in store.bySession) {
    return store.bySession[sessionId]!
  }
  return store.defaultEnabled
}

export function setA2uiEnabled(sessionId: string | undefined, enabled: boolean): void {
  const prev = readEnabledStore()
  const next: EnabledStoreShape = {
    defaultEnabled: enabled,
    bySession: sessionId ? { ...prev.bySession, [sessionId]: enabled } : { ...prev.bySession },
  }
  const serialized = JSON.stringify(next)
  cachedEnabledRaw = serialized
  cachedEnabledStore = next
  writeStorage(ENABLED_STORAGE_KEY, serialized)
  notifyListeners(enabledListeners)
}
