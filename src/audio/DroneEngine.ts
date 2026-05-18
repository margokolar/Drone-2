import { dbToGain, normalizedBlend } from './audioMath'
import type { DroneRuntimeConfig, PartialConfig, ToneConfig } from './types'
import { getFrequency } from '../music/tuning'

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
}

const ATTACK_SECONDS = 0.025
const RELEASE_SECONDS = 0.08
const REBUILD_RELEASE_SECONDS = 0.03
const PARAM_SMOOTH_SECONDS = 0.015
const LIMITER_THRESHOLD_DB = -3

export class DroneEngine {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private voiceMap = new Map<string, ToneVoice>()
  private started = false

  private ensureContext(): AudioContext {
    if (this.context) {
      return this.context
    }
    const context = new AudioContext()
    const masterGain = context.createGain()
    const lowPass = context.createBiquadFilter()
    const limiter = context.createDynamicsCompressor()
    lowPass.type = 'lowpass'
    lowPass.frequency.value = 6500
    lowPass.Q.value = 0.7
    limiter.threshold.value = LIMITER_THRESHOLD_DB
    limiter.knee.value = 6
    limiter.ratio.value = 10
    limiter.attack.value = 0.003
    limiter.release.value = 0.1
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
    const context = this.ensureContext()
    const contextState = context.state as AudioContextState | 'interrupted'
    if (context.state !== 'running') {
      void context
        .resume()
        .catch(() => {
          // iOS can reject resume() while the page is still warming up; the
          // caller may retry on the next user gesture.
        })
    }
    if (contextState === 'interrupted') {
      void this.kickContext()
    }
    this.started = true
    this.syncConfig(config, this.voiceMap.size === 0)
  }

  fastResume(config: DroneRuntimeConfig): void {
    this.ensureRunning(config)
    if (!this.context || !this.masterGain) {
      return
    }
    const now = this.context.currentTime
    this.masterGain.gain.cancelScheduledValues(now)
    this.masterGain.gain.setValueAtTime(dbToGain(config.masterGainDb), now)
  }

  /**
   * Force a suspend/resume cycle. Fixes the documented WebKit bug where the
   * AudioContext reports "running" but the hardware clock is stalled after the
   * PWA returns from background (bugs.webkit.org/show_bug.cgi?id=263627).
   */
  async kickContext(): Promise<void> {
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
    const extendedState = context.state as AudioContextState | 'interrupted'
    if (extendedState === 'suspended' || extendedState === 'interrupted') {
      try {
        await context.resume()
      } catch {
        // iOS may reject until a gesture; visibility/focus retries will run again.
      }
      if ((context.state as string) === 'interrupted') {
        await this.kickContext()
      }
    }
    if (context.state !== 'running') {
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
    }
  }

  isContextRunning(): boolean {
    return this.context?.state === 'running'
  }

  stop(): void {
    if (!this.context || !this.masterGain) {
      return
    }
    const now = this.context.currentTime
    this.masterGain.gain.cancelScheduledValues(now)
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
    this.masterGain.gain.linearRampToValueAtTime(0.0001, now + RELEASE_SECONDS)
    // Soft-pause: keep oscillators alive behind the muted master gain so
    // Bluetooth/lock-screen resume can become audible immediately.
    this.started = false
  }

  syncConfig(config: DroneRuntimeConfig, forceRebuild = false): void {
    if (!this.context || !this.masterGain) {
      return
    }
    const now = this.context.currentTime
    const masterTarget = dbToGain(config.masterGainDb)
    this.masterGain.gain.cancelScheduledValues(now)
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
    this.masterGain.gain.linearRampToValueAtTime(
      this.started ? masterTarget : 0.0001,
      now + PARAM_SMOOTH_SECONDS,
    )

    const targetNotes = new Set<string>()
    for (const toneConfig of config.tones) {
      if (!toneConfig.enabled || !this.started) {
        continue
      }
      targetNotes.add(toneConfig.noteId)
      this.upsertVoice(config, toneConfig, now, forceRebuild)
    }

    for (const [noteId, voice] of this.voiceMap.entries()) {
      if (!targetNotes.has(noteId)) {
        this.fadeAndStopVoice(voice, RELEASE_SECONDS)
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
  ): void {
    const existing = this.voiceMap.get(toneConfig.noteId)
    const tonePartials = toneConfig.partials ?? config.partials
    const needsRebuild = forceRebuild || this.voiceNeedsRebuild(existing, tonePartials)

    if (needsRebuild && existing) {
      // Keep rebuild crossfades short so rapid undo/reset cycles do not stack
      // overlapping timbres from old and new overtone structures.
      this.fadeAndStopVoice(existing, REBUILD_RELEASE_SECONDS)
      this.voiceMap.delete(toneConfig.noteId)
    }

    const liveVoice = this.voiceMap.get(toneConfig.noteId)
    if (!liveVoice) {
      const created = this.createVoice(config, toneConfig, now)
      this.voiceMap.set(toneConfig.noteId, created)
      return
    }
    this.updateVoice(config, liveVoice, toneConfig, now)
  }

  private voiceNeedsRebuild(voice: ToneVoice | undefined, partials: PartialConfig[]): boolean {
    if (!voice) {
      return true
    }
    const activePartials = partials.filter((partial) => partial.enabled)
    const activeOscCount = activePartials.length * 3
    return activeOscCount !== voice.oscillators.length
  }

  private createVoice(
    config: DroneRuntimeConfig,
    toneConfig: ToneConfig,
    now: number,
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

    const blend = normalizedBlend(config.timbreBlend)
    const toneGain = dbToGain(toneConfig.gainDb)
    const toneFrequency = getFrequency(
      toneConfig.noteId,
      config.tuningSystemId,
      config.tonalCenter,
      config.referenceA4Hz,
      config.baseOctave,
    )
    const oscillators: OscBundle[] = []
    for (const partial of toneConfig.partials ?? config.partials) {
      if (!partial.enabled) {
        continue
      }
      const ratio = Math.max(0.0625, partial.ratio)
      const fundamentalPartialGain = dbToGain(partial.gainDb)
      const waveGains = [
        { type: 'sine' as const, amount: blend.sine },
        { type: 'sawtooth' as const, amount: blend.saw },
        { type: 'square' as const, amount: blend.square },
      ]
      for (const waveGain of waveGains) {
        const oscillator = this.context.createOscillator()
        const gainNode = this.context.createGain()
        oscillator.type = waveGain.type
        oscillator.frequency.value = toneFrequency * ratio
        gainNode.gain.value = 0.0001
        oscillator.connect(gainNode)
        gainNode.connect(outputGain)
        oscillator.start()
        oscillators.push({
          oscillator,
          gainNode,
          waveGain: waveGain.amount * fundamentalPartialGain,
          ratio,
        })
      }
    }

    outputGain.gain.cancelScheduledValues(now)
    outputGain.gain.setValueAtTime(0.0001, now)
    outputGain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, toneGain),
      now + ATTACK_SECONDS,
    )

    for (const bundle of oscillators) {
      bundle.gainNode.gain.cancelScheduledValues(now)
      bundle.gainNode.gain.setValueAtTime(0.0001, now)
      bundle.gainNode.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, bundle.waveGain),
        now + ATTACK_SECONDS,
      )
    }

    return {
      noteId: toneConfig.noteId,
      outputGain,
      panner,
      oscillators,
    }
  }

  private updateVoice(
    config: DroneRuntimeConfig,
    voice: ToneVoice,
    toneConfig: ToneConfig,
    now: number,
  ): void {
    const frequency = getFrequency(
      toneConfig.noteId,
      config.tuningSystemId,
      config.tonalCenter,
      config.referenceA4Hz,
      config.baseOctave,
    )
    const toneGain = Math.max(0.0001, dbToGain(toneConfig.gainDb))
    voice.outputGain.gain.cancelScheduledValues(now)
    voice.outputGain.gain.setValueAtTime(voice.outputGain.gain.value, now)
    voice.outputGain.gain.linearRampToValueAtTime(toneGain, now + PARAM_SMOOTH_SECONDS)
    voice.panner.pan.cancelScheduledValues(now)
    voice.panner.pan.setValueAtTime(voice.panner.pan.value, now)
    voice.panner.pan.linearRampToValueAtTime(toneConfig.pan, now + PARAM_SMOOTH_SECONDS)

    const blend = normalizedBlend(config.timbreBlend)
    const activePartials = (toneConfig.partials ?? config.partials).filter((partial) => partial.enabled)
    const waveTarget = [blend.sine, blend.saw, blend.square]
    let index = 0
    for (const partial of activePartials) {
      const ratio = Math.max(0.0625, partial.ratio)
      const partialLinear = dbToGain(partial.gainDb)
      for (let waveIndex = 0; waveIndex < 3; waveIndex += 1) {
        const bundle = voice.oscillators[index]
        if (!bundle) {
          continue
        }
        const nextWaveGain = Math.max(0.0001, partialLinear * waveTarget[waveIndex])
        bundle.ratio = ratio
        bundle.waveGain = nextWaveGain
        bundle.oscillator.frequency.cancelScheduledValues(now)
        bundle.oscillator.frequency.setValueAtTime(bundle.oscillator.frequency.value, now)
        bundle.oscillator.frequency.exponentialRampToValueAtTime(
          Math.max(1, frequency * ratio),
          now + PARAM_SMOOTH_SECONDS,
        )
        bundle.gainNode.gain.cancelScheduledValues(now)
        bundle.gainNode.gain.setValueAtTime(bundle.gainNode.gain.value, now)
        bundle.gainNode.gain.exponentialRampToValueAtTime(
          nextWaveGain,
          now + PARAM_SMOOTH_SECONDS,
        )
        index += 1
      }
    }
  }

  private fadeAndStopVoice(voice: ToneVoice, releaseSeconds: number): void {
    if (!this.context) {
      return
    }
    const now = this.context.currentTime
    voice.outputGain.gain.cancelScheduledValues(now)
    voice.outputGain.gain.setValueAtTime(Math.max(voice.outputGain.gain.value, 0.0001), now)
    voice.outputGain.gain.exponentialRampToValueAtTime(0.0001, now + releaseSeconds)
    for (const bundle of voice.oscillators) {
      bundle.gainNode.gain.cancelScheduledValues(now)
      bundle.gainNode.gain.setValueAtTime(Math.max(bundle.gainNode.gain.value, 0.0001), now)
      bundle.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + releaseSeconds)
      bundle.oscillator.stop(now + releaseSeconds + 0.02)
      bundle.oscillator.disconnect()
      bundle.gainNode.disconnect()
    }
    voice.panner.disconnect()
    voice.outputGain.disconnect()
  }
}

/**
 * Shared singleton so user-gesture callbacks (MediaSession actions, Bluetooth
 * media keys) can reach the engine synchronously. iOS Safari only honours
 * AudioContext.resume() when it runs within the same microtask as the gesture,
 * so routing through React state + an async effect would lose that window.
 */
export const droneEngine = new DroneEngine()
