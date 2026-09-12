/**
 * Shine — harmonics practice voice.
 *
 * A faithful Web Audio port of Tarmo Johannes' Csound "Harmonics Practice"
 * (github.com/tarmoj/harmonicsPractice): a bank of 16 harmonics over a chosen
 * fundamental. Each harmonic has a manual level, an "auto" mode (slow random
 * fluctuation), "bumps" (occasional swells) and an optional stereo "move".
 */

import { dbToGain } from './audioMath'
import { MIN_AUDIBLE_GAIN, scheduleSmoothFadeIn, scheduleSmoothFadeOut } from './fadeCurves'
import { isNativeSynth } from './isNativeSynth'
import { DroneSynth } from '../native/droneSynth'

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
  private pendingStopTimer: number | null = null
  private pendingPresetCrossfadeTimer: number | null = null
  private running = false
  private isAudibleStopping = false
  private gainFadeInEndTime = 0
  private pendingPresetTransition = false
  private playbackFadeInSeconds = 0
  private playbackFadeOutSeconds = 0
  private presetCrossfadeSeconds = 0
  private activeFadeOutSeconds = 0
  private activeFadeInSeconds = 0
  private shineStopAt = 0

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
    if (isNativeSynth()) {
      throw new Error('Web Audio is not used in the iOS app')
    }
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
    return this.running || this.isAudibleStopping
  }

  /** True when voices are actively playing, not fading out after stop. */
  isPlaying(): boolean {
    return this.running
  }

  private shouldDeferGainUpdates(now: number): boolean {
    return this.isAudibleStopping || (this.gainFadeInEndTime > 0 && now < this.gainFadeInEndTime)
  }

  private initialHarmonicGain(index: number): number {
    if (this.auto[index]) {
      return AUTO_BASE
    }
    return Math.max(MIN_AUDIBLE_GAIN, this.manualLevel[index])
  }

  setPlaybackFadeSettings(
    fadeInSeconds: number,
    fadeOutSeconds: number,
    presetCrossfadeSeconds = 0,
  ): void {
    this.playbackFadeInSeconds = Math.max(0, fadeInSeconds)
    this.playbackFadeOutSeconds = Math.max(0, fadeOutSeconds)
    this.presetCrossfadeSeconds = Math.max(0, presetCrossfadeSeconds)
  }

  markPresetTransition(): void {
    this.pendingPresetTransition = true
  }

  clearPresetTransition(): void {
    this.pendingPresetTransition = false
  }

  consumePresetTransition(): boolean {
    if (!this.pendingPresetTransition) {
      return false
    }
    this.pendingPresetTransition = false
    return true
  }

  crossfadePresetApply(applyConfig: () => void): void {
    if (!this.running || (!isNativeSynth() && (!this.context || !this.masterGain))) {
      applyConfig()
      return
    }
    const duration = this.presetCrossfadeSeconds
    if (duration <= 0) {
      applyConfig()
      return
    }
    if (isNativeSynth()) {
      this.beginNativeGainCrossfade(applyConfig, duration)
      return
    }
    if (!this.context || !this.masterGain) {
      applyConfig()
      return
    }
    if (this.pendingPresetCrossfadeTimer !== null) {
      window.clearTimeout(this.pendingPresetCrossfadeTimer)
      this.pendingPresetCrossfadeTimer = null
    }
    const context = this.context
    const now = context.currentTime
    this.gainFadeInEndTime = 0
    scheduleSmoothFadeOut(this.masterGain.gain, now, duration)
    this.gains.forEach((gainNode) => {
      if (gainNode) {
        scheduleSmoothFadeOut(gainNode.gain, now, duration)
      }
    })
    this.pendingPresetCrossfadeTimer = window.setTimeout(() => {
      this.pendingPresetCrossfadeTimer = null
      if (!this.context || !this.masterGain) {
        return
      }
      applyConfig()
      const resumeAt = this.context.currentTime
      this.masterGain.gain.cancelScheduledValues(resumeAt)
      this.masterGain.gain.setValueAtTime(MIN_AUDIBLE_GAIN, resumeAt)
      scheduleSmoothFadeIn(
        this.masterGain.gain,
        this.effectiveMasterGain(),
        resumeAt,
        duration,
      )
      this.gainFadeInEndTime = resumeAt + duration
      this.gains.forEach((gainNode, index) => {
        if (!gainNode) {
          return
        }
        const harmonicTarget = this.initialHarmonicGain(index)
        gainNode.gain.cancelScheduledValues(resumeAt)
        gainNode.gain.setValueAtTime(MIN_AUDIBLE_GAIN, resumeAt)
        scheduleSmoothFadeIn(gainNode.gain, harmonicTarget, resumeAt, duration)
      })
    }, duration * 1000 + 20)
  }

  private beginNativeGainCrossfade(applyConfig: () => void, duration: number): void {
    this.clearPendingStopTimer()
    this.clearPendingPresetCrossfadeTimer()
    this.isAudibleStopping = true
    this.activeFadeOutSeconds = duration
    this.gainFadeInEndTime = 0
    this.shineStopAt = this.nowSeconds()
    this.pendingPresetCrossfadeTimer = window.setTimeout(() => {
      this.pendingPresetCrossfadeTimer = null
      this.isAudibleStopping = false
      this.activeFadeOutSeconds = 0
      applyConfig()
      const now = this.nowSeconds()
      this.activeFadeInSeconds = duration
      this.gainFadeInEndTime = now + duration
      this.pushNativeShine(now)
    }, duration * 1000 + 20)
  }

  private clearPendingStopTimer(): void {
    if (this.pendingStopTimer !== null) {
      window.clearTimeout(this.pendingStopTimer)
      this.pendingStopTimer = null
    }
  }

  private clearPendingPresetCrossfadeTimer(): void {
    if (this.pendingPresetCrossfadeTimer !== null) {
      window.clearTimeout(this.pendingPresetCrossfadeTimer)
      this.pendingPresetCrossfadeTimer = null
    }
  }

  private nowSeconds(): number {
    if (isNativeSynth()) {
      return performance.now() / 1000
    }
    return this.context?.currentTime ?? 0
  }

  async resume(): Promise<void> {
    if (isNativeSynth()) {
      try {
        await DroneSynth.reclaim()
      } catch {
        // Session still held by another app.
      }
      return
    }
    const context = this.ensureContext()
    if (context.state !== 'running') {
      await context.resume()
    }
  }

  start(options?: { force?: boolean; fadeInSeconds?: number }): void {
    const restart = Boolean(options?.force) || this.isAudibleStopping
    if (this.running && !restart) {
      return
    }
    if (restart) {
      this.clearPendingStopTimer()
      this.clearPendingPresetCrossfadeTimer()
      this.isAudibleStopping = false
      this.running = false
      this.stopScheduler()
      if (this.oscillators.length > 0) {
        this.hardStopVoices()
      }
    }
    const fadeInOverride = options?.fadeInSeconds
    if (fadeInOverride !== undefined) {
      const previousFadeIn = this.playbackFadeInSeconds
      this.playbackFadeInSeconds = fadeInOverride
      this.startInternal()
      this.playbackFadeInSeconds = previousFadeIn
      return
    }
    this.startInternal()
  }

  private startInternal(): void {
    this.clearPendingStopTimer()
    this.clearPendingPresetCrossfadeTimer()
    this.isAudibleStopping = false
    this.activeFadeOutSeconds = 0
    this.gainFadeInEndTime = 0
    if (this.running) {
      return
    }
    if (isNativeSynth()) {
      const now = this.nowSeconds()
      const fadeInSeconds = this.playbackFadeInSeconds
      this.activeFadeInSeconds = fadeInSeconds
      this.gainFadeInEndTime = fadeInSeconds > 0 ? now + fadeInSeconds : 0
      for (let index = 0; index < SHINE_HARMONIC_COUNT; index += 1) {
        this.jitterPrev[index] = 0
        this.jitterNext[index] = randomBetween(-1, 1)
        this.jitterStart[index] = now
        this.jitterDuration[index] = 1 / randomBetween(AUTO_FREQ_MIN, AUTO_FREQ_MAX)
        this.lastAutoLevel[index] = 0
        this.bumpActive[index] = false
      }
      this.running = true
      this.startScheduler()
      this.pushNativeShine(now)
      return
    }
    if (this.oscillators.length > 0) {
      this.hardStopVoices()
    }
    const context = this.ensureContext()
    void context.resume().catch(() => {})

    const fundamentalWave = context.createPeriodicWave(
      Float32Array.from([0, ...FUNDAMENTAL_PARTIALS.map(() => 0)]),
      Float32Array.from([0, ...FUNDAMENTAL_PARTIALS]),
      { disableNormalization: false },
    )

    const now = context.currentTime
    const fadeInSeconds = this.playbackFadeInSeconds
    this.activeFadeInSeconds = fadeInSeconds
    const targetMaster = this.effectiveMasterGain()
    if (this.masterGain) {
      this.masterGain.gain.cancelScheduledValues(now)
      if (fadeInSeconds > 0) {
        this.masterGain.gain.setValueAtTime(MIN_AUDIBLE_GAIN, now)
        scheduleSmoothFadeIn(this.masterGain.gain, targetMaster, now, fadeInSeconds)
        this.gainFadeInEndTime = now + fadeInSeconds
      } else {
        this.masterGain.gain.setValueAtTime(targetMaster, now)
      }
    }

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
      const harmonicTarget = this.initialHarmonicGain(index)
      gainNode.gain.setValueAtTime(MIN_AUDIBLE_GAIN, now)
      if (fadeInSeconds > 0) {
        scheduleSmoothFadeIn(gainNode.gain, harmonicTarget, now, fadeInSeconds)
      } else {
        gainNode.gain.setValueAtTime(harmonicTarget, now)
      }

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

  stop(options?: { fadeOutSeconds?: number }): void {
    if (!this.running && !this.isAudibleStopping) {
      return
    }
    if (this.isAudibleStopping) {
      return
    }

    this.clearPendingPresetCrossfadeTimer()
    this.gainFadeInEndTime = 0
    const fadeOut =
      options?.fadeOutSeconds !== undefined
        ? Math.max(0, options.fadeOutSeconds)
        : this.playbackFadeOutSeconds

    if (isNativeSynth()) {
      if (fadeOut > 0) {
        this.isAudibleStopping = true
        this.activeFadeOutSeconds = fadeOut
        this.shineStopAt = this.nowSeconds()
        this.clearPendingStopTimer()
        this.pendingStopTimer = window.setTimeout(() => {
          this.pendingStopTimer = null
          this.isAudibleStopping = false
          this.activeFadeOutSeconds = 0
          this.running = false
          this.stopScheduler()
          this.displayLevel.fill(0)
          void DroneSynth.clearShine().catch(() => {})
        }, fadeOut * 1000 + 80)
        return
      }
      this.running = false
      this.stopScheduler()
      this.displayLevel.fill(0)
      void DroneSynth.clearShine().catch(() => {})
      return
    }

    const context = this.context
    if (!context || !this.masterGain) {
      this.running = false
      this.stopScheduler()
      this.hardStopVoices()
      return
    }

    const now = context.currentTime
    if (fadeOut > 0) {
      this.isAudibleStopping = true
      this.activeFadeOutSeconds = fadeOut
      scheduleSmoothFadeOut(this.masterGain.gain, now, fadeOut)
      this.gains.forEach((gainNode) => {
        if (gainNode) {
          scheduleSmoothFadeOut(gainNode.gain, now, fadeOut)
        }
      })
      this.clearPendingStopTimer()
      this.pendingStopTimer = window.setTimeout(() => {
        this.pendingStopTimer = null
        this.isAudibleStopping = false
        this.activeFadeOutSeconds = 0
        this.running = false
        this.stopScheduler()
        this.hardStopVoices()
      }, fadeOut * 1000 + 80)
      return
    }

    this.running = false
    this.stopScheduler()
    this.hardStopVoices()
  }

  private hardStopVoices(): void {
    this.isAudibleStopping = false
    this.activeFadeOutSeconds = 0
    this.activeFadeInSeconds = 0
    this.gainFadeInEndTime = 0
    this.displayLevel.fill(0)
    if (isNativeSynth()) {
      void DroneSynth.clearShine().catch(() => {})
      return
    }
    const context = this.context
    if (context) {
      const now = context.currentTime
      this.gains.forEach((gainNode) => {
        if (gainNode) {
          gainNode.gain.cancelScheduledValues(now)
          gainNode.gain.setValueAtTime(MIN_AUDIBLE_GAIN, now)
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
  }

  dispose(): void {
    this.clearPendingStopTimer()
    this.clearPendingPresetCrossfadeTimer()
    this.stop()
    if (isNativeSynth()) {
      void DroneSynth.clearShine().catch(() => {})
      return
    }
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
    if (isNativeSynth()) {
      if (this.running && !this.isAudibleStopping) {
        this.pushNativeShine(this.nowSeconds())
      }
      return
    }
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
    const clamped = Math.min(1, Math.max(0, volume))
    if (Math.abs(clamped - this.volume) < 1e-6) {
      return
    }
    this.volume = clamped
    this.applyMasterGain()
  }

  /** Global master gain (dB); Shine obeys it on top of its own volume. */
  setMasterGainDb(db: number): void {
    if (Math.abs(db - this.masterGainDb) < 1e-6) {
      return
    }
    this.masterGainDb = db
    this.applyMasterGain()
  }

  private effectiveMasterGain(): number {
    return this.volume * dbToGain(this.masterGainDb) * MASTER_SCALE
  }

  private applyMasterGain(): void {
    if (isNativeSynth()) {
      if (this.running && !this.isAudibleStopping) {
        this.pushNativeShine(this.nowSeconds())
      }
      return
    }
    if (!this.masterGain || !this.context) {
      return
    }
    const now = this.context.currentTime
    if (this.shouldDeferGainUpdates(now)) {
      return
    }
    const target = this.effectiveMasterGain()
    this.masterGain.gain.cancelScheduledValues(now)
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
    this.masterGain.gain.setTargetAtTime(target, now, GAIN_SMOOTH_SECONDS)
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
    } else {
      const now = this.nowSeconds()
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
    if (!this.running) {
      return
    }
    if (isNativeSynth()) {
      this.pushNativeShine(this.nowSeconds())
      return
    }
    const context = this.context
    if (!context) {
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
      if (!this.shouldDeferGainUpdates(now)) {
        gainNode.gain.setTargetAtTime(Math.max(MIN_AUDIBLE_GAIN, level), now, GAIN_SMOOTH_SECONDS)
      }

      const sweep =
        (Math.sin(2 * Math.PI * (this.moveFrequency[index] * now + this.basePan[index])) + 1) / 2
      const panPosition = 0.5 + this.moveAmount * (sweep - 0.5)
      panner.pan.setTargetAtTime(panPosition * 2 - 1, now, PAN_SMOOTH_SECONDS)
    }
  }

  private pushNativeShine(now: number): void {
    let fadeScale = 1
    if (this.gainFadeInEndTime > 0 && now < this.gainFadeInEndTime) {
      const duration =
        this.activeFadeInSeconds > 0 ? this.activeFadeInSeconds : this.playbackFadeInSeconds
      const elapsed = duration - (this.gainFadeInEndTime - now)
      fadeScale = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 1
    }
    if (this.isAudibleStopping) {
      const fadeOut =
        this.activeFadeOutSeconds > 0 ? this.activeFadeOutSeconds : this.playbackFadeOutSeconds
      if (fadeOut > 0) {
        const elapsed = now - this.shineStopAt
        fadeScale *= Math.max(0, 1 - elapsed / fadeOut)
      }
    }
    const master = this.effectiveMasterGain() * fadeScale
    const items = []
    for (let index = 0; index < SHINE_HARMONIC_COUNT; index += 1) {
      const level = this.auto[index]
        ? this.computeAutoLevel(index, now)
        : this.manualLevel[index]
      this.displayLevel[index] = Math.min(1, level)
      const sweep =
        (Math.sin(2 * Math.PI * (this.moveFrequency[index] * now + this.basePan[index])) + 1) / 2
      const panPosition = 0.5 + this.moveAmount * (sweep - 0.5)
      items.push({
        freq: this.baseFrequency * (index + 1),
        gain: Math.max(0, level) * master,
        pan: panPosition * 2 - 1,
      })
    }
    void DroneSynth.setShine({
      packed: items
        .map((item) => `${item.freq}\t${item.gain}\t${item.pan}`)
        .join('\n'),
    }).catch(() => {})
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
