import {
  dbToGain,
  morphFromBlend,
  normalizedBlend,
  partialBrightnessGain,
  partialTimbreWeights,
  waveformGainCompensation,
} from './audioMath'
import { getFrequency } from '../music/tuning'
import type { NativeDroneOsc } from '../native/droneSynth'
import type { DroneRuntimeConfig, EntryGlideParams, ToneConfig } from './types'

const DEFAULT_ENTRY_GLIDE: EntryGlideParams = {
  cents: 0,
  seconds: 2,
}

function entryGlide(config: DroneRuntimeConfig, tone: ToneConfig): EntryGlideParams | null {
  if (config.lowestToneGlideNoteId && config.lowestToneGlideNoteId === tone.noteId) {
    return config.lowestToneGlide ?? DEFAULT_ENTRY_GLIDE
  }
  if (config.highestToneGlideNoteId && config.highestToneGlideNoteId === tone.noteId) {
    return config.highestToneGlide ?? DEFAULT_ENTRY_GLIDE
  }
  return null
}

export function nativeOscillatorsFromConfig(config: DroneRuntimeConfig): NativeDroneOsc[] {
  const out: NativeDroneOsc[] = []
  for (const tone of config.tones) {
    if (!tone.enabled) continue
    const blend = normalizedBlend(tone.timbreBlend ?? config.timbreBlend)
    const morph = morphFromBlend(blend.sine, blend.saw, blend.square)
    const toneGain = dbToGain(tone.gainDb)
    const toneFrequency =
      getFrequency(
        tone.noteId,
        config.tuningSystemId,
        config.tonalCenter,
        config.referenceA4Hz,
        config.baseOctave,
      ) * 2 ** (tone.detuneCents / 1200)
    const glide = entryGlide(config, tone)
    const activePartials = (tone.partials ?? config.partials).filter((partial) => partial.enabled)
    for (let partialIndex = 0; partialIndex < activePartials.length; partialIndex += 1) {
      const partial = activePartials[partialIndex]
      const ratio = Math.max(0.0625, partial.ratio)
      const partialLinear = dbToGain(partial.gainDb)
      const harmonicIndex = partialIndex + 1
      const timbreWeights = partialTimbreWeights(harmonicIndex, blend, config.harmonicTimbreEnabled)
      const brightness = partialBrightnessGain(harmonicIndex, morph)
      const gain =
        toneGain *
        partialLinear *
        brightness *
        (timbreWeights.sine * waveformGainCompensation('sine') +
          timbreWeights.saw * waveformGainCompensation('sawtooth') +
          timbreWeights.square * waveformGainCompensation('square'))
      if (gain < 0.0002) continue
      const freq = Math.max(1, toneFrequency * ratio)
      const osc: NativeDroneOsc = {
        id: `${tone.noteId}:${partial.id}:sine`,
        freq,
        gain,
        pan: tone.pan,
        wave: 0,
      }
      if (glide && glide.cents !== 0 && glide.seconds > 0) {
        const centRatio = 2 ** (Math.abs(glide.cents) / 1200)
        osc.glideFrom = Math.max(1, glide.cents > 0 ? freq * centRatio : freq / centRatio)
        osc.glideSeconds = glide.seconds
      }
      out.push(osc)
    }
  }
  return out
}
