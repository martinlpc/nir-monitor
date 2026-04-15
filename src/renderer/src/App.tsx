import ErrorBoundary from './components/ErrorBoundary'
import DebugPanel from './components/debug/DebugPanel'
import ProductionShell from './components/production/ProductionShell'

function App(): React.JSX.Element {
  const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1'
  return (
    <ErrorBoundary>
      {debugEnabled ? <DebugPanel /> : <ProductionShell />}
    </ErrorBoundary>
  )
}

export default App
