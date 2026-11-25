import {
  type ActionDispatchOptions,
  ButtonApi,
  CheckBoxApi,
  ChoicePickerApi,
  DateTimeInputApi,
  SliderApi,
  TextFieldApi,
} from '@a2ui/web_core/v1_0'
import { type ReactNode, useContext, useDeferredValue, useId, useMemo, useState } from 'react'
import {
  Label as AriaLabel,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  Slider as AriaSlider,
  SliderOutput as AriaSliderOutput,
  SliderThumb as AriaSliderThumb,
  SliderTrack as AriaSliderTrack,
} from 'react-aria-components'
import { formatNativeTemporalValue } from '../../../shared/temporal.ts'
import { useRuntimeMessages } from '../../i18n.ts'
import { useDarkTheme } from '../../theme.ts'
import {
  type ButtonVariant,
  DshButton,
  DshCheckbox,
  DshInput,
  DshPill,
  DshSearchIcon,
  DshTooltip,
} from '../../ui/primitives.tsx'
import css from '../Catalog.module.css'
import {
  type ChildRef,
  defineComponent,
  InsideButtonContext,
  isLocalFunctionAction,
  ModalCloseContext,
  ModalOpenContext,
  ModalTriggerContext,
  NativeDateField,
  normalizeStringArrayValue,
  parseBooleanValue,
  renderChildRef,
  runSurfaceAction,
  SurfaceActionStatusContext,
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  useWritablePropState,
  weightStyle,
} from '../widget-helpers.tsx'

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

  const blockSoftInvalid = (e?: { preventDefault?: () => void; stopPropagation?: () => void }) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    markSubmitAttempted()
  }

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
      onClickCapture={softInvalidDisabled ? blockSoftInvalid : undefined}
      onClick={(e) => {
        if (hardDisabled) {
          e?.preventDefault?.()
          e?.stopPropagation?.()
          return
        }
        if (softInvalidDisabled) {
          blockSoftInvalid(e)
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
  context,
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
  context?: unknown
}) {
  const fieldId = useId()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [focused, setFocused] = useState(false)
  const [rawVal, commitValue] = useWritablePropState(context, 'value', props.value, props.setValue)

  const label = props.label ? String(props.label) : ''
  const val = rawVal === undefined || rawVal === null ? '' : String(rawVal)
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
  const inputType = props.variant === 'obscured' ? 'password' : 'text'

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
            commitValue(e.target.value)
          }}
        />
      ) : (
        <DshInput
          id={fieldId}
          type={inputType}
          inputMode={isNumber ? 'decimal' : undefined}
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
            if (isNumber && !readOnly && draft !== val) {
              const trimmed = draft.trim()
              if (trimmed === '') {
                if (val !== '') commitValue('')
              } else {
                const parsed = Number(trimmed)
                commitValue((Number.isFinite(parsed) ? parsed : trimmed) as unknown as string)
              }
            }
          }}
          onChange={(e) => {
            if (readOnly) return
            const raw = e.target.value
            if (isNumber) {
              setDraft(raw)
              const trimmed = raw.trim()
              if (trimmed === '') {
                commitValue('')
                return
              }
              if (
                trimmed === '-' ||
                trimmed === '+' ||
                trimmed === '.' ||
                trimmed === '-.' ||
                trimmed === '+.' ||
                /^[+-]?(?:\d+\.?\d*|\.\d+)[eE][+-]?$/.test(trimmed)
              ) {
                return
              }
              const parsed = Number(trimmed)
              commitValue((Number.isFinite(parsed) ? parsed : raw) as unknown as string)
              return
            }
            commitValue(raw)
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
  context,
}: {
  props: {
    label?: unknown
    value?: unknown
    setValue?: (next: boolean) => void
    isValid?: boolean
    validationErrors?: readonly string[]
    weight?: number
  }
  context?: unknown
}) {
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [rawVal, commitValue] = useWritablePropState(context, 'value', props.value, props.setValue)
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  return (
    <div
      className={`${css.field} ${css.checkboxField}`}
      style={weightStyle(props.weight, 140)}
      aria-invalid={showError || undefined}
    >
      <DshCheckbox
        checked={parseBooleanValue(rawVal)}
        disabled={readOnly}
        onChange={(next) => {
          if (readOnly) return
          setTouched(true)
          commitValue(next)
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
}>(ChoicePickerApi, function DshChoicePicker({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [rawSelected, commitSelected] = useWritablePropState(
    context,
    'value',
    props.value,
    props.setValue,
  )
  const selected = useMemo(() => normalizeStringArrayValue(rawSelected), [rawSelected])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const options = useMemo(() => {
    if (!Array.isArray(props.options)) return []
    const out: Array<{ readonly label?: unknown; readonly value: string }> = []
    const seen = new Set<string>()
    for (const o of props.options) {
      if (!o || typeof o !== 'object') continue
      const rec = o as { readonly label?: unknown; readonly value?: unknown }
      const val = String(rec.value ?? '')
      if (seen.has(val)) continue
      seen.add(val)
      out.push({ label: rec.label, value: val })
    }
    return out
  }, [props.options])
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
      commitSelected([val])
      return
    }
    const next = selectedSet.has(val) ? selected.filter((v) => v !== val) : [...selected, val]
    commitSelected(next)
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

      {filtered.length === 0 ? (
        <div className={css.selectEmpty}>{msg.selectNoResults}</div>
      ) : props.displayStyle === 'chips' ? (
        <div
          className={css.pillGroup}
          role="group"
          aria-label={label || undefined}
          aria-invalid={showError || undefined}
        >
          {filtered.map((opt) => (
            <DshPill
              key={opt.value}
              active={selectedSet.has(opt.value)}
              aria-pressed={selectedSet.has(opt.value)}
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
          value={selected[0] ?? null}
          isDisabled={readOnly}
          isInvalid={showError || undefined}
          onChange={(val) => {
            if (readOnly) return
            setTouched(true)
            commitSelected([val])
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
        <div
          className={css.radioList}
          role="group"
          aria-label={label || undefined}
          aria-invalid={showError || undefined}
        >
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
}>(SliderApi, function DshSlider({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [sliderVal, commitValue] = useWritablePropState(
    context,
    'value',
    props.value,
    props.setValue,
  )
  const min = typeof props.min === 'number' && Number.isFinite(props.min) ? props.min : 0
  const rawMax = typeof props.max === 'number' && Number.isFinite(props.max) ? props.max : 100
  const max = rawMax > min ? rawMax : min + 1
  const span = max - min
  const fallbackStep = span <= 1 ? Math.max(1e-6, Number((span / 100).toPrecision(2))) : 1
  const step =
    typeof props.steps === 'number' && Number.isFinite(props.steps) && props.steps > 0
      ? Math.max(1e-9, span / props.steps)
      : fallbackStep
  const isEmptySlider =
    sliderVal === undefined ||
    sliderVal === null ||
    (typeof sliderVal === 'string' && sliderVal.trim() === '')
  const rawVal = isEmptySlider ? min : Number(sliderVal)
  const value = Number.isFinite(rawVal) ? Math.min(max, Math.max(min, rawVal)) : min
  const pct = ((value - min) / span) * 100
  const label = props.label ? String(props.label) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  return (
    <div
      className={css.field}
      style={weightStyle(props.weight, 160)}
      data-a2ui-slider=""
      aria-invalid={showError || undefined}
    >
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
          const snapped = Number.isFinite(raw)
            ? Math.abs(raw - max) <= step * 0.25
              ? max
              : Number(raw.toFixed(6))
            : min
          commitValue(Math.min(max, Math.max(min, snapped)))
        }}
      >
        <div className={css.sliderHeader}>
          {label ? <AriaLabel className={css.label}>{label}</AriaLabel> : <span />}
          <AriaSliderOutput className={css.sliderOutput} />
        </div>
        <AriaSliderTrack className={css.sliderTrack}>
          <div className={css.sliderFill} style={{ width: `calc((100% - 22px) * ${pct / 100})` }} />
          <AriaSliderThumb
            className={css.sliderThumb}
            style={{ left: `calc(11px + (100% - 22px) * ${pct / 100})` }}
          />
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
}>(DateTimeInputApi, function DshDateTimeInput({ props, context }) {
  const inputId = useId()
  const dark = useDarkTheme()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [rawVal, commitValue] = useWritablePropState(context, 'value', props.value, props.setValue)
  const enableTime = Boolean(props.enableTime)
  const enableDate = props.enableDate === true || (props.enableDate !== false && !enableTime)
  const type = enableDate && enableTime ? 'datetime-local' : enableTime ? 'time' : 'date'
  const normalizedVal = formatNativeTemporalValue(rawVal, type)
  const normalizedMin =
    typeof props.min === 'string' && props.min.trim() !== ''
      ? formatNativeTemporalValue(props.min, type) || undefined
      : undefined
  const normalizedMax =
    typeof props.max === 'string' && props.max.trim() !== ''
      ? formatNativeTemporalValue(props.max, type, 'end') || undefined
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
            commitValue(nextVal)
          }}
        />
      </div>
    </div>
  )
})
