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
  SESSION_LIST_PERSISTED: 'session:list-persisted',
  SESSION_GET: 'session:get',
  SESSION_STATS: 'session:stats',
  SESSION_DELETE: 'session:delete',
  SESSION_EXPORT_GEOJSON: 'session:export-geojson',
  SESSION_EXPORT_CSV: 'session:export-csv',
  SESSION_EXPORT: 'session:export',
  SESSION_POINTS_IN_BOUNDS: 'session:points-in-bounds',
  EXPORT_GEOJSON: 'export:geojson',
  EXPORT_KML: 'export:kml',
  PORTS_LIST: 'ports:list',
  OPEN_UNCERTAINTY_FILE: 'settings:open-uncertainty-file',
  GET_PROBE_INFO: 'settings:get-probe-info',
  GET_ACTIVE_UNCERTAINTY: 'settings:get-active-uncertainty',
  GET_LOADED_UNCERTAINTY: 'settings:get-loaded-uncertainty'
} as const
