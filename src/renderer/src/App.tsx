import { useEffect } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import DebugPanel from './components/debug/DebugPanel'
import ProductionShell from './components/production/ProductionShell'
import { ToastProvider } from './components/production/ToastProvider'
import './components/production/toast.css'

function App(): React.JSX.Element {
  const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1'

  useEffect(() => {
    window.api.app.getVersion().then(({ version }) => {
      document.title = `nir-monitor v${version}`
    })
  }, [])

  return (
    <ErrorBoundary>
      <ToastProvider>{debugEnabled ? <DebugPanel /> : <ProductionShell />}</ToastProvider>
    </ErrorBoundary>
  )
}

export default App
