import { dbToGain, partialBrightnessGain } from './audioMath'
import type { PartialConfig, ResidualNoise, WavetableCoeffs } from './types'

export const WAVETABLE_SIZE = 2048
export const WAVETABLE_MAX_HARMONICS = 64
export const RESIDUAL_NOISE_MAKEUP = 1
export const RESIDUAL_MIN_GAIN = 0.008

function interpolateCycle(samples: ArrayLike<number>, index: number): number {
  const length = samples.length
  if (length === 0) {
    return 0
  }
  const wrapped = ((index % length) + length) % length
  const i0 = Math.floor(wrapped)
  const frac = wrapped - i0
  const s0 = samples[i0] ?? 0
  const s1 = samples[(i0 + 1) % length] ?? 0
  return s0 + (s1 - s0) * frac
}

function interpolateLinear(samples: ArrayLike<number>, index: number): number {
  if (samples.length === 0) {
    return 0
  }
  const last = samples.length - 1
  if (index <= 0) {
    return samples[0] ?? 0
  }
  if (index >= last) {
    return samples[last] ?? 0
  }
  const i0 = Math.floor(index)
  const frac = index - i0
  const s0 = samples[i0] ?? 0
  const s1 = samples[i0 + 1] ?? 0
  return s0 + (s1 - s0) * frac
}

function averagePeriod(
  samples: ArrayLike<number>,
  sampleRate: number,
  fundamentalHz: number,
): Float64Array {
  const period = sampleRate / Math.max(1, fundamentalHz)
  const start = Math.floor(samples.length * 0.35)
  const end = Math.min(samples.length - 2, Math.floor(samples.length * 0.72))
  const span = Math.max(0, end - start)
  const periodCount = Math.max(1, Math.floor(span / period) - 1)
  const table = new Float64Array(WAVETABLE_SIZE)
  for (let periodIndex = 0; periodIndex < periodCount; periodIndex += 1) {
    const origin = start + periodIndex * period
    for (let i = 0; i < WAVETABLE_SIZE; i += 1) {
      table[i] += interpolateLinear(samples, origin + (i / WAVETABLE_SIZE) * period)
    }
  }
  const scale = 1 / periodCount
  let mean = 0
  for (let i = 0; i < WAVETABLE_SIZE; i += 1) {
    table[i] *= scale
    mean += table[i]
  }
  mean /= WAVETABLE_SIZE
  for (let i = 0; i < WAVETABLE_SIZE; i += 1) {
    table[i] -= mean
  }
  return table
}

/** Cosine (real) / sine (imag) terms for one cycle, matching PeriodicWave. */
export function dftWavetableCoeffs(period: ArrayLike<number>, harmonicCount: number): WavetableCoeffs {
  const length = period.length
  const real = new Array<number>(harmonicCount + 1).fill(0)
  const imag = new Array<number>(harmonicCount + 1).fill(0)
  if (length < 2) {
    return { real, imag }
  }
  const twoOverN = 2 / length
  for (let harmonic = 1; harmonic <= harmonicCount; harmonic += 1) {
    const step = (2 * Math.PI * harmonic) / length
    let cosine = 0
    let sine = 0
    for (let n = 0; n < length; n += 1) {
      const angle = n * step
      const sample = period[n] ?? 0
      cosine += sample * Math.cos(angle)
      sine += sample * Math.sin(angle)
    }
    real[harmonic] = cosine * twoOverN
    imag[harmonic] = sine * twoOverN
  }
  return { real, imag }
}

function peakNormalize(wave: WavetableCoeffs, tableSize = WAVETABLE_SIZE): WavetableCoeffs {
  const real = wave.real.slice()
  const imag = wave.imag.slice()
  let peak = 0
  const last = Math.max(1, real.length - 1)
  for (let i = 0; i < tableSize; i += 1) {
    const phase = (2 * Math.PI * i) / tableSize
    let sample = 0
    for (let harmonic = 1; harmonic <= last; harmonic += 1) {
      const angle = harmonic * phase
      sample += (real[harmonic] ?? 0) * Math.cos(angle) + (imag[harmonic] ?? 0) * Math.sin(angle)
    }
    peak = Math.max(peak, Math.abs(sample))
  }
  if (peak > 1e-9) {
    const scale = 0.9 / peak
    for (let i = 0; i < real.length; i += 1) {
      real[i] *= scale
      imag[i] *= scale
    }
  }
  return { real, imag }
}

function reconstructPeriod(wave: WavetableCoeffs, tableSize = WAVETABLE_SIZE): Float64Array {
  const table = new Float64Array(tableSize)
  const last = Math.max(1, Math.min(wave.real.length, wave.imag.length) - 1)
  for (let i = 0; i < tableSize; i += 1) {
    const phase = (2 * Math.PI * i) / tableSize
    let sample = 0
    for (let harmonic = 1; harmonic <= last; harmonic += 1) {
      const angle = harmonic * phase
      sample += (wave.real[harmonic] ?? 0) * Math.cos(angle) + (wave.imag[harmonic] ?? 0) * Math.sin(angle)
    }
    table[i] = sample
  }
  return table
}

function goertzelEnergy(samples: ArrayLike<number>, sampleRate: number, frequency: number): number {
  const omega = (2 * Math.PI * frequency) / sampleRate
  const coeff = 2 * Math.cos(omega)
  let q0 = 0
  let q1 = 0
  let q2 = 0
  const length = samples.length
  for (let i = 0; i < length; i += 1) {
    q0 = coeff * q1 - q2 + (samples[i] ?? 0)
    q2 = q1
    q1 = q0
  }
  const real = q1 - q2 * Math.cos(omega)
  const imag = q2 * Math.sin(omega)
  const mag = Math.hypot(real, imag) / Math.max(1, length)
  return mag * mag
}

function residualSpectrum(
  samples: ArrayLike<number>,
  sampleRate: number,
  minHz: number,
  maxHz: number,
): { centerHz: number; q: number } {
  const bands = 24
  let weighted = 0
  let weightedSq = 0
  let total = 0
  const span = Math.max(minHz * 1.01, maxHz)
  for (let i = 0; i < bands; i += 1) {
    const t = i / Math.max(1, bands - 1)
    const hz = minHz * (span / minHz) ** t
    const energy = goertzelEnergy(samples, sampleRate, hz)
    weighted += hz * energy
    weightedSq += hz * hz * energy
    total += energy
  }
  if (total < 1e-18) {
    return { centerHz: Math.min(3500, span), q: 0.7 }
  }
  const centerHz = weighted / total
  const variance = Math.max(0, weightedSq / total - centerHz * centerHz)
  const spread = Math.sqrt(variance)
  const q = centerHz / Math.max(2 * spread, 1)
  return {
    centerHz: Math.max(minHz, Math.min(span, centerHz)),
    q: Math.max(0.45, Math.min(1.6, q)),
  }
}

function extractResidualNoise(
  samples: ArrayLike<number>,
  sampleRate: number,
  fundamentalHz: number,
  wave: WavetableCoeffs,
): ResidualNoise | undefined {
  const cycle = reconstructPeriod(wave)
  const periodSamples = sampleRate / Math.max(1, fundamentalHz)
  const start = Math.floor(samples.length * 0.35)
  const end = Math.min(samples.length - 2, Math.floor(samples.length * 0.72))
  if (end - start < periodSamples * 2) {
    return undefined
  }
  const hpCutoff = Math.max(700, Math.min(2200, fundamentalHz * 6))
  const hpCoeff = 1 / (2 * Math.PI * hpCutoff)
  const dt = 1 / sampleRate
  const hpAlpha = hpCoeff / (hpCoeff + dt)
  const residualLength = Math.min(8192, end - start)
  const stride = Math.max(1, Math.floor((end - start) / residualLength))
  const residual = new Float32Array(Math.ceil((end - start) / stride))
  let prevX = 0
  let prevY = 0
  let resEnergy = 0
  let toneEnergy = 0
  let residualIndex = 0
  for (let i = start; i < end; i += 1) {
    const rec = interpolateCycle(cycle, ((i - start) / periodSamples) * WAVETABLE_SIZE)
    const leftover = (samples[i] ?? 0) - rec
    const highpassed = hpAlpha * (prevY + leftover - prevX)
    prevX = leftover
    prevY = highpassed
    resEnergy += highpassed * highpassed
    toneEnergy += rec * rec
    if ((i - start) % stride === 0 && residualIndex < residual.length) {
      residual[residualIndex] = highpassed
      residualIndex += 1
    }
  }
  const gain = Math.sqrt(resEnergy / Math.max(toneEnergy, 1e-12))
  if (!Number.isFinite(gain) || gain < RESIDUAL_MIN_GAIN) {
    return undefined
  }
  const maxHz = Math.min(sampleRate * 0.45, 10000)
  const spectrum = residualSpectrum(residual.subarray(0, residualIndex), sampleRate, hpCutoff, maxHz)
  return {
    gain: Math.min(0.4, gain),
    centerHz: spectrum.centerHz,
    q: spectrum.q,
  }
}

export function normalizeResidual(residual?: ResidualNoise | null): ResidualNoise | undefined {
  if (!residual) {
    return undefined
  }
  const gain = Number(residual.gain)
  const centerHz = Number(residual.centerHz)
  const q = Number(residual.q)
  if (!Number.isFinite(gain) || !Number.isFinite(centerHz) || !Number.isFinite(q) || gain < RESIDUAL_MIN_GAIN) {
    return undefined
  }
  return {
    gain: Math.max(0, Math.min(0.4, gain)),
    centerHz: Math.max(180, Math.min(12000, centerHz)),
    q: Math.max(0.35, Math.min(2.2, q)),
  }
}

/** 0 = pehme / no air … 0.5 = analyzed amount … 1 = särav / more air. */
export function residualMorphAmount(morph: number): number {
  const t = Math.max(0, Math.min(1, morph))
  if (t <= 0.5) {
    return t / 0.5
  }
  return 1 + (t - 0.5) * 0.7
}

export function residualPlaybackGain(residual?: ResidualNoise | null, morph = 0.5): number {
  const normalized = normalizeResidual(residual)
  if (!normalized) {
    return 0
  }
  return Math.min(0.28, normalized.gain * RESIDUAL_NOISE_MAKEUP * residualMorphAmount(morph))
}

export function residualCenterForMorph(centerHz: number, morph: number): number {
  const tilt = 0.72 + Math.max(0, Math.min(1, morph)) * 0.56
  return Math.max(180, Math.min(12000, centerHz * tilt))
}

export function extractWavetableFromSamples(
  samples: ArrayLike<number>,
  sampleRate: number,
  fundamentalHz: number,
): WavetableCoeffs | null {
  if (samples.length < (2 * sampleRate) / Math.max(fundamentalHz, 1)) {
    return null
  }
  const period = averagePeriod(samples, sampleRate, fundamentalHz)
  let energy = 0
  for (let i = 0; i < period.length; i += 1) {
    energy += period[i] * period[i]
  }
  if (energy < 1e-12) {
    return null
  }
  const nyquistHarmonics = Math.floor((sampleRate * 0.49) / Math.max(1, fundamentalHz))
  const harmonicCount = Math.max(1, Math.min(WAVETABLE_MAX_HARMONICS, nyquistHarmonics))
  const coeffs = dftWavetableCoeffs(period, harmonicCount)
  const residual = extractResidualNoise(samples, sampleRate, fundamentalHz, coeffs)
  const wave = peakNormalize(coeffs)
  return residual ? { ...wave, residual } : wave
}

export function normalizeWavetable(wave?: WavetableCoeffs | null): WavetableCoeffs | undefined {
  if (!wave || !Array.isArray(wave.real) || !Array.isArray(wave.imag)) {
    return undefined
  }
  const length = Math.min(wave.real.length, wave.imag.length, WAVETABLE_MAX_HARMONICS + 1)
  if (length < 2) {
    return undefined
  }
  const real = new Array<number>(length).fill(0)
  const imag = new Array<number>(length).fill(0)
  let energy = 0
  for (let i = 0; i < length; i += 1) {
    const nextReal = Number.isFinite(wave.real[i]) ? (wave.real[i] as number) : 0
    const nextImag = Number.isFinite(wave.imag[i]) ? (wave.imag[i] as number) : 0
    real[i] = nextReal
    imag[i] = nextImag
    if (i > 0) {
      energy += nextReal * nextReal + nextImag * nextImag
    }
  }
  if (energy < 1e-16) {
    return undefined
  }
  real[0] = 0
  imag[0] = 0
  const residual = normalizeResidual(wave.residual)
  return residual ? { real, imag, residual } : { real, imag }
}

export function cloneWavetable(wave?: WavetableCoeffs | null): WavetableCoeffs | undefined {
  const normalized = normalizeWavetable(wave)
  if (!normalized) {
    return undefined
  }
  return normalized.residual
    ? {
        real: normalized.real.slice(),
        imag: normalized.imag.slice(),
        residual: { ...normalized.residual },
      }
    : { real: normalized.real.slice(), imag: normalized.imag.slice() }
}

export function cloneWavetableWithoutResidual(wave?: WavetableCoeffs | null): WavetableCoeffs | undefined {
  const cloned = cloneWavetable(wave)
  if (!cloned) {
    return undefined
  }
  return { real: cloned.real, imag: cloned.imag }
}

export function sameWavetable(a?: WavetableCoeffs | null, b?: WavetableCoeffs | null): boolean {
  const left = normalizeWavetable(a)
  const right = normalizeWavetable(b)
  if (!left && !right) {
    return true
  }
  if (!left || !right || left.real.length !== right.real.length) {
    return false
  }
  for (let i = 0; i < left.real.length; i += 1) {
    if (Math.abs((left.real[i] ?? 0) - (right.real[i] ?? 0)) > 1e-7) {
      return false
    }
    if (Math.abs((left.imag[i] ?? 0) - (right.imag[i] ?? 0)) > 1e-7) {
      return false
    }
  }
  const leftResidual = left.residual
  const rightResidual = right.residual
  if (!leftResidual && !rightResidual) {
    return true
  }
  if (!leftResidual || !rightResidual) {
    return false
  }
  return (
    Math.abs(leftResidual.gain - rightResidual.gain) < 1e-6 &&
    Math.abs(leftResidual.centerHz - rightResidual.centerHz) < 0.5 &&
    Math.abs(leftResidual.q - rightResidual.q) < 1e-4
  )
}

export function harmonicMagnitudesDb(wave: WavetableCoeffs, count: number): number[] {
  const fund = Math.hypot(wave.real[1] ?? 0, wave.imag[1] ?? 0)
  const reference = Math.max(fund, 1e-9)
  const gains = new Array<number>(count).fill(-48)
  for (let i = 0; i < count; i += 1) {
    const harmonic = i + 1
    const magnitude = Math.hypot(wave.real[harmonic] ?? 0, wave.imag[harmonic] ?? 0)
    gains[i] = Math.max(-48, Math.min(0, 20 * Math.log10(Math.max(magnitude / reference, 1e-9))))
  }
  return gains
}

export function scaleWavetableByPartials(
  wave: WavetableCoeffs,
  partials: PartialConfig[],
  morph = 0.5,
): WavetableCoeffs {
  const real = wave.real.slice()
  const imag = wave.imag.slice()
  // Peak-normalize keeps a rich table quiet; lift H1 to amplitude 1 like a 0 dB sine.
  const fundMag = Math.max(Math.hypot(real[1] ?? 0, imag[1] ?? 0), 1e-9)
  const unity = 1 / fundMag
  for (let harmonic = 1; harmonic < real.length; harmonic += 1) {
    real[harmonic] = (real[harmonic] ?? 0) * unity
    imag[harmonic] = (imag[harmonic] ?? 0) * unity
  }
  const limit = Math.min(partials.length, real.length - 1)
  for (let index = 0; index < limit; index += 1) {
    const harmonic = index + 1
    const partial = partials[index]
    if (!partial?.enabled) {
      real[harmonic] = 0
      imag[harmonic] = 0
      continue
    }
    const target = dbToGain(partial.gainDb)
    const current = Math.hypot(real[harmonic] ?? 0, imag[harmonic] ?? 0)
    if (current < 1e-12) {
      real[harmonic] = target
      imag[harmonic] = 0
      continue
    }
    const scale = target / current
    real[harmonic] = (real[harmonic] ?? 0) * scale
    imag[harmonic] = (imag[harmonic] ?? 0) * scale
  }
  for (let harmonic = 1; harmonic < real.length; harmonic += 1) {
    const brightness = partialBrightnessGain(harmonic, morph)
    if (brightness === 1) {
      continue
    }
    real[harmonic] = (real[harmonic] ?? 0) * brightness
    imag[harmonic] = (imag[harmonic] ?? 0) * brightness
  }
  const residual = normalizeResidual(wave.residual)
  return residual ? { real, imag, residual } : { real, imag }
}

export function bandLimitedWavetable(
  wave: WavetableCoeffs,
  frequencyHz: number,
  sampleRate: number,
): WavetableCoeffs {
  const maxHarmonic = Math.max(1, Math.floor((sampleRate * 0.49) / Math.max(1, frequencyHz)))
  const length = Math.min(wave.real.length, maxHarmonic + 1)
  return {
    real: wave.real.slice(0, length),
    imag: wave.imag.slice(0, length),
  }
}

export function wavetableToPeriodicWave(
  context: BaseAudioContext,
  wave: WavetableCoeffs,
  frequencyHz: number,
): PeriodicWave {
  const limited = bandLimitedWavetable(wave, frequencyHz, context.sampleRate)
  const length = Math.max(2, limited.real.length)
  const real = new Float32Array(length)
  const imag = new Float32Array(length)
  for (let i = 0; i < length; i += 1) {
    real[i] = limited.real[i] ?? 0
    imag[i] = limited.imag[i] ?? 0
  }
  real[0] = 0
  imag[0] = 0
  return context.createPeriodicWave(real, imag, { disableNormalization: true })
}

export function packWavetables(tables: Record<string, WavetableCoeffs>): string {
  const format = (value: number): string => {
    const rounded = Math.round(value * 1e6) / 1e6
    return Object.is(rounded, -0) ? '0' : String(rounded)
  }
  return Object.entries(tables)
    .map(([id, wave]) => {
      const length = Math.min(wave.real.length, wave.imag.length)
      const real = wave.real.slice(0, length).map(format).join(',')
      const imag = wave.imag.slice(0, length).map(format).join(',')
      return `${id}\t${real}\t${imag}`
    })
    .join('\n')
}
