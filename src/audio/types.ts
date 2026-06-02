import type { NoteId, TonalCenter } from '../music/notes'
import type { TuningSystemId } from '../music/tuning'

export type TimbreBlend = {
  sine: number
  saw: number
  square: number
}

export type PartialConfig = {
  id: string
  ratio: number
  gainDb: number
  enabled: boolean
}

export type ToneConfig = {
  noteId: NoteId
  enabled: boolean
  gainDb: number
  pan: number
  detuneCents: number
  partials?: PartialConfig[]
  timbreBlend?: TimbreBlend
}

export type DroneRuntimeConfig = {
  referenceA4Hz: number
  baseOctave: number
  tuningSystemId: TuningSystemId
  tonalCenter: TonalCenter
  masterGainDb: number
  timbreBlend: TimbreBlend
  harmonicTimbreEnabled: boolean
  tones: ToneConfig[]
  partials: PartialConfig[]
  /** Enabled tone with the lowest pitch; gets an entry glide when its voice starts. */
  lowestToneGlideNoteId?: NoteId | null
  /** Enabled tone with the highest pitch; rises into tune when its voice starts. */
  highestToneGlideNoteId?: NoteId | null
}
