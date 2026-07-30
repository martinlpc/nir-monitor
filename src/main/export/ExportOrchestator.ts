import type { ISessionRepository } from '../../shared/services/ISessionRepository'
import type { ExportContext, ExportResult, IExporter } from './IExporter'

export class ExportOrchestrator {
  constructor(
    private repository: ISessionRepository,
    private exporters: Map<string, IExporter<string | Buffer>>,
    private maxExportPoints: number = 5000
  ) {}

  async export(
    sessionId: string,
    format: string,
    options?: { folderPath?: string; label?: string }
  ): Promise<ExportResult> {
    const [session, stats] = await Promise.all([
      this.repository.getSession(sessionId),
      this.repository.getSessionStats(sessionId)
    ])

    if (!session) throw new Error(`Session ${sessionId} not found`)

    let points = session.points
    const truncated = points.length > this.maxExportPoints
    if (truncated) {
      points = points.slice(0, this.maxExportPoints)
    }

    const context: ExportContext = {
      sessionId,
      points,
      metadata: session.metadata,
      stats,
      folderPath: options?.folderPath,
      label: options?.label
    }

    const exporter = this.exporters.get(format)
    if (!exporter) throw new Error(`Unknown export format: ${format}`)

    const data = await exporter.export(context)
    return { data, truncated: truncated || undefined }
  }
}
