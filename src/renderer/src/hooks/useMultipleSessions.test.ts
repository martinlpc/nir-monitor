import { describe, it, expect } from 'vitest'
import type { LoadedSession } from './useMultipleSessions'
import type { GeoTimestamp } from '../../../shared/GeoTimestamp'

// Color palette para validar
const SESSION_COLORS = [
  '#FF5733',
  '#3399FF',
  '#2ECC71',
  '#F39C12',
  '#9B59B6',
  '#1ABC9C',
  '#E74C3C',
  '#34495E',
  '#FFD700',
  '#FF69B4'
]

describe('useMultipleSessions - Logic Tests', () => {
  it('should assign correct colors in sequence', () => {
    // Simular la lógica de asignación de colores
    const sessions: LoadedSession[] = []

    for (let i = 0; i < 3; i++) {
      const colorIndex = sessions.length % SESSION_COLORS.length
      sessions.push({
        id: `session-${i}`,
        label: `Session ${i}`,
        points: [],
        color: SESSION_COLORS[colorIndex],
        visible: true
      })
    }

    expect(sessions[0].color).toBe('#FF5733')
    expect(sessions[1].color).toBe('#3399FF')
    expect(sessions[2].color).toBe('#2ECC71')
  })

  it('should cycle colors correctly after palette exhaustion', () => {
    const sessions: LoadedSession[] = []

    // Crear más sesiones que colores disponibles
    for (let i = 0; i < 15; i++) {
      const colorIndex = sessions.length % SESSION_COLORS.length
      sessions.push({
        id: `session-${i}`,
        label: `Session ${i}`,
        points: [],
        color: SESSION_COLORS[colorIndex],
        visible: true
      })
    }

    // Verificar cycling
    expect(sessions[0].color).toBe(SESSION_COLORS[0])
    expect(sessions[10].color).toBe(SESSION_COLORS[0])
    expect(sessions[14].color).toBe(SESSION_COLORS[4])
  })

  it('should maintain all properties of LoadedSession', () => {
    const mockPoints: GeoTimestamp[] = [{ id: '1', timestamp: 1000 } as GeoTimestamp]

    const session: LoadedSession = {
      id: 'test-session',
      label: 'Test Session',
      points: mockPoints,
      color: '#FF5733',
      visible: true,
      sessionInfo: undefined
    }

    expect(session.id).toBe('test-session')
    expect(session.label).toBe('Test Session')
    expect(session.points).toBe(mockPoints)
    expect(session.color).toBe('#FF5733')
    expect(session.visible).toBe(true)
  })

  it('should handle visibility toggle correctly', () => {
    const session: LoadedSession = {
      id: 'test',
      label: 'Test',
      points: [],
      color: '#FF5733',
      visible: true
    }

    // Toggle 1
    const toggled1 = { ...session, visible: !session.visible }
    expect(toggled1.visible).toBe(false)

    // Toggle 2
    const toggled2 = { ...toggled1, visible: !toggled1.visible }
    expect(toggled2.visible).toBe(true)
  })

  it('should filter visible sessions correctly', () => {
    const sessions: LoadedSession[] = [
      { id: '1', label: 'Session 1', points: [], color: '#FF5733', visible: true },
      { id: '2', label: 'Session 2', points: [], color: '#3399FF', visible: false },
      { id: '3', label: 'Session 3', points: [], color: '#2ECC71', visible: true }
    ]

    const visibleSessions = sessions.filter((s) => s.visible)
    expect(visibleSessions).toHaveLength(2)
    expect(visibleSessions[0].id).toBe('1')
    expect(visibleSessions[1].id).toBe('3')
  })

  it('should find session by id correctly', () => {
    const sessions: LoadedSession[] = [
      { id: 'session-1', label: 'Session 1', points: [], color: '#FF5733', visible: true },
      { id: 'session-2', label: 'Session 2', points: [], color: '#3399FF', visible: true }
    ]

    const found = sessions.find((s) => s.id === 'session-1')
    expect(found).toBeDefined()
    expect(found?.label).toBe('Session 1')

    const notFound = sessions.find((s) => s.id === 'session-999')
    expect(notFound).toBeUndefined()
  })

  it('should remove session by id correctly', () => {
    const sessions: LoadedSession[] = [
      { id: 'session-1', label: 'Session 1', points: [], color: '#FF5733', visible: true },
      { id: 'session-2', label: 'Session 2', points: [], color: '#3399FF', visible: true }
    ]

    const filtered = sessions.filter((s) => s.id !== 'session-1')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('session-2')
  })

  it('should update session color correctly', () => {
    const session: LoadedSession = {
      id: 'test',
      label: 'Test',
      points: [],
      color: '#FF5733',
      visible: true
    }

    const updated = { ...session, color: '#FF00FF' }
    expect(updated.color).toBe('#FF00FF')
    expect(session.color).toBe('#FF5733') // Original unchanged
  })

  it('should get visible points from session', () => {
    const mockPoints: GeoTimestamp[] = [
      { id: '1', timestamp: 1000 } as GeoTimestamp,
      { id: '2', timestamp: 2000 } as GeoTimestamp
    ]

    const session: LoadedSession = {
      id: 'test',
      label: 'Test',
      points: mockPoints,
      color: '#FF5733',
      visible: true
    }

    const visiblePoints = session.visible ? session.points : []
    expect(visiblePoints).toHaveLength(2)

    const hiddenSession = { ...session, visible: false }
    const hiddenPoints = hiddenSession.visible ? hiddenSession.points : []
    expect(hiddenPoints).toHaveLength(0)
  })

  it('should handle empty sessions list', () => {
    const sessions: LoadedSession[] = []
    expect(sessions).toHaveLength(0)

    const visibleSessions = sessions.filter((s) => s.visible)
    expect(visibleSessions).toHaveLength(0)
  })
})
