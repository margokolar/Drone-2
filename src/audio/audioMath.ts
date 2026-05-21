export function dbToGain(db: number): number {
  return 10 ** (db / 20)
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min
  }
  if (value > max) {
    return max
  }
  return value
}

export function normalizedBlend(blend: {
  sine: number
  saw: number
  square: number
}): { sine: number; saw: number; square: number } {
  const sum = Math.max(0, blend.sine) + Math.max(0, blend.saw) + Math.max(0, blend.square)
  if (sum <= 0) {
    return { sine: 1, saw: 0, square: 0 }
  }
  return {
    sine: Math.max(0, blend.sine) / sum,
    saw: Math.max(0, blend.saw) / sum,
    square: Math.max(0, blend.square) / sum,
  }
}

/** Per-partial timbre weights matching the overtone graph (Fourier series rolloff). */
export function harmonicTimbreWeights(
  harmonicIndex: number,
  blend: { sine: number; saw: number; square: number },
): { sine: number; saw: number; square: number } {
  if (harmonicIndex < 1) {
    return { sine: 0, saw: 0, square: 0 }
  }
  return {
    sine: blend.sine,
    saw: blend.saw / harmonicIndex,
    square: harmonicIndex % 2 === 1 ? blend.square / harmonicIndex : 0,
  }
}

export function partialTimbreWeights(
  harmonicIndex: number,
  blend: { sine: number; saw: number; square: number },
  harmonicTimbreEnabled: boolean,
): { sine: number; saw: number; square: number } {
  if (!harmonicTimbreEnabled) {
    return {
      sine: blend.sine,
      saw: blend.saw,
      square: blend.square,
    }
  }
  return harmonicTimbreWeights(harmonicIndex, blend)
}
