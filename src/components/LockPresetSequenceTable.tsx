import clsx from 'clsx'
import { windowedNowPlayingSequence } from '../utils/nowPlayingLabels'

const MAX_LOCK_SEQUENCE_ROWS = 8

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
    <div className="flex min-h-0 flex-1 flex-col justify-start gap-1.5 py-2">
      {windowed.items.map((name, offset) => {
        const isActive = offset === windowed.activeIndex
        return (
          <div
            key={`${windowed.start}-${offset}-${name}`}
            className={clsx(
              'flex min-h-0 min-w-0 flex-1 items-center gap-3 rounded-xl border px-3',
              isActive
                ? 'border-amber-300/70 bg-amber-300/15 shadow-[0_0_18px_rgba(251,191,36,0.12)]'
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
            <span
              className={clsx(
                'min-w-0 truncate text-[1.65rem] font-semibold leading-none',
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
