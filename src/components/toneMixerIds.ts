import type { NoteId } from '../music/notes'

export function toneMixerCardElementId(noteId: NoteId): string {
  return `tone-mixer-${noteId}`
}

export const TONE_MIXER_SECTION_ID = 'tone-mixer-section'
