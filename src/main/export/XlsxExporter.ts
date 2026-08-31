import ExcelJS from 'exceljs'
import * as path from 'path'
import { electricFieldToMepPercent } from '../../shared/emfConversion'
import type { GeoTimestamp } from '../../shared/GeoTimestamp'
import type { SessionSummary } from '../../shared/ipc.types'
import type { ExportContext, IExporter, TemplateResolver } from './IExporter'

export class XlsxExporter implements IExporter<string[]> {
  constructor(
    private templateResolver: TemplateResolver,
    private appVersion: string
  ) {}

  async export(context: ExportContext): Promise<string[]> {
    const { points, metadata, folderPath, label } = context
    if (!metadata) throw new Error('Session metadata is required for XLSX export')
    if (!folderPath) throw new Error('folderPath is required for XLSX export')

    const safeLabel = (label ?? metadata.label).replace(/[<>:"/\\|?*]/g, '_')
    const generatedFiles: string[] = []

    const reportPath = await this.fillReporte(metadata, points, safeLabel, folderPath)
    generatedFiles.push(reportPath)

    const reportPPath = await this.fillReporteP(
      metadata,
      points,
      label ?? '',
      safeLabel,
      folderPath
    )
    generatedFiles.push(reportPPath)

    const averifPoints = points.filter(
      (p) => electricFieldToMepPercent(p.correctedMeasurement) >= 50
    )
    if (averifPoints.length > 0) {
      const averifPath = await this.fillAverif(
        metadata,
        averifPoints,
        label ?? '',
        safeLabel,
        folderPath
      )
      generatedFiles.push(averifPath)
    }

    console.log('[XlsxExporter] Generated files:', generatedFiles)
    return generatedFiles
  }

  private buildFooter(metadata: SessionSummary): string {
    const inst = metadata.instrument
    return inst
      ? `Instrumento utilizado: Medidor de RNI marca ${inst.meter.brand} modelo ${inst.meter.model} numero de serie ${inst.meter.serial ?? 'N/E'} + sonda marca ${inst.probe.brand} modelo ${inst.probe.model} numero de serie ${inst.probe.serial ?? 'N/E'}`
      : ''
  }

  private async fillFromTemplate(
    templateName: 'Modelo_reporte.xlsx' | 'Modelo_reporte_P.xlsx' | 'Modelo_averif.xlsx',
    outputName: string,
    points: GeoTimestamp[],
    metadata: SessionSummary,
    label: string,
    safeLabel: string,
    folderPath: string,
    dataStartRow: number,
    writeRow: (row: ExcelJS.Row, point: GeoTimestamp, idx: number) => void,
    filterEndCol: number,
    labelSuffix?: string,
    footerFontSize?: number
  ): Promise<string> {
    const templateBuffer = await this.templateResolver(templateName)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(templateBuffer as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]

    if (labelSuffix !== undefined) {
      const mergedRow = templateName === 'Modelo_reporte_P.xlsx' ? 9 : 7
      ws.getCell(mergedRow, 1).value = `Tabla de mediciones — ${label}${labelSuffix}`
    }

    let dataIdx = 0
    for (const point of points) {
      const row = ws.getRow(dataStartRow + dataIdx)
      writeRow(row, point, dataIdx)
      dataIdx++
    }

    const headerRow = dataStartRow - 1
    const lastDataRow = headerRow + points.length
    if (points.length > 0) {
      ws.autoFilter = {
        from: { row: headerRow, column: 1 },
        to: { row: lastDataRow, column: filterEndCol }
      }
    }

    const footerText = this.buildFooter(metadata)
    const fSize = footerFontSize ?? 9

    let curRow = lastDataRow + 2
    if (footerText) {
      const footerRow = ws.getRow(curRow)
      footerRow.getCell(1).value = footerText
      footerRow.getCell(1).font = { italic: true, size: fSize }
      ws.mergeCells(curRow, 1, curRow, filterEndCol)
      curRow++
    }

    const versionRow = ws.getRow(curRow)
    versionRow.getCell(1).value = `Generado con RNI Monitor v${this.appVersion}`
    versionRow.getCell(1).font = { italic: true, size: 9 }
    ws.mergeCells(curRow, 1, curRow, filterEndCol)

    const filePath = path.join(folderPath, `${safeLabel}_${outputName}`)
    await wb.xlsx.writeFile(filePath)
    return filePath
  }

  private async fillReporte(
    metadata: SessionSummary,
    points: GeoTimestamp[],
    safeLabel: string,
    folderPath: string
  ): Promise<string> {
    const numberFmt = '#,##0.00'

    return this.fillFromTemplate(
      'Modelo_reporte.xlsx',
      'reporte.xlsx',
      points,
      metadata,
      metadata.label,
      safeLabel,
      folderPath,
      10,
      (row, point) => {
        const probe = metadata.instrument?.probe
        const date = new Date(point.timestamp)
        const cf = metadata.correctionFactor

        row.getCell(1).value = point.sequenceNumber
        row.getCell(2).value = date.toLocaleDateString('es-AR')
        row.getCell(3).value = date.toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
        row.getCell(4).value = point.position.lat.toFixed(6)
        row.getCell(5).value = point.position.lon.toFixed(6)
        row.getCell(6).value = probe?.model ?? ''
        row.getCell(7).value = probe?.serial ?? ''
        row.getCell(8).value = probe?.calibrationDate ?? ''
        row.getCell(9).value = cf != null ? Number(cf.toFixed(4)) : null
        row.getCell(9).numFmt = numberFmt
        row.getCell(9).alignment = { horizontal: 'right' }
        row.getCell(10).value = Number(point.correctedMeasurement.toFixed(2))
        row.getCell(10).numFmt = numberFmt
        row.getCell(10).alignment = { horizontal: 'right' }
        row.getCell(11).value = point.emf.unit
        row.getCell(12).value = 'Max Hold'
      },
      16,
      ''
    )
  }

  private async fillReporteP(
    metadata: SessionSummary,
    points: GeoTimestamp[],
    label: string,
    safeLabel: string,
    folderPath: string
  ): Promise<string> {
    const numberFmt = '#,##0.00'

    return this.fillFromTemplate(
      'Modelo_reporte_P.xlsx',
      'reporte_p.xlsx',
      points,
      metadata,
      label,
      safeLabel,
      folderPath,
      12,
      (row, point) => {
        const date = new Date(point.timestamp)
        const mepPct = electricFieldToMepPercent(point.correctedMeasurement)

        row.getCell(1).value = ''
        row.getCell(2).value = point.sequenceNumber
        row.getCell(3).value = date.toLocaleDateString('es-AR')
        row.getCell(4).value = date.toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
        row.getCell(5).value = point.position.lat.toFixed(6)
        row.getCell(6).value = point.position.lon.toFixed(6)
        row.getCell(7).value = Number(mepPct.toFixed(2))
        row.getCell(7).numFmt = numberFmt
        row.getCell(7).alignment = { horizontal: 'right' }
      },
      7,
      undefined,
      7
    )
  }

  private async fillAverif(
    metadata: SessionSummary,
    points: GeoTimestamp[],
    label: string,
    safeLabel: string,
    folderPath: string
  ): Promise<string> {
    const numberFmt = '#,##0.00'

    const templateBuffer = await this.templateResolver('Modelo_averif.xlsx')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(templateBuffer as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]

    ws.getCell(7, 1).value = `Tabla de mediciones — ${label} (A verificar)`

    let idx = 0
    for (const point of points) {
      const probe = metadata.instrument?.probe
      const date = new Date(point.timestamp)
      const row = ws.getRow(10 + idx)

      row.getCell(1).value = point.sequenceNumber
      row.getCell(2).value = date.toLocaleDateString('es-AR')
      row.getCell(3).value = date.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
      row.getCell(4).value = point.position.lat.toFixed(6)
      row.getCell(5).value = point.position.lon.toFixed(6)
      row.getCell(6).value = probe?.model ?? ''
      row.getCell(7).value = probe?.serial ?? ''
      row.getCell(8).value = probe?.calibrationDate ?? ''
      row.getCell(9).value =
        metadata.correctionFactor != null ? Number(metadata.correctionFactor.toFixed(4)) : null
      row.getCell(9).numFmt = numberFmt
      row.getCell(9).alignment = { horizontal: 'right' }
      row.getCell(10).value = Number(point.correctedMeasurement.toFixed(2))
      row.getCell(10).numFmt = numberFmt
      row.getCell(10).alignment = { horizontal: 'right' }

      idx++
    }

    const lastDataRow = 9 + points.length
    if (points.length > 0) {
      ws.autoFilter = {
        from: { row: 9, column: 1 },
        to: { row: lastDataRow, column: 16 }
      }
    }

    const footerText = this.buildFooter(metadata)
    let curRow = lastDataRow + 2
    if (footerText) {
      const footerRow = ws.getRow(curRow)
      footerRow.getCell(1).value = footerText
      footerRow.getCell(1).font = { italic: true, size: 9 }
      ws.mergeCells(curRow, 1, curRow, 16)
      curRow++
    }

    const versionRow = ws.getRow(curRow)
    versionRow.getCell(1).value = `Generado con RNI Monitor v${this.appVersion}`
    versionRow.getCell(1).font = { italic: true, size: 9 }
    ws.mergeCells(curRow, 1, curRow, 16)

    const filePath = path.join(folderPath, `${safeLabel}_averif.xlsx`)
    await wb.xlsx.writeFile(filePath)
    return filePath
  }
}
