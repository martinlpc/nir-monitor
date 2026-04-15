import { useEffect, useState } from 'react'
import './SettingsPanel.css'

interface UncertaintyRecord {
  name: string
  fMin: number
  fMax: number
  uncertainty: number
  factor: number
}

interface UncertaintyData {
  filePath: string
  headers: string[]
  records: UncertaintyRecord[]
}

interface ProbeInfo {
  model: string | null
  serial: string | null
  calibrationDate: string | null
}

interface ActiveUncertainty {
  factor: number | null
  matchedRecord: UncertaintyRecord | null
  probeModel: string | null
}

export default function SettingsPanel(): React.JSX.Element {
  const [uncertainty, setUncertainty] = useState<UncertaintyData | null>(null)
  const [probeInfo, setProbeInfo] = useState<ProbeInfo | null>(null)
  const [activeUncertainty, setActiveUncertainty] = useState<ActiveUncertainty | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Cargar info de sonda, incertidumbre activa y archivo persistido al montar
  useEffect(() => {
    const fetchProbeAndActive = (): void => {
      window.api.settings.getProbeInfo().then((res) => {
        if (res.success && res.probeInfo) setProbeInfo(res.probeInfo)
      })
      window.api.settings.getActiveUncertainty().then((res) => {
        if (res.success) setActiveUncertainty(res)
      })
    }

    fetchProbeAndActive()

    window.api.settings.getLoadedUncertainty().then((res) => {
      if (res.success && res.records) {
        setUncertainty({
          filePath: res.filePath!,
          headers: res.headers!,
          records: res.records
        })
      }
    })

    // Re-fetch probe info cuando el NBM se conecta
    const unsubscribe = window.api.devices.onStatus((data) => {
      if (data.deviceId === 'nbm550' && data.status === 'connected') {
        // Pequeño delay para que el driver tenga la info de sonda lista
        setTimeout(fetchProbeAndActive, 500)
      }
    })

    return unsubscribe
  }, [])

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
        // Refrescar incertidumbre activa y probe info tras cargar archivo nuevo
        const [active, probe] = await Promise.all([
          window.api.settings.getActiveUncertainty(),
          window.api.settings.getProbeInfo()
        ])
        if (active.success) setActiveUncertainty(active)
        if (probe.success && probe.probeInfo) setProbeInfo(probe.probeInfo)
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error al abrir archivo')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="settings-panel">
      {/* === Sección: Sonda + Factor === */}
      {probeInfo?.model && (
        <section className="settings-section">
          <h3 className="settings-section__title">Sonda detectada</h3>
          <div className="settings-option">
            <span className="settings-option__label">Modelo</span>
            <span className="settings-option__value">{probeInfo.model}</span>
          </div>
          {activeUncertainty?.matchedRecord && (
            <div className="settings-option">
              <span className="settings-option__label">Factor aplicado</span>
              <span className="settings-option__value settings-option__highlight">
                ×{activeUncertainty.matchedRecord.factor}
              </span>
            </div>
          )}
        </section>
      )}

      {/* === Sección: Tabla de incertidumbres === */}
      <section className="settings-section">
        <h3 className="settings-section__title">Tabla de incertidumbres</h3>

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
                    <th>Sonda</th>
                    <th>f Min (MHz)</th>
                    <th>f Max (MHz)</th>
                    <th>Incert.</th>
                    <th>Factor</th>
                  </tr>
                </thead>
                <tbody>
                  {uncertainty.records.map((rec, i) => (
                    <tr
                      key={i}
                      className={
                        activeUncertainty?.matchedRecord &&
                        rec.name === activeUncertainty.matchedRecord.name &&
                        rec.fMin === activeUncertainty.matchedRecord.fMin &&
                        rec.fMax === activeUncertainty.matchedRecord.fMax
                          ? 'row-active'
                          : ''
                      }
                    >
                      <td>{rec.name}</td>
                      <td>{rec.fMin}</td>
                      <td>{rec.fMax}</td>
                      <td>{rec.uncertainty}</td>
                      <td>{rec.factor}</td>
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
