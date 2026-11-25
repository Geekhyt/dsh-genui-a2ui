import {
  CardApi,
  ColumnApi,
  DividerApi,
  ListApi,
  ModalApi,
  RowApi,
  TabsApi,
} from '@a2ui/web_core/v1_0'
import { type CSSProperties, type ReactNode, useCallback, useContext, useId, useState } from 'react'
import { DshTextApi, GridApi } from '../../shared/catalog-schema.ts'
import { useRuntimeMessages } from '../i18n.ts'
import { useDarkTheme } from '../theme.ts'
import { DshMarkdown, DshModal, DshSegmentedTabs, type SegmentedTab } from '../ui/primitives.tsx'
import css from './Catalog.module.css'
import {
  ALIGN_MAP,
  type ChildRef,
  defineComponent,
  InsideButtonContext,
  JUSTIFY_MAP,
  ModalCloseContext,
  ModalOpenContext,
  ModalTriggerContext,
  renderChildList,
  renderChildRef,
  SurfaceReadOnlyContext,
  weightStyle,
} from './widget-helpers.tsx'

const HEADING_FONT_SIZES: Record<string, number> = Object.assign(Object.create(null), {
  h1: 20,
  h2: 17,
  h3: 15,
  h4: 14,
  h5: 13,
})

export const DshTextImpl = defineComponent<{
  text?: unknown
  variant?: 'body' | 'caption' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5'
  weight?: number
}>(DshTextApi, function DshText({ props }) {
  const insideButton = useContext(InsideButtonContext)
  const text = props.text === undefined || props.text === null ? '' : String(props.text)
  if (insideButton) {
    return <span style={{ color: 'inherit', fontWeight: 'inherit', lineHeight: 1.25 }}>{text}</span>
  }
  const headingSize = props.variant ? HEADING_FONT_SIZES[props.variant] : undefined
  if (headingSize !== undefined) {
    return (
      <div
        className={css.textHeading}
        style={{ ...weightStyle(props.weight), fontSize: headingSize }}
      >
        <DshMarkdown text={text} variant="compact" />
      </div>
    )
  }
  const cls = props.variant === 'caption' ? css.textCaption : css.textBody
  return (
    <div className={cls} style={weightStyle(props.weight)}>
      <DshMarkdown text={text} variant="compact" />
    </div>
  )
})

export const DshCardImpl = defineComponent<{
  child?: ChildRef
  weight?: number
}>(CardApi, function DshCard({ props, buildChild }) {
  return (
    <div
      className={css.card}
      style={weightStyle(props.weight, 190)}
      data-a2ui-card=""
      data-a2ui-weighted={props.weight !== undefined ? 'true' : undefined}
    >
      {renderChildRef(buildChild, props.child)}
    </div>
  )
})

export function isHomogeneousStatRow(context: unknown): boolean {
  const ctx = context as
    | {
        componentModel?: { properties?: Record<string, unknown> }
        dataContext?: {
          surface?: {
            componentsModel?: {
              get(id: string): { type?: string; properties?: Record<string, unknown> } | undefined
            }
          }
        }
      }
    | undefined
  const rawChildren = ctx?.componentModel?.properties?.children
  const componentsModel = ctx?.dataContext?.surface?.componentsModel
  if (!Array.isArray(rawChildren) || rawChildren.length < 2 || !componentsModel) {
    return false
  }
  for (const ref of rawChildren) {
    const childId =
      typeof ref === 'string'
        ? ref
        : typeof ref === 'object' && ref !== null && 'componentId' in ref
          ? String((ref as { componentId: unknown }).componentId)
          : undefined
    if (!childId) return false
    const child = componentsModel.get(childId)
    if (child?.type !== 'Stat' && child?.type !== 'MetricRing') return false
    const w = child.properties?.weight
    if (w !== undefined && w !== 1) return false
  }
  return true
}

export function DshRowView({
  props,
  buildChild,
  context,
}: {
  props: {
    children?: unknown
    justify?: string
    align?: string
    weight?: number
  }
  buildChild: (id: string, basePath?: string) => import('react').ReactNode
  context?: unknown
}) {
  const childCount = Array.isArray(props.children) ? String(props.children.length) : undefined
  const resolvedAlign = props.align ?? 'stretch'
  const kpiGrid = isHomogeneousStatRow(context)
  const rowEl = (
    <div
      className={css.row}
      data-a2ui-row=""
      data-align={resolvedAlign}
      data-child-count={childCount}
      data-kpi-grid={kpiGrid ? 'true' : undefined}
      style={{
        ...(kpiGrid ? undefined : weightStyle(props.weight)),
        justifyContent: JUSTIFY_MAP[props.justify ?? 'start'] ?? 'flex-start',
        alignItems: ALIGN_MAP[resolvedAlign] ?? 'stretch',
      }}
    >
      {renderChildList(buildChild, props.children)}
    </div>
  )
  if (kpiGrid) {
    return (
      <div className={css.containerHost} style={weightStyle(props.weight)}>
        {rowEl}
      </div>
    )
  }
  return rowEl
}

export const DshRowImpl = defineComponent<{
  children?: unknown
  justify?: string
  align?: string
  weight?: number
}>(RowApi, DshRowView)

export const DshColumnImpl = defineComponent<{
  children?: unknown
  justify?: string
  align?: string
  weight?: number
}>(ColumnApi, function DshColumn({ props, buildChild }) {
  return (
    <div
      className={css.column}
      data-a2ui-column=""
      data-a2ui-weighted={props.weight !== undefined ? 'true' : undefined}
      style={{
        ...weightStyle(props.weight, 180),
        justifyContent: JUSTIFY_MAP[props.justify ?? 'start'] ?? 'flex-start',
        alignItems: ALIGN_MAP[props.align ?? 'stretch'] ?? 'stretch',
      }}
    >
      {renderChildList(buildChild, props.children)}
    </div>
  )
})

export const DshListImpl = defineComponent<{
  children?: unknown
  direction?: 'vertical' | 'horizontal'
  align?: string
  weight?: number
}>(ListApi, function DshList({ props, buildChild }) {
  const isHorizontal = props.direction === 'horizontal'
  return (
    <div
      className={isHorizontal ? css.listHorizontal : css.listVertical}
      style={{
        ...weightStyle(props.weight, 220),
        alignItems: ALIGN_MAP[props.align ?? 'stretch'] ?? 'stretch',
      }}
    >
      {renderChildList(buildChild, props.children)}
    </div>
  )
})

const GRID_GAP_MAP: Record<string, number> = Object.assign(Object.create(null), {
  sm: 8,
  md: 12,
  lg: 16,
})

export const DshGridImpl = defineComponent<{
  children?: unknown
  columns?: number
  gap?: 'sm' | 'md' | 'lg'
  weight?: number
}>(GridApi, function DshGrid({ props, buildChild }) {
  const cols =
    typeof props.columns === 'number' && props.columns >= 1 && props.columns <= 6
      ? Math.trunc(props.columns)
      : 3
  const gapPx = GRID_GAP_MAP[props.gap ?? 'md'] ?? 12
  return (
    <div className={css.containerHost} style={weightStyle(props.weight, 220)}>
      <div
        className={css.responsiveGrid}
        data-a2ui-grid=""
        data-columns={cols}
        style={
          {
            '--a2ui-grid-cols': cols,
            gap: gapPx,
          } as CSSProperties
        }
      >
        {renderChildList(buildChild, props.children)}
      </div>
    </div>
  )
})

export const DshDividerImpl = defineComponent<{
  axis?: 'horizontal' | 'vertical'
  weight?: number
}>(DividerApi, function DshDivider({ props }) {
  if (props.axis === 'vertical') {
    return (
      <div
        className={css.dividerV}
        style={weightStyle(props.weight)}
        role="separator"
        aria-orientation="vertical"
      />
    )
  }
  return <hr className={css.dividerH} style={weightStyle(props.weight)} />
})

export const DshTabsImpl = defineComponent<{
  tabs?: readonly { readonly title?: unknown; readonly child?: ChildRef }[]
  weight?: number
}>(TabsApi, function DshTabs({ props, buildChild }) {
  const msg = useRuntimeMessages()
  const tabs = Array.isArray(props.tabs)
    ? props.tabs.filter((t): t is { readonly title?: unknown; readonly child?: ChildRef } =>
        Boolean(t && typeof t === 'object'),
      )
    : []
  const baseId = useId()
  const [activeIdx, setActiveIdx] = useState(0)
  const [visitedIndices, setVisitedIndices] = useState<ReadonlySet<number>>(() => new Set([0]))
  const [prevTabCount, setPrevTabCount] = useState(tabs.length)
  const safeIdx = tabs.length === 0 ? 0 : Math.min(activeIdx, tabs.length - 1)

  if (tabs.length !== prevTabCount) {
    setPrevTabCount(tabs.length)
    if (activeIdx !== safeIdx) setActiveIdx(safeIdx)
    if (tabs.length > 0) {
      const pruned = new Set<number>()
      for (const idx of visitedIndices) {
        if (idx >= 0 && idx < tabs.length) pruned.add(idx)
      }
      pruned.add(safeIdx)
      setVisitedIndices(pruned)
    } else if (visitedIndices.size > 0) {
      setVisitedIndices(new Set())
    }
  }

  if (tabs.length === 0) return null

  const handleTabChange = (v: string) => {
    const nextIdx = Math.max(0, Math.min(Number(v) || 0, tabs.length - 1))
    setActiveIdx(nextIdx)
    setVisitedIndices((prev) => {
      if (prev.has(nextIdx)) return prev
      const next = new Set(prev)
      next.add(nextIdx)
      return next
    })
  }

  const items = tabs.map((tab, idx) => ({
    value: String(idx),
    label: String(tab.title ?? msg.tabFallbackTitle(idx + 1)),
    id: `${baseId}-tab-${idx}`,
    panelId: visitedIndices.has(idx) || idx === safeIdx ? `${baseId}-panel-${idx}` : undefined,
  })) as unknown as readonly [SegmentedTab<string>, ...SegmentedTab<string>[]]

  return (
    <div className={css.tabsWrap} style={weightStyle(props.weight, 220)} data-a2ui-tabs="">
      <div className={css.tabsHeaderScroll}>
        <DshSegmentedTabs
          items={items}
          value={String(safeIdx)}
          onChange={handleTabChange}
          label={msg.tabsAriaLabel}
          size="sm"
        />
      </div>
      {tabs.map((tab, idx) => {
        if (!visitedIndices.has(idx) && idx !== safeIdx) return null
        const isActive = idx === safeIdx
        return (
          <div
            key={`${baseId}-panel-${idx}`}
            id={`${baseId}-panel-${idx}`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-${idx}`}
            className={css.tabPanel}
            hidden={!isActive}
            style={isActive ? undefined : { display: 'none' }}
          >
            {renderChildRef(buildChild, tab.child)}
          </div>
        )
      })}
    </div>
  )
})

function isButtonTriggerRef(trigger: ChildRef, context: unknown): boolean {
  const triggerId =
    typeof trigger === 'string'
      ? trigger
      : typeof trigger === 'object' && trigger !== null && 'id' in trigger
        ? trigger.id
        : undefined
  if (!triggerId) return false
  const componentsModel = (
    context as
      | {
          dataContext?: {
            surface?: {
              componentsModel?: { get(id: string): { type?: string } | undefined }
            }
          }
        }
      | undefined
  )?.dataContext?.surface?.componentsModel
  return componentsModel?.get(triggerId)?.type === 'Button'
}

export function DshModalView({
  props,
  buildChild,
  context,
}: {
  props: {
    trigger?: ChildRef
    content?: ChildRef
    weight?: number
  }
  buildChild: (id: string, basePath?: string) => ReactNode
  context?: unknown
}) {
  const msg = useRuntimeMessages()
  const dark = useDarkTheme()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const [open, setOpen] = useState(false)
  const hasNativeButtonTrigger = isButtonTriggerRef(props.trigger, context)

  if (readOnly && open) {
    setOpen(false)
  }

  const openModal = useCallback(() => {
    if (!readOnly) setOpen(true)
  }, [readOnly])

  const closeModal = useCallback(() => {
    setOpen(false)
  }, [])

  const isOpen = open && !readOnly

  return (
    <div
      style={weightStyle(props.weight)}
      data-a2ui-modal-root=""
      data-readonly={readOnly ? 'true' : undefined}
    >
      <div
        className={css.modalTrigger}
        role={hasNativeButtonTrigger ? undefined : 'button'}
        tabIndex={hasNativeButtonTrigger ? undefined : readOnly ? -1 : 0}
        aria-disabled={readOnly || undefined}
        onClickCapture={(e) => {
          if (readOnly) {
            e.preventDefault()
            e.stopPropagation()
            return
          }
          const target = e.target as HTMLElement | null
          if (target?.closest?.('[disabled], [aria-disabled="true"]')) return
          e.stopPropagation()
          e.preventDefault()
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.defaultPrevented) return
          if (e.key !== 'Enter' && e.key !== ' ') return
          const target = e.target as HTMLElement | null
          if (
            target?.closest(
              'button, a, input, select, textarea, [disabled], [aria-disabled="true"]',
            )
          ) {
            return
          }
          if (readOnly) {
            e.preventDefault()
            return
          }
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }}
      >
        <ModalCloseContext.Provider value={null}>
          <ModalOpenContext.Provider value={openModal}>
            <ModalTriggerContext.Provider value={true}>
              {renderChildRef(buildChild, props.trigger)}
            </ModalTriggerContext.Provider>
          </ModalOpenContext.Provider>
        </ModalCloseContext.Provider>
      </div>
      <DshModal
        open={isOpen}
        onClose={closeModal}
        title={msg.modalTitle}
        closeLabel={msg.modalClose}
      >
        {isOpen ? (
          <div className={`${css.containerHost} a2ui-surface ${dark ? 'a2ui-dark' : 'a2ui-light'}`}>
            <ModalCloseContext.Provider value={closeModal}>
              {renderChildRef(buildChild, props.content)}
            </ModalCloseContext.Provider>
          </div>
        ) : null}
      </DshModal>
    </div>
  )
}

export const DshModalImpl = defineComponent<{
  trigger?: ChildRef
  content?: ChildRef
  weight?: number
}>(ModalApi, DshModalView)
