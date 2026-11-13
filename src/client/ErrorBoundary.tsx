import { Component, type ErrorInfo, type ReactNode } from 'react'
import { resolveClientLocale, RUNTIME_MESSAGES } from '../shared/i18n.ts'

export interface ErrorBoundaryProps {
  readonly label?: string
  readonly children: ReactNode
}

interface ErrorBoundaryState {
  readonly error: Error | null
}

/** Per-card containment boundary so a surface error never crashes the DSH timeline. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
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
