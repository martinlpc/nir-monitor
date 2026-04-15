import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            gap: '1rem',
            padding: '2rem',
            color: '#edf4ff',
            textAlign: 'center'
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Algo salió mal</h1>
          <p style={{ color: '#b4c4d9', maxWidth: '480px' }}>
            Ocurrió un error inesperado. Intentá recargar la aplicación.
          </p>
          <pre
            style={{
              fontSize: '0.75rem',
              color: '#fca5a5',
              background: 'rgba(239, 68, 68, 0.1)',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              maxWidth: '600px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.6rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #f0a646, #f36f45)',
              color: '#1b120d',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Recargar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
