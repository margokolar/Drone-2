import type { ToneConfig } from '../audio/types'
import { NOTE_IDS, type NoteId } from './notes'

export function isToneStrictSolo(tones: ToneConfig[], noteId: NoteId): boolean {
  const selected = tones.find((tone) => tone.noteId === noteId)
  if (!selected?.enabled) {
    return false
  }
  return tones.every((tone) => (tone.noteId === noteId ? tone.enabled : !tone.enabled))
}

export function sortTonesByNoteId(source: ToneConfig[]): ToneConfig[] {
  return [...source].sort(
    (left, right) => NOTE_IDS.indexOf(left.noteId) - NOTE_IDS.indexOf(right.noteId),
  )
}

export function getLastActiveToneNoteId(source: ToneConfig[]): NoteId | undefined {
  const sortedActive = sortTonesByNoteId(source.filter((tone) => tone.enabled))
  if (sortedActive.length > 0) {
    return sortedActive[sortedActive.length - 1]?.noteId
  }
  const sortedAll = sortTonesByNoteId(source)
  return sortedAll[sortedAll.length - 1]?.noteId
}

export function getOvertoneNavigationTones(
  tonesInToneSet: ToneConfig[],
  overtoneToneOptions: ToneConfig[],
  toneSoloRestore: Map<NoteId, boolean> | null,
  allCompareActive: boolean,
): ToneConfig[] {
  if (allCompareActive) {
    return sortTonesByNoteId(tonesInToneSet)
  }
  if (toneSoloRestore !== null) {
    const preSoloActive = tonesInToneSet.filter((tone) => toneSoloRestore.get(tone.noteId) === true)
    return sortTonesByNoteId(preSoloActive)
  }
  return sortTonesByNoteId(overtoneToneOptions)
}
