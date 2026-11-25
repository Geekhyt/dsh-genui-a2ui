import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import { useContext, useMemo, useRef, useState } from 'react'
import {
  ChecklistApi,
  KvEditorApi,
  RangeSliderApi,
  SortableListApi,
} from '../../../shared/catalog-schema.ts'
import { isDangerousObjectKey } from '../../../shared/constants.ts'
import { useRuntimeMessages } from '../../i18n.ts'
import { DshButton, DshCheckbox, DshTag, type TagTone } from '../../ui/primitives.tsx'
import css from '../Catalog.module.css'
import {
  clampRangeSliderBounds,
  computeChecklistSummary,
  isKvKeySensitive,
  normalizeChecklistItems,
  normalizeKvEditorRows,
  normalizeSortableItems,
  reorderListItems,
} from '../v6-helpers.ts'
import {
  areExternalValuesEqual,
  defineComponent,
  isWritableProp,
  normalizeStringArrayValue,
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  useSurfaceActionRunner,
  useWritablePropState,
  weightStyle,
} from '../widget-helpers.tsx'

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
  const [activeThumb, setActiveThumb] = useState<'start' | 'end'>('end')
  const trackWrapRef = useRef<HTMLDivElement | null>(null)
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

  const toOptNum = (v: unknown): number | null => {
    const n =
      typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN
    return Number.isFinite(n) ? n : null
  }
  const rawStartNum = toOptNum(startVal)
  const rawEndNum = toOptNum(endVal)
  const wasInverted = rawStartNum !== null && rawEndNum !== null && rawStartNum > rawEndNum

  const selectThumbForClientX = (clientX: number) => {
    const rect = trackWrapRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
    if (state.start === state.end) {
      setActiveThumb(
        state.start >= state.max
          ? 'start'
          : state.end <= state.min
            ? 'end'
            : pct < state.startPct
              ? 'start'
              : 'end',
      )
      return
    }
    setActiveThumb(Math.abs(pct - state.startPct) <= Math.abs(pct - state.endPct) ? 'start' : 'end')
  }

  const startOnTop =
    state.start === state.end
      ? state.start >= state.max || (state.end > state.min && activeThumb === 'start')
      : activeThumb === 'start' || state.startPct > 85

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
      <div
        ref={trackWrapRef}
        className={css.rangeTrackWrap}
        onPointerMove={(e) => {
          if (!readOnly && e.buttons === 0) selectThumbForClientX(e.clientX)
        }}
        onPointerDown={(e) => {
          if (!readOnly) selectThumbForClientX(e.clientX)
        }}
      >
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
          style={{ zIndex: startOnTop ? 4 : 2 }}
          onFocus={() => setActiveThumb('start')}
          onChange={(e) => {
            if (readOnly) return
            setTouched(true)
            setActiveThumb('start')
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
          style={{ zIndex: startOnTop ? 3 : 4 }}
          onFocus={() => setActiveThumb('end')}
          onChange={(e) => {
            if (readOnly) return
            setTouched(true)
            setActiveThumb('end')
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
    () => (Array.isArray(props.value) ? normalizeStringArrayValue(props.value) : null),
    [props.value],
  )
  const seedCheckedIds = externalCheckedIds ?? defaultCheckedIds
  const itemIds = useMemo(() => items.map((it) => it.id), [items])
  const itemIdSet = useMemo(() => new Set(itemIds), [itemIds])
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

  const rawActiveCheckedList = hasWritableValue
    ? Array.isArray(props.value)
      ? normalizeStringArrayValue(props.value)
      : props.value === undefined
        ? defaultCheckedIds
        : []
    : localChecked
  const activeCheckedList = useMemo(
    () => rawActiveCheckedList.filter((id) => itemIdSet.has(id)),
    [rawActiveCheckedList, itemIdSet],
  )
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
          <ul className={css.checklistList} aria-invalid={showError || undefined}>
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

  const duplicateKeySet = useMemo(() => {
    const dups = new Set<string>()
    if (!isObjectBacked) return dups
    const seen = new Set<string>()
    for (const r of rows) {
      if (r.key === '') continue
      if (seen.has(r.key)) dups.add(r.key)
      else seen.add(r.key)
    }
    return dups
  }, [isObjectBacked, rows])

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
        pendingSnaps:
          snap === prev.lastExtSnap ? prev.pendingSnaps : [...prev.pendingSnaps.slice(-15), snap],
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
      pendingSnaps:
        snap === prev.lastExtSnap ? prev.pendingSnaps : [...prev.pendingSnaps.slice(-15), snap],
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
            {rows.map((row, idx) => {
              const isDupKey = row.key !== '' && duplicateKeySet.has(row.key)
              return (
                <div
                  key={row.id}
                  className={css.kvEditorRow}
                  data-readonly={readOnly ? 'true' : undefined}
                  data-duplicate={isDupKey ? 'true' : undefined}
                >
                  <input
                    type="text"
                    className={css.kvEditorInput}
                    value={row.key}
                    disabled={readOnly}
                    aria-invalid={showError || isDupKey || undefined}
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
                    autoComplete={row.sensitive ? 'off' : undefined}
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
              )
            })}
          </div>
        )}
        {err ? <span className={css.errorText}>{err}</span> : null}
      </div>
    </div>
  )
})
