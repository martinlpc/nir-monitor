import { useEffect, useState } from 'react'
import type { TileProvider } from '../../../../shared/tileProviders'
import type { TileCacheStats, PreloadProgress } from '../../hooks/useTileCache'
import './SettingsPanel.css'

interface SettingsPanelProps {
  theme: 'dark' | 'soft'
  onThemeChange: (theme: 'dark' | 'soft') => void
  tileProviders: TileProvider[]
  selectedProvider: TileProvider
  onProviderChange: (id: string) => void
  cacheStats: TileCacheStats | null
  onClearCache: () => Promise<boolean>
  onImportTiles: (providerId: string) => Promise<{ imported: number; skipped: number } | null>
  onPreloadTiles: (options: {
    providerId: string
    north: number
    south: number
    east: number
    west: number
    minZoom: number
    maxZoom: number
  }) => void
  onCancelPreload: () => void
  preloadProgress: PreloadProgress | null
  onSelectMapBounds?: () => { north: number; south: number; east: number; west: number } | null
}

interface BuiltInRecord {
  name: string
  fMin: number
  fMax: number
  uncertainty: number
  factor: number
}

interface ProbeInfo {
  model: string | null
  serial: string | null
  calibrationDate: string | null
}

interface ActiveCorrectionFactor {
  factor: number | null
  matchedRecord: BuiltInRecord | null
  probeModel: string | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SettingsPanel({
  theme,
  onThemeChange,
  tileProviders,
  selectedProvider,
  onProviderChange,
  cacheStats,
  onClearCache,
  onImportTiles,
  onPreloadTiles,
  onCancelPreload,
  preloadProgress,
  onSelectMapBounds
}: SettingsPanelProps): React.JSX.Element {
  const [probeRecords, setProbeRecords] = useState<BuiltInRecord[]>([])
  const [dataVersion, setDataVersion] = useState<number | null>(null)
  const [probeInfo, setProbeInfo] = useState<ProbeInfo | null>(null)
  const [activeCorrection, setActiveCorrection] = useState<ActiveCorrectionFactor | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)

  const [preloadBounds, setPreloadBounds] = useState<{
    north: number
    south: number
    east: number
    west: number
  } | null>(null)
  const [preloadMinZoom, setPreloadMinZoom] = useState(10)
  const [preloadMaxZoom, setPreloadMaxZoom] = useState(18)
  const [showPreload, setShowPreload] = useState(false)

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
    window.api.settings.getBuiltInProbeData().then((res) => {
      if (res.success) {
        setProbeRecords(res.records)
        setDataVersion(res.version)
      }
    })
    window.api.app.getVersion().then(({ version }) => {
      setAppVersion(version)
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

  const handleClearCache = async (): Promise<void> => {
    await onClearCache()
  }

  const handleImport = async (): Promise<void> => {
    await onImportTiles(selectedProvider.id)
  }

  const handleSelectBounds = (): void => {
    const bounds = onSelectMapBounds?.()
    if (bounds) {
      setPreloadBounds(bounds)
    }
  }

  const handlePreload = (): void => {
    if (!preloadBounds) return
    onPreloadTiles({
      providerId: selectedProvider.id,
      ...preloadBounds,
      minZoom: preloadMinZoom,
      maxZoom: preloadMaxZoom
    })
  }

  const isPreloading =
    preloadProgress?.phase === 'counting' || preloadProgress?.phase === 'downloading'
  const percent =
    preloadProgress && preloadProgress.total > 0
      ? Math.round((preloadProgress.current / preloadProgress.total) * 100)
      : 0

  return (
    <div className="settings-panel">
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

      <section className="settings-section">
        <h3 className="settings-section__title">Tabla de factores de corrección</h3>
        <p className="settings-section__desc">
          Datos de sondas incorporados (v{dataVersion ?? '?'}). Se actualizan con cada versión de la
          aplicación.
        </p>

        {probeRecords.length > 0 && (
          <div className="settings-uncertainty">
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
                  {probeRecords.map((rec, i) => (
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

      <section className="settings-section">
        <h3 className="settings-section__title">Interfaz</h3>
        <div className="settings-option">
          <span className="settings-option__label">Tema</span>
          <select
            className="settings-select"
            value={theme}
            onChange={(e) => onThemeChange(e.target.value as 'dark' | 'soft')}
          >
            <option value="dark">Oscuro</option>
            <option value="soft">Soft</option>
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section__title">Mapa</h3>
        <div className="settings-option">
          <span className="settings-option__label">Proveedor de tiles</span>
          <select
            className="settings-select"
            value={selectedProvider.id}
            onChange={(e) => onProviderChange(e.target.value)}
          >
            {tileProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {cacheStats && (
          <div className="settings-option">
            <span className="settings-option__label">Caché en disco</span>
            <span className="settings-option__value">
              {formatBytes(cacheStats.sizeBytes)} ({cacheStats.tileCount} tiles)
            </span>
          </div>
        )}

        <div className="settings-option">
          <button className="settings-btn" onClick={handleImport}>
            Importar tiles desde archivo...
          </button>
          <button className="settings-btn" onClick={handleClearCache}>
            Vaciar caché
          </button>
        </div>

        <div className="settings-option">
          <button className="settings-btn" onClick={() => setShowPreload(!showPreload)}>
            {showPreload ? 'Ocultar precarga' : 'Precargar zona'}
          </button>
        </div>

        {showPreload && (
          <div className="settings-preload">
            <p className="settings-section__desc">
              Descargar tiles del área visible para uso offline.
            </p>

            <button
              className="settings-btn settings-btn--primary"
              onClick={handleSelectBounds}
              disabled={!onSelectMapBounds}
            >
              Seleccionar vista actual del mapa
            </button>

            {preloadBounds && (
              <div className="settings-option">
                <span className="settings-option__label">Área capturada</span>
                <span className="settings-option__value">
                  N={preloadBounds.north.toFixed(4)} S={preloadBounds.south.toFixed(4)} E=
                  {preloadBounds.east.toFixed(4)} O={preloadBounds.west.toFixed(4)}
                </span>
              </div>
            )}

            <div className="settings-option">
              <span className="settings-option__label">Zoom min</span>
              <input
                className="settings-input"
                type="number"
                min={1}
                max={19}
                value={preloadMinZoom}
                onChange={(e) => setPreloadMinZoom(parseInt(e.target.value, 10) || 10)}
              />
            </div>
            <div className="settings-option">
              <span className="settings-option__label">Zoom max</span>
              <input
                className="settings-input"
                type="number"
                min={1}
                max={19}
                value={preloadMaxZoom}
                onChange={(e) => setPreloadMaxZoom(parseInt(e.target.value, 10) || 18)}
              />
            </div>

            {!isPreloading ? (
              <button
                className="settings-btn settings-btn--primary"
                onClick={handlePreload}
                disabled={isPreloading}
              >
                Iniciar descarga
              </button>
            ) : (
              <div className="settings-preload-progress">
                <p>
                  {preloadProgress.phase === 'counting'
                    ? 'Calculando...'
                    : `Descargando... (zoom ${preloadProgress.zoom})`}
                </p>
                {preloadProgress.total > 0 && (
                  <div className="progress-bar">
                    <div className="progress-bar__fill" style={{ width: `${percent}%` }} />
                  </div>
                )}
                <p className="settings-preload-progress__text">
                  {preloadProgress.current} / {preloadProgress.total} tiles ({percent}%)
                </p>
                <button className="settings-btn" onClick={onCancelPreload}>
                  Cancelar
                </button>
              </div>
            )}

            {preloadProgress?.phase === 'done' && (
              <p className="settings-preload-progress__done">¡Precarga completada!</p>
            )}
            {preloadProgress?.phase === 'cancelled' && (
              <p className="settings-preload-progress__cancelled">Precarga cancelada</p>
            )}
          </div>
        )}
      </section>

      {appVersion && (
        <section className="settings-section settings-section--about">
          <div className="settings-option">
            <span className="settings-option__label">Versión de la aplicación</span>
            <span className="settings-option__value">{appVersion}</span>
          </div>
        </section>
      )}
    </div>
  )
}
