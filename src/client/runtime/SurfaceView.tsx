import type { AgentToRendererMessage } from '@a2ui/agent'
import {
  A2uiSurface,
  MarkdownComponentContext,
  type MarkdownComponentProps,
  type ReactCatalogComponent,
} from '@a2ui/react'
import {
  type ActionPayload,
  MessageProcessor,
  type ProcessableMessage,
  RELAXED_VALIDATION,
  type SurfaceModel,
} from '@a2ui/web_core/v1_0'
import {
  memo,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { isDangerousObjectKey } from '../../shared/constants.ts'
import {
  collectKvSecretsFromValue,
  collectSecretsFromNode,
  extractBindingPointer,
  isBindingExpression,
  isScrubbableNumericSecret,
  recordSecretPrimitive,
  referencesObscuredPointer,
  scrubSecretString,
} from '../../shared/redaction.ts'
import { enrichActionWithSelection, formatActionMessage } from '../action-protocol.ts'
import { DSH_CLIENT_CATALOGS } from '../catalog/index.ts'
import {
  type SurfaceActionStatus,
  SurfaceActionStatusContext,
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  type SurfaceValidationContextValue,
} from '../catalog/widget-helpers.tsx'
import { useStreamingHeightStabilizer, useSurfaceStoreSync } from '../dom-hooks.ts'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { FileOpenContext, type WorkspaceFileOpener } from '../file-opener.tsx'
import { useRuntimeMessages } from '../i18n.ts'
import { notifySubscribers } from '../notify.ts'
import {
  computeMessagesFingerprint,
  loadSurfaceDraft,
  normalizePointerPath,
  removeSurfaceDraft,
  sanitizeDataModel,
  saveSurfaceDraft,
} from '../persistence.ts'
import css from '../SurfaceView.module.css'
import { useDarkTheme } from '../theme.ts'
import { DshMarkdown, DshTextShimmer } from '../ui/primitives.tsx'

const ACTION_COOLDOWN_MS = 450
const EMPTY_SURFACES: readonly SurfaceModel<ReactCatalogComponent>[] = Object.freeze([])

const SKELETON_KPI_ROW = (
  <div className={css.skeletonKpiRow}>
    <span className={css.skeletonBlock} />
    <span className={css.skeletonBlock} />
    <span className={css.skeletonBlock} />
  </div>
)
const SKELETON_CHART = <div className={css.skeletonChart} />

const HostMarkdown = memo(function HostMarkdown({ markdown }: MarkdownComponentProps) {
  return <DshMarkdown text={markdown} variant="compact" />
})

export function collectObscuredPointers(
  surface: SurfaceModel<ReactCatalogComponent>,
): Set<string> | null {
  const pointers = new Set<string>()
  const kvPointers = new Set<string>()
  try {
    const entries = surface?.componentsModel?.entries
    if (
      entries === undefined ||
      entries === null ||
      typeof entries[Symbol.iterator] !== 'function'
    ) {
      console.error(
        '[dsh-genui-a2ui] Failed to inspect obscured fields: surface.componentsModel.entries is unavailable',
      )
      return null
    }
    for (const [, comp] of entries) {
      if (comp.type === 'TextField' && comp.properties?.variant === 'obscured') {
        const ptr = extractBindingPointer(comp.properties?.value)
        if (ptr !== null) pointers.add(ptr)
      } else if (comp.type === 'KvEditor') {
        const ptr = extractBindingPointer(comp.properties?.items)
        if (ptr !== null) kvPointers.add(ptr)
      }
    }
    if (kvPointers.size > 0) {
      const scratchExact = new Set<string>()
      const scratchSub = new Set<string>()
      for (const kvPtr of kvPointers) {
        const normKv = normalizePointerPath(kvPtr)
        const kvVal = surface.dataModel.get(normKv)
        if (kvVal !== undefined) {
          collectKvSecretsFromValue(kvVal, normKv, pointers, scratchExact, scratchSub)
        }
      }
    }
  } catch (err) {
    console.error('[dsh-genui-a2ui] Failed to inspect obscured fields:', err)
    return null
  }
  return pointers
}

export function readSanitizedDataModels(
  processor: MessageProcessor<ReactCatalogComponent>,
  visibleSurfaceIds?: ReadonlySet<string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const surface of processor.getSurfaces().values()) {
    if (visibleSurfaceIds !== undefined && !visibleSurfaceIds.has(surface.id)) continue
    const obscured = collectObscuredPointers(surface)
    if (obscured === null) continue
    const raw = surface.dataModel.get('/')
    const cleaned = sanitizeDataModel(raw, obscured)
    if (Object.keys(cleaned).length > 0) {
      result[surface.id] = cleaned
    }
  }
  return result
}

function collectBlockedSecretValues(
  surface: SurfaceModel<ReactCatalogComponent>,
  obscuredPointers: ReadonlySet<string>,
): {
  readonly blockedExact: Set<string>
  readonly blockedSubstrings: Set<string>
  readonly failed: boolean
} {
  const blockedExact = new Set<string>()
  const blockedSubstrings = new Set<string>()
  for (const pointer of obscuredPointers) {
    if (!pointer.trim().startsWith('/')) continue
    try {
      const secretVal = surface.dataModel.get(normalizePointerPath(pointer))
      recordSecretPrimitive(secretVal, blockedExact, blockedSubstrings, true)
    } catch {
      return { blockedExact, blockedSubstrings, failed: true }
    }
  }
  try {
    collectSecretsFromNode(
      surface.dataModel.get('/'),
      obscuredPointers,
      blockedExact,
      blockedSubstrings,
      false,
    )
  } catch {
    return { blockedExact, blockedSubstrings, failed: true }
  }
  return { blockedExact, blockedSubstrings, failed: false }
}

function stripObscuredFromContext(
  value: unknown,
  rawBinding: unknown,
  obscuredPointers: ReadonlySet<string>,
  blockedExact: ReadonlySet<string>,
  blockedSubstrings: ReadonlySet<string>,
  depth = 0,
): unknown {
  if (depth > 8) return undefined
  if (isBindingExpression(rawBinding) && referencesObscuredPointer(rawBinding, obscuredPointers)) {
    return undefined
  }
  if (typeof value === 'string') {
    return scrubSecretString(value, blockedExact, blockedSubstrings)
  }
  if (typeof value === 'number' && isScrubbableNumericSecret(value, blockedExact)) {
    return undefined
  }
  if (Array.isArray(value)) {
    const rawArr = Array.isArray(rawBinding) ? rawBinding : undefined
    return value
      .map((item, idx) =>
        stripObscuredFromContext(
          item,
          rawArr?.[idx],
          obscuredPointers,
          blockedExact,
          blockedSubstrings,
          depth + 1,
        ),
      )
      .filter((item) => item !== undefined)
  }
  if (typeof value === 'object' && value !== null) {
    const rawObj =
      typeof rawBinding === 'object' && rawBinding !== null && !Array.isArray(rawBinding)
        ? (rawBinding as Record<string, unknown>)
        : undefined
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = stripObscuredFromContext(
        v,
        rawObj !== undefined && Object.hasOwn(rawObj, k) ? rawObj[k] : undefined,
        obscuredPointers,
        blockedExact,
        blockedSubstrings,
        depth + 1,
      )
      if (cleaned !== undefined) out[k] = cleaned
    }
    return out
  }
  return value
}

function deepMergePlainObjects(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  if (depth > 8) return { ...base }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(base)) {
    if (isDangerousObjectKey(k)) continue
    Object.defineProperty(out, k, {
      value: v,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  for (const [k, v] of Object.entries(patch)) {
    if (isDangerousObjectKey(k)) continue
    const existing = Object.hasOwn(out, k) ? out[k] : undefined
    const nextVal =
      typeof existing === 'object' &&
      existing !== null &&
      !Array.isArray(existing) &&
      typeof v === 'object' &&
      v !== null &&
      !Array.isArray(v)
        ? deepMergePlainObjects(
            existing as Record<string, unknown>,
            v as Record<string, unknown>,
            depth + 1,
          )
        : v
    Object.defineProperty(out, k, {
      value: nextVal,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  return out
}

interface SurfaceRedactionState {
  readonly obscured: ReadonlySet<string>
  readonly blockedExact: ReadonlySet<string>
  readonly blockedSubstrings: ReadonlySet<string>
}

function resolveSurfaceRedactionState(
  surface: SurfaceModel<ReactCatalogComponent>,
): SurfaceRedactionState | null {
  const obscured = collectObscuredPointers(surface)
  if (obscured === null) return null
  const { blockedExact, blockedSubstrings, failed } = collectBlockedSecretValues(surface, obscured)
  if (failed) return null
  return { obscured, blockedExact, blockedSubstrings }
}

function sanitizeActionContextWithState(
  surface: SurfaceModel<ReactCatalogComponent>,
  action: ActionPayload,
  state: SurfaceRedactionState,
): Record<string, unknown> {
  const rawContext = action.context ?? {}
  let rawActionCtx: Record<string, unknown> | undefined
  try {
    const entries = surface.componentsModel.entries
    for (const [id, comp] of entries) {
      if (id === action.sourceComponentId && action.sourceComponentId !== '') {
        const props = comp.properties as Record<string, unknown> | undefined
        if (props) {
          let exactMatch: Record<string, unknown> | undefined
          let merged: Record<string, unknown> | undefined
          for (const key of ['action', 'approveAction', 'rejectAction']) {
            const actionProp = props[key] as
              | {
                  event?: { name?: unknown; context?: Record<string, unknown> }
                  name?: unknown
                  context?: Record<string, unknown>
                }
              | undefined
            if (!actionProp || typeof actionProp !== 'object') continue
            const candidate = actionProp.event?.context ?? actionProp.context
            if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
            const eventName = actionProp.event?.name ?? actionProp.name
            if (typeof eventName === 'string' && eventName === action.name) {
              exactMatch = candidate
              break
            }
            merged = merged === undefined ? { ...candidate } : { ...merged, ...candidate }
          }
          rawActionCtx = exactMatch ?? merged
        }
      }
    }
  } catch (err) {
    console.error('[dsh-genui-a2ui] Failed to inspect obscured fields:', err)
    return {}
  }
  const { obscured, blockedExact, blockedSubstrings } = state
  if (obscured.size === 0 && blockedExact.size === 0 && blockedSubstrings.size === 0) {
    return sanitizeDataModel(rawContext)
  }
  const stripped = stripObscuredFromContext(
    rawContext,
    rawActionCtx,
    obscured,
    blockedExact,
    blockedSubstrings,
  )
  return sanitizeDataModel(
    typeof stripped === 'object' && stripped !== null && !Array.isArray(stripped) ? stripped : {},
  )
}

export function sanitizeActionContextForSurface(
  surface: SurfaceModel<ReactCatalogComponent> | undefined,
  action: ActionPayload,
): Record<string, unknown> {
  if (surface === undefined) return sanitizeDataModel(action.context ?? {})
  const state = resolveSurfaceRedactionState(surface)
  if (state === null) return {}
  return sanitizeActionContextWithState(surface, action, state)
}

export function sanitizeActionPayloadForSurface(
  surface: SurfaceModel<ReactCatalogComponent> | undefined,
  action: ActionPayload,
): ActionPayload {
  if (surface === undefined) {
    return enrichActionWithSelection({
      ...action,
      context: sanitizeDataModel(action.context ?? {}),
    })
  }
  const state = resolveSurfaceRedactionState(surface)
  if (state === null) {
    const enriched = enrichActionWithSelection({ ...action, context: {} })
    return {
      ...enriched,
      context: {},
      ...(enriched.userMessage !== undefined ? { userMessage: undefined } : {}),
    }
  }
  const safeContext = sanitizeActionContextWithState(surface, action, state)
  const enriched = enrichActionWithSelection({ ...action, context: safeContext })
  const { obscured, blockedExact, blockedSubstrings } = state
  if (obscured.size === 0 && blockedExact.size === 0 && blockedSubstrings.size === 0) {
    return enriched
  }
  const safeUserMessage =
    typeof enriched.userMessage === 'string'
      ? scrubSecretString(enriched.userMessage, blockedExact, blockedSubstrings)
      : undefined
  const safeEnrichedContext = stripObscuredFromContext(
    enriched.context ?? {},
    undefined,
    obscured,
    blockedExact,
    blockedSubstrings,
  )
  return {
    ...enriched,
    ...(safeUserMessage !== undefined
      ? { userMessage: safeUserMessage }
      : { userMessage: undefined }),
    context: sanitizeDataModel(
      typeof safeEnrichedContext === 'object' &&
        safeEnrichedContext !== null &&
        !Array.isArray(safeEnrichedContext)
        ? safeEnrichedContext
        : {},
    ),
  }
}

export { formatActionMessage }

export type SurfaceActionCallback = (
  formattedMessage: string,
  raw: ActionPayload,
  dataModels: Record<string, unknown>,
) => unknown

export interface SurfaceGroupViewProps {
  readonly messages: readonly AgentToRendererMessage[]
  readonly visibleSurfaceIds?: ReadonlySet<string> | undefined
  readonly readOnlySurfaceIds?: ReadonlySet<string> | undefined
  readonly title?: string | null | undefined
  readonly streaming?: boolean | undefined
  readonly sessionId?: string | undefined
  readonly readOnly?: boolean | undefined
  readonly readOnlyLabel?: string | undefined
  readonly headerRight?: ReactNode | undefined
  readonly variant?: 'card' | 'bare' | undefined
  readonly onAction?: SurfaceActionCallback | undefined
  readonly openWorkspaceFile?: WorkspaceFileOpener | undefined
}

export class SurfaceSessionStore {
  readonly processor: MessageProcessor<ReactCatalogComponent>
  private onAction: SurfaceActionCallback | undefined = undefined
  private readOnly = false
  private readOnlySurfaceIds: ReadonlySet<string> | undefined = undefined
  private streaming = false
  private sessionId: string | undefined = undefined
  private fingerprint = ''
  private visibleSurfaceIds: ReadonlySet<string> | undefined = undefined

  private surfacesSnapshot: readonly SurfaceModel<ReactCatalogComponent>[] = []
  private appliedCount = 0
  private appliedPrefix: readonly AgentToRendererMessage[] = []
  private mutatingModel = false
  private lastActionAt = 0
  private actionSeq = 0
  private lastActionOk = true
  private _generation = 0
  private mountedListeners = 0
  private readonly externalListeners = new Set<() => void>()
  private readonly restoredDraftKeys = new Set<string>()
  private readonly draftSubs = new Map<
    SurfaceModel<ReactCatalogComponent>,
    { unsubscribe(): void }
  >()
  private readonly pendingDraftWrites = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; flush: () => void }
  >()
  private readonly lastDraftWriteAt = new Map<string, number>()

  constructor() {
    this.processor = new MessageProcessor<ReactCatalogComponent>(
      [...DSH_CLIENT_CATALOGS],
      async (action: ActionPayload) => {
        if (this.readOnly || this.readOnlySurfaceIds?.has(action.surfaceId)) {
          this.actionSeq += 1
          this.lastActionOk = false
          return
        }
        const handler = this.onAction
        if (handler === undefined) {
          this.actionSeq += 1
          this.lastActionOk = false
          return
        }
        const now = Date.now()
        if (now - this.lastActionAt < ACTION_COOLDOWN_MS) {
          this.actionSeq += 1
          this.lastActionOk = false
          return
        }
        this.lastActionAt = now

        const dataModels = readSanitizedDataModels(this.processor, this.visibleSurfaceIds)
        const targetSurface = this.processor.getSurfaces().get(action.surfaceId)
        const cleanAction = sanitizeActionPayloadForSurface(targetSurface, action)
        try {
          const result = await handler(
            formatActionMessage(cleanAction, dataModels),
            cleanAction,
            dataModels,
          )
          if (result === false) {
            this.lastActionAt = 0
            this.actionSeq += 1
            this.lastActionOk = false
            return
          }
          this.actionSeq += 1
          this.lastActionOk = true
        } catch {
          this.lastActionAt = 0
          this.actionSeq += 1
          this.lastActionOk = false
        }
      },
      {
        version: 'v1.0',
        validationConfig: RELAXED_VALIDATION,
        reportErrorsOnly: true,
      },
    )
  }

  readonly getActionStatus = (): SurfaceActionStatus => ({
    seq: this.actionSeq,
    ok: this.lastActionOk,
  })

  get generation(): number {
    return this._generation
  }

  readonly getSurfaces = (): readonly SurfaceModel<ReactCatalogComponent>[] => {
    return this.surfacesSnapshot
  }

  readonly getServerSurfaces = (): readonly SurfaceModel<ReactCatalogComponent>[] => {
    return EMPTY_SURFACES
  }

  private refreshSurfacesSnapshot(): boolean {
    const next = [...this.processor.getSurfaces().values()]
    if (
      next.length === this.surfacesSnapshot.length &&
      next.every((s, idx) => s === this.surfacesSnapshot[idx])
    ) {
      return false
    }
    this.surfacesSnapshot = next
    return true
  }

  private scheduleDraftSave(
    sid: string,
    surface: SurfaceModel<ReactCatalogComponent>,
    fp: string,
    rootVal: Record<string, unknown>,
  ): void {
    const key = `${sid}::${surface.id}::${fp}`
    const commit = () => {
      this.pendingDraftWrites.delete(key)
      this.lastDraftWriteAt.set(key, Date.now())
      const obscured = collectObscuredPointers(surface)
      if (obscured === null) return
      saveSurfaceDraft(sid, surface.id, fp, rootVal, obscured)
    }
    const prev = this.pendingDraftWrites.get(key)
    if (prev !== undefined) clearTimeout(prev.timer)
    const now = Date.now()
    const lastAt = this.lastDraftWriteAt.get(key) ?? 0
    if (now - lastAt >= 280) {
      commit()
      return
    }
    const delay = Math.max(16, 280 - (now - lastAt))
    const timer = setTimeout(commit, delay)
    ;(timer as unknown as { unref?: () => void }).unref?.()
    this.pendingDraftWrites.set(key, { timer, flush: commit })
  }

  private flushPendingDraftWrites(): void {
    const entries = [...this.pendingDraftWrites.values()]
    this.pendingDraftWrites.clear()
    for (const entry of entries) {
      clearTimeout(entry.timer)
      entry.flush()
    }
  }

  private cancelPendingDraftWrites(): void {
    for (const entry of this.pendingDraftWrites.values()) {
      clearTimeout(entry.timer)
    }
    this.pendingDraftWrites.clear()
  }

  private syncDraftSubscriptions(): void {
    if (this.mountedListeners === 0) return
    const activeSet = new Set(this.processor.getSurfaces().values())
    for (const [surf, sub] of this.draftSubs) {
      if (!activeSet.has(surf)) {
        sub.unsubscribe()
        this.draftSubs.delete(surf)
      }
    }
    for (const surface of activeSet) {
      if (this.draftSubs.has(surface)) continue
      const sub = surface.dataModel.subscribe('/', (rootVal) => {
        if (
          this.mutatingModel ||
          this.streaming ||
          this.readOnly ||
          this.readOnlySurfaceIds?.has(surface.id)
        ) {
          return
        }
        const sid = this.sessionId
        const fp = this.fingerprint
        if (!sid || !fp || typeof rootVal !== 'object' || rootVal === null) return
        this.scheduleDraftSave(sid, surface, fp, rootVal as Record<string, unknown>)
      })
      this.draftSubs.set(surface, sub)
    }
  }

  private clearDraftSubscriptions(): void {
    this.flushPendingDraftWrites()
    for (const sub of this.draftSubs.values()) {
      sub.unsubscribe()
    }
    this.draftSubs.clear()
  }

  reconcile(
    messages: readonly AgentToRendererMessage[],
    options: {
      readonly streaming: boolean
      readonly readOnly: boolean
      readonly readOnlySurfaceIds?: ReadonlySet<string> | undefined
      readonly sessionId: string | undefined
      readonly fingerprint: string
      readonly visibleSurfaceIds: ReadonlySet<string> | undefined
      readonly onAction: SurfaceActionCallback | undefined
      readonly skipDraftIo?: boolean | undefined
      readonly notify?: boolean | undefined
    },
  ): void {
    this.streaming = options.streaming
    this.readOnly = options.readOnly
    this.readOnlySurfaceIds = options.readOnlySurfaceIds
    this.sessionId = options.sessionId
    this.fingerprint = options.fingerprint
    this.visibleSurfaceIds = options.visibleSurfaceIds
    this.onAction = options.onAction

    const prev = this.appliedPrefix
    const prevCount = this.appliedCount
    const isExtension =
      messages.length >= prevCount &&
      prev.every((msg, idx) => idx >= prevCount || messages[idx] === msg)

    let snapshotChanged = false
    if (!isExtension || messages.length > prevCount) {
      this.mutatingModel = true
      try {
        if (!isExtension) {
          this.cancelPendingDraftWrites()
          for (const id of [...this.processor.getSurfaces().keys()]) {
            this.processor.processMessages({
              version: '1.0',
              deleteSurface: { surfaceId: id },
            } as unknown as ProcessableMessage)
          }
          this.appliedCount = 0
          this._generation += 1
          this.restoredDraftKeys.clear()
        }

        const slice = messages.slice(this.appliedCount)
        if (slice.length > 0) {
          if (
            isExtension &&
            prevCount > 0 &&
            slice.some(
              (m) =>
                typeof m === 'object' &&
                m !== null &&
                ('updateComponents' in m || 'createSurface' in m),
            )
          ) {
            this._generation += 1
          }
          this.processor.processMessagesWithErrors(slice as unknown as ProcessableMessage[])
          this.appliedCount = messages.length
          this.appliedPrefix = messages
        } else {
          this.appliedPrefix = messages
        }
        snapshotChanged = this.refreshSurfacesSnapshot()
      } finally {
        this.mutatingModel = false
      }
      this.syncDraftSubscriptions()
    }

    if (
      !options.skipDraftIo &&
      !options.streaming &&
      !options.readOnly &&
      options.sessionId &&
      options.fingerprint
    ) {
      this.mutatingModel = true
      try {
        for (const surface of this.surfacesSnapshot) {
          if (
            (options.visibleSurfaceIds !== undefined &&
              !options.visibleSurfaceIds.has(surface.id)) ||
            options.readOnlySurfaceIds?.has(surface.id)
          ) {
            continue
          }
          const draftKey = `${options.sessionId}::${surface.id}::${options.fingerprint}`
          if (this.restoredDraftKeys.has(draftKey)) continue
          this.restoredDraftKeys.add(draftKey)
          const draft = loadSurfaceDraft(options.sessionId, surface.id, options.fingerprint)
          if (draft !== null && typeof draft === 'object' && !Array.isArray(draft)) {
            try {
              const obscured = collectObscuredPointers(surface)
              if (obscured === null) continue
              const safeDraft = sanitizeDataModel(draft, obscured)
              if (Object.keys(safeDraft).length === 0) continue
              const current = surface.dataModel.get('/')
              const merged =
                typeof current === 'object' && current !== null && !Array.isArray(current)
                  ? deepMergePlainObjects(current as Record<string, unknown>, safeDraft)
                  : safeDraft
              surface.dataModel.set('/', merged)
            } catch (err) {
              console.warn('[dsh-genui-a2ui] Discarding malformed draft restoration:', err)
              removeSurfaceDraft(options.sessionId, surface.id, options.fingerprint)
            }
          }
        }
      } finally {
        this.mutatingModel = false
      }
    }

    if (options.notify && snapshotChanged) {
      notifySubscribers(this.externalListeners, 'Surface')
    }
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.mountedListeners += 1
    this.externalListeners.add(listener)
    this.syncDraftSubscriptions()
    const notifyIfChanged = () => {
      this.syncDraftSubscriptions()
      if (!this.mutatingModel && this.refreshSurfacesSnapshot()) {
        listener()
      }
    }
    const subCreate = this.processor.onSurfaceCreated(notifyIfChanged)
    const subDelete = this.processor.onSurfaceDeleted(notifyIfChanged)
    return () => {
      subCreate.unsubscribe()
      subDelete.unsubscribe()
      this.externalListeners.delete(listener)
      this.mountedListeners = Math.max(0, this.mountedListeners - 1)
      if (this.mountedListeners === 0) {
        this.clearDraftSubscriptions()
      }
    }
  }
}

export const SurfaceGroupView = memo(function SurfaceGroupView({
  messages,
  visibleSurfaceIds,
  readOnlySurfaceIds,
  title,
  streaming = false,
  sessionId,
  readOnly = false,
  readOnlyLabel,
  headerRight,
  variant = 'card',
  onAction,
  openWorkspaceFile,
}: SurfaceGroupViewProps) {
  const dark = useDarkTheme()
  const storeRef = useRef<SurfaceSessionStore | null>(null)
  if (storeRef.current === null) {
    storeRef.current = new SurfaceSessionStore()
  }
  const store = storeRef.current

  const fingerprint = useMemo(
    () => (streaming || !sessionId ? '' : computeMessagesFingerprint(messages)),
    [messages, streaming, sessionId],
  )

  if (typeof window === 'undefined') {
    store.reconcile(messages, {
      streaming,
      readOnly,
      readOnlySurfaceIds,
      sessionId,
      fingerprint,
      visibleSurfaceIds,
      onAction,
      skipDraftIo: true,
      notify: false,
    })
  }

  useSurfaceStoreSync(() => {
    store.reconcile(messages, {
      streaming,
      readOnly,
      readOnlySurfaceIds,
      sessionId,
      fingerprint,
      visibleSurfaceIds,
      onAction,
      notify: true,
    })
  }, [
    store,
    messages,
    streaming,
    readOnly,
    readOnlySurfaceIds,
    sessionId,
    fingerprint,
    visibleSurfaceIds,
    onAction,
  ])

  const surfaces = useSyncExternalStore(store.subscribe, store.getSurfaces, store.getServerSurfaces)

  const [attemptedGeneration, setAttemptedGeneration] = useState(-1)
  const submitAttempted = attemptedGeneration === store.generation

  const markSubmitAttempted = useCallback(() => {
    setAttemptedGeneration(store.generation)
  }, [store])

  const validationContext = useMemo<SurfaceValidationContextValue>(
    () => ({
      submitAttempted,
      markSubmitAttempted,
    }),
    [submitAttempted, markSubmitAttempted],
  )

  const shown = useMemo(() => {
    if (visibleSurfaceIds === undefined) return surfaces
    return surfaces.filter((s) => visibleSurfaceIds.has(s.id))
  }, [surfaces, visibleSurfaceIds])

  const stackRef = useRef<HTMLDivElement | null>(null)
  useStreamingHeightStabilizer(stackRef, Boolean(streaming))

  const setStackInertRef = useCallback(
    (node: HTMLDivElement | null) => {
      stackRef.current = node
      if (node !== null) {
        ;(node as HTMLDivElement & { inert?: boolean }).inert = Boolean(readOnly)
      }
    },
    [readOnly],
  )

  const setSubSurfaceInertRef = useCallback((node: HTMLDivElement | null) => {
    if (node !== null) {
      ;(node as HTMLDivElement & { inert?: boolean }).inert = true
    }
  }, [])

  const msg = useRuntimeMessages()
  const themeClass = dark ? 'a2ui-dark' : 'a2ui-light'
  const cardClasses = [
    css.card,
    variant === 'bare' ? css.bare : '',
    readOnly && variant !== 'bare' ? css.cardReadOnly : '',
    'a2ui-surface',
    themeClass,
  ]
    .filter(Boolean)
    .join(' ')

  const showHeader = Boolean(title || streaming || readOnly || headerRight)

  return (
    <section
      className={cardClasses}
      data-dsh-a2ui-card=""
      data-streaming={streaming || undefined}
      data-readonly={readOnly ? 'true' : 'false'}
      aria-label={title ?? 'A2UI'}
    >
      {showHeader ? (
        <header className={css.header}>
          <span className={css.title}>{title ?? 'A2UI'}</span>
          <span className={css.headerRight}>
            {streaming ? (
              <span className={css.badge}>
                <DshTextShimmer active={true}>{msg.generating}</DshTextShimmer>
              </span>
            ) : null}
            {!streaming && readOnly ? (
              <span className={css.badge} data-a2ui-readonly-badge="">
                {readOnlyLabel ?? msg.readOnlySnapshot}
              </span>
            ) : null}
            {headerRight}
          </span>
        </header>
      ) : null}
      <SurfaceActionStatusContext.Provider value={store.getActionStatus}>
        <SurfaceReadOnlyContext.Provider value={Boolean(readOnly)}>
          <SurfaceValidationContext.Provider value={validationContext}>
            <FileOpenContext.Provider value={streaming || readOnly ? undefined : openWorkspaceFile}>
              <MarkdownComponentContext.Provider value={HostMarkdown}>
                <div
                  ref={setStackInertRef}
                  className={`${css.surfaceStack}${readOnly ? ` ${css.surfaceStackReadOnly}` : ''}`}
                >
                  {shown.length === 0 ? (
                    streaming ? (
                      <div className={css.skeletonWrap} data-a2ui-skeleton="" aria-live="polite">
                        {SKELETON_KPI_ROW}
                        {SKELETON_CHART}
                        <span className={css.skeletonHint}>
                          <DshTextShimmer active={true}>{msg.buildingSurface}</DshTextShimmer>
                        </span>
                      </div>
                    ) : (
                      <div className={css.skeleton}>{msg.emptySurface}</div>
                    )
                  ) : (
                    shown.map((surface) => {
                      const partialReadOnly =
                        !readOnly && Boolean(readOnlySurfaceIds?.has(surface.id))
                      const body = (
                        <ErrorBoundary
                          key={surface.id}
                          resetKey={`${store.generation}:${streaming ? 1 : 0}:${messages.length}`}
                          label={msg.surfaceRenderFailed(surface.id)}
                        >
                          <A2uiSurface surface={surface} />
                        </ErrorBoundary>
                      )
                      if (!partialReadOnly) return body
                      return (
                        <SurfaceReadOnlyContext.Provider key={surface.id} value={true}>
                          <FileOpenContext.Provider value={undefined}>
                            <div
                              ref={setSubSurfaceInertRef}
                              className={css.surfaceStackReadOnly}
                              data-surface-readonly="true"
                            >
                              {body}
                            </div>
                          </FileOpenContext.Provider>
                        </SurfaceReadOnlyContext.Provider>
                      )
                    })
                  )}
                  {streaming && shown.length > 0 ? (
                    <div
                      className={css.streamingFoot}
                      data-a2ui-streaming-foot=""
                      aria-live="polite"
                    >
                      <span className={css.streamingDot} aria-hidden="true" />
                      <DshTextShimmer active={true}>{msg.streamingSyncing}</DshTextShimmer>
                    </div>
                  ) : null}
                </div>
              </MarkdownComponentContext.Provider>
            </FileOpenContext.Provider>
          </SurfaceValidationContext.Provider>
        </SurfaceReadOnlyContext.Provider>
      </SurfaceActionStatusContext.Provider>
    </section>
  )
})
