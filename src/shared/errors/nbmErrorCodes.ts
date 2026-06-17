export interface NBMErrorEntry {
  code: number
  message: string
  userAction?: string
  retryable: boolean
}

export const NBM_DEVICE_ERRORS: Record<number, NBMErrorEntry> = {
  100: {
    code: 100,
    message: 'Comando ejecutado correctamente',
    retryable: false
  },
  101: {
    code: 101,
    message: 'Comando no reconocido por el NBM-550',
    userAction: 'Actualice el firmware del NBM-550 o contacte a Narda',
    retryable: true
  },
  411: {
    code: 411,
    message: 'Fallo interno de EEPROM en el NBM-550',
    userAction: 'Apague y encienda el equipo. Si persiste, contacte al servicio técnico de Narda',
    retryable: true
  },
  412: {
    code: 412,
    message: 'Fallo interno del sistema NBM-550',
    userAction: 'Apague y encienda el equipo. Si persiste, contacte al servicio técnico de Narda',
    retryable: true
  },
  413: {
    code: 413,
    message: 'Fallo de comunicación interna en el NBM-550',
    userAction: 'Verifique que la sonda esté bien conectada. Apague y encienda el equipo',
    retryable: true
  },
  418: {
    code: 418,
    message: 'No hay sonda conectada al medidor',
    userAction: 'Conecte la sonda al NBM-550 y apague/encienda el equipo',
    retryable: true
  },
  420: {
    code: 420,
    message: 'Medición fuera de rango — la señal es demasiado alta para la sonda actual',
    userAction: 'Use una sonda con mayor rango dinámico o aléjese de la fuente de emisión',
    retryable: true
  },
  421: {
    code: 421,
    message: 'La sonda no está inicializada o no es compatible',
    userAction: 'Verifique la compatibilidad de la sonda. Reconecte la sonda al NBM-550 y reinicie',
    retryable: true
  }
}

export function getNBMErrorInfo(code: number): NBMErrorEntry | null {
  return NBM_DEVICE_ERRORS[code] ?? null
}
