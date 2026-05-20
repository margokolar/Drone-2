import clsx from 'clsx'
import {
  NOTE_LABELS,
  TONE_SELECTION_GRID_IDS,
  TONE_SELECTION_SUB_OCTAVE_IDS,
  type NoteId,
} from '../music/notes'
import type { ToneConfig } from '../audio/types'

type NoteSelectorProps = {
  tones: ToneConfig[]
  onToggleTone: (noteId: NoteId) => void
}

const TONE_BUTTON_CLASS =
  'flex min-h-[36px] min-w-0 items-center justify-center rounded-md border px-1 py-1.5 text-xs font-semibold transition'

function ToneButton({
  noteId,
  label,
  uppercase,
  enabled,
  onToggleTone,
}: {
  noteId: NoteId
  label?: string
  uppercase?: boolean
  enabled: boolean
  onToggleTone: (noteId: NoteId) => void
}) {
  const displayLabel = label ?? NOTE_LABELS[noteId]
  return (
    <button
      type="button"
      onClick={() => onToggleTone(noteId)}
      className={clsx(
        TONE_BUTTON_CLASS,
        uppercase && 'uppercase',
        enabled && 'border-fuchsia-300/70 bg-fuchsia-300/20 text-fuchsia-100',
        !enabled && 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10',
      )}
      aria-label={`Toggle ${displayLabel}`}
    >
      {displayLabel}
    </button>
  )
}

export function NoteSelector({ tones, onToggleTone }: NoteSelectorProps) {
  const toneState = new Map(tones.map((tone) => [tone.noteId, tone.enabled]))
  const firstGridRowIds = TONE_SELECTION_GRID_IDS.slice(0, 8)
  const secondGridRowIds = TONE_SELECTION_GRID_IDS.slice(8)

  return (
    <div className="grid grid-cols-8 gap-1.5">
      <div className="col-span-5 flex min-h-[36px] items-center text-xs uppercase tracking-[0.16em] text-white/60">
        Tone selection
      </div>
      {TONE_SELECTION_SUB_OCTAVE_IDS.map((noteId) => (
        <ToneButton
          key={noteId}
          noteId={noteId}
          label={NOTE_LABELS[noteId].slice(0, -1)}
          uppercase
          enabled={Boolean(toneState.get(noteId))}
          onToggleTone={onToggleTone}
        />
      ))}
      <div aria-hidden className="min-h-[36px]" />
      {firstGridRowIds.map((noteId) => (
        <ToneButton
          key={noteId}
          noteId={noteId}
          enabled={Boolean(toneState.get(noteId))}
          onToggleTone={onToggleTone}
        />
      ))}
      {secondGridRowIds.map((noteId) => (
        <ToneButton
          key={noteId}
          noteId={noteId}
          enabled={Boolean(toneState.get(noteId))}
          onToggleTone={onToggleTone}
        />
      ))}
    </div>
  )
}
