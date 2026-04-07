import { Component, type ErrorInfo, type ReactNode } from 'react'

interface SPCErrorBoundaryProps {
  children: ReactNode
}

interface SPCErrorBoundaryState {
  hasError: boolean
}

export default class SPCErrorBoundary extends Component<SPCErrorBoundaryProps, SPCErrorBoundaryState> {
  state: SPCErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): SPCErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SPC tab render failed', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded-xl border border-[var(--c-error-border)] bg-[var(--c-error-bg)] px-5 py-6 shadow-sm"
        >
          <div className="text-sm font-semibold uppercase tracking-[0.08em] text-[var(--c-error-text)]">
            Analysis view unavailable
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--c-error-text)]">
            This tab hit an unexpected rendering error. Your filters and selections are still
            preserved, so you can retry the view without losing context.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-4 inline-flex items-center rounded-full border border-[var(--c-error-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--c-error-text)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-brand)] focus-visible:ring-offset-2"
          >
            Retry tab
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
