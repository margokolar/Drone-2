/** Natural harmonic-series partial multipliers relative to the heard fundamental. */
export type AddHarmonicOption = {
  harmonic: number
  ratio: number
  label: string
}

const SUBHARMONIC_DENOMINATORS = [2, 3, 4, 5, 6, 7, 8] as const
const OVERTONE_HARMONICS = [2, 3, 4, 5, 6, 7, 8] as const

const SUBHARMONIC_LABELS: Record<(typeof SUBHARMONIC_DENOMINATORS)[number], string> = {
  2: '½',
  3: '⅓',
  4: '¼',
  5: '⅕',
  6: '⅙',
  7: '⅐',
  8: '⅛',
}

export const ADD_SUBHARMONIC_OPTIONS: readonly AddHarmonicOption[] = SUBHARMONIC_DENOMINATORS.map(
  (denominator) => ({
    harmonic: -denominator,
    ratio: 1 / denominator,
    label: SUBHARMONIC_LABELS[denominator],
  }),
)

export const ADD_OVERTONE_OPTIONS: readonly AddHarmonicOption[] = [
  { harmonic: 1, ratio: 1, label: '1' },
  ...OVERTONE_HARMONICS.map((harmonic) => ({
    harmonic,
    ratio: harmonic,
    label: `${harmonic}`,
  })),
]

export const ADD_HARMONIC_COLUMNS: readonly {
  harmonic: number
  overtone: AddHarmonicOption
  subharmonic: AddHarmonicOption | null
}[] = [1, 2, 3, 4, 5, 6, 7, 8].map((harmonic) => ({
  harmonic,
  overtone: {
    harmonic,
    ratio: harmonic,
    label: `${harmonic}`,
  },
  subharmonic:
    harmonic === 1
      ? null
      : {
          harmonic: -harmonic,
          ratio: 1 / harmonic,
          label: SUBHARMONIC_LABELS[harmonic as (typeof SUBHARMONIC_DENOMINATORS)[number]],
        },
}))

export const ADD_HARMONIC_OPTIONS: readonly AddHarmonicOption[] = [
  ...ADD_SUBHARMONIC_OPTIONS,
  ...ADD_OVERTONE_OPTIONS,
] as const

export const DEFAULT_ADD_HARMONIC_RATIO = 1

export function applyHarmonicMultiplier(heardHz: number, harmonicRatio: number): number {
  return heardHz * harmonicRatio
}
