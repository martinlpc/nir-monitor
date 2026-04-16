import type { GeoTimestamp } from '../../../../shared/GeoTimestamp'
import { formatTimestamp } from '../../utils/formatters'
import { getIntensityColor, exceedsSafetyThreshold, sessionExceedsThreshold, valueToPercent } from '../../utils/intensityPalette'
import './PointsTable.css'

interface PointsTableProps {
  points: GeoTimestamp[]
  sessionId?: string | null
  sessionLabel?: string
}

export default function PointsTable({ points, sessionId, sessionLabel }: PointsTableProps): React.JSX.Element {
  const thresholdExceeded = sessionExceedsThreshold(points.map((p) => p.rssWithUncertainty))

  return (
    <div className="points-table-container">
      <div className="points-table-header">
        <div className="points-table-title">
          <h3>
            Puntos capturados ({points.length})
            {thresholdExceeded && (
              <span className="threshold-badge" title="Se superó el umbral de seguridad del 50% (19.44 V/m) en al menos un punto">
                ⚠ UMBRAL 50% SUPERADO
              </span>
            )}
          </h3>
          {sessionLabel && (
            <div className="session-info">
              <span className="session-name">{sessionLabel}</span>
              {sessionId && (
                <span className="session-id" title={sessionId}>
                  {sessionId.substring(0, 8)}...
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="table-wrapper">
        <table className="points-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Timestamp</th>
              <th>Lat</th>
              <th>Lon</th>
              <th>Alt (m)</th>
              <th>Valor medido</th>
              <th>VALOR FINAL</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, idx) => (
              <tr key={point.id}>
                <td className="cell-number">{point.sequenceNumber || idx + 1}</td>
                <td className="cell-timestamp">{formatTimestamp(point.timestamp)}</td>
                <td className="cell-coord">{point.position.lat.toFixed(6)}</td>
                <td className="cell-coord">{point.position.lon.toFixed(6)}</td>
                <td className="cell-number">{point.position.alt.toFixed(1)}</td>
                <td className="cell-emf">{point.emf.rss.toFixed(2)}</td>
                <td
                  className={`cell-emf-unc${exceedsSafetyThreshold(point.rssWithUncertainty) ? ' cell-emf-unc--threshold' : ''}`}
                  style={{ color: getIntensityColor(point.rssWithUncertainty) }}
                  title={`${valueToPercent(point.rssWithUncertainty).toFixed(1)}% del nivel de referencia`}
                >
                  {point.rssWithUncertainty.toFixed(2)}
                </td>
                <td className="cell-unit">{point.emf.unit}</td>
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
