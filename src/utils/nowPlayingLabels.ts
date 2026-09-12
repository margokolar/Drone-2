import {
  isNavigationEnabled,
  isTransportMarkerKey,
  type PresetNavigationEntry,
} from '../presets/presetNavigation'
import type { Preset } from '../presets/defaultPresets'

export type NowPlayingLabels = {
  title: string
  artist: string
  sequence: string[]
  activeIndex: number
}

export function nowPlayingSequence(state: {
  presets: Preset[]
  activePresetId: string
  presetNavigation: PresetNavigationEntry[]
}): { sequence: string[]; activeIndex: number } {
  const sequence: string[] = []
  let activeIndex = -1
  for (const entry of state.presetNavigation) {
    if (entry.kind !== 'preset') {
      continue
    }
    const preset = state.presets.find((item) => item.id === entry.presetId)
    if (!preset || !isNavigationEnabled(preset)) {
      continue
    }
    if (preset.id === state.activePresetId) {
      activeIndex = sequence.length
    }
    sequence.push(preset.name.trim() || 'Preset')
  }
  return { sequence, activeIndex }
}

export function nowPlayingLabels(state: {
  songName: string
  presets: Preset[]
  activePresetId: string
  activeNavigationKey: string
  presetNavigation: PresetNavigationEntry[]
}): NowPlayingLabels {
  const artist = state.songName.trim() || 'Drone'
  const { sequence, activeIndex } = nowPlayingSequence(state)
  if (isTransportMarkerKey(state.activeNavigationKey, state.presetNavigation)) {
    return { title: 'Play / Pause', artist, sequence, activeIndex }
  }
  const presetName = state.presets.find((preset) => preset.id === state.activePresetId)?.name.trim()
  return { title: presetName || 'Drone', artist, sequence, activeIndex }
}
