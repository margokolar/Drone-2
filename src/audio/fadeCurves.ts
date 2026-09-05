import { Capacitor } from '@capacitor/core'

const MIN_AUDIBLE_GAIN = 0.0001
const FADE_CURVE_STEPS = 64

/**
 * WKWebView (Capacitor iOS) is unreliable with setValueCurveAtTime: it can throw
 * NotSupportedError or leave AudioParam.value stuck near 0, which makes preset
 * crossfades sound like a full stop. Prefer linear/exponential ramps there.
 */
export function shouldAvoidValueCurves(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function buildFadeInCurve(targetGain: number): Float32Array {
  const curve = new Float32Array(FADE_CURVE_STEPS)
  const target = Math.max(MIN_AUDIBLE_GAIN, targetGain)
  for (let index = 0; index < FADE_CURVE_STEPS; index += 1) {
    const progress = index / (FADE_CURVE_STEPS - 1)
    const shaped = Math.sin((progress * Math.PI) / 2)
    curve[index] = Math.max(MIN_AUDIBLE_GAIN, target * shaped)
  }
  return curve
}

export function buildFadeOutCurve(startGain: number): Float32Array {
  const curve = new Float32Array(FADE_CURVE_STEPS)
  const start = Math.max(MIN_AUDIBLE_GAIN, startGain)
  for (let index = 0; index < FADE_CURVE_STEPS; index += 1) {
    const progress = index / (FADE_CURVE_STEPS - 1)
    const shaped = Math.cos((progress * Math.PI) / 2)
    curve[index] = Math.max(MIN_AUDIBLE_GAIN, start * shaped)
  }
  return curve
}

function buildCrossfadeCurve(startGain: number, targetGain: number): Float32Array {
  const curve = new Float32Array(FADE_CURVE_STEPS)
  const start = Math.max(MIN_AUDIBLE_GAIN, startGain)
  const target = Math.max(MIN_AUDIBLE_GAIN, targetGain)
  for (let index = 0; index < FADE_CURVE_STEPS; index += 1) {
    const progress = index / (FADE_CURVE_STEPS - 1)
    const shaped = (1 - Math.cos((progress * Math.PI) / 2)) / 2
    curve[index] = Math.max(MIN_AUDIBLE_GAIN, start * (1 - shaped) + target * shaped)
  }
  return curve
}

function rampLinear(
  param: AudioParam,
  start: number,
  target: number,
  now: number,
  duration: number,
): void {
  param.setValueAtTime(start, now)
  if (duration <= 0) {
    param.setValueAtTime(target, now)
    return
  }
  param.linearRampToValueAtTime(target, now + duration)
}

export function scheduleSmoothFadeIn(
  param: AudioParam,
  targetGain: number,
  now: number,
  duration: number,
): void {
  const target = Math.max(MIN_AUDIBLE_GAIN, targetGain)
  param.cancelScheduledValues(now)
  if (duration <= 0) {
    param.setValueAtTime(target, now)
    return
  }
  if (shouldAvoidValueCurves()) {
    rampLinear(param, MIN_AUDIBLE_GAIN, target, now, duration)
    return
  }
  try {
    param.setValueAtTime(MIN_AUDIBLE_GAIN, now)
    param.setValueCurveAtTime(buildFadeInCurve(target), now, duration)
  } catch {
    rampLinear(param, MIN_AUDIBLE_GAIN, target, now, duration)
  }
}

export function scheduleSmoothFadeOut(
  param: AudioParam,
  now: number,
  duration: number,
  startGain = param.value,
): void {
  const start = Math.max(MIN_AUDIBLE_GAIN, startGain)
  param.cancelScheduledValues(now)
  if (duration <= 0) {
    param.setValueAtTime(MIN_AUDIBLE_GAIN, now)
    return
  }
  if (shouldAvoidValueCurves()) {
    rampLinear(param, start, MIN_AUDIBLE_GAIN, now, duration)
    return
  }
  try {
    param.setValueAtTime(start, now)
    param.setValueCurveAtTime(buildFadeOutCurve(start), now, duration)
  } catch {
    rampLinear(param, start, MIN_AUDIBLE_GAIN, now, duration)
  }
}

/** Smooth gain move that keeps continuity from an explicit start (or param.value). */
export function scheduleSmoothGainCrossfade(
  param: AudioParam,
  targetGain: number,
  now: number,
  duration: number,
  startGain = param.value,
): void {
  const start = Math.max(MIN_AUDIBLE_GAIN, startGain)
  const target = Math.max(MIN_AUDIBLE_GAIN, targetGain)
  param.cancelScheduledValues(now)
  if (duration <= 0 || Math.abs(Math.log(start / target)) < 0.001) {
    param.setValueAtTime(target, now)
    return
  }
  if (shouldAvoidValueCurves() || duration <= 0.03) {
    rampLinear(param, start, target, now, duration)
    return
  }
  try {
    param.setValueAtTime(start, now)
    param.setValueCurveAtTime(buildCrossfadeCurve(start, target), now, duration)
  } catch {
    rampLinear(param, start, target, now, duration)
  }
}

export { MIN_AUDIBLE_GAIN }
