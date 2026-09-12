import clsx from 'clsx'
import { PlayPauseIcon } from './PlayPauseIcon'
import { PLAY_PAUSE_SEQUENCE_LABEL } from '../utils/nowPlayingLabels'

type SequenceListRowProps = {
  number: number
  name: string
  isActive: boolean
  isTransport?: boolean
  onSelect?: () => void
}

export function SequenceListRow({
  number,
  name,
  isActive,
  isTransport = false,
  onSelect,
}: SequenceListRowProps) {
  const showTransport = isTransport || name === PLAY_PAUSE_SEQUENCE_LABEL
  const rowClass = clsx(
    'flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5',
    isActive ? 'border-amber-300/70 bg-amber-300/15' : 'border-white/10 bg-white/5',
    onSelect && 'w-full text-left',
  )
  const content = (
    <>
      <span
        className={clsx(
          'w-8 shrink-0 text-center text-[1.65rem] font-bold tabular-nums leading-none',
          isActive ? 'text-amber-200' : 'text-white/40',
        )}
      >
        {number}
      </span>
      {showTransport ? (
        <span
          className={clsx(
            'flex min-w-0 items-center gap-2 text-[1.65rem]',
            isActive ? 'text-amber-100' : 'text-white/75',
          )}
        >
          <PlayPauseIcon matchEx className="shrink-0" />
          <span className="truncate font-semibold leading-[1.2]">{name}</span>
        </span>
      ) : (
        <span
          className={clsx(
            'min-w-0 truncate text-[1.65rem] font-semibold leading-[1.2]',
            isActive ? 'text-white' : 'text-white/75',
          )}
        >
          {name}
        </span>
      )}
    </>
  )
  if (onSelect) {
    return (
      <button type="button" className={rowClass} onClick={onSelect}>
        {content}
      </button>
    )
  }
  return <div className={rowClass}>{content}</div>
}
