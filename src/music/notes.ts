export const NOTE_CLASSES = ['c', 'd', 'e', 'f', 'fis', 'g', 'a', 'h'] as const

export type NoteClass = (typeof NOTE_CLASSES)[number]

export const NOTE_IDS = [
  'c',
  'd',
  'e',
  'f',
  'fis',
  'g',
  'a',
  'h',
  'c1',
  'd1',
  'e1',
  'f1',
  'fis1',
  'g1',
  'a1',
  'h1',
  'g0',
  'a0',
] as const

export type NoteId = (typeof NOTE_IDS)[number]

export const TONE_SELECTION_SUB_OCTAVE_IDS = ['g0', 'a0'] as const satisfies readonly NoteId[]

export const TONE_SELECTION_GRID_IDS = NOTE_IDS.filter(
  (noteId) => !TONE_SELECTION_SUB_OCTAVE_IDS.includes(noteId as (typeof TONE_SELECTION_SUB_OCTAVE_IDS)[number]),
)

export const TONAL_CENTERS = ['g', 'd', 'a', 'c', 'e'] as const

export type TonalCenter = (typeof TONAL_CENTERS)[number]

export const SEMITONES_FROM_C: Record<NoteClass, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  fis: 6,
  g: 7,
  a: 9,
  h: 11,
}

export const NOTE_LABELS: Record<NoteId, string> = {
  c: 'c',
  d: 'd',
  e: 'e',
  f: 'f',
  fis: 'fis',
  g: 'g',
  a: 'a',
  h: 'h',
  c1: 'c1',
  d1: 'd1',
  e1: 'e1',
  f1: 'f1',
  fis1: 'fis1',
  g1: 'g1',
  a1: 'a1',
  h1: 'h1',
  g0: 'g0',
  a0: 'a0',
}

export function splitNoteId(noteId: NoteId): {
  noteClass: NoteClass
  octaveOffset: number
} {
  if (noteId.endsWith('0')) {
    return {
      noteClass: noteId.slice(0, -1) as NoteClass,
      octaveOffset: -1,
    }
  }
  if (noteId.endsWith('1')) {
    return {
      noteClass: noteId.slice(0, -1) as NoteClass,
      octaveOffset: 1,
    }
  }
  return {
    noteClass: noteId as NoteClass,
    octaveOffset: 0,
  }
}

export function migrateLegacyNoteId(noteId: string): NoteId | null {
  return NOTE_IDS.includes(noteId as NoteId) ? (noteId as NoteId) : null
}
