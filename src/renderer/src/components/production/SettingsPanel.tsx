import { useState } from 'react'
import './SettingsPanel.css'

interface UncertaintyRecord {
  frequency: string
  value: number
  unit: string
  [key: string]: string | number
}

interface UncertaintyData {
  filePath: string
  headers: string[]
  records: UncertaintyRecord[]
}

export default function SettingsPanel(): React.JSX.Element {
  const [uncertainty, setUncertainty] = useState<UncertaintyData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleLoadFile = async (): Promise<void> => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const result = await window.api.settings.openUncertaintyFile()
      if (result.canceled) {
        setIsLoading(false)
        return
      }
      if (!result.success) {
        setLoadError(result.error || 'Error desconocido')
      } else {
        setUncertainty({
          filePath: result.filePath!,
          headers: result.headers!,
          records: result.records!
        })
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error al abrir archivo')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="settings-panel">
      {/* === Sección: Incertidumbres === */}
      <section className="settings-section">
        <h3 className="settings-section__title">Incertidumbres</h3>
        <p className="settings-section__desc">
          Tabla de incertidumbre asociada a la sonda conectada al NBM.
        </p>

        <button
          className="settings-btn"
          onClick={handleLoadFile}
          disabled={isLoading}
        >
          {isLoading ? 'Cargando...' : uncertainty ? 'Cambiar archivo' : 'Cargar archivo'}
        </button>

        {loadError && (
          <div className="settings-error">{loadError}</div>
        )}

        {uncertainty && (
          <div className="settings-uncertainty">
            <span className="settings-filepath" title={uncertainty.filePath}>
              {uncertainty.filePath.split(/[\\/]/).pop()}
            </span>
            <div className="settings-table-wrapper">
              <table className="settings-table">
                <thead>
                  <tr>
                    {uncertainty.headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uncertainty.records.map((rec, i) => (
                    <tr key={i}>
                      {uncertainty.headers.map((h) => (
                        <td key={h}>{rec[h] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* === Sección: Preferencias de UI === */}
      <section className="settings-section">
        <h3 className="settings-section__title">Interfaz</h3>
        <div className="settings-option">
          <span className="settings-option__label">Tema</span>
          <span className="settings-option__value settings-option__coming-soon">Próximamente</span>
        </div>
      </section>
    </div>
  )
}
