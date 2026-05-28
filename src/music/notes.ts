export const NOTE_CLASSES = ['c', 'cis', 'd', 'dis', 'e', 'f', 'fis', 'g', 'gis', 'a', 'b', 'h'] as const

export type NoteClass = (typeof NOTE_CLASSES)[number]

export const NOTE_IDS = [
  'g0',
  'gis0',
  'a0',
  'b0',
  'h0',
  'c',
  'cis',
  'd',
  'dis',
  'e',
  'f',
  'fis',
  'g',
  'gis',
  'a',
  'b',
  'h',
  'c1',
  'cis1',
  'd1',
  'dis1',
  'e1',
  'f1',
  'fis1',
  'g1',
  'gis1',
  'a1',
  'b1',
  'h1',
  'c2',
  'cis2',
  'd2',
] as const

export type NoteId = (typeof NOTE_IDS)[number]

export const TONE_SELECTION_SUB_OCTAVE_IDS = ['g0', 'gis0', 'a0', 'b0', 'h0'] as const satisfies readonly NoteId[]

export const TONE_SELECTION_GRID_IDS = NOTE_IDS.filter(
  (noteId) => !TONE_SELECTION_SUB_OCTAVE_IDS.includes(noteId as (typeof TONE_SELECTION_SUB_OCTAVE_IDS)[number]),
)

export const TONAL_CENTERS = ['g', 'd', 'a', 'c', 'e'] as const

export type TonalCenter = (typeof TONAL_CENTERS)[number]

export const SEMITONES_FROM_C: Record<NoteClass, number> = {
  c: 0,
  cis: 1,
  d: 2,
  dis: 3,
  e: 4,
  f: 5,
  fis: 6,
  g: 7,
  gis: 8,
  a: 9,
  b: 10,
  h: 11,
}

export const NOTE_LABELS: Record<NoteId, string> = {
  c: 'c',
  cis: 'cis',
  d: 'd',
  dis: 'dis',
  e: 'e',
  f: 'f',
  fis: 'fis',
  g: 'g',
  gis: 'gis',
  a: 'a',
  b: 'b',
  h: 'h',
  g0: 'g0',
  gis0: 'gis0',
  a0: 'a0',
  b0: 'b0',
  h0: 'h0',
  c1: 'c1',
  cis1: 'cis1',
  d1: 'd1',
  dis1: 'dis1',
  e1: 'e1',
  f1: 'f1',
  fis1: 'fis1',
  g1: 'g1',
  gis1: 'gis1',
  a1: 'a1',
  b1: 'b1',
  h1: 'h1',
  c2: 'c2',
  cis2: 'cis2',
  d2: 'd2',
}

export function splitNoteId(noteId: NoteId): {
  noteClass: NoteClass
  octaveOffset: number
} {
  const match = /^([a-z]+)([0-9])?$/.exec(noteId)
  if (match) {
    const noteClass = match[1] as NoteClass
    const octaveDigit = match[2]
    if (!octaveDigit) {
      return { noteClass, octaveOffset: 0 }
    }
    if (octaveDigit === '0') {
      return { noteClass, octaveOffset: -1 }
    }
    return { noteClass, octaveOffset: Number(octaveDigit) }
  }
  return {
    noteClass: noteId as NoteClass,
    octaveOffset: 0,
  }
}

export function migrateLegacyNoteId(noteId: string): NoteId | null {
  return NOTE_IDS.includes(noteId as NoteId) ? (noteId as NoteId) : null
}

export function getTonePageLabel(noteId: NoteId): string {
  const raw = NOTE_LABELS[noteId]
  const withSharps = raw
    .replace('cis', 'c♯')
    .replace('dis', 'd♯')
    .replace('fis', 'f♯')
    .replace('gis', 'g♯')
  if (withSharps.endsWith('0')) {
    return withSharps.slice(0, -1)
  }
  return withSharps
}

export function tonePageLabelUsesUppercase(noteId: NoteId): boolean {
  return noteId.endsWith('0')
}
