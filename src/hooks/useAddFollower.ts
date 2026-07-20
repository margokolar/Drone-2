import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { addEngine, DEFAULT_ADD_OUTPUT_GAIN_DB } from '../audio/AddEngine'
import { trackLivePitch } from '../audio/livePitch'
import { dbToGain } from '../audio/audioMath'
import {
  claimMixableAudioSession,
  setIosAudioSessionType,
} from '../audio/iosAudioSession'
import {
  applyHarmonicMultiplier,
  DEFAULT_ADD_HARMONIC_RATIO,
} from '../music/harmonicSeries'
import { AudioSession } from '../native/audioSession'

/**
 * iOS Safari does not route Web Audio (`AudioContext`) output to Bluetooth
 * during microphone capture — it keeps it on the phone receiver. Playing
 * inaudible audio through an `<audio>` element activates iOS's media audio
 * route (like a native media app), which routes output to the connected
 * Bluetooth speaker. The AudioContext shares that output route.
 */
function createSilentRouteAudioUrl(): string {
  const sampleRate = 44100
  const seconds = 2
  const numSamples = sampleRate * seconds
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, numSamples * 2, true)
  // Very low-amplitude sine (~-50 dBFS) so iOS sees a real signal to route;
  // the element volume is set near zero, so it is inaudible.
  for (let i = 0; i < numSamples; i += 1) {
    const sample = Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 100
    view.setInt16(44 + i * 2, sample, true)
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
}

const ANALYSIS_FFT_SIZE = 8192
const DISPLAY_UPDATE_MS = 80
const MAX_MISSED_PITCH_FRAMES = 3

const GATE_HYSTERESIS_RATIO = 0.11

export const DEFAULT_ADD_GATE_THRESHOLD = 0.018
export const MIN_ADD_GATE_THRESHOLD = 0.004
export const MAX_ADD_GATE_THRESHOLD = 0.06

function gateCloseThreshold(openThreshold: number): number {
  return Math.max(MIN_ADD_GATE_THRESHOLD * 0.5, openThreshold * (1 - GATE_HYSTERESIS_RATIO))
}

export {
  ADD_HARMONIC_OPTIONS as ADD_INTERVAL_OPTIONS,
  ADD_HARMONIC_COLUMNS,
  ADD_OVERTONE_OPTIONS,
  ADD_SUBHARMONIC_OPTIONS,
} from '../music/harmonicSeries'

export const DEFAULT_ADD_INPUT_GAIN_DB = 0
export const MIN_ADD_INPUT_GAIN_DB = -12
export const MAX_ADD_INPUT_GAIN_DB = 24
export const MIN_ADD_OUTPUT_GAIN_DB = -40
export const MAX_ADD_OUTPUT_GAIN_DB = 0

export type AddFollowerState = {
  listening: boolean
  harmonicRatio: number
  inputGainDb: number
  outputGainDb: number
  gateThresholdRms: number
  detectedHz: number | null
  outputHz: number | null
  micError: string | null
  clearMicError: () => void
  setHarmonicRatio: (ratio: number) => void
  setInputGainDb: (gainDb: number) => void
  setOutputGainDb: (gainDb: number) => void
  setGateThresholdRms: (threshold: number) => void
  startListening: () => void
  stopListening: () => void
}

export function useAddFollower(): AddFollowerState {
  const [listening, setListening] = useState(false)
  const [harmonicRatio, setHarmonicRatioState] = useState(DEFAULT_ADD_HARMONIC_RATIO)
  const [inputGainDb, setInputGainDbState] = useState(DEFAULT_ADD_INPUT_GAIN_DB)
  const [outputGainDb, setOutputGainDbState] = useState(DEFAULT_ADD_OUTPUT_GAIN_DB)
  const [gateThresholdRms, setGateThresholdRmsState] = useState(DEFAULT_ADD_GATE_THRESHOLD)
  const [detectedHz, setDetectedHz] = useState<number | null>(null)
  const [outputHz, setOutputHz] = useState<number | null>(null)
  const [micError, setMicError] = useState<string | null>(null)

  const mediaStreamRef = useRef<MediaStream | null>(null)
  const silentRouteRef = useRef<HTMLAudioElement | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const micInputGainRef = useRef<GainNode | null>(null)
  const samplesRef = useRef<Float32Array | null>(null)
  const rafRef = useRef<number | null>(null)
  const smoothedPitchRef = useRef<number | null>(null)
  const harmonicRatioRef = useRef(harmonicRatio)
  const gateThresholdRef = useRef(gateThresholdRms)
  const signalOpenRef = useRef(false)
  const missedPitchFramesRef = useRef(0)
  const lastDisplayUpdateRef = useRef(0)

  harmonicRatioRef.current = harmonicRatio
  gateThresholdRef.current = gateThresholdRms

  const releaseOutput = useCallback(() => {
    smoothedPitchRef.current = null
    signalOpenRef.current = false
    missedPitchFramesRef.current = 0
    addEngine.cutVoice()
    setOutputHz(null)
    setDetectedHz(null)
  }, [])

  const stopListening = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (silentRouteRef.current) {
      silentRouteRef.current.pause()
    }
    analyserRef.current?.disconnect()
    analyserRef.current = null
    micInputGainRef.current?.disconnect()
    micInputGainRef.current = null
    micSourceRef.current?.disconnect()
    micSourceRef.current = null
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
    samplesRef.current = null
    releaseOutput()
    // Kick iOS out of play-and-record, then restore playback (+ native mix).
    setIosAudioSessionType('playback')
    setIosAudioSessionType('auto')
    claimMixableAudioSession()
    if (Capacitor.isNativePlatform()) {
      void AudioSession.configurePlayback().catch(() => {})
    }
    setListening(false)
  }, [releaseOutput])

  const analyzeFrame = useCallback(() => {
    const analyser = analyserRef.current
    const samples = samplesRef.current
    if (!analyser || !samples) {
      return
    }

    analyser.getFloatTimeDomainData(samples as Float32Array<ArrayBuffer>)

    let sumSquares = 0
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index] ?? 0
      sumSquares += sample * sample
    }
    const rms = Math.sqrt(sumSquares / samples.length)
    const openThreshold = gateThresholdRef.current
    const closeThreshold = gateCloseThreshold(openThreshold)

    if (signalOpenRef.current) {
      if (rms < closeThreshold) {
        releaseOutput()
        return
      }
    } else if (rms < openThreshold) {
      return
    }

    const sampleRate = addEngine.getContext()?.sampleRate ?? 44100
    const trackedHz = trackLivePitch(samples, sampleRate, smoothedPitchRef.current, {
      holdPitchWhenMissing: true,
    })
    if (!trackedHz) {
      missedPitchFramesRef.current += 1
      if (
        signalOpenRef.current &&
        smoothedPitchRef.current &&
        missedPitchFramesRef.current <= MAX_MISSED_PITCH_FRAMES
      ) {
        return
      }
      if (signalOpenRef.current || addEngine.isVoiceActive()) {
        releaseOutput()
      }
      return
    }

    missedPitchFramesRef.current = 0

    signalOpenRef.current = true

    smoothedPitchRef.current = trackedHz
    const targetHz = applyHarmonicMultiplier(trackedHz, harmonicRatioRef.current)

    if (addEngine.isVoiceActive()) {
      addEngine.setTargetFrequency(targetHz)
    } else {
      addEngine.startVoice(targetHz)
    }

    const now = performance.now()
    if (now - lastDisplayUpdateRef.current >= DISPLAY_UPDATE_MS) {
      lastDisplayUpdateRef.current = now
      setDetectedHz(trackedHz)
      setOutputHz(targetHz)
    }
  }, [releaseOutput])

  const analyzeFrameRef = useRef(analyzeFrame)
  analyzeFrameRef.current = analyzeFrame

  const startListening = useCallback(async () => {
    if (listening) {
      return
    }
    setMicError(null)

    try {
      // Activate iOS media audio routing synchronously in the user gesture so
      // output goes to the Bluetooth speaker (not the phone receiver) during
      // mic capture. Web Audio alone does not trigger this route.
      if (!silentRouteRef.current) {
        const el = new Audio(createSilentRouteAudioUrl())
        el.loop = true
        el.volume = 0.01
        silentRouteRef.current = el
      }
      void silentRouteRef.current.play().catch(() => {
        // Autoplay can reject if activation was lost; the AudioContext resume
        // below is the fallback for the actual drone output.
      })

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Mikrofon vajab turvalist ühendust (HTTPS). Ava leht https:// aadressilt ' +
            '(nt Vercel) või localhost — HTTP LAN-aadressil ei luba brauser mikrofoni.',
        )
      }

      // Reset to `auto` (capture-compatible) before getUserMedia. Setting
      // play-and-record BEFORE capture starts makes iOS sometimes pick the
      // wrong mic/route (see WebKit bug 282939) — the reliable order is:
      // auto -> getUserMedia -> play-and-record.
      setIosAudioSessionType('auto')

      // Get the mic stream first. On iOS the audio session category is chosen
      // when the AudioContext is resumed, and it only becomes "play and record"
      // if a live MediaStream input is already connected by then. So: create
      // the context (suspended), attach the mic input, THEN resume. Resuming
      // before the input is attached locks the session to "playback" and
      // createMediaStreamSource throws "AudioSession category is not
      // compatible with audio capture" (InvalidStateError).
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })

      // Lock the session to play-and-record after capture starts. iOS cannot
      // route Web Audio output to an A2DP Bluetooth speaker during capture
      // (no allowBluetoothA2DP in the web API), but in play-and-record the
      // user can manually re-route output via Control Center if the speaker
      // supports the hands-free (HFP) profile.
      setIosAudioSessionType('play-and-record')
      if (Capacitor.isNativePlatform()) {
        void AudioSession.configurePlayAndRecord().catch(() => {})
      }

      const audioContext = addEngine.ensureContext()
      const source = audioContext.createMediaStreamSource(stream)
      const inputGain = audioContext.createGain()
      inputGain.gain.value = dbToGain(inputGainDb)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = ANALYSIS_FFT_SIZE
      analyser.smoothingTimeConstant = 0
      source.connect(inputGain)
      inputGain.connect(analyser)

      // Resume now that the mic input is attached — iOS selects "play and
      // record" for the session.
      await addEngine.resume()
      addEngine.setOutputGainDb(outputGainDb)

      mediaStreamRef.current = stream
      micSourceRef.current = source
      micInputGainRef.current = inputGain
      analyserRef.current = analyser
      samplesRef.current = new Float32Array(analyser.fftSize)
      smoothedPitchRef.current = null
      signalOpenRef.current = false
      missedPitchFramesRef.current = 0
      lastDisplayUpdateRef.current = 0

      setListening(true)

      const tick = () => {
        analyzeFrameRef.current()
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (error) {
      stopListening()
      // Tear down any half-created / session-locked AudioContext so the next
      // attempt starts fresh (a context that resumed in "playback" mode stays
      // locked and would keep rejecting capture).
      addEngine.dispose()
      const baseMessage = error instanceof Error ? error.message : 'Microphone access failed.'
      const errorName = error instanceof Error && error.name ? ` [${error.name}]` : ''
      const message = `${baseMessage}${errorName}`
      setMicError(message)
    }
  }, [inputGainDb, listening, outputGainDb, stopListening])

  useEffect(() => {
    addEngine.setOutputGainDb(outputGainDb)
  }, [outputGainDb])

  useEffect(() => {
    const inputGain = micInputGainRef.current
    const context = addEngine.getContext()
    if (!inputGain || !context) {
      return
    }
    inputGain.gain.setTargetAtTime(dbToGain(inputGainDb), context.currentTime, 0.015)
  }, [inputGainDb])

  useEffect(() => {
    return () => {
      stopListening()
      addEngine.dispose()
    }
  }, [stopListening])

  const setHarmonicRatio = useCallback((ratio: number) => {
    harmonicRatioRef.current = ratio
    setHarmonicRatioState(ratio)

    const heldHz = smoothedPitchRef.current
    if (!heldHz || !addEngine.isVoiceActive()) {
      return
    }

    const targetHz = applyHarmonicMultiplier(heldHz, ratio)
    addEngine.setTargetFrequency(targetHz)
    setOutputHz(targetHz)
  }, [])

  const setInputGainDb = useCallback((gainDb: number) => {
    setInputGainDbState(gainDb)
  }, [])

  const clearMicError = useCallback(() => {
    setMicError(null)
  }, [])

  const setOutputGainDb = useCallback((gainDb: number) => {
    setOutputGainDbState(gainDb)
  }, [])

  const setGateThresholdRms = useCallback((threshold: number) => {
    gateThresholdRef.current = threshold
    setGateThresholdRmsState(threshold)
  }, [])

  return {
    listening,
    harmonicRatio,
    inputGainDb,
    outputGainDb,
    gateThresholdRms,
    detectedHz,
    outputHz,
    micError,
    clearMicError,
    setHarmonicRatio,
    setInputGainDb,
    setOutputGainDb,
    setGateThresholdRms,
    startListening,
    stopListening,
  }
}
