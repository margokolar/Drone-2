import { NOTE_IDS, type NoteId } from './notes'
import { getFrequency, midiFromNoteId, type TuningSystemId } from './tuning'
import type { TonalCenter } from './notes'

function findNearestNoteIdToMidi(
  targetMidi: number,
  candidateNoteIds: readonly NoteId[],
  baseOctave: number,
): NoteId | null {
  if (candidateNoteIds.length === 0) {
    return null
  }

  let bestNoteId: NoteId | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const noteId of candidateNoteIds) {
    const distance = Math.abs(midiFromNoteId(noteId, baseOctave) - targetMidi)
    if (distance < bestDistance) {
      bestDistance = distance
      bestNoteId = noteId
    }
  }

  return bestNoteId
}

export function findNearestNoteIdToFrequency(
  hz: number,
  candidateNoteIds: readonly NoteId[],
  tuningSystemId: TuningSystemId,
  tonalCenter: TonalCenter,
  a4Hz: number,
  baseOctave: number,
): NoteId | null {
  if (!Number.isFinite(hz) || hz <= 0 || candidateNoteIds.length === 0) {
    return null
  }

  let bestNoteId: NoteId | null = null
  let bestCents = Number.POSITIVE_INFINITY

  for (const noteId of candidateNoteIds) {
    const referenceHz = getFrequency(noteId, tuningSystemId, tonalCenter, a4Hz, baseOctave)
    if (referenceHz <= 0) {
      continue
    }
    const ratio = hz / referenceHz
    const cents = Math.abs(1200 * Math.log2(ratio))
    if (cents < bestCents) {
      bestCents = cents
      bestNoteId = noteId
    }
  }

  return bestNoteId
}

export function findFollowerNoteIdForInterval(
  detectedHz: number,
  intervalSemitones: number,
  toneSetNoteIds: readonly NoteId[],
  tuningSystemId: TuningSystemId,
  tonalCenter: TonalCenter,
  a4Hz: number,
  baseOctave: number,
): NoteId | null {
  const detectedNoteId = findNearestNoteIdToFrequency(
    detectedHz,
    NOTE_IDS,
    tuningSystemId,
    tonalCenter,
    a4Hz,
    baseOctave,
  )
  if (!detectedNoteId) {
    return null
  }

  const targetMidi = midiFromNoteId(detectedNoteId, baseOctave) + intervalSemitones
  return findNearestNoteIdToMidi(targetMidi, toneSetNoteIds, baseOctave)
}

export function computeDetuneCentsForTargetHz(
  noteId: NoteId,
  targetHz: number,
  tuningSystemId: TuningSystemId,
  tonalCenter: TonalCenter,
  a4Hz: number,
  baseOctave: number,
): number {
  const referenceHz = getFrequency(noteId, tuningSystemId, tonalCenter, a4Hz, baseOctave)
  if (referenceHz <= 0 || targetHz <= 0) {
    return 0
  }
  return Math.round(1200 * Math.log2(targetHz / referenceHz))
}
