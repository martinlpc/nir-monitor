export const GARMIN_VID = 0x091e
export const GARMIN_PID = 0x0003
export const GARMIN_USB_PORT_PREFIX = 'garmin-usb'

export const GARMIN_HEADER_LENGTH = 12
export const GARMIN_PVT_SIZE = 64

export const GARMIN_LAYER_TRANSPORT = 0
export const GARMIN_LAYER_APPLICATION = 20

export const GARMIN_PID_SESSION_REQ = 5
export const GARMIN_PID_SESSION_RESP = 6
export const GARMIN_PID_PROTOCOL_ARRAY = 253
export const GARMIN_PID_PRODUCT_RQST = 254
export const GARMIN_PID_PRODUCT_DATA = 255
export const GARMIN_PID_COMMAND_DATA = 10
export const GARMIN_PID_PVT_DATA = 51

export const GARMIN_CMND_START_PVT = 49
export const GARMIN_CMND_STOP_PVT = 50

export const GPS_EPOCH_SECONDS = 631065600

export const RAD_TO_DEG = 180 / Math.PI

export interface GarminFrame {
  packetType: number
  packetId: number
  dataSize: number
  data: Buffer
}

export interface GarminProductData {
  productId: number
  softwareVersion: number
  productName: string
}

export interface GarminPVT {
  alt: number
  epe: number
  eph: number
  epv: number
  fix: number
  gpsTow: number
  latRad: number
  lonRad: number
  eastVel: number
  northVel: number
  upVel: number
  mslHght: number
  leapSec: number
  grmnDays: number
}

export function buildFrame(packetType: number, packetId: number, data?: Buffer): Buffer {
  const header = Buffer.alloc(GARMIN_HEADER_LENGTH)
  header.writeUInt8(packetType, 0)
  header.writeUInt16LE(packetId, 4)
  const payload = data ?? Buffer.alloc(0)
  header.writeUInt32LE(payload.length, 8)
  return Buffer.concat([header, payload])
}

export function parseFrame(buffer: Buffer): GarminFrame | null {
  if (buffer.length < GARMIN_HEADER_LENGTH) return null
  const packetType = buffer.readUInt8(0)
  const packetId = buffer.readUInt16LE(4)
  const dataSize = buffer.readUInt32LE(8)
  if (buffer.length < GARMIN_HEADER_LENGTH + dataSize) return null
  return {
    packetType,
    packetId,
    dataSize,
    data: buffer.subarray(GARMIN_HEADER_LENGTH, GARMIN_HEADER_LENGTH + dataSize)
  }
}

export function startSessionFrame(): Buffer {
  return buildFrame(GARMIN_LAYER_TRANSPORT, GARMIN_PID_SESSION_REQ)
}

export function productDataRequestFrame(): Buffer {
  return buildFrame(GARMIN_LAYER_APPLICATION, GARMIN_PID_PRODUCT_RQST)
}

export function pvtCommandFrame(command: number): Buffer {
  const data = Buffer.alloc(2)
  data.writeUInt16LE(command, 0)
  return buildFrame(GARMIN_LAYER_APPLICATION, GARMIN_PID_COMMAND_DATA, data)
}

export function startPvtFrame(): Buffer {
  return pvtCommandFrame(GARMIN_CMND_START_PVT)
}

export function stopPvtFrame(): Buffer {
  return pvtCommandFrame(GARMIN_CMND_STOP_PVT)
}

export function decodeUnitId(data: Buffer): number {
  return data.readUInt32LE(0)
}

export function decodeProductData(data: Buffer): GarminProductData {
  return {
    productId: data.readUInt16LE(0),
    softwareVersion: data.readUInt16LE(2) / 100,
    productName: data.subarray(4).toString('ascii').replace(/\0+$/, '')
  }
}

export function decodePVT(data: Buffer): GarminPVT | null {
  if (data.length < GARMIN_PVT_SIZE) return null
  return {
    alt: data.readFloatLE(0),
    epe: data.readFloatLE(4),
    eph: data.readFloatLE(8),
    epv: data.readFloatLE(12),
    fix: data.readInt16LE(16),
    gpsTow: data.readDoubleLE(18),
    latRad: data.readDoubleLE(26),
    lonRad: data.readDoubleLE(34),
    eastVel: data.readFloatLE(42),
    northVel: data.readFloatLE(46),
    upVel: data.readFloatLE(50),
    mslHght: data.readFloatLE(54),
    leapSec: data.readInt16LE(58),
    grmnDays: data.readInt32LE(60)
  }
}
