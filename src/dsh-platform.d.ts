/**
 * Ambient types for the DSH browser platform modules shared via
 * `window.__ModuleLoader__` (`PLATFORM_MODULES`).
 *
 * Verified against `@deepseek-ai/dsh-client-ui-primitives@0.2.2-rc.1`.
 */
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type {
    ButtonHTMLAttributes,
    ForwardRefExoticComponent,
    InputHTMLAttributes,
    JSX,
    MemoExoticComponent,
    ReactElement,
    ReactNode,
    ReactPortal,
    RefAttributes,
  } from 'react'

  export interface IconProps {
    size?: number
    className?: string
  }

  export const IconAppsAddOutlineRegular: (props: IconProps) => JSX.Element
  export const IconSearchOutlineRegular: (props: IconProps) => JSX.Element
  export const IconChevronDownOutlineRegular: (props: IconProps) => JSX.Element
  export const IconChevronUpOutlineRegular: (props: IconProps) => JSX.Element
  export const IconCheckOutlineRegular: (props: IconProps) => JSX.Element

  export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'toolbar'

  export const Button: ForwardRefExoticComponent<
    {
      variant?: ButtonVariant
      size?: 'md' | 'sm'
      icon?: ReactNode
      className?: string | undefined
      children?: ReactNode
    } & ButtonHTMLAttributes<HTMLButtonElement> &
      RefAttributes<HTMLButtonElement>
  >

  export function Checkbox(props: {
    checked: boolean
    onChange: (next: boolean) => void
    label: string
    disabled?: boolean
    title?: string | undefined
    className?: string | undefined
  }): JSX.Element

  export const Input: ForwardRefExoticComponent<
    {
      icon?: ReactNode
      className?: string
    } & InputHTMLAttributes<HTMLInputElement> &
      RefAttributes<HTMLInputElement>
  >

  export function Pill(
    props: {
      active?: boolean
      className?: string | undefined
      children?: ReactNode
    } & ButtonHTMLAttributes<HTMLButtonElement>,
  ): JSX.Element

  export interface SegmentedTab<Value extends string = string> {
    value: Value
    label: ReactNode
    id: string
    panelId: string
  }

  export function SegmentedTabs<Value extends string = string>(props: {
    items: readonly [SegmentedTab<Value>, ...SegmentedTab<Value>[]]
    value: Value
    onChange: (value: Value) => void
    label: string
    className?: string | undefined
    size?: 'sm' | 'md' | undefined
  }): ReactNode

  export interface SegmentedControlOption<Value extends string = string> {
    value: Value
    label: string
    disabled?: boolean
    title?: string
  }

  export function SegmentedControl<Value extends string = string>(props: {
    id: string
    value: Value
    options: readonly SegmentedControlOption<Value>[]
    onChange: (next: Value) => void
    label: string
    disabled?: boolean
    className?: string | undefined
  }): JSX.Element

  export type TagTone = 'outline' | 'solid' | 'neutral' | 'quiet' | 'success' | 'info' | 'warning' | 'danger'

  export function Tag(props: {
    tone?: TagTone
    className?: string | undefined
    children?: ReactNode
  }): JSX.Element

  export function Modal(props: {
    open: boolean
    onClose: () => void
    title: string
    closeLabel: string
    description?: string
    children?: ReactNode
    footer?: ReactNode
    className?: string
    contentClassName?: string
    backdropBlur?: boolean
  }): ReactPortal | null

  export function Tooltip(props: {
    label: string | (() => string)
    side?: 'top' | 'bottom' | 'left' | 'right'
    align?: 'center' | 'end'
    portal?: boolean
    disabled?: boolean
    maxWidth?: number
    children: ReactElement
  }): JSX.Element

  export interface MenuItem {
    id: string
    label: ReactNode
    icon?: ReactNode
    disabled?: boolean
  }

  export function Menu(props: {
    open: boolean
    items: readonly MenuItem[]
    selectedId?: string
    onSelect: (id: string) => void
    onClose: () => void
    side?: 'top' | 'bottom' | 'left' | 'right'
    align?: 'start' | 'center' | 'end'
    portal?: boolean
    anchor: ReactElement
  }): JSX.Element

  export interface CodeToolbarLabels {
    codeLabel: string
    wrapLabel: string
    unwrapLabel: string
  }

  export function CodeBlock(props: {
    code: string
    lang?: string | undefined
    streaming?: boolean | undefined
    className?: string | undefined
    lineNumbers?: boolean | undefined
    showHeader?: boolean | undefined
    copyLabel: string
    copiedLabel: string
    toolbarLabels?: CodeToolbarLabels | undefined
    wrap?: boolean | undefined
  }): JSX.Element

  export function JsonBlock(props: {
    label: string
    payload: unknown
    defaultOpen?: boolean
    truncatedLabel: (total: number) => string
  }): JSX.Element

  export interface JsonTreeLabels {
    copyValue: string
    copyJson: string
    copyPath: string
    copyPrettyJson: string
    copyCompactJson: string
    copied: string
    copyFailed: string
    collapseNode: string
    expandNode: string
    copyButtonTitle: (action: string) => string
  }

  export interface JsonTreeProps {
    data: object | unknown[]
    label: string
    className?: string | undefined
    collapsedStringLines?: number
    stringWrapping?: {
      label: string
      getDefault: () => boolean
      setDefault: (wrapped: boolean) => void
    } | undefined
    copyable?: boolean
    expandTopLevel?: boolean
    labels: JsonTreeLabels
  }

  export function JsonTree(props: JsonTreeProps): JSX.Element

  export interface DisclosureRowProps {
    icon: ReactNode
    title: string
    open: boolean
    expandable: boolean
    onToggle: () => void
    running?: boolean | undefined
    expandOnRowClick?: boolean | undefined
    previewChevron?: boolean | undefined
    keepContentWhenOpen?: boolean | undefined
    collapsedContent?: ReactNode
    headerAccessory?: ReactNode
    children?: ReactNode
    className?: string | undefined
  }

  export const DisclosureRow: MemoExoticComponent<(props: DisclosureRowProps) => JSX.Element>

  export interface MarkdownCodeLabels {
    copyLabel: string
    copiedLabel: string
    toolbarLabels: CodeToolbarLabels
  }

  export interface MarkdownLabels {
    code: MarkdownCodeLabels
    footnotes: string
  }

  export const MarkdownText: MemoExoticComponent<
    (props: {
      text: string
      streaming?: boolean
      labels: MarkdownLabels
      variant?: 'body' | 'compact'
      omitHtml?: boolean
    }) => JSX.Element
  >
}
