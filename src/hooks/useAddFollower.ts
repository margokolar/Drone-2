import { useCallback, useEffect, useRef, useState } from 'react'
import { addEngine, DEFAULT_ADD_OUTPUT_GAIN_DB } from '../audio/AddEngine'
import { trackLivePitch } from '../audio/livePitch'
import { dbToGain } from '../audio/audioMath'
import {
  applyHarmonicMultiplier,
  DEFAULT_ADD_HARMONIC_RATIO,
} from '../music/harmonicSeries'

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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      await addEngine.resume()
      addEngine.setOutputGainDb(outputGainDb)
      const audioContext = addEngine.ensureContext()
      const source = audioContext.createMediaStreamSource(stream)
      const inputGain = audioContext.createGain()
      inputGain.gain.value = dbToGain(inputGainDb)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = ANALYSIS_FFT_SIZE
      analyser.smoothingTimeConstant = 0
      source.connect(inputGain)
      inputGain.connect(analyser)

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
      const message = error instanceof Error ? error.message : 'Microphone access failed.'
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
    setHarmonicRatio,
    setInputGainDb,
    setOutputGainDb,
    setGateThresholdRms,
    startListening,
    stopListening,
  }
}
