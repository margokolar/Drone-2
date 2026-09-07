import type { Preset } from '../presets/defaultPresets'
import {
  buildDefaultPresetNavigation,
  getEnabledNavigationEntries,
  normalizePresetNavigation,
  type PresetNavigationEntry,
} from '../presets/presetNavigation'

export type ScribblePresetSlotEntry = {
  kind: 'preset'
  /** 0–127 (Scribble preset 1–128) */
  slot: number
  songName: string
  presetName: string
  presetId: string
}

export type ScribbleTransportSlotEntry = {
  kind: 'transport'
  slot: number
  songName: string
  markerId: string
}

export type ScribbleSlotEntry = ScribblePresetSlotEntry | ScribbleTransportSlotEntry

export type ScribbleSongSource = {
  name: string
  presets: Preset[]
  presetNavigation: PresetNavigationEntry[]
  enabled?: boolean
}

const SCRIBBLE_MAX_SLOTS = 128
const SCRIBBLE_TRANSPORT_LABEL = 'Play/Pause'

function truncateForScribble(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) {
    return trimmed
  }
  return trimmed.slice(0, max)
}

export function buildScribbleSlotMap(songs: ScribbleSongSource[]): ScribbleSlotEntry[] {
  const entries: ScribbleSlotEntry[] = []
  for (const song of songs) {
    if (song.enabled === false) {
      continue
    }
    const navigation = normalizePresetNavigation(
      song.presetNavigation ?? buildDefaultPresetNavigation(song.presets),
      song.presets,
    )
    const enabled = getEnabledNavigationEntries(navigation, song.presets)
    for (const entry of enabled) {
      if (entries.length >= SCRIBBLE_MAX_SLOTS) {
        return entries
      }
      if (entry.kind === 'transport') {
        entries.push({
          kind: 'transport',
          slot: entries.length,
          songName: song.name,
          markerId: entry.id,
        })
        continue
      }
      const preset = song.presets.find((item) => item.id === entry.presetId)
      if (!preset) {
        continue
      }
      entries.push({
        kind: 'preset',
        slot: entries.length,
        songName: song.name,
        presetName: preset.name,
        presetId: entry.presetId,
      })
    }
  }
  return entries
}

export function resolveScribbleSlot(
  map: ScribbleSlotEntry[],
  songName: string,
  activePresetId: string,
  activePresetName?: string,
  activeNavigationKey?: string,
): number | null {
  if (activeNavigationKey) {
    const transportSlot = map.find(
      (entry) =>
        entry.kind === 'transport' &&
        entry.songName === songName &&
        entry.markerId === activeNavigationKey,
    )
    if (transportSlot) {
      return transportSlot.slot
    }
  }

  const byId = map.find(
    (entry) =>
      entry.kind === 'preset' &&
      entry.songName === songName &&
      entry.presetId === activePresetId,
  )
  if (byId) {
    return byId.slot
  }
  if (activePresetName) {
    const byName = map.find(
      (entry) =>
        entry.kind === 'preset' &&
        entry.songName === songName &&
        entry.presetName === activePresetName,
    )
    return byName?.slot ?? null
  }
  return null
}

export function resolveScribbleEntryBySlot(
  map: ScribbleSlotEntry[],
  slot: number,
): ScribbleSlotEntry | null {
  return map.find((entry) => entry.slot === slot) ?? null
}

/** Plain-text guide for configuring Scribble primary/secondary lines in edit.piratemidi.com */
export function formatScribbleSetupGuide(map: ScribbleSlotEntry[]): string {
  const lines = [
    'Drone → Scribble slot map',
    'Configure each Scribble preset in edit.piratemidi.com:',
    '  Primary line (12 chars) = preset name or "Play/Pause"',
    '  Secondary line (16 chars) = song name',
    '',
  ]
  for (const entry of map) {
    const songLine = truncateForScribble(entry.songName, 16)
    if (entry.kind === 'transport') {
      const primaryLine = truncateForScribble(SCRIBBLE_TRANSPORT_LABEL, 12)
      lines.push(
        `Scribble ${entry.slot + 1}: "${primaryLine}" / "${songLine}"  (Play/Pause · ${entry.songName})`,
      )
      continue
    }
    const presetLine = truncateForScribble(entry.presetName, 12)
    lines.push(
      `Scribble ${entry.slot + 1}: "${presetLine}" / "${songLine}"  (${entry.presetName} · ${entry.songName})`,
    )
  }
  if (map.length >= SCRIBBLE_MAX_SLOTS) {
    lines.push('', 'Note: only the first 128 navigation slots are listed.')
  }
  return lines.join('\n')
}
