/**
 * Renders one or more A2UI v1.0 surfaces from a stream of `AgentToRendererMessage`s
 * inside a DSH-themed container, delegating Markdown to DSH's `MarkdownText`,
 * persisting local form drafts in LRU-200 `localStorage` (with obscured/secret
 * fields stripped), supporting read-only historical snapshots, and forwarding
 * component actions back to the conversation session or `a2ui_ask` handler.
 */
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  A2uiSurface,
  MarkdownComponentContext,
  type MarkdownComponentProps,
  type ReactCatalogComponent,
} from '@a2ui/react'
import {
  MessageProcessor,
  RELAXED_VALIDATION,
  type ActionPayload,
  type ProcessableMessage,
  type SurfaceModel,
} from '@a2ui/web_core/v1_0'
import type { AgentToRendererMessage } from '@a2ui/agent'
import { enrichActionWithSelection, formatActionMessage } from './action-protocol.ts'
import { DSH_CLIENT_CATALOGS } from './catalog/index.ts'
import {
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  type SurfaceValidationContextValue,
} from './catalog/widget-helpers.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { FileOpenContext, type WorkspaceFileOpener } from './file-opener.tsx'
import { useRuntimeMessages } from './i18n.ts'
import { DshTextShimmer } from './ui/primitives.tsx'
import {
  computeMessagesFingerprint,
  loadSurfaceDraft,
  sanitizeDataModel,
  saveSurfaceDraft,
} from './persistence.ts'
import { useDarkTheme } from './theme.ts'
import { DshMarkdown } from './ui/primitives.tsx'
import css from './SurfaceView.module.css'

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

/** Shared Markdown renderer supplied to every `<A2uiSurface>` on the page. */
const HostMarkdown = memo(function HostMarkdown({ markdown }: MarkdownComponentProps) {
  return <DshMarkdown text={markdown} variant="compact" />
})

/** Extract JSON Pointer paths bound to `TextField(..., variant="obscured")` on a surface. */
function collectObscuredPointers(surface: SurfaceModel<ReactCatalogComponent>): Set<string> {
  const pointers = new Set<string>()
  try {
    for (const [, comp] of surface.componentsModel.entries) {
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
  } catch {
    // Ignore
  }
  return pointers
}

/** Read sanitized data models across all surfaces in a `MessageProcessor`. */
export function readSanitizedDataModels(
  processor: MessageProcessor<ReactCatalogComponent>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const surface of processor.getSurfaces().values()) {
    const raw = surface.dataModel.get('/')
    const cleaned = sanitizeDataModel(raw, collectObscuredPointers(surface))
    if (Object.keys(cleaned).length > 0) {
      result[surface.id] = cleaned
    }
  }
  return result
}

export { formatActionMessage }

export type SurfaceActionCallback = (
  formattedMessage: string,
  raw: ActionPayload,
  dataModels: Record<string, unknown>,
) => void

export interface SurfaceGroupViewProps {
  /** Ordered A2UI wire messages to apply (may grow incrementally during streaming). */
  readonly messages: readonly AgentToRendererMessage[]
  /** Optional filter: when provided, only render surfaces whose IDs are in this set. */
  readonly visibleSurfaceIds?: ReadonlySet<string> | undefined
  /** Optional card header title. */
  readonly title?: string | null | undefined
  /** Whether the surface is still actively streaming. */
  readonly streaming?: boolean | undefined
  /** Owning session ID (enables LRU-200 local draft persistence when settled & editable). */
  readonly sessionId?: string | undefined
  /** When true, disables controls & outbound actions (e.g. superseded historical card). */
  readonly readOnly?: boolean | undefined
  /** Optional custom badge label when `readOnly` is true. */
  readonly readOnlyLabel?: string | undefined
  /** Optional extra controls/badges rendered on the right side of the header. */
  readonly headerRight?: ReactNode | undefined
  /** Container framing: `'card'` (default) or `'bare'` (inside Dock / DisclosureRow). */
  readonly variant?: 'card' | 'bare' | undefined
  /** Callback to send an A2UI action back into the DSH conversation or `a2ui_ask` RPC. */
  readonly onAction?: SurfaceActionCallback | undefined
  /** Optional workspace file opener supplied by DSH right-sidebar / toolview slot. */
  readonly openWorkspaceFile?: WorkspaceFileOpener | undefined
}

/**
 * Instance-scoped external store wrapping `MessageProcessor` so `SurfaceGroupView`
 * compiles surfaces & restores drafts synchronously on Frame 1 (including SSR and
 * StrictMode double-render idempotence) and subscribes declaratively via `useSyncExternalStore`
 * with zero `useEffect`s (`vercel-react-best-practices`).
 */
export class SurfaceSessionStore {
  readonly processor: MessageProcessor<ReactCatalogComponent>
  private onAction: SurfaceActionCallback | undefined = undefined
  private readOnly = false
  private streaming = false
  private sessionId: string | undefined = undefined
  private fingerprint = ''

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

        const dataModels = readSanitizedDataModels(this.processor)
        const cleanAction = enrichActionWithSelection(action)
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
    // Upstream `@a2ui/react`'s `<A2uiSurface>` omits `getServerSnapshot` in its internal
    // `useSyncExternalStore` call, so SSR renders the container shell cleanly and hydrates on client Frame 1.
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
        saveSurfaceDraft(
          sid,
          surface.id,
          fp,
          rootVal as Record<string, unknown>,
          collectObscuredPointers(surface),
        )
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

    // Restore saved local drafts idempotently on Frame 1 once settled & editable.
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
          if (draft !== null && typeof draft === 'object') {
            const current = surface.dataModel.get('/')
            const merged =
              typeof current === 'object' && current !== null && !Array.isArray(current)
                ? { ...(current as Record<string, unknown>), ...draft }
                : { ...draft }
            surface.dataModel.set('/', merged)
          }
        }
      } catch {
        // Ignore malformed draft restoration
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

  const setStackInertRef = useCallback(
    (node: HTMLDivElement | null) => {
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
                    <ErrorBoundary key={surface.id} label={msg.surfaceRenderFailed(surface.id)}>
                      <A2uiSurface surface={surface} />
                    </ErrorBoundary>
                  ))
                )}
              </div>
            </MarkdownComponentContext.Provider>
          </FileOpenContext.Provider>
        </SurfaceValidationContext.Provider>
      </SurfaceReadOnlyContext.Provider>
    </section>
  )
})
