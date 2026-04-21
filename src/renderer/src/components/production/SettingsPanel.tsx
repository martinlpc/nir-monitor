import { useEffect, useState } from 'react'
import './SettingsPanel.css'

interface CorrectionFactorRecord {
  name: string
  fMin: number
  fMax: number
  factor: number
}

interface CorrectionFactorData {
  filePath: string
  headers: string[]
  records: CorrectionFactorRecord[]
}

interface ProbeInfo {
  model: string | null
  serial: string | null
  calibrationDate: string | null
}

interface ActiveCorrectionFactor {
  factor: number | null
  matchedRecord: CorrectionFactorRecord | null
  probeModel: string | null
}

export default function SettingsPanel(): React.JSX.Element {
  // Cambiar nombres a los del preload original
  const [correctionData, setCorrectionData] = useState<CorrectionFactorData | null>(null)
  const [probeInfo, setProbeInfo] = useState<ProbeInfo | null>(null)
  const [activeCorrection, setActiveCorrection] = useState<ActiveCorrectionFactor | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const refreshProbeAndMatch = (): void => {
    window.api.settings.getProbeInfo().then((res) => {
      if (res.success && res.probeInfo) setProbeInfo(res.probeInfo)
    })
    window.api.settings.getActiveUncertainty().then((res) => {
      if (res.success) setActiveCorrection(res)
    })
  }

  useEffect(() => {
    refreshProbeAndMatch()
    window.api.settings.getLoadedUncertainty().then((res) => {
      if (res.success && res.filePath && res.headers && res.records) {
        setCorrectionData({ filePath: res.filePath, headers: res.headers, records: res.records })
      }
    })
  }, [])

  useEffect(() => {
    const unsub = window.api.devices.onStatus((data) => {
      if (data.deviceId === 'nbm550' && data.status === 'connected') {
        refreshProbeAndMatch()
      }
    })
    return unsub
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
        setCorrectionData({
          filePath: result.filePath!,
          headers: result.headers!,
          records: result.records!
        })
        // Refrescar factor activo tras cargar archivo nuevo
        const active = await window.api.settings.getActiveUncertainty()
        if (active.success) setActiveCorrection(active)
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error al abrir archivo')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="settings-panel">
      {/* === Sonda detectada + factor === */}
      {probeInfo && (
        <section className="settings-section">
          <h3 className="settings-section__title">Sonda detectada</h3>
          <div className="settings-option">
            <span className="settings-option__label">Modelo</span>
            <span className="settings-option__value">{probeInfo.model ?? '—'}</span>
          </div>
          {activeCorrection?.matchedRecord && (
            <div className="settings-option">
              <span className="settings-option__label">Factor de corrección aplicado</span>
              <span className="settings-option__value settings-option__highlight">
                ×{activeCorrection.matchedRecord.factor}
              </span>
            </div>
          )}
        </section>
      )}

      {/* === Sección: Tabla de incertidumbres === */}
      <section className="settings-section">
        <h3 className="settings-section__title">Tabla de factores de corrección</h3>
        <p className="settings-section__desc">
          Archivo con factores de corrección por rango de frecuencia.
        </p>

        <button
          className="settings-btn"
          onClick={handleLoadFile}
          disabled={isLoading}
        >
          {isLoading ? 'Cargando...' : correctionData ? 'Cambiar archivo' : 'Cargar archivo'}
        </button>

        {loadError && (
          <div className="settings-error">{loadError}</div>
        )}

        {correctionData && (
          <div className="settings-uncertainty">
            <span className="settings-filepath" title={correctionData.filePath}>
              {correctionData.filePath.split(/[\\/]/).pop()}
            </span>
            <div className="settings-table-wrapper">
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>Sonda</th>
                    <th>f Min (MHz)</th>
                    <th>f Max (MHz)</th>
                    <th>Factor</th>
                  </tr>
                </thead>
                <tbody>
                  {correctionData.records.map((rec, i) => (
                    <tr
                      key={i}
                      className={
                        activeCorrection?.matchedRecord?.name === rec.name &&
                        activeCorrection?.matchedRecord?.fMin === rec.fMin
                          ? 'row-active'
                          : ''
                      }
                    >
                      <td>{rec.name}</td>
                      <td>{rec.fMin}</td>
                      <td>{rec.fMax}</td>
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
