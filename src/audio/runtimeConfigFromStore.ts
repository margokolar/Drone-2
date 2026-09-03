import { findHighestEnabledToneNoteId, findLowestEnabledToneNoteId } from '../music/tuning'
import type { PartialConfig, ToneConfig, TimbreBlend } from './types'
import type { DroneRuntimeConfig } from './types'
import type { TonalCenter } from '../music/notes'
import type { TuningSystemId } from '../music/tuning'

type RuntimeStoreSnapshot = {
  referenceA4Hz: number
  baseOctave: number
  tuningSystemId: TuningSystemId
  tonalCenter: TonalCenter
  masterGainDb: number
  timbreBlend: TimbreBlend
  harmonicTimbreEnabled: boolean
  entryGlideEnabled: boolean
  entryGlideLowestCents: number
  entryGlideLowestSeconds: number
  entryGlideHighestCents: number
  entryGlideHighestSeconds: number
  playbackFadeInSeconds: number
  playbackFadeOutSeconds: number
  playbackFadeEnabled: boolean
  presetCrossfadeSeconds: number
  tones: ToneConfig[]
  partials: PartialConfig[]
}

export function buildRuntimeConfigFromStore(state: RuntimeStoreSnapshot): DroneRuntimeConfig {
  const lowestToneGlideNoteId = state.entryGlideEnabled
    ? findLowestEnabledToneNoteId(
        state.tones,
        state.tuningSystemId,
        state.tonalCenter,
        state.referenceA4Hz,
        state.baseOctave,
      )
    : null
  const highestToneGlideNoteId = state.entryGlideEnabled
    ? findHighestEnabledToneNoteId(
        state.tones,
        state.tuningSystemId,
        state.tonalCenter,
        state.referenceA4Hz,
        state.baseOctave,
      )
    : null

  return {
    referenceA4Hz: state.referenceA4Hz,
    baseOctave: state.baseOctave,
    tuningSystemId: state.tuningSystemId,
    tonalCenter: state.tonalCenter,
    masterGainDb: state.masterGainDb,
    timbreBlend: state.timbreBlend,
    harmonicTimbreEnabled: state.harmonicTimbreEnabled,
    tones: state.tones,
    partials: state.partials,
    lowestToneGlideNoteId,
    highestToneGlideNoteId,
    lowestToneGlide: state.entryGlideEnabled
      ? {
          cents: state.entryGlideLowestCents,
          seconds: state.entryGlideLowestSeconds,
        }
      : null,
    highestToneGlide: state.entryGlideEnabled
      ? {
          cents: state.entryGlideHighestCents,
          seconds: state.entryGlideHighestSeconds,
        }
      : null,
    playbackFadeInSeconds: state.playbackFadeEnabled ? state.playbackFadeInSeconds : 0,
    playbackFadeOutSeconds: state.playbackFadeEnabled ? state.playbackFadeOutSeconds : 0,
    presetCrossfadeSeconds: state.playbackFadeEnabled ? state.presetCrossfadeSeconds : 0,
  }
}
