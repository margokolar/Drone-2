import { dbToGain } from './audioMath'
import { isNativeSynth } from './isNativeSynth'
import { DroneSynth } from '../native/droneSynth'

type LoopConfig = {
  enabled: boolean
  volumeDb: number
  muted: boolean
}

type WebAudioContextCtor = typeof AudioContext

function clamp01(value: number): number {
  if (value < 0) {
    return 0
  }
  if (value > 1) {
    return 1
  }
  return value
}

function audioContextConstructor(): WebAudioContextCtor | null {
  if (typeof window === 'undefined') {
    return null
  }
  const fromWindow = window as Window & { webkitAudioContext?: WebAudioContextCtor }
  return window.AudioContext ?? fromWindow.webkitAudioContext ?? null
}

function blobSliceToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const buffer = reader.result
      if (!(buffer instanceof ArrayBuffer)) {
        reject(new Error('Could not read loop audio'))
        return
      }
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const step = 0x8000
      for (let offset = 0; offset < bytes.length; offset += step) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + step))
      }
      resolve(btoa(binary))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read loop audio'))
    reader.readAsArrayBuffer(blob)
  })
}

const NATIVE_LOOP_CHUNK_SIZES = [32 * 1024, 8 * 1024, 4 * 1024]

let nativeSendQueue: Promise<unknown> = Promise.resolve()

function enqueueNativeSend<T>(work: () => Promise<T>): Promise<T> {
  const run = nativeSendQueue.then(work, work)
  nativeSendQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function sendNativeLoopAudioOnce(
  blob: Blob,
  chunkBytes: number,
): Promise<{ duration: number; bytes: number }> {
  await DroneSynth.beginLoopAudio({ bytes: blob.size })
  for (let offset = 0; offset < blob.size; offset += chunkBytes) {
    const slice = blob.slice(offset, Math.min(offset + chunkBytes, blob.size))
    const data = await blobSliceToBase64(slice)
    await DroneSynth.appendLoopAudio({ data })
  }
  const result = await DroneSynth.finishLoopAudio()
  return {
    duration: typeof result?.duration === 'number' ? result.duration : 0,
    bytes: typeof result?.bytes === 'number' ? result.bytes : 0,
  }
}

async function sendNativeLoopAudio(blob: Blob): Promise<number> {
  for (const chunkBytes of NATIVE_LOOP_CHUNK_SIZES) {
    const result = await sendNativeLoopAudioOnce(blob, chunkBytes)
    if (blob.size <= 0 || result.bytes >= blob.size * 0.98) {
      return result.duration
    }
  }
  return 0
}

export class LoopEngine {
  private config: LoopConfig = {
    enabled: false,
    volumeDb: -6,
    muted: false,
  }
  private context: AudioContext | null = null
  private gainNode: GainNode | null = null
  private source: AudioBufferSourceNode | null = null
  private buffer: AudioBuffer | null = null
  private hasNativeAudio = false
  private nativeDuration = 0
  private startedAt = 0
  private startedAtMs = 0
  private nativePosition = -1
  private nativePositionAtMs = 0
  private nativePlayheadKnown = false
  private finishing = false
  private cycleStartTimer: number | null = null
  private cycleStartGeneration = 0

  private linearGain(): number {
    if (this.config.muted) {
      return 0
    }
    return clamp01(dbToGain(this.config.volumeDb))
  }

  private applyGain(): void {
    if (this.gainNode) {
      this.gainNode.gain.value = this.linearGain()
    }
    if (!isNativeSynth() || !this.hasNativeAudio) {
      return
    }
    void DroneSynth.setLoopPlayback({
      on: this.config.enabled ? 1 : 0,
      enabled: this.config.enabled,
      volumeDb: this.config.volumeDb,
      mute: this.config.muted ? 1 : 0,
      muted: this.config.muted,
      restart: 0,
    }).catch(() => {})
  }

  private stopWebSource(): void {
    this.finishing = false
    if (!this.source) {
      return
    }
    try {
      this.source.onended = null
      this.source.stop()
    } catch {
      // Already stopped.
    }
    try {
      this.source.disconnect()
    } catch {
      // Already disconnected.
    }
    this.source = null
  }

  private cycleRemainingSeconds(): number {
    if (!this.context || !this.buffer) {
      return 0
    }
    const duration = this.buffer.length / this.buffer.sampleRate
    if (duration <= 0) {
      return 0
    }
    const elapsed = Math.max(0, this.context.currentTime - this.startedAt)
    const sample = 1 / this.buffer.sampleRate
    const position = elapsed % duration
    if (position < sample) {
      return elapsed < sample * 4 ? duration : 0
    }
    return duration - position
  }

  private finishWebCycle(): void {
    if (this.finishing) {
      return
    }
    if (!this.source || !this.context || !this.buffer) {
      this.stopWebSource()
      return
    }
    const remaining = this.cycleRemainingSeconds()
    if (remaining <= 0.0004) {
      this.stopWebSource()
      return
    }
    this.finishing = true
    this.config = { ...this.config, enabled: false }
    const source = this.source
    source.loop = false
    source.onended = () => {
      if (this.source !== source) {
        return
      }
      this.source = null
      this.finishing = false
    }
    try {
      source.stop(this.context.currentTime + remaining)
    } catch {
      this.stopWebSource()
    }
  }

  private async ensureWebGraph(): Promise<AudioContext> {
    const Ctor = audioContextConstructor()
    if (!Ctor) {
      throw new Error('Web Audio is not available')
    }
    if (!this.context) {
      this.context = new Ctor()
      this.gainNode = this.context.createGain()
      this.gainNode.connect(this.context.destination)
    }
    if (this.context.state !== 'running') {
      await this.context.resume().catch(() => {})
    }
    this.applyGain()
    return this.context
  }

  private startWebSource(): void {
    if (!this.context || !this.gainNode || !this.buffer) {
      return
    }
    this.stopWebSource()
    const source = this.context.createBufferSource()
    source.buffer = this.buffer
    source.loop = true
    source.loopStart = 0
    source.loopEnd = this.buffer.length / this.buffer.sampleRate
    source.connect(this.gainNode)
    this.startedAt = this.context.currentTime
    this.startedAtMs = performance.now()
    this.finishing = false
    source.start(0)
    this.source = source
  }

  private cyclePositionSeconds(): number {
    const duration = this.cycleDurationSeconds()
    if (duration <= 0) {
      return 0
    }
    if (!isNativeSynth() && this.context && this.startedAt > 0) {
      const elapsed = Math.max(0, this.context.currentTime - this.startedAt)
      return elapsed % duration
    }
    if (this.nativePosition >= 0) {
      const elapsed = Math.max(0, (performance.now() - this.nativePositionAtMs) / 1000)
      return (this.nativePosition + elapsed) % duration
    }
    if (this.startedAtMs <= 0) {
      return 0
    }
    const elapsed = Math.max(0, (performance.now() - this.startedAtMs) / 1000)
    return elapsed % duration
  }

  private async refreshNativePosition(): Promise<void> {
    this.nativePlayheadKnown = false
    if (!isNativeSynth() || !this.hasNativeAudio || !this.config.enabled) {
      this.nativePosition = -1
      return
    }
    try {
      const snapshot = await DroneSynth.getLoopPlayback()
      const duration = typeof snapshot?.duration === 'number' ? snapshot.duration : 0
      const position = typeof snapshot?.position === 'number' ? snapshot.position : -1
      if (duration > 0.02) {
        this.nativeDuration = duration
      }
      this.nativePlayheadKnown = true
      if (snapshot?.playing) {
        if (position >= 0) {
          this.nativePosition = position
          this.nativePositionAtMs = performance.now()
          return
        }
        this.nativePlayheadKnown = false
      }
    } catch {
      this.nativePlayheadKnown = false
    }
    this.nativePosition = -1
  }

  cycleDurationSeconds(): number {
    if (this.buffer) {
      return this.buffer.length / this.buffer.sampleRate
    }
    return this.nativeDuration
  }

  secondsUntilCycleStart(): number {
    if (!this.isPlaying()) {
      return 0
    }
    const duration = this.cycleDurationSeconds()
    if (duration <= 0) {
      return 0
    }
    const position = this.cyclePositionSeconds()
    if (position <= 0.02) {
      return 0
    }
    const remaining = duration - position
    if (remaining <= 0.02) {
      return 0
    }
    return remaining
  }

  isFinishing(): boolean {
    return this.finishing
  }

  cancelScheduledCycleStart(): void {
    this.cycleStartGeneration += 1
    if (this.cycleStartTimer === null) {
      return
    }
    window.clearTimeout(this.cycleStartTimer)
    this.cycleStartTimer = null
  }

  isCycling(): boolean {
    return this.isPlaying() && !this.finishing && this.cycleDurationSeconds() > 0.02
  }

  scheduleAtNextCycleStart(callback: () => void): void {
    const generation = this.cycleStartGeneration + 1
    this.cancelScheduledCycleStart()
    this.cycleStartGeneration = generation
    void this.refreshNativePosition().then(() => {
      if (generation !== this.cycleStartGeneration) {
        return
      }
      if (this.nativePlayheadKnown && this.nativePosition < 0) {
        callback()
        return
      }
      const remaining = this.secondsUntilCycleStart()
      if (remaining <= 0.02) {
        callback()
        return
      }
      this.cycleStartTimer = window.setTimeout(() => {
        this.cycleStartTimer = null
        if (generation !== this.cycleStartGeneration) {
          return
        }
        callback()
      }, remaining * 1000)
    })
  }

  hasAudio(): boolean {
    return this.hasNativeAudio || this.buffer !== null
  }

  isPlaying(): boolean {
    if (this.finishing) {
      return true
    }
    if (isNativeSynth()) {
      return this.hasNativeAudio && this.config.enabled
    }
    return this.source !== null || (this.config.enabled && this.buffer !== null)
  }

  async loadBlob(blob: Blob): Promise<void> {
    const shouldPlay = this.config.enabled
    if (isNativeSynth()) {
      this.nativeDuration = await enqueueNativeSend(() => sendNativeLoopAudio(blob))
      this.hasNativeAudio = this.nativeDuration > 0
      this.buffer = null
      if (shouldPlay) {
        this.playFromStart()
      }
      return
    }
    const context = await this.ensureWebGraph()
    const copy = await blob.arrayBuffer()
    this.buffer = await context.decodeAudioData(copy)
    this.nativeDuration = this.buffer.length / this.buffer.sampleRate
    this.hasNativeAudio = false
    if (shouldPlay) {
      this.playFromStart()
    }
  }

  clear(): void {
    this.finishing = false
    this.cancelScheduledCycleStart()
    this.stopWebSource()
    this.config = { ...this.config, enabled: false }
    this.buffer = null
    this.hasNativeAudio = false
    this.nativeDuration = 0
    this.startedAt = 0
    this.startedAtMs = 0
    this.nativePosition = -1
    this.nativePositionAtMs = 0
    this.nativePlayheadKnown = false
    if (isNativeSynth()) {
      void DroneSynth.clearLoop().catch(() => {})
    }
  }

  prepareContext(): void {
    if (isNativeSynth()) {
      void DroneSynth.reclaim().catch(() => {})
      return
    }
    void this.ensureWebGraph().catch(() => {})
  }

  playFromStart(onStarted?: () => void): void {
    this.finishing = false
    this.cancelScheduledCycleStart()
    this.config = { ...this.config, enabled: true }
    this.startedAtMs = performance.now()
    this.nativePosition = 0
    this.nativePositionAtMs = this.startedAtMs
    this.nativePlayheadKnown = true
    if (isNativeSynth()) {
      if (!this.hasNativeAudio) {
        onStarted?.()
        return
      }
      void (async () => {
        await DroneSynth.reclaim().catch(() => {})
        if (!this.config.enabled) {
          onStarted?.()
          return
        }
        try {
          await DroneSynth.setLoopPlayback({
            on: 1,
            enabled: true,
            volumeDb: this.config.volumeDb,
            mute: this.config.muted ? 1 : 0,
            muted: this.config.muted,
            restart: 1,
            stopAtEnd: 0,
          })
          if (!this.config.enabled) {
            return
          }
          this.startedAtMs = performance.now()
          this.nativePosition = 0
          this.nativePositionAtMs = this.startedAtMs
          this.nativePlayheadKnown = true
          onStarted?.()
        } catch {
          onStarted?.()
        }
      })()
      return
    }
    if (!this.buffer) {
      onStarted?.()
      return
    }
    void this.ensureWebGraph().then(() => {
      if (!this.config.enabled) {
        return
      }
      this.startWebSource()
      onStarted?.()
    })
  }

  /** Keep a running loop untouched, but restart it if the native player silently stopped. */
  ensurePlaying(): void {
    if (!this.config.enabled || this.finishing) {
      return
    }
    if (isNativeSynth()) {
      if (!this.hasNativeAudio) {
        return
      }
      void DroneSynth.setLoopPlayback({
        on: 1,
        enabled: true,
        volumeDb: this.config.volumeDb,
        mute: this.config.muted ? 1 : 0,
        muted: this.config.muted,
        restart: 0,
        stopAtEnd: 0,
      }).catch(() => {})
      return
    }
    if (!this.source && this.buffer) {
      this.playFromStart()
    }
  }

  stopFromGesture(): void {
    this.config = { ...this.config, enabled: false }
    if (isNativeSynth()) {
      if (!this.hasNativeAudio) {
        return
      }
      this.finishing = true
      void DroneSynth.setLoopPlayback({
        on: 0,
        enabled: false,
        volumeDb: this.config.volumeDb,
        mute: this.config.muted ? 1 : 0,
        muted: this.config.muted,
        restart: 0,
        stopAtEnd: 1,
      }).catch(() => {})
      return
    }
    this.finishWebCycle()
  }

  stopNow(): void {
    this.config = { ...this.config, enabled: false }
    this.finishing = false
    this.cancelScheduledCycleStart()
    this.stopWebSource()
    this.startedAtMs = 0
    this.nativePosition = -1
    this.nativePlayheadKnown = false
    if (!isNativeSynth() || !this.hasNativeAudio) {
      return
    }
    void DroneSynth.setLoopPlayback({
      on: 0,
      enabled: false,
      volumeDb: this.config.volumeDb,
      mute: this.config.muted ? 1 : 0,
      muted: this.config.muted,
      restart: 0,
      stopAtEnd: 0,
    }).catch(() => {})
  }

  async setConfig(config: LoopConfig): Promise<void> {
    const wasEnabled = this.config.enabled
    this.config = config
    if (!config.enabled) {
      if (wasEnabled || this.isPlaying()) {
        this.stopFromGesture()
      }
      return
    }
    this.finishing = false
    this.applyGain()
    if (!this.hasAudio()) {
      return
    }
    if (!wasEnabled || !this.isPlaying()) {
      this.playFromStart()
    }
  }
}

export const loopEngine = new LoopEngine()
