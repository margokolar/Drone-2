import clsx from 'clsx'
import { windowedNowPlayingSequence } from '../utils/nowPlayingLabels'

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
    <div className="mt-3 flex shrink-0 flex-col gap-1">
      {windowed.items.map((name, offset) => {
        const isActive = offset === windowed.activeIndex
        return (
          <div
            key={`${windowed.start}-${offset}-${name}`}
            className={clsx(
              'flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1',
              isActive
                ? 'border-amber-300/70 bg-amber-300/15'
                : 'border-white/10 bg-white/5',
            )}
          >
            <span
              className={clsx(
                'w-5 shrink-0 text-center text-sm font-bold tabular-nums leading-none',
                isActive ? 'text-amber-200' : 'text-white/40',
              )}
            >
              {windowed.start + offset + 1}
            </span>
            <span
              className={clsx(
                'min-w-0 truncate text-sm font-semibold leading-none',
                isActive ? 'text-white' : 'text-white/75',
              )}
            >
              {name}
            </span>
          </div>
        )
      })}
    </div>
  )
}
