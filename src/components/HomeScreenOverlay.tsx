import { PlayPauseIcon } from './PlayPauseIcon'
import { SequenceListRow } from './SequenceListRow'

export type HomeScreenItem = {
  id: string
  name: string
  number: number
  isActive: boolean
  isTransport?: boolean
}

type HomeScreenOverlayProps = {
  presetTitle: string
  isTransport: boolean
  songTitle: string
  presets: HomeScreenItem[]
  songs: HomeScreenItem[]
  onSelectPreset: (id: string) => void
  onSelectSong: (id: string) => void
}

const boxClass =
  'shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#1a1825] px-3 py-3'

const boxLabelClass =
  'mb-1 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50'

export function HomeScreenOverlay({
  presetTitle,
  isTransport,
  songTitle,
  presets,
  songs,
  onSelectPreset,
  onSelectSong,
}: HomeScreenOverlayProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className={boxClass}>
        <div className={boxLabelClass}>Preset</div>
        <div className="text-[6rem] text-white">
          {isTransport ? (
            <div className="flex h-[1em] items-center justify-center pb-[0.25em]">
              <PlayPauseIcon matchEx className="shrink-0" />
            </div>
          ) : (
            <div className="w-full truncate pb-[0.25em] text-center font-bold leading-none tracking-tight">
              {presetTitle}
            </div>
          )}
        </div>
        <div className="mt-2 flex flex-col gap-1">
          {presets.map((item) => (
            <SequenceListRow
              key={`preset-${item.id}`}
              number={item.number}
              name={item.name}
              isActive={item.isActive}
              isTransport={item.isTransport}
              onSelect={() => onSelectPreset(item.id)}
            />
          ))}
        </div>
      </div>
      <div className={boxClass}>
        <div className={boxLabelClass}>Song</div>
        <div className="text-[3rem] text-white/70">
          <div className="w-full truncate pb-[0.25em] text-center font-semibold leading-none tracking-tight">
            {songTitle}
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1">
          {songs.map((item) => (
            <SequenceListRow
              key={`song-${item.id}`}
              number={item.number}
              name={item.name}
              isActive={item.isActive}
              onSelect={() => onSelectSong(item.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
