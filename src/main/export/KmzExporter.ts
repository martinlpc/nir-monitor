import archiver from 'archiver'
import { PassThrough } from 'stream'
import { electricFieldToMepPercent } from '../../shared/emfConversion'
import type { GeoTimestamp } from '../../shared/GeoTimestamp'
import type { SessionSummary } from '../../shared/ipc.types'
import type { ExportContext, IExporter } from './IExporter'

export class KmzExporter implements IExporter<Buffer> {
  constructor(
    private appVersion: string,
    private iconBuffer: Buffer | null
  ) {}

  async export(context: ExportContext): Promise<Buffer> {
    const { points, metadata } = context
    if (!metadata) throw new Error('Session metadata is required for KMZ export')

    const kml = this.buildKML(metadata, points)

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const passthrough = new PassThrough()
      passthrough.on('data', (chunk: Buffer) => chunks.push(chunk))
      passthrough.on('end', () => resolve(Buffer.concat(chunks)))
      passthrough.on('error', reject)

      const archive = archiver('zip', { zlib: { level: 9 } })
      archive.on('error', reject)
      archive.pipe(passthrough)
      archive.append(kml, { name: 'doc.kml' })
      archive.append(this.buildPaletteBMP(), { name: 'palette.bmp' })
      if (this.iconBuffer) {
        archive.append(this.iconBuffer, { name: 'icon.png' })
      }
      archive.finalize()
    })
  }

  private buildKML(metadata: SessionSummary, points: GeoTimestamp[]): string {
    const escXml = (s: string): string => s.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
    const esc = (s: string | null | undefined): string => escXml(s ?? '')

    const INTENSITY_LEVELS: { maxPercent: number; hex: string }[] = [
      { maxPercent: 1, hex: '#73C2FB' },
      { maxPercent: 2, hex: '#1E90FF' },
      { maxPercent: 4, hex: '#2A52BE' },
      { maxPercent: 8, hex: '#90EE90' },
      { maxPercent: 15, hex: '#32CD32' },
      { maxPercent: 20, hex: '#008000' },
      { maxPercent: 35, hex: '#FFDF00' },
      { maxPercent: 50, hex: '#FFA500' },
      { maxPercent: 100, hex: '#FF4500' }
    ]
    const OVER_100_HEX = '#FF0000'

    const hexToKmlColor = (hex: string, alpha = '9a'): string => {
      const r = hex.slice(1, 3)
      const g = hex.slice(3, 5)
      const b = hex.slice(5, 7)
      return `${alpha}${b}${g}${r}`
    }

    const pointToHex = (valueVm: number): string => {
      const percent = electricFieldToMepPercent(valueVm)
      for (const level of INTENSITY_LEVELS) {
        if (percent <= level.maxPercent) return level.hex
      }
      return OVER_100_HEX
    }

    const allUniqueHex = [...new Set(points.map((p) => pointToHex(p.correctedMeasurement)))]

    const iconStyles = allUniqueHex
      .map((hex, i) => {
        const kmlColorNormal = hexToKmlColor(hex, '9a')
        const kmlColorHl = hexToKmlColor(hex, 'ff')
        return `
    <Style id="icon_${i}_normal">
      <IconStyle>
        <color>${kmlColorNormal}</color>
        <scale>1.2</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/shapes/shaded_dot.png</href></Icon>
      </IconStyle>
    </Style>
    <Style id="icon_${i}_hl">
      <IconStyle>
        <color>${kmlColorHl}</color>
        <scale>1.4</scale>
        <Icon><href>http://maps.google.com/mapfiles/kml/shapes/shaded_dot.png</href></Icon>
      </IconStyle>
    </Style>
    <StyleMap id="icon_${i}">
      <Pair>
        <key>normal</key>
        <styleUrl>#icon_${i}_normal</styleUrl>
      </Pair>
      <Pair>
        <key>highlight</key>
        <styleUrl>#icon_${i}_hl</styleUrl>
      </Pair>
    </StyleMap>`
      })
      .join('')

    const hexToStyleId = (hex: string, prefix: string): string =>
      `${prefix}_${allUniqueHex.indexOf(hex)}`

    const pointPlacemarks = points
      .map((p) => {
        const hex = pointToHex(p.correctedMeasurement)
        const fecha = new Date(p.timestamp).toLocaleDateString('es-AR')
        const hora = new Date(p.timestamp).toLocaleTimeString('es-AR')
        const mepPct = electricFieldToMepPercent(p.correctedMeasurement)
        const mepStr = mepPct.toLocaleString('es-AR', {
          minimumFractionDigits: 4,
          maximumFractionDigits: 4
        })
        const rssU = metadata.correctionFactor != null ? p.correctedMeasurement.toFixed(2) : ''

        const inst = metadata.instrument
        const instLines = inst
          ? `\nInstrumento - N°/S: ${esc(inst.meter.brand)} ${esc(inst.meter.model)} - ${esc(inst.meter.serial)}` +
            `\nSonda - N°/S: ${esc(inst.probe.brand)} ${esc(inst.probe.model)} - ${esc(inst.probe.serial)}`
          : ''

        return `
    <Placemark>
      <description>Fecha: ${esc(fecha)}
Hora: ${esc(hora)}

Porcentaje MEP mas estricta: ${esc(mepStr)}%
Tipo de resultado: Valor máximo detectado (Max Hold) sobre móvil${instLines}
RNI Monitor v${this.appVersion}</description>
      <styleUrl>#${hexToStyleId(hex, 'icon')}</styleUrl>
      <TimeStamp><when>${new Date(p.timestamp).toISOString()}</when></TimeStamp>
      <Point><coordinates>${p.position.lon},${p.position.lat},${p.position.alt ?? 0}</coordinates></Point>
      <ExtendedData>
        <Data name="rawMeasurement"><value>${p.emf.rawMeasurement}</value></Data>
        <Data name="correctedMeasurement"><value>${rssU}</value></Data>
        <Data name="unit"><value>${esc(p.emf.unit)}</value></Data>
      </ExtendedData>
    </Placemark>`
      })
      .join('')

    const startDate = new Date(metadata.startedAt).toLocaleString('es-AR')
    const dateOnly = new Date(metadata.startedAt).toLocaleDateString('es-AR')
    const endDate = metadata.stoppedAt
      ? new Date(metadata.stoppedAt).toLocaleString('es-AR')
      : 'N/A'

    const locationParts = [metadata.provincia, metadata.localidad].filter(Boolean)
    const layerName =
      locationParts.length > 0
        ? `${locationParts.join(' - ')} - ${dateOnly}`
        : escXml(metadata.label)

    const inst = metadata.instrument
    const instrumentDesc = inst
      ? `\nMedidor: ${esc(inst.meter.brand)} ${esc(inst.meter.model)} (S/N: ${esc(inst.meter.serial)})` +
        `\nÚltima calibración: ${esc(inst.meter.lastCalibrationDate)}` +
        `\nSonda: ${esc(inst.probe.brand)} ${esc(inst.probe.model)} (S/N: ${esc(inst.probe.serial)})` +
        `\nFactor de corrección: ${metadata.correctionFactor ?? 'N/A'}`
      : ''

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${escXml(layerName)}</name>
  <description>Sesión: ${escXml(metadata.label)}\nInicio: ${startDate}\nFin: ${endDate}\nPuntos: ${metadata.sampleCount}${instrumentDesc}\nRNI Monitor v${this.appVersion}</description>
  ${iconStyles}
  <Folder>
    <name>Puntos de medición</name>
    ${pointPlacemarks}
  </Folder>
  <ScreenOverlay>
    <name>Referencia de colores</name>
    <overlayXY x="0" y="0" xunits="fraction" yunits="fraction"/>
    <screenXY x="0.01" y="0.01" xunits="fraction" yunits="fraction"/>
    <rotationXY x="0" y="0" xunits="fraction" yunits="fraction"/>
    <size x="0" y="0" xunits="pixel" yunits="pixel"/>
    <Icon><href>palette.bmp</href></Icon>
  </ScreenOverlay>
  <ScreenOverlay>
    <name>RNI Monitor</name>
    <overlayXY x="0" y="0" xunits="fraction" yunits="fraction"/>
    <screenXY x="0.01" y="364" xunits="fraction" yunits="pixel"/>
    <size x="48" y="48" xunits="pixel" yunits="pixel"/>
    <Icon><href>icon.png</href></Icon>
  </ScreenOverlay>
</Document>
</kml>`
  }

  private buildPaletteBMP(): Buffer {
    const W = 145
    const H = 290
    const bpp = 24
    const rowSize = ((W * bpp + 31) >> 3) & ~3
    const pixelOff = 54
    const fileSize = pixelOff + rowSize * H
    const buf = Buffer.alloc(fileSize)

    // BMP file header (14 bytes)
    buf.write('BM', 0)
    buf.writeUInt32LE(fileSize, 2)
    buf.writeUInt32LE(0, 6)
    buf.writeUInt32LE(pixelOff, 10)

    // DIB header BITMAPINFOHEADER (40 bytes)
    buf.writeUInt32LE(40, 14)
    buf.writeInt32LE(W, 18)
    buf.writeInt32LE(-H, 22) // top-down
    buf.writeUInt16LE(1, 26)
    buf.writeUInt16LE(bpp, 28)
    buf.writeUInt32LE(0, 30)
    buf.writeUInt32LE(0, 34)
    buf.writeInt32LE(2835, 38) // 72 DPI
    buf.writeInt32LE(2835, 42)
    buf.writeUInt32LE(0, 46)
    buf.writeUInt32LE(0, 50)

    const pixel = (x: number, y: number, r: number, g: number, b: number): void => {
      if (x < 0 || x >= W || y < 0 || y >= H) return
      const off = pixelOff + y * rowSize + x * 3
      buf[off] = b
      buf[off + 1] = g
      buf[off + 2] = r
    }

    const fillRect = (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
      g: number,
      b: number
    ): void => {
      for (let row = 0; row < h; row++)
        for (let col = 0; col < w; col++) pixel(x + col, y + row, r, g, b)
    }

    const FONT_ROWS: Record<string, string[]> = {
      ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
      '<': ['00010', '00100', '01000', '10000', '01000', '00100', '00010'],
      '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
      '>': ['01000', '00100', '00010', '00001', '00010', '00100', '01000'],
      '%': ['00000', '00001', '01010', '00100', '01010', '10000', '00000'],
      '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
      '.': ['00000', '00000', '00000', '00000', '00000', '00000', '11000'],
      '0': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
      '1': ['00100', '01100', '00100', '00100', '00100', '00100', '11111'],
      '2': ['01110', '00001', '00001', '01110', '10000', '10000', '11111'],
      '3': ['01110', '00001', '00001', '00110', '00001', '00001', '01110'],
      '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
      '5': ['11111', '10000', '11110', '00001', '00001', '00001', '11110'],
      '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
      '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
      '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
      '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
      A: ['00100', '01010', '10001', '10001', '11111', '10001', '10001'],
      B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
      C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
      D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
      E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
      F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
      I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
      K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
      L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
      M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
      N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
      O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
      P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
      R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
      S: ['01110', '10001', '10000', '01110', '00001', '10001', '01110'],
      T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
      U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110']
    }

    const drawText = (
      x: number,
      y: number,
      text: string,
      r: number,
      g: number,
      b: number,
      spacing = 1
    ): void => {
      let cx = x
      for (const ch of text) {
        const rows = FONT_ROWS[ch]
        if (!rows) {
          cx += 6
          continue
        }
        for (let col = 0; col < 5; col++)
          for (let row = 0; row < 7; row++)
            if (rows[row][col] === '1') pixel(cx + col, y + row, r, g, b)
        cx += 5 + spacing
      }
    }

    // Background
    fillRect(0, 0, W, H, 0x2d, 0x2d, 0x2d)

    // Title & subtitle
    drawText(8, 10, 'REFERENCIA DE COLORES', 0xff, 0xff, 0xff)
    drawText(8, 24, '% MEP - ITU-T K.113', 0xaa, 0xaa, 0xaa)

    const levels: { r: number; g: number; b: number; label: string }[] = [
      { r: 0x73, g: 0xc2, b: 0xfb, label: '<= 1%' },
      { r: 0x1e, g: 0x90, b: 0xff, label: '1-2%' },
      { r: 0x2a, g: 0x52, b: 0xbe, label: '2-4%' },
      { r: 0x90, g: 0xee, b: 0x90, label: '4-8%' },
      { r: 0x32, g: 0xcd, b: 0x32, label: '8-15%' },
      { r: 0x00, g: 0x80, b: 0x00, label: '15-20%' },
      { r: 0xff, g: 0xdf, b: 0x00, label: '20-35%' },
      { r: 0xff, g: 0xa5, b: 0x00, label: '35-50%' },
      { r: 0xff, g: 0x45, b: 0x00, label: '50-100%' },
      { r: 0xff, g: 0x00, b: 0x00, label: '> 100%' }
    ]

    const swatchSize = 20
    const rowGap = 4
    const labelX = 8 + swatchSize + 4
    const startY = 40

    levels.forEach((l, i) => {
      const sy = startY + i * (swatchSize + rowGap)
      fillRect(8, sy, swatchSize, swatchSize, l.r, l.g, l.b)
      drawText(labelX, sy + 6, l.label, 0xe0, 0xe0, 0xe0)
    })

    return buf
  }
}
