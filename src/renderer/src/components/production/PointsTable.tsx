import type { GeoTimestamp } from '../../../../shared/GeoTimestamp'
import './PointsTable.css'

interface PointsTableProps {
  points: GeoTimestamp[]
}

export default function PointsTable({ points }: PointsTableProps): React.JSX.Element {
  const formatTimestamp = (ms: number): string => {
    return new Date(ms).toLocaleString('es-AR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <div className="points-table-container">
      <h3>Puntos capturados ({points.length})</h3>
      <div className="table-wrapper">
        <table className="points-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Timestamp</th>
              <th>Lat</th>
              <th>Lon</th>
              <th>Alt (m)</th>
              <th>HDOP</th>
              <th>EMF (RSS)</th>
              <th>Unit</th>
              <th>Interp</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, idx) => (
              <tr key={point.id} className={point.interpolated ? 'interpolated' : ''}>
                <td className="cell-number">{idx + 1}</td>
                <td className="cell-timestamp">{formatTimestamp(point.timestamp)}</td>
                <td className="cell-coord">{point.position.lat.toFixed(6)}</td>
                <td className="cell-coord">{point.position.lon.toFixed(6)}</td>
                <td className="cell-number">{point.position.alt.toFixed(1)}</td>
                <td className="cell-number">{point.position.hdop.toFixed(2)}</td>
                <td className="cell-emf">{point.emf.rss.toFixed(2)}</td>
                <td className="cell-unit">{point.emf.unit}</td>
                <td className="cell-interp">{point.interpolated ? 'Sí' : 'No'}</td>
              </tr>
            ))}
            {points.length === 0 &&
              Array.from({ length: 12 }).map((_, i) => (
                <tr key={`empty-${i}`} className="row-placeholder">
                  {Array.from({ length: 9 }).map((__, j) => (
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
