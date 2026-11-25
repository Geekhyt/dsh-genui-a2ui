import { useCallback, useContext, useDeferredValue, useId, useMemo, useState } from 'react'
import { DateRangeApi, MultiSelectApi, NumberInputApi } from '../../../shared/catalog-schema.ts'
import { formatNativeTemporalValue } from '../../../shared/temporal.ts'
import { useRuntimeMessages } from '../../i18n.ts'
import { useDarkTheme } from '../../theme.ts'
import {
  DshCheckIcon,
  DshChevronDownIcon,
  DshInput,
  DshPill,
  DshSearchIcon,
  DshTag,
} from '../../ui/primitives.tsx'
import css from '../Catalog.module.css'
import {
  buildDatePresetRange,
  clampAndStepNumber,
  computeDateRangeSpanDays,
  normalizeMultiSelectMergedOptions,
} from '../v5-helpers.ts'
import {
  defineComponent,
  NativeDateField,
  normalizeStringArrayValue,
  PortalPopoverShell,
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  usePickerPopover,
  useWritablePropState,
  weightStyle,
} from '../widget-helpers.tsx'

const SEARCH_ICON_14 = <DshSearchIcon size={14} />
const CHEVRON_DOWN_14 = <DshChevronDownIcon size={14} />
const CHECK_ICON_12 = <DshCheckIcon size={12} />

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
  const rawSafeMin =
    typeof props.min === 'number' && Number.isFinite(props.min) ? props.min : undefined
  const rawSafeMax =
    typeof props.max === 'number' && Number.isFinite(props.max) ? props.max : undefined
  const safeMin =
    rawSafeMin !== undefined && rawSafeMax !== undefined && rawSafeMin > rawSafeMax
      ? rawSafeMax
      : rawSafeMin
  const safeMax =
    rawSafeMin !== undefined && rawSafeMax !== undefined && rawSafeMin > rawSafeMax
      ? rawSafeMin
      : rawSafeMax
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
              if (!Number.isFinite(parsed)) {
                setDraft(hasValidNum ? String(numVal) : '')
                return
              }
              let clamped = parsed
              if (safeMin !== undefined) clamped = Math.max(safeMin, clamped)
              if (safeMax !== undefined) clamped = Math.min(safeMax, clamped)
              if (!hasValidNum || clamped !== numVal) commitValue(clamped)
            }}
            onKeyDown={(e) => {
              if (readOnly) return
              const noMods = !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                applyDelta(1)
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                applyDelta(-1)
              } else if (noMods && e.key === 'Home' && safeMin !== undefined) {
                e.preventDefault()
                setTouched(true)
                if (focused) setDraft(String(safeMin))
                commitValue(safeMin)
              } else if (noMods && e.key === 'End' && safeMax !== undefined) {
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
  const listboxId = useId()
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const dark = useDarkTheme()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const onBeforeClose = useCallback(() => {
    setQuery('')
    setTouched(true)
  }, [])
  const { effectiveOpen, popoverBox, triggerRef, popoverRef, closePopover, toggleOpen } =
    usePickerPopover<HTMLDivElement>({
      readOnly,
      minWidth: 220,
      estHeight: 260,
      onBeforeClose,
    })
  const openPopover = toggleOpen
  const [rawSelected, commitSelected] = useWritablePropState(
    context,
    'value',
    props.value,
    props.setValue,
  )

  const selected = useMemo(
    () => Array.from(new Set(normalizeStringArrayValue(rawSelected).filter(Boolean))),
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
        aria-haspopup="listbox"
        aria-controls={effectiveOpen ? listboxId : undefined}
        aria-disabled={readOnly || undefined}
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

      <PortalPopoverShell
        open={effectiveOpen}
        box={popoverBox}
        dark={dark}
        popoverRef={popoverRef}
        onClose={closePopover}
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
              placeholder={allowCreate ? msg.multiSelectSearchCreate : msg.multiSelectSearchOnly}
            />
          </div>
        ) : null}
        <div
          id={listboxId}
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
                  {active ? <span className={css.selectOptionCheck}>{CHECK_ICON_12}</span> : null}
                </button>
              )
            })
          )}
        </div>
      </PortalPopoverShell>
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
  const todayIso = buildDatePresetRange(1, false).start
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
