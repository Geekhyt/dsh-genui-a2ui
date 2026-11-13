/**
 * Action & form input A2UI 1.0 components (`Button`, `TextField`, `CheckBox`,
 * `ChoicePicker`, `Slider`, `DateTimeInput`).
 */
import { useId, useMemo, useState } from 'react'
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
import { useRuntimeMessages } from '../i18n.ts'
import {
  DshButton,
  DshCheckbox,
  DshInput,
  DshPill,
  DshSearchIcon,
  DshTooltip,
  type ButtonVariant,
} from '../ui/primitives.tsx'
import css from './Catalog.module.css'
import {
  InsideButtonContext,
  defineComponent,
  renderChildRef,
  weightStyle,
  type ChildRef,
} from './widget-helpers.tsx'

export const DshButtonImpl = defineComponent<{
  child?: ChildRef
  variant?: 'default' | 'primary' | 'borderless'
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(ButtonApi, function DshButtonComponent({ props, buildChild }) {
  const variant: ButtonVariant =
    props.variant === 'primary'
      ? 'primary'
      : props.variant === 'borderless'
        ? 'ghost'
        : 'outline'

  const invalid = props.isValid === false
  const disabled = invalid || typeof props.action !== 'function'
  const errLabel = invalid ? (props.validationErrors ?? []).join('；') : ''

  const btn = (
    <DshButton
      variant={variant}
      disabled={disabled}
      style={weightStyle(props.weight)}
      onClick={() => {
        if (!disabled && props.action) {
          void props.action()
        }
      }}
    >
      <InsideButtonContext.Provider value={true}>
        {renderChildRef(buildChild, props.child)}
      </InsideButtonContext.Provider>
    </DshButton>
  )

  return errLabel ? <DshTooltip label={errLabel}>{btn}</DshTooltip> : btn
})

export const DshTextFieldImpl = defineComponent<{
  label?: unknown
  value?: unknown
  setValue?: (next: string) => void
  placeholder?: unknown
  variant?: 'shortText' | 'longText' | 'number' | 'obscured'
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(TextFieldApi, function DshTextField({ props }) {
  const fieldId = useId()
  const label = props.label ? String(props.label) : ''
  const val = props.value === undefined || props.value === null ? '' : String(props.value)
  const placeholder = props.placeholder ? String(props.placeholder) : undefined
  const err = props.isValid === false ? props.validationErrors?.[0] : undefined

  const inputType =
    props.variant === 'number'
      ? 'number'
      : props.variant === 'obscured'
        ? 'password'
        : 'text'

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
          onChange={(e) => props.setValue?.(e.target.value)}
        />
      ) : (
        <DshInput
          id={fieldId}
          type={inputType}
          autoComplete="off"
          value={val}
          placeholder={placeholder}
          onChange={(e) => props.setValue?.(e.target.value)}
        />
      )}
    </div>
  )
})

export const DshCheckBoxImpl = defineComponent<{
  label?: unknown
  value?: unknown
  setValue?: (next: boolean) => void
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(CheckBoxApi, function DshCheckBoxComponent({ props }) {
  const err = props.isValid === false ? props.validationErrors?.[0] : undefined
  return (
    <div className={css.field} style={weightStyle(props.weight)}>
      <DshCheckbox
        checked={Boolean(props.value)}
        onChange={(next) => props.setValue?.(next)}
        label={String(props.label ?? '')}
      />
      {err ? <span className={css.errorText}>{err}</span> : null}
    </div>
  )
})

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
  const [query, setQuery] = useState('')
  const selected = useMemo(
    () => (Array.isArray(props.value) ? props.value.map(String) : []),
    [props.value],
  )
  const options = props.options ?? []
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!props.filterable || q === '') return options
    return options.filter(
      (opt) =>
        String(opt.label ?? opt.value).toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q),
    )
  }, [options, props.filterable, query])

  const isSingle = props.variant === 'mutuallyExclusive'
  const err = props.isValid === false ? props.validationErrors?.[0] : undefined
  const label = props.label ? String(props.label) : ''

  const toggleOption = (val: string) => {
    if (isSingle) {
      props.setValue?.([val])
      return
    }
    const next = selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]
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
          icon={<DshSearchIcon size={14} />}
          value={query}
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
              active={selected.includes(opt.value)}
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
          onChange={(val) => props.setValue?.([val])}
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
              checked={selected.includes(opt.value)}
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
  const err = props.isValid === false ? props.validationErrors?.[0] : undefined

  return (
    <div style={weightStyle(props.weight, 160)}>
      <AriaSlider
        className={css.slider}
        minValue={min}
        maxValue={max}
        step={step}
        value={value}
        aria-label={label || msg.sliderAria}
        onChange={(next) => {
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
  const err = props.isValid === false ? props.validationErrors?.[0] : undefined

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
          value={normalizedVal}
          min={typeof props.min === 'string' ? props.min : undefined}
          max={typeof props.max === 'string' ? props.max : undefined}
          onChange={(e) => props.setValue?.(e.target.value)}
        />
      </div>
    </div>
  )
})
