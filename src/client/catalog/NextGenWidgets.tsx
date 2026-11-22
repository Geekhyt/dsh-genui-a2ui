import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import { useContext, useMemo, useState } from 'react'
import {
  AnnotationTextApi,
  ChecklistApi,
  ImageCompareApi,
  KvEditorApi,
  RangeSliderApi,
  RatingApi,
  SortableListApi,
} from '../../shared/catalog-schema.ts'
import { isDangerousObjectKey } from '../../shared/constants.ts'
import { useRuntimeMessages } from '../i18n.ts'
import {
  DshButton,
  DshCheckbox,
  DshHoverCard,
  DshHoverCardGroup,
  DshTag,
  type TagTone,
} from '../ui/primitives.tsx'
import css from './Catalog.module.css'
import {
  buildAnnotatedTextSegments,
  clampImageComparePosition,
  clampRangeSliderBounds,
  clampRatingScore,
  computeChecklistSummary,
  isKvKeySensitive,
  normalizeChecklistItems,
  normalizeKvEditorRows,
  normalizeRatingLabels,
  normalizeSortableItems,
  reorderListItems,
} from './v6-helpers.ts'
import {
  defineComponent,
  isLocalFunctionAction,
  isSafeImageUrl,
  isWritableProp,
  ModalCloseContext,
  runSurfaceAction,
  SurfaceActionStatusContext,
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  weightStyle,
} from './widget-helpers.tsx'

export const DshRangeSliderImpl = defineComponent<{
  label?: unknown
  min?: number
  max?: number
  start?: unknown
  setStart?: (next: number) => void
  end?: unknown
  setEnd?: (next: number) => void
  step?: number
  prefix?: unknown
  unit?: unknown
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(RangeSliderApi, function DshRangeSlider({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)

  const state = clampRangeSliderBounds({
    min: props.min,
    max: props.max,
    start: props.start,
    end: props.end,
    step: props.step,
  })
  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const prefix = props.prefix !== undefined && props.prefix !== null ? String(props.prefix) : ''
  const unit = props.unit !== undefined && props.unit !== null ? String(props.unit) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined
  const fmt = (n: number) => `${prefix}${n}${unit}`

  const fillLeft = `calc(${state.startPct}% + ${(11 - 0.22 * state.startPct).toFixed(2)}px)`
  const fillRight = `calc(${100 - state.endPct}% + ${(11 - 0.22 * (100 - state.endPct)).toFixed(2)}px)`

  return (
    <div
      className={`${css.field} ${css.rangeSliderField}`}
      style={weightStyle(props.weight, 180)}
      data-a2ui-rangeslider=""
    >
      <div className={css.sliderHeader}>
        {label ? <span className={css.label}>{label}</span> : <span />}
        <span className={css.sliderVal}>
          {fmt(state.start)} – {fmt(state.end)}
        </span>
      </div>
      <div className={css.rangeTrackWrap}>
        <div className={css.rangeRail} aria-hidden="true" />
        <div
          className={css.rangeFill}
          style={{ left: fillLeft, right: fillRight }}
          aria-hidden="true"
        />
        <input
          type="range"
          className={css.rangeInput}
          min={state.min}
          max={state.max}
          step={state.step}
          value={state.start}
          disabled={readOnly}
          aria-label={label ? `${label} ${msg.rangeSliderStartAria}` : msg.rangeSliderStartAria}
          style={{ zIndex: state.startPct > 85 ? 4 : 2 }}
          onChange={(e) => {
            if (readOnly) return
            setTouched(true)
            const next = Number(e.target.value)
            if (Number.isFinite(next)) {
              props.setStart?.(Math.min(next, state.end))
            }
          }}
        />
        <input
          type="range"
          className={css.rangeInput}
          min={state.min}
          max={state.max}
          step={state.step}
          value={state.end}
          disabled={readOnly}
          aria-label={label ? `${label} ${msg.rangeSliderEndAria}` : msg.rangeSliderEndAria}
          style={{ zIndex: 3 }}
          onChange={(e) => {
            if (readOnly) return
            setTouched(true)
            const next = Number(e.target.value)
            if (Number.isFinite(next)) {
              props.setEnd?.(Math.max(next, state.start))
            }
          }}
        />
      </div>
      <div className={css.rangeAxisTicks}>
        <span>{fmt(state.min)}</span>
        <span>{fmt(state.max)}</span>
      </div>
      {err ? <span className={css.errorText}>{err}</span> : null}
    </div>
  )
})

export const DshChecklistImpl = defineComponent<{
  items?: unknown
  value?: unknown
  setValue?: (next: string[]) => void
  title?: unknown
  showProgress?: boolean
  actionLabel?: unknown
  action?: ((options?: ActionDispatchOptions) => unknown) | undefined
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(ChecklistApi, function DshChecklist({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const closeModal = useContext(ModalCloseContext)
  const getActionStatus = useContext(SurfaceActionStatusContext)
  const { submitAttempted, markSubmitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)

  const items = useMemo(() => normalizeChecklistItems(props.items), [props.items])
  const hasWritableValue = isWritableProp(context, 'value', props.setValue)
  const defaultCheckedIds = useMemo(
    () => items.filter((it) => it.defaultChecked).map((it) => it.id),
    [items],
  )
  const [localChecked, setLocalChecked] = useState<readonly string[]>(defaultCheckedIds)
  const [prevItemsRef, setPrevItemsRef] = useState(props.items)
  if (!hasWritableValue && !touched && prevItemsRef !== props.items) {
    setPrevItemsRef(props.items)
    setLocalChecked(defaultCheckedIds)
  }

  const activeCheckedList = hasWritableValue
    ? Array.isArray(props.value)
      ? props.value.map(String)
      : []
    : localChecked
  const checkedSet = useMemo(() => new Set(activeCheckedList), [activeCheckedList])
  const summary = useMemo(() => computeChecklistSummary(items, checkedSet), [items, checkedSet])

  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const showProgress = props.showProgress !== false
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined
  const blockedByRequired = summary.requiredMissing > 0

  const toggleItem = (id: string) => {
    if (readOnly) return
    setTouched(true)
    const next = checkedSet.has(id)
      ? activeCheckedList.filter((x) => x !== id)
      : [...activeCheckedList, id]
    if (hasWritableValue) {
      props.setValue?.(next)
    } else {
      setLocalChecked(next)
    }
  }

  const handleAction = () => {
    if (readOnly || typeof props.action !== 'function') return
    if (blockedByRequired || props.isValid === false) {
      setTouched(true)
      markSubmitAttempted()
      return
    }
    const localFn = isLocalFunctionAction(context)
    const actionFn = props.action
    void runSurfaceAction(
      () =>
        actionFn({
          metadata: {
            extensions: {
              dshSelection: {
                source: 'checklist',
                checked: [...checkedSet],
                done: summary.done,
                total: summary.total,
              },
            },
          },
        }),
      getActionStatus,
    ).then((ok) => {
      if (!localFn && ok) closeModal?.()
    })
  }

  return (
    <div
      className={css.checklistCard}
      style={weightStyle(props.weight, 220)}
      data-a2ui-checklist=""
    >
      <div className={css.checklistInner}>
        <div className={css.checklistHeader}>
          <span className={css.checklistTitle}>{title || msg.checklistDefaultTitle}</span>
          {showProgress && summary.total > 0 ? (
            <span className={css.checklistCount}>
              {msg.checklistProgress(summary.done, summary.total)}
            </span>
          ) : null}
        </div>
        {showProgress && summary.total > 0 ? (
          <div className={css.checklistBarTrack} aria-hidden="true">
            <div
              className={css.checklistBarFill}
              data-complete={summary.done === summary.total ? 'true' : 'false'}
              style={{ width: `${summary.pct}%` }}
            />
          </div>
        ) : null}
        {items.length === 0 ? (
          <div className={css.emptyCell}>{msg.checklistEmpty}</div>
        ) : (
          <ul className={css.checklistList}>
            {items.map((item) => {
              const checked = checkedSet.has(item.id)
              return (
                <li
                  key={item.id}
                  className={css.checklistRow}
                  data-checked={checked ? 'true' : 'false'}
                >
                  <div className={css.checklistMain}>
                    <DshCheckbox
                      checked={checked}
                      disabled={readOnly}
                      onChange={() => toggleItem(item.id)}
                      label={item.label}
                    />
                    {item.description ? (
                      <div className={css.checklistDesc}>{item.description}</div>
                    ) : null}
                  </div>
                  <div className={css.checklistMeta}>
                    {item.required ? (
                      <DshTag tone={checked ? 'success' : 'warning'}>
                        {msg.checklistRequiredTag}
                      </DshTag>
                    ) : null}
                    {item.tag ? <DshTag tone={item.tone as TagTone}>{item.tag}</DshTag> : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {err ? <div className={css.errorText}>{err}</div> : null}
        {typeof props.action === 'function' ? (
          <div className={css.checklistFooter}>
            {blockedByRequired ? (
              <span className={css.checklistWarnHint}>
                {msg.checklistRequiredMissing(summary.requiredMissing)}
              </span>
            ) : (
              <span />
            )}
            <DshButton
              variant="primary"
              size="sm"
              disabled={readOnly || blockedByRequired}
              onClick={handleAction}
            >
              {props.actionLabel ? String(props.actionLabel) : msg.defaultActionCta}
            </DshButton>
          </div>
        ) : null}
      </div>
    </div>
  )
})

export const DshSortableListImpl = defineComponent<{
  items?: unknown
  setItems?: (next: unknown[]) => void
  title?: unknown
  maxHeight?: number
  action?: ((options?: ActionDispatchOptions) => unknown) | undefined
  weight?: number
}>(SortableListApi, function DshSortableList({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const closeModal = useContext(ModalCloseContext)
  const getActionStatus = useContext(SurfaceActionStatusContext)

  const hasWritableItems = isWritableProp(context, 'items', props.setItems)
  const propItems = useMemo(() => normalizeSortableItems(props.items), [props.items])
  const [localItems, setLocalItems] = useState(propItems)
  const [prevPropRef, setPrevPropRef] = useState(props.items)
  if (!hasWritableItems && prevPropRef !== props.items) {
    setPrevPropRef(props.items)
    setLocalItems(propItems)
  }
  const activeItems = hasWritableItems ? propItems : localItems
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)

  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const maxHeight =
    typeof props.maxHeight === 'number' && Number.isFinite(props.maxHeight)
      ? Math.max(140, Math.min(640, props.maxHeight))
      : 360

  const commitMove = (fromIdx: number, toIdx: number) => {
    if (readOnly || fromIdx === toIdx) return
    const nextNormalized = reorderListItems(activeItems, fromIdx, toIdx)
    if (hasWritableItems) {
      props.setItems?.(nextNormalized.map((item) => item.raw))
    } else {
      setLocalItems(nextNormalized)
    }
  }

  const handleDispatch = () => {
    if (readOnly || typeof props.action !== 'function') return
    const localFn = isLocalFunctionAction(context)
    const actionFn = props.action
    void runSurfaceAction(
      () =>
        actionFn({
          metadata: {
            extensions: {
              dshSelection: {
                source: 'sortableList',
                items: activeItems.map((it) => it.raw),
              },
            },
          },
        }),
      getActionStatus,
    ).then((ok) => {
      if (!localFn && ok) closeModal?.()
    })
  }

  return (
    <div className={css.sortableCard} style={weightStyle(props.weight, 220)} data-a2ui-sortable="">
      <div className={css.sortableInner}>
        <div className={css.sortableHeader}>
          <span className={css.sortableTitle}>{title || msg.sortableDefaultTitle}</span>
          {typeof props.action === 'function' ? (
            <DshButton variant="outline" size="sm" disabled={readOnly} onClick={handleDispatch}>
              {msg.defaultActionCta}
            </DshButton>
          ) : null}
        </div>
        {activeItems.length === 0 ? (
          <div className={css.emptyCell}>{msg.sortableEmpty}</div>
        ) : (
          <ol className={css.sortableList} style={{ maxHeight }}>
            {activeItems.map((item, idx) => (
              <li
                key={item.id}
                className={css.sortableRow}
                draggable={!readOnly}
                data-dragging={dragIdx === idx ? 'true' : 'false'}
                data-over={overIdx === idx && dragIdx !== idx ? 'true' : 'false'}
                onDragStart={() => {
                  if (!readOnly) setDragIdx(idx)
                }}
                onDragOver={(e) => {
                  if (readOnly) return
                  e.preventDefault()
                  if (overIdx !== idx) setOverIdx(idx)
                }}
                onDrop={(e) => {
                  if (readOnly) return
                  e.preventDefault()
                  if (dragIdx !== null && dragIdx !== idx) {
                    commitMove(dragIdx, idx)
                  }
                  setDragIdx(null)
                  setOverIdx(null)
                }}
                onDragEnd={() => {
                  setDragIdx(null)
                  setOverIdx(null)
                }}
              >
                <span className={css.sortableGrip} aria-hidden="true">
                  ⋮⋮
                </span>
                <span className={css.sortableRank}>#{idx + 1}</span>
                <div className={css.sortableContent}>
                  <span className={css.sortableItemTitle}>{item.title}</span>
                  {item.subtitle ? (
                    <span className={css.sortableItemSub}>{item.subtitle}</span>
                  ) : null}
                </div>
                {item.badge ? <DshTag tone={item.tone as TagTone}>{item.badge}</DshTag> : null}
                {!readOnly ? (
                  <div className={css.sortableControls}>
                    <button
                      type="button"
                      className={css.sortableMoveBtn}
                      disabled={idx === 0}
                      aria-label={msg.sortableMoveUpAria}
                      onClick={() => commitMove(idx, idx - 1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={css.sortableMoveBtn}
                      disabled={idx === activeItems.length - 1}
                      aria-label={msg.sortableMoveDownAria}
                      onClick={() => commitMove(idx, idx + 1)}
                    >
                      ↓
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
})

export const DshKvEditorImpl = defineComponent<{
  items?: unknown
  setItems?: (next: unknown) => void
  title?: unknown
  keyLabel?: unknown
  valueLabel?: unknown
  keyPlaceholder?: unknown
  valuePlaceholder?: unknown
  addLabel?: unknown
  maxItems?: number
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(KvEditorApi, function DshKvEditor({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)

  const hasWritableItems = isWritableProp(context, 'items', props.setItems)
  const isObjectBacked =
    typeof props.items === 'object' && props.items !== null && !Array.isArray(props.items)
  const propRows = useMemo(() => normalizeKvEditorRows(props.items), [props.items])
  const [localRows, setLocalRows] = useState(propRows)
  const [prevPropRef, setPrevPropRef] = useState(props.items)
  if (!hasWritableItems && prevPropRef !== props.items) {
    setPrevPropRef(props.items)
    setLocalRows(propRows)
  }
  const rows = hasWritableItems ? propRows : localRows
  const maxItems =
    typeof props.maxItems === 'number' && Number.isFinite(props.maxItems)
      ? Math.max(1, Math.min(100, Math.trunc(props.maxItems)))
      : 30

  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const keyLabel = props.keyLabel ? String(props.keyLabel) : msg.kvEditorKeyLabel
  const valueLabel = props.valueLabel ? String(props.valueLabel) : msg.kvEditorValueLabel
  const keyPlaceholder = props.keyPlaceholder
    ? String(props.keyPlaceholder)
    : msg.kvEditorKeyPlaceholder
  const valuePlaceholder = props.valuePlaceholder
    ? String(props.valuePlaceholder)
    : msg.kvEditorValuePlaceholder
  const addLabel = props.addLabel ? String(props.addLabel) : msg.kvEditorAddItem
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  const commitRows = (nextRows: readonly { readonly key: string; readonly value: string }[]) => {
    setTouched(true)
    const normalized = nextRows.map((r) => ({
      key: r.key,
      value: r.value,
      sensitive: isKvKeySensitive(r.key),
    }))
    if (!hasWritableItems) {
      setLocalRows(normalized)
      return
    }
    if (isObjectBacked) {
      const obj: Record<string, string> = {}
      for (const r of normalized) {
        if (r.key === '' || isDangerousObjectKey(r.key)) continue
        Object.defineProperty(obj, r.key, {
          value: r.value,
          enumerable: true,
          writable: true,
          configurable: true,
        })
      }
      props.setItems?.(obj)
      return
    }
    props.setItems?.(normalized.map((r) => ({ key: r.key, value: r.value })))
  }

  const nextAddedKey = (): string => {
    if (!isObjectBacked) return ''
    const existing = new Set(rows.map((r) => r.key))
    let n = rows.length + 1
    while (existing.has(`KEY_${n}`)) n += 1
    return `KEY_${n}`
  }

  return (
    <div className={css.kvEditorCard} style={weightStyle(props.weight, 220)} data-a2ui-kveditor="">
      <div className={css.kvEditorInner}>
        <div className={css.kvEditorHeader}>
          <span className={css.kvEditorTitle}>{title || msg.kvEditorDefaultTitle}</span>
          {!readOnly && rows.length < maxItems ? (
            <button
              type="button"
              className={css.diffCopyBtn}
              onClick={() => commitRows([...rows, { key: nextAddedKey(), value: '' }])}
            >
              + {addLabel}
            </button>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <div className={css.emptyCell}>{msg.kvEditorEmpty}</div>
        ) : (
          <div className={css.kvEditorList}>
            <div className={css.kvEditorColHeads} aria-hidden="true">
              <span>{keyLabel}</span>
              <span>{valueLabel}</span>
              <span />
            </div>
            {rows.map((row, idx) => (
              <div key={idx} className={css.kvEditorRow}>
                <input
                  type="text"
                  className={css.kvEditorInput}
                  value={row.key}
                  disabled={readOnly}
                  placeholder={keyPlaceholder}
                  aria-label={`${keyLabel} #${idx + 1}`}
                  onChange={(e) => {
                    if (readOnly) return
                    const next = rows.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r))
                    commitRows(next)
                  }}
                />
                <input
                  type={row.sensitive ? 'password' : 'text'}
                  className={css.kvEditorInput}
                  value={row.value}
                  disabled={readOnly}
                  placeholder={valuePlaceholder}
                  aria-label={`${valueLabel} #${idx + 1}`}
                  onChange={(e) => {
                    if (readOnly) return
                    const next = rows.map((r, i) =>
                      i === idx ? { ...r, value: e.target.value } : r,
                    )
                    commitRows(next)
                  }}
                />
                {!readOnly ? (
                  <button
                    type="button"
                    className={css.kvEditorDelBtn}
                    aria-label={msg.kvEditorRemoveAria}
                    onClick={() => commitRows(rows.filter((_, i) => i !== idx))}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
        {err ? <span className={css.errorText}>{err}</span> : null}
      </div>
    </div>
  )
})

function StarGlyph({ fill }: { readonly fill: 'full' | 'half' | 'empty' }) {
  if (fill === 'half') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M10 2.2l2.35 4.76 5.25.76-3.8 3.7.9 5.23L10 14.18 5.3 16.65l.9-5.23-3.8-3.7 5.25-.76L10 2.2z"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinejoin="round"
        />
        <path d="M10 2.2v11.98l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76L10 2.2z" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 2.2l2.35 4.76 5.25.76-3.8 3.7.9 5.23L10 14.18 5.3 16.65l.9-5.23-3.8-3.7 5.25-.76L10 2.2z"
        fill={fill === 'full' ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const DshRatingImpl = defineComponent<{
  label?: unknown
  value?: unknown
  setValue?: (next: number) => void
  max?: number
  allowHalf?: boolean
  labels?: unknown
  variant?: 'star' | 'scale'
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(RatingApi, function DshRating({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)

  const max =
    typeof props.max === 'number' && Number.isFinite(props.max)
      ? Math.max(3, Math.min(10, Math.trunc(props.max)))
      : 5
  const allowHalf = Boolean(props.allowHalf)
  const score = clampRatingScore(props.value, max, allowHalf)
  const variant = props.variant === 'scale' ? 'scale' : 'star'
  const labels = useMemo(() => normalizeRatingLabels(props.labels), [props.labels])
  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined
  const activeDesc = score > 0 ? (labels[Math.ceil(score) - 1] ?? '') : ''

  const selectScore = (next: number) => {
    if (readOnly) return
    setTouched(true)
    props.setValue?.(next)
  }

  return (
    <div
      className={`${css.field} ${css.ratingField}`}
      style={weightStyle(props.weight, 160)}
      data-a2ui-rating=""
    >
      <div className={css.fieldHeader}>
        {label ? <span className={css.label}>{label}</span> : <span />}
        <span className={css.ratingSummary}>
          {activeDesc ? `${activeDesc} · ` : ''}
          {msg.ratingScoreOf(score, max)}
        </span>
      </div>
      {variant === 'scale' ? (
        <div className={css.ratingScaleRow} role="radiogroup" aria-label={label || msg.ratingAria}>
          {Array.from({ length: max }, (_, idx) => {
            const val = idx + 1
            const active = score === val
            return (
              <button
                key={val}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={readOnly}
                className={css.ratingScaleBtn}
                data-active={active ? 'true' : 'false'}
                onClick={() => selectScore(val)}
              >
                {val}
              </button>
            )
          })}
        </div>
      ) : (
        <div className={css.ratingStarsRow} role="radiogroup" aria-label={label || msg.ratingAria}>
          {Array.from({ length: max }, (_, idx) => {
            const fullVal = idx + 1
            const halfVal = idx + 0.5
            const fill: 'full' | 'half' | 'empty' =
              score >= fullVal ? 'full' : allowHalf && score >= halfVal ? 'half' : 'empty'
            return (
              <button
                key={fullVal}
                type="button"
                role="radio"
                aria-checked={score === fullVal || (allowHalf && score === halfVal)}
                aria-label={msg.ratingScoreOf(fullVal, max)}
                disabled={readOnly}
                className={css.ratingStarBtn}
                data-filled={fill !== 'empty' ? 'true' : 'false'}
                onClick={() => {
                  if (allowHalf && score === fullVal) {
                    selectScore(halfVal)
                  } else {
                    selectScore(fullVal)
                  }
                }}
              >
                <StarGlyph fill={fill} />
              </button>
            )
          })}
        </div>
      )}
      {err ? <span className={css.errorText}>{err}</span> : null}
    </div>
  )
})

export const DshImageCompareImpl = defineComponent<{
  beforeUrl?: unknown
  afterUrl?: unknown
  beforeLabel?: unknown
  afterLabel?: unknown
  title?: unknown
  initialPosition?: number
  height?: number
  weight?: number
}>(ImageCompareApi, function DshImageCompare({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const initialPos = clampImageComparePosition(props.initialPosition)
  const [prevInit, setPrevInit] = useState(initialPos)
  const [pos, setPos] = useState(initialPos)
  if (prevInit !== initialPos) {
    setPrevInit(initialPos)
    setPos(initialPos)
  }

  if (!isSafeImageUrl(props.beforeUrl) || !isSafeImageUrl(props.afterUrl)) return null
  const beforeSrc = String(props.beforeUrl)
  const afterSrc = String(props.afterUrl)
  const beforeLabel = props.beforeLabel ? String(props.beforeLabel) : msg.imageCompareDefaultBefore
  const afterLabel = props.afterLabel ? String(props.afterLabel) : msg.imageCompareDefaultAfter
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const height =
    typeof props.height === 'number' && Number.isFinite(props.height)
      ? Math.max(160, Math.min(520, props.height))
      : 260

  return (
    <div
      className={css.imageCompareCard}
      style={weightStyle(props.weight, 220)}
      data-a2ui-imagecompare=""
    >
      {title ? (
        <div className={css.imageCompareHeader}>
          <span className={css.imageCompareTitle}>{title}</span>
          <span className={css.imageComparePct}>{pos}%</span>
        </div>
      ) : null}
      <div className={css.imageCompareStage} style={{ height }}>
        <img
          src={afterSrc}
          alt={afterLabel}
          className={css.imageCompareImg}
          loading="lazy"
          draggable={false}
        />
        <div className={css.imageCompareOverlay} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <img
            src={beforeSrc}
            alt={beforeLabel}
            className={css.imageCompareImg}
            loading="lazy"
            draggable={false}
          />
        </div>
        <span className={`${css.imageCompareBadge} ${css.imageCompareBadgeLeft}`}>
          {beforeLabel}
        </span>
        <span className={`${css.imageCompareBadge} ${css.imageCompareBadgeRight}`}>
          {afterLabel}
        </span>
        <div className={css.imageCompareDivider} style={{ left: `${pos}%` }} aria-hidden="true">
          <span className={css.imageCompareHandle}>⇄</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          disabled={readOnly}
          aria-label={msg.imageCompareSliderAria}
          className={css.imageCompareRange}
          onChange={(e) => {
            if (!readOnly) setPos(clampImageComparePosition(e.target.value))
          }}
        />
      </div>
    </div>
  )
})

export const DshAnnotationTextImpl = defineComponent<{
  text?: unknown
  annotations?: unknown
  title?: unknown
  showLegend?: boolean
  action?: ((options?: ActionDispatchOptions) => unknown) | undefined
  weight?: number
}>(AnnotationTextApi, function DshAnnotationText({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const closeModal = useContext(ModalCloseContext)
  const getActionStatus = useContext(SurfaceActionStatusContext)

  const sourceText = props.text !== undefined && props.text !== null ? String(props.text) : ''
  const { segments, legend } = useMemo(
    () => buildAnnotatedTextSegments(sourceText, props.annotations),
    [sourceText, props.annotations],
  )
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const showLegend = props.showLegend !== false && legend.length > 0
  const clickable = !readOnly && typeof props.action === 'function'

  const triggerSpan = (ann: Extract<(typeof segments)[number], { kind: 'mark' }>['annotation']) => {
    if (!clickable || typeof props.action !== 'function') return
    const localFn = isLocalFunctionAction(context)
    const actionFn = props.action
    void runSurfaceAction(
      () =>
        actionFn({
          metadata: {
            extensions: {
              dshSelection: {
                source: 'annotationText',
                text: ann.text,
                label: ann.label,
                note: ann.note,
                sourceId: ann.sourceId,
              },
            },
          },
        }),
      getActionStatus,
    ).then((ok) => {
      if (!localFn && ok) closeModal?.()
    })
  }

  return (
    <div
      className={css.annotationCard}
      style={weightStyle(props.weight, 220)}
      data-a2ui-annotationtext=""
    >
      <div className={css.annotationInner}>
        {title || showLegend ? (
          <div className={css.annotationHeader}>
            {title ? <span className={css.annotationTitle}>{title}</span> : null}
            {showLegend ? (
              <div className={css.annotationLegend}>
                {legend.map((entry) => (
                  <span
                    key={`${entry.tone}-${entry.label}`}
                    className={css.annotationLegendPill}
                    data-tone={entry.tone}
                  >
                    <span className={css.annotationLegendDot} data-tone={entry.tone} />
                    <span>{entry.label}</span>
                    <span className={css.annotationLegendCount}>{entry.count}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {segments.length === 0 ? (
          <div className={css.emptyCell}>{msg.annotationEmpty}</div>
        ) : (
          <div className={css.annotationBody}>
            <DshHoverCardGroup>
              {segments.map((seg, idx) => {
                if (seg.kind === 'plain') {
                  return <span key={idx}>{seg.text}</span>
                }
                const ann = seg.annotation
                const markEl = clickable ? (
                  <button
                    type="button"
                    className={`${css.annotationMark} ${css.annotationMarkBtn}`}
                    data-tone={ann.tone}
                    onClick={() => triggerSpan(ann)}
                  >
                    <span>{ann.text}</span>
                    {ann.label ? <span className={css.annotationMarkTag}>{ann.label}</span> : null}
                  </button>
                ) : (
                  <mark className={css.annotationMark} data-tone={ann.tone}>
                    <span>{ann.text}</span>
                    {ann.label ? <span className={css.annotationMarkTag}>{ann.label}</span> : null}
                  </mark>
                )
                if (!ann.note && !ann.sourceId) {
                  return <span key={idx}>{markEl}</span>
                }
                const hoverContent = (
                  <div className={css.annotationHoverBody}>
                    {ann.label || ann.sourceId ? (
                      <div className={css.annotationHoverTitle}>
                        {ann.label ? <DshTag tone={ann.tone as TagTone}>{ann.label}</DshTag> : null}
                        {ann.sourceId ? (
                          <span className={css.annotationHoverSrc}>{ann.sourceId}</span>
                        ) : null}
                      </div>
                    ) : null}
                    {ann.note ? <div className={css.annotationHoverNote}>{ann.note}</div> : null}
                  </div>
                )
                return (
                  <DshHoverCard
                    key={idx}
                    grouped
                    inline
                    anchor={markEl}
                    content={hoverContent}
                    fallbackTitle={ann.note || ann.label}
                  />
                )
              })}
            </DshHoverCardGroup>
          </div>
        )}
      </div>
    </div>
  )
})
