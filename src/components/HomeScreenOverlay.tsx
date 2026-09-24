import { useEffect, useRef } from 'react'
import { ClickSyncButton } from './ClickSyncButton'
import { PlayPauseIcon } from './PlayPauseIcon'
import { SequenceListRow } from './SequenceListRow'

export type HomeScreenItem = {
  id: string
  name: string
  number: number
  isActive: boolean
  isTransport?: boolean
  metronomeSyncEnabled?: boolean
}

type HomeScreenOverlayProps = {
  presetTitle: string
  isTransport: boolean
  transportMetronomeSyncEnabled?: boolean
  songTitle: string
  presets: HomeScreenItem[]
  songs: HomeScreenItem[]
  onSelectPreset: (id: string) => void
  onSelectSong: (id: string) => void
  onToggleTransportMetronomeSync?: (id: string, enabled: boolean) => void
}

const boxClass =
  'home-screen-box flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1a1825] px-3 py-3'

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
  transportMetronomeSyncEnabled = false,
  songTitle,
  presets,
  songs,
  onSelectPreset,
  onSelectSong,
  onToggleTransportMetronomeSync,
}: HomeScreenOverlayProps) {
  const presetListRef = useScrollActiveIntoView(presets)
  const songListRef = useScrollActiveIntoView(songs)
  const activeTransportId = presets.find((item) => item.isTransport && item.isActive)?.id
  const playPauseSyncOn = presets.some((item) => item.isTransport && item.metronomeSyncEnabled)

  return (
    <div className="home-screen-overlay flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className={boxClass}>
        <div className={boxLabelClass}>Preset</div>
        <div className="home-screen-preset-name h-[1em] shrink-0 text-[6rem] text-white">
          {isTransport ? (
            <div className="flex h-full items-center justify-center gap-[0.18em]">
              <PlayPauseIcon className="h-[1em] w-auto shrink-0" />
              {activeTransportId &&
              onToggleTransportMetronomeSync &&
              transportMetronomeSyncEnabled ? (
                <ClickSyncButton
                  enabled
                  onClick={() => onToggleTransportMetronomeSync(activeTransportId, false)}
                  className="self-center"
                  ariaLabel="Disable click sync for this play/pause marker"
                />
              ) : null}
            </div>
          ) : (
            <div className="h-full w-full truncate text-center font-bold leading-none tracking-tight">
              {presetTitle}
            </div>
          )}
        </div>
        <div ref={presetListRef} className={`home-screen-list mt-3 ${listClass}`}>
          {presets.map((item) => (
            <SequenceListRow
              key={`preset-${item.id}`}
              number={item.number}
              name={item.name}
              isActive={item.isActive}
              isTransport={item.isTransport}
              metronomeSyncEnabled={item.metronomeSyncEnabled}
              onSelect={() => onSelectPreset(item.id)}
              onToggleMetronomeSync={
                onToggleTransportMetronomeSync && (item.isTransport || playPauseSyncOn)
                  ? () => onToggleTransportMetronomeSync(item.id, !item.metronomeSyncEnabled)
                  : undefined
              }
            />
          ))}
        </div>
      </div>
      <div className={boxClass}>
        <div className={boxLabelClass}>Song</div>
        <div className="home-screen-song-name h-[1.25em] shrink-0 text-[3rem] text-cyan-100/90">
          <div className="h-full w-full truncate pb-[0.25em] text-center font-semibold leading-none tracking-tight">
            {songTitle}
          </div>
        </div>
        <div ref={songListRef} className={`home-screen-list mt-3 ${listClass}`}>
          {songs.map((item) => (
            <SequenceListRow
              key={`song-${item.id}`}
              number={item.number}
              name={item.name}
              isActive={item.isActive}
              accent="cyan"
              onSelect={() => onSelectSong(item.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
