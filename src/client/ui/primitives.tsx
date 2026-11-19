/**
 * Defensive adapter over `@deepseek-ai/dsh-client-ui-primitives`.
 *
 * All host primitives enter `dsh-genui-a2ui` through this module. Because DSH is in `0.x`,
 * if a future DSH release renames or drops an individual primitive export, the fallback
 * implementation keeps every A2UI surface rendering cleanly with `--dsw-*` tokens.
 */
import * as HostPrimitives from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  ButtonVariant,
  JsonTreeLabels,
  MarkdownLabels,
  MenuItem,
  SegmentedControlOption,
  SegmentedTab,
  TagTone,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  forwardRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { SHELL_MESSAGES, type UiLocale } from '../../shared/i18n.ts'
import { useAutoDismissTimer } from '../dom-hooks.ts'
import { useShellMessages, useUiLocale } from '../i18n.ts'

export type {
  ButtonVariant,
  JsonTreeLabels,
  MarkdownLabels,
  MenuItem,
  SegmentedControlOption,
  SegmentedTab,
  TagTone,
}

export function getJsonTreeLabels(locale: UiLocale): JsonTreeLabels {
  const msg = SHELL_MESSAGES[locale]
  return {
    copyValue: msg.copyValue,
    copyJson: msg.copyJson,
    copyPath: msg.copyPath,
    copyPrettyJson: msg.copyPrettyJson,
    copyCompactJson: msg.copyCompactJson,
    copied: msg.copied,
    copyFailed: msg.copyFailed,
    collapseNode: msg.collapseNode,
    expandNode: msg.expandNode,
    copyButtonTitle: msg.moreCopyOptions,
  }
}

export function getMarkdownLabels(locale: UiLocale): MarkdownLabels {
  const msg = SHELL_MESSAGES[locale]
  return {
    code: {
      copyLabel: msg.copy,
      copiedLabel: msg.copied,
      toolbarLabels: {
        codeLabel: msg.codeLabel,
        wrapLabel: msg.wrapLabel,
        unwrapLabel: msg.unwrapLabel,
      },
    },
    footnotes: msg.footnotes,
  }
}

export const DEFAULT_JSON_TREE_LABELS: JsonTreeLabels = getJsonTreeLabels('zh')
export const DEFAULT_MARKDOWN_LABELS: MarkdownLabels = getMarkdownLabels('zh')

function hasComponent(candidate: unknown): boolean {
  return typeof candidate === 'function' || (typeof candidate === 'object' && candidate !== null)
}

const raw = HostPrimitives as Record<string, unknown>

const FallbackButton = forwardRef<
  HTMLButtonElement,
  {
    variant?: ButtonVariant
    size?: 'md' | 'sm'
    icon?: ReactNode
    className?: string | undefined
    children?: ReactNode
  } & ButtonHTMLAttributes<HTMLButtonElement>
>(function FallbackButton(
  { variant = 'outline', size = 'md', icon, className, children, style, ...rest },
  ref,
) {
  const isPrimary = variant === 'primary'
  const isGhost = variant === 'ghost'
  return (
    <button
      ref={ref}
      type="button"
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: size === 'sm' ? 28 : 36,
        padding: size === 'sm' ? '0 10px' : '0 14px',
        borderRadius: size === 'sm' ? 'var(--dsw-radius-sm, 8px)' : 'var(--dsw-radius-md, 10px)',
        border:
          isPrimary || isGhost
            ? 'none'
            : '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.28))',
        background: isPrimary
          ? 'var(--dsw-alias-button-primary-fill, #3b82f6)'
          : isGhost
            ? 'transparent'
            : 'var(--dsw-alias-bg-layer-2, transparent)',
        color: isPrimary
          ? 'var(--dsw-alias-label-primary-inverted, #ffffff)'
          : 'var(--dsw-alias-label-primary, inherit)',
        fontSize: 13,
        fontWeight: 500,
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        opacity: rest.disabled ? 0.5 : 1,
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})

export const DshButton = hasComponent(raw.Button) ? HostPrimitives.Button : FallbackButton

export function DshCheckbox(props: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  title?: string | undefined
  className?: string | undefined
}) {
  if (hasComponent(raw.Checkbox)) {
    return <HostPrimitives.Checkbox {...props} />
  }
  return (
    <label
      title={props.title}
      className={props.className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>{props.label}</span>
    </label>
  )
}

export function DshSwitch(props: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  title?: string | undefined
  className?: string | undefined
}) {
  if (hasComponent(raw.Switch)) {
    return <HostPrimitives.Switch {...props} />
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      title={props.title}
      disabled={props.disabled}
      className={props.className}
      onClick={() => {
        if (!props.disabled) props.onChange(!props.checked)
      }}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: 38,
        height: 22,
        padding: 2,
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.28))',
        background: props.checked
          ? 'var(--dsw-alias-state-info-primary, #3b82f6)'
          : 'var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.2))',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        opacity: props.disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#ffffff',
          transform: props.checked ? 'translateX(16px)' : 'translateX(0px)',
          transition: 'transform 0.16s ease',
        }}
      />
    </button>
  )
}

const FallbackInput = forwardRef<
  HTMLInputElement,
  { icon?: ReactNode; className?: string } & InputHTMLAttributes<HTMLInputElement>
>(function FallbackInput({ icon, className, style, ...rest }, ref) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: '100%' }}
    >
      {icon}
      <input
        ref={ref}
        style={{
          width: '100%',
          height: 34,
          padding: '0 10px',
          borderRadius: 'var(--dsw-radius-sm, 8px)',
          border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.28))',
          background: 'var(--dsw-alias-bg-layer-1, transparent)',
          color: 'var(--dsw-alias-label-primary, inherit)',
          fontSize: 13,
          ...style,
        }}
        {...rest}
      />
    </span>
  )
})

export const DshInput = hasComponent(raw.Input) ? HostPrimitives.Input : FallbackInput

export function DshPill(
  props: {
    active?: boolean
    className?: string | undefined
    children?: ReactNode
  } & ButtonHTMLAttributes<HTMLButtonElement>,
) {
  if (hasComponent(raw.Pill)) {
    return <HostPrimitives.Pill {...props} />
  }
  const { active, children, style, ...rest } = props
  return (
    <button
      type="button"
      style={{
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.28))',
        background: active ? 'var(--dsw-alias-brand-primary, #3b82f6)' : 'transparent',
        color: active ? 'var(--dsw-alias-label-primary-inverted, #fff)' : 'inherit',
        cursor: 'pointer',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

export function DshTag(props: {
  tone?: TagTone
  className?: string | undefined
  children?: ReactNode
}) {
  if (hasComponent(raw.Tag)) {
    return <HostPrimitives.Tag {...props} />
  }
  return (
    <span
      className={props.className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 6,
        fontSize: 12,
        border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.28))',
      }}
    >
      {props.children}
    </span>
  )
}

export function DshSegmentedTabs<Value extends string = string>(props: {
  items: readonly [SegmentedTab<Value>, ...SegmentedTab<Value>[]]
  value: Value
  onChange: (value: Value) => void
  label: string
  className?: string | undefined
  size?: 'sm' | 'md' | undefined
}) {
  if (hasComponent(raw.SegmentedTabs)) {
    return <>{HostPrimitives.SegmentedTabs(props)}</>
  }
  return (
    <div
      role="tablist"
      aria-label={props.label}
      className={props.className}
      style={{ display: 'flex', gap: 4 }}
    >
      {props.items.map((item) => (
        <button
          key={item.value}
          id={item.id}
          role="tab"
          type="button"
          aria-selected={item.value === props.value}
          aria-controls={item.panelId}
          onClick={() => props.onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function DshSegmentedControl<Value extends string = string>(props: {
  id: string
  value: Value
  options: readonly SegmentedControlOption<Value>[]
  onChange: (next: Value) => void
  label: string
  disabled?: boolean
  className?: string | undefined
}) {
  if (hasComponent(raw.SegmentedControl)) {
    return <HostPrimitives.SegmentedControl {...props} />
  }
  return (
    <div
      id={props.id}
      role="radiogroup"
      aria-label={props.label}
      className={props.className}
      style={{
        display: 'inline-grid',
        gridAutoFlow: 'column',
        gridAutoColumns: 'minmax(0, 1fr)',
        gap: 4,
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        padding: 3,
        borderRadius: 'var(--dsw-radius-md, 10px)',
        background: 'var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.12))',
        border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.2))',
      }}
    >
      {props.options.map((opt) => {
        const active = opt.value === props.value
        const isDisabled = Boolean(props.disabled || opt.disabled)
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={isDisabled}
            title={opt.title ?? opt.label}
            onClick={() => {
              if (!isDisabled) props.onChange(opt.value)
            }}
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              padding: '5px 10px',
              borderRadius: 'var(--dsw-radius-sm, 7px)',
              border: 'none',
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              background: active ? 'var(--dsw-alias-state-info-primary, #3b82f6)' : 'transparent',
              color: active ? '#ffffff' : 'var(--dsw-alias-label-secondary, inherit)',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              opacity: isDisabled ? 0.5 : 1,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function DshModal(props: {
  open: boolean
  onClose: () => void
  title: string
  closeLabel: string
  children?: ReactNode
  footer?: ReactNode
}) {
  if (hasComponent(raw.Modal)) {
    return HostPrimitives.Modal(props)
  }
  if (!props.open || typeof document === 'undefined') return null
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
      onClick={props.onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--dsw-alias-bg-mask-1, rgba(0,0,0,0.45))',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          minWidth: 320,
          maxWidth: 'min(560px, 92vw)',
          maxHeight: '85vh',
          overflow: 'auto',
          padding: 20,
          borderRadius: 'var(--dsw-radius-xl, 16px)',
          background: 'var(--dsw-alias-bg-layer-2, #1f1f24)',
          border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <strong style={{ fontSize: 15 }}>{props.title}</strong>
          <DshButton
            variant="ghost"
            size="sm"
            onClick={props.onClose}
            aria-label={props.closeLabel}
          >
            ✕
          </DshButton>
        </div>
        <div>{props.children}</div>
        {props.footer ? <div style={{ marginTop: 16 }}>{props.footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

export function DshTooltip(props: { label: string; disabled?: boolean; children: ReactElement }) {
  if (props.disabled || props.label.trim() === '') return props.children
  if (hasComponent(raw.Tooltip)) {
    return (
      <HostPrimitives.Tooltip label={props.label} side="top" portal={true}>
        {props.children}
      </HostPrimitives.Tooltip>
    )
  }
  return <span title={props.label}>{props.children}</span>
}

export function DshMarkdown(props: {
  text: string
  variant?: 'body' | 'compact'
  streaming?: boolean
}) {
  const locale = useUiLocale()
  if (hasComponent(raw.MarkdownText)) {
    return (
      <HostPrimitives.MarkdownText
        text={props.text}
        variant={props.variant ?? 'compact'}
        streaming={props.streaming}
        omitHtml={true}
        labels={getMarkdownLabels(locale)}
      />
    )
  }
  return <div style={{ whiteSpace: 'pre-wrap' }}>{props.text}</div>
}

export function DshCodeBlock(props: { code: string; lang?: string; lineNumbers?: boolean }) {
  const locale = useUiLocale()
  const mdLabels = getMarkdownLabels(locale)
  if (hasComponent(raw.CodeBlock)) {
    return (
      <HostPrimitives.CodeBlock
        code={props.code}
        lang={props.lang}
        lineNumbers={props.lineNumbers}
        copyLabel={mdLabels.code.copyLabel}
        copiedLabel={mdLabels.code.copiedLabel}
        toolbarLabels={mdLabels.code.toolbarLabels}
      />
    )
  }
  return (
    <pre style={{ overflow: 'auto', padding: 12, borderRadius: 8, fontSize: 12 }}>
      <code>{props.code}</code>
    </pre>
  )
}

function FallbackJsonNode(props: {
  name?: string
  value: unknown
  depth: number
  expandedDepth: number
  copyable: boolean
  copyLabel: string
}) {
  const { name, value, depth, expandedDepth, copyable, copyLabel } = props
  const [open, setOpen] = useState(depth < expandedDepth)
  const [copied, setCopied] = useState(false)

  const handleCopy = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => {})
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  if (value === null || typeof value !== 'object') {
    const formatted = typeof value === 'string' ? JSON.stringify(value) : String(value)
    const color =
      typeof value === 'string'
        ? 'var(--dsw-alias-state-success-primary, #10b981)'
        : typeof value === 'number'
          ? 'var(--dsw-alias-brand-primary, #3b82f6)'
          : typeof value === 'boolean'
            ? 'var(--dsw-alias-state-warn-primary, #f59e0b)'
            : 'var(--dsw-alias-label-tertiary, #9ca3af)'
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          paddingLeft: depth * 14,
          lineHeight: 1.6,
        }}
      >
        {name !== undefined ? (
          <span style={{ color: 'var(--dsw-alias-label-secondary, inherit)' }}>{name}:</span>
        ) : null}
        <span style={{ color, wordBreak: 'break-all' }}>{formatted}</span>
        {copyable ? (
          <button
            type="button"
            onClick={() => handleCopy(typeof value === 'string' ? value : formatted)}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,0.8))',
              fontSize: 11,
              cursor: 'pointer',
              padding: '0 4px',
            }}
          >
            {copied ? '✓' : copyLabel}
          </button>
        ) : null}
      </div>
    )
  }

  const isArr = Array.isArray(value)
  const entries = isArr
    ? value.map((item, idx) => [String(idx), item] as const)
    : Object.entries(value as Record<string, unknown>)
  const summary = isArr ? `Array(${entries.length})` : `{${entries.length}}`

  return (
    <div
      style={{
        fontFamily: 'var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingLeft: depth * 14,
          lineHeight: 1.6,
        }}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--dsw-alias-label-secondary, inherit)',
            cursor: 'pointer',
            padding: 0,
            fontFamily: 'inherit',
            fontSize: 11,
          }}
        >
          {open ? '▾' : '▸'}
        </button>
        {name !== undefined ? (
          <span style={{ color: 'var(--dsw-alias-label-primary, inherit)', fontWeight: 500 }}>
            {name}:
          </span>
        ) : null}
        <span style={{ color: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,0.85))' }}>
          {open ? (isArr ? '[' : '{') : summary}
        </span>
      </div>
      {open ? (
        <div>
          {entries.map(([k, v]) => (
            <FallbackJsonNode
              key={k}
              name={isArr ? undefined : k}
              value={v}
              depth={depth + 1}
              expandedDepth={expandedDepth}
              copyable={copyable}
              copyLabel={copyLabel}
            />
          ))}
          <div
            style={{
              paddingLeft: depth * 14,
              color: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,0.85))',
            }}
          >
            {isArr ? ']' : '}'}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function DshJsonTree(props: {
  data: unknown
  label: string
  expandedDepth?: number | undefined
  copyable?: boolean | undefined
  className?: string | undefined
}) {
  const locale = useUiLocale()
  const msg = useShellMessages()
  const expandedDepth = props.expandedDepth ?? 2
  const copyable = props.copyable ?? true
  if (hasComponent(raw.JsonTree) && typeof props.data === 'object' && props.data !== null) {
    return (
      <HostPrimitives.JsonTree
        data={props.data as object | unknown[]}
        label={props.label}
        copyable={copyable}
        expandTopLevel={expandedDepth >= 1}
        collapsedStringLines={6}
        labels={getJsonTreeLabels(locale)}
        className={props.className}
      />
    )
  }
  return (
    <div role="tree" aria-label={props.label} className={props.className}>
      <FallbackJsonNode
        value={props.data}
        depth={0}
        expandedDepth={expandedDepth}
        copyable={copyable}
        copyLabel={msg.copy}
      />
    </div>
  )
}

export function DshSearchIcon({ size = 14 }: { size?: number }) {
  if (hasComponent(raw.IconSearchOutlineRegular)) {
    return <HostPrimitives.IconSearchOutlineRegular size={size} />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M10.5 10.5L13.5 13.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function DshChevronDownIcon({ size = 14 }: { size?: number }) {
  if (hasComponent(raw.IconChevronDownOutlineRegular)) {
    return <HostPrimitives.IconChevronDownOutlineRegular size={size} />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 6.2L8 10.2L12 6.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function DshChevronUpIcon({ size = 14 }: { size?: number }) {
  if (hasComponent(raw.IconChevronUpOutlineRegular)) {
    return <HostPrimitives.IconChevronUpOutlineRegular size={size} />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 9.8L8 5.8L12 9.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function DshCheckIcon({ size = 13 }: { size?: number }) {
  if (hasComponent(raw.IconCheckOutlineRegular)) {
    return <HostPrimitives.IconCheckOutlineRegular size={size} />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.2 8.4L6.4 11.6L12.8 4.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function DshWarningIcon({ size = 15 }: { size?: number }) {
  if (hasComponent(raw.IconWarningOutlineRegular)) {
    return <HostPrimitives.IconWarningOutlineRegular size={size} />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2.4L14 13H2L8 2.4Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M8 6.4V9.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r="0.7" fill="currentColor" />
    </svg>
  )
}

function FallbackToast(props: {
  text: string
  tone?: 'success' | undefined
  icon?: ReactNode
  holdMs?: number | undefined
  onDone: () => void
}) {
  useAutoDismissTimer(props.holdMs ?? 3000, props.onDone)

  if (typeof document === 'undefined') {
    return (
      <span role="status" data-a2ui-toast={props.tone ?? 'default'}>
        {props.text}
      </span>
    )
  }

  return createPortal(
    <div
      role="alert"
      data-a2ui-toast={props.tone ?? 'default'}
      style={{
        position: 'fixed',
        top: 40,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1100,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        maxWidth: 'min(640px, calc(100vw - 48px))',
        padding: '12px 16px',
        borderRadius: 'var(--dsw-radius-lg, 12px)',
        background: 'var(--dsw-alias-toast-bg, var(--dsw-alias-bg-layer-2, #1f2329))',
        color: 'var(--dsw-alias-toast-label, var(--dsw-alias-label-primary, #ffffff))',
        fontSize: 14,
        lineHeight: '22px',
        boxShadow: 'var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,0.24))',
      }}
    >
      {props.tone === 'success' ? (
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            color: 'var(--dsw-alias-state-success-primary, #10b981)',
          }}
          aria-hidden="true"
        >
          <DshCheckIcon size={15} />
        </span>
      ) : props.icon !== undefined ? (
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            color: 'var(--dsw-alias-state-warn-label, #f59e0b)',
          }}
          aria-hidden="true"
        >
          {props.icon}
        </span>
      ) : null}
      <span>{props.text}</span>
    </div>,
    document.body,
  )
}

export function DshToast(props: {
  text: string
  tone?: 'success' | undefined
  icon?: ReactNode
  holdMs?: number | undefined
  onDone: () => void
}) {
  if (hasComponent(raw.Toast)) {
    return (
      <HostPrimitives.Toast
        text={props.text}
        tone={props.tone}
        icon={props.icon}
        holdMs={props.holdMs}
        onDone={props.onDone}
      />
    )
  }
  return <FallbackToast {...props} />
}

export function DshMenu(props: {
  open: boolean
  items: readonly MenuItem[]
  selectedId?: string
  onSelect: (id: string) => void
  onClose: () => void
  side?: 'top' | 'bottom'
  anchor: ReactElement
}) {
  if (hasComponent(raw.Menu)) {
    return (
      <HostPrimitives.Menu
        open={props.open}
        items={props.items}
        selectedId={props.selectedId}
        onSelect={props.onSelect}
        onClose={props.onClose}
        side={props.side ?? 'top'}
        portal={true}
        anchor={props.anchor}
      />
    )
  }
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      {props.anchor}
      {props.open && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="presentation"
              onClick={props.onClose}
              style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            >
              <div
                role="menu"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  left: 24,
                  bottom: 64,
                  minWidth: 180,
                  padding: 4,
                  borderRadius: 'var(--dsw-radius-md, 10px)',
                  background: 'var(--dsw-specific-menu, var(--dsw-alias-bg-layer-2, #1f2329))',
                  boxShadow: 'var(--dsw-elevation-panel, 0 8px 24px rgba(0,0,0,0.22))',
                  border: '0.5px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.25))',
                }}
              >
                {props.items.map((item) => (
                  <button
                    key={item.id}
                    role="menuitem"
                    type="button"
                    disabled={item.disabled}
                    onClick={() => props.onSelect(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '6px 10px',
                      border: 'none',
                      borderRadius: 6,
                      background:
                        item.id === props.selectedId
                          ? 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.14))'
                          : 'transparent',
                      color: 'var(--dsw-alias-label-primary, inherit)',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    <span>{item.label}</span>
                    {item.id === props.selectedId ? <DshCheckIcon size={12} /> : null}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}

export const DshDisclosureRow = HostPrimitives.DisclosureRow

export function DshAppsIcon({ size = 14 }: { size?: number }) {
  if (hasComponent(raw.IconAppsAddOutlineRegular)) {
    return <HostPrimitives.IconAppsAddOutlineRegular size={size} />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect
        x="2.2"
        y="2.2"
        width="4.6"
        height="4.6"
        rx="1.1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <rect
        x="9.2"
        y="2.2"
        width="4.6"
        height="4.6"
        rx="1.1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <rect
        x="2.2"
        y="9.2"
        width="4.6"
        height="4.6"
        rx="1.1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M11.5 9.2V13.8M9.2 11.5H13.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function DshStateDot(props: {
  state: 'done' | 'ongoing' | 'error' | 'pending'
  size?: number | undefined
  appearance?: 'dot' | 'step' | undefined
  className?: string | undefined
}) {
  if (hasComponent(raw.StateDot)) {
    return <HostPrimitives.StateDot {...props} />
  }
  const sz = props.size ?? 8
  const bg =
    props.state === 'done'
      ? 'var(--dsw-alias-state-success-primary, #10b981)'
      : props.state === 'error'
        ? 'var(--dsw-alias-state-error-primary, #ef4444)'
        : props.state === 'ongoing'
          ? 'var(--dsw-alias-brand-primary, #4d6bfe)'
          : 'var(--dsw-alias-label-tertiary, #9ca3af)'
  return (
    <span
      className={props.className}
      data-state={props.state}
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: sz,
        height: sz,
        borderRadius: '50%',
        background: bg,
        flexShrink: 0,
      }}
    />
  )
}

export function DshHoverCardGroup({ children }: { children: ReactNode }) {
  if (hasComponent(raw.HoverCardGroup)) {
    return <HostPrimitives.HoverCardGroup>{children}</HostPrimitives.HoverCardGroup>
  }
  return <>{children}</>
}

export function DshHoverCard(props: {
  anchor: ReactElement
  content: ReactNode
  openDelayMs?: number | undefined
  grouped?: boolean | undefined
  inline?: boolean | undefined
  fitContent?: boolean | undefined
  fallbackTitle?: string | undefined
}) {
  if (hasComponent(raw.HoverCard)) {
    return (
      <HostPrimitives.HoverCard
        anchor={props.anchor}
        content={props.content}
        openDelayMs={props.openDelayMs ?? 80}
        grouped={props.grouped}
        inline={props.inline}
        fitContent={props.fitContent ?? true}
        variant="compact"
      />
    )
  }
  return props.fallbackTitle ? (
    <span title={props.fallbackTitle} style={{ display: 'contents' }}>
      {props.anchor}
    </span>
  ) : (
    props.anchor
  )
}

export function DshImageLightbox(props: {
  open: boolean
  src: string
  alt: string
  dialogLabel: string
  closeLabel: string
  onClose: () => void
}) {
  if (!props.open || typeof document === 'undefined') return null
  if (hasComponent(raw.ImageLightbox)) {
    return (
      <HostPrimitives.ImageLightbox
        src={props.src}
        alt={props.alt}
        labels={{ dialog: props.dialogLabel, close: props.closeLabel }}
        onClose={props.onClose}
      />
    )
  }
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={props.dialogLabel}
      onClick={props.onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.72))',
      }}
    >
      <img
        src={props.src}
        alt={props.alt}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 10, objectFit: 'contain' }}
      />
    </div>,
    document.body,
  )
}

export function DshFileTypeIcon(props: { path: string; size?: number; className?: string }) {
  if (hasComponent(raw.FileTypeIcon)) {
    return (
      <HostPrimitives.FileTypeIcon
        path={props.path}
        size={props.size ?? 14}
        className={props.className}
      />
    )
  }
  const sz = props.size ?? 14
  return (
    <svg
      width={sz}
      height={sz}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={props.className}
    >
      <path
        d="M3.5 2.5H9.5L12.5 5.5V13.5H3.5V2.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M9 2.5V6H12.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

export function DshPathLabel(props: { path: string; className?: string }) {
  if (hasComponent(raw.PathLabel)) {
    return <HostPrimitives.PathLabel path={props.path} className={props.className} />
  }
  return (
    <span className={props.className} title={props.path}>
      {props.path}
    </span>
  )
}

export function DshLinkIcon(props: { href?: string; size?: number; className?: string }) {
  if (hasComponent(raw.LinkIconRegular)) {
    return (
      <HostPrimitives.LinkIconRegular
        kind="url"
        href={props.href}
        size={props.size ?? 14}
        className={props.className}
      />
    )
  }
  const sz = props.size ?? 14
  return (
    <svg
      width={sz}
      height={sz}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={props.className}
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M2.5 8H13.5M8 2.2C9.6 3.9 9.6 12.1 8 13.8C6.4 12.1 6.4 3.9 8 2.2Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  )
}

export function DshTextShimmer(props: {
  children: ReactNode
  active?: boolean
  className?: string
}) {
  if (hasComponent(raw.TextShimmer)) {
    return (
      <HostPrimitives.TextShimmer active={props.active ?? true} className={props.className}>
        {props.children}
      </HostPrimitives.TextShimmer>
    )
  }
  return <span className={props.className}>{props.children}</span>
}
