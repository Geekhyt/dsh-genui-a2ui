import { Component, type ErrorInfo, type ReactNode } from 'react'

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
      return (
        <div role="alert" data-a2ui-error>
          <strong>{this.props.label ?? 'A2UI 渲染异常'}</strong>
          <span>{this.state.error.message}</span>
        </div>
      )
    }
    return this.props.children
  }
}
