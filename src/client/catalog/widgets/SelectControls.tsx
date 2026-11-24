import { useCallback, useContext, useDeferredValue, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SegmentedApi, SelectApi, SwitchApi } from '../../../shared/catalog-schema.ts'
import { usePortalPopover } from '../../dom-hooks.ts'
import { useRuntimeMessages } from '../../i18n.ts'
import { useDarkTheme } from '../../theme.ts'
import {
  DshCheckIcon,
  DshChevronDownIcon,
  DshInput,
  DshMenu,
  DshSearchIcon,
  DshSegmentedControl,
  DshSwitch,
} from '../../ui/primitives.tsx'
import css from '../Catalog.module.css'
import { normalizeSelectOptions } from '../v3-helpers.ts'
import {
  type ClampedPopoverBox,
  computeClampedPopoverBox,
  computeDropdownSide,
  defineComponent,
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  useWritablePropState,
  handleOptionListArrowKey,
  weightStyle,
} from '../widget-helpers.tsx'

const SEARCH_ICON_14 = <DshSearchIcon size={14} />
const CHEVRON_DOWN_14 = <DshChevronDownIcon size={14} />
const CHECK_ICON_12 = <DshCheckIcon size={12} />

export function DshSelectView({
  props,
  context,
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
  context?: unknown
}) {
  const fieldId = useId()
  const msg = useRuntimeMessages()
  const dark = useDarkTheme()
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
  const [rawVal, commitValue] = useWritablePropState(context, 'value', props.value, props.setValue)

  if (readOnly && open) {
    setOpen(false)
  }

  const options = useMemo(() => normalizeSelectOptions(props.options), [props.options])
  const selectedVal = rawVal === undefined || rawVal === null ? '' : String(rawVal)
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
    commitValue(val)
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
                      ...(resolvedPopoverBox.placeAbove
                        ? { bottom: resolvedPopoverBox.bottom }
                        : { top: resolvedPopoverBox.top }),
                      left: resolvedPopoverBox.left,
                      width: resolvedPopoverBox.width,
                      maxHeight: resolvedPopoverBox.maxHeight,
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => handleOptionListArrowKey(e, popoverRef.current)}
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
                    <div
                      role="listbox"
                      aria-label={label || placeholder}
                      className={css.selectOptionList}
                    >
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
  context,
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
  context?: unknown
}) {
  const segId = useId()
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [rawSegVal, commitValue] = useWritablePropState(
    context,
    'value',
    props.value,
    props.setValue,
  )

  const options = useMemo(() => normalizeSelectOptions(props.options), [props.options])
  const segOptions = useMemo(
    () => options.map((opt) => ({ value: opt.value, label: opt.label, title: opt.description })),
    [options],
  )
  const rawVal = rawSegVal === undefined || rawSegVal === null ? '' : String(rawSegVal)
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
                    commitValue(opt.value)
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
              commitValue(next)
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
  context,
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
  context?: unknown
}) {
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [rawVal, commitValue] = useWritablePropState(context, 'value', props.value, props.setValue)

  const label = props.label ? String(props.label) : ''
  const description =
    props.description !== undefined &&
    props.description !== null &&
    String(props.description) !== ''
      ? String(props.description)
      : ''
  const checked = Boolean(rawVal)
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  const handleToggle = (next: boolean) => {
    if (readOnly) return
    setTouched(true)
    commitValue(next)
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
