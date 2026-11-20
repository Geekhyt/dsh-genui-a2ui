/**
 * Action & form input A2UI 1.0 components (`Button`, `TextField`, `CheckBox`,
 * `ChoicePicker`, `Slider`, `DateTimeInput`, `Select`, `Segmented`, `Switch`).
 */
import {
  useContext,
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Label as AriaLabel,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  Slider as AriaSlider,
  SliderOutput as AriaSliderOutput,
  SliderThumb as AriaSliderThumb,
  SliderTrack as AriaSliderTrack,
} from 'react-aria-components'
import {
  ButtonApi,
  CheckBoxApi,
  ChoicePickerApi,
  DateTimeInputApi,
  SliderApi,
  TextFieldApi,
  type ActionDispatchOptions,
} from '@a2ui/web_core/v1_0'
import { SegmentedApi, SelectApi, SwitchApi } from '../../shared/catalog-schema.ts'
import { useRuntimeMessages } from '../i18n.ts'
import { useDarkTheme } from '../theme.ts'
import {
  DshButton,
  DshCheckIcon,
  DshCheckbox,
  DshChevronDownIcon,
  DshInput,
  DshMenu,
  DshPill,
  DshSearchIcon,
  DshSegmentedControl,
  DshSwitch,
  DshTooltip,
  type ButtonVariant,
} from '../ui/primitives.tsx'
import css from './Catalog.module.css'
import { normalizeSelectOptions } from './v3-helpers.ts'
import {
  InsideButtonContext,
  ModalCloseContext,
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  computeClampedPopoverBox,
  defineComponent,
  renderChildRef,
  weightStyle,
  type ChildRef,
  type ClampedPopoverBox,
} from './widget-helpers.tsx'

export function DshButtonView({
  props,
  buildChild,
}: {
  props: {
    child?: ChildRef
    variant?: 'default' | 'primary' | 'borderless'
    action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
    isValid?: boolean
    validationErrors?: readonly string[]
    weight?: number
  }
  buildChild: (id: string, basePath?: string) => ReactNode
}) {
  const readOnly = useContext(SurfaceReadOnlyContext)
  const closeModal = useContext(ModalCloseContext)
  const { markSubmitAttempted } = useContext(SurfaceValidationContext)

  const variant: ButtonVariant =
    props.variant === 'primary' ? 'primary' : props.variant === 'borderless' ? 'ghost' : 'outline'

  const invalid = props.isValid === false
  const disabled = readOnly || invalid || typeof props.action !== 'function'
  const errLabel = !readOnly && invalid ? (props.validationErrors ?? []).join('；') : ''
  const needsInvalidGateWrap = !readOnly && invalid

  const btn = (
    <DshButton
      variant={variant}
      disabled={disabled}
      style={
        needsInvalidGateWrap
          ? props.weight !== undefined
            ? { width: '100%' }
            : undefined
          : weightStyle(props.weight)
      }
      onClick={() => {
        if (!disabled && props.action) {
          markSubmitAttempted()
          void props.action()
          closeModal?.()
        }
      }}
    >
      <InsideButtonContext.Provider value={true}>
        {renderChildRef(buildChild, props.child)}
      </InsideButtonContext.Provider>
    </DshButton>
  )

  if (needsInvalidGateWrap) {
    const wrapped = (
      <span
        style={{ display: 'inline-flex', ...weightStyle(props.weight) }}
        onClickCapture={() => markSubmitAttempted()}
      >
        {btn}
      </span>
    )
    return errLabel ? <DshTooltip label={errLabel}>{wrapped}</DshTooltip> : wrapped
  }

  return errLabel ? <DshTooltip label={errLabel}>{btn}</DshTooltip> : btn
}

export const DshButtonImpl = defineComponent<{
  child?: ChildRef
  variant?: 'default' | 'primary' | 'borderless'
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
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

  const label = props.label ? String(props.label) : ''
  const val = props.value === undefined || props.value === null ? '' : String(props.value)
  const placeholder = props.placeholder ? String(props.placeholder) : undefined
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  const inputType =
    props.variant === 'number' ? 'number' : props.variant === 'obscured' ? 'password' : 'text'

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
            if (!readOnly) props.setValue?.(e.target.value)
          }}
        />
      ) : (
        <DshInput
          id={fieldId}
          type={inputType}
          autoComplete="off"
          value={val}
          placeholder={placeholder}
          disabled={readOnly}
          aria-invalid={showError || undefined}
          onBlur={() => setTouched(true)}
          onChange={(e) => {
            if (!readOnly) props.setValue?.(e.target.value)
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
  const options = props.options ?? []
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

  const isSingle = props.variant === 'mutuallyExclusive'
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
    typeof props.steps === 'number' && props.steps > 0
      ? Number(((max - min) / props.steps).toFixed(6))
      : 1
  const rawVal = Number(props.value ?? min)
  const value = Number.isFinite(rawVal) ? Math.min(max, Math.max(min, rawVal)) : min
  const pct = ((value - min) / (max - min)) * 100
  const label = props.label ? String(props.label) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  return (
    <div style={weightStyle(props.weight, 160)}>
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
  const enableDate = props.enableDate !== false
  const enableTime = Boolean(props.enableTime)
  const type = enableDate && enableTime ? 'datetime-local' : enableTime ? 'time' : 'date'
  const rawVal = typeof props.value === 'string' ? props.value : ''
  const normalizedVal =
    type === 'datetime-local'
      ? rawVal.replace(/Z$/, '').slice(0, 16)
      : type === 'date'
        ? rawVal.slice(0, 10)
        : rawVal.slice(0, 5)
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
        <input
          id={inputId}
          type={type}
          className={css.dateInput}
          style={{ colorScheme: dark ? 'dark' : 'light' }}
          value={normalizedVal}
          disabled={readOnly}
          aria-invalid={showError || undefined}
          min={typeof props.min === 'string' ? props.min : undefined}
          max={typeof props.max === 'string' ? props.max : undefined}
          onBlur={() => setTouched(true)}
          onChange={(e) => {
            if (readOnly) return
            setTouched(true)
            props.setValue?.(e.target.value)
          }}
        />
      </div>
    </div>
  )
})

const CHEVRON_DOWN_14 = <DshChevronDownIcon size={14} />
const CHECK_ICON_12 = <DshCheckIcon size={12} />

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
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [popoverBox, setPopoverBox] = useState<ClampedPopoverBox | null>(null)

  const options = useMemo(() => normalizeSelectOptions(props.options), [props.options])
  const selectedVal = props.value === undefined || props.value === null ? '' : String(props.value)
  const activeOption = useMemo(
    () => options.find((opt) => opt.value === selectedVal),
    [options, selectedVal],
  )
  const hasDescriptions = useMemo(() => options.some((opt) => Boolean(opt.description)), [options])
  const searchable = Boolean(props.searchable)
  const useCustomPopover = searchable || hasDescriptions

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

  const commitSelect = (val: string) => {
    if (readOnly) return
    setTouched(true)
    props.setValue?.(val)
    setOpen(false)
    setQuery('')
  }

  const handleOpenToggle = () => {
    if (readOnly) return
    if (open) {
      setOpen(false)
      setTouched(true)
      return
    }
    if (useCustomPopover && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const estHeight = Math.min(280, options.length * 40 + (searchable ? 52 : 12))
      setPopoverBox(computeClampedPopoverBox(rect, { minWidth: 180, estHeight }))
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
      aria-expanded={open}
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
          {open && popoverBox && typeof document !== 'undefined'
            ? createPortal(
                <div
                  role="presentation"
                  className={css.selectBackdrop}
                  onClick={() => {
                    setOpen(false)
                    setTouched(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setOpen(false)
                      setTouched(true)
                    }
                  }}
                >
                  <div
                    role="listbox"
                    aria-label={label || placeholder}
                    className={css.selectPopover}
                    style={{
                      top: popoverBox.top,
                      left: popoverBox.left,
                      width: popoverBox.width,
                      maxHeight: popoverBox.maxHeight,
                    }}
                    onClick={(e) => e.stopPropagation()}
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
            open={open}
            items={menuItems}
            selectedId={selectedVal}
            side="bottom"
            onSelect={commitSelect}
            onClose={() => {
              setOpen(false)
              setTouched(true)
            }}
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
  const activeVal =
    options.some((opt) => opt.value === rawVal) || options.length === 0 ? rawVal : options[0]!.value

  const label = props.label ? String(props.label) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  if (segOptions.length === 0) return null

  const segMinW = useMemo(() => {
    let total = 14
    for (const opt of segOptions) {
      let w = 34
      for (const ch of opt.label) {
        w += (ch.codePointAt(0) ?? 0) > 0xff ? 13.6 : 8
      }
      total += w
    }
    return Math.max(160, Math.min(260, Math.ceil(total)))
  }, [segOptions])

  return (
    <div className={css.field} style={weightStyle(props.weight, segMinW)} data-a2ui-segmented="">
      {label || err ? (
        <div className={css.fieldHeader}>
          {label ? <span className={css.label}>{label}</span> : <span />}
          {err ? <span className={css.errorText}>{err}</span> : null}
        </div>
      ) : null}
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
