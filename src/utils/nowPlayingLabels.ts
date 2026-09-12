import {
  getEnabledNavigationEntries,
  isTransportMarkerKey,
  navigationEntryKey,
  type PresetNavigationEntry,
} from '../presets/presetNavigation'
import type { Preset } from '../presets/defaultPresets'

export const PLAY_PAUSE_SEQUENCE_LABEL = 'Play / Pause'

export type NowPlayingLabels = {
  title: string
  artist: string
  sequence: string[]
  activeIndex: number
}

export function nowPlayingSequence(state: {
  presets: Preset[]
  activeNavigationKey: string
  presetNavigation: PresetNavigationEntry[]
}): { sequence: string[]; activeIndex: number } {
  const sequence: string[] = []
  let activeIndex = -1
  const enabled = getEnabledNavigationEntries(state.presetNavigation, state.presets)
  for (const entry of enabled) {
    if (navigationEntryKey(entry) === state.activeNavigationKey) {
      activeIndex = sequence.length
    }
    if (entry.kind === 'transport') {
      sequence.push(PLAY_PAUSE_SEQUENCE_LABEL)
      continue
    }
    const preset = state.presets.find((item) => item.id === entry.presetId)
    sequence.push(preset?.name.trim() || 'Preset')
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
    return { title: PLAY_PAUSE_SEQUENCE_LABEL, artist, sequence, activeIndex }
  }
  const presetName = state.presets.find((preset) => preset.id === state.activePresetId)?.name.trim()
  return { title: presetName || 'Drone', artist, sequence, activeIndex }
}

export function windowedSlice<T>(
  items: T[],
  activeIndex: number,
  maxRows: number,
): { items: T[]; activeIndex: number; start: number } {
  if (items.length <= maxRows) {
    return { items, activeIndex, start: 0 }
  }
  let start = Math.max(0, activeIndex - Math.floor(maxRows / 2))
  const end = Math.min(items.length, start + maxRows)
  start = Math.max(0, end - maxRows)
  return {
    items: items.slice(start, end),
    activeIndex: activeIndex - start,
    start,
  }
}

export function windowedNowPlayingSequence(
  sequence: string[],
  activeIndex: number,
  maxRows: number,
): { items: string[]; activeIndex: number; start: number } {
  return windowedSlice(sequence, activeIndex, maxRows)
}
