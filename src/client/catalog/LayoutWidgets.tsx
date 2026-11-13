/**
 * Layout & typography A2UI 1.0 components (`Text`, `Card`, `Row`, `Column`,
 * `List`, `Divider`, `Tabs`, `Modal`).
 */
import { useContext, useId, useState } from 'react'
import {
  CardApi,
  ColumnApi,
  DividerApi,
  ListApi,
  ModalApi,
  RowApi,
  TabsApi,
} from '@a2ui/web_core/v1_0'
import { DshTextApi } from '../../shared/catalog-schema.ts'
import { useRuntimeMessages } from '../i18n.ts'
import { DshMarkdown, DshModal, DshSegmentedTabs, type SegmentedTab } from '../ui/primitives.tsx'
import css from './Catalog.module.css'
import {
  ALIGN_MAP,
  InsideButtonContext,
  JUSTIFY_MAP,
  defineComponent,
  renderChildList,
  renderChildRef,
  weightStyle,
  type ChildRef,
} from './widget-helpers.tsx'

const HEADING_FONT_SIZES: Record<string, number> = {
  h1: 20,
  h2: 17,
  h3: 15,
  h4: 14,
  h5: 13,
}

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
      style={weightStyle(props.weight)}
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
    if (child?.type !== 'Stat') return false
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
  return (
    <div
      className={css.row}
      data-a2ui-row=""
      data-align={resolvedAlign}
      data-child-count={childCount}
      data-kpi-grid={kpiGrid ? 'true' : undefined}
      style={{
        ...weightStyle(props.weight),
        justifyContent: JUSTIFY_MAP[props.justify ?? 'start'] ?? 'flex-start',
        alignItems: ALIGN_MAP[resolvedAlign] ?? 'stretch',
      }}
    >
      {renderChildList(buildChild, props.children)}
    </div>
  )
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
        ...weightStyle(props.weight),
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
        ...weightStyle(props.weight),
        alignItems: ALIGN_MAP[props.align ?? 'stretch'] ?? 'stretch',
      }}
    >
      {renderChildList(buildChild, props.children)}
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
  const tabs = props.tabs ?? []
  const baseId = useId()
  const [activeIdx, setActiveIdx] = useState(0)
  const safeIdx = tabs.length === 0 ? 0 : Math.min(activeIdx, tabs.length - 1)

  if (tabs.length === 0) return null

  const items = tabs.map((tab, idx) => ({
    value: String(idx),
    label: String(tab.title ?? msg.tabFallbackTitle(idx + 1)),
    id: `${baseId}-tab-${idx}`,
    panelId: `${baseId}-panel-${idx}`,
  })) as unknown as readonly [SegmentedTab<string>, ...SegmentedTab<string>[]]

  const activeTab = tabs[safeIdx]
  return (
    <div className={css.tabsWrap} style={weightStyle(props.weight)} data-a2ui-tabs="">
      <DshSegmentedTabs
        items={items}
        value={String(safeIdx)}
        onChange={(v) => setActiveIdx(Number(v) || 0)}
        label={msg.tabsAriaLabel}
        size="sm"
      />
      <div
        id={`${baseId}-panel-${safeIdx}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${safeIdx}`}
        className={css.tabPanel}
      >
        {renderChildRef(buildChild, activeTab?.child)}
      </div>
    </div>
  )
})

export const DshModalImpl = defineComponent<{
  trigger?: ChildRef
  content?: ChildRef
  weight?: number
}>(ModalApi, function DshModalComponent({ props, buildChild }) {
  const msg = useRuntimeMessages()
  const [open, setOpen] = useState(false)
  return (
    <div style={weightStyle(props.weight)} data-a2ui-modal-root="">
      <div
        className={css.modalTrigger}
        onClickCapture={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {renderChildRef(buildChild, props.trigger)}
      </div>
      <DshModal
        open={open}
        onClose={() => setOpen(false)}
        title={msg.modalTitle}
        closeLabel={msg.modalClose}
      >
        {renderChildRef(buildChild, props.content)}
      </DshModal>
    </div>
  )
})
