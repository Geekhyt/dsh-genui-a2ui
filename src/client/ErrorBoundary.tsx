import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RUNTIME_MESSAGES, resolveClientLocale } from '../shared/i18n.ts'

export interface ErrorBoundaryProps {
  readonly label?: string
  readonly resetKey?: string | number | undefined
  readonly children: ReactNode
}

interface ErrorBoundaryState {
  readonly error: Error | null
  readonly prevResetKey: string | number | undefined
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

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('[dsh-genui-a2ui] surface render failed:', error.message, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      const defaultLabel = RUNTIME_MESSAGES[resolveClientLocale()].renderErrorDefault
      return (
        <div role="alert" data-a2ui-error>
          <strong>{this.props.label ?? defaultLabel}</strong>
          <span>{this.state.error.message}</span>
        </div>
      )
    }
    return this.props.children
  }
}
