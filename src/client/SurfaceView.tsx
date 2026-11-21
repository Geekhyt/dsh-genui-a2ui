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
import { enrichActionWithSelection, formatActionMessage } from './action-protocol.ts'
import { DSH_CLIENT_CATALOGS } from './catalog/index.ts'
import {
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  type SurfaceValidationContextValue,
} from './catalog/widget-helpers.tsx'
import { useStreamingHeightStabilizer } from './dom-hooks.ts'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { FileOpenContext, type WorkspaceFileOpener } from './file-opener.tsx'
import { useRuntimeMessages } from './i18n.ts'
import {
  computeMessagesFingerprint,
  loadSurfaceDraft,
  removeSurfaceDraft,
  sanitizeDataModel,
  saveSurfaceDraft,
} from './persistence.ts'
import css from './SurfaceView.module.css'
import { useDarkTheme } from './theme.ts'
import { DshMarkdown, DshTextShimmer } from './ui/primitives.tsx'

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
      if (comp.type !== 'TextField') continue
      const props = comp.properties
      if (props?.variant !== 'obscured') continue
      const val = props?.value
      if (typeof val === 'object' && val !== null) {
        const rawPath =
          (val as { path?: unknown; '@path'?: unknown }).path ??
          (val as { '@path'?: unknown })['@path']
        if (typeof rawPath === 'string' && rawPath.trim() !== '') {
          pointers.add(rawPath)
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

function normalizePointer(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') return ''
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash
}

function isPointerObscuredOrParent(
  pointer: string,
  obscuredPointers: ReadonlySet<string>,
): boolean {
  const norm = normalizePointer(pointer)
  if (norm === '') return false
  for (const obs of obscuredPointers) {
    if (norm === obs || obs.startsWith(`${norm}/`) || norm.startsWith(`${obs}/`)) {
      return true
    }
  }
  return false
}

function stripObscuredFromContext(
  value: unknown,
  rawBinding: unknown,
  obscuredPointers: ReadonlySet<string>,
  blockedValues: ReadonlySet<string>,
  depth = 0,
): unknown {
  if (depth > 8) return undefined
  if (typeof rawBinding === 'object' && rawBinding !== null && !Array.isArray(rawBinding)) {
    const boundPath =
      (rawBinding as { path?: unknown; '@path'?: unknown }).path ??
      (rawBinding as { '@path'?: unknown })['@path']
    if (typeof boundPath === 'string' && isPointerObscuredOrParent(boundPath, obscuredPointers)) {
      return undefined
    }
  }
  if (typeof value === 'string') {
    return blockedValues.has(value) ? undefined : value
  }
  if (Array.isArray(value)) {
    const rawArr = Array.isArray(rawBinding) ? rawBinding : undefined
    return value
      .map((item, idx) =>
        stripObscuredFromContext(item, rawArr?.[idx], obscuredPointers, blockedValues, depth + 1),
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
        blockedValues,
        depth + 1,
      )
      if (cleaned !== undefined) out[k] = cleaned
    }
    return out
  }
  return value
}

export function sanitizeActionContextForSurface(
  surface: SurfaceModel<ReactCatalogComponent> | undefined,
  action: ActionPayload,
): Record<string, unknown> {
  const rawContext = action.context ?? {}
  if (surface === undefined) return sanitizeDataModel(rawContext)
  const obscuredPointers = new Set<string>()
  let rawActionCtx: Record<string, unknown> | undefined
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
      return {}
    }
    for (const [id, comp] of entries) {
      if (comp.type === 'TextField' && comp.properties?.variant === 'obscured') {
        const val = comp.properties?.value
        if (typeof val === 'object' && val !== null) {
          const rawPath =
            (val as { path?: unknown; '@path'?: unknown }).path ??
            (val as { '@path'?: unknown })['@path']
          if (typeof rawPath === 'string') {
            const norm = normalizePointer(rawPath)
            if (norm !== '') obscuredPointers.add(norm)
          }
        }
      }
      if (id === action.sourceComponentId && action.sourceComponentId !== '') {
        const actionProp = comp.properties?.action as
          | { event?: { context?: Record<string, unknown> }; context?: Record<string, unknown> }
          | undefined
        const candidate = actionProp?.event?.context ?? actionProp?.context
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
          rawActionCtx = candidate
        }
      }
    }
  } catch (err) {
    console.error('[dsh-genui-a2ui] Failed to inspect obscured fields:', err)
    return {}
  }
  if (obscuredPointers.size === 0) return sanitizeDataModel(rawContext)
  const blockedValues = new Set<string>()
  for (const pointer of obscuredPointers) {
    try {
      const secretVal = surface.dataModel.get(pointer)
      if (typeof secretVal === 'string' && secretVal.length >= 4) {
        blockedValues.add(secretVal)
      }
    } catch {
      return {}
    }
  }
  const stripped = stripObscuredFromContext(
    rawContext,
    rawActionCtx,
    obscuredPointers,
    blockedValues,
  )
  return sanitizeDataModel(
    typeof stripped === 'object' && stripped !== null && !Array.isArray(stripped) ? stripped : {},
  )
}

export { formatActionMessage }

export type SurfaceActionCallback = (
  formattedMessage: string,
  raw: ActionPayload,
  dataModels: Record<string, unknown>,
) => void

export interface SurfaceGroupViewProps {
  readonly messages: readonly AgentToRendererMessage[]
  readonly visibleSurfaceIds?: ReadonlySet<string> | undefined
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
  private streaming = false
  private sessionId: string | undefined = undefined
  private fingerprint = ''
  private visibleSurfaceIds: ReadonlySet<string> | undefined = undefined

  private surfacesSnapshot: readonly SurfaceModel<ReactCatalogComponent>[] = []
  private appliedCount = 0
  private appliedPrefix: readonly AgentToRendererMessage[] = []
  private mutatingModel = false
  private lastActionAt = 0
  private _generation = 0
  private mountedListeners = 0
  private readonly restoredDraftKeys = new Set<string>()
  private readonly draftSubs = new Map<
    SurfaceModel<ReactCatalogComponent>,
    { unsubscribe(): void }
  >()

  constructor() {
    this.processor = new MessageProcessor<ReactCatalogComponent>(
      [...DSH_CLIENT_CATALOGS],
      (action: ActionPayload) => {
        if (this.readOnly) return
        const handler = this.onAction
        if (handler === undefined) return
        const now = Date.now()
        if (now - this.lastActionAt < ACTION_COOLDOWN_MS) return
        this.lastActionAt = now

        const dataModels = readSanitizedDataModels(this.processor, this.visibleSurfaceIds)
        const targetSurface = this.processor.getSurfaces().get(action.surfaceId)
        const safeContext = sanitizeActionContextForSurface(targetSurface, action)
        const cleanAction = enrichActionWithSelection({ ...action, context: safeContext })
        handler(formatActionMessage(cleanAction, dataModels), cleanAction, dataModels)
      },
      {
        version: 'v1.0',
        validationConfig: RELAXED_VALIDATION,
        reportErrorsOnly: true,
      },
    )
  }

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
        if (this.mutatingModel || this.streaming || this.readOnly) return
        const sid = this.sessionId
        const fp = this.fingerprint
        if (!sid || !fp || typeof rootVal !== 'object' || rootVal === null) return
        const obscured = collectObscuredPointers(surface)
        if (obscured === null) return
        saveSurfaceDraft(sid, surface.id, fp, rootVal as Record<string, unknown>, obscured)
      })
      this.draftSubs.set(surface, sub)
    }
  }

  private clearDraftSubscriptions(): void {
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
      readonly sessionId: string | undefined
      readonly fingerprint: string
      readonly visibleSurfaceIds: ReadonlySet<string> | undefined
      readonly onAction: SurfaceActionCallback | undefined
    },
  ): void {
    this.streaming = options.streaming
    this.readOnly = options.readOnly
    this.sessionId = options.sessionId
    this.fingerprint = options.fingerprint
    this.visibleSurfaceIds = options.visibleSurfaceIds
    this.onAction = options.onAction

    const prev = this.appliedPrefix
    const prevCount = this.appliedCount
    const isExtension =
      messages.length >= prevCount &&
      prev.every((msg, idx) => idx >= prevCount || messages[idx] === msg)

    if (!isExtension || messages.length > prevCount) {
      this.mutatingModel = true
      try {
        if (!isExtension) {
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
          this.processor.processMessagesWithErrors(slice as unknown as ProcessableMessage[])
          this.appliedCount = messages.length
          this.appliedPrefix = messages
        } else {
          this.appliedPrefix = messages
        }
        this.refreshSurfacesSnapshot()
      } finally {
        this.mutatingModel = false
      }
      this.syncDraftSubscriptions()
    }

    if (!options.streaming && !options.readOnly && options.sessionId && options.fingerprint) {
      this.mutatingModel = true
      try {
        for (const surface of this.surfacesSnapshot) {
          if (
            options.visibleSurfaceIds !== undefined &&
            !options.visibleSurfaceIds.has(surface.id)
          ) {
            continue
          }
          const draftKey = `${options.sessionId}::${surface.id}::${options.fingerprint}`
          if (this.restoredDraftKeys.has(draftKey)) continue
          this.restoredDraftKeys.add(draftKey)
          const draft = loadSurfaceDraft(options.sessionId, surface.id, options.fingerprint)
          if (draft !== null && typeof draft === 'object' && !Array.isArray(draft)) {
            try {
              const current = surface.dataModel.get('/')
              const merged =
                typeof current === 'object' && current !== null && !Array.isArray(current)
                  ? { ...(current as Record<string, unknown>), ...draft }
                  : { ...draft }
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
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.mountedListeners += 1
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

  store.reconcile(messages, {
    streaming,
    readOnly,
    sessionId,
    fingerprint,
    visibleSurfaceIds,
    onAction,
  })

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
                  shown.map((surface) => (
                    <ErrorBoundary
                      key={surface.id}
                      resetKey={`${store.generation}:${streaming ? 1 : 0}:${messages.length}`}
                      label={msg.surfaceRenderFailed(surface.id)}
                    >
                      <A2uiSurface surface={surface} />
                    </ErrorBoundary>
                  ))
                )}
                {streaming && shown.length > 0 ? (
                  <div className={css.streamingFoot} data-a2ui-streaming-foot="" aria-live="polite">
                    <span className={css.streamingDot} aria-hidden="true" />
                    <DshTextShimmer active={true}>{msg.streamingSyncing}</DshTextShimmer>
                  </div>
                ) : null}
              </div>
            </MarkdownComponentContext.Provider>
          </FileOpenContext.Provider>
        </SurfaceValidationContext.Provider>
      </SurfaceReadOnlyContext.Provider>
    </section>
  )
})
