import type { ScribbleSlotEntry } from './scribbleSlotMap'
import { useDroneStore } from '../store/useDroneStore'

/** Load the song + preset mapped to a Scribble slot (0–127). */
export function applyScribbleSlot(slot: number, slotMap: ScribbleSlotEntry[]): boolean {
  const entry = slotMap.find((item) => item.slot === slot)
  if (!entry) {
    return false
  }

  let state = useDroneStore.getState()
  if (entry.songName !== state.songName) {
    const song = state.songLibrary.find((item) => item.name === entry.songName)
    if (!song) {
      return false
    }
    state.loadSongFromLibrary(song.id)
    state = useDroneStore.getState()
  }

  const preset = state.presets.find((item) => item.name === entry.presetName)
  if (!preset) {
    return false
  }
  if (preset.id !== state.activePresetId) {
    state.loadPreset(preset.id)
  }
  return true
}
