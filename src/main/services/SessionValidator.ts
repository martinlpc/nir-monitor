import type { INBMDriver, IGPSDriver } from '../../shared/driver-interfaces'
import { AppError } from '../../shared/errors/AppError'

type SessionState = 'idle' | 'running' | 'stopped'

export function validateCanStart(
  state: SessionState,
  nbm: INBMDriver | null,
  gps: IGPSDriver | null
): void {
  if (state === 'running') {
    throw new AppError({
      code: 'SESSION_ALREADY_RUNNING',
      message: 'Ya hay una sesión en curso',
      severity: 'warning',
      category: 'session',
      userAction: 'Detenga la sesión actual antes de iniciar una nueva',
      retryable: true
    })
  }
  if (!nbm?.isConnected()) {
    throw new AppError({
      code: 'SESSION_NBM_NOT_CONNECTED',
      message: 'NBM-550 no conectado',
      severity: 'error',
      category: 'session',
      userAction: 'Conecte el NBM-550 en el panel de dispositivos antes de iniciar la sesión',
      retryable: true
    })
  }
  if (!gps?.isConnected()) {
    throw new AppError({
      code: 'SESSION_GPS_NOT_CONNECTED',
      message: 'GPS no conectado',
      severity: 'error',
      category: 'session',
      userAction: 'Conecte el GPS en el panel de dispositivos antes de iniciar la sesión',
      retryable: true
    })
  }
  if (!gps.isPositionValid()) {
    throw new AppError({
      code: 'SESSION_GPS_NO_FIX',
      message: 'GPS sin fix: espere a obtener señal antes de iniciar la sesión',
      severity: 'warning',
      category: 'session',
      userAction: 'Despeje la vista al cielo y espere a que el GPS obtenga señal',
      retryable: true
    })
  }
}
