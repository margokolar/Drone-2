import { estimateFundamentalHz, goertzelMagnitude } from './overtoneAnalysis'

const DEFAULT_MIN_HZ = 260
const DEFAULT_MAX_HZ = 660
const HARMONIC_PARTIALS = 8
const COARSE_STEP_HZ = 3
const REFINE_STEP_HZ = 0.25
const REFINE_RADIUS_HZ = 4
const TRACK_BAND_CENTS = 45
const TRACK_STEP_CENTS = 4
const STABLE_DEADBAND_CENTS = 12
const MAX_TRACK_JUMP_CENTS = 55
const MIN_HARMONIC_SCORE = -28
// Fundamentals carry the perceptual pitch and are usually the spectral peak on
// bright high tones; weighting them at least as much as the overtones reduces
// octave-down locking.
const FUNDAMENTAL_WEIGHT = 1
// Among candidates whose comb scores are within this margin (in comb-score
// "dB"), prefer the lowest frequency. The true fundamental is the lowest
// candidate whose overtones all align, while an overtone candidate (e.g. 2x)
// only has a subset of partials aligning — so preferring the lower near-tie
// counters overtone locking.
const FUNDAMENTAL_PREFERENCE_MARGIN = 1.0
// When tracking, keep the prior note if its local score is within this bias
// (comb "dB") of the global re-acquisition score. Prevents jitter between
// close notes while still allowing a clear move to a new note.
const TRACK_STICKY_BIAS = 2.0

function applyHannWindow(samples: Float32Array): Float32Array {
  const windowed = new Float32Array(samples.length)
  const last = Math.max(1, samples.length - 1)
  for (let index = 0; index < samples.length; index += 1) {
    const hann = 0.5 * (1 - Math.cos((2 * Math.PI * index) / last))
    windowed[index] = (samples[index] ?? 0) * hann
  }
  return windowed
}

function centsBetween(aHz: number, bHz: number): number {
  return 1200 * Math.log2(aHz / bHz)
}

function hzOffsetCents(baseHz: number, cents: number): number {
  return baseHz * 2 ** (cents / 1200)
}

function clampHz(hz: number, minHz: number, maxHz: number): number {
  return Math.min(maxHz, Math.max(minHz, hz))
}

/** Score how well upper partials align at integer multiples of a candidate fundamental. */
function harmonicCombScore(
  samples: Float32Array,
  sampleRate: number,
  fundamentalHz: number,
): number {
  if (!Number.isFinite(fundamentalHz) || fundamentalHz <= 0) {
    return Number.NEGATIVE_INFINITY
  }

  let score = 0
  let terms = 0
  const nyquist = sampleRate * 0.48

  for (let harmonic = 1; harmonic <= HARMONIC_PARTIALS; harmonic += 1) {
    const harmonicHz = fundamentalHz * harmonic
    if (harmonicHz >= nyquist) {
      break
    }

    const magnitude = goertzelMagnitude(samples, sampleRate, harmonicHz)
    const weight = harmonic === 1 ? FUNDAMENTAL_WEIGHT : 1
    score += weight * Math.log(magnitude + 1e-9)
    terms += weight
  }

  if (terms <= 0) {
    return Number.NEGATIVE_INFINITY
  }

  return score / terms
}

function refineCandidateHz(
  samples: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
  centerHz: number,
): number {
  let bestHz = centerHz
  let bestScore = harmonicCombScore(samples, sampleRate, centerHz)

  for (
    let candidateHz = centerHz - REFINE_RADIUS_HZ;
    candidateHz <= centerHz + REFINE_RADIUS_HZ;
    candidateHz += REFINE_STEP_HZ
  ) {
    const clampedHz = clampHz(candidateHz, minHz, maxHz)
    const score = harmonicCombScore(samples, sampleRate, clampedHz)
    if (score > bestScore) {
      bestScore = score
      bestHz = clampedHz
    }
  }

  return bestHz
}

type ScoredCandidate = { hz: number; score: number }

function bestScoredCandidate(
  samples: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
  candidates: number[],
): ScoredCandidate | null {
  const scored: ScoredCandidate[] = []
  for (const candidateHz of candidates) {
    const clampedHz = clampHz(candidateHz, minHz, maxHz)
    scored.push({ hz: clampedHz, score: harmonicCombScore(samples, sampleRate, clampedHz) })
  }
  if (scored.length === 0) {
    return null
  }

  let best = scored[0]
  for (const candidate of scored) {
    if (candidate.score > best.score) {
      best = candidate
    }
  }
  if (best.score < MIN_HARMONIC_SCORE) {
    return null
  }

  // Fundamental preference: among near-ties, prefer the lowest candidate so we
  // lock onto the true fundamental rather than a strong overtone.
  let chosen = best
  for (const candidate of scored) {
    if (candidate.score >= best.score - FUNDAMENTAL_PREFERENCE_MARGIN && candidate.hz < chosen.hz) {
      chosen = candidate
    }
  }
  return chosen
}

function collectInitialCandidates(
  minHz: number,
  maxHz: number,
  seedHz: number | null,
): number[] {
  const candidates = new Set<number>()

  for (let hz = minHz; hz <= maxHz; hz += COARSE_STEP_HZ) {
    candidates.add(hz)
  }

  if (seedHz !== null) {
    for (const factor of [0.5, 1, 2]) {
      candidates.add(clampHz(seedHz * factor, minHz, maxHz))
    }
  }

  return [...candidates]
}

function collectTrackedCandidates(
  priorHz: number,
  minHz: number,
  maxHz: number,
): number[] {
  const candidates = new Set<number>([priorHz])

  for (
    let cents = -TRACK_BAND_CENTS;
    cents <= TRACK_BAND_CENTS;
    cents += TRACK_STEP_CENTS
  ) {
    candidates.add(clampHz(hzOffsetCents(priorHz, cents), minHz, maxHz))
  }

  return [...candidates]
}

function estimateInitialScored(
  samples: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
): ScoredCandidate | null {
  const seedHz = estimateFundamentalHz(samples, sampleRate, minHz, maxHz)
  const candidates = collectInitialCandidates(minHz, maxHz, seedHz)
  return bestScoredCandidate(samples, sampleRate, minHz, maxHz, candidates)
}

function estimateInitialFundamentalHz(
  samples: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
): number | null {
  const chosen = estimateInitialScored(samples, sampleRate, minHz, maxHz)
  if (chosen) {
    return refineCandidateHz(samples, sampleRate, minHz, maxHz, chosen.hz)
  }
  const seedHz = estimateFundamentalHz(samples, sampleRate, minHz, maxHz)
  return seedHz
}

function estimateTrackedFundamentalHz(
  samples: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
  priorHz: number,
): number | null {
  // Local tracking around the prior note (handles vibrato / small drift).
  const trackedCandidates = collectTrackedCandidates(priorHz, minHz, maxHz)
  const tracked = bestScoredCandidate(samples, sampleRate, minHz, maxHz, trackedCandidates)

  // Full-range re-acquisition so a move to a new note is detected even when it
  // is far from the prior (the local band would otherwise miss it and the
  // tracker would get stuck on the old pitch).
  const global = estimateInitialScored(samples, sampleRate, minHz, maxHz)

  if (tracked && global) {
    // Sticky: keep the prior note if its local score is close to the global
    // best; otherwise the signal clearly moved — follow the global result.
    const winner = tracked.score >= global.score - TRACK_STICKY_BIAS ? tracked : global
    return refineCandidateHz(samples, sampleRate, minHz, maxHz, winner.hz)
  }
  if (tracked) {
    return refineCandidateHz(samples, sampleRate, minHz, maxHz, tracked.hz)
  }
  if (global) {
    return refineCandidateHz(samples, sampleRate, minHz, maxHz, global.hz)
  }
  return priorHz
}

function smoothPitchLog(prevHz: number, nextHz: number, alpha: number): number {
  const logPrev = Math.log2(prevHz)
  const logNext = Math.log2(nextHz)
  return 2 ** (logPrev + alpha * (logNext - logPrev))
}

function stabilizeAgainstPrior(prevHz: number, nextHz: number): number {
  const jumpCents = Math.abs(centsBetween(nextHz, prevHz))
  if (jumpCents <= STABLE_DEADBAND_CENTS) {
    return prevHz
  }

  const alpha = jumpCents < 25 ? 0.1 : jumpCents < MAX_TRACK_JUMP_CENTS ? 0.18 : 0.35
  return smoothPitchLog(prevHz, nextHz, alpha)
}

export function trackLivePitch(
  samples: Float32Array,
  sampleRate: number,
  priorHz: number | null,
  options?: {
    minHz?: number
    maxHz?: number
    holdPitchWhenMissing?: boolean
  },
): number | null {
  const minHz = options?.minHz ?? DEFAULT_MIN_HZ
  const maxHz = options?.maxHz ?? DEFAULT_MAX_HZ

  const windowed = applyHannWindow(samples)

  if (priorHz === null) {
    return estimateInitialFundamentalHz(windowed, sampleRate, minHz, maxHz)
  }

  const measuredHz = estimateTrackedFundamentalHz(windowed, sampleRate, minHz, maxHz, priorHz)
  if (!measuredHz) {
    return options?.holdPitchWhenMissing ? priorHz : null
  }

  return stabilizeAgainstPrior(priorHz, measuredHz)
}
