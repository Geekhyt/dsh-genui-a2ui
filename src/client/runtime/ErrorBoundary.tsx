import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RUNTIME_MESSAGES, resolveClientLocale } from '../../shared/i18n.ts'

export interface ErrorBoundaryProps {
  readonly label?: string
  readonly widgetName?: string
  readonly resetKey?: string | number | undefined
  readonly children: ReactNode
}

interface ErrorBoundaryState {
  readonly error: Error | null
  readonly prevResetKey: string | number | undefined
}

function toErrorObject(error: unknown): Error {
  if (error instanceof Error) return error
  if (typeof error === 'string' && error.trim() !== '') return new Error(error)
  try {
    return new Error(String(error))
  } catch {
    return new Error('Unknown render error')
  }
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, prevResetKey: this.props.resetKey }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (props.resetKey !== state.prevResetKey) {
      return { error: null, prevResetKey: props.resetKey }
    }
    return null
  }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: toErrorObject(error) }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.warn(
      `[dsh-genui-a2ui] ${this.props.widgetName ? `widget ${this.props.widgetName}` : 'surface'} render failed:`,
      toErrorObject(error).message,
      info.componentStack,
    )
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      const defaultLabel = RUNTIME_MESSAGES[resolveClientLocale()].renderErrorDefault
      return (
        <div
          role="alert"
          data-a2ui-error=""
          data-a2ui-widget-error={this.props.widgetName || undefined}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'baseline',
            ...(this.props.widgetName
              ? {
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--dsw-alias-state-error-primary, rgba(239,68,68,0.4))',
                  fontSize: 12,
                }
              : undefined),
          }}
        >
          <strong>{this.props.label ?? defaultLabel}</strong>
          <span>{this.state.error.message}</span>
        </div>
      )
    }
    return this.props.children
  }
}
