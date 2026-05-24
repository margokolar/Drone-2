import { dbToGain } from './audioMath'

const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_SECONDS = 0.15

type MetronomeConfig = {
  enabled: boolean
  bpm: number
  volumeDb: number
}

export class MetronomeEngine {
  private context: AudioContext | null = null
  private nextTickAt = 0
  private schedulerTimer: number | null = null
  private config: MetronomeConfig = {
    enabled: false,
    bpm: 72,
    volumeDb: -15,
  }

  private ensureContext(): AudioContext {
    if (this.context) {
      return this.context
    }
    this.context = new AudioContext()
    return this.context
  }

  /** Synchronous resume for user-gesture handlers (iOS Safari). */
  prepareContext(): void {
    const context = this.ensureContext()
    if (context.state !== 'running') {
      void context.resume().catch(() => {
        // iOS can reject resume() outside a gesture; the toggle click may retry.
      })
    }
  }

  async setConfig(config: MetronomeConfig): Promise<void> {
    this.config = config
    if (!config.enabled) {
      this.stopScheduler()
      return
    }
    const context = this.ensureContext()
    if (context.state !== 'running') {
      await context.resume()
    }
    if (this.schedulerTimer === null) {
      this.nextTickAt = context.currentTime + 0.03
      this.schedulerTimer = window.setInterval(() => {
        this.scheduleTicks()
      }, LOOKAHEAD_MS)
    }
  }

  destroy(): void {
    this.stopScheduler()
    if (this.context) {
      void this.context.close()
    }
    this.context = null
  }

  private stopScheduler(): void {
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer)
      this.schedulerTimer = null
    }
  }

  private scheduleTicks(): void {
    if (!this.context || !this.config.enabled) {
      return
    }
    const secondsPerBeat = 60 / Math.max(30, this.config.bpm)
    while (this.nextTickAt < this.context.currentTime + SCHEDULE_AHEAD_SECONDS) {
      this.playClickAt(this.nextTickAt)
      this.nextTickAt += secondsPerBeat
    }
  }

  private playClickAt(when: number): void {
    if (!this.context) {
      return
    }
    const oscillator = this.context.createOscillator()
    const gainNode = this.context.createGain()
    const clickPitch = 980
    const attack = 0.001
    const release = 0.06
    const peakGain = dbToGain(this.config.volumeDb)

    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(clickPitch, when)
    oscillator.connect(gainNode)
    gainNode.connect(this.context.destination)
    gainNode.gain.setValueAtTime(0.0001, when)
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), when + attack)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, when + release)
    oscillator.start(when)
    oscillator.stop(when + release + 0.02)
  }
}

export const metronomeEngine = new MetronomeEngine()
