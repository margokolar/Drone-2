import { SequenceListRow } from './SequenceListRow'
import {
  PLAY_PAUSE_SEQUENCE_LABEL,
  windowedNowPlayingSequence,
} from '../utils/nowPlayingLabels'

const MAX_LOCK_SEQUENCE_ROWS = 6

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
        return (
          <SequenceListRow
            key={`${windowed.start}-${offset}-${name}`}
            number={windowed.start + offset + 1}
            name={name}
            isActive={isActive}
            isTransport={name === PLAY_PAUSE_SEQUENCE_LABEL}
          />
        )
      })}
    </div>
  )
}
