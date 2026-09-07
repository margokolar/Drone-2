import { activateTransportMarker } from '../audio/presetNavigationTransport'
import { buildRuntimeConfigFromStore } from '../audio/runtimeConfigFromStore'
import { transportTogglePlay } from '../audio/transportControls'
import { isTransportMarkerKey } from '../presets/presetNavigation'
import type { ScribbleSlotEntry } from './scribbleSlotMap'
import { useDroneStore } from '../store/useDroneStore'

function loadSongIfNeeded(entry: ScribbleSlotEntry): boolean {
  const state = useDroneStore.getState()
  if (entry.songName === state.songName) {
    return true
  }
  const song = state.songLibrary.find((item) => item.name === entry.songName)
  if (!song) {
    return false
  }
  state.loadSongFromLibrary(song.id)
  return true
}

/** Load the song + preset or play/pause marker mapped to a Scribble slot (0–127). */
export function applyScribbleSlot(slot: number, slotMap: ScribbleSlotEntry[]): boolean {
  const entry = slotMap.find((item) => item.slot === slot)
  if (!entry) {
    return false
  }

  if (!loadSongIfNeeded(entry)) {
    return false
  }

  if (entry.kind === 'transport') {
    const state = useDroneStore.getState()
    const onMarker =
      state.songName === entry.songName &&
      state.activeNavigationKey === entry.markerId &&
      isTransportMarkerKey(entry.markerId, state.presetNavigation)

    if (onMarker) {
      transportTogglePlay(buildRuntimeConfigFromStore(state))
    } else {
      activateTransportMarker(entry.markerId)
    }
    return true
  }

  const state = useDroneStore.getState()
  const preset = state.presets.find((item) => item.name === entry.presetName)
  if (!preset) {
    return false
  }
  if (preset.id !== state.activePresetId) {
    state.loadPreset(preset.id)
  }
  return true
}
