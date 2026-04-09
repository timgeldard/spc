import { Button } from '~/lib/carbon-forms'
import { InlineNotification } from '~/lib/carbon-feedback'
import { Stack, Tile } from '~/lib/carbon-layout'
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
        <Tile role="alert">
          <Stack gap={4}>
            <InlineNotification
              kind="error"
              title="Analysis view unavailable"
              subtitle="This tab hit an unexpected rendering error. Your filters and selections are still preserved, so you can retry without losing context."
              hideCloseButton
            />
            <div>
              <Button kind="secondary" size="sm" onClick={this.handleRetry}>
                Retry tab
              </Button>
            </div>
          </Stack>
        </Tile>
      )
    }

    return this.props.children
  }
}
