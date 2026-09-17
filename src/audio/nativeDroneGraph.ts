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

const WAVES: { id: 'sine' | 'saw' | 'square'; wave: 0 | 1 | 2; type: OscillatorType }[] = [
  { id: 'sine', wave: 0, type: 'sine' },
  { id: 'saw', wave: 1, type: 'sawtooth' },
  { id: 'square', wave: 2, type: 'square' },
]

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
      const freq = Math.max(1, toneFrequency * ratio)
      for (const spec of WAVES) {
        const amount = timbreWeights[spec.id]
        if (amount <= 0) continue
        const gain =
          toneGain * partialLinear * brightness * amount * waveformGainCompensation(spec.type)
        if (gain < 0.0002) continue
        const osc: NativeDroneOsc = {
          id: `${tone.noteId}:${partial.id}:${spec.id}`,
          freq,
          gain,
          pan: tone.pan,
          wave: spec.wave,
        }
        if (glide && glide.cents !== 0 && glide.seconds > 0) {
          const centRatio = 2 ** (Math.abs(glide.cents) / 1200)
          osc.glideFrom = Math.max(1, glide.cents > 0 ? freq * centRatio : freq / centRatio)
          osc.glideSeconds = glide.seconds
        }
        out.push(osc)
      }
    }
  }
  return out
}
