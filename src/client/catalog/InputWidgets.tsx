import {
  type ActionDispatchOptions,
  ButtonApi,
  CheckBoxApi,
  ChoicePickerApi,
  DateTimeInputApi,
  SliderApi,
  TextFieldApi,
} from '@a2ui/web_core/v1_0'
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Label as AriaLabel,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  Slider as AriaSlider,
  SliderOutput as AriaSliderOutput,
  SliderThumb as AriaSliderThumb,
  SliderTrack as AriaSliderTrack,
} from 'react-aria-components'
import { createPortal } from 'react-dom'
import { SegmentedApi, SelectApi, SwitchApi } from '../../shared/catalog-schema.ts'
import { formatNativeTemporalValue } from '../../shared/temporal.ts'
import { usePortalPopover } from '../dom-hooks.ts'
import { useRuntimeMessages } from '../i18n.ts'
import { useDarkTheme } from '../theme.ts'
import {
  type ButtonVariant,
  DshButton,
  DshCheckbox,
  DshCheckIcon,
  DshChevronDownIcon,
  DshInput,
  DshMenu,
  DshPill,
  DshSearchIcon,
  DshSegmentedControl,
  DshSwitch,
  DshTooltip,
} from '../ui/primitives.tsx'
import css from './Catalog.module.css'
import { normalizeSelectOptions } from './v3-helpers.ts'
import {
  type ChildRef,
  type ClampedPopoverBox,
  computeClampedPopoverBox,
  computeDropdownSide,
  defineComponent,
  InsideButtonContext,
  isLocalFunctionAction,
  ModalCloseContext,
  ModalOpenContext,
  ModalTriggerContext,
  NativeDateField,
  renderChildRef,
  runSurfaceAction,
  SurfaceActionStatusContext,
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  weightStyle,
} from './widget-helpers.tsx'

export function DshButtonView({
  props,
  buildChild,
  context,
}: {
  props: {
    child?: ChildRef
    variant?: 'default' | 'primary' | 'borderless'
    action?: ((options?: ActionDispatchOptions) => unknown) | undefined
    isValid?: boolean
    validationErrors?: readonly string[]
    weight?: number
  }
  buildChild: (id: string, basePath?: string) => ReactNode
  context?: unknown
}) {
  const readOnly = useContext(SurfaceReadOnlyContext)
  const closeModal = useContext(ModalCloseContext)
  const openModal = useContext(ModalOpenContext)
  const isModalTrigger = useContext(ModalTriggerContext)
  const getActionStatus = useContext(SurfaceActionStatusContext)
  const { markSubmitAttempted } = useContext(SurfaceValidationContext)

  const variant: ButtonVariant =
    props.variant === 'primary' ? 'primary' : props.variant === 'borderless' ? 'ghost' : 'outline'

  const invalid = props.isValid === false
  const hardDisabled = readOnly || (!isModalTrigger && typeof props.action !== 'function')
  const softInvalidDisabled = !hardDisabled && invalid
  const errLabel = !readOnly && invalid ? (props.validationErrors ?? []).join('；') : ''

  const btn = (
    <DshButton
      data-a2ui-button=""
      variant={variant}
      disabled={hardDisabled}
      aria-disabled={softInvalidDisabled || undefined}
      style={{
        ...weightStyle(props.weight),
        ...(softInvalidDisabled ? { opacity: 0.52, cursor: 'not-allowed' } : undefined),
      }}
      onClickCapture={
        softInvalidDisabled
          ? (e) => {
              e?.preventDefault?.()
              e?.stopPropagation?.()
              markSubmitAttempted()
            }
          : undefined
      }
      onClick={(e) => {
        if (hardDisabled) {
          e?.preventDefault?.()
          e?.stopPropagation?.()
          return
        }
        if (softInvalidDisabled) {
          e?.preventDefault?.()
          e?.stopPropagation?.()
          markSubmitAttempted()
          return
        }
        if (isModalTrigger) {
          e?.stopPropagation?.()
          openModal?.()
          return
        }
        if (props.action) {
          markSubmitAttempted()
          const localFn = isLocalFunctionAction(context)
          const actionFn = props.action
          if (getActionStatus === null) {
            try {
              const res = actionFn()
              if (res && typeof (res as PromiseLike<unknown>).then === 'function') {
                void Promise.resolve(res).catch(() => {})
              }
              if (!localFn && res !== false) closeModal?.()
            } catch {}
            return
          }
          void runSurfaceAction(() => actionFn(), getActionStatus).then((ok) => {
            if (!localFn && ok) closeModal?.()
          })
        }
      }}
    >
      <InsideButtonContext.Provider value={true}>
        {renderChildRef(buildChild, props.child)}
      </InsideButtonContext.Provider>
    </DshButton>
  )

  return errLabel ? <DshTooltip label={errLabel}>{btn}</DshTooltip> : btn
}

export const DshButtonImpl = defineComponent<{
  child?: ChildRef
  variant?: 'default' | 'primary' | 'borderless'
  action?: ((options?: ActionDispatchOptions) => unknown) | undefined
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(ButtonApi, DshButtonView)

export function DshTextFieldView({
  props,
}: {
  props: {
    label?: unknown
    value?: unknown
    setValue?: (next: string) => void
    placeholder?: unknown
    variant?: 'shortText' | 'longText' | 'number' | 'obscured'
    isValid?: boolean
    validationErrors?: readonly string[]
    weight?: number
  }
}) {
  const fieldId = useId()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [focused, setFocused] = useState(false)

  const label = props.label ? String(props.label) : ''
  const val = props.value === undefined || props.value === null ? '' : String(props.value)
  const [draft, setDraft] = useState(val)
  const [prevVal, setPrevVal] = useState(val)
  if (val !== prevVal) {
    setPrevVal(val)
    if (props.variant === 'number' && focused) {
      const trimmedDraft = draft.trim()
      const parsedDraft = trimmedDraft === '' ? Number.NaN : Number(trimmedDraft)
      const parsedVal = val.trim() === '' ? Number.NaN : Number(val.trim())
      const sameNumeric =
        Number.isFinite(parsedDraft) && Number.isFinite(parsedVal) && parsedDraft === parsedVal
      if (!sameNumeric && trimmedDraft !== val) {
        setDraft(val)
      }
    } else {
      setDraft(val)
    }
  }
  const placeholder = props.placeholder ? String(props.placeholder) : undefined
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  const isNumber = props.variant === 'number'
  const inputType = isNumber ? 'number' : props.variant === 'obscured' ? 'password' : 'text'

  return (
    <div className={css.field} style={weightStyle(props.weight, 160)}>
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
      {props.variant === 'longText' ? (
        <textarea
          id={fieldId}
          className={css.textarea}
          value={val}
          placeholder={placeholder}
          disabled={readOnly}
          aria-invalid={showError || undefined}
          onBlur={() => setTouched(true)}
          onChange={(e) => {
            if (readOnly) return
            props.setValue?.(e.target.value)
          }}
        />
      ) : (
        <DshInput
          id={fieldId}
          type={inputType}
          autoComplete="off"
          value={isNumber && focused ? draft : val}
          placeholder={placeholder}
          disabled={readOnly}
          aria-invalid={showError || undefined}
          onFocus={() => {
            setFocused(true)
            setDraft(val)
          }}
          onBlur={() => {
            setFocused(false)
            setTouched(true)
          }}
          onChange={(e) => {
            if (readOnly) return
            const raw = e.target.value
            if (isNumber) {
              setDraft(raw)
              const trimmed = raw.trim()
              if (trimmed === '') {
                props.setValue?.('')
                return
              }
              if (trimmed === '-' || trimmed === '.' || trimmed === '-.') {
                return
              }
              const parsed = Number(trimmed)
              props.setValue?.((Number.isFinite(parsed) ? parsed : raw) as unknown as string)
              return
            }
            props.setValue?.(raw)
          }}
        />
      )}
    </div>
  )
}

export const DshTextFieldImpl = defineComponent<{
  label?: unknown
  value?: unknown
  setValue?: (next: string) => void
  placeholder?: unknown
  variant?: 'shortText' | 'longText' | 'number' | 'obscured'
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(TextFieldApi, DshTextFieldView)

export function DshCheckBoxView({
  props,
}: {
  props: {
    label?: unknown
    value?: unknown
    setValue?: (next: boolean) => void
    isValid?: boolean
    validationErrors?: readonly string[]
    weight?: number
  }
}) {
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  return (
    <div className={`${css.field} ${css.checkboxField}`} style={weightStyle(props.weight, 140)}>
      <DshCheckbox
        checked={Boolean(props.value)}
        disabled={readOnly}
        onChange={(next) => {
          if (readOnly) return
          setTouched(true)
          props.setValue?.(next)
        }}
        label={String(props.label ?? '')}
      />
      {err ? <span className={css.errorText}>{err}</span> : null}
    </div>
  )
}

export const DshCheckBoxImpl = defineComponent<{
  label?: unknown
  value?: unknown
  setValue?: (next: boolean) => void
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(CheckBoxApi, DshCheckBoxView)

const SEARCH_ICON_14 = <DshSearchIcon size={14} />

export const DshChoicePickerImpl = defineComponent<{
  label?: unknown
  options?: readonly { readonly value: string; readonly label?: unknown }[]
  value?: unknown
  setValue?: (next: string[]) => void
  variant?: 'multipleSelection' | 'mutuallyExclusive'
  displayStyle?: 'checkbox' | 'chips'
  filterable?: boolean
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(ChoicePickerApi, function DshChoicePicker({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const selected = useMemo(
    () => (Array.isArray(props.value) ? props.value.map(String) : []),
    [props.value],
  )
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const options = useMemo(
    () =>
      Array.isArray(props.options)
        ? props.options
            .filter((o): o is { readonly label?: unknown; readonly value?: unknown } =>
              Boolean(o && typeof o === 'object'),
            )
            .map((o) => ({ label: o.label, value: String(o.value ?? '') }))
        : [],
    [props.options],
  )
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!props.filterable || q === '') return options
    return options.filter(
      (opt) =>
        String(opt.label ?? opt.value)
          .toLowerCase()
          .includes(q) || opt.value.toLowerCase().includes(q),
    )
  }, [options, props.filterable, deferredQuery])

  const isSingle = props.variant !== 'multipleSelection'
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined
  const label = props.label ? String(props.label) : ''

  const toggleOption = (val: string) => {
    if (readOnly) return
    setTouched(true)
    if (isSingle) {
      props.setValue?.([val])
      return
    }
    const next = selectedSet.has(val) ? selected.filter((v) => v !== val) : [...selected, val]
    props.setValue?.(next)
  }

  return (
    <div className={css.choiceGroup} style={weightStyle(props.weight, 160)}>
      {label || err ? (
        <div className={css.fieldHeader}>
          {label ? <span className={css.label}>{label}</span> : <span />}
          {err ? <span className={css.errorText}>{err}</span> : null}
        </div>
      ) : null}

      {props.filterable ? (
        <DshInput
          icon={SEARCH_ICON_14}
          value={query}
          disabled={readOnly}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={msg.filterPlaceholder}
          aria-label={msg.filterAriaLabel}
        />
      ) : null}

      {props.displayStyle === 'chips' ? (
        <div className={css.pillGroup}>
          {filtered.map((opt) => (
            <DshPill
              key={opt.value}
              active={selectedSet.has(opt.value)}
              disabled={readOnly}
              onClick={() => toggleOption(opt.value)}
            >
              {String(opt.label ?? opt.value)}
            </DshPill>
          ))}
        </div>
      ) : isSingle ? (
        <AriaRadioGroup
          className={css.radioList}
          aria-label={label || msg.radioGroupAria}
          value={selected[0] ?? ''}
          isDisabled={readOnly}
          onChange={(val) => {
            if (readOnly) return
            setTouched(true)
            props.setValue?.([val])
          }}
        >
          {filtered.map((opt) => (
            <AriaRadio key={opt.value} value={opt.value} className={css.radioItem}>
              <span className={css.radioDot} aria-hidden="true" />
              <span>{String(opt.label ?? opt.value)}</span>
            </AriaRadio>
          ))}
        </AriaRadioGroup>
      ) : (
        <div className={css.radioList}>
          {filtered.map((opt) => (
            <DshCheckbox
              key={opt.value}
              checked={selectedSet.has(opt.value)}
              disabled={readOnly}
              onChange={() => toggleOption(opt.value)}
              label={String(opt.label ?? opt.value)}
            />
          ))}
        </div>
      )}
    </div>
  )
})

export const DshSliderImpl = defineComponent<{
  label?: unknown
  min?: number
  max?: number
  steps?: number
  value?: unknown
  setValue?: (next: number) => void
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(SliderApi, function DshSlider({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const min = typeof props.min === 'number' && Number.isFinite(props.min) ? props.min : 0
  const rawMax = typeof props.max === 'number' && Number.isFinite(props.max) ? props.max : 100
  const max = rawMax > min ? rawMax : min + 1
  const step =
    typeof props.steps === 'number' && Number.isFinite(props.steps) && props.steps > 0
      ? Number(((max - min) / props.steps).toFixed(6))
      : 1
  const rawVal = Number(props.value ?? min)
  const value = Number.isFinite(rawVal) ? Math.min(max, Math.max(min, rawVal)) : min
  const pct = ((value - min) / (max - min)) * 100
  const label = props.label ? String(props.label) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  return (
    <div className={css.field} style={weightStyle(props.weight, 160)} data-a2ui-slider="">
      <AriaSlider
        className={css.slider}
        minValue={min}
        maxValue={max}
        step={step}
        value={value}
        isDisabled={readOnly}
        aria-label={label || msg.sliderAria}
        onChange={(next) => {
          if (readOnly) return
          setTouched(true)
          const raw = Array.isArray(next) ? (next[0] ?? min) : next
          const cleaned = Number.isFinite(raw) ? Number(raw.toFixed(6)) : min
          props.setValue?.(cleaned)
        }}
      >
        <div className={css.sliderHeader}>
          {label ? <AriaLabel className={css.label}>{label}</AriaLabel> : <span />}
          <AriaSliderOutput className={css.sliderOutput} />
        </div>
        <AriaSliderTrack className={css.sliderTrack}>
          <div className={css.sliderFill} style={{ width: `${pct}%` }} />
          <AriaSliderThumb className={css.sliderThumb} />
        </AriaSliderTrack>
      </AriaSlider>
      {err ? <span className={css.errorText}>{err}</span> : null}
    </div>
  )
})

export const DshDateTimeInputImpl = defineComponent<{
  label?: unknown
  value?: unknown
  setValue?: (next: string) => void
  enableDate?: boolean
  enableTime?: boolean
  min?: unknown
  max?: unknown
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(DateTimeInputApi, function DshDateTimeInput({ props }) {
  const inputId = useId()
  const dark = useDarkTheme()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const enableTime = Boolean(props.enableTime)
  const enableDate = props.enableDate === true || (props.enableDate !== false && !enableTime)
  const type = enableDate && enableTime ? 'datetime-local' : enableTime ? 'time' : 'date'
  const normalizedVal = formatNativeTemporalValue(props.value, type)
  const normalizedMin =
    typeof props.min === 'string' && props.min.trim() !== ''
      ? formatNativeTemporalValue(props.min, type) || undefined
      : undefined
  const normalizedMax =
    typeof props.max === 'string' && props.max.trim() !== ''
      ? formatNativeTemporalValue(props.max, type) || undefined
      : undefined
  const label = props.label ? String(props.label) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  return (
    <div className={css.field} style={weightStyle(props.weight, 150)}>
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
      <div className={css.dateRow}>
        <NativeDateField
          id={inputId}
          type={type}
          dark={dark}
          value={normalizedVal}
          disabled={readOnly}
          ariaLabel={label || type}
          ariaInvalid={showError || undefined}
          min={normalizedMin}
          max={normalizedMax}
          wrapClassName={css.dateInputWrap}
          inputClassName={css.dateInput}
          buttonClassName={css.datePickerBtn}
          onBlur={() => setTouched(true)}
          onChange={(nextVal) => {
            setTouched(true)
            props.setValue?.(nextVal)
          }}
        />
      </div>
    </div>
  )
})

const CHEVRON_DOWN_14 = <DshChevronDownIcon size={14} />
const CHECK_ICON_12 = <DshCheckIcon size={12} />

function handleListboxArrowKey(
  e: ReactKeyboardEvent<HTMLElement>,
  container: HTMLElement | null,
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
  const items = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]'))
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

export function DshSelectView({
  props,
}: {
  props: {
    label?: unknown
    options?: unknown
    value?: unknown
    setValue?: (next: string) => void
    placeholder?: unknown
    searchable?: boolean
    isValid?: boolean
    validationErrors?: readonly string[]
    weight?: number
  }
}) {
  const fieldId = useId()
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [open, setOpen] = useState(false)
  const [menuSide, setMenuSide] = useState<'top' | 'bottom'>('bottom')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [popoverBox, setPopoverBox] = useState<ClampedPopoverBox | null>(null)

  if (readOnly && open) {
    setOpen(false)
  }

  const options = useMemo(() => normalizeSelectOptions(props.options), [props.options])
  const selectedVal = props.value === undefined || props.value === null ? '' : String(props.value)
  const activeOption = useMemo(
    () => options.find((opt) => opt.value === selectedVal),
    [options, selectedVal],
  )
  const hasDescriptions = useMemo(() => options.some((opt) => Boolean(opt.description)), [options])
  const searchable = Boolean(props.searchable)
  const useCustomPopover = searchable || hasDescriptions
  const effectiveOpen = open && !readOnly

  const filteredOptions = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!searchable || q === '') return options
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q) ||
        (opt.description ? opt.description.toLowerCase().includes(q) : false),
    )
  }, [options, searchable, deferredQuery])

  const menuItems = useMemo(
    () => options.map((opt) => ({ id: opt.value, label: opt.label })),
    [options],
  )

  const label = props.label ? String(props.label) : ''
  const placeholder = props.placeholder ? String(props.placeholder) : msg.selectPlaceholder
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
    const estHeight = Math.min(280, options.length * 40 + (searchable ? 52 : 12))
    setPopoverBox(computeClampedPopoverBox(rect, { minWidth: 180, estHeight }))
  }, [options.length, searchable])

  usePortalPopover({
    open: effectiveOpen && useCustomPopover,
    triggerRef,
    popoverRef,
    onClose: closePopover,
    onReposition: syncPopoverBox,
  })

  const commitSelect = (val: string) => {
    if (readOnly) return
    setTouched(true)
    props.setValue?.(val)
    setOpen(false)
    setQuery('')
  }

  const handleOpenToggle = () => {
    if (readOnly) return
    if (effectiveOpen) {
      closePopover()
      return
    }
    if (useCustomPopover) {
      syncPopoverBox()
    } else if (triggerRef.current) {
      const estHeight = Math.min(280, options.length * 34 + 16)
      setMenuSide(computeDropdownSide(triggerRef.current.getBoundingClientRect(), estHeight))
    }
    setOpen(true)
  }

  const triggerButton = (
    <button
      ref={triggerRef}
      id={fieldId}
      type="button"
      className={css.selectTrigger}
      disabled={readOnly}
      aria-haspopup="listbox"
      aria-expanded={effectiveOpen}
      aria-invalid={showError || undefined}
      onClick={handleOpenToggle}
      data-placeholder={activeOption ? 'false' : 'true'}
    >
      <span className={css.selectTriggerText}>
        {activeOption ? activeOption.label : placeholder}
      </span>
      <span className={css.selectTriggerChevron} aria-hidden="true">
        {CHEVRON_DOWN_14}
      </span>
    </button>
  )

  const resolvedPopoverBox =
    popoverBox ??
    (effectiveOpen && useCustomPopover && triggerRef.current
      ? computeClampedPopoverBox(triggerRef.current.getBoundingClientRect(), {
          minWidth: 180,
          estHeight: Math.min(280, options.length * 40 + (searchable ? 52 : 12)),
        })
      : null)

  return (
    <div className={css.field} style={weightStyle(props.weight, 160)} data-a2ui-select="">
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

      {useCustomPopover ? (
        <>
          {triggerButton}
          {effectiveOpen && resolvedPopoverBox && typeof document !== 'undefined'
            ? createPortal(
                <div
                  role="presentation"
                  className={css.selectBackdrop}
                  onClick={(e) => {
                    e.stopPropagation()
                    closePopover()
                  }}
                >
                  <div
                    ref={popoverRef}
                    role="listbox"
                    aria-label={label || placeholder}
                    className={css.selectPopover}
                    style={{
                      ...(resolvedPopoverBox.placeAbove
                        ? { bottom: resolvedPopoverBox.bottom }
                        : { top: resolvedPopoverBox.top }),
                      left: resolvedPopoverBox.left,
                      width: resolvedPopoverBox.width,
                      maxHeight: resolvedPopoverBox.maxHeight,
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => handleListboxArrowKey(e, popoverRef.current)}
                  >
                    {searchable ? (
                      <div className={css.selectSearchRow}>
                        <DshInput
                          autoFocus
                          icon={SEARCH_ICON_14}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder={msg.selectSearchPlaceholder}
                          aria-label={msg.selectSearchPlaceholder}
                        />
                      </div>
                    ) : null}
                    <div className={css.selectOptionList}>
                      {filteredOptions.length === 0 ? (
                        <div className={css.selectEmpty}>{msg.selectNoResults}</div>
                      ) : (
                        filteredOptions.map((opt) => {
                          const isSelected = opt.value === selectedVal
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              className={css.selectOptionBtn}
                              data-selected={isSelected ? 'true' : 'false'}
                              onClick={() => commitSelect(opt.value)}
                            >
                              <span className={css.selectOptionCopy}>
                                <span className={css.selectOptionLabel}>{opt.label}</span>
                                {opt.description ? (
                                  <span className={css.selectOptionDesc}>{opt.description}</span>
                                ) : null}
                              </span>
                              {isSelected ? (
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
        </>
      ) : (
        <div className={css.selectMenuHost}>
          <DshMenu
            open={effectiveOpen}
            items={menuItems}
            selectedId={selectedVal}
            side={menuSide}
            onSelect={commitSelect}
            onClose={closePopover}
            anchor={triggerButton}
          />
        </div>
      )}
    </div>
  )
}

export const DshSelectImpl = defineComponent<{
  label?: unknown
  options?: unknown
  value?: unknown
  setValue?: (next: string) => void
  placeholder?: unknown
  searchable?: boolean
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(SelectApi, DshSelectView)

export function DshSegmentedView({
  props,
}: {
  props: {
    label?: unknown
    options?: unknown
    value?: unknown
    setValue?: (next: string) => void
    isValid?: boolean
    validationErrors?: readonly string[]
    weight?: number
  }
}) {
  const segId = useId()
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)

  const options = useMemo(() => normalizeSelectOptions(props.options), [props.options])
  const segOptions = useMemo(
    () => options.map((opt) => ({ value: opt.value, label: opt.label, title: opt.description })),
    [options],
  )
  const rawVal = props.value === undefined || props.value === null ? '' : String(props.value)
  const activeVal = options.some((opt) => opt.value === rawVal) ? rawVal : ''

  const label = props.label ? String(props.label) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  const { segMinW, totalEstW } = useMemo(() => {
    let total = 14
    for (const opt of segOptions) {
      let w = 34
      for (const ch of opt.label) {
        w += (ch.codePointAt(0) ?? 0) > 0xff ? 13.6 : 8
      }
      total += w
    }
    return {
      totalEstW: Math.ceil(total),
      segMinW: Math.max(160, Math.min(260, Math.ceil(total))),
    }
  }, [segOptions])

  if (segOptions.length === 0) return null

  const useWrapGrid = segOptions.length >= 4 || totalEstW > 270

  return (
    <div className={css.field} style={weightStyle(props.weight, segMinW)} data-a2ui-segmented="">
      {label || err ? (
        <div className={css.fieldHeader}>
          {label ? <span className={css.label}>{label}</span> : <span />}
          {err ? <span className={css.errorText}>{err}</span> : null}
        </div>
      ) : null}
      {useWrapGrid ? (
        <div className={css.segmentedWrapOuter}>
          <div
            id={segId}
            role="radiogroup"
            aria-label={label || msg.segmentedAria}
            className={css.segmentedWrapGroup}
            data-disabled={readOnly ? 'true' : 'false'}
          >
            {segOptions.map((opt) => {
              const active = opt.value === activeVal
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={readOnly}
                  title={opt.title ?? opt.label}
                  className={css.segmentedWrapBtn}
                  data-active={active ? 'true' : 'false'}
                  onClick={() => {
                    if (readOnly) return
                    setTouched(true)
                    props.setValue?.(opt.value)
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className={css.segmentedHostWrap}>
          <DshSegmentedControl
            id={segId}
            value={activeVal}
            options={segOptions}
            label={label || msg.segmentedAria}
            disabled={readOnly}
            onChange={(next) => {
              if (readOnly) return
              setTouched(true)
              props.setValue?.(next)
            }}
          />
        </div>
      )}
    </div>
  )
}

export const DshSegmentedImpl = defineComponent<{
  label?: unknown
  options?: unknown
  value?: unknown
  setValue?: (next: string) => void
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(SegmentedApi, DshSegmentedView)

export function DshSwitchView({
  props,
}: {
  props: {
    label?: unknown
    value?: unknown
    setValue?: (next: boolean) => void
    description?: unknown
    isValid?: boolean
    validationErrors?: readonly string[]
    weight?: number
  }
}) {
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)

  const label = props.label ? String(props.label) : ''
  const description =
    props.description !== undefined &&
    props.description !== null &&
    String(props.description) !== ''
      ? String(props.description)
      : ''
  const checked = Boolean(props.value)
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  const handleToggle = (next: boolean) => {
    if (readOnly) return
    setTouched(true)
    props.setValue?.(next)
  }

  return (
    <div className={css.switchCard} style={weightStyle(props.weight, 240)} data-a2ui-switch="">
      <div className={css.switchMainRow}>
        <div
          className={css.switchLabelBlock}
          onClick={() => handleToggle(!checked)}
          data-disabled={readOnly ? 'true' : 'false'}
        >
          <span className={css.switchLabelText}>{label}</span>
          {description ? <span className={css.switchDescText}>{description}</span> : null}
        </div>
        <DshSwitch checked={checked} disabled={readOnly} label={label} onChange={handleToggle} />
      </div>
      {err ? <span className={css.errorText}>{err}</span> : null}
    </div>
  )
}

export const DshSwitchImpl = defineComponent<{
  label?: unknown
  value?: unknown
  setValue?: (next: boolean) => void
  description?: unknown
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(SwitchApi, DshSwitchView)
