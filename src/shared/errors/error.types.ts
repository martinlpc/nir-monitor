export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical'

export type ErrorCategory = 'device' | 'session' | 'gps' | 'nbm' | 'system' | 'correction'

export interface AppErrorInfo {
  code: string
  message: string
  severity: ErrorSeverity
  category: ErrorCategory
  userAction?: string
  retryable?: boolean
  deviceCode?: number
  deviceId?: string
}
