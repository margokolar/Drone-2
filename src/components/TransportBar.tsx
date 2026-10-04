import { Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react'
import type { ReactNode } from 'react'

const NAV_BUTTON_CLASS =
  'button-safe flex h-11 w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35'

type TransportBarProps = {
  controlsLocked: boolean
  playing: boolean
  canNavigateSongs: boolean
  canNavigatePresets: boolean
  onPreviousSong: () => void
  onPreviousPreset: () => void
  onTogglePlay: () => void
  onNextPreset: () => void
  onNextSong: () => void
  /** Optional sixth button (mic follower). */
  extraButton?: ReactNode
}

/** Bottom play / prev / next row. `data-transport` attributes are targets for `flashTransport`. */
export function TransportBar({
  controlsLocked,
  playing,
  canNavigateSongs,
  canNavigatePresets,
  onPreviousSong,
  onPreviousPreset,
  onTogglePlay,
  onNextPreset,
  onNextSong,
  extraButton,
}: TransportBarProps) {
  return (
    <div
      className={`rounded-xl border border-white/10 p-2 ${
        controlsLocked ? 'bg-[#111019]' : 'bg-[#111019]/95 backdrop-blur-sm'
      }`}
    >
      <div className={`grid gap-1.5 ${extraButton ? 'grid-cols-6' : 'grid-cols-5'}`}>
        <button
          type="button"
          data-transport="song-prev"
          className={NAV_BUTTON_CLASS}
          onClick={onPreviousSong}
          disabled={!canNavigateSongs}
          aria-label="Previous song"
        >
          <SkipBack size={22} />
        </button>
        <button
          type="button"
          data-transport="preset-prev"
          className={NAV_BUTTON_CLASS}
          onClick={onPreviousPreset}
          disabled={!canNavigatePresets}
          aria-label="Previous preset"
        >
          <StepBack size={22} />
        </button>
        <button
          type="button"
          data-transport="play"
          className="button-safe flex h-11 w-full items-center justify-center rounded-xl border border-fuchsia-300/60 bg-fuchsia-400/15 text-white transition hover:bg-fuchsia-300/25"
          onClick={onTogglePlay}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={22} /> : <Play size={22} />}
        </button>
        <button
          type="button"
          data-transport="preset-next"
          className={NAV_BUTTON_CLASS}
          onClick={onNextPreset}
          disabled={!canNavigatePresets}
          aria-label="Next preset"
        >
          <StepForward size={22} />
        </button>
        <button
          type="button"
          data-transport="song-next"
          className={NAV_BUTTON_CLASS}
          onClick={onNextSong}
          disabled={!canNavigateSongs}
          aria-label="Next song"
        >
          <SkipForward size={22} />
        </button>
        {extraButton}
      </div>
    </div>
  )
}
