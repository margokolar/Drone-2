import clsx from 'clsx'
import { getTonePageLabel, tonePageLabelUsesUppercase, type NoteId } from '../music/notes'

type ToneLabelProps = {
  noteId: NoteId
  className?: string
}

const toneLabelBaseClass = 'text-base font-bold leading-none tracking-[0.03em]'
const toneLabelOctaveClass = 'tone-label-octave'

export function ToneLabel({ noteId, className }: ToneLabelProps) {
  const uppercase = tonePageLabelUsesUppercase(noteId)

  if (noteId === 'fis' || noteId === 'fis1') {
    return (
      <span
        className={clsx('tone-label-with-accidental', toneLabelBaseClass, className, uppercase && 'uppercase')}
      >
        f<span className="music-accidental">♯</span>
        {noteId === 'fis1' ? <span className={toneLabelOctaveClass}>1</span> : null}
      </span>
    )
  }

  if (noteId.endsWith('1')) {
    return (
      <span className={clsx(toneLabelBaseClass, className, uppercase && 'uppercase')}>
        {getTonePageLabel(noteId).slice(0, -1)}
        <span className={toneLabelOctaveClass}>1</span>
      </span>
    )
  }

  return (
    <span className={clsx(toneLabelBaseClass, className, uppercase && 'uppercase')}>
      {getTonePageLabel(noteId)}
    </span>
  )
}
