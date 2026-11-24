import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import {
  type CSSProperties,
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useContext,
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCardApi,
  DateRangeApi,
  MultiSelectApi,
  NumberInputApi,
  TreeApi,
  TreeSelectApi,
} from '../../shared/catalog-schema.ts'
import { formatNativeTemporalValue } from '../../shared/temporal.ts'
import { usePortalPopover } from '../dom-hooks.ts'
import { useRuntimeMessages } from '../i18n.ts'
import { useDarkTheme } from '../theme.ts'
import {
  DshCheckIcon,
  DshChevronDownIcon,
  DshInput,
  DshPill,
  DshSearchIcon,
  DshStateDot,
  DshTag,
} from '../ui/primitives.tsx'
import css from './Catalog.module.css'
import {
  buildDatePresetRange,
  clampAndStepNumber,
  collectBranchDepths,
  computeDateRangeSpanDays,
  filterHierarchyTree,
  findBreadcrumbByValue,
  type NormalizedHierarchyNode,
  normalizeCheckCardOptions,
  normalizeHierarchyTree,
  normalizeMultiSelectMergedOptions,
} from './v5-helpers.ts'
import {
  type ClampedPopoverBox,
  computeClampedPopoverBox,
  defineComponent,
  isLocalFunctionAction,
  isWritableProp,
  ModalCloseContext,
  NativeDateField,
  runSurfaceAction,
  SurfaceActionStatusContext,
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  useSurfaceActionRunner,
  useWritablePropState,
  weightStyle,
} from './widget-helpers.tsx'

const SEARCH_ICON_14 = <DshSearchIcon size={14} />
const CHEVRON_DOWN_14 = <DshChevronDownIcon size={14} />
const CHECK_ICON_12 = <DshCheckIcon size={12} />

function handleOptionListArrowKey(
  e: ReactKeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
  roleSelector = '[role="option"]',
): void {
  if (!container) return
  if (
    (e.key === 'Home' || e.key === 'End') &&
    typeof HTMLInputElement !== 'undefined' &&
    e.target instanceof HTMLInputElement
  ) {
    return
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
  const items = Array.from(container.querySelectorAll<HTMLButtonElement>(roleSelector))
  if (items.length === 0) return
  const active = typeof document !== 'undefined' ? document.activeElement : null
  const idx = items.indexOf(active as HTMLButtonElement)
  e.preventDefault()
  if (e.key === 'Home') {
    items[0]?.focus()
  } else if (e.key === 'End') {
    items[items.length - 1]?.focus()
  } else if (e.key === 'ArrowDown') {
    items[idx >= 0 ? (idx + 1) % items.length : 0]?.focus()
  } else if (e.key === 'ArrowUp') {
    items[idx > 0 ? idx - 1 : items.length - 1]?.focus()
  }
}

export const DshNumberInputImpl = defineComponent<{
  label?: unknown
  value?: unknown
  setValue?: (next: number) => void
  min?: number
  max?: number
  step?: number
  unit?: unknown
  prefix?: unknown
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(NumberInputApi, function DshNumberInput({ props, context }) {
  const inputId = useId()
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')
  const [prevValueKey, setPrevValueKey] = useState<string | null>(null)
  const [rawVal, commitValue] = useWritablePropState(context, 'value', props.value, props.setValue)

  const hasRawVal = rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== ''
  const numVal = hasRawVal ? Number(rawVal) : Number.NaN
  const hasValidNum = hasRawVal && Number.isFinite(numVal)
  const safeMin =
    typeof props.min === 'number' && Number.isFinite(props.min) ? props.min : undefined
  const safeMax =
    typeof props.max === 'number' && Number.isFinite(props.max) ? props.max : undefined
  const safeVal = hasValidNum ? numVal : (safeMin ?? 0)
  const valueKey = hasValidNum ? String(numVal) : ''
  if (prevValueKey !== valueKey) {
    setPrevValueKey(valueKey)
    if (focused) {
      const trimmedDraft = draft.trim()
      const parsedDraft = trimmedDraft === '' ? Number.NaN : Number(trimmedDraft)
      const draftMatches =
        (hasValidNum && Number.isFinite(parsedDraft) && parsedDraft === numVal) ||
        (!hasValidNum && trimmedDraft === '')
      if (!draftMatches) {
        setDraft(valueKey)
      }
    }
  }
  const step =
    typeof props.step === 'number' && Number.isFinite(props.step) && props.step > 0 ? props.step : 1
  const atMin = hasValidNum && safeMin !== undefined && numVal <= safeMin
  const atMax = hasValidNum && safeMax !== undefined && numVal >= safeMax

  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const unit = props.unit !== undefined && props.unit !== null ? String(props.unit) : ''
  const prefix = props.prefix !== undefined && props.prefix !== null ? String(props.prefix) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  const applyDelta = (delta: number) => {
    if (readOnly) return
    setTouched(true)
    const next = hasValidNum
      ? clampAndStepNumber({
          current: numVal,
          delta,
          min: safeMin,
          max: safeMax,
          step,
        })
      : clampAndStepNumber({
          current: safeVal,
          delta: 0,
          min: safeMin,
          max: safeMax,
          step,
        })
    if (focused) setDraft(String(next))
    commitValue(next)
  }

  return (
    <div className={css.field} style={weightStyle(props.weight, 150)} data-a2ui-numberinput="">
      {label || err ? (
        <div className={css.fieldHeader}>
          {label ? (
            <label htmlFor={inputId} className={css.label}>
              {label}
            </label>
          ) : (
            <span />
          )}
          {err ? <span className={css.errorText}>{err}</span> : null}
        </div>
      ) : null}

      <div className={css.numberStepperBox} data-disabled={readOnly ? 'true' : 'false'}>
        <button
          type="button"
          className={css.numberStepBtn}
          disabled={readOnly || atMin}
          aria-label={msg.numberDecrementAria}
          onClick={() => applyDelta(-1)}
        >
          −
        </button>
        <div className={css.numberCenterField}>
          {prefix ? <span className={css.numberAffix}>{prefix}</span> : null}
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            role="spinbutton"
            aria-valuenow={hasValidNum ? numVal : undefined}
            aria-valuemin={safeMin}
            aria-valuemax={safeMax}
            className={css.numberBareInput}
            value={focused ? draft : hasValidNum ? String(numVal) : ''}
            disabled={readOnly}
            aria-invalid={showError || undefined}
            onFocus={() => {
              setFocused(true)
              setDraft(hasValidNum ? String(numVal) : '')
            }}
            onBlur={() => {
              setFocused(false)
              setTouched(true)
              const trimmed = draft.trim()
              if (trimmed === '') {
                if (hasValidNum) {
                  commitValue('' as unknown as number)
                }
                return
              }
              const parsed = Number(trimmed)
              let clamped = Number.isFinite(parsed) ? parsed : safeVal
              if (safeMin !== undefined) clamped = Math.max(safeMin, clamped)
              if (safeMax !== undefined) clamped = Math.min(safeMax, clamped)
              if (!hasValidNum || clamped !== numVal) commitValue(clamped)
            }}
            onKeyDown={(e) => {
              if (readOnly) return
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                applyDelta(1)
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                applyDelta(-1)
              } else if (e.key === 'Home' && safeMin !== undefined) {
                e.preventDefault()
                setTouched(true)
                if (focused) setDraft(String(safeMin))
                commitValue(safeMin)
              } else if (e.key === 'End' && safeMax !== undefined) {
                e.preventDefault()
                setTouched(true)
                if (focused) setDraft(String(safeMax))
                commitValue(safeMax)
              }
            }}
            onChange={(e) => {
              if (readOnly) return
              setTouched(true)
              const rawText = e.target.value
              if (!/^-?\d*\.?\d*(?:[eE][+-]?\d*)?$/.test(rawText.trim())) return
              setDraft(rawText)
              const trimmed = rawText.trim()
              if (trimmed === '') {
                commitValue('' as unknown as number)
                return
              }
              if (
                trimmed === '-' ||
                trimmed === '.' ||
                trimmed === '-.' ||
                /[eE][+-]?$/.test(trimmed)
              ) {
                return
              }
              const parsed = Number(trimmed)
              if (Number.isFinite(parsed)) {
                commitValue(parsed)
              }
            }}
          />
          {unit ? <span className={css.numberAffix}>{unit}</span> : null}
        </div>
        <button
          type="button"
          className={css.numberStepBtn}
          disabled={readOnly || atMax}
          aria-label={msg.numberIncrementAria}
          onClick={() => applyDelta(1)}
        >
          +
        </button>
      </div>
    </div>
  )
})

export const DshMultiSelectImpl = defineComponent<{
  label?: unknown
  options?: unknown
  value?: unknown
  setValue?: (next: string[]) => void
  placeholder?: unknown
  searchable?: boolean
  allowCreate?: boolean
  maxTagCount?: number
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(MultiSelectApi, function DshMultiSelect({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [open, setOpen] = useState(false)
  const dark = useDarkTheme()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [popoverBox, setPopoverBox] = useState<ClampedPopoverBox | null>(null)
  if (readOnly && open) {
    setOpen(false)
  }
  const effectiveOpen = open && !readOnly
  const [rawSelected, commitSelected] = useWritablePropState(
    context,
    'value',
    props.value,
    props.setValue,
  )

  const selected = useMemo(
    () =>
      Array.isArray(rawSelected)
        ? Array.from(new Set(rawSelected.map(String).filter(Boolean)))
        : [],
    [rawSelected],
  )
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const allOptions = useMemo(
    () => normalizeMultiSelectMergedOptions(props.options, selected),
    [props.options, selected],
  )
  const labelMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of allOptions) m.set(o.value, o.label)
    return m
  }, [allOptions])

  const searchable = props.searchable !== false
  const allowCreate = Boolean(props.allowCreate)
  const maxTagCount =
    typeof props.maxTagCount === 'number' && props.maxTagCount >= 1
      ? Math.trunc(props.maxTagCount)
      : 5

  const filteredOptions = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!searchable || !q) return allOptions
    return allOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.description ? o.description.toLowerCase().includes(q) : false),
    )
  }, [allOptions, searchable, deferredQuery])

  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const placeholder =
    props.placeholder !== undefined && props.placeholder !== null
      ? String(props.placeholder)
      : msg.multiSelectPlaceholder
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  const closePopover = useCallback(() => {
    setOpen(false)
    setQuery('')
    setTouched(true)
  }, [])

  const syncPopoverBox = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPopoverBox(computeClampedPopoverBox(rect, { minWidth: 220, estHeight: 260 }))
  }, [])

  usePortalPopover({
    open: effectiveOpen,
    triggerRef,
    popoverRef,
    onClose: closePopover,
    onReposition: syncPopoverBox,
  })

  const openPopover = () => {
    if (readOnly) return
    if (effectiveOpen) {
      closePopover()
      return
    }
    syncPopoverBox()
    setOpen(true)
  }

  const toggleValue = (val: string) => {
    if (readOnly) return
    setTouched(true)
    const next = selectedSet.has(val) ? selected.filter((v) => v !== val) : [...selected, val]
    commitSelected(next)
  }

  const shownTags = selected.slice(0, maxTagCount)
  const overflowCount = Math.max(0, selected.length - shownTags.length)

  return (
    <div className={css.field} style={weightStyle(props.weight, 180)} data-a2ui-multiselect="">
      {label || err || selected.length > 0 ? (
        <div className={css.fieldHeader}>
          {label ? <span className={css.label}>{label}</span> : <span />}
          {err ? (
            <span className={css.errorText}>{err}</span>
          ) : selected.length > 0 ? (
            <span className={css.multiSelectMeta}>
              {msg.multiSelectSelectedCount(selected.length)}
              {!readOnly ? (
                <button
                  type="button"
                  className={css.multiClearBtn}
                  onClick={() => {
                    if (readOnly) return
                    setTouched(true)
                    commitSelected([])
                  }}
                >
                  {msg.multiSelectClearAll}
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        ref={triggerRef}
        role="combobox"
        aria-label={label || placeholder}
        aria-expanded={effectiveOpen}
        aria-invalid={showError || undefined}
        tabIndex={readOnly ? -1 : 0}
        className={css.multiSelectTrigger}
        data-disabled={readOnly ? 'true' : 'false'}
        onClick={openPopover}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openPopover()
          }
        }}
      >
        <div className={css.multiTagWrap}>
          {selected.length === 0 ? (
            <span className={css.multiPlaceholder}>{placeholder}</span>
          ) : (
            <>
              {shownTags.map((val) => (
                <span key={val} className={css.multiTagChip}>
                  <span className={css.multiTagText}>{labelMap.get(val) ?? val}</span>
                  {!readOnly ? (
                    <button
                      type="button"
                      className={css.multiTagRemove}
                      aria-label={msg.multiSelectRemoveTagAria(labelMap.get(val) ?? val)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation()
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleValue(val)
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ))}
              {overflowCount > 0 ? <DshTag tone="neutral">{`+${overflowCount}`}</DshTag> : null}
            </>
          )}
        </div>
        <span className={css.selectTriggerChevron} aria-hidden="true">
          {CHEVRON_DOWN_14}
        </span>
      </div>

      {effectiveOpen && popoverBox && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="presentation"
              data-a2ui-portal-popover=""
              className={`${css.selectBackdrop} ${dark ? 'a2ui-dark' : 'a2ui-light'}`}
              onClick={(e) => {
                e.stopPropagation()
                closePopover()
              }}
            >
              <div
                ref={popoverRef}
                data-a2ui-select-popover=""
                className={css.selectPopover}
                style={{
                  ...(popoverBox.placeAbove
                    ? { bottom: popoverBox.bottom }
                    : { top: popoverBox.top }),
                  left: popoverBox.left,
                  width: popoverBox.width,
                  maxHeight: popoverBox.maxHeight,
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => handleOptionListArrowKey(e, popoverRef.current)}
              >
                {searchable || allowCreate ? (
                  <div className={css.selectSearchRow}>
                    <DshInput
                      autoFocus
                      icon={SEARCH_ICON_14}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (readOnly) return
                        if (e.key === 'Enter' && allowCreate && query.trim() !== '') {
                          e.preventDefault()
                          const clean = query.trim()
                          if (!selectedSet.has(clean)) {
                            setTouched(true)
                            commitSelected([...selected, clean])
                          }
                          setQuery('')
                        }
                      }}
                      placeholder={
                        allowCreate ? msg.multiSelectSearchCreate : msg.multiSelectSearchOnly
                      }
                    />
                  </div>
                ) : null}
                <div
                  role="listbox"
                  aria-multiselectable="true"
                  aria-label={label || placeholder}
                  className={css.selectOptionList}
                >
                  {filteredOptions.length === 0 ? (
                    <div className={css.selectEmpty}>{msg.selectNoResults}</div>
                  ) : (
                    filteredOptions.map((opt) => {
                      const active = selectedSet.has(opt.value)
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={css.selectOptionBtn}
                          data-selected={active ? 'true' : 'false'}
                          onClick={() => toggleValue(opt.value)}
                        >
                          <span className={css.selectOptionCopy}>
                            <span className={css.selectOptionLabel}>{opt.label}</span>
                            {opt.description ? (
                              <span className={css.selectOptionDesc}>{opt.description}</span>
                            ) : null}
                          </span>
                          {active ? (
                            <span className={css.selectOptionCheck}>{CHECK_ICON_12}</span>
                          ) : null}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
})

export const DshDateRangeImpl = defineComponent<{
  label?: unknown
  start?: unknown
  setStart?: (next: string) => void
  end?: unknown
  setEnd?: (next: string) => void
  presets?: boolean
  enableTime?: boolean
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(DateRangeApi, function DshDateRange({ props, context }) {
  const msg = useRuntimeMessages()
  const dark = useDarkTheme()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const enableTime = Boolean(props.enableTime)
  const showPresets = props.presets !== false
  const inputType = enableTime ? 'datetime-local' : 'date'
  const [rawStart, commitStart] = useWritablePropState(
    context,
    'start',
    props.start,
    props.setStart,
  )
  const [rawEnd, commitEnd] = useWritablePropState(context, 'end', props.end, props.setEnd)

  const normStart = formatNativeTemporalValue(rawStart, inputType, 'start')
  const normEnd = formatNativeTemporalValue(rawEnd, inputType, 'end')

  const spanDays = useMemo(() => computeDateRangeSpanDays(normStart, normEnd), [normStart, normEnd])
  const todayIso = useMemo(() => buildDatePresetRange(1, false).start, [])
  const isTodaySelected =
    spanDays === 1 && normStart.slice(0, 10) === todayIso && normEnd.slice(0, 10) === todayIso
  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  const applyPreset = (days: number) => {
    if (readOnly) return
    setTouched(true)
    const next = buildDatePresetRange(
      days,
      enableTime,
      days === 1 ? undefined : normEnd || undefined,
    )
    commitStart(next.start)
    commitEnd(next.end)
  }

  return (
    <div
      className={css.dateRangeCard}
      style={weightStyle(props.weight, 220)}
      data-a2ui-daterange=""
    >
      {label || spanDays !== null || err ? (
        <div className={css.fieldHeader}>
          {label ? <span className={css.label}>{label}</span> : <span />}
          {err ? (
            <span className={css.errorText}>{err}</span>
          ) : spanDays !== null ? (
            <DshTag tone="info">{msg.dateRangeSpanDays(spanDays)}</DshTag>
          ) : null}
        </div>
      ) : null}

      {showPresets && !readOnly ? (
        <div className={css.datePresetBar}>
          {[
            { days: 1, text: msg.dateRangePresetToday },
            { days: 7, text: msg.dateRangePreset7d },
            { days: 30, text: msg.dateRangePreset30d },
            { days: 90, text: msg.dateRangePreset90d },
          ].map((p) => {
            const active = p.days === 1 ? isTodaySelected : spanDays === p.days
            return (
              <DshPill
                key={p.days}
                active={active}
                aria-pressed={active}
                onClick={() => applyPreset(p.days)}
              >
                {p.text}
              </DshPill>
            )
          })}
        </div>
      ) : null}

      <div
        className={css.dateRangeInputs}
        data-disabled={readOnly ? 'true' : 'false'}
        data-enable-time={enableTime ? 'true' : undefined}
      >
        <NativeDateField
          type={inputType}
          dark={dark}
          value={normStart}
          disabled={readOnly}
          ariaLabel={msg.dateRangeStartAria}
          ariaInvalid={showError || undefined}
          wrapClassName={css.dateRangeInputWrap}
          inputClassName={css.dateRangeInput}
          buttonClassName={css.dateRangePickerBtn}
          iconSize={13}
          onBlur={() => setTouched(true)}
          onChange={(nextS) => {
            if (readOnly) return
            setTouched(true)
            commitStart(nextS)
            if (nextS !== '' && normEnd && nextS > normEnd) {
              commitEnd(nextS)
            }
          }}
        />
        <span className={css.dateRangeArrow} aria-hidden="true">
          →
        </span>
        <NativeDateField
          type={inputType}
          dark={dark}
          value={normEnd}
          disabled={readOnly}
          ariaLabel={msg.dateRangeEndAria}
          ariaInvalid={showError || undefined}
          wrapClassName={css.dateRangeInputWrap}
          inputClassName={css.dateRangeInput}
          buttonClassName={css.dateRangePickerBtn}
          iconSize={13}
          onBlur={() => setTouched(true)}
          onChange={(nextE) => {
            if (readOnly) return
            setTouched(true)
            commitEnd(nextE)
            if (nextE !== '' && normStart && nextE < normStart) {
              commitStart(nextE)
            }
          }}
        />
      </div>
    </div>
  )
})

function TreeSelectOptionBranch(props: {
  readonly node: NormalizedHierarchyNode
  readonly depth: number
  readonly selectedValue: string
  readonly forceExpanded: boolean
  readonly onSelect: (val: string) => void
}) {
  const { node, depth, selectedValue, forceExpanded, onSelect } = props
  const [expanded, setExpanded] = useState(true)
  const isBranch = node.children.length > 0
  const isOpen = forceExpanded || expanded
  const isSelected = node.value === selectedValue
  const selectableBranch = isBranch && Boolean(node.hasExplicitValue)

  return (
    <Fragment>
      <div
        className={css.treeSelectRow}
        data-selected={isSelected ? 'true' : 'false'}
        style={{ paddingLeft: 8 + Math.min(depth, 5) * 13 }}
      >
        {isBranch ? (
          <button
            type="button"
            className={css.treeCaretBtn}
            disabled={forceExpanded}
            aria-label={node.label}
            aria-expanded={isOpen}
            onClick={(e) => {
              e.stopPropagation()
              if (!forceExpanded) setExpanded((v) => !v)
            }}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className={css.treeLeafSpacer} />
        )}
        <button
          type="button"
          role="treeitem"
          aria-selected={isSelected}
          aria-expanded={isBranch ? isOpen : undefined}
          className={css.treeSelectNodeBtn}
          onClick={() => {
            if (isBranch && !selectableBranch) {
              if (!forceExpanded) setExpanded((v) => !v)
            } else {
              onSelect(node.value)
            }
          }}
        >
          <span className={isBranch ? css.treeSelectGroupText : css.treeSelectLeafText}>
            {node.label}
          </span>
          {node.badge ? <DshTag tone="neutral">{node.badge}</DshTag> : null}
          {isSelected ? <span className={css.selectOptionCheck}>{CHECK_ICON_12}</span> : null}
        </button>
      </div>
      {isBranch && isOpen
        ? node.children.map((child) => (
            <TreeSelectOptionBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedValue={selectedValue}
              forceExpanded={forceExpanded}
              onSelect={onSelect}
            />
          ))
        : null}
    </Fragment>
  )
}

export const DshTreeSelectImpl = defineComponent<{
  label?: unknown
  nodes?: unknown
  value?: unknown
  setValue?: (next: string) => void
  placeholder?: unknown
  searchable?: boolean
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(TreeSelectApi, function DshTreeSelect({ props, context }) {
  const fieldId = useId()
  const msg = useRuntimeMessages()
  const dark = useDarkTheme()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [popoverBox, setPopoverBox] = useState<ClampedPopoverBox | null>(null)
  if (readOnly && open) {
    setOpen(false)
  }
  const effectiveOpen = open && !readOnly
  const [rawVal, commitVal] = useWritablePropState(context, 'value', props.value, props.setValue)

  const tree = useMemo(() => normalizeHierarchyTree(props.nodes), [props.nodes])
  const filteredTree = useMemo(
    () => (props.searchable === false ? tree : filterHierarchyTree(tree, deferredQuery)),
    [tree, props.searchable, deferredQuery],
  )
  const selectedVal = rawVal === undefined || rawVal === null ? '' : String(rawVal)
  const breadcrumb = useMemo(() => findBreadcrumbByValue(tree, selectedVal), [tree, selectedVal])

  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const placeholder =
    props.placeholder !== undefined && props.placeholder !== null
      ? String(props.placeholder)
      : msg.treeSelectPlaceholder
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  const closePopover = useCallback(() => {
    setOpen(false)
    setQuery('')
    setTouched(true)
  }, [])

  const syncPopoverBox = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPopoverBox(computeClampedPopoverBox(rect, { minWidth: 240, estHeight: 280 }))
  }, [])

  usePortalPopover({
    open: effectiveOpen,
    triggerRef,
    popoverRef,
    onClose: closePopover,
    onReposition: syncPopoverBox,
  })

  const handleToggleOpen = () => {
    if (readOnly) return
    if (effectiveOpen) {
      closePopover()
      return
    }
    syncPopoverBox()
    setOpen(true)
  }

  return (
    <div className={css.field} style={weightStyle(props.weight, 180)} data-a2ui-treeselect="">
      {label || err ? (
        <div className={css.fieldHeader}>
          {label ? (
            <label htmlFor={fieldId} className={css.label}>
              {label}
            </label>
          ) : (
            <span />
          )}
          {err ? <span className={css.errorText}>{err}</span> : null}
        </div>
      ) : null}

      <button
        ref={triggerRef}
        id={fieldId}
        type="button"
        className={css.selectTrigger}
        disabled={readOnly}
        aria-haspopup="tree"
        aria-expanded={effectiveOpen}
        aria-invalid={showError || undefined}
        data-placeholder={breadcrumb || selectedVal ? 'false' : 'true'}
        onClick={handleToggleOpen}
      >
        <span className={css.selectTriggerText}>{breadcrumb ?? (selectedVal || placeholder)}</span>
        <span className={css.selectTriggerChevron} aria-hidden="true">
          {CHEVRON_DOWN_14}
        </span>
      </button>

      {effectiveOpen && popoverBox && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="presentation"
              data-a2ui-portal-popover=""
              className={`${css.selectBackdrop} ${dark ? 'a2ui-dark' : 'a2ui-light'}`}
              onClick={(e) => {
                e.stopPropagation()
                closePopover()
              }}
            >
              <div
                ref={popoverRef}
                data-a2ui-select-popover=""
                className={css.selectPopover}
                style={{
                  ...(popoverBox.placeAbove
                    ? { bottom: popoverBox.bottom }
                    : { top: popoverBox.top }),
                  left: popoverBox.left,
                  width: popoverBox.width,
                  maxHeight: popoverBox.maxHeight,
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) =>
                  handleOptionListArrowKey(e, popoverRef.current, '[role="treeitem"]')
                }
              >
                {props.searchable !== false ? (
                  <div className={css.selectSearchRow}>
                    <DshInput
                      autoFocus
                      icon={SEARCH_ICON_14}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={msg.treeSearchPlaceholder}
                    />
                  </div>
                ) : null}
                <div role="tree" aria-label={label || placeholder} className={css.selectOptionList}>
                  {filteredTree.length === 0 ? (
                    <div className={css.selectEmpty}>{msg.treeEmpty}</div>
                  ) : (
                    filteredTree.map((node) => (
                      <TreeSelectOptionBranch
                        key={node.id}
                        node={node}
                        depth={0}
                        selectedValue={selectedVal}
                        forceExpanded={deferredQuery.trim() !== ''}
                        onSelect={(val) => {
                          if (readOnly) return
                          setTouched(true)
                          commitVal(val)
                          setOpen(false)
                          setQuery('')
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
})

export const DshCheckCardImpl = defineComponent<{
  label?: unknown
  options?: unknown
  value?: unknown
  setValue?: (next: string | string[]) => void
  multiple?: boolean
  columns?: number
  action?: ((options?: ActionDispatchOptions) => unknown) | undefined
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(CheckCardApi, function DshCheckCard({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const closeModal = useContext(ModalCloseContext)
  const getActionStatus = useContext(SurfaceActionStatusContext)
  const { submitAttempted, markSubmitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)

  const options = useMemo(() => normalizeCheckCardOptions(props.options), [props.options])
  const hasWritableValue = isWritableProp(context, 'value', props.setValue)
  const hasInitialLiteralValue =
    props.value !== undefined &&
    props.value !== null &&
    (Array.isArray(props.value) ? props.value.length > 0 : String(props.value) !== '')
  const isPromptMode =
    typeof props.action === 'function' && !hasWritableValue && !hasInitialLiteralValue
  const isFormBound = !isPromptMode
  const multiple = Boolean(props.multiple)
  const [selectedVal, commitSelectedVal] = useWritablePropState<unknown>(
    context,
    'value',
    props.value,
    props.setValue as ((next: unknown) => void) | undefined,
  )
  const cols =
    typeof props.columns === 'number' && props.columns >= 1 && props.columns <= 4
      ? Math.trunc(props.columns)
      : Math.min(3, Math.max(1, options.length))

  const selectedSet = useMemo(() => {
    if (Array.isArray(selectedVal)) return new Set(selectedVal.map(String))
    if (selectedVal !== undefined && selectedVal !== null && String(selectedVal) !== '') {
      return new Set([String(selectedVal)])
    }
    return new Set<string>()
  }, [selectedVal])

  if (options.length === 0) return null

  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  const handleCardClick = (opt: (typeof options)[number]) => {
    if (readOnly) return
    setTouched(true)
    let nextHasSelection = selectedSet.size > 0
    if (isFormBound) {
      if (multiple) {
        const cur = [...selectedSet]
        const next = selectedSet.has(opt.value)
          ? cur.filter((v) => v !== opt.value)
          : [...cur, opt.value]
        nextHasSelection = next.length > 0
        commitSelectedVal(next)
      } else {
        nextHasSelection = opt.value !== ''
        commitSelectedVal(opt.value)
      }
    }
    if (typeof props.action === 'function') {
      const blockedByValidation = props.isValid === false && (!isFormBound || !nextHasSelection)
      if (blockedByValidation) {
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
                  source: 'checkCard',
                  label: opt.title,
                  value: opt.value,
                  option: opt.raw,
                },
              },
            },
          }),
        getActionStatus,
      ).then((ok) => {
        if (!localFn && !multiple && ok) closeModal?.()
      })
    }
  }

  return (
    <div
      className={`${css.field} ${css.checkCardField}`}
      style={weightStyle(props.weight, 220)}
      data-a2ui-checkcard=""
    >
      {label || err ? (
        <div className={css.fieldHeader}>
          {label ? <span className={css.label}>{label}</span> : <span />}
          {err ? <span className={css.errorText}>{err}</span> : null}
        </div>
      ) : null}

      <div
        className={css.checkCardGrid}
        role="group"
        aria-label={label || undefined}
        data-columns={String(cols)}
        style={{ '--a2ui-grid-cols': cols } as CSSProperties}
      >
        {options.map((opt) => {
          const checked = isFormBound && selectedSet.has(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              disabled={readOnly}
              className={css.checkCardItem}
              aria-pressed={isPromptMode ? undefined : checked}
              data-checked={checked ? 'true' : 'false'}
              data-prompt={isPromptMode ? 'true' : 'false'}
              onClick={() => handleCardClick(opt)}
            >
              <div className={css.checkCardTop}>
                <span className={css.checkCardTitle}>{opt.title}</span>
                {isPromptMode ? (
                  <span className={css.checkCardPromptArrow} aria-hidden="true">
                    ↗
                  </span>
                ) : (
                  <span
                    className={css.checkCardIndicator}
                    data-checked={checked ? 'true' : 'false'}
                  >
                    {checked ? '✓' : ''}
                  </span>
                )}
              </div>
              {opt.recommended || opt.badge ? (
                <div className={css.checkCardBadges}>
                  {opt.recommended ? (
                    <DshTag tone="info">{msg.comparisonRecommended}</DshTag>
                  ) : null}
                  {opt.badge ? <span className={css.checkCardBadgeText}>{opt.badge}</span> : null}
                </div>
              ) : null}
              {opt.description ? <div className={css.checkCardDesc}>{opt.description}</div> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
})

function GeneralTreeBranch(props: {
  readonly node: NormalizedHierarchyNode
  readonly depth: number
  readonly expandedDepth: number
  readonly treeMode: 'default' | 'all' | 'none'
  readonly toggledMap: ReadonlyMap<string, boolean>
  readonly forceExpandAll: boolean
  readonly onToggle: (id: string, currentlyOpen: boolean) => void
  readonly onSelect?: ((node: NormalizedHierarchyNode) => void) | undefined
}) {
  const { node, depth, expandedDepth, treeMode, toggledMap, forceExpandAll, onToggle, onSelect } =
    props
  const msg = useRuntimeMessages()
  const isBranch = node.children.length > 0
  const baseOpen = treeMode === 'all' ? true : treeMode === 'none' ? false : depth < expandedDepth
  const isOpen = forceExpandAll || (toggledMap.get(node.id) ?? baseOpen)
  const dotState =
    node.status === 'healthy'
      ? 'done'
      : node.status === 'warning'
        ? 'warning'
        : node.status === 'error'
          ? 'error'
          : null

  return (
    <li className={css.fileTreeLi} role="treeitem" aria-expanded={isBranch ? isOpen : undefined}>
      <div
        className={css.generalTreeRow}
        data-status={node.status}
        style={{ '--tree-depth': Math.min(depth, 6) } as CSSProperties}
      >
        {isBranch ? (
          <button
            type="button"
            className={css.treeCaretBtn}
            disabled={forceExpandAll}
            onClick={() => {
              if (!forceExpandAll) onToggle(node.id, isOpen)
            }}
            aria-label={msg.treeToggleBranchAria}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className={css.treeLeafConnector} aria-hidden="true">
            ├─
          </span>
        )}

        <button
          type="button"
          className={css.generalTreeMainBtn}
          onClick={() => {
            if (onSelect) onSelect(node)
            else if (isBranch) onToggle(node.id, isOpen)
          }}
        >
          {dotState ? <DshStateDot state={dotState} size={8} /> : null}
          <span className={isBranch ? css.generalTreeBranchLabel : css.generalTreeLeafLabel}>
            {node.label}
          </span>
          {node.sublabel ? <span className={css.generalTreeSub}>{node.sublabel}</span> : null}
          {node.badge ? <DshTag tone="neutral">{node.badge}</DshTag> : null}
        </button>

        {node.sharePct !== undefined || node.metric ? (
          <div className={css.generalTreeRight}>
            {node.sharePct !== undefined ? (
              <span className={css.generalTreeBarTrack} aria-hidden="true">
                {(() => {
                  const off = node.offsetPct ?? 0
                  const maxW = Math.max(3, 100 - off)
                  const widthPct = Math.min(maxW, Math.max(3, node.sharePct))
                  return (
                    <span
                      className={css.generalTreeBarFill}
                      data-status={node.status}
                      style={{
                        ...(off > 0 ? { marginLeft: `${off}%` } : {}),
                        width: `${widthPct}%`,
                      }}
                    />
                  )
                })()}
              </span>
            ) : null}
            {node.metric ? <span className={css.generalTreeMetric}>{node.metric}</span> : null}
          </div>
        ) : null}
      </div>

      {isBranch && isOpen ? (
        <ul className={css.fileTreeUl} role="group">
          {node.children.map((child) => (
            <GeneralTreeBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedDepth={expandedDepth}
              treeMode={treeMode}
              toggledMap={toggledMap}
              forceExpandAll={forceExpandAll}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export const DshTreeImpl = defineComponent<{
  nodes?: unknown
  title?: unknown
  summary?: unknown
  searchable?: boolean
  expandedDepth?: number
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(TreeApi, function DshTree({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const runAction = useSurfaceActionRunner(context, props.action)
  const tree = useMemo(() => normalizeHierarchyTree(props.nodes), [props.nodes])
  const expandedDepth =
    typeof props.expandedDepth === 'number' && props.expandedDepth >= 0
      ? Math.trunc(props.expandedDepth)
      : 3

  const branches = useMemo(() => collectBranchDepths(tree), [tree])
  const [treeMode, setTreeMode] = useState<'default' | 'all' | 'none'>('default')
  const [toggledMap, setToggledMap] = useState<ReadonlyMap<string, boolean>>(() => new Map())
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  const filtered = useMemo(
    () => (props.searchable ? filterHierarchyTree(tree, deferredQuery) : tree),
    [tree, props.searchable, deferredQuery],
  )

  if (tree.length === 0) return null

  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const summary = props.summary !== undefined && props.summary !== null ? String(props.summary) : ''
  const canAct = !readOnly && Boolean(runAction)
  const searchActive = Boolean(props.searchable && deferredQuery.trim() !== '')
  const allOpen =
    searchActive ||
    (branches.length > 0 &&
      branches.every(({ id, depth }) => {
        const baseOpen =
          treeMode === 'all' ? true : treeMode === 'none' ? false : depth < expandedDepth
        return toggledMap.get(id) ?? baseOpen
      }))

  const toggleBranch = (id: string, currentlyOpen: boolean) => {
    setToggledMap((prev) => {
      const next = new Map(prev)
      next.set(id, !currentlyOpen)
      return next
    })
  }

  return (
    <div className={css.fileTreeCard} style={weightStyle(props.weight, 240)} data-a2ui-tree="">
      {title || summary || props.searchable || branches.length > 0 ? (
        <div className={css.fileTreeHeader}>
          <span className={css.fileTreeTitle}>{title}</span>
          <div className={css.proTableRightGroup}>
            {summary ? <span className={css.trackerSummary}>{summary}</span> : null}
            {branches.length > 0 && !searchActive ? (
              <button
                type="button"
                className={css.diffCopyBtn}
                onClick={() => {
                  setToggledMap(new Map())
                  setTreeMode(allOpen ? 'none' : 'all')
                }}
              >
                {allOpen ? msg.treeCollapseAll : msg.treeExpandAll}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {props.searchable ? (
        <div className={css.treeSearchHeader}>
          <DshInput
            icon={SEARCH_ICON_14}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={msg.treeSearchPlaceholder}
          />
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className={css.emptyCell}>{msg.treeEmpty}</div>
      ) : (
        <ul className={css.fileTreeRoot} role="tree">
          {filtered.map((node) => (
            <GeneralTreeBranch
              key={node.id}
              node={node}
              depth={0}
              expandedDepth={expandedDepth}
              treeMode={treeMode}
              toggledMap={toggledMap}
              forceExpandAll={searchActive}
              onToggle={toggleBranch}
              onSelect={
                canAct
                  ? (n) => {
                      void runAction?.({
                        metadata: {
                          extensions: {
                            dshSelection: {
                              source: 'tree',
                              label: n.breadcrumb,
                              value: n.metric,
                              node: n.raw,
                            },
                          },
                        },
                      })
                    }
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
})
