const MIN_AUDIBLE_GAIN = 0.0001
const FADE_CURVE_STEPS = 64

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

export function scheduleSmoothFadeIn(
  param: AudioParam,
  targetGain: number,
  now: number,
  duration: number,
): void {
  param.cancelScheduledValues(now)
  if (duration <= 0) {
    param.setValueAtTime(Math.max(MIN_AUDIBLE_GAIN, targetGain), now)
    return
  }
  param.setValueAtTime(MIN_AUDIBLE_GAIN, now)
  param.setValueCurveAtTime(buildFadeInCurve(targetGain), now, duration)
}

export function scheduleSmoothFadeOut(
  param: AudioParam,
  now: number,
  duration: number,
): void {
  param.cancelScheduledValues(now)
  const start = Math.max(MIN_AUDIBLE_GAIN, param.value)
  if (duration <= 0) {
    param.setValueAtTime(MIN_AUDIBLE_GAIN, now)
    return
  }
  param.setValueAtTime(start, now)
  param.setValueCurveAtTime(buildFadeOutCurve(start), now, duration)
}

export { MIN_AUDIBLE_GAIN }
