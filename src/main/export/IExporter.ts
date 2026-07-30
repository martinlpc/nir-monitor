import type { GeoTimestamp } from '../../shared/GeoTimestamp'
import type { SessionSummary } from '../../shared/ipc.types'
import type { SessionStats } from '../../shared/services/ISessionRepository'

export interface ExportContext {
  sessionId: string
  points: GeoTimestamp[]
  metadata: SessionSummary | null
  stats: SessionStats | null
  folderPath?: string // solo para XLSX
  label?: string // solo para XLSX
}

export interface IExporter<T = string> {
  export(context: ExportContext): Promise<T>
}

export type TemplateResolver = (
  name: 'Modelo_reporte.xlsx' | 'Modelo_reporte_P.xlsx' | 'Modelo_averif.xlsx'
) => Promise<Buffer>

export interface ExportResult {
  data: string | Buffer
  truncated?: boolean
}
