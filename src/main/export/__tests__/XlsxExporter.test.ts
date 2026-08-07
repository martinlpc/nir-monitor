import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import ExcelJS from 'exceljs'

import { XlsxExporter } from '../XlsxExporter'
import type { TemplateResolver } from '../IExporter'
import type { GeoTimestamp } from '../../../shared/GeoTimestamp'
import type { SessionSummary } from '../../../shared/ipc.types'

const APP_VERSION = '1.2.3'

function makePoint(seq: number, correctedMeasurement: number): GeoTimestamp {
  return {
    id: `p${seq}`,
    sessionId: 'test-session',
    sequenceNumber: seq,
    timestamp: new Date('2026-08-07T15:00:00Z').getTime(),
    position: { lat: -38.9516, lon: -68.0591, alt: 271 },
    emf: { deviceId: 'nbm550', rawMeasurement: 1.2, unit: 'V/m' },
    correctedMeasurement
  }
}

function makeMetadata(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'test-session',
    label: 'Recorrido test',
    startedAt: new Date('2026-08-07T14:00:00Z').getTime(),
    stoppedAt: new Date('2026-08-07T15:00:00Z').getTime(),
    sampleCount: 2,
    instrument: {
      meter: {
        brand: 'Narda',
        model: 'NBM-550',
        serial: 'SN-001',
        lastCalibrationDate: '2025-01-01'
      },
      probe: {
        brand: 'Narda',
        model: 'EF-0391',
        serial: 'PR-002',
        calibrationDate: '2025-01-01'
      }
    },
    correctionFactor: 1.08,
    ...overrides
  }
}

const templateResolver: TemplateResolver = (name) =>
  Promise.resolve(readFileSync(resolve(process.cwd(), 'resources', 'plantillas', name)))

function makeExporter(): XlsxExporter {
  return new XlsxExporter(templateResolver, APP_VERSION)
}

async function loadWorkbook(filePath: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  return wb
}

function findRowWithText(ws: ExcelJS.Worksheet, text: string): ExcelJS.Row | null {
  for (let i = 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i)
    const value = row.getCell(1).value
    if (value != null && String(value).includes(text)) return row
  }
  return null
}

describe('XlsxExporter', () => {
  let tmpDir = ''

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ''
  })

  it('generates reporte and reporte_p files for low-MEP points', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rni-xlsx-'))
    const exporter = makeExporter()
    const context = {
      sessionId: 'test-session',
      points: [makePoint(1, 0.5), makePoint(2, 1.0)],
      metadata: makeMetadata(),
      stats: null,
      folderPath: tmpDir,
      label: 'Recorrido test'
    }

    const files = await exporter.export(context)

    expect(files).toHaveLength(2)
    expect(files.some((f) => f.endsWith('_reporte.xlsx'))).toBe(true)
    expect(files.some((f) => f.endsWith('_reporte_p.xlsx'))).toBe(true)
    expect(files.some((f) => f.endsWith('_averif.xlsx'))).toBe(false)
  })

  it('fills reporte rows with sequence, correction factor and measurement', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rni-xlsx-'))
    const exporter = makeExporter()
    await exporter.export({
      sessionId: 'test-session',
      points: [makePoint(1, 0.5)],
      metadata: makeMetadata(),
      stats: null,
      folderPath: tmpDir,
      label: 'Recorrido test'
    })

    const wb = await loadWorkbook(join(tmpDir, 'Recorrido test_reporte.xlsx'))
    const ws = wb.worksheets[0]
    const row = ws.getRow(10)
    expect(row.getCell(1).value).toBe(1)
    expect(row.getCell(9).value).toBe(1.08)
    expect(row.getCell(10).value).toBe(0.5)
    expect(row.getCell(12).value).toBe('Max Hold')
  })

  it('writes footer and version rows in reporte', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rni-xlsx-'))
    const exporter = makeExporter()
    await exporter.export({
      sessionId: 'test-session',
      points: [makePoint(1, 0.5)],
      metadata: makeMetadata(),
      stats: null,
      folderPath: tmpDir,
      label: 'Recorrido test'
    })

    const wb = await loadWorkbook(join(tmpDir, 'Recorrido test_reporte.xlsx'))
    const ws = wb.worksheets[0]
    expect(
      findRowWithText(ws, 'Instrumento utilizado: Medidor de RNI marca Narda modelo NBM-550')
    ).not.toBeNull()
    expect(findRowWithText(ws, `Generado con RNI Monitor v${APP_VERSION}`)).not.toBeNull()
  })

  it('fills reporte_p rows with MEP percent', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rni-xlsx-'))
    const exporter = makeExporter()
    await exporter.export({
      sessionId: 'test-session',
      points: [makePoint(1, 0.5)],
      metadata: makeMetadata(),
      stats: null,
      folderPath: tmpDir,
      label: 'Recorrido test'
    })

    const wb = await loadWorkbook(join(tmpDir, 'Recorrido test_reporte_p.xlsx'))
    const ws = wb.worksheets[0]
    const row = ws.getRow(12)
    expect(row.getCell(2).value).toBe(1)
    expect(Number(row.getCell(7).value)).toBeCloseTo(0.03, 2)
  })

  it('generates an averif file when a point reaches 50% MEP', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rni-xlsx-'))
    const exporter = makeExporter()
    const files = await exporter.export({
      sessionId: 'test-session',
      points: [makePoint(1, 0.5), makePoint(2, 20)],
      metadata: makeMetadata(),
      stats: null,
      folderPath: tmpDir,
      label: 'Recorrido test'
    })

    const averif = files.find((f) => f.endsWith('_averif.xlsx'))
    expect(averif).toBeDefined()

    const wb = await loadWorkbook(averif as string)
    const ws = wb.worksheets[0]
    const row = ws.getRow(10)
    expect(row.getCell(1).value).toBe(2)
    expect(row.getCell(9).value).toBe(1.08)
    expect(Number(row.getCell(10).value)).toBeCloseTo(20, 2)
  })

  it('does not write a footer when instrument is null', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rni-xlsx-'))
    const exporter = makeExporter()
    await exporter.export({
      sessionId: 'test-session',
      points: [makePoint(1, 0.5)],
      metadata: makeMetadata({ instrument: null }),
      stats: null,
      folderPath: tmpDir,
      label: 'Recorrido test'
    })

    const wb = await loadWorkbook(join(tmpDir, 'Recorrido test_reporte.xlsx'))
    const ws = wb.worksheets[0]
    expect(findRowWithText(ws, 'Instrumento utilizado:')).toBeNull()
  })

  it('sanitizes the label in generated file names', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rni-xlsx-'))
    const exporter = makeExporter()
    const files = await exporter.export({
      sessionId: 'test-session',
      points: [makePoint(1, 0.5)],
      metadata: makeMetadata(),
      stats: null,
      folderPath: tmpDir,
      label: 'Recorrido/1: final'
    })

    expect(files.some((f) => f.endsWith('Recorrido_1_ final_reporte.xlsx'))).toBe(true)
  })

  it('throws when metadata is missing', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rni-xlsx-'))
    const exporter = makeExporter()
    await expect(
      exporter.export({
        sessionId: 'test-session',
        points: [],
        metadata: null,
        stats: null,
        folderPath: tmpDir
      })
    ).rejects.toThrow('Session metadata is required for XLSX export')
  })

  it('throws when folderPath is missing', async () => {
    const exporter = makeExporter()
    await expect(
      exporter.export({
        sessionId: 'test-session',
        points: [],
        metadata: makeMetadata(),
        stats: null
      })
    ).rejects.toThrow('folderPath is required for XLSX export')
  })
})
