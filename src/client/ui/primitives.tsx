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
import { useShellMessages, useUiLocale } from '../i18n.ts'

export type { ButtonVariant, JsonTreeLabels, MarkdownLabels, MenuItem, SegmentedTab, TagTone }

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
>(function FallbackButton({ variant = 'outline', size = 'md', icon, className, children, style, ...rest }, ref) {
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
        border: isPrimary || isGhost ? 'none' : '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.28))',
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
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: props.disabled ? 'not-allowed' : 'pointer' }}
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

const FallbackInput = forwardRef<
  HTMLInputElement,
  { icon?: ReactNode; className?: string } & InputHTMLAttributes<HTMLInputElement>
>(function FallbackInput({ icon, className, style, ...rest }, ref) {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: '100%' }}>
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

export function DshTag(props: { tone?: TagTone; className?: string | undefined; children?: ReactNode }) {
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
    <div role="tablist" aria-label={props.label} className={props.className} style={{ display: 'flex', gap: 4 }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: 15 }}>{props.title}</strong>
          <DshButton variant="ghost" size="sm" onClick={props.onClose} aria-label={props.closeLabel}>
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

export function DshTooltip(props: {
  label: string
  disabled?: boolean
  children: ReactElement
}) {
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

export function DshMarkdown(props: { text: string; variant?: 'body' | 'compact'; streaming?: boolean }) {
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
    const formatted =
      typeof value === 'string' ? JSON.stringify(value) : String(value)
    const color =
      typeof value === 'string'
        ? 'var(--dsw-alias-state-success-primary, #10b981)'
        : typeof value === 'number'
          ? 'var(--dsw-alias-brand-primary, #3b82f6)'
          : typeof value === 'boolean'
            ? 'var(--dsw-alias-state-warn-primary, #f59e0b)'
            : 'var(--dsw-alias-label-tertiary, #9ca3af)'
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, paddingLeft: depth * 14, lineHeight: 1.6 }}>
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
    <div style={{ fontFamily: 'var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace)', fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: depth * 14, lineHeight: 1.6 }}>
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
          <span style={{ color: 'var(--dsw-alias-label-primary, inherit)', fontWeight: 500 }}>{name}:</span>
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
          <div style={{ paddingLeft: depth * 14, color: 'var(--dsw-alias-label-tertiary, rgba(128,128,128,0.85))' }}>
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
      <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function DshChevronDownIcon({ size = 14 }: { size?: number }) {
  if (hasComponent(raw.IconChevronDownOutlineRegular)) {
    return <HostPrimitives.IconChevronDownOutlineRegular size={size} />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6.2L8 10.2L12 6.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DshChevronUpIcon({ size = 14 }: { size?: number }) {
  if (hasComponent(raw.IconChevronUpOutlineRegular)) {
    return <HostPrimitives.IconChevronUpOutlineRegular size={size} />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 9.8L8 5.8L12 9.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DshCheckIcon({ size = 13 }: { size?: number }) {
  if (hasComponent(raw.IconCheckOutlineRegular)) {
    return <HostPrimitives.IconCheckOutlineRegular size={size} />
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.2 8.4L6.4 11.6L12.8 4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
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
export const DshAppsIcon = HostPrimitives.IconAppsAddOutlineRegular
