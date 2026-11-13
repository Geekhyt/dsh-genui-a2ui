/**
 * Renders one or more A2UI v1.0 surfaces from a stream of `AgentToRendererMessage`s
 * inside a DSH-themed container, delegating Markdown to DSH's `MarkdownText`,
 * persisting local form drafts in LRU-200 `localStorage` (with obscured/secret
 * fields stripped), supporting read-only historical snapshots, and forwarding
 * component actions back to the conversation session or `a2ui_ask` handler.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { DSH_CLIENT_CATALOGS } from './catalog/index.ts'
import { enrichActionWithSelection, formatActionMessage } from './action-protocol.ts'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { FileOpenContext, type WorkspaceFileOpener } from './file-opener.tsx'
import { useRuntimeMessages } from './i18n.ts'
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

/** Shared Markdown renderer supplied to every `<A2uiSurface>` on the page. */
const HostMarkdown = memo(function HostMarkdown({ markdown }: MarkdownComponentProps) {
  return <DshMarkdown text={markdown} variant="compact" />
})

/** Extract JSON Pointer paths bound to `TextField(..., variant="obscured")` on a surface. */
function collectObscuredPointers(surface: SurfaceModel<ReactCatalogComponent>): Set<string> {
  const pointers = new Set<string>()
  try {
    for (const comp of surface.componentsModel.values) {
      if (comp.type !== 'TextField') continue
      const props = comp.properties
      if (props?.variant !== 'obscured') continue
      const val = props?.value
      if (typeof val === 'object' && val !== null && typeof (val as { path?: unknown }).path === 'string') {
        pointers.add((val as { path: string }).path)
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
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly
  const streamingRef = useRef(streaming)
  streamingRef.current = streaming

  const [surfaces, setSurfaces] = useState<SurfaceModel<ReactCatalogComponent>[]>([])
  const stackDomRef = useRef<HTMLDivElement | null>(null)
  const appliedCountRef = useRef(0)
  const appliedPrefixRef = useRef<readonly AgentToRendererMessage[]>([])
  const mutatingModelRef = useRef(false)
  const lastActionAtRef = useRef(0)

  const fingerprint = useMemo(
    () => (streaming || !sessionId ? '' : computeMessagesFingerprint(messages)),
    [messages, streaming, sessionId],
  )
  const fingerprintRef = useRef(fingerprint)
  fingerprintRef.current = fingerprint
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  const processor = useMemo(() => {
    const proc = new MessageProcessor<ReactCatalogComponent>(
      [...DSH_CLIENT_CATALOGS],
      (action: ActionPayload) => {
        if (readOnlyRef.current) return
        const handler = onActionRef.current
        if (handler === undefined) return
        const now = Date.now()
        if (now - lastActionAtRef.current < ACTION_COOLDOWN_MS) return
        lastActionAtRef.current = now

        const dataModels = readSanitizedDataModels(proc)
        const cleanAction = enrichActionWithSelection(action)
        handler(formatActionMessage(cleanAction, dataModels), cleanAction, dataModels)
      },
      {
        version: 'v1.0',
        validationConfig: RELAXED_VALIDATION,
        reportErrorsOnly: true,
      },
    )
    return proc
  }, [])

  useEffect(() => {
    const sync = () => {
      setSurfaces([...processor.getSurfaces().values()])
    }
    const subCreate = processor.onSurfaceCreated(sync)
    const subDelete = processor.onSurfaceDeleted(sync)
    sync()
    return () => {
      subCreate.unsubscribe()
      subDelete.unsubscribe()
    }
  }, [processor])

  useEffect(() => {
    const prev = appliedPrefixRef.current
    const prevCount = appliedCountRef.current
    const isExtension =
      messages.length >= prevCount &&
      prev.every((msg, idx) => idx >= prevCount || messages[idx] === msg)

    mutatingModelRef.current = true
    try {
      if (!isExtension) {
        for (const id of [...processor.getSurfaces().keys()]) {
          processor.processMessages({
            version: 'v1.0',
            deleteSurface: { surfaceId: id },
          } as unknown as ProcessableMessage)
        }
        appliedCountRef.current = 0
      }

      const slice = messages.slice(appliedCountRef.current)
      if (slice.length > 0) {
        processor.processMessagesWithErrors(slice as unknown as ProcessableMessage[])
        appliedCountRef.current = messages.length
        appliedPrefixRef.current = messages
        setSurfaces([...processor.getSurfaces().values()])
      }
    } finally {
      mutatingModelRef.current = false
    }
  }, [messages, processor])

  const shown = useMemo(() => {
    if (visibleSurfaceIds === undefined) return surfaces
    return surfaces.filter((s) => visibleSurfaceIds.has(s.id))
  }, [surfaces, visibleSurfaceIds])

  // Restore saved local drafts once settled, and subscribe to user edits for LRU-200 persistence.
  useEffect(() => {
    if (streaming || readOnly || !sessionId || !fingerprint || shown.length === 0) return

    mutatingModelRef.current = true
    try {
      for (const surface of shown) {
        const draft = loadSurfaceDraft(sessionId, surface.id, fingerprint)
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
      mutatingModelRef.current = false
    }

    const subs = shown.map((surface) => {
      let skippedInitial = false
      return surface.dataModel.subscribe('/', (rootVal) => {
        if (!skippedInitial) {
          skippedInitial = true
          return
        }
        if (mutatingModelRef.current || streamingRef.current || readOnlyRef.current) return
        const sid = sessionIdRef.current
        const fp = fingerprintRef.current
        if (!sid || !fp || typeof rootVal !== 'object' || rootVal === null) return
        saveSurfaceDraft(
          sid,
          surface.id,
          fp,
          rootVal as Record<string, unknown>,
          collectObscuredPointers(surface),
        )
      })
    })

    return () => {
      for (const sub of subs) sub.unsubscribe()
    }
  }, [shown, streaming, readOnly, sessionId, fingerprint])

  const setStackInertRef = useCallback(
    (node: HTMLDivElement | null) => {
      stackDomRef.current = node
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
            {streaming ? <span className={css.badge}>{msg.generating}</span> : null}
            {!streaming && readOnly ? (
              <span className={css.badge} data-a2ui-readonly-badge="">
                {readOnlyLabel ?? msg.readOnlySnapshot}
              </span>
            ) : null}
            {headerRight}
          </span>
        </header>
      ) : null}
      <FileOpenContext.Provider value={streaming || readOnly ? undefined : openWorkspaceFile}>
        <MarkdownComponentContext.Provider value={HostMarkdown}>
          <div
            ref={setStackInertRef}
            className={`${css.surfaceStack}${readOnly ? ` ${css.surfaceStackReadOnly}` : ''}`}
          >
            {shown.length === 0 ? (
              streaming ? (
                <div className={css.skeletonWrap} data-a2ui-skeleton="" aria-live="polite">
                  <div className={css.skeletonKpiRow}>
                    <span className={css.skeletonBlock} />
                    <span className={css.skeletonBlock} />
                    <span className={css.skeletonBlock} />
                  </div>
                  <div className={css.skeletonChart} />
                  <span className={css.skeletonHint}>{msg.buildingSurface}</span>
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
    </section>
  )
})
