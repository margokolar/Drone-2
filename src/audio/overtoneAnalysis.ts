type OvertoneAnalysisResult = {
  fundamentalHz: number
  gainsDb: number[]
  ratios: number[]
}

export type { OvertoneAnalysisResult }

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function integerizeAnalysisRatios(_ratios: number[], partialCount: number): number[] {
  return Array.from({ length: partialCount }, (_, index) => index + 1)
}

function isNearFrequency(hz: number, others: number[], toleranceRatio = 0.045): boolean {
  return others.some((other) => other > 0 && Math.abs(hz - other) / other < toleranceRatio)
}

export function estimateFundamentalHz(
  samples: Float32Array,
  sampleRate: number,
  minHz = 60,
  maxHz = 1200,
): number | null {
  const minLag = Math.floor(sampleRate / maxHz)
  const maxLag = Math.floor(sampleRate / minHz)
  if (samples.length <= maxLag + 2) {
    return null
  }

  const normalizedAutocorrelation = (lag: number): number => {
    let ac = 0
    let normA = 0
    let normB = 0
    const limit = samples.length - lag
    for (let i = 0; i < limit; i += 1) {
      const a = samples[i]
      const b = samples[i + lag]
      ac += a * b
      normA += a * a
      normB += b * b
    }
    if (normA <= 1e-12 || normB <= 1e-12) {
      return 0
    }
    return ac / Math.sqrt(normA * normB)
  }

  let bestLag = -1
  let bestScore = -Infinity

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    const normalized = normalizedAutocorrelation(lag)
    if (normalized > bestScore) {
      bestScore = normalized
      bestLag = lag
    }
  }

  if (bestLag <= 0 || bestScore < 0.1) {
    return null
  }

  // Parabolic interpolation around the autocorrelation peak for sub-sample lag
  // accuracy. This matters most at high fundamentals, where one sample of lag
  // error equals tens of cents.
  let refinedLag = bestLag
  if (bestLag > minLag && bestLag < maxLag) {
    const y0 = normalizedAutocorrelation(bestLag - 1)
    const y1 = bestScore
    const y2 = normalizedAutocorrelation(bestLag + 1)
    const denom = y0 - 2 * y1 + y2
    if (Math.abs(denom) > 1e-9) {
      const offset = Math.max(-1, Math.min(1, (0.5 * (y0 - y2)) / denom))
      refinedLag = bestLag + offset
    }
  }

  return sampleRate / refinedLag
}

export function goertzelMagnitude(
  samples: Float32Array,
  sampleRate: number,
  frequency: number,
): number {
  const omega = (2 * Math.PI * frequency) / sampleRate
  const coeff = 2 * Math.cos(omega)
  let q0 = 0
  let q1 = 0
  let q2 = 0

  for (let i = 0; i < samples.length; i += 1) {
    q0 = coeff * q1 - q2 + samples[i]
    q2 = q1
    q1 = q0
  }

  const real = q1 - q2 * Math.cos(omega)
  const imag = q2 * Math.sin(omega)
  return Math.sqrt(real * real + imag * imag) / samples.length
}

function buildAnalysisWindow(channelData: Float32Array): Float32Array {
  const desired = 16384
  const frameSize = Math.min(desired, channelData.length)
  const start = Math.max(0, Math.floor(channelData.length * 0.35) - Math.floor(frameSize / 2))
  const frame = channelData.subarray(start, start + frameSize)
  const windowed = new Float32Array(frame.length)
  const last = Math.max(1, frame.length - 1)
  for (let i = 0; i < frame.length; i += 1) {
    // Hann window to reduce spectral leakage.
    const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / last))
    windowed[i] = frame[i] * hann
  }
  return windowed
}

export async function analyzeWavOvertones(
  file: File,
  partialCount: number,
): Promise<OvertoneAnalysisResult> {
  const context = new AudioContext()
  try {
    const raw = await file.arrayBuffer()
    const decoded = await context.decodeAudioData(raw.slice(0))
    const channelData = decoded.getChannelData(0)
    const analysisSamples = buildAnalysisWindow(channelData)
    const fundamentalHz = estimateFundamentalHz(analysisSamples, decoded.sampleRate)
    if (!fundamentalHz) {
      throw new Error('Could not detect stable fundamental frequency.')
    }

    const gainsDb = new Array<number>(partialCount).fill(-48)
    const ratios = new Array<number>(partialCount).fill(1)
    const fundamentalMagnitude = Math.max(
      goertzelMagnitude(analysisSamples, decoded.sampleRate, fundamentalHz),
      1e-9,
    )

    const claimedPeakHz: number[] = []

    for (let index = 0; index < partialCount; index += 1) {
      const harmonic = index + 1
      const harmonicHz = fundamentalHz * harmonic
      if (harmonicHz >= decoded.sampleRate * 0.49) {
        gainsDb[index] = -48
        ratios[index] = harmonic
        continue
      }
      const minHz = harmonicHz * 0.85
      const maxHz = harmonicHz * 1.15
      let bestHz = harmonicHz
      let bestMag = -Infinity
      const scanSteps = 40
      for (let step = 0; step <= scanSteps; step += 1) {
        const hz = minHz + ((maxHz - minHz) * step) / scanSteps
        if (isNearFrequency(hz, claimedPeakHz)) {
          continue
        }
        const mag = goertzelMagnitude(analysisSamples, decoded.sampleRate, hz)
        if (mag > bestMag) {
          bestMag = mag
          bestHz = hz
        }
      }

      if (isNearFrequency(bestHz, claimedPeakHz)) {
        bestHz = harmonicHz
      }
      claimedPeakHz.push(bestHz)

      const magnitude = goertzelMagnitude(analysisSamples, decoded.sampleRate, harmonicHz)
      const relative = Math.max(magnitude / fundamentalMagnitude, 1e-9)
      gainsDb[index] = clamp(20 * Math.log10(relative), -48, 0)
      ratios[index] = clamp(bestHz / fundamentalHz, 0.125, 16)
    }

    return {
      fundamentalHz,
      gainsDb,
      ratios,
    }
  } finally {
    void context.close()
  }
}
