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
  areExternalValuesEqual,
  defineComponent,
  isSafeImageUrl,
  isWritableProp,
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  useSurfaceActionRunner,
  useWritablePropState,
  weightStyle,
} from './widget-helpers.tsx'

interface KvDraftRow {
  readonly id: number
  readonly key: string
  readonly value: string
  readonly sensitive: boolean
}

function serializeKvSnapshot(raw: unknown): string {
  try {
    return JSON.stringify(raw) ?? ''
  } catch {
    return ''
  }
}

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
}>(RangeSliderApi, function DshRangeSlider({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [startVal, commitStart] = useWritablePropState(
    context,
    'start',
    props.start,
    props.setStart,
  )
  const [endVal, commitEnd] = useWritablePropState(context, 'end', props.end, props.setEnd)

  const state = clampRangeSliderBounds({
    min: props.min,
    max: props.max,
    start: startVal,
    end: endVal,
    step: props.step,
  })
  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const prefix = props.prefix !== undefined && props.prefix !== null ? String(props.prefix) : ''
  const unit = props.unit !== undefined && props.unit !== null ? String(props.unit) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined
  const fmt = (n: number) => `${prefix}${n}${unit}`

  const fillLeft = `calc(${state.startPct}% + ${(9 - 0.18 * state.startPct).toFixed(2)}px)`
  const fillRight = `calc(${100 - state.endPct}% + ${(9 - 0.18 * (100 - state.endPct)).toFixed(2)}px)`

  const rawStartNum = typeof startVal === 'number' ? startVal : Number(startVal)
  const rawEndNum = typeof endVal === 'number' ? endVal : Number(endVal)
  const wasInverted =
    Number.isFinite(rawStartNum) && Number.isFinite(rawEndNum) && rawStartNum > rawEndNum

  return (
    <div
      className={`${css.field} ${css.rangeSliderField}`}
      style={weightStyle(props.weight, 180)}
      data-a2ui-rangeslider=""
    >
      <div className={css.sliderHeader}>
        {label ? <span className={css.label}>{label}</span> : <span />}
        <span className={css.sliderOutput}>
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
          aria-invalid={showError || undefined}
          aria-label={label ? `${label} ${msg.rangeSliderStartAria}` : msg.rangeSliderStartAria}
          style={{ zIndex: state.startPct > 85 ? 4 : 2 }}
          onChange={(e) => {
            if (readOnly) return
            setTouched(true)
            const next = Number(e.target.value)
            if (Number.isFinite(next)) {
              commitStart(Math.min(next, state.end))
              if (wasInverted) commitEnd(state.end)
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
          aria-invalid={showError || undefined}
          aria-label={label ? `${label} ${msg.rangeSliderEndAria}` : msg.rangeSliderEndAria}
          style={{ zIndex: 3 }}
          onChange={(e) => {
            if (readOnly) return
            setTouched(true)
            const next = Number(e.target.value)
            if (Number.isFinite(next)) {
              commitEnd(Math.max(next, state.start))
              if (wasInverted) commitStart(state.start)
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
  const runAction = useSurfaceActionRunner(context, props.action)
  const { submitAttempted, markSubmitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)

  const items = useMemo(() => normalizeChecklistItems(props.items), [props.items])
  const hasWritableValue = isWritableProp(context, 'value', props.setValue)
  const defaultCheckedIds = useMemo(
    () => items.filter((it) => it.defaultChecked).map((it) => it.id),
    [items],
  )
  const externalCheckedIds = useMemo(
    () => (Array.isArray(props.value) ? props.value.map(String) : null),
    [props.value],
  )
  const seedCheckedIds = externalCheckedIds ?? defaultCheckedIds
  const itemIds = useMemo(() => items.map((it) => it.id), [items])
  const [localChecked, setLocalChecked] = useState<readonly string[]>(seedCheckedIds)
  const [prevSeedChecked, setPrevSeedChecked] = useState<readonly string[]>(seedCheckedIds)
  const [prevItemIds, setPrevItemIds] = useState<readonly string[]>(itemIds)
  if (!hasWritableValue) {
    if (
      (externalCheckedIds !== null || !touched) &&
      !areExternalValuesEqual(prevSeedChecked, seedCheckedIds)
    ) {
      setPrevSeedChecked(seedCheckedIds)
      setPrevItemIds(itemIds)
      setLocalChecked(seedCheckedIds)
    } else if (externalCheckedIds === null && !areExternalValuesEqual(prevItemIds, itemIds)) {
      const validSet = new Set(itemIds)
      const prevSet = new Set(prevItemIds)
      const kept = localChecked.filter((id) => validSet.has(id))
      const keptSet = new Set(kept)
      const addedDefaults = defaultCheckedIds.filter((id) => !prevSet.has(id) && !keptSet.has(id))
      setPrevItemIds(itemIds)
      setPrevSeedChecked(seedCheckedIds)
      setLocalChecked([...kept, ...addedDefaults])
    }
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
    if (readOnly || !runAction) return
    if (blockedByRequired || props.isValid === false) {
      setTouched(true)
      markSubmitAttempted()
      return
    }
    void runAction({
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
              aria-disabled={props.isValid === false || undefined}
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
  const runAction = useSurfaceActionRunner(context, props.action)

  const hasWritableItems = isWritableProp(context, 'items', props.setItems)
  const propItems = useMemo(() => normalizeSortableItems(props.items), [props.items])
  const propItemsSnap = useMemo(() => serializeKvSnapshot(props.items), [props.items])
  const [localItems, setLocalItems] = useState(propItems)
  const [prevPropSnap, setPrevPropSnap] = useState(propItemsSnap)
  if (!hasWritableItems && prevPropSnap !== propItemsSnap) {
    setPrevPropSnap(propItemsSnap)
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
    if (readOnly || !runAction) return
    void runAction({
      metadata: {
        extensions: {
          dshSelection: {
            source: 'sortableList',
            items: activeItems.map((it) => it.raw),
          },
        },
      },
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
                onDragStart={(e) => {
                  if (readOnly) return
                  e.dataTransfer?.setData('text/plain', String(idx))
                  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
                  setDragIdx(idx)
                }}
                onDragOver={(e) => {
                  if (readOnly || dragIdx === null) return
                  e.preventDefault()
                  if (overIdx !== idx) setOverIdx(idx)
                }}
                onDrop={(e) => {
                  if (readOnly || dragIdx === null) return
                  e.preventDefault()
                  if (dragIdx !== idx) {
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
  const extSnap = useMemo(() => serializeKvSnapshot(props.items), [props.items])
  const [draftState, setDraftState] = useState<{
    readonly rows: readonly KvDraftRow[]
    readonly nextId: number
    readonly lastExtSnap: string
    readonly pendingSnaps: readonly string[]
  }>(() => ({
    rows: propRows.map((r, idx) => ({ ...r, id: idx + 1 })),
    nextId: propRows.length + 1,
    lastExtSnap: extSnap,
    pendingSnaps: [],
  }))
  if (draftState.lastExtSnap !== extSnap) {
    const matchIdx = draftState.pendingSnaps.indexOf(extSnap)
    if (matchIdx >= 0) {
      setDraftState((prev) => ({
        ...prev,
        lastExtSnap: extSnap,
        pendingSnaps: prev.pendingSnaps.slice(matchIdx + 1),
      }))
    } else {
      let idCursor = draftState.nextId
      const usedPrevIds = new Set<number>()
      const synced = propRows.map((r, idx) => {
        const prevAtIdx = draftState.rows[idx]
        if (prevAtIdx && !usedPrevIds.has(prevAtIdx.id) && prevAtIdx.key === r.key) {
          usedPrevIds.add(prevAtIdx.id)
          return { ...r, id: prevAtIdx.id }
        }
        const prevByKey =
          r.key !== ''
            ? draftState.rows.find((p) => p.key === r.key && !usedPrevIds.has(p.id))
            : undefined
        if (prevByKey) {
          usedPrevIds.add(prevByKey.id)
          return { ...r, id: prevByKey.id }
        }
        if (prevAtIdx && !usedPrevIds.has(prevAtIdx.id)) {
          usedPrevIds.add(prevAtIdx.id)
          return { ...r, id: prevAtIdx.id }
        }
        return { ...r, id: idCursor++ }
      })
      setDraftState({
        rows: synced,
        nextId: idCursor,
        lastExtSnap: extSnap,
        pendingSnaps: [],
      })
    }
  }
  const rows = draftState.rows
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

  const commitRows = (nextRows: readonly KvDraftRow[], nextId = draftState.nextId) => {
    setTouched(true)
    const normalized: KvDraftRow[] = nextRows.map((r) => ({
      id: r.id,
      key: r.key,
      value: r.value,
      sensitive: isKvKeySensitive(r.key),
    }))
    if (!hasWritableItems) {
      setDraftState((prev) => ({ ...prev, rows: normalized, nextId }))
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
      const snap = serializeKvSnapshot(obj)
      setDraftState((prev) => ({
        ...prev,
        rows: normalized,
        nextId,
        pendingSnaps: [...prev.pendingSnaps.slice(-15), snap],
      }))
      props.setItems?.(obj)
      return
    }
    const arr = normalized.map((r) => ({ key: r.key, value: r.value }))
    const snap = serializeKvSnapshot(arr)
    setDraftState((prev) => ({
      ...prev,
      rows: normalized,
      nextId,
      pendingSnaps: [...prev.pendingSnaps.slice(-15), snap],
    }))
    props.setItems?.(arr)
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
              onClick={() => {
                const newKey = nextAddedKey()
                commitRows(
                  [
                    ...rows,
                    {
                      id: draftState.nextId,
                      key: newKey,
                      value: '',
                      sensitive: isKvKeySensitive(newKey),
                    },
                  ],
                  draftState.nextId + 1,
                )
              }}
            >
              + {addLabel}
            </button>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <div className={css.emptyCell}>{msg.kvEditorEmpty}</div>
        ) : (
          <div className={css.kvEditorList}>
            <div
              className={css.kvEditorColHeads}
              data-readonly={readOnly ? 'true' : undefined}
              aria-hidden="true"
            >
              <span>{keyLabel}</span>
              <span>{valueLabel}</span>
              {!readOnly ? <span /> : null}
            </div>
            {rows.map((row, idx) => (
              <div
                key={row.id}
                className={css.kvEditorRow}
                data-readonly={readOnly ? 'true' : undefined}
              >
                <input
                  type="text"
                  className={css.kvEditorInput}
                  value={row.key}
                  disabled={readOnly}
                  aria-invalid={showError || undefined}
                  placeholder={keyPlaceholder}
                  aria-label={`${keyLabel} #${idx + 1}`}
                  onChange={(e) => {
                    if (readOnly) return
                    const next = rows.map((r) =>
                      r.id === row.id ? { ...r, key: e.target.value } : r,
                    )
                    commitRows(next)
                  }}
                />
                <input
                  type={row.sensitive ? 'password' : 'text'}
                  className={css.kvEditorInput}
                  value={row.value}
                  disabled={readOnly}
                  aria-invalid={showError || undefined}
                  placeholder={valuePlaceholder}
                  aria-label={`${valueLabel} #${idx + 1}`}
                  onChange={(e) => {
                    if (readOnly) return
                    const next = rows.map((r) =>
                      r.id === row.id ? { ...r, value: e.target.value } : r,
                    )
                    commitRows(next)
                  }}
                />
                {!readOnly ? (
                  <button
                    type="button"
                    className={css.kvEditorDelBtn}
                    aria-label={msg.kvEditorRemoveAria}
                    onClick={() => commitRows(rows.filter((r) => r.id !== row.id))}
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
}>(RatingApi, function DshRating({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [rawVal, commitVal] = useWritablePropState(context, 'value', props.value, props.setValue)

  const max =
    typeof props.max === 'number' && Number.isFinite(props.max)
      ? Math.max(3, Math.min(10, Math.trunc(props.max)))
      : 5
  const variant = props.variant === 'scale' ? 'scale' : 'star'
  const allowHalf = variant === 'star' && Boolean(props.allowHalf)
  const score = clampRatingScore(rawVal, max, allowHalf)
  const labels = useMemo(() => normalizeRatingLabels(props.labels), [props.labels])
  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined
  const activeDesc = score > 0 ? (labels[Math.ceil(score) - 1] ?? '') : ''

  const selectScore = (next: number) => {
    if (readOnly) return
    setTouched(true)
    commitVal(next)
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
            const isHalfChecked = allowHalf && score === halfVal
            return (
              <button
                key={fullVal}
                type="button"
                role="radio"
                aria-checked={score === fullVal || isHalfChecked}
                aria-label={msg.ratingScoreOf(isHalfChecked ? halfVal : fullVal, max)}
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
  const [brokenSrcs, setBrokenSrcs] = useState<ReadonlySet<string>>(() => new Set())
  if (prevInit !== initialPos) {
    setPrevInit(initialPos)
    setPos(initialPos)
  }

  if (!isSafeImageUrl(props.beforeUrl) || !isSafeImageUrl(props.afterUrl)) return null
  const beforeSrc = String(props.beforeUrl)
  const afterSrc = String(props.afterUrl)
  const markBroken = (src: string) => {
    setBrokenSrcs((prev) => {
      if (prev.has(src)) return prev
      const next = new Set(prev)
      next.add(src)
      return next
    })
  }
  const beforeFailed = brokenSrcs.has(beforeSrc)
  const afterFailed = brokenSrcs.has(afterSrc)
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
      <div className={css.imageCompareStage} style={{ minHeight: height }}>
        {afterFailed ? (
          <div className={css.emptyCell} style={{ minHeight: height }}>
            {afterLabel}
          </div>
        ) : (
          <img
            src={afterSrc}
            alt={afterLabel}
            className={css.imageCompareImg}
            loading="lazy"
            draggable={false}
            onError={() => markBroken(afterSrc)}
          />
        )}
        <div className={css.imageCompareOverlay} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {beforeFailed ? (
            <div className={css.emptyCell} style={{ minHeight: height }}>
              {beforeLabel}
            </div>
          ) : (
            <img
              src={beforeSrc}
              alt={beforeLabel}
              className={css.imageCompareImg}
              loading="lazy"
              draggable={false}
              onError={() => markBroken(beforeSrc)}
            />
          )}
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
  const runAction = useSurfaceActionRunner(context, props.action)

  const sourceText = props.text !== undefined && props.text !== null ? String(props.text) : ''
  const { segments, legend } = useMemo(
    () => buildAnnotatedTextSegments(sourceText, props.annotations),
    [sourceText, props.annotations],
  )
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const showLegend = props.showLegend !== false && legend.length > 0
  const clickable = !readOnly && Boolean(runAction)

  const triggerSpan = (ann: Extract<(typeof segments)[number], { kind: 'mark' }>['annotation']) => {
    if (!clickable || !runAction) return
    void runAction({
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
                  <mark
                    role="button"
                    tabIndex={0}
                    className={`${css.annotationMark} ${css.annotationMarkBtn}`}
                    data-tone={ann.tone}
                    onClick={() => triggerSpan(ann)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        triggerSpan(ann)
                      }
                    }}
                  >
                    <span>{ann.text}</span>
                    {ann.label ? <span className={css.annotationMarkTag}>{ann.label}</span> : null}
                  </mark>
                ) : (
                  <mark
                    className={css.annotationMark}
                    data-tone={ann.tone}
                    tabIndex={ann.note || ann.sourceId ? 0 : undefined}
                  >
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
