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
  private nativeBeatUnsub: (() => void) | null = null
  private nativeBeatListenInFlight: Promise<void> | null = null
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

  /** Synchronous resume for user-gesture handlers (iOS Safari / Capacitor). */
  prepareContext(): void {
    if (isNativeSynth()) {
      this.config = { ...this.config, enabled: true, muted: false }
      void this.ensureNativeBeatListener()
      this.pushNative(true)
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

  stopFromGesture(): void {
    this.config = { ...this.config, enabled: false }
    this.stopScheduler()
    if (isNativeSynth()) {
      this.pushNative(false)
    }
  }

  private pushNative(enabled: boolean): void {
    void DroneSynth.setMetronome({
      on: enabled ? 1 : 0,
      enabled,
      bpm: this.config.bpm,
      volumeDb: this.config.volumeDb,
      mute: this.config.muted ? 1 : 0,
      muted: this.config.muted,
    }).catch(() => {})
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
    if (isNativeSynth()) {
      await this.ensureNativeBeatListener()
      this.pushNative(config.enabled)
      this.stopScheduler()
      return
    }
    if (!config.enabled) {
      this.stopScheduler()
      return
    }
    const context = this.ensureContext()
    if (context.state !== 'running') {
      await context.resume()
    }
    this.startJsScheduler(context.currentTime)
  }

  destroy(): void {
    this.stopScheduler()
    this.nativeBeatUnsub?.()
    this.nativeBeatUnsub = null
    if (this.context) {
      void this.context.close()
    }
    this.context = null
  }

  private startJsScheduler(clockNow: number): void {
    if (this.schedulerTimer !== null) {
      return
    }
    this.nextTickAt = clockNow + 0.03
    this.schedulerTimer = window.setInterval(() => {
      this.scheduleTicks()
    }, LOOKAHEAD_MS)
  }

  private async ensureNativeBeatListener(): Promise<void> {
    if (!isNativeSynth() || this.nativeBeatUnsub) {
      return
    }
    if (!this.nativeBeatListenInFlight) {
      this.nativeBeatListenInFlight = (async () => {
        const handle = await DroneSynth.addListener('metroBeat', () => {
          this.fireBeatListeners()
        })
        this.nativeBeatUnsub = () => {
          void handle.remove()
        }
      })()
    }
    try {
      await this.nativeBeatListenInFlight
    } finally {
      this.nativeBeatListenInFlight = null
    }
  }

  private fireBeatListeners(): void {
    if (!this.config.enabled) {
      return
    }
    this.beatListeners.forEach((listener) => listener())
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
    if (!this.config.muted && !isNativeSynth() && this.context) {
      const peakGain = dbToGain(this.config.volumeDb) * 1.35
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
    this.notifyBeatAt(when)
  }

  private notifyBeatAt(when: number): void {
    if (this.beatListeners.size === 0) {
      return
    }
    const fire = () => this.fireBeatListeners()
    const context = this.context
    if (!isNativeSynth() && context) {
      const osc = context.createOscillator()
      const gain = context.createGain()
      gain.gain.value = 0
      osc.connect(gain)
      gain.connect(context.destination)
      osc.onended = () => {
        try {
          osc.disconnect()
          gain.disconnect()
        } catch {
          // Already disconnected.
        }
        fire()
      }
      const startAt = Math.max(when, context.currentTime)
      osc.start(startAt)
      osc.stop(startAt + 0.008)
      return
    }
    const delayMs = Math.max(0, (when - this.audioClock()) * 1000)
    window.setTimeout(fire, delayMs)
  }
}

export const metronomeEngine = new MetronomeEngine()
