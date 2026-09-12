import clsx from 'clsx'
import { PlayPauseIcon } from './PlayPauseIcon'
import {
  PLAY_PAUSE_SEQUENCE_LABEL,
  windowedNowPlayingSequence,
} from '../utils/nowPlayingLabels'

const MAX_LOCK_SEQUENCE_ROWS = 12

type LockPresetSequenceTableProps = {
  sequence: string[]
  activeIndex: number
}

export function LockPresetSequenceTable({ sequence, activeIndex }: LockPresetSequenceTableProps) {
  if (sequence.length < 2) {
    return null
  }
  const windowed = windowedNowPlayingSequence(sequence, activeIndex, MAX_LOCK_SEQUENCE_ROWS)
  return (
    <div className="flex shrink-0 flex-col gap-1">
      {windowed.items.map((name, offset) => {
        const isActive = offset === windowed.activeIndex
        const isTransport = name === PLAY_PAUSE_SEQUENCE_LABEL
        return (
          <div
            key={`${windowed.start}-${offset}-${name}`}
            className={clsx(
              'flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5',
              isActive
                ? 'border-amber-300/70 bg-amber-300/15'
                : 'border-white/10 bg-white/5',
            )}
          >
            <span
              className={clsx(
                'w-8 shrink-0 text-center text-[1.65rem] font-bold tabular-nums leading-none',
                isActive ? 'text-amber-200' : 'text-white/40',
              )}
            >
              {windowed.start + offset + 1}
            </span>
            {isTransport ? (
              <span
                className={clsx(
                  'flex min-w-0 items-center gap-2',
                  isActive ? 'text-amber-100' : 'text-white/75',
                )}
              >
                <PlayPauseIcon size={26} className="shrink-0" />
                <span className="truncate text-[1.65rem] font-semibold leading-none">
                  {name}
                </span>
              </span>
            ) : (
              <span
                className={clsx(
                  'min-w-0 truncate text-[1.65rem] font-semibold leading-none',
                  isActive ? 'text-white' : 'text-white/75',
                )}
              >
                {name}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
