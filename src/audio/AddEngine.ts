import { dbToGain } from './audioMath'

const ATTACK_SECONDS = 0.035
const RELEASE_SECONDS = 0.08
const FREQUENCY_RAMP_SECONDS = 0.04
const VOICE_LEVEL = 0.35
const MIN_OUTPUT_HZ = 50
const MAX_OUTPUT_HZ = 4000

export const DEFAULT_ADD_OUTPUT_GAIN_DB = -8

function clampOutputHz(hz: number): number {
  return Math.min(MAX_OUTPUT_HZ, Math.max(MIN_OUTPUT_HZ, hz))
}

export class AddEngine {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private voiceGain: GainNode | null = null
  private oscillator: OscillatorNode | null = null
  private active = false
  private outputGainDb = DEFAULT_ADD_OUTPUT_GAIN_DB

  ensureContext(): AudioContext {
    if (this.context) {
      return this.context
    }
    const context = new AudioContext({ latencyHint: 'interactive' })
    const masterGain = context.createGain()
    masterGain.gain.value = dbToGain(this.outputGainDb)
    masterGain.connect(context.destination)
    this.context = context
    this.masterGain = masterGain
    return context
  }

  getContext(): AudioContext | null {
    return this.context
  }

  isVoiceActive(): boolean {
    return this.active
  }

  async resume(): Promise<void> {
    const context = this.ensureContext()
    if (context.state !== 'running') {
      await context.resume()
    }
  }

  setOutputGainDb(gainDb: number): void {
    this.outputGainDb = gainDb
    if (!this.masterGain || !this.context) {
      return
    }
    const now = this.context.currentTime
    this.masterGain.gain.cancelScheduledValues(now)
    this.masterGain.gain.setTargetAtTime(dbToGain(gainDb), now, 0.015)
  }

  getOutputGainDb(): number {
    return this.outputGainDb
  }

  setTargetFrequency(hz: number): void {
    const clampedHz = clampOutputHz(hz)
    if (!Number.isFinite(clampedHz) || clampedHz <= 0) {
      return
    }

    const context = this.context
    if (!context || !this.oscillator) {
      this.startVoice(clampedHz)
      return
    }

    const now = context.currentTime
    this.oscillator.frequency.setTargetAtTime(clampedHz, now, FREQUENCY_RAMP_SECONDS)
  }

  startVoice(hz: number): void {
    const clampedHz = clampOutputHz(hz)
    if (!Number.isFinite(clampedHz) || clampedHz <= 0) {
      return
    }

    if (this.active && this.oscillator) {
      this.setTargetFrequency(clampedHz)
      return
    }

    this.stopVoiceImmediate()

    const context = this.ensureContext()
    const now = context.currentTime
    const voiceGain = context.createGain()
    voiceGain.gain.setValueAtTime(0.0001, now)
    voiceGain.gain.exponentialRampToValueAtTime(VOICE_LEVEL, now + ATTACK_SECONDS)
    voiceGain.connect(this.masterGain!)

    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(clampedHz, now)
    oscillator.connect(voiceGain)
    oscillator.start(now)

    this.voiceGain = voiceGain
    this.oscillator = oscillator
    this.active = true
  }

  cutVoice(): void {
    this.stopVoiceImmediate()
  }

  stopVoice(): void {
    const context = this.context
    if (!context || !this.active || !this.voiceGain || !this.oscillator) {
      this.stopVoiceImmediate()
      return
    }

    const now = context.currentTime
    const voiceGain = this.voiceGain
    const oscillator = this.oscillator
    voiceGain.gain.cancelScheduledValues(now)
    voiceGain.gain.setValueAtTime(Math.max(voiceGain.gain.value, 0.0001), now)
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + RELEASE_SECONDS)
    oscillator.stop(now + RELEASE_SECONDS + 0.01)

    this.active = false
    this.voiceGain = null
    this.oscillator = null
  }

  private stopVoiceImmediate(): void {
    if (this.oscillator) {
      try {
        this.oscillator.stop()
        this.oscillator.disconnect()
      } catch {
        // Already stopped.
      }
    }
    this.oscillator = null
    if (this.voiceGain) {
      this.voiceGain.disconnect()
    }
    this.voiceGain = null
    this.active = false
  }

  dispose(): void {
    this.stopVoiceImmediate()
    if (this.masterGain) {
      this.masterGain.disconnect()
    }
    this.masterGain = null
    if (this.context) {
      void this.context.close()
    }
    this.context = null
  }
}

export const addEngine = new AddEngine()
