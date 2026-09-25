import { dbToGain, morphFromBlend, normalizedBlend, partialBrightnessGain } from './audioMath'
import { getFrequency } from '../music/tuning'
import type { NativeDroneOsc } from '../native/droneSynth'
import type { DroneRuntimeConfig, EntryGlideParams, ToneConfig, WavetableCoeffs } from './types'
import { cloneWavetable, packWavetables, scaleWavetableByPartials } from './wavetable'

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

function attachGlide(
  osc: NativeDroneOsc,
  glide: EntryGlideParams | null,
  freq: number,
): NativeDroneOsc {
  if (glide && glide.cents !== 0 && glide.seconds > 0) {
    const centRatio = 2 ** (Math.abs(glide.cents) / 1200)
    osc.glideFrom = Math.max(1, glide.cents > 0 ? freq * centRatio : freq / centRatio)
    osc.glideSeconds = glide.seconds
  }
  return osc
}

export function nativeWavetablesFromConfig(config: DroneRuntimeConfig): Record<string, WavetableCoeffs> {
  const tables: Record<string, WavetableCoeffs> = {}
  for (const tone of config.tones) {
    if (!tone.enabled || !tone.wavetable) continue
    const partials = tone.partials ?? config.partials
    if (!partials.some((partial) => partial.enabled)) continue
    const blend = normalizedBlend(tone.timbreBlend ?? config.timbreBlend)
    const morph = morphFromBlend(blend.sine, blend.saw, blend.square)
    const scaled = scaleWavetableByPartials(tone.wavetable, partials, morph)
    tables[tone.noteId] = scaled
  }
  return tables
}

export function packNativeWavetables(config: DroneRuntimeConfig): string {
  return packWavetables(nativeWavetablesFromConfig(config))
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
    const partials = tone.partials ?? config.partials
    const wavetable = cloneWavetable(tone.wavetable)
    if (wavetable) {
      if (!partials.some((partial) => partial.enabled)) continue
      const freq = Math.max(1, toneFrequency)
      const osc = attachGlide(
        {
          id: `${tone.noteId}:wavetable`,
          freq,
          gain: toneGain,
          pan: tone.pan,
          wave: 3,
          tableId: tone.noteId,
        },
        glide,
        freq,
      )
      out.push(osc)
      continue
    }
    const activePartials = partials.filter((partial) => partial.enabled)
    for (let partialIndex = 0; partialIndex < activePartials.length; partialIndex += 1) {
      const partial = activePartials[partialIndex]
      const ratio = Math.max(0.0625, partial.ratio)
      const brightness = partialBrightnessGain(partialIndex + 1, morph)
      const freq = Math.max(1, toneFrequency * ratio)
      const gain = toneGain * dbToGain(partial.gainDb) * brightness
      if (gain < 0.0002) continue
      out.push(
        attachGlide(
          {
            id: `${tone.noteId}:${partial.id}:sine`,
            freq,
            gain,
            pan: tone.pan,
            wave: 0,
          },
          glide,
          freq,
        ),
      )
    }
  }
  return out
}
