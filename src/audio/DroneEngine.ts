import { dbToGain, partialTimbreWeights, normalizedBlend, waveformGainCompensation } from './audioMath'
import type { DroneRuntimeConfig, EntryGlideParams, PartialConfig, ToneConfig } from './types'
import { getFrequency } from '../music/tuning'
import { recordBleDebug } from '../utils/bleDebug'
import { needsIosMediaRemoteIntegration } from '../utils/mediaSessionEnvironment'
import {
  MIN_AUDIBLE_GAIN,
  scheduleSmoothFadeIn,
  scheduleSmoothFadeOut,
  scheduleSmoothGainCrossfade,
} from './fadeCurves'

type OscBundle = {
  oscillator: OscillatorNode
  gainNode: GainNode
  waveGain: number
  ratio: number
}

type ToneVoice = {
  noteId: string
  outputGain: GainNode
  panner: StereoPannerNode
  oscillators: OscBundle[]
  /** AudioContext time after which entry pitch glide may be overridden by updates. */
  entryGlideEndTime: number | null
}

const ATTACK_SECONDS = 0.025
const RELEASE_SECONDS = 0.08
const REBUILD_RELEASE_SECONDS = 0.03
const PARAM_SMOOTH_SECONDS = 0.015
// Transparent brickwall safety limiter: only engages at the very top of the
// range to catch peaks/clipping, so normal playback has no audible leveling.
const LIMITER_THRESHOLD_DB = -1

const DEFAULT_ENTRY_GLIDE: EntryGlideParams = {
  cents: 0,
  seconds: 2,
}

function usesSmoothCrossfade(duration: number): boolean {
  return duration > PARAM_SMOOTH_SECONDS + 0.01
}

function scheduleSmoothMasterFadeIn(
  param: AudioParam,
  targetGain: number,
  now: number,
  duration: number,
): void {
  scheduleSmoothFadeIn(param, targetGain, now, duration)
}

function scheduleSmoothMasterFadeOut(
  param: AudioParam,
  startGain: number,
  now: number,
  duration: number,
): void {
  scheduleSmoothFadeOut(param, now, duration, startGain)
}

function scheduleSmoothVoiceFadeIn(
  param: AudioParam,
  targetGain: number,
  now: number,
  duration: number,
): void {
  scheduleSmoothFadeIn(param, targetGain, now, duration)
}

function scheduleSmoothVoiceFadeOut(
  param: AudioParam,
  now: number,
  duration: number,
): void {
  scheduleSmoothFadeOut(param, now, duration)
}

type VoiceTransitionTiming = {
  attackSeconds: number
  updateSeconds: number
  rebuildReleaseSeconds: number
  releaseSeconds: number
}

export class DroneEngine {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private voiceMap = new Map<string, ToneVoice>()
  private started = false
  private shouldPlay = false
  private lastClock = { wall: 0, ctx: 0 }
  private gesturePlaybackPending = false
  private pendingPresetTransition = false
  private playbackFadeInSeconds = 0
  private playbackFadeOutSeconds = 0
  private presetCrossfadeSeconds = 0
  /** True after pause/mute until the next audible sync restores levels. */
  private resumeFromSilence = true
  /** Last intended master gain; WKWebView AudioParam.value is unreliable mid-curve. */
  private lastMasterTarget = MIN_AUDIBLE_GAIN

  setPlaybackIntent(shouldPlay: boolean): void {
    this.shouldPlay = shouldPlay
  }

  /** Transport started audio synchronously in a user-gesture handler; skip React sync ramp. */
  markGesturePlaybackStarted(): void {
    this.gesturePlaybackPending = true
  }

  consumeGesturePlayback(): boolean {
    if (!this.gesturePlaybackPending) {
      return false
    }
    this.gesturePlaybackPending = false
    return true
  }

  /** Next sync while playing applies preset crossfade timings to changing tones. */
  markPresetTransition(): void {
    this.pendingPresetTransition = true
  }

  clearPresetTransition(): void {
    this.pendingPresetTransition = false
  }

  private consumePresetTransition(): boolean {
    if (!this.pendingPresetTransition) {
      return false
    }
    this.pendingPresetTransition = false
    return true
  }

  private resolveVoiceTransitionTiming(): VoiceTransitionTiming {
    const usePresetCrossfade = this.consumePresetTransition() && this.presetCrossfadeSeconds > 0
    return {
      attackSeconds: usePresetCrossfade ? this.presetCrossfadeSeconds : ATTACK_SECONDS,
      updateSeconds: usePresetCrossfade ? this.presetCrossfadeSeconds : PARAM_SMOOTH_SECONDS,
      rebuildReleaseSeconds: usePresetCrossfade ? this.presetCrossfadeSeconds : REBUILD_RELEASE_SECONDS,
      releaseSeconds: usePresetCrossfade ? this.presetCrossfadeSeconds : RELEASE_SECONDS,
    }
  }

  /**
   * Resume the AudioContext inside a user-gesture handler without async kick.
   * iOS Safari only honours AudioContext.resume() when it runs within the gesture.
   */
  prepareContextForGesture(): void {
    const context = this.ensureContext()
    if (context.state !== 'running') {
      void context.resume().catch(() => {})
    }
  }
  prepareContext(): void {
    this.prepareContextForGesture()
    const context = this.context
    if (!context) {
      return
    }
    const contextState = context.state as AudioContextState | 'interrupted'
    if (contextState === 'interrupted') {
      void this.kickContext()
    }
  }

  private ensureContext(): AudioContext {
    if (this.context) {
      return this.context
    }
    const context = new AudioContext({ latencyHint: 'interactive' })
    const masterGain = context.createGain()
    const lowPass = context.createBiquadFilter()
    const limiter = context.createDynamicsCompressor()
    lowPass.type = 'lowpass'
    lowPass.frequency.value = 6500
    lowPass.Q.value = 0.7
    limiter.threshold.value = LIMITER_THRESHOLD_DB
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.002
    limiter.release.value = 0.05
    masterGain.gain.value = 0.0001
    masterGain.connect(lowPass)
    lowPass.connect(limiter)
    limiter.connect(context.destination)
    this.context = context
    this.masterGain = masterGain
    return context
  }

  async start(config: DroneRuntimeConfig): Promise<void> {
    this.ensureRunning(config)
    const context = this.context
    if (context && context.state !== 'running') {
      try {
        await context.resume()
      } catch {
        // Safari occasionally rejects resume outside a gesture; ensureRunning already
        // fired a synchronous resume() so we simply swallow the async echo.
      }
    }
  }

  /**
   * Synchronous entry point used from user-gesture handlers (touch, click,
   * MediaSession actions). iOS Safari only honours AudioContext.resume() when it
   * is invoked within the same microtask as the user gesture, so we must not
   * `await` anything before calling it.
   */
  ensureRunning(config: DroneRuntimeConfig): void {
    this.prepareContext()
    this.updateFadeSettings(config)
    if (!this.shouldPlay) {
      return
    }
    this.started = true
    this.syncConfig(config, this.voiceMap.size === 0)
  }

  fastResume(config: DroneRuntimeConfig, options?: { skipEntryGlide?: boolean }): void {
    this.ensureRunning(config)
    if (!this.shouldPlay || !this.context || !this.masterGain) {
      return
    }
    const now = this.context.currentTime
    if (!options?.skipEntryGlide) {
      this.reapplyEntryGlides(config, now)
    }
    this.snapAudibleLevels(config, now)
  }

  /** True when a gesture handler already unmuted the graph synchronously. */
  isReadyForInstantResume(): boolean {
    return this.canFastResume() && this.isContextRunning()
  }

  private snapAudibleLevels(config: DroneRuntimeConfig, now: number): void {
    if (!this.masterGain) {
      return
    }
    this.updateFadeSettings(config)
    const masterTarget = dbToGain(config.masterGainDb)
    const fadeInSeconds = this.playbackFadeInSeconds
    this.masterGain.gain.cancelScheduledValues(now)
    if (fadeInSeconds > 0) {
      scheduleSmoothMasterFadeIn(this.masterGain.gain, masterTarget, now, fadeInSeconds)
    } else {
      this.masterGain.gain.setValueAtTime(masterTarget, now)
    }
    this.lastMasterTarget = masterTarget
    this.resumeFromSilence = false

    for (const [noteId, voice] of this.voiceMap.entries()) {
      const toneConfig = config.tones.find((tone) => tone.noteId === noteId && tone.enabled)
      if (!toneConfig) {
        continue
      }
      const toneGain = Math.max(0.0001, dbToGain(toneConfig.gainDb))
      voice.outputGain.gain.cancelScheduledValues(now)
      voice.outputGain.gain.setValueAtTime(toneGain, now)

      const blend = normalizedBlend(toneConfig.timbreBlend ?? config.timbreBlend)
      const activePartials = (toneConfig.partials ?? config.partials).filter((partial) => partial.enabled)
      let index = 0
      for (let partialIndex = 0; partialIndex < activePartials.length; partialIndex += 1) {
        const partial = activePartials[partialIndex]
        const partialLinear = dbToGain(partial.gainDb)
        const harmonicIndex = partialIndex + 1
        const timbreWeights = partialTimbreWeights(harmonicIndex, blend, config.harmonicTimbreEnabled)
        const waveTypes = ['sine', 'sawtooth', 'square'] as const
        const waveTarget = [timbreWeights.sine, timbreWeights.saw, timbreWeights.square]
        for (let waveIndex = 0; waveIndex < 3; waveIndex += 1) {
          const bundle = voice.oscillators[index]
          if (!bundle) {
            continue
          }
          const weightedAmount = waveTarget[waveIndex] ?? 0
          const waveType = waveTypes[waveIndex]
          const nextWaveGain =
            weightedAmount > 0
              ? Math.max(
                  0.0001,
                  partialLinear * weightedAmount * waveformGainCompensation(waveType),
                )
              : 0.0001
          bundle.gainNode.gain.cancelScheduledValues(now)
          bundle.gainNode.gain.setValueAtTime(nextWaveGain, now)
          index += 1
        }
      }
    }
  }

  /** Re-run entry glide after pause; glides finish silently while muted during pause. */
  private reapplyEntryGlides(config: DroneRuntimeConfig, now: number): void {
    for (const [noteId, voice] of this.voiceMap.entries()) {
      const toneConfig = config.tones.find((tone) => tone.noteId === noteId && tone.enabled)
      if (!toneConfig) {
        continue
      }
      const entryGlide = this.getEntryGlideSpec(config, toneConfig)
      if (!entryGlide || entryGlide.cents === 0 || entryGlide.seconds <= 0) {
        continue
      }
      const toneFrequency = getFrequency(
        toneConfig.noteId,
        config.tuningSystemId,
        config.tonalCenter,
        config.referenceA4Hz,
        config.baseOctave,
      )
      for (const bundle of voice.oscillators) {
        this.scheduleEntryGlideFrequency(
          bundle.oscillator,
          toneFrequency * bundle.ratio,
          config,
          toneConfig,
          now,
        )
      }
      voice.entryGlideEndTime = now + entryGlide.seconds
    }
  }

  /**
   * Force a suspend/resume cycle. Fixes the documented WebKit bug where the
   * AudioContext reports "running" but the hardware clock is stalled after the
   * PWA returns from background (bugs.webkit.org/show_bug.cgi?id=263627).
   */
  async kickContext(allowWhilePlaying = false): Promise<void> {
    if (this.shouldPlay && !allowWhilePlaying) {
      return
    }
    const context = this.context
    if (!context) {
      return
    }
    try {
      await context.suspend()
      await context.resume()
    } catch {
      // Nothing actionable; the caller can decide whether to retry.
    }
  }

  /**
   * Detects the Safari/WebKit "running-but-muted" condition where the context
   * reports running state but currentTime is effectively frozen after app
   * resume. We probe clock progress and only kick when stalled.
   */
  async recoverIfStalled(): Promise<void> {
    const context = this.context
    if (!context) {
      return
    }
    recordBleDebug('note', `recover in:${this.contextDebugLabel()}`)
    const extendedState = context.state as AudioContextState | 'interrupted'
    if (extendedState === 'suspended' || extendedState === 'interrupted') {
      try {
        await context.resume()
      } catch {
        // iOS may reject until a gesture; visibility/focus retries will run again.
      }
      if ((context.state as string) === 'interrupted') {
        await this.kickContext(true)
      }
    }
    if (context.state !== 'running') {
      recordBleDebug('note', `recover bail:${this.contextDebugLabel()}`)
      return
    }
    const before = context.currentTime
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 120)
    })
    if (this.context !== context || context.state !== 'running') {
      return
    }
    const delta = context.currentTime - before
    if (delta < 0.01) {
      await this.kickContext()
      recordBleDebug('note', `recover kicked->${this.contextDebugLabel()}`)
    } else {
      recordBleDebug('note', `recover ok delta=${delta.toFixed(3)}`)
    }
  }

  /**
   * Fast, gesture-friendly recovery with no probe delay. Samples the audio
   * clock against wall-clock time so a frozen "running" context is detected
   * instantly (using the previous sample) and kicked, and a suspended/
   * interrupted context is resumed synchronously within the calling gesture.
   */
  async pokeClock(): Promise<void> {
    const context = this.context
    if (!context) {
      return
    }
    const state = context.state as AudioContextState | 'interrupted'
    const wallNow = Date.now()
    const ctxNow = context.currentTime
    const previous = this.lastClock
    this.lastClock = { wall: wallNow, ctx: ctxNow }
    if (state === 'suspended' || state === 'interrupted') {
      recordBleDebug('note', `poke resume:${state}`)
      try {
        await context.resume()
      } catch {
        // iOS may reject until the next gesture; retried then.
      }
      if ((context.state as string) === 'interrupted') {
        await this.kickContext(true)
      }
      this.lastClock = { wall: Date.now(), ctx: context.currentTime }
      return
    }
    if (!this.shouldPlay && previous.wall > 0) {
      const wallDelta = (wallNow - previous.wall) / 1000
      const ctxDelta = ctxNow - previous.ctx
      if (wallDelta > 0.25 && ctxDelta < wallDelta * 0.5) {
        recordBleDebug('note', `poke kick frozen@${ctxNow.toFixed(2)}`)
        await this.kickContext()
        this.lastClock = { wall: Date.now(), ctx: context.currentTime }
      }
    }
  }

  isContextRunning(): boolean {
    return this.context?.state === 'running'
  }

  /** Current master gain value, for diagnostics (1e-4 means muted). */
  masterGainValue(): number {
    return this.masterGain?.gain.value ?? -1
  }

  /** Compact context state for diagnostics: state@currentTime. */
  contextDebugLabel(): string {
    if (!this.context) {
      return 'no-ctx'
    }
    return `${this.context.state}@${this.context.currentTime.toFixed(2)}`
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

  private forceMute(now: number): void {
    if (!this.masterGain) {
      return
    }
    this.resumeFromSilence = true
    this.masterGain.gain.cancelScheduledValues(now)
    this.masterGain.gain.setValueAtTime(0.0001, now)
    this.muteVoicesAt(now, 0.0001)
  }

  private muteVoicesAt(now: number, gain: number): void {
    for (const voice of this.voiceMap.values()) {
      voice.outputGain.gain.cancelScheduledValues(now)
      voice.outputGain.gain.setValueAtTime(gain, now)
      for (const bundle of voice.oscillators) {
        bundle.gainNode.gain.cancelScheduledValues(now)
        bundle.gainNode.gain.setValueAtTime(gain, now)
      }
    }
  }

  private scheduleAudibleFadeOut(now: number, fadeOutSeconds: number): void {
    if (!this.masterGain) {
      return
    }
    this.resumeFromSilence = true
    const startGain = Math.max(this.lastMasterTarget, this.masterGain.gain.value, MIN_AUDIBLE_GAIN)
    scheduleSmoothMasterFadeOut(this.masterGain.gain, startGain, now, fadeOutSeconds)
    this.muteVoicesAt(now + fadeOutSeconds, MIN_AUDIBLE_GAIN)
  }

  private updateFadeSettings(config: DroneRuntimeConfig): void {
    this.playbackFadeInSeconds = Math.max(0, config.playbackFadeInSeconds ?? 0)
    this.playbackFadeOutSeconds = Math.max(0, config.playbackFadeOutSeconds ?? 0)
    this.presetCrossfadeSeconds = Math.max(0, config.presetCrossfadeSeconds ?? 0)
  }

  stop(): void {
    this.shouldPlay = false
    this.started = false
    if (!this.context || !this.masterGain) {
      return
    }
    const now = this.context.currentTime
    this.forceMute(now)
    for (const [noteId, voice] of this.voiceMap.entries()) {
      this.fadeAndStopVoice(voice, RELEASE_SECONDS)
      this.voiceMap.delete(noteId)
    }
  }

  /** Mute quickly but keep voices alive for low-latency resume (BT media remotes). */
  pause(): void {
    this.shouldPlay = false
    if (!this.context || !this.masterGain) {
      return
    }
    for (const voice of this.voiceMap.values()) {
      voice.entryGlideEndTime = null
    }
    const now = this.context.currentTime
    if (this.playbackFadeOutSeconds > 0) {
      this.scheduleAudibleFadeOut(now, this.playbackFadeOutSeconds)
    } else {
      this.forceMute(now)
    }
    if (needsIosMediaRemoteIntegration()) {
      void this.pokeClock().then(() => {
        if (!this.shouldPlay && this.context && this.masterGain && this.playbackFadeOutSeconds <= 0) {
          this.forceMute(this.context.currentTime)
        }
      })
    }
  }

  canFastResume(): boolean {
    return this.started && this.voiceMap.size > 0 && this.context !== null
  }

  syncConfig(config: DroneRuntimeConfig, forceRebuild = false): void {
    if (!this.context || !this.masterGain) {
      return
    }
    this.updateFadeSettings(config)
    const now = this.context.currentTime
    if (!this.started || !this.shouldPlay) {
      this.started = false
      this.forceMute(now)
      return
    }
    const voiceTransition = this.resolveVoiceTransitionTiming()
    const masterTarget = dbToGain(config.masterGainDb)
    // Do not trust AudioParam.value < threshold on iOS — mid-curve reads often
    // return ~0 and would restart a silence fade-in, killing the crossfade.
    if (this.resumeFromSilence && this.playbackFadeInSeconds > 0) {
      scheduleSmoothMasterFadeIn(
        this.masterGain.gain,
        masterTarget,
        now,
        this.playbackFadeInSeconds,
      )
    } else if (this.resumeFromSilence) {
      this.masterGain.gain.cancelScheduledValues(now)
      this.masterGain.gain.setValueAtTime(masterTarget, now)
    } else if (usesSmoothCrossfade(voiceTransition.updateSeconds)) {
      scheduleSmoothGainCrossfade(
        this.masterGain.gain,
        masterTarget,
        now,
        voiceTransition.updateSeconds,
        this.lastMasterTarget,
      )
    } else {
      this.masterGain.gain.cancelScheduledValues(now)
      const start = Math.max(MIN_AUDIBLE_GAIN, this.lastMasterTarget, this.masterGain.gain.value)
      this.masterGain.gain.setValueAtTime(start, now)
      this.masterGain.gain.linearRampToValueAtTime(
        this.started ? masterTarget : MIN_AUDIBLE_GAIN,
        now + PARAM_SMOOTH_SECONDS,
      )
    }
    this.lastMasterTarget = masterTarget
    this.resumeFromSilence = false

    const targetNotes = new Set<string>()
    for (const toneConfig of config.tones) {
      if (!toneConfig.enabled || !this.started) {
        continue
      }
      targetNotes.add(toneConfig.noteId)
      this.upsertVoice(config, toneConfig, now, forceRebuild, voiceTransition)
    }

    for (const [noteId, voice] of this.voiceMap.entries()) {
      if (!targetNotes.has(noteId)) {
        this.fadeAndStopVoice(voice, voiceTransition.releaseSeconds)
        this.voiceMap.delete(noteId)
      }
    }
  }

  destroy(): void {
    this.stop()
    for (const tone of this.voiceMap.values()) {
      this.fadeAndStopVoice(tone, 0.01)
    }
    this.voiceMap.clear()
    if (this.context) {
      void this.context.close()
    }
    this.context = null
    this.masterGain = null
  }

  private upsertVoice(
    config: DroneRuntimeConfig,
    toneConfig: ToneConfig,
    now: number,
    forceRebuild: boolean,
    transition: VoiceTransitionTiming,
  ): void {
    const existing = this.voiceMap.get(toneConfig.noteId)
    const tonePartials = toneConfig.partials ?? config.partials
    const needsRebuild = forceRebuild || this.voiceNeedsRebuild(existing, tonePartials)

    if (needsRebuild && existing) {
      // Keep rebuild crossfades short unless a preset transition requests longer overlap.
      this.fadeAndStopVoice(existing, transition.rebuildReleaseSeconds)
      this.voiceMap.delete(toneConfig.noteId)
    }

    const liveVoice = this.voiceMap.get(toneConfig.noteId)
    if (!liveVoice) {
      const created = this.createVoice(config, toneConfig, now, transition.attackSeconds)
      this.voiceMap.set(toneConfig.noteId, created)
      return
    }
    this.updateVoice(config, liveVoice, toneConfig, now, transition.updateSeconds)
  }

  private voiceNeedsRebuild(voice: ToneVoice | undefined, partials: PartialConfig[]): boolean {
    if (!voice) {
      return true
    }
    const activePartials = partials.filter((partial) => partial.enabled)
    const activeOscCount = activePartials.length * 3
    return activeOscCount !== voice.oscillators.length
  }

  private getEntryGlideSpec(
    config: DroneRuntimeConfig,
    toneConfig: ToneConfig,
  ): EntryGlideParams | null {
    if (config.lowestToneGlideNoteId && config.lowestToneGlideNoteId === toneConfig.noteId) {
      return config.lowestToneGlide ?? DEFAULT_ENTRY_GLIDE
    }
    if (config.highestToneGlideNoteId && config.highestToneGlideNoteId === toneConfig.noteId) {
      return config.highestToneGlide ?? DEFAULT_ENTRY_GLIDE
    }
    return null
  }

  private scheduleEntryGlideFrequency(
    oscillator: OscillatorNode,
    targetFrequency: number,
    config: DroneRuntimeConfig,
    toneConfig: ToneConfig,
    now: number,
  ): void {
    oscillator.frequency.cancelScheduledValues(now)
    const glide = this.getEntryGlideSpec(config, toneConfig)
    if (glide && glide.cents !== 0 && glide.seconds > 0) {
      const absCents = Math.abs(glide.cents)
      const centRatio = 2 ** (absCents / 1200)
      const startFrequency = Math.max(
        1,
        glide.cents > 0 ? targetFrequency * centRatio : targetFrequency / centRatio,
      )
      oscillator.frequency.setValueAtTime(startFrequency, now)
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, targetFrequency),
        now + glide.seconds,
      )
      return
    }
    oscillator.frequency.setValueAtTime(Math.max(1, targetFrequency), now)
  }

  private createVoice(
    config: DroneRuntimeConfig,
    toneConfig: ToneConfig,
    now: number,
    attackSeconds: number,
  ): ToneVoice {
    if (!this.context || !this.masterGain) {
      throw new Error('Audio graph is not initialized')
    }
    const outputGain = this.context.createGain()
    const panner = this.context.createStereoPanner()
    outputGain.gain.value = 0.0001
    panner.pan.value = toneConfig.pan
    outputGain.connect(panner)
    panner.connect(this.masterGain)

    const blend = normalizedBlend(toneConfig.timbreBlend ?? config.timbreBlend)
    const toneGain = dbToGain(toneConfig.gainDb)
    const toneFrequency = getFrequency(
      toneConfig.noteId,
      config.tuningSystemId,
      config.tonalCenter,
      config.referenceA4Hz,
      config.baseOctave,
    )
    const entryGlide = this.getEntryGlideSpec(config, toneConfig)
    const oscillators: OscBundle[] = []
    const activePartials = (toneConfig.partials ?? config.partials).filter((partial) => partial.enabled)
    for (let partialIndex = 0; partialIndex < activePartials.length; partialIndex += 1) {
      const partial = activePartials[partialIndex]
      const ratio = Math.max(0.0625, partial.ratio)
      const fundamentalPartialGain = dbToGain(partial.gainDb)
      const harmonicIndex = partialIndex + 1
      const timbreWeights = partialTimbreWeights(harmonicIndex, blend, config.harmonicTimbreEnabled)
      const waveGains = [
        { type: 'sine' as const, amount: timbreWeights.sine },
        { type: 'sawtooth' as const, amount: timbreWeights.saw },
        { type: 'square' as const, amount: timbreWeights.square },
      ]
      for (const waveGain of waveGains) {
        const oscillator = this.context.createOscillator()
        const gainNode = this.context.createGain()
        oscillator.type = waveGain.type
        const targetFrequency = toneFrequency * ratio
        oscillator.frequency.value = targetFrequency
        oscillator.detune.value = toneConfig.detuneCents
        gainNode.gain.value = 0.0001
        oscillator.connect(gainNode)
        gainNode.connect(outputGain)
        oscillator.start()
        this.scheduleEntryGlideFrequency(oscillator, targetFrequency, config, toneConfig, now)
        oscillators.push({
          oscillator,
          gainNode,
          waveGain:
            waveGain.amount *
            fundamentalPartialGain *
            waveformGainCompensation(waveGain.type),
          ratio,
        })
      }
    }

    outputGain.gain.cancelScheduledValues(now)
    if (usesSmoothCrossfade(attackSeconds)) {
      scheduleSmoothVoiceFadeIn(outputGain.gain, toneGain, now, attackSeconds)
    } else if (this.playbackFadeInSeconds > 0) {
      outputGain.gain.setValueAtTime(Math.max(MIN_AUDIBLE_GAIN, toneGain), now)
    } else {
      outputGain.gain.setValueAtTime(MIN_AUDIBLE_GAIN, now)
      outputGain.gain.exponentialRampToValueAtTime(
        Math.max(MIN_AUDIBLE_GAIN, toneGain),
        now + attackSeconds,
      )
    }

    for (const bundle of oscillators) {
      bundle.gainNode.gain.cancelScheduledValues(now)
      if (usesSmoothCrossfade(attackSeconds)) {
        scheduleSmoothVoiceFadeIn(bundle.gainNode.gain, bundle.waveGain, now, attackSeconds)
      } else if (this.playbackFadeInSeconds > 0) {
        bundle.gainNode.gain.setValueAtTime(Math.max(MIN_AUDIBLE_GAIN, bundle.waveGain), now)
      } else {
        bundle.gainNode.gain.setValueAtTime(MIN_AUDIBLE_GAIN, now)
        bundle.gainNode.gain.exponentialRampToValueAtTime(
          Math.max(MIN_AUDIBLE_GAIN, bundle.waveGain),
          now + attackSeconds,
        )
      }
    }

    return {
      noteId: toneConfig.noteId,
      outputGain,
      panner,
      oscillators,
      entryGlideEndTime:
        entryGlide && entryGlide.cents !== 0 && entryGlide.seconds > 0 ? now + entryGlide.seconds : null,
    }
  }

  private updateVoice(
    config: DroneRuntimeConfig,
    voice: ToneVoice,
    toneConfig: ToneConfig,
    now: number,
    updateSeconds: number,
  ): void {
    const frequency = getFrequency(
      toneConfig.noteId,
      config.tuningSystemId,
      config.tonalCenter,
      config.referenceA4Hz,
      config.baseOctave,
    )
    const toneGain = Math.max(0.0001, dbToGain(toneConfig.gainDb))
    const outputStart =
      voice.outputGain.gain.value > 0.002
        ? voice.outputGain.gain.value
        : Math.max(MIN_AUDIBLE_GAIN, toneGain)
    if (usesSmoothCrossfade(updateSeconds)) {
      scheduleSmoothGainCrossfade(
        voice.outputGain.gain,
        toneGain,
        now,
        updateSeconds,
        outputStart,
      )
    } else {
      voice.outputGain.gain.cancelScheduledValues(now)
      voice.outputGain.gain.setValueAtTime(voice.outputGain.gain.value, now)
      voice.outputGain.gain.linearRampToValueAtTime(toneGain, now + updateSeconds)
    }
    voice.panner.pan.cancelScheduledValues(now)
    voice.panner.pan.setValueAtTime(voice.panner.pan.value, now)
    voice.panner.pan.linearRampToValueAtTime(toneConfig.pan, now + updateSeconds)

    const entryGlideActive =
      voice.entryGlideEndTime !== null && now < voice.entryGlideEndTime

    if (!entryGlideActive) {
      for (const bundle of voice.oscillators) {
        bundle.oscillator.detune.cancelScheduledValues(now)
        bundle.oscillator.detune.setValueAtTime(bundle.oscillator.detune.value, now)
        bundle.oscillator.detune.linearRampToValueAtTime(toneConfig.detuneCents, now + updateSeconds)
      }
    }

    const blend = normalizedBlend(toneConfig.timbreBlend ?? config.timbreBlend)
    const activePartials = (toneConfig.partials ?? config.partials).filter((partial) => partial.enabled)
    let index = 0
    for (let partialIndex = 0; partialIndex < activePartials.length; partialIndex += 1) {
      const partial = activePartials[partialIndex]
      const ratio = Math.max(0.0625, partial.ratio)
      const partialLinear = dbToGain(partial.gainDb)
      const harmonicIndex = partialIndex + 1
      const timbreWeights = partialTimbreWeights(harmonicIndex, blend, config.harmonicTimbreEnabled)
      const waveTypes = ['sine', 'sawtooth', 'square'] as const
      const waveTarget = [timbreWeights.sine, timbreWeights.saw, timbreWeights.square]
      for (let waveIndex = 0; waveIndex < 3; waveIndex += 1) {
        const bundle = voice.oscillators[index]
        if (!bundle) {
          continue
        }
        const weightedAmount = waveTarget[waveIndex] ?? 0
        const waveType = waveTypes[waveIndex]
        const nextWaveGain =
          weightedAmount > 0
            ? Math.max(
                0.0001,
                partialLinear * weightedAmount * waveformGainCompensation(waveType),
              )
            : 0.0001
        bundle.ratio = ratio
        bundle.waveGain = nextWaveGain
        if (!entryGlideActive) {
          bundle.oscillator.frequency.cancelScheduledValues(now)
          bundle.oscillator.frequency.setValueAtTime(bundle.oscillator.frequency.value, now)
          bundle.oscillator.frequency.exponentialRampToValueAtTime(
            Math.max(1, frequency * ratio),
            now + updateSeconds,
          )
        }
        if (usesSmoothCrossfade(updateSeconds)) {
          const waveStart =
            bundle.gainNode.gain.value > 0.002
              ? bundle.gainNode.gain.value
              : Math.max(MIN_AUDIBLE_GAIN, bundle.waveGain, nextWaveGain)
          scheduleSmoothGainCrossfade(
            bundle.gainNode.gain,
            nextWaveGain,
            now,
            updateSeconds,
            waveStart,
          )
        } else {
          bundle.gainNode.gain.cancelScheduledValues(now)
          bundle.gainNode.gain.setValueAtTime(bundle.gainNode.gain.value, now)
          bundle.gainNode.gain.exponentialRampToValueAtTime(
            nextWaveGain,
            now + updateSeconds,
          )
        }
        index += 1
      }
    }
  }

  private disposeVoiceNodes(voice: ToneVoice): void {
    for (const bundle of voice.oscillators) {
      try {
        bundle.oscillator.disconnect()
        bundle.gainNode.disconnect()
      } catch {
        // Oscillator may already be stopped/disconnected.
      }
    }
    try {
      voice.panner.disconnect()
      voice.outputGain.disconnect()
    } catch {
      // Nodes may already be disconnected.
    }
  }

  private fadeAndStopVoice(voice: ToneVoice, releaseSeconds: number): void {
    if (!this.context) {
      return
    }
    const context = this.context
    const now = context.currentTime
    const duration = Math.max(0, releaseSeconds)
    const stopAt = now + Math.max(duration, 0.01) + 0.03

    if (usesSmoothCrossfade(duration)) {
      scheduleSmoothVoiceFadeOut(voice.outputGain.gain, now, duration)
    } else {
      voice.outputGain.gain.cancelScheduledValues(now)
      voice.outputGain.gain.setValueAtTime(Math.max(voice.outputGain.gain.value, 0.0001), now)
      voice.outputGain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    }

    for (const bundle of voice.oscillators) {
      bundle.oscillator.stop(stopAt)
    }

    window.setTimeout(() => {
      if (this.context !== context) {
        return
      }
      this.disposeVoiceNodes(voice)
    }, duration * 1000 + 80)
  }
}

/**
 * Shared singleton so user-gesture callbacks (MediaSession actions, Bluetooth
 * media keys) can reach the engine synchronously. iOS Safari only honours
 * AudioContext.resume() when it runs within the same microtask as the gesture,
 * so routing through React state + an async effect would lose that window.
 */
export const droneEngine = new DroneEngine()
