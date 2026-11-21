import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import {
  type CSSProperties,
  Fragment,
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
  collectAllBranchIds,
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
  NativeDateField,
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  weightStyle,
} from './widget-helpers.tsx'

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
}>(NumberInputApi, function DshNumberInput({ props }) {
  const inputId = useId()
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')

  const numVal = Number(props.value)
  const safeVal = Number.isFinite(numVal) ? numVal : (props.min ?? 0)
  const step = typeof props.step === 'number' && props.step > 0 ? props.step : 1
  const atMin = typeof props.min === 'number' && safeVal <= props.min
  const atMax = typeof props.max === 'number' && safeVal >= props.max

  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const unit = props.unit !== undefined && props.unit !== null ? String(props.unit) : ''
  const prefix = props.prefix !== undefined && props.prefix !== null ? String(props.prefix) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  const applyDelta = (delta: number) => {
    if (readOnly) return
    setTouched(true)
    const next = clampAndStepNumber({
      current: safeVal,
      delta,
      min: props.min,
      max: props.max,
      step,
    })
    if (focused) setDraft(String(next))
    props.setValue?.(next)
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
            aria-valuenow={safeVal}
            aria-valuemin={props.min}
            aria-valuemax={props.max}
            className={css.numberBareInput}
            value={focused ? draft : String(safeVal)}
            disabled={readOnly}
            aria-invalid={showError || undefined}
            onFocus={() => {
              setFocused(true)
              setDraft(String(safeVal))
            }}
            onBlur={() => {
              setFocused(false)
              setTouched(true)
              const parsed = Number.parseFloat(draft.trim())
              let clamped = Number.isFinite(parsed) ? parsed : safeVal
              if (typeof props.min === 'number') clamped = Math.max(props.min, clamped)
              if (typeof props.max === 'number') clamped = Math.min(props.max, clamped)
              if (clamped !== safeVal) props.setValue?.(clamped)
            }}
            onChange={(e) => {
              if (readOnly) return
              setTouched(true)
              const rawText = e.target.value
              if (!/^-?\d*\.?\d*$/.test(rawText.trim())) return
              setDraft(rawText)
              const trimmed = rawText.trim()
              if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.') return
              const parsed = Number(trimmed)
              if (Number.isFinite(parsed)) {
                props.setValue?.(parsed)
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
}>(MultiSelectApi, function DshMultiSelect({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const [popoverBox, setPopoverBox] = useState<ClampedPopoverBox | null>(null)

  const selected = useMemo(
    () => (Array.isArray(props.value) ? props.value.map(String).filter(Boolean) : []),
    [props.value],
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

  const openPopover = () => {
    if (readOnly) return
    if (open) {
      setOpen(false)
      setTouched(true)
      return
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPopoverBox(computeClampedPopoverBox(rect, { minWidth: 220, estHeight: 260 }))
    }
    setOpen(true)
  }

  const toggleValue = (val: string) => {
    if (readOnly) return
    setTouched(true)
    const next = selectedSet.has(val) ? selected.filter((v) => v !== val) : [...selected, val]
    props.setValue?.(next)
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
                    setTouched(true)
                    props.setValue?.([])
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
        aria-expanded={open}
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
                aria-multiselectable="true"
                className={css.selectPopover}
                style={{
                  top: popoverBox.top,
                  left: popoverBox.left,
                  width: popoverBox.width,
                  maxHeight: popoverBox.maxHeight,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {searchable || allowCreate ? (
                  <div className={css.selectSearchRow}>
                    <DshInput
                      autoFocus
                      icon={SEARCH_ICON_14}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && allowCreate && query.trim() !== '') {
                          e.preventDefault()
                          const clean = query.trim()
                          if (!selectedSet.has(clean)) {
                            setTouched(true)
                            props.setValue?.([...selected, clean])
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
                <div className={css.selectOptionList}>
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
  weight?: number
}>(DateRangeApi, function DshDateRange({ props }) {
  const msg = useRuntimeMessages()
  const dark = useDarkTheme()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const enableTime = Boolean(props.enableTime)
  const showPresets = props.presets !== false
  const inputType = enableTime ? 'datetime-local' : 'date'

  const rawStart = typeof props.start === 'string' ? props.start : ''
  const rawEnd = typeof props.end === 'string' ? props.end : ''
  const normStart = enableTime ? rawStart.replace(/Z$/, '').slice(0, 16) : rawStart.slice(0, 10)
  const normEnd = enableTime ? rawEnd.replace(/Z$/, '').slice(0, 16) : rawEnd.slice(0, 10)

  const spanDays = useMemo(() => computeDateRangeSpanDays(normStart, normEnd), [normStart, normEnd])
  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''

  const applyPreset = (days: number) => {
    if (readOnly) return
    const next = buildDatePresetRange(days, enableTime, normEnd || undefined)
    props.setStart?.(next.start)
    props.setEnd?.(next.end)
  }

  return (
    <div
      className={css.dateRangeCard}
      style={weightStyle(props.weight, 220)}
      data-a2ui-daterange=""
    >
      {label || spanDays !== null ? (
        <div className={css.fieldHeader}>
          {label ? <span className={css.label}>{label}</span> : <span />}
          {spanDays !== null ? (
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
          ].map((p) => (
            <DshPill key={p.days} active={spanDays === p.days} onClick={() => applyPreset(p.days)}>
              {p.text}
            </DshPill>
          ))}
        </div>
      ) : null}

      <div className={css.dateRangeInputs}>
        <NativeDateField
          type={inputType}
          dark={dark}
          value={normStart}
          disabled={readOnly}
          ariaLabel={msg.dateRangeStartAria}
          wrapClassName={css.dateRangeInputWrap}
          inputClassName={css.dateRangeInput}
          buttonClassName={css.dateRangePickerBtn}
          iconSize={13}
          onChange={(nextS) => {
            props.setStart?.(nextS)
            if (normEnd && nextS > normEnd) {
              props.setEnd?.(nextS)
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
          wrapClassName={css.dateRangeInputWrap}
          inputClassName={css.dateRangeInput}
          buttonClassName={css.dateRangePickerBtn}
          iconSize={13}
          onChange={(nextE) => {
            props.setEnd?.(nextE)
            if (normStart && nextE < normStart) {
              props.setStart?.(nextE)
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
  readonly onSelect: (val: string) => void
}) {
  const { node, depth, selectedValue, onSelect } = props
  const [expanded, setExpanded] = useState(true)
  const isBranch = node.children.length > 0
  const isSelected = node.value === selectedValue

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
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className={css.treeLeafSpacer} />
        )}
        <button
          type="button"
          className={css.treeSelectNodeBtn}
          onClick={() => {
            if (isBranch) {
              setExpanded((v) => !v)
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
      {isBranch && expanded
        ? node.children.map((child) => (
            <TreeSelectOptionBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedValue={selectedValue}
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
}>(TreeSelectApi, function DshTreeSelect({ props }) {
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

  const tree = useMemo(() => normalizeHierarchyTree(props.nodes), [props.nodes])
  const filteredTree = useMemo(
    () => (props.searchable === false ? tree : filterHierarchyTree(tree, deferredQuery)),
    [tree, props.searchable, deferredQuery],
  )
  const selectedVal = props.value === undefined || props.value === null ? '' : String(props.value)
  const breadcrumb = useMemo(() => findBreadcrumbByValue(tree, selectedVal), [tree, selectedVal])

  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const placeholder =
    props.placeholder !== undefined && props.placeholder !== null
      ? String(props.placeholder)
      : msg.treeSelectPlaceholder
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  const handleToggleOpen = () => {
    if (readOnly) return
    if (open) {
      setOpen(false)
      setTouched(true)
      return
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPopoverBox(computeClampedPopoverBox(rect, { minWidth: 240, estHeight: 280 }))
    }
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
        aria-expanded={open}
        data-placeholder={breadcrumb ? 'false' : 'true'}
        onClick={handleToggleOpen}
      >
        <span className={css.selectTriggerText}>{breadcrumb ?? (selectedVal || placeholder)}</span>
        <span className={css.selectTriggerChevron} aria-hidden="true">
          {CHEVRON_DOWN_14}
        </span>
      </button>

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
                role="tree"
                className={css.selectPopover}
                style={{
                  top: popoverBox.top,
                  left: popoverBox.left,
                  width: popoverBox.width,
                  maxHeight: popoverBox.maxHeight,
                }}
                onClick={(e) => e.stopPropagation()}
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
                <div className={css.selectOptionList}>
                  {filteredTree.length === 0 ? (
                    <div className={css.selectEmpty}>{msg.treeEmpty}</div>
                  ) : (
                    filteredTree.map((node) => (
                      <TreeSelectOptionBranch
                        key={node.id}
                        node={node}
                        depth={0}
                        selectedValue={selectedVal}
                        onSelect={(val) => {
                          setTouched(true)
                          props.setValue?.(val)
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
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(CheckCardApi, function DshCheckCard({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)

  const options = useMemo(() => normalizeCheckCardOptions(props.options), [props.options])
  const isPromptMode = typeof props.action === 'function' && typeof props.setValue !== 'function'
  const isFormBound = !isPromptMode && typeof props.setValue === 'function'
  const multiple = Boolean(props.multiple)
  const cols =
    typeof props.columns === 'number' && props.columns >= 1 && props.columns <= 4
      ? Math.trunc(props.columns)
      : Math.min(3, Math.max(1, options.length))

  const selectedSet = useMemo(() => {
    if (Array.isArray(props.value)) return new Set(props.value.map(String))
    if (props.value !== undefined && props.value !== null && String(props.value) !== '') {
      return new Set([String(props.value)])
    }
    return new Set<string>()
  }, [props.value])

  if (options.length === 0) return null

  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  const handleCardClick = (opt: (typeof options)[number]) => {
    if (readOnly) return
    setTouched(true)
    if (isFormBound) {
      if (multiple) {
        const cur = [...selectedSet]
        const next = selectedSet.has(opt.value)
          ? cur.filter((v) => v !== opt.value)
          : [...cur, opt.value]
        props.setValue?.(next)
      } else {
        props.setValue?.(opt.value)
      }
    }
    if (typeof props.action === 'function') {
      void props.action({
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
        ? 'ongoing'
        : node.status === 'error'
          ? 'error'
          : null

  return (
    <li className={css.fileTreeLi} role="treeitem" aria-expanded={isBranch ? isOpen : undefined}>
      <div
        className={css.generalTreeRow}
        data-status={node.status}
        style={{ paddingLeft: 10 + Math.min(depth, 6) * 16 }}
      >
        {isBranch ? (
          <button
            type="button"
            className={css.treeCaretBtn}
            onClick={() => onToggle(node.id, isOpen)}
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
                <span
                  className={css.generalTreeBarFill}
                  data-status={node.status}
                  style={{ width: `${Math.max(3, node.sharePct)}%` }}
                />
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
}>(TreeApi, function DshTree({ props }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const tree = useMemo(() => normalizeHierarchyTree(props.nodes), [props.nodes])
  const expandedDepth =
    typeof props.expandedDepth === 'number' && props.expandedDepth >= 0
      ? Math.trunc(props.expandedDepth)
      : 3

  const allBranchIds = useMemo(() => collectAllBranchIds(tree), [tree])
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
  const canAct = !readOnly && typeof props.action === 'function'
  const allOpen =
    allBranchIds.length > 0 &&
    (treeMode === 'all' || (treeMode === 'default' && expandedDepth >= 4)) &&
    ![...toggledMap.values()].includes(false)

  const toggleBranch = (id: string, currentlyOpen: boolean) => {
    setToggledMap((prev) => {
      const next = new Map(prev)
      next.set(id, !currentlyOpen)
      return next
    })
  }

  return (
    <div className={css.fileTreeCard} style={weightStyle(props.weight, 240)} data-a2ui-tree="">
      {title || summary || props.searchable ? (
        <div className={css.fileTreeHeader}>
          <span className={css.fileTreeTitle}>{title}</span>
          <div className={css.proTableRightGroup}>
            {summary ? <span className={css.trackerSummary}>{summary}</span> : null}
            {allBranchIds.length > 0 ? (
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
              forceExpandAll={deferredQuery.trim() !== ''}
              onToggle={toggleBranch}
              onSelect={
                canAct
                  ? (n) => {
                      void props.action?.({
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
