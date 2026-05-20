import type { PartialConfig, ToneConfig, TimbreBlend } from '../audio/types'
import type { TonalCenter } from '../music/notes'
import type { TuningSystemId } from '../music/tuning'

export type Preset = {
  id: string
  name: string
  tuningSystemId: TuningSystemId
  tonalCenter: TonalCenter
  baseOctave: number
  masterGainDb: number
  tones: ToneConfig[]
  partials: PartialConfig[]
  timbreBlend: TimbreBlend
}

export function createDefaultPartials(): PartialConfig[] {
  const partials: PartialConfig[] = []
  for (let harmonic = 1; harmonic <= 16; harmonic += 1) {
    const gainDb = -8 - harmonic * 2
    partials.push({
      id: `p${harmonic}`,
      ratio: harmonic,
      gainDb,
      enabled: harmonic <= 10,
    })
  }
  return partials
}

const TONES_TEMPLATE: ToneConfig[] = [
  { noteId: 'c', enabled: false, gainDb: -12, pan: 0 },
  { noteId: 'd', enabled: false, gainDb: -12, pan: 0 },
  { noteId: 'e', enabled: false, gainDb: -12, pan: 0 },
  { noteId: 'f', enabled: false, gainDb: -12, pan: 0 },
  { noteId: 'fis', enabled: false, gainDb: -12, pan: 0 },
  { noteId: 'g', enabled: false, gainDb: -12, pan: 0 },
  { noteId: 'a', enabled: false, gainDb: -12, pan: 0 },
  { noteId: 'h', enabled: false, gainDb: -12, pan: 0 },
  { noteId: 'c1', enabled: false, gainDb: -18, pan: 0 },
  { noteId: 'd1', enabled: false, gainDb: -18, pan: 0 },
  { noteId: 'e1', enabled: false, gainDb: -18, pan: 0 },
  { noteId: 'f1', enabled: false, gainDb: -18, pan: 0 },
  { noteId: 'fis1', enabled: false, gainDb: -18, pan: 0 },
  { noteId: 'g1', enabled: false, gainDb: -18, pan: 0 },
  { noteId: 'a1', enabled: false, gainDb: -18, pan: 0 },
  { noteId: 'h1', enabled: false, gainDb: -18, pan: 0 },
]

function withEnabledTones(noteIds: string[]): ToneConfig[] {
  return TONES_TEMPLATE.map((tone) => ({
    ...tone,
    enabled: noteIds.includes(tone.noteId),
    partials: clonePartials(),
  }))
}

function clonePartials(): PartialConfig[] {
  return createDefaultPartials().map((partial) => ({ ...partial }))
}

const BASE_TIMBRE: TimbreBlend = {
  sine: 0.55,
  saw: 0.35,
  square: 0.1,
}

function makePreset(
  id: string,
  name: string,
  center: TonalCenter,
  toneIds: string[],
): Preset {
  return {
    id,
    name,
    tuningSystemId: 'just',
    tonalCenter: center,
    baseOctave: 3,
    masterGainDb: -10,
    tones: withEnabledTones(toneIds),
    partials: clonePartials(),
    timbreBlend: { ...BASE_TIMBRE },
  }
}

export const DEFAULT_PRESETS: Preset[] = [
  makePreset('preset-natural-d', 'Kohandatud D', 'd', ['d', 'd1', 'a']),
  makePreset('preset-natural-e', 'Kohandatud E', 'e', ['e', 'h', 'e1']),
  makePreset('preset-natural-g', 'Kohandatud G', 'g', ['g', 'd', 'g1']),
  makePreset('preset-natural-a', 'Kohandatud A', 'a', ['a', 'e', 'a1']),
]
