import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Alert } from './ui/Alert'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Catches render-time crashes so a failure shows a recoverable screen instead
 * of a white page. Deliberately renders no error detail: React error messages
 * can include component state, which must never appear on screen in an app
 * that displays health information.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console only - never rendered.
    console.error('Unhandled UI error', error, info.componentStack)
  }

  private handleReset = (): void => {
    this.setState({ hasError: false })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="container narrow section">
        <Alert tone="error">
          <h1 className="h2">Something went wrong</h1>
          <p>
            The page could not be displayed. Your data was not changed. Reload the page to try
            again.
          </p>
        </Alert>
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={this.handleReset}>
            Try again
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      </div>
    )
  }
}
