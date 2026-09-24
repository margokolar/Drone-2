import clsx from 'clsx'
import { PlayPauseIcon } from './PlayPauseIcon'
import { PLAY_PAUSE_SEQUENCE_LABEL } from '../utils/nowPlayingLabels'

type SequenceListRowProps = {
  number: number
  name: string
  isActive: boolean
  isTransport?: boolean
  metronomeSyncEnabled?: boolean
  accent?: 'amber' | 'cyan'
  onSelect?: () => void
  onToggleMetronomeSync?: () => void
}

export function SequenceListRow({
  number,
  name,
  isActive,
  isTransport = false,
  metronomeSyncEnabled = false,
  accent = 'amber',
  onSelect,
  onToggleMetronomeSync,
}: SequenceListRowProps) {
  const showTransport = isTransport || name === PLAY_PAUSE_SEQUENCE_LABEL
  const rowClass = clsx(
    'home-screen-row flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5',
    isActive
      ? accent === 'cyan'
        ? 'border-cyan-300/70 bg-cyan-300/15'
        : 'border-amber-300/70 bg-amber-300/15'
      : 'border-white/10 bg-white/5',
  )
  const content = (
    <>
      <span
        className={clsx(
          'home-screen-row-label w-8 shrink-0 text-center text-[1.65rem] font-bold tabular-nums leading-none',
          isActive ? (accent === 'cyan' ? 'text-cyan-200' : 'text-amber-200') : 'text-white/40',
        )}
      >
        {number}
      </span>
      {showTransport ? (
        <span
          className={clsx(
            'home-screen-row-label flex min-w-0 items-center text-[1.65rem]',
            isActive ? (accent === 'cyan' ? 'text-cyan-100' : 'text-amber-100') : 'text-white/75',
          )}
        >
          <PlayPauseIcon matchCap className="shrink-0" />
        </span>
      ) : (
        <span
          className={clsx(
            'home-screen-row-label min-w-0 truncate text-[1.65rem] font-semibold leading-[1.2]',
            isActive ? 'text-white' : 'text-white/75',
          )}
        >
          {name}
        </span>
      )}
    </>
  )
  const syncButton =
    showTransport && onToggleMetronomeSync ? (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onToggleMetronomeSync()
        }}
        className={clsx(
          'button-safe ml-auto flex min-h-9 shrink-0 items-center rounded-lg border px-2.5 text-xs font-semibold uppercase tracking-[0.12em] transition',
          metronomeSyncEnabled
            ? 'border-fuchsia-300/60 bg-fuchsia-300/20 text-fuchsia-100'
            : isActive
              ? 'border-white/20 bg-white/10 text-white/70'
              : 'border-white/10 bg-white/5 text-white/55',
        )}
        aria-pressed={metronomeSyncEnabled}
        aria-label={
          metronomeSyncEnabled
            ? 'Disable click sync for this play/pause marker'
            : 'Sync click start and stop with this play/pause marker'
        }
      >
        SYNC
      </button>
    ) : null

  if (onSelect) {
    if (syncButton) {
      return (
        <div className={rowClass}>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onSelect}>
            {content}
          </button>
          {syncButton}
        </div>
      )
    }
    return (
      <button type="button" className={clsx(rowClass, 'w-full text-left')} onClick={onSelect}>
        {content}
      </button>
    )
  }
  return (
    <div className={rowClass}>
      {content}
      {syncButton}
    </div>
  )
}
