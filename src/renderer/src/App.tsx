import DebugPanel from './components/debug/DebugPanel'
import ProductionShell from './components/production/ProductionShell'

function App(): React.JSX.Element {
  const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1'
  return debugEnabled ? <DebugPanel /> : <ProductionShell />
}

export default App
