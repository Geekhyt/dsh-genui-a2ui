import { useRef } from 'react'

export function NativeDateField(props: {
  readonly id?: string | undefined
  readonly type: 'date' | 'time' | 'datetime-local'
  readonly dark: boolean
  readonly value: string
  readonly disabled?: boolean | undefined
  readonly ariaLabel?: string | undefined
  readonly ariaInvalid?: boolean | undefined
  readonly min?: string | undefined
  readonly max?: string | undefined
  readonly wrapClassName: string
  readonly inputClassName: string
  readonly buttonClassName: string
  readonly iconSize?: number | undefined
  readonly onBlur?: (() => void) | undefined
  readonly onChange: (nextValue: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const iconSize = props.iconSize ?? 14
  const openNativePicker = () => {
    const el = inputRef.current
    if (!el || props.disabled) return
    el.focus()
    try {
      el.showPicker?.()
    } catch {}
  }

  return (
    <div className={props.wrapClassName}>
      <input
        ref={inputRef}
        id={props.id}
        type={props.type}
        className={props.inputClassName}
        style={{ colorScheme: props.dark ? 'dark' : 'light' }}
        value={props.value}
        disabled={props.disabled}
        aria-label={props.ariaLabel}
        aria-invalid={props.ariaInvalid}
        min={props.min}
        max={props.max}
        onBlur={props.onBlur}
        onChange={(e) => {
          if (props.disabled) return
          props.onChange(e.target.value)
        }}
      />
      <button
        type="button"
        className={props.buttonClassName}
        disabled={props.disabled}
        tabIndex={-1}
        aria-label={props.ariaLabel ?? props.type}
        onMouseDown={(e) => e.preventDefault()}
        onClick={openNativePicker}
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          {props.type === 'time' ? (
            <>
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="M8 4.6V8l2.4 1.6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : (
            <>
              <rect
                x="2.2"
                y="3.2"
                width="11.6"
                height="10.6"
                rx="1.8"
                stroke="currentColor"
                strokeWidth="1.35"
              />
              <path
                d="M5 1.8v2.6M11 1.8v2.6M2.4 6.5h11.2"
                stroke="currentColor"
                strokeWidth="1.35"
                strokeLinecap="round"
              />
            </>
          )}
        </svg>
      </button>
    </div>
  )
}
