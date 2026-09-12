import { useEffect, useRef } from 'react'
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
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1a1825] px-3 py-3'

const boxLabelClass =
  'mb-1 shrink-0 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50'

const listClass =
  'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain'

function useScrollActiveIntoView(items: HomeScreenItem[]) {
  const listRef = useRef<HTMLDivElement>(null)
  const activeIndex = items.findIndex((item) => item.isActive)
  useEffect(() => {
    const row = listRef.current?.children[activeIndex]
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex])
  return listRef
}

export function HomeScreenOverlay({
  presetTitle,
  isTransport,
  songTitle,
  presets,
  songs,
  onSelectPreset,
  onSelectSong,
}: HomeScreenOverlayProps) {
  const presetListRef = useScrollActiveIntoView(presets)
  const songListRef = useScrollActiveIntoView(songs)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className={boxClass}>
        <div className={boxLabelClass}>Preset</div>
        <div className="h-[1.2em] shrink-0 text-[4.5rem] text-white">
          {isTransport ? (
            <div className="flex h-full items-center justify-center">
              <PlayPauseIcon className="h-[0.7em] w-auto shrink-0" />
            </div>
          ) : (
            <div className="h-full w-full truncate pb-[0.2em] text-center font-bold leading-none tracking-tight">
              {presetTitle}
            </div>
          )}
        </div>
        <div ref={presetListRef} className={`mt-1.5 ${listClass}`}>
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
        <div className="h-[1.25em] shrink-0 text-[3rem] text-white/70">
          <div className="h-full w-full truncate pb-[0.25em] text-center font-semibold leading-none tracking-tight">
            {songTitle}
          </div>
        </div>
        <div ref={songListRef} className={`mt-3 ${listClass}`}>
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
