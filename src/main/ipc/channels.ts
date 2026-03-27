// Main -> Renderer (push)
export const IPC_EVENTS = {
  GPS_POSITION: 'gps:position',
  GPS_NMEA: 'gps:nmea',
  GPS_FIX_LOST: 'gps:fix-lost',
  NBM_SAMPLE: 'nbm:sample',
  DEVICE_STATUS: 'device:status',
  DEVICE_ERROR: 'device:error',
  SESSION_SAMPLE: 'session:sample',
  SESSION_STARTED: 'session:started',
  SESSION_STOPPED: 'session:stopped',
  SCAN_STATE: 'scan:state'
} as const

// Renderer -> Main (request/response)
export const IPC_HANDLERS = {
  DEVICE_LIST: 'device:list',
  DEVICE_SCAN: 'device:scan',
  DEVICE_SET_PORT: 'device:set-port',
  DEVICE_CONNECT: 'device:connect',
  DEVICE_DISCONNECT: 'device:disconnect',
  SESSION_START: 'session:start',
  SESSION_STOP: 'session:stop',
  SESSION_LIST: 'session:list',
  EXPORT_GEOJSON: 'export:geojson',
  EXPORT_KML: 'export:kml',
  PORTS_LIST: 'ports:list'
} as const
