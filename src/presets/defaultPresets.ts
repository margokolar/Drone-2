import type { PartialConfig, ToneConfig, TimbreBlend } from '../audio/types'
import type { NoteId } from '../music/notes'
import type { TonalCenter } from '../music/notes'
import type { TuningSystemId } from '../music/tuning'

export const DEFAULT_MASTER_GAIN_DB = -10
export const DEFAULT_METRONOME_BPM = 72
export const DEFAULT_METRONOME_VOLUME_DB = -15
export const DEFAULT_TONE_PAN = 0
export const DEFAULT_TONE_DETUNE_CENTS = 0
export const MIN_TONE_DETUNE_CENTS = -100
export const MAX_TONE_DETUNE_CENTS = 100
export const DEFAULT_TIMBRE_BLEND: TimbreBlend = {
  sine: 0.55,
  saw: 0.35,
  square: 0.1,
}

export function defaultPartialRatio(harmonicIndex: number): number {
  return harmonicIndex
}

export function defaultPartialGainDb(harmonicIndex: number): number {
  return -8 - harmonicIndex * 2
}

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
    partials.push({
      id: `p${harmonic}`,
      ratio: defaultPartialRatio(harmonic),
      gainDb: defaultPartialGainDb(harmonic),
      enabled: harmonic <= 10,
    })
  }
  return partials
}

const TONES_TEMPLATE: ToneConfig[] = [
  { noteId: 'g0', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'gis0', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'a0', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'b0', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'h0', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'c', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'cis', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'd', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'dis', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'e', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'f', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'fis', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'g', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'gis', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'a', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'b', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'h', enabled: false, gainDb: -12, pan: 0, detuneCents: 0 },
  { noteId: 'c1', enabled: false, gainDb: -18, pan: 0, detuneCents: 0 },
  { noteId: 'cis1', enabled: false, gainDb: -18, pan: 0, detuneCents: 0 },
  { noteId: 'd1', enabled: false, gainDb: -18, pan: 0, detuneCents: 0 },
  { noteId: 'dis1', enabled: false, gainDb: -18, pan: 0, detuneCents: 0 },
  { noteId: 'e1', enabled: false, gainDb: -18, pan: 0, detuneCents: 0 },
  { noteId: 'f1', enabled: false, gainDb: -18, pan: 0, detuneCents: 0 },
  { noteId: 'fis1', enabled: false, gainDb: -18, pan: 0, detuneCents: 0 },
  { noteId: 'g1', enabled: false, gainDb: -18, pan: 0, detuneCents: 0 },
  { noteId: 'gis1', enabled: false, gainDb: -18, pan: 0, detuneCents: 0 },
  { noteId: 'a1', enabled: false, gainDb: -18, pan: 0, detuneCents: 0 },
  { noteId: 'b1', enabled: false, gainDb: -18, pan: 0, detuneCents: 0 },
  { noteId: 'h1', enabled: false, gainDb: -18, pan: 0, detuneCents: 0 },
  { noteId: 'c2', enabled: false, gainDb: -20, pan: 0, detuneCents: 0 },
  { noteId: 'cis2', enabled: false, gainDb: -20, pan: 0, detuneCents: 0 },
  { noteId: 'd2', enabled: false, gainDb: -20, pan: 0, detuneCents: 0 },
]

export function defaultToneGainDb(noteId: NoteId): number {
  const tone = TONES_TEMPLATE.find((item) => item.noteId === noteId)
  return tone?.gainDb ?? -12
}

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

const BASE_TIMBRE: TimbreBlend = { ...DEFAULT_TIMBRE_BLEND }

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
    masterGainDb: DEFAULT_MASTER_GAIN_DB,
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
