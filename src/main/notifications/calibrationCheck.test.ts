import { describe, it, expect } from 'vitest'
import { checkCalibrationStatus } from './calibrationCheck'

describe('checkCalibrationStatus', () => {
  const referenceDate = new Date('2026-07-14T12:00:00Z')

  describe('with valid calibration date', () => {
    it('returns valid when calibration is within validity period', () => {
      const result = checkCalibrationStatus('2025-01-15', 24, referenceDate)
      expect(result.status).toBe('valid')
      expect(result.daysUntilExpiry).toBeGreaterThan(30)
      expect(result.message).toContain('válida')
    })

    it('returns expiring when calibration expires within 30 days', () => {
      // Calibrated 2024-07-25 + 24 months = 2026-07-25, which is 11 days from reference
      const result = checkCalibrationStatus('2024-07-25', 24, referenceDate)
      expect(result.status).toBe('expiring')
      expect(result.daysUntilExpiry).toBeLessThanOrEqual(30)
      expect(result.daysUntilExpiry).toBeGreaterThan(0)
      expect(result.message).toContain('vence en')
    })

    it('returns expired when calibration date is past due', () => {
      const result = checkCalibrationStatus('2023-01-01', 24, referenceDate)
      expect(result.status).toBe('expired')
      expect(result.daysUntilExpiry).toBeLessThan(0)
      expect(result.message).toContain('vencida')
    })

    it('returns expired when calibration expired yesterday', () => {
      const result = checkCalibrationStatus('2024-07-13', 24, referenceDate)
      expect(result.status).toBe('expired')
      expect(result.daysUntilExpiry).toBe(-1)
    })
  })

  describe('with null or invalid date', () => {
    it('returns unknown when date is null', () => {
      const result = checkCalibrationStatus(null, 24, referenceDate)
      expect(result.status).toBe('unknown')
      expect(result.daysUntilExpiry).toBeNull()
      expect(result.message).toContain('no disponible')
    })

    it('returns unknown when date is empty string', () => {
      const result = checkCalibrationStatus('', 24, referenceDate)
      expect(result.status).toBe('unknown')
      expect(result.daysUntilExpiry).toBeNull()
    })

    it('returns unknown for unparseable date format', () => {
      const result = checkCalibrationStatus('not-a-date', 24, referenceDate)
      expect(result.status).toBe('unknown')
      expect(result.daysUntilExpiry).toBeNull()
      expect(result.message).toContain('inválido')
    })
  })

  describe('with different validity periods', () => {
    it('uses default 24 months when validityMonths not provided', () => {
      // Calibrated 23 months ago -> should still be valid
      const result = checkCalibrationStatus('2024-08-14', undefined, referenceDate)
      expect(result.status).toBe('valid')
    })

    it('respects custom validity period', () => {
      // 12 months validity, calibrated 11 months ago -> valid
      const result = checkCalibrationStatus('2025-08-14', 12, referenceDate)
      expect(result.status).toBe('valid')
    })

    it('handles 12 month validity that is expiring', () => {
      // Calibrated 2025-07-25 + 12 months = 2026-07-25, which is 11 days from reference
      const result = checkCalibrationStatus('2025-07-25', 12, referenceDate)
      expect(result.status).toBe('expiring')
    })
  })

  describe('date format parsing', () => {
    it('parses ISO 8601 date', () => {
      const result = checkCalibrationStatus('2025-01-15T00:00:00', 24, referenceDate)
      expect(result.status).toBe('valid')
    })

    it('parses DD/MM/YYYY format', () => {
      const result = checkCalibrationStatus('15/01/2025', 24, referenceDate)
      expect(result.status).toBe('valid')
    })

    it('parses DD-MM-YYYY format', () => {
      const result = checkCalibrationStatus('15-01-2025', 24, referenceDate)
      expect(result.status).toBe('valid')
    })
  })
})
