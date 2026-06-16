import { useState, useEffect } from 'react'
import type { GeoTimestamp } from '../../../../shared/GeoTimestamp'
import { formatTimestamp } from '../../utils/formatters'
import {
  getIntensityColor,
  exceedsSafetyThreshold,
  sessionExceedsThreshold,
  valueToPercent
} from '../../utils/intensityPalette'
import './PointsTable.css'

const FONT_SIZE_KEY = 'nir-table-font-size'
const DEFAULT_FONT_SIZE = 11
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 20

function getStoredFontSize(): number {
  try {
    const stored = localStorage.getItem(FONT_SIZE_KEY)
    if (stored !== null) {
      const n = Number(stored)
      if (Number.isFinite(n) && n >= MIN_FONT_SIZE && n <= MAX_FONT_SIZE) return n
    }
  } catch {
    /* noop */
  }
  return DEFAULT_FONT_SIZE
}

function storeFontSize(size: number): void {
  try {
    localStorage.setItem(FONT_SIZE_KEY, String(size))
  } catch {
    /* noop */
  }
}

interface PointsTableProps {
  points: GeoTimestamp[]
  sessionId?: string | null
  sessionLabel?: string
  correctionFactor?: number | null
  deviceModel?: string | null
  deviceSerial?: string | null
  probeModel?: string | null
  probeSerial?: string | null
  tableMaximized?: boolean
  onToggleMaximizeTable?: () => void
}

export default function PointsTable({
  points,
  sessionId,
  sessionLabel,
  correctionFactor,
  deviceModel,
  deviceSerial,
  probeModel,
  probeSerial,
  tableMaximized,
  onToggleMaximizeTable
}: PointsTableProps): React.JSX.Element {
  const [fontSize, setFontSize] = useState(getStoredFontSize)

  useEffect(() => {
    storeFontSize(fontSize)
  }, [fontSize])

  const increaseFont = (): void => setFontSize((s) => Math.min(s + 1, MAX_FONT_SIZE))
  const decreaseFont = (): void => setFontSize((s) => Math.max(s - 1, MIN_FONT_SIZE))
  const deriveFactorFromPoint = (point: GeoTimestamp): number | null => {
    const measured = point.emf.rawMeasurement
    const corrected = point.correctedMeasurement
    if (measured > 0 && Number.isFinite(measured) && Number.isFinite(corrected)) {
      const ratio = corrected / measured
      if (Number.isFinite(ratio) && ratio > 0) {
        return ratio
      }
    }
    return null
  }

  const derivedFactor = points.map(deriveFactorFromPoint).find((f) => f != null) ?? null
  const effectiveFactor = correctionFactor ?? derivedFactor
  const thresholdExceeded = sessionExceedsThreshold(points.map((p) => p.correctedMeasurement))

  return (
    <div className={`points-table-container ${tableMaximized ? 'table-maximized' : ''}`}>
      <div className="points-table-header">
        <div className="points-table-title">
          <h3>
            Puntos capturados ({points.length})
            {thresholdExceeded && (
              <span
                className="threshold-badge"
                title="Se superó el umbral de seguridad del 50% (19.44 V/m) en al menos un punto"
              >
                ⚠ UMBRAL 50% SUPERADO
              </span>
            )}
          </h3>
          <div className="table-toolbar">
            <button
              className="btn-font-size"
              onClick={decreaseFont}
              disabled={fontSize <= MIN_FONT_SIZE}
              title="Reducir tamaño de fuente"
              aria-label="Reducir tamaño de fuente"
            >
              A−
            </button>
            <span className="font-size-label">{fontSize}px</span>
            <button
              className="btn-font-size"
              onClick={increaseFont}
              disabled={fontSize >= MAX_FONT_SIZE}
              title="Aumentar tamaño de fuente"
              aria-label="Aumentar tamaño de fuente"
            >
              A+
            </button>
            {onToggleMaximizeTable && (
              <button
                className="btn-maximize"
                onClick={onToggleMaximizeTable}
                title={tableMaximized ? 'Restaurar vista' : 'Maximizar tabla'}
                aria-label={tableMaximized ? 'Restaurar vista' : 'Maximizar tabla'}
              >
                {tableMaximized ? '⊡' : '⊞'}
              </button>
            )}
          </div>
        </div>
        {(sessionLabel || sessionId) && (
          <div className="session-info">
            <div className="session-label-block">
              <span className="session-name">{sessionLabel}</span>
              {(deviceModel || deviceSerial || probeModel || probeSerial) && (
                <span className="session-devices">
                  {deviceModel && <span className="device-model">Equipo: {deviceModel}</span>}
                  {deviceSerial && <span className="device-serial">SN: {deviceSerial}</span>}
                  {probeModel && (
                    <span className="probe-model" style={{ marginLeft: 8 }}>
                      Sonda: {probeModel}
                    </span>
                  )}
                  {probeSerial && <span className="probe-serial">SN: {probeSerial}</span>}
                </span>
              )}
            </div>
            <span style={{ flex: 1 }} />
            {sessionId && (
              <span className="session-id" title={sessionId}>
                {sessionId.substring(0, 8)}...
              </span>
            )}
          </div>
        )}
      </div>
      <div className="table-wrapper">
        <table className="points-table" style={{ fontSize }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Timestamp</th>
              <th>Lat</th>
              <th>Lon</th>
              <th>Alt (m)</th>
              <th>Valor medido (rss) [V/m]</th>
              <th>Factor de corrección aplicado</th>
              <th title="Valor final = rss × factor de corrección">VALOR FINAL [V/m]</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, idx) => (
              <tr key={point.id}>
                <td className="cell-number">{point.sequenceNumber || idx + 1}</td>
                <td className="cell-timestamp">{formatTimestamp(point.timestamp)}</td>
                <td className="cell-coord">{(point.position?.lat ?? 0).toFixed(6)}</td>
                <td className="cell-coord">{(point.position?.lon ?? 0).toFixed(6)}</td>
                <td className="cell-number">{(point.position?.alt ?? 0).toFixed(1)}</td>
                <td className="cell-emf">{(point.emf?.rawMeasurement ?? 0).toFixed(2)}</td>
                <td className="cell-factor">
                  {(() => {
                    const rowFactor = effectiveFactor ?? deriveFactorFromPoint(point)
                    return rowFactor != null ? `×${rowFactor.toFixed(4)}` : '—'
                  })()}
                </td>
                <td
                  className={`cell-emf-unc${exceedsSafetyThreshold(point.correctedMeasurement ?? 0) ? ' cell-emf-unc--threshold' : ''}`}
                  style={{ color: getIntensityColor(point.correctedMeasurement ?? 0) }}
                  title={`${valueToPercent(point.correctedMeasurement ?? 0).toFixed(1)}% del nivel de referencia`}
                >
                  {(point.correctedMeasurement ?? 0).toFixed(2)}
                </td>
              </tr>
            ))}
            {points.length === 0 &&
              Array.from({ length: 12 }).map((_, i) => (
                <tr key={`empty-${i}`} className="row-placeholder">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j}>&nbsp;</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
