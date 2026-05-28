import clsx from 'clsx'
import { getTonePageLabel, tonePageLabelUsesUppercase, type NoteId } from '../music/notes'

type ToneLabelProps = {
  noteId: NoteId
  labelOverride?: string
  className?: string
}

const toneLabelBaseClass = 'text-base font-bold leading-none tracking-[0.03em]'
const toneLabelOctaveClass = 'tone-label-octave'

export function ToneLabel({ noteId, labelOverride, className }: ToneLabelProps) {
  const uppercase = tonePageLabelUsesUppercase(noteId)
  const rawLabel = labelOverride ?? getTonePageLabel(noteId)
  const label = noteId.endsWith('0') ? rawLabel.replace(/0$/, '') : rawLabel
  const octaveMatch = /^(.*?)([1-9])$/.exec(label)
  const baseLabel = octaveMatch ? octaveMatch[1] : label
  const octaveLabel = octaveMatch ? octaveMatch[2] : null

  if (octaveLabel) {
    return (
      <span className={clsx(toneLabelBaseClass, className, uppercase && 'uppercase')}>
        {baseLabel}
        <span className={toneLabelOctaveClass}>{octaveLabel}</span>
      </span>
    )
  }

  return (
    <span className={clsx(toneLabelBaseClass, className, uppercase && 'uppercase')}>
      {label}
    </span>
  )
}
