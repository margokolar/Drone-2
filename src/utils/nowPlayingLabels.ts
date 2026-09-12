import { isTransportMarkerKey, type PresetNavigationEntry } from '../presets/presetNavigation'
import type { Preset } from '../presets/defaultPresets'

export function nowPlayingLabels(state: {
  songName: string
  presets: Preset[]
  activePresetId: string
  activeNavigationKey: string
  presetNavigation: PresetNavigationEntry[]
}): { title: string; artist: string } {
  const artist = state.songName.trim() || 'Drone'
  if (isTransportMarkerKey(state.activeNavigationKey, state.presetNavigation)) {
    return { title: 'Play / Pause', artist }
  }
  const presetName = state.presets.find((preset) => preset.id === state.activePresetId)?.name.trim()
  return { title: presetName || 'Drone', artist }
}
