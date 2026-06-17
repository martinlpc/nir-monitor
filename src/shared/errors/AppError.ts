import type { AppErrorInfo, ErrorSeverity, ErrorCategory } from './error.types'
import { getNBMErrorInfo } from './nbmErrorCodes'

export class AppError extends Error {
  readonly code: string
  readonly severity: ErrorSeverity
  readonly category: ErrorCategory
  readonly userAction?: string
  readonly retryable: boolean
  readonly deviceCode?: number
  readonly deviceId?: string

  constructor(info: AppErrorInfo) {
    super(info.message)
    this.name = 'AppError'
    this.code = info.code
    this.severity = info.severity
    this.category = info.category
    this.userAction = info.userAction
    this.retryable = info.retryable ?? false
    this.deviceCode = info.deviceCode
    this.deviceId = info.deviceId
  }

  static fromNBMErrorCode(code: number, deviceId: string = 'nbm550'): AppError {
    const entry = getNBMErrorInfo(code)
    if (entry) {
      return new AppError({
        code: `NBM_${code}`,
        message: entry.message,
        severity: 'error',
        category: 'nbm',
        userAction: entry.userAction,
        retryable: entry.retryable,
        deviceCode: code,
        deviceId
      })
    }
    return new AppError({
      code: `NBM_${code}`,
      message: `Error desconocido del NBM-550 (código ${code})`,
      severity: 'error',
      category: 'nbm',
      userAction: 'Apague y encienda el equipo. Si persiste, contacte al servicio técnico',
      retryable: true,
      deviceCode: code,
      deviceId
    })
  }

  toAppErrorInfo(): AppErrorInfo {
    return {
      code: this.code,
      message: this.message,
      severity: this.severity,
      category: this.category,
      userAction: this.userAction,
      retryable: this.retryable,
      deviceCode: this.deviceCode,
      deviceId: this.deviceId
    }
  }
}
