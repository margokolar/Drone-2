/**
 * Shine — harmonics practice voice.
 *
 * A faithful Web Audio port of Tarmo Johannes' Csound "Harmonics Practice"
 * (github.com/tarmoj/harmonicsPractice): a bank of 16 harmonics over a chosen
 * fundamental. Each harmonic has a manual level, an "auto" mode (slow random
 * fluctuation), "bumps" (occasional swells) and an optional stereo "move".
 */

import { dbToGain } from './audioMath'

export const SHINE_HARMONIC_COUNT = 16

/** Waveform partials used only for harmonic 1 (adds a touch of natural timbre). */
const FUNDAMENTAL_PARTIALS = [1, 0.1, 0.08, 0.04, 0.02, 0.01, 0.005, 0.005]

const AUTO_BASE = 0.4
const AUTO_JITTER = 0.4
const AUTO_FREQ_MIN = 0.2
const AUTO_FREQ_MAX = 1.0

const BUMP_ATTACK_SECONDS = 0.05
const BUMP_DURATION_SECONDS = 0.5
const BUMP_PEAK = 2

const MOVE_PERIOD_MIN_SECONDS = 8
const MOVE_PERIOD_MAX_SECONDS = 12

const GAIN_SMOOTH_SECONDS = 0.05
const PAN_SMOOTH_SECONDS = 0.1
const SCHEDULER_INTERVAL_MS = 30
const MASTER_SCALE = 0.28

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

/** Base stereo position (0 left … 1 right): harmonic 1 centred, rest spread 0.25…0.75. */
function basePanForHarmonic(harmonicNumber: number): number {
  if (harmonicNumber === 1) {
    return 0.5
  }
  const index = harmonicNumber - 1
  return 0.25 + (0.5 * index) / (SHINE_HARMONIC_COUNT - 1)
}

export class ShineEngine {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private oscillators: (OscillatorNode | null)[] = []
  private gains: (GainNode | null)[] = []
  private panners: (StereoPannerNode | null)[] = []
  private schedulerTimer: number | null = null
  private running = false

  private baseFrequency = 65.7
  private volume = 0.6
  private masterGainDb = -10
  /** Always full-width stereo movement ("wide" mode). */
  private moveAmount = 1

  private manualLevel = new Array<number>(SHINE_HARMONIC_COUNT).fill(0)
  private auto = new Array<boolean>(SHINE_HARMONIC_COUNT).fill(true)
  private bumps = new Array<boolean>(SHINE_HARMONIC_COUNT).fill(false)
  private displayLevel = new Array<number>(SHINE_HARMONIC_COUNT).fill(0)

  private jitterPrev = new Array<number>(SHINE_HARMONIC_COUNT).fill(0)
  private jitterNext = new Array<number>(SHINE_HARMONIC_COUNT).fill(0)
  private jitterStart = new Array<number>(SHINE_HARMONIC_COUNT).fill(0)
  private jitterDuration = new Array<number>(SHINE_HARMONIC_COUNT).fill(1)
  private lastAutoLevel = new Array<number>(SHINE_HARMONIC_COUNT).fill(0)

  private bumpActive = new Array<boolean>(SHINE_HARMONIC_COUNT).fill(false)
  private bumpStart = new Array<number>(SHINE_HARMONIC_COUNT).fill(0)

  private moveFrequency = new Array<number>(SHINE_HARMONIC_COUNT)
    .fill(0)
    .map(() => 1 / randomBetween(MOVE_PERIOD_MIN_SECONDS, MOVE_PERIOD_MAX_SECONDS))
  private basePan = new Array<number>(SHINE_HARMONIC_COUNT)
    .fill(0)
    .map((_, index) => basePanForHarmonic(index + 1))

  private ensureContext(): AudioContext {
    if (this.context) {
      return this.context
    }
    const context = new AudioContext({ latencyHint: 'interactive' })
    const compressor = context.createDynamicsCompressor()
    const masterGain = context.createGain()
    masterGain.gain.value = this.effectiveMasterGain()
    masterGain.connect(compressor)
    compressor.connect(context.destination)
    this.context = context
    this.masterGain = masterGain
    this.compressor = compressor
    return context
  }

  getContext(): AudioContext | null {
    return this.context
  }

  isRunning(): boolean {
    return this.running
  }

  async resume(): Promise<void> {
    const context = this.ensureContext()
    if (context.state !== 'running') {
      await context.resume()
    }
  }

  start(): void {
    if (this.running) {
      return
    }
    const context = this.ensureContext()
    void context.resume().catch(() => {})

    const fundamentalWave = context.createPeriodicWave(
      Float32Array.from([0, ...FUNDAMENTAL_PARTIALS.map(() => 0)]),
      Float32Array.from([0, ...FUNDAMENTAL_PARTIALS]),
      { disableNormalization: false },
    )

    const now = context.currentTime
    this.oscillators = []
    this.gains = []
    this.panners = []

    for (let index = 0; index < SHINE_HARMONIC_COUNT; index += 1) {
      const harmonicNumber = index + 1
      const oscillator = context.createOscillator()
      if (harmonicNumber === 1) {
        oscillator.setPeriodicWave(fundamentalWave)
      } else {
        oscillator.type = 'sine'
      }
      oscillator.frequency.setValueAtTime(this.baseFrequency * harmonicNumber, now)

      const gainNode = context.createGain()
      gainNode.gain.setValueAtTime(0.0001, now)

      const panner = context.createStereoPanner()
      panner.pan.setValueAtTime(this.basePan[index] * 2 - 1, now)

      oscillator.connect(gainNode)
      gainNode.connect(panner)
      panner.connect(this.masterGain as GainNode)
      oscillator.start(now)

      this.oscillators[index] = oscillator
      this.gains[index] = gainNode
      this.panners[index] = panner

      this.jitterPrev[index] = 0
      this.jitterNext[index] = randomBetween(-1, 1)
      this.jitterStart[index] = now
      this.jitterDuration[index] = 1 / randomBetween(AUTO_FREQ_MIN, AUTO_FREQ_MAX)
      this.lastAutoLevel[index] = 0
      this.bumpActive[index] = false
    }

    this.running = true
    this.startScheduler()
  }

  stop(): void {
    this.stopScheduler()
    const context = this.context
    if (context) {
      const now = context.currentTime
      this.gains.forEach((gainNode) => {
        if (gainNode) {
          gainNode.gain.cancelScheduledValues(now)
          gainNode.gain.setTargetAtTime(0.0001, now, 0.05)
        }
      })
      this.oscillators.forEach((oscillator) => {
        if (oscillator) {
          try {
            oscillator.stop(now + 0.12)
          } catch {
            // already stopped
          }
        }
      })
    }
    this.oscillators = []
    this.gains = []
    this.panners = []
    this.displayLevel.fill(0)
    this.running = false
  }

  dispose(): void {
    this.stop()
    if (this.masterGain) {
      this.masterGain.disconnect()
    }
    if (this.compressor) {
      this.compressor.disconnect()
    }
    this.masterGain = null
    this.compressor = null
    if (this.context) {
      void this.context.close()
    }
    this.context = null
  }

  setBaseFrequency(hz: number): void {
    if (!Number.isFinite(hz) || hz <= 0) {
      return
    }
    this.baseFrequency = hz
    const context = this.context
    if (!context) {
      return
    }
    const now = context.currentTime
    this.oscillators.forEach((oscillator, index) => {
      if (oscillator) {
        oscillator.frequency.setTargetAtTime(hz * (index + 1), now, 0.02)
      }
    })
  }

  /** Shine's own volume (0…1), independent from the global master gain. */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume))
    this.applyMasterGain()
  }

  /** Global master gain (dB); Shine obeys it on top of its own volume. */
  setMasterGainDb(db: number): void {
    this.masterGainDb = db
    this.applyMasterGain()
  }

  private effectiveMasterGain(): number {
    return this.volume * dbToGain(this.masterGainDb) * MASTER_SCALE
  }

  private applyMasterGain(): void {
    if (this.masterGain && this.context) {
      this.masterGain.gain.setTargetAtTime(
        this.effectiveMasterGain(),
        this.context.currentTime,
        0.03,
      )
    }
  }

  setHarmonicLevel(index: number, level: number): void {
    if (index < 0 || index >= SHINE_HARMONIC_COUNT) {
      return
    }
    this.manualLevel[index] = Math.min(1, Math.max(0, level))
  }

  setHarmonicAuto(index: number, on: boolean): void {
    if (index < 0 || index >= SHINE_HARMONIC_COUNT) {
      return
    }
    this.auto[index] = on
    if (!on) {
      this.bumps[index] = false
      this.bumpActive[index] = false
    } else if (this.context) {
      const now = this.context.currentTime
      this.jitterStart[index] = now
      this.jitterDuration[index] = 1 / randomBetween(AUTO_FREQ_MIN, AUTO_FREQ_MAX)
    }
  }

  setHarmonicBumps(index: number, on: boolean): void {
    if (index < 0 || index >= SHINE_HARMONIC_COUNT) {
      return
    }
    this.bumps[index] = on && this.auto[index]
  }

  setAllLevels(level: number): void {
    const clamped = Math.min(1, Math.max(0, level))
    this.manualLevel.fill(clamped)
  }

  setAllAuto(on: boolean): void {
    for (let index = 0; index < SHINE_HARMONIC_COUNT; index += 1) {
      this.setHarmonicAuto(index, on)
    }
  }

  setAllBumps(on: boolean): void {
    for (let index = 0; index < SHINE_HARMONIC_COUNT; index += 1) {
      this.setHarmonicBumps(index, on)
    }
  }

  getDisplayLevels(): number[] {
    return this.displayLevel.slice()
  }

  private startScheduler(): void {
    if (this.schedulerTimer !== null) {
      return
    }
    this.schedulerTimer = window.setInterval(() => {
      this.tick()
    }, SCHEDULER_INTERVAL_MS)
  }

  private stopScheduler(): void {
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer)
      this.schedulerTimer = null
    }
  }

  private tick(): void {
    const context = this.context
    if (!context || !this.running) {
      return
    }
    const now = context.currentTime

    for (let index = 0; index < SHINE_HARMONIC_COUNT; index += 1) {
      const gainNode = this.gains[index]
      const panner = this.panners[index]
      if (!gainNode || !panner) {
        continue
      }

      let level: number
      if (this.auto[index]) {
        level = this.computeAutoLevel(index, now)
      } else {
        level = this.manualLevel[index]
      }

      this.displayLevel[index] = Math.min(1, level)
      gainNode.gain.setTargetAtTime(Math.max(0.0001, level), now, GAIN_SMOOTH_SECONDS)

      const sweep =
        (Math.sin(2 * Math.PI * (this.moveFrequency[index] * now + this.basePan[index])) + 1) / 2
      const panPosition = 0.5 + this.moveAmount * (sweep - 0.5)
      panner.pan.setTargetAtTime(panPosition * 2 - 1, now, PAN_SMOOTH_SECONDS)
    }
  }

  private computeAutoLevel(index: number, now: number): number {
    if (now >= this.jitterStart[index] + this.jitterDuration[index]) {
      this.jitterPrev[index] = this.jitterNext[index]
      this.jitterNext[index] = randomBetween(-1, 1)
      this.jitterStart[index] = now
      this.jitterDuration[index] = 1 / randomBetween(AUTO_FREQ_MIN, AUTO_FREQ_MAX)
    }
    const fraction = (now - this.jitterStart[index]) / this.jitterDuration[index]
    const shaped = smoothstep(fraction)
    const jitterValue =
      this.jitterPrev[index] + (this.jitterNext[index] - this.jitterPrev[index]) * shaped
    const autoLevel = Math.min(1, Math.max(0, AUTO_BASE + AUTO_JITTER * jitterValue))

    const crossedHalf =
      (this.lastAutoLevel[index] - 0.5) * (autoLevel - 0.5) < 0
    if (crossedHalf && this.bumps[index] && !this.bumpActive[index]) {
      this.bumpActive[index] = true
      this.bumpStart[index] = now
    }
    this.lastAutoLevel[index] = autoLevel

    let factor = 1
    if (this.bumpActive[index]) {
      const elapsed = now - this.bumpStart[index]
      if (elapsed >= BUMP_DURATION_SECONDS) {
        this.bumpActive[index] = false
      } else {
        const envelope =
          elapsed < BUMP_ATTACK_SECONDS
            ? elapsed / BUMP_ATTACK_SECONDS
            : Math.max(
                0,
                1 - (elapsed - BUMP_ATTACK_SECONDS) / (BUMP_DURATION_SECONDS - BUMP_ATTACK_SECONDS),
              )
        factor = 1 + BUMP_PEAK * envelope
      }
    }

    return autoLevel * factor
  }
}

export const shineEngine = new ShineEngine()
