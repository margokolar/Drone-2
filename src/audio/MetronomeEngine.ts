import { dbToGain } from './audioMath'
import { isNativeSynth } from './isNativeSynth'
import { DroneSynth } from '../native/droneSynth'
import { MAX_METRONOME_BPM, MIN_METRONOME_BPM } from '../presets/defaultPresets'

const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_SECONDS = 0.15

type MetronomeConfig = {
  enabled: boolean
  bpm: number
  volumeDb: number
  muted: boolean
}

export class MetronomeEngine {
  private context: AudioContext | null = null
  private nextTickAt = 0
  private schedulerTimer: number | null = null
  private beatListeners = new Set<() => void>()
  private config: MetronomeConfig = {
    enabled: false,
    bpm: 72,
    volumeDb: -15,
    muted: false,
  }

  private audioClock(): number {
    if (isNativeSynth()) {
      return performance.now() / 1000
    }
    return this.context?.currentTime ?? 0
  }

  private ensureContext(): AudioContext {
    if (isNativeSynth()) {
      throw new Error('Web Audio is not used in the iOS app')
    }
    if (this.context) {
      return this.context
    }
    this.context = new AudioContext()
    return this.context
  }

  /** Synchronous resume for user-gesture handlers (iOS Safari). */
  prepareContext(): void {
    if (isNativeSynth()) {
      void DroneSynth.reclaim().catch(() => {})
      return
    }
    const context = this.ensureContext()
    if (context.state !== 'running') {
      void context.resume().catch(() => {
        // iOS can reject resume() outside a gesture; the toggle click may retry.
      })
    }
  }

  /** Fires once per scheduled click, aligned to audio playback time. */
  onBeat(listener: () => void): () => void {
    this.beatListeners.add(listener)
    return () => {
      this.beatListeners.delete(listener)
    }
  }

  async setConfig(config: MetronomeConfig): Promise<void> {
    this.config = config
    if (!config.enabled) {
      this.stopScheduler()
      return
    }
    if (isNativeSynth()) {
      try {
        await DroneSynth.reclaim()
      } catch {
        return
      }
      if (this.schedulerTimer === null) {
        this.nextTickAt = this.audioClock() + 0.03
        this.schedulerTimer = window.setInterval(() => {
          this.scheduleTicks()
        }, LOOKAHEAD_MS)
      }
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
    if (!this.config.enabled) {
      return
    }
    if (!isNativeSynth() && !this.context) {
      return
    }
    const bpm = Math.min(MAX_METRONOME_BPM, Math.max(MIN_METRONOME_BPM, this.config.bpm))
    const secondsPerBeat = 60 / bpm
    const now = this.audioClock()
    while (this.nextTickAt < now + SCHEDULE_AHEAD_SECONDS) {
      this.playClickAt(this.nextTickAt)
      this.nextTickAt += secondsPerBeat
    }
  }

  private playClickAt(when: number): void {
    if (!this.config.muted) {
      const peakGain = dbToGain(this.config.volumeDb) * 1.35
      if (isNativeSynth()) {
        const delayMs = Math.max(0, (when - this.audioClock()) * 1000)
        window.setTimeout(() => {
          if (!this.config.enabled || this.config.muted) {
            return
          }
          void DroneSynth.click({ frequency: 1240, peak: peakGain }).catch(() => {})
        }, delayMs)
      } else if (this.context) {
        const oscillator = this.context.createOscillator()
        const gainNode = this.context.createGain()
        const clickPitch = 1240
        const attack = 0.001
        const release = 0.05

        oscillator.type = 'square'
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
    this.notifyBeatAt(when)
  }

  private notifyBeatAt(when: number): void {
    if (this.beatListeners.size === 0) {
      return
    }
    const delayMs = Math.max(0, (when - this.audioClock()) * 1000)
    window.setTimeout(() => {
      if (!this.config.enabled) {
        return
      }
      this.beatListeners.forEach((listener) => listener())
    }, delayMs)
  }
}

export const metronomeEngine = new MetronomeEngine()
