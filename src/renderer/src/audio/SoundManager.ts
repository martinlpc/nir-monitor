type SoundId = 'device-disconnect' | 'gps-fix-lost'

class SoundManager {
  private enabled = true
  private ctx: AudioContext | null = null

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    return this.ctx
  }

  play(soundId: SoundId): void {
    if (!this.enabled) return

    try {
      const ctx = this.getContext()
      if (ctx.state === 'suspended') {
        ctx.resume()
      }

      switch (soundId) {
        case 'device-disconnect':
          this.playTone(ctx, [
            { freq: 400, start: 0, duration: 0.15 },
            { freq: 300, start: 0.15, duration: 0.15 },
            { freq: 200, start: 0.3, duration: 0.2 }
          ])
          break
        case 'gps-fix-lost':
          this.playTone(ctx, [
            { freq: 800, start: 0, duration: 0.1 },
            { freq: 400, start: 0.1, duration: 0.15 },
            { freq: 800, start: 0.3, duration: 0.1 },
            { freq: 400, start: 0.4, duration: 0.15 }
          ])
          break
      }
    } catch {
      // AudioContext puede fallar en entornos sin soporte
    }
  }

  private playTone(
    ctx: AudioContext,
    notes: Array<{ freq: number; start: number; duration: number }>
  ): void {
    const now = ctx.currentTime
    for (const note of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.type = 'sine'
      osc.frequency.value = note.freq

      gain.gain.setValueAtTime(0.3, now + note.start)
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.duration)

      osc.start(now + note.start)
      osc.stop(now + note.start + note.duration)
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }
}

export const soundManager = new SoundManager()
